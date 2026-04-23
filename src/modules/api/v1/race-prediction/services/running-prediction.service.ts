import { Injectable } from '@nestjs/common';
import { PersonalRecord, PersonalRecordType, WorkoutType } from 'src/database/interfaces';
import { PersonalRecordRepository } from 'src/repositories/personal-record.repository';

export interface RunningPredictionInput {
  targetDistanceMeters: number;
  vo2max?: number;
  vo2maxConfidence?: number;
  personalRecords?: PersonalRecord[];
  yearsTraining?: number;
}

export interface PredictionMethod {
  name: string;
  predictedSeconds: number;
  weight: number;
  confidence: number;
}

export interface RunningPredictionResult {
  predictedTimeSeconds: number;
  confidenceLowerSeconds: number;
  confidenceUpperSeconds: number;
  confidenceScore: number;
  methods: PredictionMethod[];
  targetPacePerKm: number;
}

// VDOT lookup tables (Daniels' Running Formula)
const VDOT_RACE_TIMES: Record<number, Record<number, number>> = {
  // VDOT -> distance_meters -> time_seconds
  30: { 1000: 345, 5000: 1920, 10000: 4000, 21097: 8700, 42195: 18000 },
  35: { 1000: 300, 5000: 1680, 10000: 3500, 21097: 7650, 42195: 15840 },
  40: { 1000: 264, 5000: 1488, 10000: 3096, 21097: 6780, 42195: 14040 },
  45: { 1000: 234, 5000: 1320, 10000: 2750, 21097: 6030, 42195: 12480 },
  50: { 1000: 210, 5000: 1188, 10000: 2480, 21097: 5445, 42195: 11280 },
  55: { 1000: 189, 5000: 1074, 10000: 2244, 21097: 4935, 42195: 10230 },
  60: { 1000: 171, 5000: 978, 10000: 2046, 21097: 4500, 42195: 9330 },
  65: { 1000: 156, 5000: 894, 10000: 1872, 21097: 4122, 42195: 8550 },
  70: { 1000: 144, 5000: 822, 10000: 1722, 21097: 3795, 42195: 7878 },
  75: { 1000: 132, 5000: 756, 10000: 1584, 21097: 3498, 42195: 7260 },
  80: { 1000: 123, 5000: 702, 10000: 1470, 21097: 3246, 42195: 6744 },
};

// Standard race distances in meters
const STANDARD_DISTANCES = {
  '1k': 1000,
  '5k': 5000,
  '10k': 10000,
  'half_marathon': 21097,
  'marathon': 42195,
};

// Map PR types to distances
const PR_TYPE_TO_DISTANCE: Record<string, number> = {
  [PersonalRecordType.FASTEST_1K]: 1000,
  [PersonalRecordType.FASTEST_5K]: 5000,
  [PersonalRecordType.FASTEST_10K]: 10000,
  [PersonalRecordType.FASTEST_HALF_MARATHON]: 21097,
  [PersonalRecordType.FASTEST_MARATHON]: 42195,
};

@Injectable()
export class RunningPredictionService {
  constructor(private readonly personalRecordRepository: PersonalRecordRepository) {}

  /**
   * Generate running race prediction using ensemble of methods
   */
  async predictRaceTime(userId: string, input: RunningPredictionInput): Promise<RunningPredictionResult> {
    const methods: PredictionMethod[] = [];

    // Get personal records if not provided
    let prs = input.personalRecords;
    if (!prs) {
      prs = await this.personalRecordRepository.findMany({
        userId,
        workoutType: WorkoutType.RUN,
        category: 'cardio_other',
      });
    }

    // Method 1: VDOT/Daniels prediction from VO2max
    if (input.vo2max && input.vo2max >= 30 && input.vo2max <= 80) {
      const vdotPrediction = this.predictFromVdot(input.vo2max, input.targetDistanceMeters);
      if (vdotPrediction) {
        methods.push({
          name: 'vdot',
          predictedSeconds: vdotPrediction,
          weight: 0.3 * (input.vo2maxConfidence || 0.5),
          confidence: input.vo2maxConfidence || 0.5,
        });
      }
    }

    // Method 2 & 3: Riegel and Cameron from PRs
    const runningPRs = this.getRunningPRs(prs);

    for (const pr of runningPRs) {
      const prDistance = PR_TYPE_TO_DISTANCE[pr.record_type];
      if (!prDistance) continue;

      const prTimeSeconds = Number.parseFloat(pr.value);
      if (prTimeSeconds <= 0) continue;

      // Calculate PR recency weight (newer = higher weight)
      const prAge = this.getAgeInDays(pr.achieved_at);
      const recencyWeight = this.calculateRecencyWeight(prAge);

      // Skip very old PRs
      if (recencyWeight < 0.3) continue;

      // Riegel prediction
      const riegelTime = this.riegelPredict(prTimeSeconds, prDistance, input.targetDistanceMeters, input.yearsTraining);
      methods.push({
        name: `riegel_${this.getDistanceName(prDistance)}`,
        predictedSeconds: riegelTime,
        weight: 0.35 * recencyWeight,
        confidence: recencyWeight,
      });

      // Cameron prediction (better for marathon from shorter races)
      const cameronTime = this.cameronPredict(prTimeSeconds, prDistance, input.targetDistanceMeters);
      if (cameronTime) {
        methods.push({
          name: `cameron_${this.getDistanceName(prDistance)}`,
          predictedSeconds: cameronTime,
          weight: 0.35 * recencyWeight * (input.targetDistanceMeters >= 21097 ? 1.2 : 0.8),
          confidence: recencyWeight,
        });
      }
    }

    // Calculate ensemble prediction
    if (methods.length === 0) {
      // No data available for prediction
      return {
        predictedTimeSeconds: 0,
        confidenceLowerSeconds: 0,
        confidenceUpperSeconds: 0,
        confidenceScore: 0,
        methods: [],
        targetPacePerKm: 0,
      };
    }

    const { predictedTime, variance } = this.calculateEnsemble(methods);
    const confidenceScore = this.calculateOverallConfidence(methods);

    // Calculate 95% confidence interval
    const stdDev = Math.sqrt(variance);
    const confidenceLower = Math.round(predictedTime - 1.96 * stdDev);
    const confidenceUpper = Math.round(predictedTime + 1.96 * stdDev);

    // Calculate pace per km
    const targetPacePerKm = predictedTime / (input.targetDistanceMeters / 1000);

    return {
      predictedTimeSeconds: Math.round(predictedTime),
      confidenceLowerSeconds: Math.max(0, confidenceLower),
      confidenceUpperSeconds: confidenceUpper,
      confidenceScore: Math.round(confidenceScore * 100) / 100,
      methods,
      targetPacePerKm: Math.round(targetPacePerKm * 100) / 100,
    };
  }

  /**
   * VDOT/Daniels prediction using lookup table with interpolation
   */
  private predictFromVdot(vdot: number, targetDistanceMeters: number): number | null {
    const vdotLevels = Object.keys(VDOT_RACE_TIMES)
      .map(Number)
      .sort((a, b) => a - b);

    // Find surrounding VDOT levels for interpolation
    let lowerVdot = vdotLevels[0];
    let upperVdot = vdotLevels[vdotLevels.length - 1];

    for (let i = 0; i < vdotLevels.length - 1; i++) {
      if (vdotLevels[i] <= vdot && vdotLevels[i + 1] >= vdot) {
        lowerVdot = vdotLevels[i];
        upperVdot = vdotLevels[i + 1];
        break;
      }
    }

    // Interpolate time for target distance
    const lowerTimes = VDOT_RACE_TIMES[lowerVdot];
    const upperTimes = VDOT_RACE_TIMES[upperVdot];

    const lowerTime = this.interpolateDistance(lowerTimes, targetDistanceMeters);
    const upperTime = this.interpolateDistance(upperTimes, targetDistanceMeters);

    if (lowerTime === null || upperTime === null) return null;

    // Interpolate between VDOT levels
    const vdotRatio = (vdot - lowerVdot) / (upperVdot - lowerVdot);
    const predictedTime = lowerTime + (upperTime - lowerTime) * vdotRatio;

    return Math.round(predictedTime);
  }

  /**
   * Interpolate time for non-standard distances
   */
  private interpolateDistance(times: Record<number, number>, targetDistance: number): number | null {
    const distances = Object.keys(times)
      .map(Number)
      .sort((a, b) => a - b);

    // Find surrounding distances
    let lowerDist = distances[0];
    let upperDist = distances[distances.length - 1];

    if (targetDistance <= lowerDist) {
      // Extrapolate down using Riegel
      return this.riegelPredict(times[lowerDist], lowerDist, targetDistance);
    }

    if (targetDistance >= upperDist) {
      // Extrapolate up using Riegel
      return this.riegelPredict(times[upperDist], upperDist, targetDistance);
    }

    for (let i = 0; i < distances.length - 1; i++) {
      if (distances[i] <= targetDistance && distances[i + 1] >= targetDistance) {
        lowerDist = distances[i];
        upperDist = distances[i + 1];
        break;
      }
    }

    // Use Riegel to interpolate
    const lowerTime = times[lowerDist];
    const fromLower = this.riegelPredict(lowerTime, lowerDist, targetDistance);

    return fromLower;
  }

  /**
   * Riegel formula: time2 = time1 × (distance2/distance1)^exponent
   * With experience-based exponent adjustment
   */
  private riegelPredict(
    knownTimeSeconds: number,
    knownDistanceMeters: number,
    targetDistanceMeters: number,
    yearsTraining?: number,
  ): number {
    // Base exponent varies by distance
    let exponent = 1.06; // Default for short distances

    const distanceRatio = targetDistanceMeters / knownDistanceMeters;

    if (targetDistanceMeters >= 42195) {
      exponent = 1.08; // Marathon
    } else if (targetDistanceMeters >= 21097) {
      exponent = 1.07; // Half marathon
    } else if (targetDistanceMeters >= 10000) {
      exponent = 1.06; // 10K
    }

    // Experience adjustment
    if (yearsTraining !== undefined) {
      if (yearsTraining >= 5) {
        exponent -= 0.01; // Elite runners can sustain pace better
      } else if (yearsTraining <= 1) {
        exponent += 0.02; // Beginners fatigue faster
      }
    }

    const predictedTime = knownTimeSeconds * Math.pow(distanceRatio, exponent);
    return Math.round(predictedTime);
  }

  /**
   * Cameron formula - better for marathon predictions
   * Accounts for glycogen depletion more explicitly
   */
  private cameronPredict(
    knownTimeSeconds: number,
    knownDistanceMeters: number,
    targetDistanceMeters: number,
  ): number | null {
    // Cameron works best for predicting longer races from shorter
    if (targetDistanceMeters <= knownDistanceMeters) {
      return null; // Use Riegel for shorter distances
    }

    // Cameron coefficients (empirically derived)
    const a = 13.49681 - 0.000030363 * knownDistanceMeters + 835.7114 / Math.pow(knownDistanceMeters, 0.7905);
    const b = 13.49681 - 0.000030363 * targetDistanceMeters + 835.7114 / Math.pow(targetDistanceMeters, 0.7905);

    const predictedTime = (knownTimeSeconds / knownDistanceMeters) * ((targetDistanceMeters * a) / b);

    return Math.round(predictedTime);
  }

  /**
   * Calculate weighted ensemble prediction
   */
  private calculateEnsemble(methods: PredictionMethod[]): { predictedTime: number; variance: number } {
    // Normalize weights
    const totalWeight = methods.reduce((sum, m) => sum + m.weight, 0);
    if (totalWeight === 0) {
      return { predictedTime: 0, variance: 0 };
    }

    // Weighted average
    let weightedSum = 0;
    for (const method of methods) {
      weightedSum += method.predictedSeconds * (method.weight / totalWeight);
    }

    // Calculate weighted variance
    let weightedVariance = 0;
    for (const method of methods) {
      const normalizedWeight = method.weight / totalWeight;
      weightedVariance += normalizedWeight * Math.pow(method.predictedSeconds - weightedSum, 2);
    }

    return {
      predictedTime: weightedSum,
      variance: weightedVariance,
    };
  }

  /**
   * Calculate overall confidence score based on methods used
   */
  private calculateOverallConfidence(methods: PredictionMethod[]): number {
    let confidence = 0;

    // Base confidence from number of methods (max 0.30)
    confidence += Math.min(0.3, methods.length * 0.05);

    // Average method confidence (max 0.50)
    const avgMethodConfidence = methods.reduce((sum, m) => sum + m.confidence, 0) / methods.length;
    confidence += avgMethodConfidence * 0.5;

    // Consistency bonus - lower variance = higher confidence (max 0.20)
    const { variance, predictedTime } = this.calculateEnsemble(methods);
    const cv = Math.sqrt(variance) / predictedTime; // Coefficient of variation
    const consistencyBonus = Math.max(0, 0.2 - cv);
    confidence += consistencyBonus;

    return Math.min(1.0, confidence);
  }

  /**
   * Get running PRs from list
   */
  private getRunningPRs(prs: PersonalRecord[]): PersonalRecord[] {
    const runningTypes = Object.keys(PR_TYPE_TO_DISTANCE);
    return prs.filter((pr) => runningTypes.includes(pr.record_type));
  }

  /**
   * Calculate PR age in days
   */
  private getAgeInDays(date: Date): number {
    const now = new Date();
    const achievedAt = new Date(date);
    return Math.floor((now.getTime() - achievedAt.getTime()) / (1000 * 60 * 60 * 24));
  }

  /**
   * Calculate weight based on PR recency
   * - < 30 days: 1.0
   * - 30-90 days: 0.9
   * - 90-180 days: 0.7
   * - 180-365 days: 0.5
   * - > 365 days: 0.3
   */
  private calculateRecencyWeight(ageInDays: number): number {
    if (ageInDays < 30) return 1.0;
    if (ageInDays < 90) return 0.9;
    if (ageInDays < 180) return 0.7;
    if (ageInDays < 365) return 0.5;
    return 0.3;
  }

  /**
   * Get human-readable distance name
   */
  private getDistanceName(meters: number): string {
    for (const [name, dist] of Object.entries(STANDARD_DISTANCES)) {
      if (dist === meters) return name;
    }
    return `${meters}m`;
  }

  /**
   * Calculate VDOT from race result
   */
  calculateVdotFromRace(timeSeconds: number, distanceMeters: number): number | null {
    const vdotLevels = Object.keys(VDOT_RACE_TIMES)
      .map(Number)
      .sort((a, b) => a - b);

    // Find VDOT that produces closest time for given distance
    let bestVdot = 30;
    let bestDiff = Infinity;

    for (const vdot of vdotLevels) {
      const expectedTime = this.interpolateDistance(VDOT_RACE_TIMES[vdot], distanceMeters);
      if (expectedTime === null) continue;

      const diff = Math.abs(expectedTime - timeSeconds);
      if (diff < bestDiff) {
        bestDiff = diff;
        bestVdot = vdot;
      }
    }

    // Linear interpolation for more precision
    const idx = vdotLevels.indexOf(bestVdot);
    if (idx > 0 && idx < vdotLevels.length - 1) {
      const lowerVdot = vdotLevels[idx - 1];
      const upperVdot = vdotLevels[idx + 1];

      const lowerTime = this.interpolateDistance(VDOT_RACE_TIMES[lowerVdot], distanceMeters);
      const upperTime = this.interpolateDistance(VDOT_RACE_TIMES[upperVdot], distanceMeters);

      if (lowerTime && upperTime) {
        // Linear interpolation
        const ratio = (timeSeconds - upperTime) / (lowerTime - upperTime);
        return Math.round((lowerVdot + (upperVdot - lowerVdot) * ratio) * 10) / 10;
      }
    }

    return bestVdot;
  }
}

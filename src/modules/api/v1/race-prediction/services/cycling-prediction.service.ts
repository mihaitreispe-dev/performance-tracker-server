import { Injectable } from '@nestjs/common';
import { FitnessMetric, FitnessMetricType } from 'src/database/interfaces';
import { FitnessMetricsRepository } from 'src/repositories/fitness-metrics.repository';

export interface CyclingPredictionInput {
  targetDistanceMeters: number;
  targetDurationMinutes?: number;
  ftp?: number; // Functional Threshold Power
  ftpConfidence?: number;
  weight?: number; // Rider weight in kg
  averageGradePercent?: number;
  rollingResistance?: number; // Default 0.005
  dragCoefficient?: number; // Default 0.88 (CdA)
}

export interface CyclingPredictionResult {
  predictedTimeSeconds: number;
  confidenceLowerSeconds: number;
  confidenceUpperSeconds: number;
  confidenceScore: number;
  targetPowerWatts: number;
  targetSpeedKmh: number;
  normalizedPower: number;
  energyKj: number;
  description: string;
}

// Power duration model - sustainable power as % of FTP
const POWER_DURATION_MODEL: Record<number, number> = {
  // Duration in minutes -> % of FTP
  5: 1.2,
  10: 1.1,
  20: 1.05,
  30: 1.0,
  45: 0.97,
  60: 0.95,
  90: 0.9,
  120: 0.85,
  180: 0.82,
  240: 0.78,
  300: 0.75,
  360: 0.72,
};

@Injectable()
export class CyclingPredictionService {
  // Physical constants
  private readonly GRAVITY = 9.81;
  private readonly AIR_DENSITY = 1.225; // kg/m³ at sea level
  private readonly DEFAULT_ROLLING_RESISTANCE = 0.005;
  private readonly DEFAULT_CDA = 0.35; // Typical road cyclist CdA

  constructor(private readonly fitnessMetricsRepository: FitnessMetricsRepository) {}

  /**
   * Predict cycling time for a given distance
   */
  async predictCyclingTime(userId: string, input: CyclingPredictionInput): Promise<CyclingPredictionResult> {
    // Get FTP if not provided
    let ftp = input.ftp;
    let ftpConfidence = input.ftpConfidence || 0.5;

    if (!ftp) {
      const ftpMetric = await this.fitnessMetricsRepository.getLatestByType(userId, FitnessMetricType.FTP);
      if (ftpMetric) {
        ftp = Number.parseFloat(ftpMetric.value);
        ftpConfidence = Number.parseFloat(ftpMetric.confidence || '0.5');
      }
    }

    if (!ftp) {
      return {
        predictedTimeSeconds: 0,
        confidenceLowerSeconds: 0,
        confidenceUpperSeconds: 0,
        confidenceScore: 0,
        targetPowerWatts: 0,
        targetSpeedKmh: 0,
        normalizedPower: 0,
        energyKj: 0,
        description: 'FTP data required for cycling predictions',
      };
    }

    const weight = input.weight || 70;
    const rollingResistance = input.rollingResistance || this.DEFAULT_ROLLING_RESISTANCE;
    const cda = input.dragCoefficient || this.DEFAULT_CDA;
    const grade = input.averageGradePercent || 0;

    // If duration is provided, use power-for-duration model
    if (input.targetDurationMinutes) {
      return this.predictFromDuration(
        input.targetDistanceMeters,
        input.targetDurationMinutes,
        ftp,
        ftpConfidence,
        weight,
        grade,
        cda,
        rollingResistance,
      );
    }

    // Estimate duration first, then iterate
    const estimatedSpeed = this.estimateAverageSpeed(ftp, weight, grade, cda, rollingResistance);
    const estimatedDuration = (input.targetDistanceMeters / 1000 / estimatedSpeed) * 60; // minutes

    return this.predictFromDuration(
      input.targetDistanceMeters,
      estimatedDuration,
      ftp,
      ftpConfidence,
      weight,
      grade,
      cda,
      rollingResistance,
    );
  }

  /**
   * Predict time and power for a specific duration
   */
  private predictFromDuration(
    distanceMeters: number,
    durationMinutes: number,
    ftp: number,
    ftpConfidence: number,
    weight: number,
    grade: number,
    cda: number,
    rollingResistance: number,
  ): CyclingPredictionResult {
    // Calculate sustainable power for duration
    const sustainablePower = this.getSustainablePower(ftp, durationMinutes);

    // Calculate speed for given power on given grade
    const speedKmh = this.calculateSpeedFromPower(sustainablePower, weight, grade, cda, rollingResistance);

    // Calculate actual time
    const timeHours = distanceMeters / 1000 / speedKmh;
    const timeSeconds = Math.round(timeHours * 3600);

    // Recalculate for actual duration
    const actualDuration = timeSeconds / 60;
    const adjustedPower = this.getSustainablePower(ftp, actualDuration);
    const adjustedSpeed = this.calculateSpeedFromPower(adjustedPower, weight, grade, cda, rollingResistance);
    const adjustedTimeSeconds = Math.round((distanceMeters / 1000 / adjustedSpeed) * 3600);

    // Calculate normalized power (higher for variable terrain)
    const normalizedPower = adjustedPower * (grade !== 0 ? 1.05 : 1.0);

    // Energy expenditure
    const energyKj = Math.round(adjustedPower * (adjustedTimeSeconds / 1000));

    // Confidence interval
    const uncertaintyFactor = 0.05 + (1 - ftpConfidence) * 0.1;
    const confidenceLower = Math.round(adjustedTimeSeconds * (1 - uncertaintyFactor));
    const confidenceUpper = Math.round(adjustedTimeSeconds * (1 + uncertaintyFactor));

    // Overall confidence
    const confidenceScore = Math.min(1.0, ftpConfidence * 0.7 + 0.3);

    // Description
    const distanceKm = distanceMeters / 1000;
    let description = '';
    if (grade > 2) {
      description = `Climbing at ${Math.round(adjustedPower)}W averaging ${adjustedSpeed.toFixed(1)} km/h on ${grade}% grade.`;
    } else if (grade < -2) {
      description = 'Descending course. Power estimate may be conservative; actual time could be faster.';
    } else {
      description = `Flat to rolling terrain at ${Math.round(adjustedPower)}W, targeting ${adjustedSpeed.toFixed(1)} km/h average.`;
    }

    return {
      predictedTimeSeconds: adjustedTimeSeconds,
      confidenceLowerSeconds: confidenceLower,
      confidenceUpperSeconds: confidenceUpper,
      confidenceScore: Math.round(confidenceScore * 100) / 100,
      targetPowerWatts: Math.round(adjustedPower),
      targetSpeedKmh: Math.round(adjustedSpeed * 10) / 10,
      normalizedPower: Math.round(normalizedPower),
      energyKj,
      description,
    };
  }

  /**
   * Get sustainable power for a given duration using power-duration model
   * Uses Critical Power (CP) model for short durations: P = CP + W'/t
   */
  getSustainablePower(ftp: number, durationMinutes: number): number {
    // For very short efforts, use CP model
    if (durationMinutes <= 5) {
      // Estimate W' (anaerobic work capacity) as ~15-25 kJ
      const wPrime = ftp * 20; // ~20 seconds at FTP worth of anaerobic capacity
      const cp = ftp * 0.95; // CP is typically ~95% of FTP
      const power = cp + wPrime / (durationMinutes * 60);
      return Math.min(power, ftp * 1.5); // Cap at 150% FTP
    }

    // Find surrounding duration points in model
    const durations = Object.keys(POWER_DURATION_MODEL)
      .map(Number)
      .sort((a, b) => a - b);

    if (durationMinutes >= durations[durations.length - 1]) {
      // Beyond model - extrapolate conservatively
      const lastDuration = durations[durations.length - 1];
      const lastFactor = POWER_DURATION_MODEL[lastDuration];
      const extraMinutes = durationMinutes - lastDuration;
      const decayRate = 0.0003; // ~1.8% per hour additional
      return ftp * Math.max(0.65, lastFactor - extraMinutes * decayRate);
    }

    // Find bracketing durations
    let lowerDuration = durations[0];
    let upperDuration = durations[durations.length - 1];

    for (let i = 0; i < durations.length - 1; i++) {
      if (durations[i] <= durationMinutes && durations[i + 1] >= durationMinutes) {
        lowerDuration = durations[i];
        upperDuration = durations[i + 1];
        break;
      }
    }

    // Linear interpolation
    const lowerFactor = POWER_DURATION_MODEL[lowerDuration];
    const upperFactor = POWER_DURATION_MODEL[upperDuration];
    const ratio = (durationMinutes - lowerDuration) / (upperDuration - lowerDuration);
    const factor = lowerFactor + (upperFactor - lowerFactor) * ratio;

    return ftp * factor;
  }

  /**
   * Estimate average speed based on FTP and conditions
   */
  private estimateAverageSpeed(
    ftp: number,
    weight: number,
    grade: number,
    cda: number,
    rollingResistance: number,
  ): number {
    // Use 85% FTP as target for endurance ride
    const targetPower = ftp * 0.85;
    return this.calculateSpeedFromPower(targetPower, weight, grade, cda, rollingResistance);
  }

  /**
   * Calculate speed from power using physics model
   * Power = Rolling Resistance + Gravity + Air Resistance
   * P = Crr × m × g × v + m × g × sin(θ) × v + 0.5 × ρ × CdA × v³
   *
   * Solving for v requires iterative approach or cubic equation solver
   */
  private calculateSpeedFromPower(
    powerWatts: number,
    massKg: number,
    gradePercent: number,
    cda: number,
    crr: number,
  ): number {
    const grade = gradePercent / 100;
    const totalMass = massKg + 9; // Include bike weight

    // Use iterative approach to solve for speed
    let speed = 10; // Initial guess in m/s
    const tolerance = 0.01;
    const maxIterations = 50;

    for (let i = 0; i < maxIterations; i++) {
      // Calculate power required at current speed
      const rollingPower = crr * totalMass * this.GRAVITY * speed;
      const gravityPower = totalMass * this.GRAVITY * grade * speed;
      const aeroPower = 0.5 * this.AIR_DENSITY * cda * Math.pow(speed, 3);
      const totalPower = rollingPower + gravityPower + aeroPower;

      // Calculate derivative for Newton-Raphson
      const derivative =
        crr * totalMass * this.GRAVITY +
        totalMass * this.GRAVITY * grade +
        1.5 * this.AIR_DENSITY * cda * Math.pow(speed, 2);

      // Newton-Raphson step
      const newSpeed = speed - (totalPower - powerWatts) / derivative;

      if (Math.abs(newSpeed - speed) < tolerance) {
        speed = newSpeed;
        break;
      }

      speed = Math.max(1, newSpeed); // Ensure positive speed
    }

    // Convert m/s to km/h
    return speed * 3.6;
  }

  /**
   * Calculate power required for given speed and conditions
   */
  calculatePowerForSpeed(
    speedKmh: number,
    massKg: number,
    gradePercent: number,
    cda: number = this.DEFAULT_CDA,
    crr: number = this.DEFAULT_ROLLING_RESISTANCE,
  ): number {
    const speedMs = speedKmh / 3.6;
    const grade = gradePercent / 100;
    const totalMass = massKg + 9;

    const rollingPower = crr * totalMass * this.GRAVITY * speedMs;
    const gravityPower = totalMass * this.GRAVITY * grade * speedMs;
    const aeroPower = 0.5 * this.AIR_DENSITY * cda * Math.pow(speedMs, 3);

    return Math.round(rollingPower + gravityPower + aeroPower);
  }

  /**
   * Estimate time trial performance based on FTP and distance
   */
  async predictTimeTrialTime(
    userId: string,
    distanceMeters: number,
    useAeroPosition: boolean = true,
  ): Promise<CyclingPredictionResult> {
    const cda = useAeroPosition ? 0.25 : this.DEFAULT_CDA;

    return this.predictCyclingTime(userId, {
      targetDistanceMeters: distanceMeters,
      dragCoefficient: cda,
      averageGradePercent: 0,
    });
  }
}

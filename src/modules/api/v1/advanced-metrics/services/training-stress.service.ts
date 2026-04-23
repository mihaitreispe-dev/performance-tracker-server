import { Injectable } from '@nestjs/common';
import {
  CardioMetric,
  CardioMetricType,
  FitnessMetricType,
  Gender,
  NewTrainingStressScore,
  TrainingStressScore,
} from 'src/database/interfaces';
import { AthleteProfileMetricsRepository } from 'src/repositories/athlete-profile-metrics.repository';
import { CardioMetricsRepository } from 'src/repositories/cardio-metrics.repository';
import { FitnessMetricsRepository } from 'src/repositories/fitness-metrics.repository';
import { TrainingStressRepository } from 'src/repositories/training-stress.repository';
import { UserSettingsRepository } from 'src/repositories/user-settings.repository';
import { WorkoutExecutionRepository } from 'src/repositories/workout-execution.repository';
import { WorkoutRouteRepository } from 'src/repositories/workout-route.repository';

export interface TrainingStressResult {
  tss: number | null;
  trimp: number | null;
  aerobicTE: number | null;
  anaerobicTE: number | null;
  estimatedRecoveryHours: number | null;
  intensityFactor: number | null;
  hrss: number | null;
  normalizedPace: number | null;
  normalizedPower: number | null;
}

interface HRZoneTime {
  zone: number;
  minPct: number;
  maxPct: number;
  timeSeconds: number;
}

interface HRPreprocessingResult {
  metrics: CardioMetric[];
  stats: {
    totalSamples: number;
    samplesRemoved: number;
    spikesRemoved: number;
    gapsInterpolated: number;
  };
}

@Injectable()
export class TrainingStressService {
  constructor(
    private readonly workoutExecutionRepository: WorkoutExecutionRepository,
    private readonly cardioMetricsRepository: CardioMetricsRepository,
    private readonly userSettingsRepository: UserSettingsRepository,
    private readonly trainingStressRepository: TrainingStressRepository,
    private readonly fitnessMetricsRepository: FitnessMetricsRepository,
    private readonly workoutRouteRepository: WorkoutRouteRepository,
    private readonly athleteProfileMetricsRepository: AthleteProfileMetricsRepository,
  ) {}

  /**
   * Calculate training stress scores for a workout
   */
  async calculateForWorkout(workoutExecutionId: string): Promise<TrainingStressResult> {
    const execution = await this.workoutExecutionRepository.findById(workoutExecutionId);
    if (!execution || !execution.completed_at || !execution.duration_seconds) {
      return this.emptyResult();
    }

    const userSettings = await this.userSettingsRepository.findByUserId(execution.user_id);
    const maxHR = userSettings?.hr_zones?.maxHr;

    // Get HR metrics
    const rawHrMetrics = await this.cardioMetricsRepository.findMany({
      filter: {
        workoutExecutionId: workoutExecutionId,
        metricType: CardioMetricType.HEART_RATE,
      },
      sort: [{ field: 'recorded_at', direction: 'asc' }],
    });

    // Get power metrics if available (for cycling)
    const powerMetrics = await this.cardioMetricsRepository.findMany({
      filter: {
        workoutExecutionId: workoutExecutionId,
        metricType: CardioMetricType.POWER,
      },
      sort: [{ field: 'recorded_at', direction: 'asc' }],
    });

    // Get resting HR if stored
    const restingHRMetric = await this.fitnessMetricsRepository.getLatestByType(
      execution.user_id,
      FitnessMetricType.RHR,
    );
    const restingHR = restingHRMetric ? Number.parseFloat(restingHRMetric.value) : 60; // Default 60 bpm

    // Get LTHR if available
    const lthrMetric = await this.fitnessMetricsRepository.getLatestByType(execution.user_id, FitnessMetricType.LTHR);
    const lthr = lthrMetric ? Number.parseFloat(lthrMetric.value) : maxHR ? maxHR * 0.85 : null;

    // Get athlete gender for sex-specific TRIMP coefficients
    const gender = await this.athleteProfileMetricsRepository.getGenderByUserId(execution.user_id);

    // Preprocess HR metrics (remove artifacts, spikes, interpolate short gaps)
    const { metrics: hrMetrics, stats: hrPreprocessingStats } = this.preprocessHRMetrics(rawHrMetrics);

    const result: TrainingStressResult = {
      tss: null,
      trimp: null,
      aerobicTE: null,
      anaerobicTE: null,
      estimatedRecoveryHours: null,
      intensityFactor: null,
      hrss: null,
      normalizedPace: null,
      normalizedPower: null,
    };

    // Track additional metrics for metadata
    let edwardsTrimp: number | null = null;

    const durationSeconds = execution.duration_seconds;

    // Calculate TRIMP (Training Impulse) using time-series Banister method
    if (hrMetrics.length > 0 && maxHR) {
      const avgHR = this.calculateAverageHR(hrMetrics);
      // Use time-series TRIMP with sex-specific coefficients
      result.trimp = this.calculateTRIMP(hrMetrics, maxHR, restingHR, gender);

      // Also calculate Edwards TRIMP as alternative metric
      edwardsTrimp = this.calculateEdwardsTRIMP(hrMetrics, maxHR);

      // Calculate HR-based TSS (HRSS) using preprocessed metrics
      if (lthr) {
        result.hrss = this.calculateHRSS(hrMetrics, maxHR, restingHR, lthr, durationSeconds);
        result.intensityFactor = avgHR / lthr;
      }

      // Calculate Training Effect
      const { aerobic, anaerobic } = this.calculateTrainingEffect(
        hrMetrics,
        maxHR,
        durationSeconds,
        userSettings?.hr_zones?.zones,
      );
      result.aerobicTE = aerobic;
      result.anaerobicTE = anaerobic;

      // Calculate recovery time based on EPOC principles
      result.estimatedRecoveryHours = this.calculateRecoveryTime(
        result.trimp || 0,
        result.aerobicTE || 0,
        result.anaerobicTE || 0,
      );
    }

    // Calculate power-based TSS if power data available (for cycling)
    if (powerMetrics.length > 0) {
      const normalizedPower = this.calculateNormalizedPower(powerMetrics);
      result.normalizedPower = normalizedPower;

      // Get FTP if available
      const ftpMetric = await this.fitnessMetricsRepository.getLatestByType(execution.user_id, FitnessMetricType.FTP);
      const ftp = ftpMetric ? Number.parseFloat(ftpMetric.value) : null;

      if (ftp && normalizedPower) {
        const intensityFactor = normalizedPower / ftp;
        result.intensityFactor = intensityFactor;
        result.tss = this.calculatePowerTSS(durationSeconds, intensityFactor, ftp);
      }
    }

    // Calculate running TSS if no power but has pace
    if (!result.tss) {
      const route = await this.workoutRouteRepository.findByExecutionId(workoutExecutionId);
      if (route && durationSeconds > 0) {
        const distanceMeters = Number.parseFloat(route.total_distance_meters);
        const paceMinPerKm = durationSeconds / 60 / (distanceMeters / 1000);
        result.normalizedPace = paceMinPerKm;

        // Get LTP (Lactate Threshold Pace)
        const ltpMetric = await this.fitnessMetricsRepository.getLatestByType(execution.user_id, FitnessMetricType.LTP);
        const ltp = ltpMetric ? Number.parseFloat(ltpMetric.value) : null;

        if (ltp) {
          // Running TSS = (duration_sec × (pace_factor)²) × 100 / 3600
          // pace_factor = LTP / actual_pace (faster pace = higher IF)
          const intensityFactor = ltp / paceMinPerKm;
          result.intensityFactor = intensityFactor;
          result.tss = (durationSeconds * intensityFactor ** 2 * 100) / 3600;
        }
      }
    }

    // If still no TSS, use HRSS as fallback
    if (!result.tss && result.hrss) {
      result.tss = result.hrss;
    }

    // Store the result with extended metadata
    await this.storeResult(workoutExecutionId, result, {
      edwardsTrimp,
      hrPreprocessingStats,
      genderUsed: gender,
    });

    return result;
  }

  /**
   * Calculate TRIMP using time-series Banister method with sex-specific coefficients
   * Integrates per-sample: TRIMP = Σ Δt_min × HRR(t) × (k × e^(b × HRR(t)))
   *
   * Male coefficients: k=0.64, b=1.92
   * Female coefficients: k=0.86, b=1.67
   *
   * Using time-series integration is more accurate for interval/HIIT workouts
   * as it captures within-session HR fluctuations that mean-HR TRIMP misses.
   */
  private calculateTRIMP(hrMetrics: CardioMetric[], maxHR: number, restingHR: number, gender: Gender | null): number {
    if (hrMetrics.length < 2) {
      return 0;
    }

    // Sex-specific coefficients based on research
    // Female athletes show different lactate response curves
    const [k, b] = gender === Gender.FEMALE ? [0.86, 1.67] : [0.64, 1.92];

    let trimp = 0;

    for (let i = 1; i < hrMetrics.length; i++) {
      const hr = Number.parseFloat(hrMetrics[i].value);
      const prevTime = new Date(hrMetrics[i - 1].recorded_at).getTime();
      const currTime = new Date(hrMetrics[i].recorded_at).getTime();
      const dt = (currTime - prevTime) / 1000; // seconds

      // Skip gaps > 60 seconds (device dropout, pause, etc.)
      if (dt <= 0 || dt > 60) {
        continue;
      }

      const dtMinutes = dt / 60;

      // Calculate HR reserve fraction, clamped to [0, 1]
      const hrReserve = Math.max(0, Math.min(1, (hr - restingHR) / (maxHR - restingHR)));

      // Accumulate TRIMP contribution from this sample
      trimp += dtMinutes * hrReserve * k * Math.exp(b * hrReserve);
    }

    return Math.round(trimp * 10) / 10;
  }

  /**
   * Calculate Edwards TRIMP using 5-zone weighted method
   * TRIMP_Edwards = Σ (minutes in zone z) × z
   *
   * Zone weights: 1, 2, 3, 4, 5 for zones 1-5
   * Zone boundaries based on %HRmax:
   * - Zone 1: 50-60%
   * - Zone 2: 60-70%
   * - Zone 3: 70-80%
   * - Zone 4: 80-90%
   * - Zone 5: 90-100%
   *
   * Benefits:
   * - More robust to parameter noise (doesn't require exact HRmax/HRrest)
   * - Easy to explain to athletes
   * - Transparent calculation
   */
  private calculateEdwardsTRIMP(hrMetrics: CardioMetric[], maxHR: number): number {
    if (hrMetrics.length < 2) {
      return 0;
    }

    // Zone definitions: %HRmax ranges
    const zones = [
      { zone: 1, min: 50, max: 60 },
      { zone: 2, min: 60, max: 70 },
      { zone: 3, min: 70, max: 80 },
      { zone: 4, min: 80, max: 90 },
      { zone: 5, min: 90, max: 100 },
    ];

    const zoneMinutes = new Map<number, number>();
    zones.forEach((z) => zoneMinutes.set(z.zone, 0));

    for (let i = 1; i < hrMetrics.length; i++) {
      const hr = Number.parseFloat(hrMetrics[i].value);
      const hrPct = (hr / maxHR) * 100;

      const prevTime = new Date(hrMetrics[i - 1].recorded_at).getTime();
      const currTime = new Date(hrMetrics[i].recorded_at).getTime();
      const dt = (currTime - prevTime) / 1000;

      // Skip gaps > 60 seconds
      if (dt <= 0 || dt > 60) {
        continue;
      }

      const dtMinutes = dt / 60;

      // Assign time to appropriate zone
      for (const zone of zones) {
        if (hrPct >= zone.min && hrPct < zone.max) {
          zoneMinutes.set(zone.zone, (zoneMinutes.get(zone.zone) || 0) + dtMinutes);
          break;
        }
      }

      // Handle HR >= 100% maxHR (put in zone 5)
      if (hrPct >= 100) {
        zoneMinutes.set(5, (zoneMinutes.get(5) || 0) + dtMinutes);
      }
    }

    // Sum: minutes × zone weight
    let edwardsTRIMP = 0;
    zones.forEach((z) => {
      edwardsTRIMP += (zoneMinutes.get(z.zone) || 0) * z.zone;
    });

    return Math.round(edwardsTRIMP * 10) / 10;
  }

  /**
   * Preprocess HR metrics to remove artifacts and improve data quality
   *
   * Steps:
   * 1. Remove out-of-bounds values (< hrMin or > hrMax)
   * 2. De-spike: remove implausible HR jumps (> maxJumpBpmPerSec)
   * 3. Interpolate short gaps (≤ maxInterpGapSec)
   *
   * This preprocessing prevents garbage-in-garbage-out from flaky HR straps.
   */
  private preprocessHRMetrics(
    hrMetrics: CardioMetric[],
    hrMin = 35,
    hrMax = 220,
    maxJumpBpmPerSec = 25,
    maxInterpGapSec = 10,
  ): HRPreprocessingResult {
    const totalSamples = hrMetrics.length;
    let samplesRemoved = 0;
    let spikesRemoved = 0;
    let gapsInterpolated = 0;

    if (hrMetrics.length === 0) {
      return {
        metrics: [],
        stats: { totalSamples: 0, samplesRemoved: 0, spikesRemoved: 0, gapsInterpolated: 0 },
      };
    }

    // Step 1: Remove out-of-bounds values
    let filtered = hrMetrics.filter((m) => {
      const hr = Number.parseFloat(m.value);
      const isValid = hr >= hrMin && hr <= hrMax;
      if (!isValid) {
        samplesRemoved++;
      }
      return isValid;
    });

    // Step 2: De-spike (remove implausible HR jumps)
    const despiked: CardioMetric[] = [];
    for (let i = 0; i < filtered.length; i++) {
      if (i === 0) {
        despiked.push(filtered[i]);
        continue;
      }

      const prevHR = Number.parseFloat(despiked[despiked.length - 1].value);
      const currHR = Number.parseFloat(filtered[i].value);
      const prevTime = new Date(despiked[despiked.length - 1].recorded_at).getTime();
      const currTime = new Date(filtered[i].recorded_at).getTime();
      const dt = (currTime - prevTime) / 1000;

      // If dt is 0 or negative, skip this sample
      if (dt <= 0) {
        samplesRemoved++;
        continue;
      }

      // Check if HR change rate is within acceptable limits
      const hrChangePerSec = Math.abs(currHR - prevHR) / dt;

      if (hrChangePerSec <= maxJumpBpmPerSec) {
        despiked.push(filtered[i]);
      } else {
        spikesRemoved++;
      }
    }

    filtered = despiked;

    // Step 3: Interpolate short gaps
    // Identify gaps and insert interpolated samples
    const interpolated: CardioMetric[] = [];

    for (let i = 0; i < filtered.length; i++) {
      if (i === 0) {
        interpolated.push(filtered[i]);
        continue;
      }

      const prevTime = new Date(filtered[i - 1].recorded_at).getTime();
      const currTime = new Date(filtered[i].recorded_at).getTime();
      const gapSec = (currTime - prevTime) / 1000;

      // If there's a short gap (between 2 and maxInterpGapSec seconds), interpolate
      if (gapSec > 2 && gapSec <= maxInterpGapSec) {
        const prevHR = Number.parseFloat(filtered[i - 1].value);
        const currHR = Number.parseFloat(filtered[i].value);

        // Calculate number of interpolation points (approximately 1 per second)
        const numInterpolations = Math.floor(gapSec) - 1;

        for (let j = 1; j <= numInterpolations; j++) {
          const ratio = j / (numInterpolations + 1);
          const interpHR = prevHR + (currHR - prevHR) * ratio;
          const interpTime = new Date(prevTime + (currTime - prevTime) * ratio);

          // Create an interpolated metric (use previous metric as template)
          interpolated.push({
            ...filtered[i - 1],
            value: interpHR.toFixed(1),
            recorded_at: interpTime,
          });
          gapsInterpolated++;
        }
      }

      interpolated.push(filtered[i]);
    }

    return {
      metrics: interpolated,
      stats: {
        totalSamples,
        samplesRemoved,
        spikesRemoved,
        gapsInterpolated,
      },
    };
  }

  /**
   * Calculate HR-based Training Stress Score
   * HRSS = (duration_sec × hrIF²) × 100 / 3600
   */
  private calculateHRSS(
    hrMetrics: CardioMetric[],
    _maxHR: number,
    _restingHR: number,
    lthr: number,
    durationSeconds: number,
  ): number {
    // Calculate time-weighted HR intensity
    let totalWeightedHR = 0;
    let totalTime = 0;

    for (let i = 1; i < hrMetrics.length; i++) {
      const hr = Number.parseFloat(hrMetrics[i].value);
      const prevTime = new Date(hrMetrics[i - 1].recorded_at).getTime();
      const currTime = new Date(hrMetrics[i].recorded_at).getTime();
      const interval = (currTime - prevTime) / 1000;

      if (interval > 0 && interval < 60) {
        // Ignore gaps > 1 min
        totalWeightedHR += hr * interval;
        totalTime += interval;
      }
    }

    if (totalTime === 0) return 0;

    const avgHR = totalWeightedHR / totalTime;
    const hrIntensityFactor = avgHR / lthr;

    const hrss = (durationSeconds * hrIntensityFactor ** 2 * 100) / 3600;
    return Math.round(hrss * 10) / 10;
  }

  /**
   * Calculate power-based TSS
   * TSS = (duration_sec × IF²) × 100 / 3600
   */
  private calculatePowerTSS(durationSeconds: number, intensityFactor: number, _ftp: number): number {
    const tss = (durationSeconds * intensityFactor ** 2 * 100) / 3600;
    return Math.round(tss * 10) / 10;
  }

  /**
   * Calculate Normalized Power (30-second rolling average, then 4th power average)
   */
  private calculateNormalizedPower(powerMetrics: CardioMetric[]): number {
    if (powerMetrics.length < 30) {
      // Not enough data for 30-sec rolling avg
      const powers = powerMetrics.map((m) => Number.parseFloat(m.value));
      return this.average(powers);
    }

    // Create 30-second rolling averages
    const rollingAvgs: number[] = [];
    for (let i = 29; i < powerMetrics.length; i++) {
      const window = powerMetrics.slice(i - 29, i + 1);
      const avg = this.average(window.map((m) => Number.parseFloat(m.value)));
      rollingAvgs.push(avg);
    }

    // Calculate 4th power average
    const fourthPowers = rollingAvgs.map((v) => v ** 4);
    const avgFourthPower = this.average(fourthPowers);
    const normalizedPower = avgFourthPower ** 0.25;

    return Math.round(normalizedPower);
  }

  /**
   * Calculate Training Effect (0.0-5.0 scale)
   * Based on EPOC accumulation and time in HR zones
   */
  private calculateTrainingEffect(
    hrMetrics: CardioMetric[],
    maxHR: number,
    _durationSeconds: number,
    zones?: { zone: number; minPct: number; maxPct: number }[],
  ): { aerobic: number; anaerobic: number } {
    const defaultZones = zones || [
      { zone: 1, minPct: 50, maxPct: 60 },
      { zone: 2, minPct: 60, maxPct: 70 },
      { zone: 3, minPct: 70, maxPct: 80 },
      { zone: 4, minPct: 80, maxPct: 90 },
      { zone: 5, minPct: 90, maxPct: 100 },
    ];

    // Calculate time in each zone
    const zoneTime = this.calculateZoneTime(hrMetrics, maxHR, defaultZones);

    // Calculate aerobic TE (zones 1-3 contribute most)
    let aerobicScore = 0;
    let anaerobicScore = 0;

    for (const zt of zoneTime) {
      const minutesInZone = zt.timeSeconds / 60;

      if (zt.zone <= 3) {
        // Aerobic zones
        aerobicScore += minutesInZone * (zt.zone * 0.3);
      } else {
        // Anaerobic zones (4-5)
        anaerobicScore += minutesInZone * ((zt.zone - 3) * 0.5);
        // High intensity also provides some aerobic benefit
        aerobicScore += minutesInZone * 0.2;
      }
    }

    // Scale to 0-5 range
    // A typical hard workout (60 min with good zone distribution) should be ~4.0
    const aerobicTE = Math.min(5.0, aerobicScore / 15);
    const anaerobicTE = Math.min(5.0, anaerobicScore / 8);

    return {
      aerobic: Math.round(aerobicTE * 10) / 10,
      anaerobic: Math.round(anaerobicTE * 10) / 10,
    };
  }

  /**
   * Calculate time spent in each HR zone
   */
  private calculateZoneTime(
    hrMetrics: CardioMetric[],
    maxHR: number,
    zones: { zone: number; minPct: number; maxPct: number }[],
  ): HRZoneTime[] {
    const zoneTime: Map<number, number> = new Map();
    zones.forEach((z) => zoneTime.set(z.zone, 0));

    for (let i = 1; i < hrMetrics.length; i++) {
      const hr = Number.parseFloat(hrMetrics[i].value);
      const hrPct = (hr / maxHR) * 100;

      const prevTime = new Date(hrMetrics[i - 1].recorded_at).getTime();
      const currTime = new Date(hrMetrics[i].recorded_at).getTime();
      const interval = (currTime - prevTime) / 1000;

      if (interval > 0 && interval < 60) {
        for (const zone of zones) {
          if (hrPct >= zone.minPct && hrPct < zone.maxPct) {
            zoneTime.set(zone.zone, (zoneTime.get(zone.zone) || 0) + interval);
            break;
          }
        }
      }
    }

    return zones.map((z) => ({
      zone: z.zone,
      minPct: z.minPct,
      maxPct: z.maxPct,
      timeSeconds: zoneTime.get(z.zone) || 0,
    }));
  }

  /**
   * Calculate estimated recovery time based on workout intensity
   */
  private calculateRecoveryTime(trimp: number, aerobicTE: number, anaerobicTE: number): number {
    // Base recovery: 12-72 hours depending on intensity
    // Light workout (TRIMP ~30, TE ~2): ~12 hours
    // Hard workout (TRIMP ~150, TE ~4): ~48 hours
    // Very hard (TRIMP ~200+, TE ~5): ~72 hours

    const trimpFactor = trimp / 50; // Normalize
    const teFactor = (aerobicTE * 0.6 + anaerobicTE * 1.2) / 5;

    const recoveryHours = 12 + (trimpFactor + teFactor) * 15;

    return Math.min(72, Math.round(recoveryHours * 10) / 10);
  }

  /**
   * Get training stress for a specific workout
   */
  async getForWorkout(workoutExecutionId: string): Promise<TrainingStressScore | null> {
    const score = await this.trainingStressRepository.findByWorkoutExecutionId(workoutExecutionId);
    return score || null;
  }

  /**
   * Get total TSS for a date range
   */
  async getTotalTSSForDateRange(userId: string, dateFrom: Date, dateTo: Date): Promise<number> {
    const scores = await this.trainingStressRepository.findByUserAndDateRange(userId, dateFrom, dateTo);
    return scores.reduce((total, score) => total + Number.parseFloat(score.tss || '0'), 0);
  }

  private async storeResult(
    workoutExecutionId: string,
    result: TrainingStressResult,
    extendedMeta?: {
      edwardsTrimp: number | null;
      hrPreprocessingStats: HRPreprocessingResult['stats'];
      genderUsed: Gender | null;
    },
  ): Promise<void> {
    const data: NewTrainingStressScore = {
      workout_execution_id: workoutExecutionId,
      tss: result.tss,
      trimp: result.trimp,
      aerobic_te: result.aerobicTE,
      anaerobic_te: result.anaerobicTE,
      estimated_recovery_hours: result.estimatedRecoveryHours,
      intensity_factor: result.intensityFactor,
      normalized_power: result.normalizedPower,
      normalized_pace: result.normalizedPace,
      hrss: result.hrss,
      calculated_at: new Date(),
      metadata: {
        hrZonesUsed: result.hrss !== null,
        powerUsed: result.normalizedPower !== null,
        paceUsed: result.normalizedPace !== null,
        algorithm: 'banister_trimp',
        // Extended metadata for TRIMP calculations
        trimp_method: 'banister_time_series',
        edwards_trimp: extendedMeta?.edwardsTrimp ?? undefined,
        gender_used: extendedMeta?.genderUsed ?? undefined,
        // HR preprocessing stats
        hr_samples_total: extendedMeta?.hrPreprocessingStats.totalSamples,
        hr_samples_cleaned: extendedMeta?.hrPreprocessingStats.samplesRemoved,
        hr_spikes_removed: extendedMeta?.hrPreprocessingStats.spikesRemoved,
        hr_gaps_interpolated: extendedMeta?.hrPreprocessingStats.gapsInterpolated,
      },
    };

    await this.trainingStressRepository.upsert(data);
  }

  private calculateAverageHR(hrMetrics: CardioMetric[]): number {
    const hrs = hrMetrics.map((m) => Number.parseFloat(m.value));
    return this.average(hrs);
  }

  private average(values: number[]): number {
    if (values.length === 0) return 0;
    return values.reduce((a, b) => a + b, 0) / values.length;
  }

  private emptyResult(): TrainingStressResult {
    return {
      tss: null,
      trimp: null,
      aerobicTE: null,
      anaerobicTE: null,
      estimatedRecoveryHours: null,
      intensityFactor: null,
      hrss: null,
      normalizedPace: null,
      normalizedPower: null,
    };
  }
}

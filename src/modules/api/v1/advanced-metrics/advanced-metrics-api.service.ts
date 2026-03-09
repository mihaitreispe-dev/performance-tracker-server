import { Injectable, NotFoundException } from '@nestjs/common';
import { type Request } from 'express';
import { FitnessMetricType } from 'src/database/interfaces';
import { formatDateToYMD } from 'src/lib/util';
import { AuthUser } from 'src/modules/auth/types/authenticated-user';
import { FitnessMetricsRepository } from 'src/repositories/fitness-metrics.repository';
import { HrvBaselineRepository } from 'src/repositories/hrv-baseline.repository';
import { MultiStreamLoadRepository } from 'src/repositories/multi-stream-load.repository';
import { WorkoutExecutionRepository } from 'src/repositories/workout-execution.repository';

import { FitnessFatiguePredictionBody, ThresholdOverrideBody } from './request.dto';
import {
  DailyReadinessResponse,
  FitnessFatiguePredictionResponse,
  FitnessFatigueResponse,
  HrvBaselineHistoryResponse,
  HrvBaselineResponse,
  MultiStreamLoadHistoryResponse,
  MultiStreamLoadResponse,
  ReadinessHistoryResponse,
  ThresholdOverrideResponse,
  ThresholdsResponse,
  TrainingStressResponse,
  Vo2MaxHistoryResponse,
  Vo2MaxResponse,
} from './response.dto';
import { FitnessFatigueService } from './services/fitness-fatigue.service';
import { ReadinessService } from './services/readiness.service';
import { TrainingStressService } from './services/training-stress.service';
import { Vo2MaxService } from './services/vo2max.service';

@Injectable()
export class AdvancedMetricsApiService {
  constructor(
    private readonly vo2MaxService: Vo2MaxService,
    private readonly trainingStressService: TrainingStressService,
    private readonly fitnessFatigueService: FitnessFatigueService,
    private readonly readinessService: ReadinessService,
    private readonly fitnessMetricsRepository: FitnessMetricsRepository,
    private readonly workoutExecutionRepository: WorkoutExecutionRepository,
    private readonly multiStreamLoadRepository: MultiStreamLoadRepository,
    private readonly hrvBaselineRepository: HrvBaselineRepository,
  ) {}

  /**
   * Get current VO2 max with fitness category
   */
  async getVo2Max(req: Request & { user: AuthUser }): Promise<Vo2MaxResponse> {
    const userId = req.user.id;

    // Try to get latest stored value first
    let result = await this.vo2MaxService.getLatestVo2Max(userId);

    // If no stored value or it's old, calculate a new one
    if (!result) {
      result = await this.vo2MaxService.calculateVo2Max(userId);
    }

    // Calculate fitness category based on VO2 max (simplified - would need age/gender for accuracy)
    let fitnessCategory: string | null = null;
    let percentileRank: number | null = null;

    if (result.value) {
      const vo2 = result.value;
      if (vo2 >= 60) {
        fitnessCategory = 'Elite';
        percentileRank = 99;
      } else if (vo2 >= 52) {
        fitnessCategory = 'Excellent';
        percentileRank = 90;
      } else if (vo2 >= 45) {
        fitnessCategory = 'Good';
        percentileRank = 75;
      } else if (vo2 >= 38) {
        fitnessCategory = 'Fair';
        percentileRank = 50;
      } else if (vo2 >= 30) {
        fitnessCategory = 'Below Average';
        percentileRank = 30;
      } else {
        fitnessCategory = 'Poor';
        percentileRank = 10;
      }
    }

    return new Vo2MaxResponse({
      data: {
        value: result.value,
        confidence: result.confidence,
        dataPointsUsed: result.dataPointsUsed,
        algorithm: result.algorithm,
        reason: result.reason || null,
        fitnessCategory,
        percentileRank,
      },
    });
  }

  /**
   * Get VO2 max history
   */
  async getVo2MaxHistory(req: Request & { user: AuthUser }, days: number = 90): Promise<Vo2MaxHistoryResponse> {
    const userId = req.user.id;
    const history = await this.vo2MaxService.getVo2MaxHistory(userId, days);

    const historyPoints = history.map((h) => ({
      calculatedAt: h.calculated_at.toISOString(),
      value: Number.parseFloat(h.value),
      confidence: Number.parseFloat(h.confidence || '0'),
    }));

    // Calculate changes
    let changeFromStart: number | null = null;
    let changeFrom30Days: number | null = null;

    if (historyPoints.length >= 2) {
      const first = historyPoints[0].value;
      const last = historyPoints[historyPoints.length - 1].value;
      changeFromStart = Math.round((last - first) * 10) / 10;

      // Find value from ~30 days ago
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const thirtyDaysPoint = historyPoints.find((p) => new Date(p.calculatedAt) <= thirtyDaysAgo);
      if (thirtyDaysPoint) {
        changeFrom30Days = Math.round((last - thirtyDaysPoint.value) * 10) / 10;
      }
    }

    return new Vo2MaxHistoryResponse({
      data: {
        history: historyPoints,
        changeFromStart,
        changeFrom30Days,
      },
    });
  }

  /**
   * Get fitness/fatigue chart data (PMC)
   */
  async getFitnessFatigue(req: Request & { user: AuthUser }, days: number = 90): Promise<FitnessFatigueResponse> {
    const userId = req.user.id;
    const pmcData = await this.fitnessFatigueService.getPMCChartData(userId, days);

    return new FitnessFatigueResponse({
      data: {
        data: pmcData.data,
        currentForm: pmcData.currentForm,
      },
    });
  }

  /**
   * Get training stress breakdown for a specific workout
   */
  async getWorkoutTrainingStress(
    req: Request & { user: AuthUser },
    workoutId: string,
  ): Promise<TrainingStressResponse> {
    const userId = req.user.id;

    // Verify the workout belongs to the user
    const execution = await this.workoutExecutionRepository.findById(workoutId);
    if (!execution || execution.user_id !== userId) {
      throw new NotFoundException('Workout not found');
    }

    // Get existing or calculate
    const result = await this.trainingStressService.getForWorkout(workoutId);

    if (!result) {
      // Calculate if not exists
      const calculated = await this.trainingStressService.calculateForWorkout(workoutId);
      return new TrainingStressResponse({
        data: {
          tss: calculated.tss,
          trimp: calculated.trimp,
          aerobicTE: calculated.aerobicTE,
          anaerobicTE: calculated.anaerobicTE,
          estimatedRecoveryHours: calculated.estimatedRecoveryHours,
          intensityFactor: calculated.intensityFactor,
          hrss: calculated.hrss,
          normalizedPace: calculated.normalizedPace,
          normalizedPower: calculated.normalizedPower,
        },
      });
    }

    return new TrainingStressResponse({
      data: {
        tss: result.tss ? Number.parseFloat(result.tss) : null,
        trimp: result.trimp ? Number.parseFloat(result.trimp) : null,
        aerobicTE: result.aerobic_te ? Number.parseFloat(result.aerobic_te) : null,
        anaerobicTE: result.anaerobic_te ? Number.parseFloat(result.anaerobic_te) : null,
        estimatedRecoveryHours: result.estimated_recovery_hours
          ? Number.parseFloat(result.estimated_recovery_hours)
          : null,
        intensityFactor: result.intensity_factor ? Number.parseFloat(result.intensity_factor) : null,
        hrss: result.hrss ? Number.parseFloat(result.hrss) : null,
        normalizedPace: result.normalized_pace ? Number.parseFloat(result.normalized_pace) : null,
        normalizedPower: result.normalized_power ? Number.parseFloat(result.normalized_power) : null,
      },
    });
  }

  /**
   * Get all fitness thresholds (LTHR, LTP, FTP, etc.)
   */
  async getThresholds(req: Request & { user: AuthUser }): Promise<ThresholdsResponse> {
    const userId = req.user.id;
    const metrics = await this.fitnessMetricsRepository.getLatestAllTypes(userId);

    const thresholds = metrics.map((m) => ({
      metricType: m.metric_type as FitnessMetricType,
      value: Number.parseFloat(m.value),
      confidence: Number.parseFloat(m.confidence || '0'),
      calculatedAt: m.calculated_at.toISOString(),
      source: m.metadata?.sourceType || 'calculated',
    }));

    return new ThresholdsResponse({
      data: { thresholds },
    });
  }

  /**
   * Manually override a threshold value
   */
  async overrideThreshold(
    req: Request & { user: AuthUser },
    body: ThresholdOverrideBody,
  ): Promise<ThresholdOverrideResponse> {
    const userId = req.user.id;

    // Create a new manual entry
    const metric = await this.fitnessMetricsRepository.create({
      user_id: userId,
      metric_type: body.metricType,
      value: body.value,
      confidence: 1.0, // Manual entries have 100% confidence
      calculated_at: new Date(),
      metadata: {
        sourceType: 'manual',
        notes: body.notes,
      },
    });

    return new ThresholdOverrideResponse({
      data: {
        metricType: body.metricType,
        value: Number.parseFloat(metric.value),
        updatedAt: metric.calculated_at.toISOString(),
      },
    });
  }

  /**
   * Predict future fitness/fatigue based on planned training
   */
  async predictFitnessFatigue(
    req: Request & { user: AuthUser },
    body: FitnessFatiguePredictionBody,
  ): Promise<FitnessFatiguePredictionResponse> {
    const userId = req.user.id;
    const predictions = await this.fitnessFatigueService.predictFutureTSB(userId, body.plannedDailyTSS);

    return new FitnessFatiguePredictionResponse({
      data: { predictions },
    });
  }

  /**
   * Recalculate training stress for a workout (force refresh)
   */
  async recalculateWorkoutStress(
    req: Request & { user: AuthUser },
    workoutId: string,
  ): Promise<TrainingStressResponse> {
    const userId = req.user.id;

    // Verify the workout belongs to the user
    const execution = await this.workoutExecutionRepository.findById(workoutId);
    if (!execution || execution.user_id !== userId) {
      throw new NotFoundException('Workout not found');
    }

    const result = await this.trainingStressService.calculateForWorkout(workoutId);

    return new TrainingStressResponse({
      data: {
        tss: result.tss,
        trimp: result.trimp,
        aerobicTE: result.aerobicTE,
        anaerobicTE: result.anaerobicTE,
        estimatedRecoveryHours: result.estimatedRecoveryHours,
        intensityFactor: result.intensityFactor,
        hrss: result.hrss,
        normalizedPace: result.normalizedPace,
        normalizedPower: result.normalizedPower,
      },
    });
  }

  /**
   * Backfill fitness/fatigue history for a user
   */
  async backfillFitnessFatigue(req: Request & { user: AuthUser }, days: number = 90): Promise<void> {
    const userId = req.user.id;
    await this.fitnessFatigueService.backfillHistory(userId, days);
  }

  // ==========================================
  // ForUser methods (for coach access)
  // ==========================================

  /**
   * Get VO2 max for a specific user (coach access)
   */
  async getVo2MaxForUser(userId: string): Promise<Vo2MaxResponse> {
    // Try to get latest stored value first
    let result = await this.vo2MaxService.getLatestVo2Max(userId);

    // If no stored value or it's old, calculate a new one
    if (!result) {
      result = await this.vo2MaxService.calculateVo2Max(userId);
    }

    // Calculate fitness category based on VO2 max
    let fitnessCategory: string | null = null;
    let percentileRank: number | null = null;

    if (result.value) {
      const vo2 = result.value;
      if (vo2 >= 60) {
        fitnessCategory = 'Elite';
        percentileRank = 99;
      } else if (vo2 >= 52) {
        fitnessCategory = 'Excellent';
        percentileRank = 90;
      } else if (vo2 >= 45) {
        fitnessCategory = 'Good';
        percentileRank = 75;
      } else if (vo2 >= 38) {
        fitnessCategory = 'Fair';
        percentileRank = 50;
      } else if (vo2 >= 30) {
        fitnessCategory = 'Below Average';
        percentileRank = 30;
      } else {
        fitnessCategory = 'Poor';
        percentileRank = 10;
      }
    }

    return new Vo2MaxResponse({
      data: {
        value: result.value,
        confidence: result.confidence,
        dataPointsUsed: result.dataPointsUsed,
        algorithm: result.algorithm,
        reason: result.reason || null,
        fitnessCategory,
        percentileRank,
      },
    });
  }

  /**
   * Get VO2 max history for a specific user (coach access)
   */
  async getVo2MaxHistoryForUser(userId: string, days: number = 90): Promise<Vo2MaxHistoryResponse> {
    const history = await this.vo2MaxService.getVo2MaxHistory(userId, days);

    const historyPoints = history.map((h) => ({
      calculatedAt: h.calculated_at.toISOString(),
      value: Number.parseFloat(h.value),
      confidence: Number.parseFloat(h.confidence || '0'),
    }));

    // Calculate changes
    let changeFromStart: number | null = null;
    let changeFrom30Days: number | null = null;

    if (historyPoints.length >= 2) {
      const first = historyPoints[0].value;
      const last = historyPoints[historyPoints.length - 1].value;
      changeFromStart = Math.round((last - first) * 10) / 10;

      // Find value from ~30 days ago
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const thirtyDaysPoint = historyPoints.find((p) => new Date(p.calculatedAt) <= thirtyDaysAgo);
      if (thirtyDaysPoint) {
        changeFrom30Days = Math.round((last - thirtyDaysPoint.value) * 10) / 10;
      }
    }

    return new Vo2MaxHistoryResponse({
      data: {
        history: historyPoints,
        changeFromStart,
        changeFrom30Days,
      },
    });
  }

  /**
   * Get fitness/fatigue chart data for a specific user (coach access)
   */
  async getFitnessFatigueForUser(userId: string, days: number = 90): Promise<FitnessFatigueResponse> {
    const pmcData = await this.fitnessFatigueService.getPMCChartData(userId, days);

    return new FitnessFatigueResponse({
      data: {
        data: pmcData.data,
        currentForm: pmcData.currentForm,
      },
    });
  }

  /**
   * Predict future fitness/fatigue for a specific user (coach access)
   */
  async predictFitnessFatigueForUser(
    userId: string,
    body: FitnessFatiguePredictionBody,
  ): Promise<FitnessFatiguePredictionResponse> {
    const predictions = await this.fitnessFatigueService.predictFutureTSB(userId, body.plannedDailyTSS);

    return new FitnessFatiguePredictionResponse({
      data: { predictions },
    });
  }

  // ==========================================
  // Multi-Stream Load methods
  // ==========================================

  /**
   * Get multi-stream load for a specific date
   */
  async getMultiStreamLoad(req: Request & { user: AuthUser }, date?: string): Promise<MultiStreamLoadResponse> {
    const userId = req.user.id;
    const targetDate = date ? new Date(date) : new Date();
    targetDate.setHours(0, 0, 0, 0);

    const load = await this.multiStreamLoadRepository.findByUserAndDate(userId, targetDate);

    if (!load) {
      // Return default values if no data exists
      return new MultiStreamLoadResponse({
        data: {
          date: formatDateToYMD(targetDate),
          aerobic: { ctl: 0, atl: 0, tsb: 0, dailyLoad: 0 },
          msk: { ctl: 0, atl: 0, tsb: 0, dailyLoad: 0 },
          neural: { ctl: 0, atl: 0, tsb: 0, dailyLoad: 0 },
          readinessScore: null,
          readinessOverrideReason: null,
        },
      });
    }

    return new MultiStreamLoadResponse({
      data: {
        date: formatDateToYMD(load.date),
        aerobic: {
          ctl: Number(load.aerobic_ctl) || 0,
          atl: Number(load.aerobic_atl) || 0,
          tsb: Number(load.aerobic_tsb) || 0,
          dailyLoad: Number(load.aerobic_daily_load) || 0,
        },
        msk: {
          ctl: Number(load.msk_ctl) || 0,
          atl: Number(load.msk_atl) || 0,
          tsb: Number(load.msk_tsb) || 0,
          dailyLoad: Number(load.msk_daily_load) || 0,
        },
        neural: {
          ctl: Number(load.neural_ctl) || 0,
          atl: Number(load.neural_atl) || 0,
          tsb: Number(load.neural_tsb) || 0,
          dailyLoad: Number(load.neural_daily_load) || 0,
        },
        readinessScore: load.readiness_score ? Number(load.readiness_score) : null,
        readinessOverrideReason: load.readiness_override_reason,
      },
    });
  }

  /**
   * Get multi-stream load history
   */
  async getMultiStreamLoadHistory(
    req: Request & { user: AuthUser },
    days: number = 30,
  ): Promise<MultiStreamLoadHistoryResponse> {
    const userId = req.user.id;
    const loads = await this.multiStreamLoadRepository.getDateRange(userId, days);

    const data = loads.map((load) => ({
      date: formatDateToYMD(load.date),
      aerobic: {
        ctl: Number(load.aerobic_ctl) || 0,
        atl: Number(load.aerobic_atl) || 0,
        tsb: Number(load.aerobic_tsb) || 0,
        dailyLoad: Number(load.aerobic_daily_load) || 0,
      },
      msk: {
        ctl: Number(load.msk_ctl) || 0,
        atl: Number(load.msk_atl) || 0,
        tsb: Number(load.msk_tsb) || 0,
        dailyLoad: Number(load.msk_daily_load) || 0,
      },
      neural: {
        ctl: Number(load.neural_ctl) || 0,
        atl: Number(load.neural_atl) || 0,
        tsb: Number(load.neural_tsb) || 0,
        dailyLoad: Number(load.neural_daily_load) || 0,
      },
      readinessScore: load.readiness_score ? Number(load.readiness_score) : null,
      readinessOverrideReason: load.readiness_override_reason,
    }));

    return new MultiStreamLoadHistoryResponse({
      data: { data },
    });
  }

  // ==========================================
  // HRV Baseline methods
  // ==========================================

  /**
   * Get HRV baseline for a specific date
   */
  async getHrvBaseline(req: Request & { user: AuthUser }, date?: string): Promise<HrvBaselineResponse> {
    const userId = req.user.id;
    const targetDate = date ? new Date(date) : new Date();
    targetDate.setHours(0, 0, 0, 0);

    const baseline = await this.hrvBaselineRepository.findByUserAndDate(userId, targetDate);

    if (!baseline) {
      return new HrvBaselineResponse({
        data: {
          date: formatDateToYMD(targetDate),
          hrvValue: null,
          restingHr: null,
          hrv7DayAvg: null,
          hrv7DayStd: null,
          hrvZscore: null,
          isSuppressed: false,
          suppressionSeverity: null,
        },
      });
    }

    return new HrvBaselineResponse({
      data: {
        date: formatDateToYMD(baseline.date),
        hrvValue: baseline.hrv_value ? Number(baseline.hrv_value) : null,
        restingHr: baseline.resting_hr ? Number(baseline.resting_hr) : null,
        hrv7DayAvg: baseline.hrv_7day_avg ? Number(baseline.hrv_7day_avg) : null,
        hrv7DayStd: baseline.hrv_7day_std ? Number(baseline.hrv_7day_std) : null,
        hrvZscore: baseline.hrv_zscore ? Number(baseline.hrv_zscore) : null,
        isSuppressed: baseline.is_suppressed ?? false,
        suppressionSeverity: baseline.suppression_severity,
      },
    });
  }

  /**
   * Get HRV baseline history
   */
  async getHrvBaselineHistory(
    req: Request & { user: AuthUser },
    days: number = 30,
  ): Promise<HrvBaselineHistoryResponse> {
    const userId = req.user.id;
    const baselines = await this.hrvBaselineRepository.getDateRange(userId, days);

    const data = baselines.map((baseline) => ({
      date: formatDateToYMD(baseline.date),
      hrvValue: baseline.hrv_value ? Number(baseline.hrv_value) : null,
      restingHr: baseline.resting_hr ? Number(baseline.resting_hr) : null,
      hrv7DayAvg: baseline.hrv_7day_avg ? Number(baseline.hrv_7day_avg) : null,
      hrv7DayStd: baseline.hrv_7day_std ? Number(baseline.hrv_7day_std) : null,
      hrvZscore: baseline.hrv_zscore ? Number(baseline.hrv_zscore) : null,
      isSuppressed: baseline.is_suppressed ?? false,
      suppressionSeverity: baseline.suppression_severity,
    }));

    return new HrvBaselineHistoryResponse({
      data: { data },
    });
  }

  // ==========================================
  // Readiness methods
  // ==========================================

  /**
   * Get daily readiness for a specific date
   */
  async getDailyReadiness(req: Request & { user: AuthUser }, date?: string): Promise<DailyReadinessResponse> {
    const userId = req.user.id;
    const targetDate = date ? new Date(date) : new Date();
    targetDate.setHours(0, 0, 0, 0);

    const readiness = await this.readinessService.getReadinessForDate(userId, targetDate);

    return new DailyReadinessResponse({
      data: {
        date: formatDateToYMD(targetDate),
        readinessScore: readiness.readinessScore,
        hrvZscore: readiness.hrvZscore,
        aerobicTsb: readiness.aerobicTsb,
        mskTsb: readiness.mskTsb,
        neuralTsb: readiness.neuralTsb,
        limitingFactor: readiness.limitingFactor,
        hrvOverride: readiness.hrvOverride,
        journalContribution: readiness.journalContribution,
      },
    });
  }

  /**
   * Get readiness history
   */
  async getReadinessHistory(req: Request & { user: AuthUser }, days: number = 30): Promise<ReadinessHistoryResponse> {
    const userId = req.user.id;
    const history = await this.readinessService.getReadinessHistory(userId, days);

    const data = history.map((r) => ({
      date: r.date,
      readinessScore: r.readinessScore,
      hrvZscore: r.hrvZscore,
      aerobicTsb: r.aerobicTsb,
      mskTsb: r.mskTsb,
      neuralTsb: r.neuralTsb,
      limitingFactor: r.limitingFactor,
      hrvOverride: r.hrvOverride,
      journalContribution: r.journalContribution,
    }));

    return new ReadinessHistoryResponse({
      data: { data },
    });
  }
}

import { Injectable, NotFoundException } from '@nestjs/common';
import { type Request } from 'express';
import { FitnessMetricType } from 'src/database/interfaces';
import { formatDateToYMD } from 'src/lib/util';
import { AuthUser } from 'src/modules/auth/types/authenticated-user';
import { FitnessMetricsRepository } from 'src/repositories/fitness-metrics.repository';
import { HrvBaselineRepository } from 'src/repositories/hrv-baseline.repository';
import { MultiStreamLoadRepository } from 'src/repositories/multi-stream-load.repository';
import { QuickWellnessCheckinRepository } from 'src/repositories/quick-wellness-checkin.repository';
import { RpeTssTrackingRepository } from 'src/repositories/rpe-tss-tracking.repository';
import { WorkoutExecutionRepository } from 'src/repositories/workout-execution.repository';
import { WorkoutRepository } from 'src/repositories/workout.repository';

import { CorrelationQuery, FitnessFatiguePredictionBody, ThresholdOverrideBody } from './request.dto';
import {
  BayesianDiagnosticsResponse,
  DailyReadinessResponse,
  FitnessFatiguePredictionResponse,
  FitnessFatigueResponse,
  HrvBaselineHistoryResponse,
  HrvBaselineResponse,
  MultiStreamLoadHistoryResponse,
  MultiStreamLoadResponse,
  ReadinessHistoryResponse,
  ReadinessTrendsResponse,
  RpeTssCorrelationResponse,
  RpeTssDataPointDTO,
  ThresholdOverrideResponse,
  ThresholdsResponse,
  TrainingStressResponse,
  Vo2MaxHistoryResponse,
  Vo2MaxResponse,
  WellnessCorrelationDTO,
  WellnessPerformanceCorrelationResponse,
} from './response.dto';
import { BayesianParameterService } from './services/bayesian-parameter.service';
import { FitnessFatigueService } from './services/fitness-fatigue.service';
import { MultiStreamLoadService } from './services/multi-stream-load.service';
import { ReadinessService } from './services/readiness.service';
import { TrainingStressService } from './services/training-stress.service';
import { Vo2MaxService } from './services/vo2max.service';

@Injectable()
export class AdvancedMetricsApiService {
  constructor(
    private readonly vo2MaxService: Vo2MaxService,
    private readonly trainingStressService: TrainingStressService,
    private readonly fitnessFatigueService: FitnessFatigueService,
    private readonly multiStreamLoadService: MultiStreamLoadService,
    private readonly readinessService: ReadinessService,
    private readonly bayesianParameterService: BayesianParameterService,
    private readonly fitnessMetricsRepository: FitnessMetricsRepository,
    private readonly workoutExecutionRepository: WorkoutExecutionRepository,
    private readonly workoutRepository: WorkoutRepository,
    private readonly multiStreamLoadRepository: MultiStreamLoadRepository,
    private readonly hrvBaselineRepository: HrvBaselineRepository,
    private readonly rpeTssTrackingRepository: RpeTssTrackingRepository,
    private readonly quickWellnessCheckinRepository: QuickWellnessCheckinRepository,
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

  /**
   * Backfill multi-stream load history for a user
   */
  async backfillMultiStreamLoad(req: Request & { user: AuthUser }, days: number = 90): Promise<void> {
    const userId = req.user.id;
    await this.multiStreamLoadService.backfillHistory(userId, days);
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

  /**
   * Get multi-stream load history for a specific user (coach access)
   */
  async getMultiStreamLoadHistoryForUser(userId: string, days: number = 30): Promise<MultiStreamLoadHistoryResponse> {
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

  /**
   * Get daily readiness for a specific user (coach access)
   */
  async getDailyReadinessForUser(userId: string, date?: string): Promise<DailyReadinessResponse> {
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
   * Get readiness history for a specific user (coach access)
   */
  async getReadinessHistoryForUser(userId: string, days: number = 30): Promise<ReadinessHistoryResponse> {
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

  /**
   * Get readiness trends with divergence analysis
   */
  async getReadinessTrends(req: Request & { user: AuthUser }, days: number = 14): Promise<ReadinessTrendsResponse> {
    const userId = req.user.id;
    const trends = await this.readinessService.getReadinessTrends(userId, days);

    return new ReadinessTrendsResponse({
      data: {
        data: trends.data,
        divergence: trends.divergence,
        period: trends.period,
      },
    });
  }

  /**
   * Get readiness trends for a specific user (coach access)
   */
  async getReadinessTrendsForUser(userId: string, days: number = 14): Promise<ReadinessTrendsResponse> {
    const trends = await this.readinessService.getReadinessTrends(userId, days);

    return new ReadinessTrendsResponse({
      data: {
        data: trends.data,
        divergence: trends.divergence,
        period: trends.period,
      },
    });
  }

  // ==========================================
  // Subjective-Load Correlation methods
  // ==========================================

  /**
   * Get RPE vs TSS correlation data
   */
  async getRpeTssCorrelation(
    req: Request & { user: AuthUser },
    query: CorrelationQuery,
  ): Promise<RpeTssCorrelationResponse> {
    const userId = req.user.id;
    const days = query.days ?? 90;

    // Get RPE-TSS tracking records
    const records = await this.rpeTssTrackingRepository.getRecentForUser(userId, days);

    // Build data points (simplified - no workout name lookup for now)
    const dataPoints: RpeTssDataPointDTO[] = records.map((record) => {
      return {
        date:
          record.created_at instanceof Date
            ? formatDateToYMD(record.created_at)
            : String(record.created_at).split('T')[0],
        workoutName: null, // Could be enhanced to fetch via schedule if needed
        sessionRpe: record.session_rpe,
        srpeTss: Number(record.srpe_tss),
        calculatedTss: record.calculated_tss ? Number(record.calculated_tss) : null,
        rpeTssRatio: record.rpe_tss_ratio ? Number(record.rpe_tss_ratio) : null,
      };
    });

    // Calculate average ratio
    const validRatios = dataPoints.filter((d) => d.rpeTssRatio !== null).map((d) => d.rpeTssRatio!);
    const averageRatio =
      validRatios.length > 0
        ? Math.round((validRatios.reduce((sum, r) => sum + r, 0) / validRatios.length) * 100) / 100
        : null;

    // Calculate trend direction (comparing first week to last week)
    let ratioTrend: 'increasing' | 'stable' | 'decreasing' = 'stable';
    if (dataPoints.length >= 7) {
      const firstWeek = dataPoints.slice(-7).filter((d) => d.rpeTssRatio !== null);
      const lastWeek = dataPoints.slice(0, 7).filter((d) => d.rpeTssRatio !== null);

      if (firstWeek.length > 0 && lastWeek.length > 0) {
        const firstWeekAvg = firstWeek.reduce((sum, d) => sum + d.rpeTssRatio!, 0) / firstWeek.length;
        const lastWeekAvg = lastWeek.reduce((sum, d) => sum + d.rpeTssRatio!, 0) / lastWeek.length;

        const diff = lastWeekAvg - firstWeekAvg;
        if (diff > 0.1) {
          ratioTrend = 'increasing';
        } else if (diff < -0.1) {
          ratioTrend = 'decreasing';
        }
      }
    }

    // Check for accumulated fatigue warning (avg ratio > 1.3 over 7+ days)
    const recent7DaysRatios = dataPoints.slice(0, 7).filter((d) => d.rpeTssRatio !== null);
    const recent7DaysAvg =
      recent7DaysRatios.length > 0
        ? recent7DaysRatios.reduce((sum, d) => sum + d.rpeTssRatio!, 0) / recent7DaysRatios.length
        : 0;
    const accumulatedFatigueWarning = recent7DaysRatios.length >= 7 && recent7DaysAvg > 1.3;

    return new RpeTssCorrelationResponse({
      data: {
        dataPoints,
        averageRatio,
        ratioTrend,
        accumulatedFatigueWarning,
      },
    });
  }

  /**
   * Get wellness-performance correlation
   */
  async getWellnessPerformanceCorrelation(
    req: Request & { user: AuthUser },
    query: CorrelationQuery,
  ): Promise<WellnessPerformanceCorrelationResponse> {
    const userId = req.user.id;
    const days = query.days ?? 90;

    // Get wellness check-ins
    const checkins = await this.quickWellnessCheckinRepository.getDateRange(userId, days);

    // Get readiness/performance data
    const loadData = await this.multiStreamLoadRepository.getDateRange(userId, days);

    // Create date-indexed maps
    const checkinMap = new Map(
      checkins.map((c) => [
        c.checkin_date instanceof Date ? formatDateToYMD(c.checkin_date) : String(c.checkin_date),
        c,
      ]),
    );

    const loadMap = new Map(
      loadData.map((l) => [l.date instanceof Date ? formatDateToYMD(l.date) : String(l.date), l]),
    );

    // Build paired data for correlation
    const pairedData: Array<{
      date: string;
      sleep: number;
      stress: number;
      soreness: number;
      energy: number;
      performance: number; // Using readiness score as proxy for performance
    }> = [];

    for (const [date, checkin] of checkinMap) {
      const load = loadMap.get(date);
      if (
        load?.readiness_score &&
        checkin.sleep_quality &&
        checkin.stress_level &&
        checkin.muscle_soreness &&
        checkin.energy_level
      ) {
        pairedData.push({
          date,
          sleep: checkin.sleep_quality,
          stress: checkin.stress_level,
          soreness: checkin.muscle_soreness,
          energy: checkin.energy_level,
          performance: Number(load.readiness_score),
        });
      }
    }

    // Calculate correlations
    const correlations: WellnessCorrelationDTO[] = [];

    if (pairedData.length >= 5) {
      const factors: Array<{ name: 'sleep' | 'stress' | 'soreness' | 'energy'; key: keyof (typeof pairedData)[0] }> = [
        { name: 'sleep', key: 'sleep' },
        { name: 'stress', key: 'stress' },
        { name: 'soreness', key: 'soreness' },
        { name: 'energy', key: 'energy' },
      ];

      for (const { name, key } of factors) {
        const correlation = this.calculatePearsonCorrelation(
          pairedData.map((d) => d[key] as number),
          pairedData.map((d) => d.performance),
        );

        correlations.push({
          factor: name,
          correlationWithPerformance: Math.round(correlation * 100) / 100,
          pValue: null, // Would need proper statistical library for p-value
        });
      }
    }

    // Calculate overtraining risk score
    const riskFactors: string[] = [];
    let riskScore = 0;

    // Check for consistently low energy
    const avgEnergy = pairedData.length > 0 ? pairedData.reduce((sum, d) => sum + d.energy, 0) / pairedData.length : 3;
    if (avgEnergy < 2.5) {
      riskScore += 20;
      riskFactors.push('Consistently low energy levels');
    }

    // Check for consistently high stress
    const avgStress = pairedData.length > 0 ? pairedData.reduce((sum, d) => sum + d.stress, 0) / pairedData.length : 3;
    if (avgStress < 2.5) {
      // Note: inverted scale (5 = no stress)
      riskScore += 15;
      riskFactors.push('Elevated stress levels');
    }

    // Check for consistently high soreness
    const avgSoreness =
      pairedData.length > 0 ? pairedData.reduce((sum, d) => sum + d.soreness, 0) / pairedData.length : 3;
    if (avgSoreness < 2.5) {
      // Note: inverted scale (5 = no soreness)
      riskScore += 20;
      riskFactors.push('Persistent muscle soreness');
    }

    // Check for poor sleep
    const avgSleep = pairedData.length > 0 ? pairedData.reduce((sum, d) => sum + d.sleep, 0) / pairedData.length : 3;
    if (avgSleep < 2.5) {
      riskScore += 15;
      riskFactors.push('Poor sleep quality');
    }

    // Check for declining performance trend
    if (pairedData.length >= 14) {
      const firstWeek = pairedData.slice(-7);
      const lastWeek = pairedData.slice(0, 7);

      const firstWeekPerf = firstWeek.reduce((sum, d) => sum + d.performance, 0) / firstWeek.length;
      const lastWeekPerf = lastWeek.reduce((sum, d) => sum + d.performance, 0) / lastWeek.length;

      if (lastWeekPerf < firstWeekPerf - 10) {
        riskScore += 30;
        riskFactors.push('Declining readiness trend');
      }
    }

    // Cap risk score at 100
    const overtrainingRiskScore = Math.min(riskScore, 100);

    return new WellnessPerformanceCorrelationResponse({
      data: {
        correlations,
        overtrainingRiskScore,
        riskFactors,
      },
    });
  }

  // ==========================================
  // ForUser Correlation methods (for coach access)
  // ==========================================

  /**
   * Get RPE vs TSS correlation data for a specific user (coach access)
   */
  async getRpeTssCorrelationForUser(userId: string, days: number = 90): Promise<RpeTssCorrelationResponse> {
    // Get RPE-TSS tracking records
    const records = await this.rpeTssTrackingRepository.getRecentForUser(userId, days);

    // Build data points
    const dataPoints: RpeTssDataPointDTO[] = records.map((record) => {
      return {
        date:
          record.created_at instanceof Date
            ? formatDateToYMD(record.created_at)
            : String(record.created_at).split('T')[0],
        workoutName: null,
        sessionRpe: record.session_rpe,
        srpeTss: Number(record.srpe_tss),
        calculatedTss: record.calculated_tss ? Number(record.calculated_tss) : null,
        rpeTssRatio: record.rpe_tss_ratio ? Number(record.rpe_tss_ratio) : null,
      };
    });

    // Calculate average ratio
    const validRatios = dataPoints.filter((d) => d.rpeTssRatio !== null).map((d) => d.rpeTssRatio!);
    const averageRatio =
      validRatios.length > 0
        ? Math.round((validRatios.reduce((sum, r) => sum + r, 0) / validRatios.length) * 100) / 100
        : null;

    // Calculate trend direction (comparing first week to last week)
    let ratioTrend: 'increasing' | 'stable' | 'decreasing' = 'stable';
    if (dataPoints.length >= 7) {
      const firstWeek = dataPoints.slice(-7).filter((d) => d.rpeTssRatio !== null);
      const lastWeek = dataPoints.slice(0, 7).filter((d) => d.rpeTssRatio !== null);

      if (firstWeek.length > 0 && lastWeek.length > 0) {
        const firstWeekAvg = firstWeek.reduce((sum, d) => sum + d.rpeTssRatio!, 0) / firstWeek.length;
        const lastWeekAvg = lastWeek.reduce((sum, d) => sum + d.rpeTssRatio!, 0) / lastWeek.length;

        const diff = lastWeekAvg - firstWeekAvg;
        if (diff > 0.1) {
          ratioTrend = 'increasing';
        } else if (diff < -0.1) {
          ratioTrend = 'decreasing';
        }
      }
    }

    // Check for accumulated fatigue warning (avg ratio > 1.3 over 7+ days)
    const recent7DaysRatios = dataPoints.slice(0, 7).filter((d) => d.rpeTssRatio !== null);
    const recent7DaysAvg =
      recent7DaysRatios.length > 0
        ? recent7DaysRatios.reduce((sum, d) => sum + d.rpeTssRatio!, 0) / recent7DaysRatios.length
        : 0;
    const accumulatedFatigueWarning = recent7DaysRatios.length >= 7 && recent7DaysAvg > 1.3;

    return new RpeTssCorrelationResponse({
      data: {
        dataPoints,
        averageRatio,
        ratioTrend,
        accumulatedFatigueWarning,
      },
    });
  }

  /**
   * Get wellness-performance correlation for a specific user (coach access)
   */
  async getWellnessPerformanceCorrelationForUser(
    userId: string,
    days: number = 90,
  ): Promise<WellnessPerformanceCorrelationResponse> {
    // Get wellness check-ins
    const checkins = await this.quickWellnessCheckinRepository.getDateRange(userId, days);

    // Get readiness/performance data
    const loadData = await this.multiStreamLoadRepository.getDateRange(userId, days);

    // Create date-indexed maps
    const checkinMap = new Map(
      checkins.map((c) => [
        c.checkin_date instanceof Date ? formatDateToYMD(c.checkin_date) : String(c.checkin_date),
        c,
      ]),
    );

    const loadMap = new Map(
      loadData.map((l) => [l.date instanceof Date ? formatDateToYMD(l.date) : String(l.date), l]),
    );

    // Build paired data for correlation
    const pairedData: Array<{
      date: string;
      sleep: number;
      stress: number;
      soreness: number;
      energy: number;
      performance: number;
    }> = [];

    for (const [date, checkin] of checkinMap) {
      const load = loadMap.get(date);
      if (
        load?.readiness_score &&
        checkin.sleep_quality &&
        checkin.stress_level &&
        checkin.muscle_soreness &&
        checkin.energy_level
      ) {
        pairedData.push({
          date,
          sleep: checkin.sleep_quality,
          stress: checkin.stress_level,
          soreness: checkin.muscle_soreness,
          energy: checkin.energy_level,
          performance: Number(load.readiness_score),
        });
      }
    }

    // Calculate correlations
    const correlations: WellnessCorrelationDTO[] = [];

    if (pairedData.length >= 5) {
      const factors: Array<{ name: 'sleep' | 'stress' | 'soreness' | 'energy'; key: keyof (typeof pairedData)[0] }> = [
        { name: 'sleep', key: 'sleep' },
        { name: 'stress', key: 'stress' },
        { name: 'soreness', key: 'soreness' },
        { name: 'energy', key: 'energy' },
      ];

      for (const { name, key } of factors) {
        const correlation = this.calculatePearsonCorrelation(
          pairedData.map((d) => d[key] as number),
          pairedData.map((d) => d.performance),
        );

        correlations.push({
          factor: name,
          correlationWithPerformance: Math.round(correlation * 100) / 100,
          pValue: null,
        });
      }
    }

    // Calculate overtraining risk score
    const riskFactors: string[] = [];
    let riskScore = 0;

    // Check for consistently low energy
    const avgEnergy = pairedData.length > 0 ? pairedData.reduce((sum, d) => sum + d.energy, 0) / pairedData.length : 3;
    if (avgEnergy < 2.5) {
      riskScore += 20;
      riskFactors.push('Consistently low energy levels');
    }

    // Check for consistently high stress
    const avgStress = pairedData.length > 0 ? pairedData.reduce((sum, d) => sum + d.stress, 0) / pairedData.length : 3;
    if (avgStress < 2.5) {
      riskScore += 15;
      riskFactors.push('Elevated stress levels');
    }

    // Check for consistently high soreness
    const avgSoreness =
      pairedData.length > 0 ? pairedData.reduce((sum, d) => sum + d.soreness, 0) / pairedData.length : 3;
    if (avgSoreness < 2.5) {
      riskScore += 20;
      riskFactors.push('Persistent muscle soreness');
    }

    // Check for poor sleep
    const avgSleep = pairedData.length > 0 ? pairedData.reduce((sum, d) => sum + d.sleep, 0) / pairedData.length : 3;
    if (avgSleep < 2.5) {
      riskScore += 15;
      riskFactors.push('Poor sleep quality');
    }

    // Check for declining performance trend
    if (pairedData.length >= 14) {
      const firstWeek = pairedData.slice(-7);
      const lastWeek = pairedData.slice(0, 7);

      const firstWeekPerf = firstWeek.reduce((sum, d) => sum + d.performance, 0) / firstWeek.length;
      const lastWeekPerf = lastWeek.reduce((sum, d) => sum + d.performance, 0) / lastWeek.length;

      if (lastWeekPerf < firstWeekPerf - 10) {
        riskScore += 30;
        riskFactors.push('Declining readiness trend');
      }
    }

    // Cap risk score at 100
    const overtrainingRiskScore = Math.min(riskScore, 100);

    return new WellnessPerformanceCorrelationResponse({
      data: {
        correlations,
        overtrainingRiskScore,
        riskFactors,
      },
    });
  }

  // ==========================================
  // Bayesian Diagnostics methods
  // ==========================================

  /**
   * Get Bayesian model diagnostics
   */
  async getBayesianDiagnostics(req: Request & { user: AuthUser }): Promise<BayesianDiagnosticsResponse> {
    const userId = req.user.id;
    const diagnostics = await this.bayesianParameterService.getDiagnostics(userId);

    return new BayesianDiagnosticsResponse({
      data: {
        confidence: diagnostics.confidence,
        dataPointsUsed: diagnostics.dataPointsUsed,
        mae7day: diagnostics.mae7day,
        mae30day: diagnostics.mae30day,
        convergenceStatus: diagnostics.convergenceStatus,
        parameterDrifts: diagnostics.parameterDrifts,
        recentRollbacks: diagnostics.recentRollbacks,
        nextUpdateDate: diagnostics.nextUpdateDate,
        lastUpdateDate: diagnostics.lastUpdateDate?.toISOString() ?? null,
      },
    });
  }

  /**
   * Get Bayesian model diagnostics for a specific user (coach access)
   */
  async getBayesianDiagnosticsForUser(userId: string): Promise<BayesianDiagnosticsResponse> {
    const diagnostics = await this.bayesianParameterService.getDiagnostics(userId);

    return new BayesianDiagnosticsResponse({
      data: {
        confidence: diagnostics.confidence,
        dataPointsUsed: diagnostics.dataPointsUsed,
        mae7day: diagnostics.mae7day,
        mae30day: diagnostics.mae30day,
        convergenceStatus: diagnostics.convergenceStatus,
        parameterDrifts: diagnostics.parameterDrifts,
        recentRollbacks: diagnostics.recentRollbacks,
        nextUpdateDate: diagnostics.nextUpdateDate,
        lastUpdateDate: diagnostics.lastUpdateDate?.toISOString() ?? null,
      },
    });
  }

  /**
   * Calculate Pearson correlation coefficient
   */
  private calculatePearsonCorrelation(x: number[], y: number[]): number {
    const n = x.length;
    if (n !== y.length || n === 0) return 0;

    const sumX = x.reduce((a, b) => a + b, 0);
    const sumY = y.reduce((a, b) => a + b, 0);
    const sumXY = x.reduce((total, xi, i) => total + xi * y[i], 0);
    const sumX2 = x.reduce((total, xi) => total + xi * xi, 0);
    const sumY2 = y.reduce((total, yi) => total + yi * yi, 0);

    const numerator = n * sumXY - sumX * sumY;
    const denominator = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));

    if (denominator === 0) return 0;
    return numerator / denominator;
  }
}

import { Injectable, NotFoundException } from '@nestjs/common';
import { type Request } from 'express';
import { FitnessMetricType } from 'src/database/interfaces';
import { AuthUser } from 'src/modules/auth/types/authenticated-user';
import { FitnessMetricsRepository } from 'src/repositories/fitness-metrics.repository';
import { WorkoutExecutionRepository } from 'src/repositories/workout-execution.repository';

import { FitnessFatiguePredictionBody, ThresholdOverrideBody } from './request.dto';
import {
  FitnessFatiguePredictionResponse,
  FitnessFatigueResponse,
  ThresholdOverrideResponse,
  ThresholdsResponse,
  TrainingStressResponse,
  Vo2MaxHistoryResponse,
  Vo2MaxResponse,
} from './response.dto';
import { FitnessFatigueService } from './services/fitness-fatigue.service';
import { TrainingStressService } from './services/training-stress.service';
import { Vo2MaxService } from './services/vo2max.service';

@Injectable()
export class AdvancedMetricsApiService {
  constructor(
    private readonly vo2MaxService: Vo2MaxService,
    private readonly trainingStressService: TrainingStressService,
    private readonly fitnessFatigueService: FitnessFatigueService,
    private readonly fitnessMetricsRepository: FitnessMetricsRepository,
    private readonly workoutExecutionRepository: WorkoutExecutionRepository,
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
}

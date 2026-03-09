import { Injectable, Logger } from '@nestjs/common';
import {
  DefaultLoadModelParameters,
  LearnableParameters,
  LoadModelParameters,
  ParameterSnapshot,
  PredictionError,
  RecoveryJournalEntry,
  UpdateLoadModelParameters,
} from 'src/database/interfaces';
import { formatDateToYMD } from 'src/lib/util';
import { HrvBaselineRepository } from 'src/repositories/hrv-baseline.repository';
import { LoadModelParametersRepository } from 'src/repositories/load-model-parameters.repository';
import { MultiStreamLoadRepository } from 'src/repositories/multi-stream-load.repository';
import { RecoveryJournalRepository } from 'src/repositories/recovery-journal.repository';

export interface ParameterUpdateResult {
  updated: boolean;
  reason?: string;
  mae7day?: number;
  mae30day?: number;
  confidence?: number;
}

export interface RollbackResult {
  rolledBack: boolean;
  reason?: string;
}

@Injectable()
export class BayesianParameterService {
  private readonly logger = new Logger(BayesianParameterService.name);

  // Minimum data requirements
  private readonly MIN_DATA_POINTS = 14; // 2 weeks minimum
  private readonly UPDATE_FREQUENCY_DAYS = 7; // Weekly updates
  private readonly CONFIDENCE_GROWTH_RATE = 0.02; // Per data point
  private readonly MAX_CONFIDENCE = 0.95;
  private readonly ROLLBACK_THRESHOLD = 1.3; // 30% MAE degradation triggers rollback

  constructor(
    private readonly loadModelParametersRepository: LoadModelParametersRepository,
    private readonly hrvBaselineRepository: HrvBaselineRepository,
    private readonly multiStreamLoadRepository: MultiStreamLoadRepository,
    private readonly recoveryJournalRepository: RecoveryJournalRepository,
  ) {}

  /**
   * Daily: Record prediction error for later batch update
   * Compares yesterday's predicted HRV to today's actual HRV
   */
  async recordPredictionError(userId: string, date: Date): Promise<void> {
    const targetDate = new Date(date);
    targetDate.setHours(0, 0, 0, 0);

    const yesterday = new Date(targetDate);
    yesterday.setDate(yesterday.getDate() - 1);

    // Get model parameters
    const params = await this.loadModelParametersRepository.findByUserId(userId);
    if (!params) {
      // Create default parameters if they don't exist
      await this.loadModelParametersRepository.create({ user_id: userId });
      return;
    }

    // Get today's actual HRV baseline
    const hrvBaseline = await this.hrvBaselineRepository.findByUserAndDate(userId, targetDate);
    if (!hrvBaseline?.hrv_zscore) {
      // No HRV data to learn from
      return;
    }

    // Get yesterday's load data
    const yesterdayLoad = await this.multiStreamLoadRepository.findByUserAndDate(userId, yesterday);
    if (!yesterdayLoad) {
      return;
    }

    // Get yesterday's journal entry
    const journal = await this.recoveryJournalRepository.findByUserAndDate(userId, yesterday);

    // Calculate what we predicted HRV would be
    const predicted = this.predictHrvZscore(yesterdayLoad, journal ?? null, params);
    const actual = parseFloat(hrvBaseline.hrv_zscore);
    const error = actual - predicted;

    // Store the prediction error
    const predictionError: PredictionError = {
      date: formatDateToYMD(targetDate),
      predicted,
      actual,
      error,
      features: this.extractFeatures(yesterdayLoad, journal ?? null),
    };

    await this.loadModelParametersRepository.appendPredictionError(userId, predictionError);
    this.logger.debug(
      `Recorded prediction error for user ${userId}: predicted=${predicted.toFixed(2)}, actual=${actual.toFixed(2)}, error=${error.toFixed(2)}`,
    );
  }

  /**
   * Weekly: Update parameters using gradient descent on accumulated errors
   */
  async updateParametersWeekly(userId: string): Promise<ParameterUpdateResult> {
    const params = await this.loadModelParametersRepository.findByUserId(userId);

    if (!params) {
      return { updated: false, reason: 'no_parameters' };
    }

    // Check minimum data requirements
    if (params.data_points_used < this.MIN_DATA_POINTS) {
      return { updated: false, reason: 'insufficient_data' };
    }

    // Get recent errors for gradient calculation
    const recentErrors = params.prediction_errors?.slice(-30) || [];
    if (recentErrors.length < 7) {
      return { updated: false, reason: 'insufficient_recent_errors' };
    }

    // Calculate gradients for each parameter
    const gradients = this.calculateGradients(recentErrors, params);

    // Apply updates with bounds checking
    const updates = this.applyGradientUpdates(params, gradients);

    // Calculate new confidence
    const newConfidence = Math.min(
      parseFloat(params.parameter_confidence) + this.CONFIDENCE_GROWTH_RATE * recentErrors.length,
      this.MAX_CONFIDENCE,
    );

    // Store snapshot for potential rollback
    const snapshot: ParameterSnapshot = {
      date: formatDateToYMD(new Date()),
      params: this.extractCurrentParams(params),
      mae: this.calculateMAE(recentErrors),
    };

    await this.loadModelParametersRepository.appendParameterSnapshot(userId, snapshot);

    // Calculate new MAE
    const mae7 = this.calculateMAE(recentErrors.slice(-7));
    const mae30 = this.calculateMAE(recentErrors);

    // Apply updates
    const updateData: UpdateLoadModelParameters = {
      ...updates,
      parameter_confidence: newConfidence,
      mae_7day: mae7,
      mae_30day: mae30,
      last_update_date: new Date(),
    };

    await this.loadModelParametersRepository.updateByUserId(userId, updateData);

    this.logger.log(
      `Updated parameters for user ${userId}: confidence=${newConfidence.toFixed(2)}, mae7=${mae7.toFixed(2)}, mae30=${mae30.toFixed(2)}`,
    );

    return {
      updated: true,
      mae7day: mae7,
      mae30day: mae30,
      confidence: newConfidence,
    };
  }

  /**
   * Rollback to previous parameter set if recent performance degraded
   */
  async rollbackIfNeeded(userId: string): Promise<RollbackResult> {
    const params = await this.loadModelParametersRepository.findByUserId(userId);

    if (!params?.parameter_history?.length || !params.mae_7day) {
      return { rolledBack: false };
    }

    const history = params.parameter_history;
    if (history.length < 2) {
      return { rolledBack: false };
    }

    // Compare recent MAE to previous snapshot
    const previousSnapshot = history[history.length - 2];
    const currentMae = parseFloat(params.mae_7day);

    if (previousSnapshot.mae && currentMae > previousSnapshot.mae * this.ROLLBACK_THRESHOLD) {
      // Performance degraded by more than threshold, rollback
      const rollbackParams: UpdateLoadModelParameters = {
        aerobic_ctl_decay: previousSnapshot.params.aerobic_ctl_decay,
        aerobic_atl_decay: previousSnapshot.params.aerobic_atl_decay,
        msk_ctl_decay: previousSnapshot.params.msk_ctl_decay,
        msk_atl_decay: previousSnapshot.params.msk_atl_decay,
        neural_ctl_decay: previousSnapshot.params.neural_ctl_decay,
        neural_atl_decay: previousSnapshot.params.neural_atl_decay,
        run_aerobic_coef: previousSnapshot.params.run_aerobic_coef,
        bike_aerobic_coef: previousSnapshot.params.bike_aerobic_coef,
        swim_aerobic_coef: previousSnapshot.params.swim_aerobic_coef,
        strength_aerobic_coef: previousSnapshot.params.strength_aerobic_coef,
        w_sleep: previousSnapshot.params.w_sleep,
        w_alcohol: previousSnapshot.params.w_alcohol,
        w_stress: previousSnapshot.params.w_stress,
        parameter_confidence: parseFloat(params.parameter_confidence) * 0.8, // Reduce confidence
      };

      await this.loadModelParametersRepository.updateByUserId(userId, rollbackParams);

      this.logger.warn(
        `Rolled back parameters for user ${userId}: current MAE ${currentMae.toFixed(2)} > previous ${previousSnapshot.mae.toFixed(2)} * ${this.ROLLBACK_THRESHOLD}`,
      );

      return { rolledBack: true, reason: 'performance_degradation' };
    }

    return { rolledBack: false };
  }

  /**
   * Predict HRV z-score based on training load and journal factors
   */
  private predictHrvZscore(
    loadData: any,
    journal: RecoveryJournalEntry | null,
    params: LoadModelParameters,
  ): number {
    // Normalize TSB values
    const aerobicTsb = loadData.aerobic_tsb ? parseFloat(loadData.aerobic_tsb) : 0;
    const mskTsb = loadData.msk_tsb ? parseFloat(loadData.msk_tsb) : 0;
    const neuralTsb = loadData.neural_tsb ? parseFloat(loadData.neural_tsb) : 0;

    // Normalize to -1 to 1 range (from -25 to +25)
    const aerobicNorm = aerobicTsb / 25;
    const mskNorm = mskTsb / 25;
    const neuralNorm = neuralTsb / 25;

    // Base prediction from load
    let prediction = aerobicNorm * 0.4 + mskNorm * 0.3 + neuralNorm * 0.3;

    // Add journal factors
    if (journal) {
      const wSleep = parseFloat(params.w_sleep);
      const wAlcohol = parseFloat(params.w_alcohol);
      const wStress = parseFloat(params.w_stress);

      if (journal.sleep_quality_rating) {
        prediction += ((journal.sleep_quality_rating - 3) / 2) * wSleep;
      }

      if (journal.alcohol_units) {
        const units = parseFloat(journal.alcohol_units);
        prediction -= units * 0.2 * wAlcohol;
      }

      if (journal.stress_level) {
        prediction -= ((journal.stress_level - 5) / 5) * wStress;
      }
    }

    return prediction;
  }

  /**
   * Extract feature vector for error analysis
   */
  private extractFeatures(loadData: any, journal: RecoveryJournalEntry | null): PredictionError['features'] {
    return {
      aerobic_tsb: loadData.aerobic_tsb ? parseFloat(loadData.aerobic_tsb) : undefined,
      msk_tsb: loadData.msk_tsb ? parseFloat(loadData.msk_tsb) : undefined,
      neural_tsb: loadData.neural_tsb ? parseFloat(loadData.neural_tsb) : undefined,
      sleep_quality: journal?.sleep_quality_rating ?? undefined,
      alcohol_units: journal?.alcohol_units ? parseFloat(journal.alcohol_units) : undefined,
      stress_level: journal?.stress_level ?? undefined,
    };
  }

  /**
   * Calculate gradients using finite differences
   */
  private calculateGradients(
    errors: PredictionError[],
    params: LoadModelParameters,
  ): Partial<Record<keyof typeof LearnableParameters, number>> {
    const gradients: Partial<Record<string, number>> = {};
    const epsilon = 0.01;

    // Calculate current loss
    const lossNow = this.calculateLoss(errors, params);

    // For each learnable parameter
    for (const key of Object.keys(LearnableParameters)) {
      const currentValue = parseFloat((params as any)[key] ?? LearnableParameters[key].default);

      // Calculate loss with perturbed value
      const perturbedParams = { ...params, [key]: currentValue + epsilon };
      const lossPertured = this.calculateLoss(errors, perturbedParams as LoadModelParameters);

      // Gradient = (loss_perturbed - loss_now) / epsilon
      gradients[key] = (lossPertured - lossNow) / epsilon;
    }

    return gradients;
  }

  /**
   * Calculate MSE loss on prediction errors
   */
  private calculateLoss(errors: PredictionError[], _params: LoadModelParameters): number {
    if (errors.length === 0) return 0;

    const squaredErrors = errors.map((e) => e.error * e.error);
    return squaredErrors.reduce((a, b) => a + b, 0) / errors.length;
  }

  /**
   * Apply gradient updates with bounds and learning rates
   */
  private applyGradientUpdates(
    params: LoadModelParameters,
    gradients: Partial<Record<string, number>>,
  ): Partial<UpdateLoadModelParameters> {
    const updates: Partial<UpdateLoadModelParameters> = {};
    const confidence = parseFloat(params.parameter_confidence);

    for (const [key, config] of Object.entries(LearnableParameters)) {
      const gradient = gradients[key] || 0;
      const currentValue = parseFloat((params as any)[key] ?? config.default);

      // Scale learning rate by confidence (more confident = smaller updates)
      const effectiveLR = config.learningRate * (1 - confidence * 0.5);

      // Gradient descent update
      let newValue = currentValue - effectiveLR * gradient;

      // Clip to bounds
      newValue = Math.max(config.bounds[0], Math.min(config.bounds[1], newValue));

      (updates as any)[key] = Math.round(newValue * 100) / 100;
    }

    return updates;
  }

  /**
   * Calculate Mean Absolute Error
   */
  private calculateMAE(errors: PredictionError[]): number {
    if (errors.length === 0) return 0;

    const absoluteErrors = errors.map((e) => Math.abs(e.error));
    return absoluteErrors.reduce((a, b) => a + b, 0) / errors.length;
  }

  /**
   * Extract current parameter values for snapshot
   */
  private extractCurrentParams(params: LoadModelParameters): ParameterSnapshot['params'] {
    return {
      aerobic_ctl_decay: parseFloat(params.aerobic_ctl_decay) || DefaultLoadModelParameters.aerobic_ctl_decay,
      aerobic_atl_decay: parseFloat(params.aerobic_atl_decay) || DefaultLoadModelParameters.aerobic_atl_decay,
      msk_ctl_decay: parseFloat(params.msk_ctl_decay) || DefaultLoadModelParameters.msk_ctl_decay,
      msk_atl_decay: parseFloat(params.msk_atl_decay) || DefaultLoadModelParameters.msk_atl_decay,
      neural_ctl_decay: parseFloat(params.neural_ctl_decay) || DefaultLoadModelParameters.neural_ctl_decay,
      neural_atl_decay: parseFloat(params.neural_atl_decay) || DefaultLoadModelParameters.neural_atl_decay,
      run_aerobic_coef: parseFloat(params.run_aerobic_coef) || DefaultLoadModelParameters.run_aerobic_coef,
      bike_aerobic_coef: parseFloat(params.bike_aerobic_coef) || DefaultLoadModelParameters.bike_aerobic_coef,
      swim_aerobic_coef: parseFloat(params.swim_aerobic_coef) || DefaultLoadModelParameters.swim_aerobic_coef,
      strength_aerobic_coef:
        parseFloat(params.strength_aerobic_coef) || DefaultLoadModelParameters.strength_aerobic_coef,
      w_sleep: parseFloat(params.w_sleep) || DefaultLoadModelParameters.w_sleep,
      w_alcohol: parseFloat(params.w_alcohol) || DefaultLoadModelParameters.w_alcohol,
      w_stress: parseFloat(params.w_stress) || DefaultLoadModelParameters.w_stress,
    };
  }

  /**
   * Get parameter insights for a user
   */
  async getParameterInsights(userId: string): Promise<{
    confidence: number;
    dataPointsUsed: number;
    mae7day: number | null;
    mae30day: number | null;
    parameterDiffs: { param: string; current: number; default: number; diff: number }[];
    lastUpdateDate: Date | null;
  }> {
    const params = await this.loadModelParametersRepository.findByUserId(userId);

    if (!params) {
      return {
        confidence: 0,
        dataPointsUsed: 0,
        mae7day: null,
        mae30day: null,
        parameterDiffs: [],
        lastUpdateDate: null,
      };
    }

    const parameterDiffs: { param: string; current: number; default: number; diff: number }[] = [];

    for (const [key, config] of Object.entries(LearnableParameters)) {
      const current = parseFloat((params as any)[key] ?? config.default);
      const diff = current - config.default;

      if (Math.abs(diff) > 0.01) {
        parameterDiffs.push({
          param: key,
          current,
          default: config.default,
          diff,
        });
      }
    }

    return {
      confidence: parseFloat(params.parameter_confidence),
      dataPointsUsed: params.data_points_used,
      mae7day: params.mae_7day ? parseFloat(params.mae_7day) : null,
      mae30day: params.mae_30day ? parseFloat(params.mae_30day) : null,
      parameterDiffs,
      lastUpdateDate: params.last_update_date,
    };
  }
}

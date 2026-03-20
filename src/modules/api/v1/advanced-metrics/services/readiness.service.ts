import { Injectable, Logger } from '@nestjs/common';
import {
  DefaultLoadModelParameters,
  LimitingStream,
  LoadModelParameterValues,
  NewMultiStreamLoadDaily,
  QuickWellnessCheckin,
  RecoveryJournalEntry,
  StreamType,
} from 'src/database/interfaces';
import { formatDateToYMD } from 'src/lib/util';
import { HrvBaselineRepository } from 'src/repositories/hrv-baseline.repository';
import { LoadModelParametersRepository } from 'src/repositories/load-model-parameters.repository';
import { MultiStreamLoadRepository } from 'src/repositories/multi-stream-load.repository';
import { QuickWellnessCheckinRepository } from 'src/repositories/quick-wellness-checkin.repository';
import { RecoveryJournalRepository } from 'src/repositories/recovery-journal.repository';
import { SleepLogRepository } from 'src/repositories/sleep-log.repository';

import { SleepBaselineService } from '../../sleep/sleep-baseline.service';
import { SleepScoreService } from '../../sleep/sleep-score.service';

export interface ReadinessResult {
  date: string;
  readinessScore: number; // 0-100
  limitingFactor: string;
  limitingStream: LimitingStream;
  isHrvSuppressed: boolean;
  overrideReason: string | null;
  components: {
    aerobicContribution: number;
    mskContribution: number;
    neuralContribution: number;
    hrvContribution: number;
    journalContribution: number;
    quickWellnessContribution: number;
    sleepContribution: number; // Enhanced sleep score contribution
  };
  recommendation: ReadinessRecommendation;
}

export type SimpleRecommendation = 'push' | 'maintain' | 'recover';

export type DivergenceType = 'load_up_hrv_down' | 'load_up_recovery_down' | 'none';

export interface DivergenceAnalysis {
  hasDivergence: boolean;
  divergenceType: DivergenceType;
  severity: 'warning' | 'alert' | null;
  loadTrend: 'rising' | 'stable' | 'falling';
  hrvTrend: 'rising' | 'stable' | 'falling' | 'insufficient_data';
  daysSinceDivergence: number | null;
  message: string | null;
}

export interface ReadinessTrendPoint {
  date: string;
  compositeLoad: number; // Combined ATL normalized 0-100
  hrvZscore: number | null;
  readinessScore: number;
  simpleRecommendation: SimpleRecommendation;
}

export interface ReadinessTrendsResult {
  data: ReadinessTrendPoint[];
  divergence: DivergenceAnalysis;
  period: {
    startDate: string;
    endDate: string;
    daysWithData: number;
  };
}

export type ReadinessRecommendation =
  | 'peak_ready'
  | 'ready_for_hard'
  | 'moderate_load'
  | 'easy_day'
  | 'rest_recommended'
  | 'rest_required';

export interface ReadinessTrend {
  current: number;
  weekAvg: number;
  trend: 'improving' | 'stable' | 'declining';
  restDaysNeeded: number;
}

@Injectable()
export class ReadinessService {
  private readonly logger = new Logger(ReadinessService.name);

  constructor(
    private readonly multiStreamLoadRepository: MultiStreamLoadRepository,
    private readonly hrvBaselineRepository: HrvBaselineRepository,
    private readonly recoveryJournalRepository: RecoveryJournalRepository,
    private readonly loadModelParametersRepository: LoadModelParametersRepository,
    private readonly quickWellnessCheckinRepository: QuickWellnessCheckinRepository,
    private readonly sleepLogRepository: SleepLogRepository,
    private readonly sleepScoreService: SleepScoreService,
    private readonly sleepBaselineService: SleepBaselineService,
  ) {}

  /**
   * Calculate daily readiness score
   */
  async calculateDailyReadiness(userId: string, date: Date): Promise<ReadinessResult> {
    const targetDate = new Date(date);
    targetDate.setHours(0, 0, 0, 0);

    // Get personalized parameters
    const params = await this.loadModelParametersRepository.getParametersWithDefaults(userId);

    // Get multi-stream load data
    const loadData = await this.multiStreamLoadRepository.findByUserAndDate(userId, targetDate);

    // Get HRV baseline
    const hrvBaseline = await this.hrvBaselineRepository.findByUserAndDate(userId, targetDate);

    // Get recovery journal entry
    const journalEntry = await this.recoveryJournalRepository.findByUserAndDate(userId, targetDate);

    // Get quick wellness check-in
    const quickWellnessCheckin = await this.quickWellnessCheckinRepository.findByUserAndDate(userId, targetDate);

    // Calculate enhanced sleep contribution
    const sleepContribution = await this.calculateSleepContribution(userId, targetDate);

    // Calculate TSB contributions (normalized to 0-100)
    const aerobicTsb = loadData?.aerobic_tsb ? parseFloat(loadData.aerobic_tsb) : 0;
    const mskTsb = loadData?.msk_tsb ? parseFloat(loadData.msk_tsb) : 0;
    const neuralTsb = loadData?.neural_tsb ? parseFloat(loadData.neural_tsb) : 0;

    // Normalize TSB to 0-100 scale (TSB of -25 to +25 → 0-100)
    const aerobicContribution = this.normalizeTsb(aerobicTsb);
    const mskContribution = this.normalizeTsb(mskTsb);
    const neuralContribution = this.normalizeTsb(neuralTsb);

    // Calculate HRV contribution (based on z-score)
    const hrvZscore = hrvBaseline?.hrv_zscore ? parseFloat(hrvBaseline.hrv_zscore) : 0;
    const hrvContribution = this.normalizeHrvZscore(hrvZscore);
    const isHrvSuppressed = hrvBaseline?.is_suppressed || false;

    // Calculate journal contribution
    const journalContribution = this.calculateJournalContribution(journalEntry ?? null, params);

    // Calculate quick wellness check-in contribution
    const quickWellnessContribution = this.calculateQuickWellnessContribution(quickWellnessCheckin);

    // Weight the components - adjusted weights to include sleep contribution
    // New weights: aerobic 0.18, msk 0.15, neural 0.15, hrv 0.12, sleep 0.15, journal 0.10, quickWellness 0.15
    const hasQuickWellness = quickWellnessCheckin !== null;
    const hasSleepData = sleepContribution !== 50; // 50 is neutral/no data

    let baseReadiness: number;
    if (hasQuickWellness && hasSleepData) {
      // Full data: include all components
      baseReadiness =
        aerobicContribution * 0.18 +
        mskContribution * 0.15 +
        neuralContribution * 0.15 +
        hrvContribution * 0.12 +
        sleepContribution * 0.15 +
        journalContribution * 0.1 +
        quickWellnessContribution * 0.15;
    } else if (hasSleepData) {
      // Sleep but no quick wellness
      baseReadiness =
        aerobicContribution * 0.2 +
        mskContribution * 0.17 +
        neuralContribution * 0.17 +
        hrvContribution * 0.16 +
        sleepContribution * 0.18 +
        journalContribution * 0.12;
    } else if (hasQuickWellness) {
      // Quick wellness but no sleep
      baseReadiness =
        aerobicContribution * 0.22 +
        mskContribution * 0.18 +
        neuralContribution * 0.18 +
        hrvContribution * 0.17 +
        journalContribution * 0.1 +
        quickWellnessContribution * 0.15;
    } else {
      // Basic: no quick wellness, no sleep data
      baseReadiness =
        aerobicContribution * 0.25 +
        mskContribution * 0.2 +
        neuralContribution * 0.2 +
        hrvContribution * 0.2 +
        journalContribution * 0.15;
    }

    // Apply confidence-weighted blending with population model
    const confidence = params.parameter_confidence || 0;
    const populationReadiness = this.calculatePopulationReadiness(
      aerobicTsb,
      mskTsb,
      neuralTsb,
      hrvZscore,
      journalEntry ?? null,
    );

    let readinessScore = confidence * baseReadiness + (1 - confidence) * populationReadiness;

    // Apply HRV override if suppressed
    let overrideReason: string | null = null;
    if (isHrvSuppressed && hrvBaseline?.suppression_severity) {
      const override = this.getHrvOverride(hrvBaseline.suppression_severity);
      if (readinessScore > override.maxScore) {
        readinessScore = override.maxScore;
        overrideReason = `HRV ${hrvBaseline.suppression_severity} suppression`;
      }
    }

    // Identify limiting stream
    const limitingStream = loadData?.limiting_stream || null;
    const limitingFactor = this.identifyLimitingFactor(
      aerobicContribution,
      mskContribution,
      neuralContribution,
      hrvContribution,
      journalContribution,
      isHrvSuppressed,
      quickWellnessContribution,
      sleepContribution,
    );

    // Get recommendation
    const recommendation = this.getRecommendation(readinessScore, isHrvSuppressed);

    // Update the multi-stream load record with readiness
    if (loadData) {
      const updateData: Partial<NewMultiStreamLoadDaily> = {
        readiness_score: Math.round(readinessScore * 100) / 100,
        readiness_override_reason: overrideReason,
        limiting_stream: limitingStream,
      };
      await this.multiStreamLoadRepository.update(loadData.id, updateData);
    }

    return {
      date: formatDateToYMD(targetDate),
      readinessScore: Math.round(readinessScore * 100) / 100,
      limitingFactor,
      limitingStream,
      isHrvSuppressed,
      overrideReason,
      components: {
        aerobicContribution: Math.round(aerobicContribution * 100) / 100,
        mskContribution: Math.round(mskContribution * 100) / 100,
        neuralContribution: Math.round(neuralContribution * 100) / 100,
        hrvContribution: Math.round(hrvContribution * 100) / 100,
        journalContribution: Math.round(journalContribution * 100) / 100,
        quickWellnessContribution: Math.round(quickWellnessContribution * 100) / 100,
        sleepContribution: Math.round(sleepContribution * 100) / 100,
      },
      recommendation,
    };
  }

  /**
   * Calculate enhanced sleep contribution using SleepScoreService
   */
  private async calculateSleepContribution(userId: string, date: Date): Promise<number> {
    try {
      const sleepLogs = await this.sleepLogRepository.findByUserAndDate(userId, date);

      if (sleepLogs.length === 0) {
        // Fall back to recovery journal sleep_quality_rating if available
        const journalEntry = await this.recoveryJournalRepository.findByUserAndDate(userId, date);
        if (journalEntry?.sleep_quality_rating) {
          // Convert 1-5 rating to 0-100 scale
          return ((journalEntry.sleep_quality_rating - 1) / 4) * 100;
        }
        return 50; // Neutral if no sleep data
      }

      // Find primary log (prefer wearable over manual)
      const primaryLog = sleepLogs.find((l) => l.source !== 'manual') || sleepLogs[0];

      // Get baseline for enhanced scoring
      const baseline = await this.sleepBaselineService.getOrCalculateBaseline(userId, date);

      // Compute enhanced score
      const scoreResult = this.sleepScoreService.computeEnhancedScore(primaryLog, baseline);

      return scoreResult.score;
    } catch (error) {
      this.logger.warn(`Failed to calculate sleep contribution for user ${userId}: ${error}`);
      return 50; // Neutral on error
    }
  }

  /**
   * Get latest readiness data
   */
  async getLatest(userId: string): Promise<ReadinessResult | null> {
    const latest = await this.multiStreamLoadRepository.getLatestForUser(userId);
    if (!latest || !latest.readiness_score) return null;

    // Reconstruct the result from stored data
    const hrvBaseline = await this.hrvBaselineRepository.findByUserAndDate(userId, latest.date);
    const journalEntry = await this.recoveryJournalRepository.findByUserAndDate(userId, latest.date);
    const params = await this.loadModelParametersRepository.getParametersWithDefaults(userId);

    const aerobicTsb = latest.aerobic_tsb ? parseFloat(latest.aerobic_tsb) : 0;
    const mskTsb = latest.msk_tsb ? parseFloat(latest.msk_tsb) : 0;
    const neuralTsb = latest.neural_tsb ? parseFloat(latest.neural_tsb) : 0;
    const hrvZscore = hrvBaseline?.hrv_zscore ? parseFloat(hrvBaseline.hrv_zscore) : 0;

    const aerobicContribution = this.normalizeTsb(aerobicTsb);
    const mskContribution = this.normalizeTsb(mskTsb);
    const neuralContribution = this.normalizeTsb(neuralTsb);
    const hrvContribution = this.normalizeHrvZscore(hrvZscore);
    const journalContribution = this.calculateJournalContribution(journalEntry || null, params);

    // Get quick wellness check-in for this date
    const quickWellnessCheckin = await this.quickWellnessCheckinRepository.findByUserAndDate(userId, latest.date);
    const quickWellnessContribution = this.calculateQuickWellnessContribution(quickWellnessCheckin);

    // Calculate sleep contribution
    const sleepContribution = await this.calculateSleepContribution(userId, latest.date);

    const readinessScore = parseFloat(latest.readiness_score);
    const isHrvSuppressed = hrvBaseline?.is_suppressed || false;

    return {
      date: formatDateToYMD(latest.date),
      readinessScore,
      limitingFactor: this.identifyLimitingFactor(
        aerobicContribution,
        mskContribution,
        neuralContribution,
        hrvContribution,
        journalContribution,
        isHrvSuppressed,
        quickWellnessContribution,
        sleepContribution,
      ),
      limitingStream: latest.limiting_stream,
      isHrvSuppressed,
      overrideReason: latest.readiness_override_reason || null,
      components: {
        aerobicContribution,
        mskContribution,
        neuralContribution,
        hrvContribution,
        journalContribution,
        quickWellnessContribution,
        sleepContribution,
      },
      recommendation: this.getRecommendation(readinessScore, isHrvSuppressed),
    };
  }

  /**
   * Get readiness trend
   */
  async getTrend(userId: string, days: number = 7): Promise<ReadinessTrend> {
    const history = await this.multiStreamLoadRepository.getDateRange(userId, days);

    if (history.length === 0) {
      return {
        current: 50,
        weekAvg: 50,
        trend: 'stable',
        restDaysNeeded: 0,
      };
    }

    const latest = history[history.length - 1];
    const current = latest.readiness_score ? parseFloat(latest.readiness_score) : 50;

    const scores = history.filter((h) => h.readiness_score).map((h) => parseFloat(h.readiness_score!));
    const weekAvg = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 50;

    // Determine trend
    let trend: ReadinessTrend['trend'] = 'stable';
    if (scores.length >= 3) {
      const recentAvg = scores.slice(-3).reduce((a, b) => a + b, 0) / 3;
      const olderAvg = scores.slice(0, -3).reduce((a, b) => a + b, 0) / Math.max(1, scores.length - 3);
      if (recentAvg > olderAvg + 5) trend = 'improving';
      else if (recentAvg < olderAvg - 5) trend = 'declining';
    }

    // Estimate rest days needed based on current readiness
    let restDaysNeeded = 0;
    if (current < 30) restDaysNeeded = 2;
    else if (current < 50) restDaysNeeded = 1;

    return { current, weekAvg, trend, restDaysNeeded };
  }

  /**
   * Normalize TSB to 0-100 scale
   * TSB of -25 → 0, TSB of 0 → 50, TSB of +25 → 100
   */
  private normalizeTsb(tsb: number): number {
    const normalized = ((tsb + 25) / 50) * 100;
    return Math.max(0, Math.min(100, normalized));
  }

  /**
   * Normalize HRV z-score to 0-100 scale
   * z-score of -2 → 0, z-score of 0 → 50, z-score of +2 → 100
   */
  private normalizeHrvZscore(zscore: number): number {
    const normalized = ((zscore + 2) / 4) * 100;
    return Math.max(0, Math.min(100, normalized));
  }

  /**
   * Calculate journal contribution to readiness
   */
  private calculateJournalContribution(entry: RecoveryJournalEntry | null, params: LoadModelParameterValues): number {
    if (!entry) {
      return 50; // Neutral if no journal
    }

    let score = 50;

    // Sleep quality (1-5 → -20 to +20)
    if (entry.sleep_quality_rating) {
      score += (entry.sleep_quality_rating - 3) * 10 * params.w_sleep;
    }

    // Perceived recovery (1-10 → weighted)
    if (entry.perceived_recovery) {
      score += (entry.perceived_recovery - 5) * 5;
    }

    // Muscle soreness (1-10, inverted)
    if (entry.muscle_soreness) {
      score -= (entry.muscle_soreness - 5) * 3;
    }

    // Energy level (1-10)
    if (entry.energy_level) {
      score += (entry.energy_level - 5) * 3;
    }

    // Stress level (1-10, inverted with weight)
    if (entry.stress_level) {
      score -= (entry.stress_level - 5) * 5 * params.w_stress;
    }

    // Alcohol units (negative impact)
    if (entry.alcohol_units) {
      const units = parseFloat(entry.alcohol_units);
      score -= units * 5 * params.w_alcohol;
    }

    return Math.max(0, Math.min(100, score));
  }

  /**
   * Calculate quick wellness check-in contribution to readiness
   * All values are on 1-5 scale, with some inverted (soreness, stress)
   */
  private calculateQuickWellnessContribution(checkin: QuickWellnessCheckin | null | undefined): number {
    if (!checkin) {
      return 50; // Neutral if no check-in
    }

    const values: number[] = [];

    // Sleep quality (1-5: 1=poor, 5=excellent)
    if (checkin.sleep_quality) values.push(checkin.sleep_quality);

    // Energy level (1-5: 1=exhausted, 5=energized)
    if (checkin.energy_level) values.push(checkin.energy_level);

    // Muscle soreness (1-5 inverted: 1=very sore, 5=no soreness)
    if (checkin.muscle_soreness) values.push(checkin.muscle_soreness);

    // Stress level (1-5 inverted: 1=very stressed, 5=relaxed)
    if (checkin.stress_level) values.push(checkin.stress_level);

    // Training readiness (1-5: 1=not ready, 5=very ready)
    if (checkin.training_readiness) values.push(checkin.training_readiness);

    if (values.length === 0) {
      return 50; // Neutral if all values are null
    }

    // Average of all values, scaled from 1-5 to 0-100
    const average = values.reduce((a, b) => a + b, 0) / values.length;
    return ((average - 1) / 4) * 100;
  }

  /**
   * Calculate population-based readiness (for cold start)
   */
  private calculatePopulationReadiness(
    aerobicTsb: number,
    mskTsb: number,
    neuralTsb: number,
    hrvZscore: number,
    journalEntry: RecoveryJournalEntry | null,
  ): number {
    // Use default weights
    const aerobic = this.normalizeTsb(aerobicTsb) * 0.3;
    const msk = this.normalizeTsb(mskTsb) * 0.25;
    const neural = this.normalizeTsb(neuralTsb) * 0.2;
    const hrv = this.normalizeHrvZscore(hrvZscore) * 0.15;
    const journal = this.calculateJournalContribution(journalEntry, DefaultLoadModelParameters) * 0.1;

    return aerobic + msk + neural + hrv + journal;
  }

  /**
   * Get HRV override limits based on suppression severity
   */
  private getHrvOverride(severity: string): { maxScore: number } {
    switch (severity) {
      case 'severe':
        return { maxScore: 30 };
      case 'moderate':
        return { maxScore: 50 };
      case 'mild':
        return { maxScore: 70 };
      default:
        return { maxScore: 100 };
    }
  }

  /**
   * Identify the most limiting factor
   */
  private identifyLimitingFactor(
    aerobicContribution: number,
    mskContribution: number,
    neuralContribution: number,
    hrvContribution: number,
    journalContribution: number,
    isHrvSuppressed: boolean,
    quickWellnessContribution: number = 50,
    sleepContribution: number = 50,
  ): string {
    if (isHrvSuppressed) {
      return 'HRV Suppression';
    }

    const factors = [
      { name: 'Aerobic Fatigue', value: aerobicContribution },
      { name: 'Musculoskeletal Fatigue', value: mskContribution },
      { name: 'Neural/CNS Fatigue', value: neuralContribution },
      { name: 'HRV Status', value: hrvContribution },
      { name: 'Subjective Recovery', value: journalContribution },
      { name: 'Quick Wellness', value: quickWellnessContribution },
      { name: 'Sleep Quality', value: sleepContribution },
    ];

    const minFactor = factors.reduce((min, f) => (f.value < min.value ? f : min), factors[0]);
    return minFactor.value < 40 ? minFactor.name : 'None';
  }

  /**
   * Get training recommendation based on readiness score
   */
  private getRecommendation(readinessScore: number, isHrvSuppressed: boolean): ReadinessRecommendation {
    if (isHrvSuppressed) {
      return 'rest_recommended';
    }

    if (readinessScore >= 85) return 'peak_ready';
    if (readinessScore >= 70) return 'ready_for_hard';
    if (readinessScore >= 55) return 'moderate_load';
    if (readinessScore >= 40) return 'easy_day';
    if (readinessScore >= 25) return 'rest_recommended';
    return 'rest_required';
  }

  /**
   * Get readiness for a specific date (used by API)
   */
  async getReadinessForDate(
    userId: string,
    date: Date,
  ): Promise<{
    readinessScore: number;
    hrvZscore: number | null;
    aerobicTsb: number;
    mskTsb: number;
    neuralTsb: number;
    limitingFactor: string | null;
    hrvOverride: boolean;
    journalContribution: number | null;
  }> {
    const targetDate = new Date(date);
    targetDate.setHours(0, 0, 0, 0);

    // Get multi-stream load data
    const loadData = await this.multiStreamLoadRepository.findByUserAndDate(userId, targetDate);

    // Get HRV baseline
    const hrvBaseline = await this.hrvBaselineRepository.findByUserAndDate(userId, targetDate);

    // Get recovery journal entry
    const journalEntry = await this.recoveryJournalRepository.findByUserAndDate(userId, targetDate);
    const params = await this.loadModelParametersRepository.getParametersWithDefaults(userId);

    const aerobicTsb = loadData?.aerobic_tsb ? parseFloat(loadData.aerobic_tsb) : 0;
    const mskTsb = loadData?.msk_tsb ? parseFloat(loadData.msk_tsb) : 0;
    const neuralTsb = loadData?.neural_tsb ? parseFloat(loadData.neural_tsb) : 0;
    const hrvZscore = hrvBaseline?.hrv_zscore ? parseFloat(hrvBaseline.hrv_zscore) : null;

    let readinessScore = loadData?.readiness_score ? parseFloat(loadData.readiness_score) : 50;
    const hrvOverride = !!loadData?.readiness_override_reason;
    const journalContribution = journalEntry ? this.calculateJournalContribution(journalEntry, params) : null;

    // Identify limiting factor
    let limitingFactor: string | null = null;
    if (loadData?.limiting_stream) {
      const streamMap: Record<string, string> = {
        aerobic: 'aerobic',
        msk: 'msk',
        neural: 'neural',
      };
      limitingFactor = streamMap[loadData.limiting_stream] || null;
    } else if (hrvBaseline?.is_suppressed) {
      limitingFactor = 'hrv';
    }

    return {
      readinessScore,
      hrvZscore,
      aerobicTsb,
      mskTsb,
      neuralTsb,
      limitingFactor,
      hrvOverride,
      journalContribution,
    };
  }

  /**
   * Get readiness history (used by API)
   */
  async getReadinessHistory(
    userId: string,
    days: number = 30,
  ): Promise<
    Array<{
      date: string;
      readinessScore: number;
      hrvZscore: number | null;
      aerobicTsb: number;
      mskTsb: number;
      neuralTsb: number;
      limitingFactor: string | null;
      hrvOverride: boolean;
      journalContribution: number | null;
    }>
  > {
    const loads = await this.multiStreamLoadRepository.getDateRange(userId, days);
    const params = await this.loadModelParametersRepository.getParametersWithDefaults(userId);

    const results = [];
    for (const load of loads) {
      const hrvBaseline = await this.hrvBaselineRepository.findByUserAndDate(userId, load.date);
      const journalEntry = await this.recoveryJournalRepository.findByUserAndDate(userId, load.date);

      const aerobicTsb = load.aerobic_tsb ? parseFloat(load.aerobic_tsb) : 0;
      const mskTsb = load.msk_tsb ? parseFloat(load.msk_tsb) : 0;
      const neuralTsb = load.neural_tsb ? parseFloat(load.neural_tsb) : 0;
      const hrvZscore = hrvBaseline?.hrv_zscore ? parseFloat(hrvBaseline.hrv_zscore) : null;
      const readinessScore = load.readiness_score ? parseFloat(load.readiness_score) : 50;

      let limitingFactor: string | null = null;
      if (load.limiting_stream) {
        const streamMap: Record<string, string> = {
          aerobic: 'aerobic',
          msk: 'msk',
          neural: 'neural',
        };
        limitingFactor = streamMap[load.limiting_stream] || null;
      } else if (hrvBaseline?.is_suppressed) {
        limitingFactor = 'hrv';
      }

      results.push({
        date: formatDateToYMD(load.date),
        readinessScore,
        hrvZscore,
        aerobicTsb,
        mskTsb,
        neuralTsb,
        limitingFactor,
        hrvOverride: !!load.readiness_override_reason,
        journalContribution: journalEntry ? this.calculateJournalContribution(journalEntry, params) : null,
      });
    }

    return results;
  }

  /**
   * Get simple recommendation (push/maintain/recover) based on readiness score and HRV status
   */
  getSimpleRecommendation(
    readinessScore: number,
    isHrvSuppressed: boolean,
    suppressionSeverity: string | null,
    hasDivergenceAlert: boolean,
  ): SimpleRecommendation {
    // Recover: readiness < 50 OR HRV suppressed (moderate/severe) OR divergence alert
    if (readinessScore < 50) {
      return 'recover';
    }

    if (isHrvSuppressed && (suppressionSeverity === 'moderate' || suppressionSeverity === 'severe')) {
      return 'recover';
    }

    if (hasDivergenceAlert) {
      return 'recover';
    }

    // Push: readiness ≥ 70 AND no HRV suppression (moderate/severe)
    if (readinessScore >= 70) {
      if (!isHrvSuppressed || suppressionSeverity === 'mild') {
        return 'push';
      }
    }

    // Maintain: everything else
    return 'maintain';
  }

  /**
   * Get divergence analysis - detects when load trend and HRV trend diverge
   */
  async getDivergenceAnalysis(userId: string, days: number = 14): Promise<DivergenceAnalysis> {
    const loads = await this.multiStreamLoadRepository.getDateRange(userId, days);

    // Insufficient data check
    if (loads.length < 7) {
      return {
        hasDivergence: false,
        divergenceType: 'none',
        severity: null,
        loadTrend: 'stable',
        hrvTrend: 'insufficient_data',
        daysSinceDivergence: null,
        message: loads.length === 0 ? 'No data available' : `Need ${7 - loads.length} more days of data`,
      };
    }

    // Get HRV data for the same period
    const hrvData: Array<{ date: string; hrvZscore: number | null }> = [];
    for (const load of loads) {
      const hrvBaseline = await this.hrvBaselineRepository.findByUserAndDate(userId, load.date);
      hrvData.push({
        date: formatDateToYMD(load.date),
        hrvZscore: hrvBaseline?.hrv_zscore ? parseFloat(hrvBaseline.hrv_zscore) : null,
      });
    }

    // Calculate composite load (combined ATL from all streams, normalized to 0-100)
    const loadDataWithComposite = loads.map((load) => {
      const aerobicAtl = load.aerobic_atl ? parseFloat(load.aerobic_atl) : 0;
      const mskAtl = load.msk_atl ? parseFloat(load.msk_atl) : 0;
      const neuralAtl = load.neural_atl ? parseFloat(load.neural_atl) : 0;
      // Average ATL across streams, normalized (ATL typically 0-100+)
      const compositeLoad = Math.min(100, (aerobicAtl + mskAtl + neuralAtl) / 3);
      return {
        date: formatDateToYMD(load.date),
        compositeLoad,
      };
    });

    // Calculate 7-day rolling averages for load
    const calculateRollingAvg = (data: number[], windowSize: number = 7): number[] => {
      const result: number[] = [];
      for (let i = 0; i < data.length; i++) {
        const start = Math.max(0, i - windowSize + 1);
        const window = data.slice(start, i + 1);
        result.push(window.reduce((a, b) => a + b, 0) / window.length);
      }
      return result;
    };

    const compositeLoads = loadDataWithComposite.map((d) => d.compositeLoad);
    const loadRollingAvg = calculateRollingAvg(compositeLoads);

    // Calculate load trend: compare recent 7-day avg to earlier 7-day avg
    const recentLoadAvg = loadRollingAvg[loadRollingAvg.length - 1] || 0;
    const earlierLoadAvg = loadRollingAvg[Math.max(0, loadRollingAvg.length - 8)] || recentLoadAvg;
    const loadChangePercent = earlierLoadAvg > 0 ? ((recentLoadAvg - earlierLoadAvg) / earlierLoadAvg) * 100 : 0;

    let loadTrend: DivergenceAnalysis['loadTrend'] = 'stable';
    if (loadChangePercent > 10) {
      loadTrend = 'rising';
    } else if (loadChangePercent < -10) {
      loadTrend = 'falling';
    }

    // Calculate HRV trend
    const validHrvData = hrvData.filter((d) => d.hrvZscore !== null);
    if (validHrvData.length < 7) {
      return {
        hasDivergence: false,
        divergenceType: 'none',
        severity: null,
        loadTrend,
        hrvTrend: 'insufficient_data',
        daysSinceDivergence: null,
        message: 'Insufficient HRV data for trend analysis',
      };
    }

    const hrvZscores = validHrvData.map((d) => d.hrvZscore!);
    const hrvRollingAvg = calculateRollingAvg(hrvZscores);

    const recentHrvAvg = hrvRollingAvg[hrvRollingAvg.length - 1] || 0;
    const earlierHrvAvg = hrvRollingAvg[Math.max(0, hrvRollingAvg.length - 8)] || recentHrvAvg;
    const hrvChange = recentHrvAvg - earlierHrvAvg;

    let hrvTrend: DivergenceAnalysis['hrvTrend'] = 'stable';
    if (hrvChange > 0.3) {
      hrvTrend = 'rising';
    } else if (hrvChange < -0.5) {
      hrvTrend = 'falling';
    }

    // Detect divergence: load rising + HRV falling
    const hasDivergence = loadTrend === 'rising' && hrvTrend === 'falling';

    if (!hasDivergence) {
      return {
        hasDivergence: false,
        divergenceType: 'none',
        severity: null,
        loadTrend,
        hrvTrend,
        daysSinceDivergence: null,
        message: null,
      };
    }

    // Calculate days since divergence started
    // Look backwards to find when the divergence pattern began
    let daysSinceDivergence = 0;
    for (let i = loads.length - 1; i >= 0 && daysSinceDivergence < loads.length; i--) {
      const currentIdx = i;
      const windowStart = Math.max(0, currentIdx - 6);

      // Check if load was rising at this point
      const windowLoads = compositeLoads.slice(windowStart, currentIdx + 1);
      const windowFirstHalf = windowLoads.slice(0, Math.floor(windowLoads.length / 2));
      const windowSecondHalf = windowLoads.slice(Math.floor(windowLoads.length / 2));
      const firstHalfAvg =
        windowFirstHalf.length > 0 ? windowFirstHalf.reduce((a, b) => a + b, 0) / windowFirstHalf.length : 0;
      const secondHalfAvg =
        windowSecondHalf.length > 0 ? windowSecondHalf.reduce((a, b) => a + b, 0) / windowSecondHalf.length : 0;
      const loadWasRising = secondHalfAvg > firstHalfAvg * 1.05;

      // Check if HRV was falling at this point
      const windowHrv = hrvZscores.slice(windowStart, currentIdx + 1);
      const firstHalfHrv = windowHrv.slice(0, Math.floor(windowHrv.length / 2));
      const secondHalfHrv = windowHrv.slice(Math.floor(windowHrv.length / 2));
      const firstHalfHrvAvg =
        firstHalfHrv.length > 0 ? firstHalfHrv.reduce((a, b) => a + b, 0) / firstHalfHrv.length : 0;
      const secondHalfHrvAvg =
        secondHalfHrv.length > 0 ? secondHalfHrv.reduce((a, b) => a + b, 0) / secondHalfHrv.length : 0;
      const hrvWasFalling = secondHalfHrvAvg < firstHalfHrvAvg - 0.3;

      if (loadWasRising && hrvWasFalling) {
        daysSinceDivergence++;
      } else {
        break;
      }
    }

    // Determine severity based on days
    let severity: DivergenceAnalysis['severity'] = null;
    let message: string | null = null;

    if (daysSinceDivergence >= 5) {
      severity = 'alert';
      message = `Training load rising while HRV declining for ${daysSinceDivergence} days. Consider reducing training intensity.`;
    } else if (daysSinceDivergence >= 3) {
      severity = 'warning';
      message = `Training load rising while HRV declining for ${daysSinceDivergence} days. Monitor recovery closely.`;
    }

    return {
      hasDivergence: true,
      divergenceType: 'load_up_hrv_down',
      severity,
      loadTrend,
      hrvTrend,
      daysSinceDivergence,
      message,
    };
  }

  /**
   * Get readiness trends with divergence analysis
   */
  async getReadinessTrends(userId: string, days: number = 14): Promise<ReadinessTrendsResult> {
    const loads = await this.multiStreamLoadRepository.getDateRange(userId, days);
    const divergence = await this.getDivergenceAnalysis(userId, days);
    const hasDivergenceAlert = divergence.severity === 'alert';

    const trendPoints: ReadinessTrendPoint[] = [];

    for (const load of loads) {
      const hrvBaseline = await this.hrvBaselineRepository.findByUserAndDate(userId, load.date);
      const hrvZscore = hrvBaseline?.hrv_zscore ? parseFloat(hrvBaseline.hrv_zscore) : null;
      const isHrvSuppressed = hrvBaseline?.is_suppressed || false;
      const suppressionSeverity = hrvBaseline?.suppression_severity || null;

      // Calculate composite load (combined ATL, normalized to 0-100)
      const aerobicAtl = load.aerobic_atl ? parseFloat(load.aerobic_atl) : 0;
      const mskAtl = load.msk_atl ? parseFloat(load.msk_atl) : 0;
      const neuralAtl = load.neural_atl ? parseFloat(load.neural_atl) : 0;
      const compositeLoad = Math.min(100, Math.round(((aerobicAtl + mskAtl + neuralAtl) / 3) * 100) / 100);

      const readinessScore = load.readiness_score ? parseFloat(load.readiness_score) : 50;

      const simpleRecommendation = this.getSimpleRecommendation(
        readinessScore,
        isHrvSuppressed,
        suppressionSeverity,
        hasDivergenceAlert,
      );

      trendPoints.push({
        date: formatDateToYMD(load.date),
        compositeLoad,
        hrvZscore,
        readinessScore,
        simpleRecommendation,
      });
    }

    // Calculate period info
    const datesWithData = trendPoints.map((p) => p.date);
    const startDate = datesWithData.length > 0 ? datesWithData[0] : formatDateToYMD(new Date());
    const endDate = datesWithData.length > 0 ? datesWithData[datesWithData.length - 1] : formatDateToYMD(new Date());

    return {
      data: trendPoints,
      divergence,
      period: {
        startDate,
        endDate,
        daysWithData: trendPoints.length,
      },
    };
  }
}

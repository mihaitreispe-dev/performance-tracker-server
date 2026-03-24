import { Injectable, Logger } from '@nestjs/common';
import {
  DefaultLoadModelParameters,
  IllnessType,
  LimitingStream,
  LoadModelParameterValues,
  NewMultiStreamLoadDaily,
  QuickWellnessCheckin,
  RecoveryJournalEntry,
} from 'src/database/interfaces';
import { formatDateToYMD } from 'src/lib/util';
import { FitnessFatigueRepository } from 'src/repositories/fitness-fatigue.repository';
import { HrvBaselineRepository } from 'src/repositories/hrv-baseline.repository';
import { IllnessLogRepository } from 'src/repositories/illness-log.repository';
import { LoadModelParametersRepository } from 'src/repositories/load-model-parameters.repository';
import { MultiStreamLoadRepository } from 'src/repositories/multi-stream-load.repository';
import { QuickWellnessCheckinRepository } from 'src/repositories/quick-wellness-checkin.repository';
import { RecoveryJournalRepository } from 'src/repositories/recovery-journal.repository';
import { SleepLogRepository } from 'src/repositories/sleep-log.repository';

import { SleepBaselineService } from '../../sleep/sleep-baseline.service';
import { SleepScoreService } from '../../sleep/sleep-score.service';
import { HrvBaselineService } from './hrv-baseline.service';

// ==========================================
// Enhanced Readiness Types (v2)
// ==========================================

export interface RecoveryBlockScores {
  sleepScore: number;
  nocturnalHrvScore: number;
  rhrDeltaScore: number;
  hrNadirScore: number;
  blockScore: number;
  weight: number;
}

export interface LoadBlockScores {
  aerobicTsbScore: number;
  mskTsbScore: number;
  neuralTsbScore: number;
  monotonyPenalty: number;
  strainPenalty: number;
  blockScore: number;
  weight: number;
}

export interface SubjectiveBlockScores {
  quickWellnessScore: number;
  journalScore: number;
  blockScore: number;
  weight: number;
}

export interface IllnessBlockScores {
  alcoholPenalty: number;
  illnessOverride: boolean;
  illnessSeverity: number | null;
  blockScore: number;
  weight: number;
}

export interface ReadinessComponentScores {
  recovery: RecoveryBlockScores;
  load: LoadBlockScores;
  subjective: SubjectiveBlockScores;
  illness: IllnessBlockScores;
}

export interface ReadinessConfidence {
  overall: number; // 0-1
  dataCompleteness: number; // % of data present
  baselineQuality: number; // quality of baseline data
}

export type DataQualityLevel = 'excellent' | 'good' | 'fair' | 'poor' | 'minimal';

export interface EnhancedReadinessResult extends ReadinessResult {
  confidence: ReadinessConfidence;
  componentScores: ReadinessComponentScores;
  dataQuality: DataQualityLevel;
  version: number;
}

// Base weight configuration (mid-range of research recommendations)
const BASE_WEIGHTS = {
  recovery: 0.5, // 45-55%
  load: 0.3, // 25-35%
  subjective: 0.15, // 10-20%
  illness: 0.05, // 5-15%
};

// ==========================================
// Legacy Readiness Types (v1)
// ==========================================

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
    private readonly fitnessFatigueRepository: FitnessFatigueRepository,
    private readonly illnessLogRepository: IllnessLogRepository,
    private readonly hrvBaselineService: HrvBaselineService,
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
    const aerobicTsb = loadData?.aerobic_tsb ? Number.parseFloat(loadData.aerobic_tsb) : 0;
    const mskTsb = loadData?.msk_tsb ? Number.parseFloat(loadData.msk_tsb) : 0;
    const neuralTsb = loadData?.neural_tsb ? Number.parseFloat(loadData.neural_tsb) : 0;

    // Normalize TSB to 0-100 scale (TSB of -25 to +25 → 0-100)
    const aerobicContribution = this.normalizeTsb(aerobicTsb);
    const mskContribution = this.normalizeTsb(mskTsb);
    const neuralContribution = this.normalizeTsb(neuralTsb);

    // Calculate HRV contribution (based on z-score)
    const hrvZscore = hrvBaseline?.hrv_zscore ? Number.parseFloat(hrvBaseline.hrv_zscore) : 0;
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

    const aerobicTsb = latest.aerobic_tsb ? Number.parseFloat(latest.aerobic_tsb) : 0;
    const mskTsb = latest.msk_tsb ? Number.parseFloat(latest.msk_tsb) : 0;
    const neuralTsb = latest.neural_tsb ? Number.parseFloat(latest.neural_tsb) : 0;
    const hrvZscore = hrvBaseline?.hrv_zscore ? Number.parseFloat(hrvBaseline.hrv_zscore) : 0;

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

    const readinessScore = Number.parseFloat(latest.readiness_score);
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
    const current = latest.readiness_score ? Number.parseFloat(latest.readiness_score) : 50;

    const scores = history.filter((h) => h.readiness_score).map((h) => Number.parseFloat(h.readiness_score!));
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
      const units = Number.parseFloat(entry.alcohol_units);
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

    const aerobicTsb = loadData?.aerobic_tsb ? Number.parseFloat(loadData.aerobic_tsb) : 0;
    const mskTsb = loadData?.msk_tsb ? Number.parseFloat(loadData.msk_tsb) : 0;
    const neuralTsb = loadData?.neural_tsb ? Number.parseFloat(loadData.neural_tsb) : 0;
    const hrvZscore = hrvBaseline?.hrv_zscore ? Number.parseFloat(hrvBaseline.hrv_zscore) : null;

    const readinessScore = loadData?.readiness_score ? Number.parseFloat(loadData.readiness_score) : 50;
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

      const aerobicTsb = load.aerobic_tsb ? Number.parseFloat(load.aerobic_tsb) : 0;
      const mskTsb = load.msk_tsb ? Number.parseFloat(load.msk_tsb) : 0;
      const neuralTsb = load.neural_tsb ? Number.parseFloat(load.neural_tsb) : 0;
      const hrvZscore = hrvBaseline?.hrv_zscore ? Number.parseFloat(hrvBaseline.hrv_zscore) : null;
      const readinessScore = load.readiness_score ? Number.parseFloat(load.readiness_score) : 50;

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
        hrvZscore: hrvBaseline?.hrv_zscore ? Number.parseFloat(hrvBaseline.hrv_zscore) : null,
      });
    }

    // Calculate composite load (combined ATL from all streams, normalized to 0-100)
    const loadDataWithComposite = loads.map((load) => {
      const aerobicAtl = load.aerobic_atl ? Number.parseFloat(load.aerobic_atl) : 0;
      const mskAtl = load.msk_atl ? Number.parseFloat(load.msk_atl) : 0;
      const neuralAtl = load.neural_atl ? Number.parseFloat(load.neural_atl) : 0;
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
      const hrvZscore = hrvBaseline?.hrv_zscore ? Number.parseFloat(hrvBaseline.hrv_zscore) : null;
      const isHrvSuppressed = hrvBaseline?.is_suppressed || false;
      const suppressionSeverity = hrvBaseline?.suppression_severity || null;

      // Calculate composite load (combined ATL, normalized to 0-100)
      const aerobicAtl = load.aerobic_atl ? Number.parseFloat(load.aerobic_atl) : 0;
      const mskAtl = load.msk_atl ? Number.parseFloat(load.msk_atl) : 0;
      const neuralAtl = load.neural_atl ? Number.parseFloat(load.neural_atl) : 0;
      const compositeLoad = Math.min(100, Math.round(((aerobicAtl + mskAtl + neuralAtl) / 3) * 100) / 100);

      const readinessScore = load.readiness_score ? Number.parseFloat(load.readiness_score) : 50;

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

  // ==========================================
  // Enhanced Readiness (v2) Implementation
  // ==========================================

  /**
   * Calculate enhanced daily readiness score (v2)
   * Uses research-backed 4-block structure with proper weight distribution
   */
  async calculateEnhancedReadiness(userId: string, date: Date): Promise<EnhancedReadinessResult> {
    const targetDate = new Date(date);
    targetDate.setHours(0, 0, 0, 0);

    // Get personalized parameters
    const params = await this.loadModelParametersRepository.getParametersWithDefaults(userId);

    // Get all required data
    const loadData = await this.multiStreamLoadRepository.findByUserAndDate(userId, targetDate);
    const hrvBaseline = await this.hrvBaselineRepository.findByUserAndDate(userId, targetDate);
    const journalEntry = await this.recoveryJournalRepository.findByUserAndDate(userId, targetDate);
    const quickWellnessCheckin = await this.quickWellnessCheckinRepository.findByUserAndDate(userId, targetDate);
    const fitnessFatigueData = await this.fitnessFatigueRepository.findByUserAndDate(userId, targetDate);

    // Calculate each block
    const recoveryBlock = await this.calculateRecoveryBlock(userId, targetDate, hrvBaseline);
    const loadBlock = await this.calculateLoadBlock(loadData, fitnessFatigueData);
    const subjectiveBlock = this.calculateSubjectiveBlock(quickWellnessCheckin, journalEntry, params);
    const illnessBlock = await this.calculateIllnessBehaviorBlock(userId, journalEntry);

    // Calculate dynamic weights based on data availability
    const weights = this.calculateDynamicWeights(recoveryBlock, loadBlock, subjectiveBlock, illnessBlock);

    // Update block weights
    recoveryBlock.weight = weights.recovery;
    loadBlock.weight = weights.load;
    subjectiveBlock.weight = weights.subjective;
    illnessBlock.weight = weights.illness;

    // Calculate weighted readiness score
    let readinessScore =
      recoveryBlock.blockScore * weights.recovery +
      loadBlock.blockScore * weights.load +
      subjectiveBlock.blockScore * weights.subjective +
      illnessBlock.blockScore * weights.illness;

    // Apply illness override caps
    if (illnessBlock.illnessOverride) {
      const severity = illnessBlock.illnessSeverity ?? 0;
      if (severity >= 6) {
        readinessScore = Math.min(readinessScore, 40);
      } else if (severity >= 3) {
        readinessScore = Math.min(readinessScore, 60);
      }
    }

    // Apply HRV suppression override
    const isHrvSuppressed = hrvBaseline?.is_suppressed || false;
    let overrideReason: string | null = null;
    if (isHrvSuppressed && hrvBaseline?.suppression_severity) {
      const override = this.getHrvOverride(hrvBaseline.suppression_severity);
      if (readinessScore > override.maxScore) {
        readinessScore = override.maxScore;
        overrideReason = `HRV ${hrvBaseline.suppression_severity} suppression`;
      }
    }

    // Calculate confidence
    const confidence = this.calculateConfidence(
      recoveryBlock,
      loadBlock,
      subjectiveBlock,
      illnessBlock,
      hrvBaseline !== null,
      loadData !== null,
    );

    // Determine data quality level
    const dataQuality = this.getDataQualityLevel(confidence.dataCompleteness);

    // Identify limiting factor
    const limitingStream = loadData?.limiting_stream || null;
    const limitingFactor = this.identifyEnhancedLimitingFactor(recoveryBlock, loadBlock, subjectiveBlock, illnessBlock);

    // Get recommendation
    const recommendation = this.getRecommendation(readinessScore, isHrvSuppressed);

    // Build legacy components for backwards compatibility
    const aerobicTsb = loadData?.aerobic_tsb ? Number.parseFloat(loadData.aerobic_tsb) : 0;
    const mskTsb = loadData?.msk_tsb ? Number.parseFloat(loadData.msk_tsb) : 0;
    const neuralTsb = loadData?.neural_tsb ? Number.parseFloat(loadData.neural_tsb) : 0;
    const hrvZscore = hrvBaseline?.hrv_zscore ? Number.parseFloat(hrvBaseline.hrv_zscore) : 0;

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
      // Legacy fields
      date: formatDateToYMD(targetDate),
      readinessScore: Math.round(readinessScore * 100) / 100,
      limitingFactor,
      limitingStream,
      isHrvSuppressed,
      overrideReason,
      components: {
        aerobicContribution: this.normalizeTsb(aerobicTsb),
        mskContribution: this.normalizeTsb(mskTsb),
        neuralContribution: this.normalizeTsb(neuralTsb),
        hrvContribution: this.normalizeHrvZscore(hrvZscore),
        journalContribution: subjectiveBlock.journalScore,
        quickWellnessContribution: subjectiveBlock.quickWellnessScore,
        sleepContribution: recoveryBlock.sleepScore,
      },
      recommendation,
      // Enhanced fields
      confidence,
      componentScores: {
        recovery: recoveryBlock,
        load: loadBlock,
        subjective: subjectiveBlock,
        illness: illnessBlock,
      },
      dataQuality,
      version: 2,
    };
  }

  /**
   * Calculate Recovery Block (45-55% weight)
   * Components: Sleep (40%), Nocturnal HRV (30%), RHR Delta (15%), HR Nadir (15%)
   */
  private async calculateRecoveryBlock(
    userId: string,
    date: Date,
    hrvBaseline: Awaited<ReturnType<HrvBaselineRepository['findByUserAndDate']>>,
  ): Promise<RecoveryBlockScores> {
    // Sleep Score (40% of block)
    const sleepScore = await this.calculateSleepContribution(userId, date);

    // Nocturnal HRV (30% of block) - use z-score normalized
    let nocturnalHrvScore = 50; // Neutral default
    if (hrvBaseline?.hrv_zscore) {
      const hrvZscore = Number.parseFloat(hrvBaseline.hrv_zscore);
      nocturnalHrvScore = this.normalizeHrvZscore(hrvZscore);
    }

    // RHR Delta (15% of block) - today's RHR vs 7-day average
    let rhrDeltaScore = 50; // Neutral default
    if (hrvBaseline?.resting_hr) {
      const rhrDelta = await this.calculateRhrDelta(userId, date, Number.parseFloat(hrvBaseline.resting_hr));
      // RHR lower than average is good (score > 50), higher is bad (score < 50)
      // Delta of -5bpm → 75, 0 → 50, +5bpm → 25
      rhrDeltaScore = Math.max(0, Math.min(100, 50 - rhrDelta * 5));
    }

    // HR Nadir (15% of block) - sleep HR nadir vs baseline
    let hrNadirScore = 50; // Neutral default
    const sleepBaseline = await this.sleepBaselineService.getOrCalculateBaseline(userId, date);
    if (sleepBaseline?.hr_nadir_14day_avg) {
      const sleepLogs = await this.sleepLogRepository.findByUserAndDate(userId, date);
      const primaryLog = sleepLogs.find((l) => l.source !== 'manual') || sleepLogs[0];
      if (primaryLog?.hr_nadir) {
        const baselineNadir = Number.parseFloat(sleepBaseline.hr_nadir_14day_avg);
        const nadirDelta = primaryLog.hr_nadir - baselineNadir;
        // Lower nadir is better: -5bpm from baseline → 75, 0 → 50, +5bpm → 25
        hrNadirScore = Math.max(0, Math.min(100, 50 - nadirDelta * 5));
      }
    }

    // Calculate block score (weighted average)
    const blockScore = sleepScore * 0.4 + nocturnalHrvScore * 0.3 + rhrDeltaScore * 0.15 + hrNadirScore * 0.15;

    return {
      sleepScore: Math.round(sleepScore * 100) / 100,
      nocturnalHrvScore: Math.round(nocturnalHrvScore * 100) / 100,
      rhrDeltaScore: Math.round(rhrDeltaScore * 100) / 100,
      hrNadirScore: Math.round(hrNadirScore * 100) / 100,
      blockScore: Math.round(blockScore * 100) / 100,
      weight: BASE_WEIGHTS.recovery,
    };
  }

  /**
   * Calculate RHR Delta (today vs 7-day average)
   */
  private async calculateRhrDelta(userId: string, date: Date, todayRhr: number): Promise<number> {
    const history = await this.hrvBaselineRepository.getDateRange(userId, 7);
    const rhrValues = history.filter((h) => h.resting_hr && h.date < date).map((h) => Number.parseFloat(h.resting_hr!));

    if (rhrValues.length === 0) {
      return 0; // No historical data
    }

    const avgRhr = rhrValues.reduce((sum, v) => sum + v, 0) / rhrValues.length;
    return todayRhr - avgRhr;
  }

  /**
   * Calculate Load Block (25-35% weight)
   * Components: TSB contributions (60%), Monotony penalty (20%), Strain penalty (20%)
   */
  private async calculateLoadBlock(
    loadData: Awaited<ReturnType<MultiStreamLoadRepository['findByUserAndDate']>>,
    fitnessFatigueData: Awaited<ReturnType<FitnessFatigueRepository['findByUserAndDate']>>,
  ): Promise<LoadBlockScores> {
    // TSB contributions (60% of block)
    const aerobicTsb = loadData?.aerobic_tsb ? Number.parseFloat(loadData.aerobic_tsb) : 0;
    const mskTsb = loadData?.msk_tsb ? Number.parseFloat(loadData.msk_tsb) : 0;
    const neuralTsb = loadData?.neural_tsb ? Number.parseFloat(loadData.neural_tsb) : 0;

    const aerobicTsbScore = this.normalizeTsb(aerobicTsb);
    const mskTsbScore = this.normalizeTsb(mskTsb);
    const neuralTsbScore = this.normalizeTsb(neuralTsb);

    // Average TSB score
    const avgTsbScore = (aerobicTsbScore + mskTsbScore + neuralTsbScore) / 3;

    // Monotony penalty (20% of block)
    let monotonyPenalty = 0;
    const monotony = fitnessFatigueData?.monotony ? Number.parseFloat(fitnessFatigueData.monotony) : null;
    if (monotony !== null) {
      if (monotony > 2.0) {
        monotonyPenalty = 15; // Severe
      } else if (monotony > 1.5) {
        monotonyPenalty = 5; // Warning
      }
    }

    // Strain penalty (20% of block)
    let strainPenalty = 0;
    const strain = fitnessFatigueData?.strain ? Number.parseFloat(fitnessFatigueData.strain) : null;
    if (strain !== null) {
      if (strain > 2000) {
        strainPenalty = 15; // Severe
      } else if (strain > 1500) {
        strainPenalty = 5; // Warning
      }
    }

    // Calculate block score
    // TSB contributes 60% (100 = no fatigue), penalties reduce from 100
    const tsbComponent = avgTsbScore * 0.6;
    const monotonyComponent = (100 - monotonyPenalty * 5) * 0.2; // Scale penalty to 0-100
    const strainComponent = (100 - strainPenalty * 5) * 0.2;
    const blockScore = tsbComponent + monotonyComponent + strainComponent;

    return {
      aerobicTsbScore: Math.round(aerobicTsbScore * 100) / 100,
      mskTsbScore: Math.round(mskTsbScore * 100) / 100,
      neuralTsbScore: Math.round(neuralTsbScore * 100) / 100,
      monotonyPenalty,
      strainPenalty,
      blockScore: Math.round(blockScore * 100) / 100,
      weight: BASE_WEIGHTS.load,
    };
  }

  /**
   * Calculate Subjective Block (10-20% weight)
   * Components: Quick Wellness (50%), Recovery Journal (50%)
   */
  private calculateSubjectiveBlock(
    quickWellness: QuickWellnessCheckin | null | undefined,
    journalEntry: RecoveryJournalEntry | null | undefined,
    params: LoadModelParameterValues,
  ): SubjectiveBlockScores {
    const quickWellnessScore = this.calculateQuickWellnessContribution(quickWellness);
    const journalScore = this.calculateJournalContribution(journalEntry ?? null, params);

    // Weight based on what data is available
    let blockScore: number;
    if (quickWellness && journalEntry) {
      blockScore = quickWellnessScore * 0.5 + journalScore * 0.5;
    } else if (quickWellness) {
      blockScore = quickWellnessScore;
    } else if (journalEntry) {
      blockScore = journalScore;
    } else {
      blockScore = 50; // Neutral
    }

    return {
      quickWellnessScore: Math.round(quickWellnessScore * 100) / 100,
      journalScore: Math.round(journalScore * 100) / 100,
      blockScore: Math.round(blockScore * 100) / 100,
      weight: BASE_WEIGHTS.subjective,
    };
  }

  /**
   * Calculate Illness/Behavior Block (5-15% weight)
   * Components: Illness override, Alcohol penalty
   */
  private async calculateIllnessBehaviorBlock(
    userId: string,
    journalEntry: RecoveryJournalEntry | null | undefined,
  ): Promise<IllnessBlockScores> {
    // Check for active illness
    const activeIllnesses = await this.illnessLogRepository.getActiveForUser(userId);
    const illnessOverride = activeIllnesses.length > 0;
    let illnessSeverity: number | null = null;

    if (illnessOverride) {
      // Use the highest severity among active illnesses
      illnessSeverity = Math.max(...activeIllnesses.map((i) => i.severity));

      // Check for fever type (hard cap at 30)
      const hasFever = activeIllnesses.some((i) => i.illness_type === IllnessType.FEVER);
      if (hasFever && illnessSeverity < 6) {
        illnessSeverity = 6; // Treat fever as at least severity 6
      }
    }

    // Alcohol penalty (explicit, not buried in journal)
    let alcoholPenalty = 0;
    if (journalEntry?.alcohol_units) {
      const units = Number.parseFloat(journalEntry.alcohol_units);
      if (units >= 5) {
        alcoholPenalty = 25;
      } else if (units >= 3) {
        alcoholPenalty = 15;
      } else if (units >= 1) {
        alcoholPenalty = 5;
      }
    }

    // Calculate block score
    // Start at 100, subtract penalties
    let blockScore = 100;

    // Apply illness impact
    if (illnessOverride && illnessSeverity) {
      // Severity 1-10 maps to 10-100 point reduction
      blockScore -= illnessSeverity * 10;
    }

    // Apply alcohol penalty
    blockScore -= alcoholPenalty;

    blockScore = Math.max(0, Math.min(100, blockScore));

    return {
      alcoholPenalty,
      illnessOverride,
      illnessSeverity,
      blockScore: Math.round(blockScore * 100) / 100,
      weight: BASE_WEIGHTS.illness,
    };
  }

  /**
   * Calculate dynamic weights based on data availability
   */
  private calculateDynamicWeights(
    recovery: RecoveryBlockScores,
    _load: LoadBlockScores,
    subjective: SubjectiveBlockScores,
    illness: IllnessBlockScores,
  ): { recovery: number; load: number; subjective: number; illness: number } {
    const weights = { ...BASE_WEIGHTS };

    // Check if illness is active - increase illness weight
    if (illness.illnessOverride) {
      weights.illness = 0.15;
      // Reduce others proportionally
      const reduction = 0.1 / 3;
      weights.recovery -= reduction;
      weights.load -= reduction;
      weights.subjective -= reduction;
    }

    // If subjective data is complete (both quick wellness and journal), can increase weight
    if (subjective.quickWellnessScore !== 50 && subjective.journalScore !== 50) {
      weights.subjective = Math.min(0.2, weights.subjective + 0.03);
      weights.recovery -= 0.03;
    }

    // If recovery data is sparse, redistribute weight to load
    if (recovery.sleepScore === 50 && recovery.nocturnalHrvScore === 50) {
      const shift = 0.1;
      weights.load += shift;
      weights.recovery -= shift;
    }

    // Normalize weights to sum to 1
    const totalWeight = weights.recovery + weights.load + weights.subjective + weights.illness;
    weights.recovery /= totalWeight;
    weights.load /= totalWeight;
    weights.subjective /= totalWeight;
    weights.illness /= totalWeight;

    return weights;
  }

  /**
   * Calculate confidence score based on data completeness and quality
   */
  private calculateConfidence(
    recovery: RecoveryBlockScores,
    load: LoadBlockScores,
    subjective: SubjectiveBlockScores,
    _illness: IllnessBlockScores,
    hasHrvBaseline: boolean,
    hasLoadData: boolean,
  ): ReadinessConfidence {
    // Data completeness (each component contributes ~11%)
    let completeness = 0;

    // Sleep data present (+11%)
    if (recovery.sleepScore !== 50) completeness += 0.11;

    // Sleep baseline present (+11%)
    if (recovery.hrNadirScore !== 50) completeness += 0.11;

    // HRV data present (+11%)
    if (recovery.nocturnalHrvScore !== 50) completeness += 0.11;

    // HRV baseline present (+11%)
    if (hasHrvBaseline) completeness += 0.11;

    // Load data present (+11%)
    if (hasLoadData) completeness += 0.11;

    // Monotony/strain available (+11%)
    if (load.monotonyPenalty !== 0 || load.strainPenalty !== 0) completeness += 0.11;

    // Quick wellness present (+11%)
    if (subjective.quickWellnessScore !== 50) completeness += 0.11;

    // Recovery journal present (+11%)
    if (subjective.journalScore !== 50) completeness += 0.11;

    // Illness data checked (+12%)
    completeness += 0.12; // Always checked

    completeness = Math.min(1, completeness);

    // Baseline quality (based on how much baseline data we have)
    let baselineQuality = 0.5; // Default
    if (hasHrvBaseline) baselineQuality += 0.25;
    if (recovery.hrNadirScore !== 50) baselineQuality += 0.25;
    baselineQuality = Math.min(1, baselineQuality);

    // Overall confidence (weighted average)
    const overall = completeness * 0.7 + baselineQuality * 0.3;

    return {
      overall: Math.round(overall * 100) / 100,
      dataCompleteness: Math.round(completeness * 100) / 100,
      baselineQuality: Math.round(baselineQuality * 100) / 100,
    };
  }

  /**
   * Get data quality level from completeness score
   */
  private getDataQualityLevel(completeness: number): DataQualityLevel {
    if (completeness >= 0.85) return 'excellent';
    if (completeness >= 0.7) return 'good';
    if (completeness >= 0.5) return 'fair';
    if (completeness >= 0.3) return 'poor';
    return 'minimal';
  }

  /**
   * Identify limiting factor from enhanced blocks
   */
  private identifyEnhancedLimitingFactor(
    recovery: RecoveryBlockScores,
    load: LoadBlockScores,
    subjective: SubjectiveBlockScores,
    illness: IllnessBlockScores,
  ): string {
    // Check illness first (hard override)
    if (illness.illnessOverride && illness.illnessSeverity && illness.illnessSeverity >= 5) {
      return 'Active Illness';
    }

    // Check for significant alcohol impact
    if (illness.alcoholPenalty >= 15) {
      return 'Alcohol Recovery';
    }

    // Find the lowest contributing block
    const blocks = [
      { name: 'Sleep Quality', score: recovery.sleepScore },
      { name: 'HRV Status', score: recovery.nocturnalHrvScore },
      { name: 'Resting HR', score: recovery.rhrDeltaScore },
      { name: 'Aerobic Fatigue', score: load.aerobicTsbScore },
      { name: 'Musculoskeletal Fatigue', score: load.mskTsbScore },
      { name: 'Neural Fatigue', score: load.neuralTsbScore },
      { name: 'Subjective Recovery', score: subjective.blockScore },
    ];

    // Check monotony/strain
    if (load.monotonyPenalty >= 15) {
      blocks.push({ name: 'Training Monotony', score: 25 });
    }
    if (load.strainPenalty >= 15) {
      blocks.push({ name: 'Training Strain', score: 25 });
    }

    const minBlock = blocks.reduce((min, b) => (b.score < min.score ? b : min), blocks[0]);
    return minBlock.score < 40 ? minBlock.name : 'None';
  }
}

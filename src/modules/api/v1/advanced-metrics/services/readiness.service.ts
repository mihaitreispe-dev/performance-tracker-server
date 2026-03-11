import { Injectable } from '@nestjs/common';
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
    quickWellnessContribution: number; // New: quick check-in contribution
  };
  recommendation: ReadinessRecommendation;
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
  constructor(
    private readonly multiStreamLoadRepository: MultiStreamLoadRepository,
    private readonly hrvBaselineRepository: HrvBaselineRepository,
    private readonly recoveryJournalRepository: RecoveryJournalRepository,
    private readonly loadModelParametersRepository: LoadModelParametersRepository,
    private readonly quickWellnessCheckinRepository: QuickWellnessCheckinRepository,
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

    // Weight the components - adjusted weights to include quick wellness check-in (15%)
    // If quick wellness check-in exists, use it; otherwise use journal contribution
    const hasQuickWellness = quickWellnessCheckin !== null;
    const baseReadiness = hasQuickWellness
      ? aerobicContribution * 0.22 +
        mskContribution * 0.18 +
        neuralContribution * 0.18 +
        hrvContribution * 0.17 +
        journalContribution * 0.10 +
        quickWellnessContribution * 0.15
      : aerobicContribution * 0.25 +
        mskContribution * 0.2 +
        neuralContribution * 0.2 +
        hrvContribution * 0.2 +
        journalContribution * 0.15;

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
      },
      recommendation,
    };
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
  private calculateJournalContribution(
    entry: RecoveryJournalEntry | null,
    params: LoadModelParameterValues,
  ): number {
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
    const journalContribution = journalEntry
      ? this.calculateJournalContribution(journalEntry, params)
      : null;

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
        journalContribution: journalEntry
          ? this.calculateJournalContribution(journalEntry, params)
          : null,
      });
    }

    return results;
  }
}

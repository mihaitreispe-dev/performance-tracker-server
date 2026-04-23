import { Injectable } from '@nestjs/common';
import { HrSample, SleepBaseline, SleepLog, SleepScoreBreakdown } from 'src/database/interfaces';

import { SleepBaselineService } from './sleep-baseline.service';

export interface SleepScoreResult {
  score: number; // 0-100
  qualityRating: number; // 1-5
  confidence: number; // 0-1 indicating data completeness
  breakdown: SleepScoreBreakdown;
  legacyBreakdown: LegacyBreakdown; // For backwards compatibility
}

export interface LegacyBreakdown {
  durationScore: number;
  deepSleepScore: number;
  remSleepScore: number;
  awakeScore: number;
  efficiencyScore: number;
}

export interface EnhancedScoreResult extends SleepScoreResult {
  zScores: SleepZScores;
  insights: SleepInsight[];
}

export interface SleepZScores {
  tst: number | null;
  se: number | null;
  hrv: number | null;
  hrNadir: number | null;
}

export interface SleepInsight {
  type: 'positive' | 'warning' | 'concern';
  category: 'duration' | 'efficiency' | 'architecture' | 'hrv' | 'hr' | 'debt';
  message: string;
}

// Weights for composite scoring
const WEIGHTS = {
  duration: 0.25,
  efficiency: 0.2,
  architecture: 0.2,
  hrv: 0.2,
  hr: 0.15,
};

// Efficiency sub-weights
const EFFICIENCY_WEIGHTS = {
  se: 0.5,
  sol: 0.25,
  waso: 0.25,
};

@Injectable()
export class SleepScoreService {
  constructor(private readonly baselineService: SleepBaselineService) {}

  /**
   * Compute enhanced sleep score with baseline normalization
   */
  computeEnhancedScore(sleepLog: SleepLog, baseline: SleepBaseline | null): EnhancedScoreResult {
    const zScores = this.calculateZScores(sleepLog, baseline);
    const insights: SleepInsight[] = [];

    // Calculate subscores
    const durationSubscore = this.calculateDurationSubscore(sleepLog, baseline, zScores, insights);
    const efficiencySubscore = this.calculateEfficiencySubscore(sleepLog, baseline, zScores, insights);
    const architectureSubscore = this.calculateArchitectureSubscore(sleepLog, insights);
    const hrvSubscore = this.calculateHrvSubscore(sleepLog, baseline, zScores, insights);
    const hrSubscore = this.calculateHrSubscore(sleepLog, baseline, zScores, insights);

    // Calculate adjustments
    const sleepDebtPenalty = this.calculateSleepDebtPenalty(baseline);
    const baselineBonus = this.calculateBaselineBonus(zScores);

    // Weighted composite score
    let score =
      durationSubscore * WEIGHTS.duration +
      efficiencySubscore * WEIGHTS.efficiency +
      architectureSubscore * WEIGHTS.architecture +
      hrvSubscore * WEIGHTS.hrv +
      hrSubscore * WEIGHTS.hr;

    // Apply adjustments
    score = score - sleepDebtPenalty + baselineBonus;
    score = Math.max(0, Math.min(100, Math.round(score)));

    // Calculate confidence
    const confidence = this.calculateConfidence(sleepLog, baseline);

    const breakdown: SleepScoreBreakdown = {
      durationSubscore: Math.round(durationSubscore),
      efficiencySubscore: Math.round(efficiencySubscore),
      architectureSubscore: Math.round(architectureSubscore),
      hrvSubscore: Math.round(hrvSubscore),
      hrSubscore: Math.round(hrSubscore),
      sleepDebtPenalty: Math.round(sleepDebtPenalty),
      baselineBonus: Math.round(baselineBonus),
    };

    return {
      score,
      qualityRating: this.scoreToQuality(score),
      confidence,
      breakdown,
      legacyBreakdown: this.computeBreakdown(sleepLog),
      zScores,
      insights,
    };
  }

  /**
   * Compute a normalized sleep score (0-100) from sleep data.
   * Uses provider-native scores when available, otherwise calculates from architecture.
   * For backwards compatibility with existing code.
   */
  computeScore(sleepLog: SleepLog, providerScore?: number | null): SleepScoreResult {
    // If provider gives us a score, use it directly
    if (providerScore !== undefined && providerScore !== null && providerScore >= 0 && providerScore <= 100) {
      const breakdown = this.computeBreakdown(sleepLog);
      return {
        score: providerScore,
        qualityRating: this.scoreToQuality(providerScore),
        confidence: 0.5, // Medium confidence for provider scores
        breakdown: this.legacyToEnhancedBreakdown(breakdown, providerScore),
        legacyBreakdown: breakdown,
      };
    }

    // Otherwise, compute architecture-based score
    const breakdown = this.computeBreakdown(sleepLog);
    const score = this.computeArchitectureScore(sleepLog, breakdown);

    return {
      score,
      qualityRating: this.scoreToQuality(score),
      confidence: this.calculateBasicConfidence(sleepLog),
      breakdown: this.legacyToEnhancedBreakdown(breakdown, score),
      legacyBreakdown: breakdown,
    };
  }

  /**
   * Calculate z-scores for sleep metrics against baseline
   */
  private calculateZScores(sleepLog: SleepLog, baseline: SleepBaseline | null): SleepZScores {
    if (!baseline) {
      return { tst: null, se: null, hrv: null, hrNadir: null };
    }

    const tst = sleepLog.total_duration_seconds - sleepLog.awake_duration_seconds;
    const tstAvg = baseline.tst_14day_avg;
    const tstStd = baseline.tst_14day_std;

    const se = sleepLog.sleep_efficiency ? Number.parseFloat(sleepLog.sleep_efficiency) : null;
    const seAvg = baseline.se_14day_avg ? Number.parseFloat(baseline.se_14day_avg) : null;
    const seStd = baseline.se_14day_std ? Number.parseFloat(baseline.se_14day_std) : null;

    const hrv = sleepLog.avg_hrv;
    const hrvAvg = baseline.sleep_hrv_14day_avg ? Number.parseFloat(baseline.sleep_hrv_14day_avg) : null;
    const hrvStd = baseline.sleep_hrv_14day_std ? Number.parseFloat(baseline.sleep_hrv_14day_std) : null;

    const hrNadir = sleepLog.hr_nadir;
    const hrNadirAvg = baseline.hr_nadir_14day_avg ? Number.parseFloat(baseline.hr_nadir_14day_avg) : null;
    const hrNadirStd = baseline.hr_nadir_14day_std ? Number.parseFloat(baseline.hr_nadir_14day_std) : null;

    return {
      tst: this.baselineService.calculateZScore(tst, tstAvg, tstStd),
      se: se !== null ? this.baselineService.calculateZScore(se, seAvg, seStd) : null,
      hrv: hrv !== null ? this.baselineService.calculateZScore(hrv, hrvAvg, hrvStd) : null,
      // HR nadir z-score is inverted (lower is better)
      hrNadir:
        hrNadir !== null && hrNadirAvg !== null && hrNadirStd !== null && hrNadirStd > 0
          ? (hrNadirAvg - hrNadir) / hrNadirStd
          : null,
    };
  }

  /**
   * Calculate duration subscore (0-100)
   */
  private calculateDurationSubscore(
    sleepLog: SleepLog,
    baseline: SleepBaseline | null,
    zScores: SleepZScores,
    insights: SleepInsight[],
  ): number {
    const tst = sleepLog.total_duration_seconds - sleepLog.awake_duration_seconds;
    const totalHours = tst / 3600;

    // With baseline: z-score normalization
    if (zScores.tst !== null) {
      const score = 70 + zScores.tst * 15;
      const clampedScore = Math.max(0, Math.min(100, score));

      // Generate insights
      if (zScores.tst > 1) {
        insights.push({
          type: 'positive',
          category: 'duration',
          message: 'Sleep duration was significantly above your baseline',
        });
      } else if (zScores.tst < -1.5) {
        insights.push({
          type: 'concern',
          category: 'duration',
          message: 'Sleep duration was significantly below your baseline',
        });
      } else if (zScores.tst < -0.5) {
        insights.push({
          type: 'warning',
          category: 'duration',
          message: 'Sleep duration was below your baseline',
        });
      }

      return clampedScore;
    }

    // Without baseline: population norms
    let score: number;
    if (totalHours >= 7 && totalHours <= 9) {
      score = 100;
      insights.push({ type: 'positive', category: 'duration', message: 'Optimal sleep duration achieved' });
    } else if (totalHours >= 6.5 && totalHours < 7) {
      score = 85;
    } else if (totalHours >= 6 && totalHours < 6.5) {
      score = 70;
    } else if (totalHours >= 5 && totalHours < 6) {
      score = 50;
      insights.push({ type: 'warning', category: 'duration', message: 'Sleep duration was shorter than optimal' });
    } else if (totalHours > 9 && totalHours <= 10) {
      score = 85;
    } else if (totalHours > 10) {
      score = 70;
      insights.push({ type: 'warning', category: 'duration', message: 'Sleep duration was longer than typical' });
    } else {
      score = 30;
      insights.push({ type: 'concern', category: 'duration', message: 'Very short sleep duration detected' });
    }

    return score;
  }

  /**
   * Calculate efficiency subscore (0-100)
   * Combines SE, SOL, and WASO
   */
  private calculateEfficiencySubscore(
    sleepLog: SleepLog,
    baseline: SleepBaseline | null,
    zScores: SleepZScores,
    insights: SleepInsight[],
  ): number {
    let seScore = 70; // Default neutral score
    let solScore = 70;
    let wasoScore = 70;
    let availableWeights = 0;

    // Sleep Efficiency (SE) - TST / TIB
    const se = sleepLog.sleep_efficiency ? Number.parseFloat(sleepLog.sleep_efficiency) : null;
    if (se !== null) {
      if (zScores.se !== null) {
        // With baseline
        seScore = 70 + zScores.se * 15;
      } else {
        // Population norms
        if (se >= 0.85 && se <= 0.95) {
          seScore = 100;
        } else if (se >= 0.8 && se < 0.85) {
          seScore = 80;
        } else if (se >= 0.75 && se < 0.8) {
          seScore = 60;
        } else if (se > 0.95) {
          seScore = 90; // Very high efficiency might indicate sleep deprivation
        } else {
          seScore = 40;
          insights.push({ type: 'warning', category: 'efficiency', message: 'Low sleep efficiency detected' });
        }
      }
      availableWeights += EFFICIENCY_WEIGHTS.se;
    }

    // Sleep Onset Latency (SOL)
    const sol = sleepLog.sleep_onset_latency_seconds;
    if (sol !== null) {
      const solMinutes = sol / 60;
      if (solMinutes >= 10 && solMinutes <= 20) {
        solScore = 100; // Optimal
      } else if (solMinutes < 5) {
        solScore = 70; // May indicate deprivation
        insights.push({
          type: 'warning',
          category: 'efficiency',
          message: 'Very quick sleep onset may indicate sleep deprivation',
        });
      } else if (solMinutes > 20 && solMinutes <= 30) {
        solScore = 80;
      } else if (solMinutes > 30 && solMinutes <= 45) {
        solScore = 50;
      } else if (solMinutes > 45) {
        solScore = 30;
        insights.push({ type: 'concern', category: 'efficiency', message: 'Difficulty falling asleep detected' });
      } else {
        solScore = 85; // 5-10 minutes
      }
      availableWeights += EFFICIENCY_WEIGHTS.sol;
    }

    // Wake After Sleep Onset (WASO)
    const waso = sleepLog.waso_seconds;
    if (waso !== null) {
      const wasoMinutes = waso / 60;
      if (wasoMinutes < 20) {
        wasoScore = 100;
      } else if (wasoMinutes < 30) {
        wasoScore = 85;
      } else if (wasoMinutes < 45) {
        wasoScore = 70;
      } else if (wasoMinutes < 60) {
        wasoScore = 50;
        insights.push({ type: 'warning', category: 'efficiency', message: 'Significant wake time during the night' });
      } else {
        wasoScore = 30;
        insights.push({
          type: 'concern',
          category: 'efficiency',
          message: 'High amount of wake time after sleep onset',
        });
      }
      availableWeights += EFFICIENCY_WEIGHTS.waso;
    }

    // If no efficiency metrics available, return neutral
    if (availableWeights === 0) {
      return 70;
    }

    // Weighted average based on available metrics
    let weightedScore = 0;
    if (se !== null) {
      weightedScore += seScore * (EFFICIENCY_WEIGHTS.se / availableWeights) * availableWeights;
    }
    if (sol !== null) {
      weightedScore += solScore * (EFFICIENCY_WEIGHTS.sol / availableWeights) * availableWeights;
    }
    if (waso !== null) {
      weightedScore += wasoScore * (EFFICIENCY_WEIGHTS.waso / availableWeights) * availableWeights;
    }

    return Math.max(0, Math.min(100, weightedScore / availableWeights));
  }

  /**
   * Calculate architecture subscore (0-100)
   * Based on deep sleep and REM percentages
   */
  private calculateArchitectureSubscore(sleepLog: SleepLog, insights: SleepInsight[]): number {
    const sleepTime = sleepLog.total_duration_seconds - sleepLog.awake_duration_seconds;
    if (sleepTime <= 0) return 50;

    const deepPct = (sleepLog.deep_duration_seconds / sleepTime) * 100;
    const remPct = (sleepLog.rem_duration_seconds / sleepTime) * 100;

    // Deep sleep score (target 15-20%)
    let deepScore: number;
    if (deepPct >= 15 && deepPct <= 25) {
      deepScore = 100;
    } else if (deepPct >= 10 && deepPct < 15) {
      deepScore = 75;
    } else if (deepPct > 25 && deepPct <= 30) {
      deepScore = 90;
    } else if (deepPct >= 5 && deepPct < 10) {
      deepScore = 50;
      insights.push({ type: 'warning', category: 'architecture', message: 'Below average deep sleep percentage' });
    } else if (deepPct < 5) {
      deepScore = 25;
      insights.push({ type: 'concern', category: 'architecture', message: 'Very low deep sleep percentage' });
    } else {
      deepScore = 60;
    }

    // REM sleep score (target 20-25%)
    let remScore: number;
    if (remPct >= 20 && remPct <= 30) {
      remScore = 100;
    } else if (remPct >= 15 && remPct < 20) {
      remScore = 75;
    } else if (remPct > 30 && remPct <= 35) {
      remScore = 90;
    } else if (remPct >= 10 && remPct < 15) {
      remScore = 50;
      insights.push({ type: 'warning', category: 'architecture', message: 'Below average REM sleep percentage' });
    } else if (remPct < 10) {
      remScore = 25;
      insights.push({ type: 'concern', category: 'architecture', message: 'Very low REM sleep percentage' });
    } else {
      remScore = 60;
    }

    // Equal weight for deep and REM
    return (deepScore + remScore) / 2;
  }

  /**
   * Calculate HRV subscore (0-100)
   */
  private calculateHrvSubscore(
    sleepLog: SleepLog,
    baseline: SleepBaseline | null,
    zScores: SleepZScores,
    insights: SleepInsight[],
  ): number {
    if (sleepLog.avg_hrv === null) {
      return 70; // Neutral if no HRV data
    }

    let baseScore = 70;

    // With baseline: z-score normalization
    if (zScores.hrv !== null) {
      baseScore = 70 + zScores.hrv * 15;

      if (zScores.hrv > 1) {
        insights.push({ type: 'positive', category: 'hrv', message: 'HRV was significantly above your baseline' });
      } else if (zScores.hrv < -1.5) {
        insights.push({ type: 'concern', category: 'hrv', message: 'HRV was significantly below your baseline' });
      } else if (zScores.hrv < -0.5) {
        insights.push({ type: 'warning', category: 'hrv', message: 'HRV was below your baseline' });
      }
    }

    // HRV trend bonus/penalty (if we have first/second half data)
    const firstHalf = sleepLog.hrv_first_half_avg ? Number.parseFloat(sleepLog.hrv_first_half_avg) : null;
    const secondHalf = sleepLog.hrv_second_half_avg ? Number.parseFloat(sleepLog.hrv_second_half_avg) : null;

    if (firstHalf !== null && secondHalf !== null) {
      const diff = secondHalf - firstHalf;
      if (diff > 5) {
        // Rising HRV through the night - good recovery
        baseScore += 5;
        insights.push({ type: 'positive', category: 'hrv', message: 'HRV increased through the night' });
      } else if (diff < -5) {
        // Falling HRV - possible stress/illness
        baseScore -= 10;
        insights.push({ type: 'warning', category: 'hrv', message: 'HRV decreased through the night' });
      }
    }

    return Math.max(0, Math.min(100, baseScore));
  }

  /**
   * Calculate HR nadir subscore (0-100)
   */
  private calculateHrSubscore(
    sleepLog: SleepLog,
    baseline: SleepBaseline | null,
    zScores: SleepZScores,
    insights: SleepInsight[],
  ): number {
    if (sleepLog.hr_nadir === null) {
      return 70; // Neutral if no HR nadir data
    }

    // With baseline: z-score normalization (inverted - lower is better)
    if (zScores.hrNadir !== null) {
      const score = 70 + zScores.hrNadir * 15;

      if (zScores.hrNadir > 1) {
        insights.push({
          type: 'positive',
          category: 'hr',
          message: 'Heart rate dropped lower than usual during sleep',
        });
      } else if (zScores.hrNadir < -1.5) {
        insights.push({
          type: 'warning',
          category: 'hr',
          message: "Heart rate didn't drop as much as usual during sleep",
        });
      }

      return Math.max(0, Math.min(100, score));
    }

    // Without baseline: compare to avg resting HR
    if (sleepLog.avg_resting_hr !== null) {
      const dropPct = ((sleepLog.avg_resting_hr - sleepLog.hr_nadir) / sleepLog.avg_resting_hr) * 100;

      if (dropPct >= 10 && dropPct <= 25) {
        return 90; // Good recovery
      } else if (dropPct >= 5 && dropPct < 10) {
        return 70;
      } else if (dropPct < 5) {
        insights.push({ type: 'warning', category: 'hr', message: 'Minimal heart rate drop during sleep' });
        return 50;
      } else {
        return 80; // >25% drop
      }
    }

    return 70; // Neutral if no comparison available
  }

  /**
   * Calculate sleep debt penalty
   */
  private calculateSleepDebtPenalty(baseline: SleepBaseline | null): number {
    if (!baseline || baseline.sleep_debt_7day === null) {
      return 0;
    }

    // Convert to hours (negative = deficit)
    const debtHours = baseline.sleep_debt_7day / 3600;

    if (debtHours <= -7) {
      return 15; // 7+ hours deficit over 7 days
    } else if (debtHours <= -5) {
      return 10;
    } else if (debtHours <= -3) {
      return 5;
    }

    return 0;
  }

  /**
   * Calculate baseline trend bonus
   * Bonus if all available z-scores are positive
   */
  private calculateBaselineBonus(zScores: SleepZScores): number {
    const scores = [zScores.tst, zScores.se, zScores.hrv, zScores.hrNadir].filter((z) => z !== null) as number[];

    if (scores.length >= 2 && scores.every((z) => z > 0)) {
      return 5; // All metrics above baseline
    }

    return 0;
  }

  /**
   * Calculate confidence based on data completeness
   */
  private calculateConfidence(sleepLog: SleepLog, baseline: SleepBaseline | null): number {
    let confidence = 0;

    // Basic duration: 0.20
    if (sleepLog.total_duration_seconds > 0) {
      confidence += 0.2;
    }

    // Sleep stages: 0.20
    if (sleepLog.deep_duration_seconds > 0 || sleepLog.rem_duration_seconds > 0) {
      confidence += 0.2;
    }

    // Efficiency metrics (TIB, SOL, WASO): 0.15
    const hasEfficiencyMetrics =
      sleepLog.time_in_bed_seconds !== null ||
      sleepLog.sleep_onset_latency_seconds !== null ||
      sleepLog.waso_seconds !== null;
    if (hasEfficiencyMetrics) {
      confidence += 0.15;
    }

    // HRV data: 0.25
    if (sleepLog.avg_hrv !== null) {
      confidence += 0.15;
    }
    if (sleepLog.hrv_first_half_avg !== null && sleepLog.hrv_second_half_avg !== null) {
      confidence += 0.1;
    }

    // HR nadir: 0.10
    if (sleepLog.hr_nadir !== null) {
      confidence += 0.1;
    }

    // Timestamps: 0.10
    if (sleepLog.start_time !== null && sleepLog.end_time !== null) {
      confidence += 0.1;
    }

    return Math.round(confidence * 100) / 100;
  }

  /**
   * Calculate basic confidence for legacy scoring
   */
  private calculateBasicConfidence(sleepLog: SleepLog): number {
    let confidence = 0.2; // Base for having duration

    if (sleepLog.deep_duration_seconds > 0 || sleepLog.rem_duration_seconds > 0) {
      confidence += 0.3;
    }
    if (sleepLog.avg_hrv !== null) {
      confidence += 0.2;
    }
    if (sleepLog.avg_resting_hr !== null) {
      confidence += 0.1;
    }
    if (sleepLog.start_time !== null && sleepLog.end_time !== null) {
      confidence += 0.2;
    }

    return Math.round(confidence * 100) / 100;
  }

  /**
   * Convert legacy breakdown to enhanced format
   */
  private legacyToEnhancedBreakdown(legacy: LegacyBreakdown, totalScore: number): SleepScoreBreakdown {
    // Approximate distribution based on legacy weights
    const total =
      legacy.durationScore + legacy.deepSleepScore + legacy.remSleepScore + legacy.awakeScore + legacy.efficiencyScore;
    const factor = total > 0 ? 100 / total : 1;

    return {
      durationSubscore: Math.round(legacy.durationScore * factor * 2.5), // Scale 0-40 to ~0-100
      efficiencySubscore: Math.round((legacy.efficiencyScore + legacy.awakeScore) * factor * 5), // Scale 0-20 to ~0-100
      architectureSubscore: Math.round((legacy.deepSleepScore + legacy.remSleepScore) * factor * 2.5), // Scale 0-40 to ~0-100
      hrvSubscore: 70, // Neutral - no HRV in legacy
      hrSubscore: 70, // Neutral - no HR in legacy
      sleepDebtPenalty: 0,
      baselineBonus: 0,
    };
  }

  /**
   * Compute individual score components (legacy method)
   */
  private computeBreakdown(sleepLog: SleepLog): LegacyBreakdown {
    const totalSeconds = sleepLog.total_duration_seconds;
    const totalHours = totalSeconds / 3600;

    // Duration score (0-40): 7-9 hours = 40, 6-7 = 30, 5-6 = 20, <5 = 10, >9 = 35
    let durationScore = 0;
    if (totalHours >= 7 && totalHours <= 9) {
      durationScore = 40;
    } else if (totalHours >= 6 && totalHours < 7) {
      durationScore = 30;
    } else if (totalHours >= 5 && totalHours < 6) {
      durationScore = 20;
    } else if (totalHours > 9) {
      durationScore = 35;
    } else {
      durationScore = 10;
    }

    // Calculate sleep stage percentages
    const sleepTime = totalSeconds - sleepLog.awake_duration_seconds;
    const deepPct = sleepTime > 0 ? (sleepLog.deep_duration_seconds / sleepTime) * 100 : 0;
    const remPct = sleepTime > 0 ? (sleepLog.rem_duration_seconds / sleepTime) * 100 : 0;
    const awakePct = totalSeconds > 0 ? (sleepLog.awake_duration_seconds / totalSeconds) * 100 : 0;
    const efficiency = totalSeconds > 0 ? sleepTime / totalSeconds : 0;

    // Deep sleep % (0-20): Target 15-20%
    let deepSleepScore = 0;
    if (deepPct >= 15 && deepPct <= 25) {
      deepSleepScore = 20;
    } else if (deepPct >= 10 && deepPct < 15) {
      deepSleepScore = 15;
    } else if (deepPct > 25) {
      deepSleepScore = 18;
    } else if (deepPct >= 5) {
      deepSleepScore = 10;
    } else {
      deepSleepScore = 5;
    }

    // REM sleep % (0-20): Target 20-25%
    let remSleepScore = 0;
    if (remPct >= 20 && remPct <= 30) {
      remSleepScore = 20;
    } else if (remPct >= 15 && remPct < 20) {
      remSleepScore = 15;
    } else if (remPct > 30) {
      remSleepScore = 18;
    } else if (remPct >= 10) {
      remSleepScore = 10;
    } else {
      remSleepScore = 5;
    }

    // Awake penalty (0-10): <5% = 10, <10% = 7, <15% = 4, >=15% = 0
    let awakeScore = 0;
    if (awakePct < 5) {
      awakeScore = 10;
    } else if (awakePct < 10) {
      awakeScore = 7;
    } else if (awakePct < 15) {
      awakeScore = 4;
    } else {
      awakeScore = 0;
    }

    // Efficiency (0-10): (total - awake) / total
    const efficiencyScore = Math.round(efficiency * 10);

    return {
      durationScore,
      deepSleepScore,
      remSleepScore,
      awakeScore,
      efficiencyScore,
    };
  }

  /**
   * Calculate total score from breakdown (legacy)
   */
  private computeArchitectureScore(sleepLog: SleepLog, breakdown: LegacyBreakdown): number {
    const total =
      breakdown.durationScore +
      breakdown.deepSleepScore +
      breakdown.remSleepScore +
      breakdown.awakeScore +
      breakdown.efficiencyScore;

    // Clamp to 0-100
    return Math.max(0, Math.min(100, total));
  }

  /**
   * Map score (0-100) to quality rating (1-5)
   *
   * 85-100 -> 5 (Excellent)
   * 70-84  -> 4 (Good)
   * 55-69  -> 3 (Fair)
   * 40-54  -> 2 (Poor)
   * 0-39   -> 1 (Very Poor)
   */
  scoreToQuality(score: number): number {
    if (score >= 85) return 5;
    if (score >= 70) return 4;
    if (score >= 55) return 3;
    if (score >= 40) return 2;
    return 1;
  }

  /**
   * Map quality rating (1-5) to descriptive label
   */
  getQualityLabel(quality: number): string {
    switch (quality) {
      case 5:
        return 'Excellent';
      case 4:
        return 'Good';
      case 3:
        return 'Fair';
      case 2:
        return 'Poor';
      case 1:
      default:
        return 'Very Poor';
    }
  }

  /**
   * Calculate HR nadir from HR samples
   */
  calculateHrNadirFromSamples(samples: HrSample[]): { nadir: number; timestamp: number } | null {
    if (!samples || samples.length === 0) {
      return null;
    }

    let minHr = Infinity;
    let minTimestamp = 0;

    for (const sample of samples) {
      if (sample.heartRate > 0 && sample.heartRate < minHr) {
        minHr = sample.heartRate;
        minTimestamp = sample.timestampSeconds;
      }
    }

    if (minHr === Infinity) {
      return null;
    }

    return { nadir: minHr, timestamp: minTimestamp };
  }

  /**
   * Calculate HRV averages for first and second half of sleep
   * Note: This assumes HRV data is embedded in hr_samples or available separately
   */
  calculateHrvHalves(
    samples: HrSample[],
    startTimeMs: number,
    endTimeMs: number,
  ): { firstHalf: number | null; secondHalf: number | null } {
    if (!samples || samples.length === 0) {
      return { firstHalf: null, secondHalf: null };
    }

    const midpointMs = (startTimeMs + endTimeMs) / 2;
    const midpointSeconds = midpointMs / 1000;

    const firstHalfSamples: number[] = [];
    const secondHalfSamples: number[] = [];

    for (const sample of samples) {
      // Filter out invalid HR values
      if (sample.heartRate <= 0) continue;

      if (sample.timestampSeconds < midpointSeconds) {
        firstHalfSamples.push(sample.heartRate);
      } else {
        secondHalfSamples.push(sample.heartRate);
      }
    }

    const firstHalf =
      firstHalfSamples.length > 0 ? firstHalfSamples.reduce((a, b) => a + b, 0) / firstHalfSamples.length : null;
    const secondHalf =
      secondHalfSamples.length > 0 ? secondHalfSamples.reduce((a, b) => a + b, 0) / secondHalfSamples.length : null;

    return { firstHalf, secondHalf };
  }

  /**
   * Calculate sleep efficiency (TST / TIB)
   */
  calculateSleepEfficiency(sleepLog: SleepLog): number | null {
    const tib = sleepLog.time_in_bed_seconds ?? sleepLog.total_duration_seconds;
    if (tib <= 0) return null;

    const tst = sleepLog.total_duration_seconds - sleepLog.awake_duration_seconds;
    return tst / tib;
  }
}

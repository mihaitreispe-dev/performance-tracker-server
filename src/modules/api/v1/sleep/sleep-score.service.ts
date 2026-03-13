import { Injectable } from '@nestjs/common';
import { SleepLog } from 'src/database/interfaces';

export interface SleepScoreResult {
  score: number; // 0-100
  qualityRating: number; // 1-5
  breakdown: {
    durationScore: number;
    deepSleepScore: number;
    remSleepScore: number;
    awakeScore: number;
    efficiencyScore: number;
  };
}

@Injectable()
export class SleepScoreService {
  /**
   * Compute a normalized sleep score (0-100) from sleep data.
   * Uses provider-native scores when available, otherwise calculates from architecture.
   *
   * @param sleepLog - The sleep log data
   * @param providerScore - Optional native score from provider (0-100)
   */
  computeScore(sleepLog: SleepLog, providerScore?: number | null): SleepScoreResult {
    // If provider gives us a score, use it directly
    if (providerScore !== undefined && providerScore !== null && providerScore >= 0 && providerScore <= 100) {
      return {
        score: providerScore,
        qualityRating: this.scoreToQuality(providerScore),
        breakdown: this.computeBreakdown(sleepLog),
      };
    }

    // Otherwise, compute architecture-based score
    const breakdown = this.computeBreakdown(sleepLog);
    const score = this.computeArchitectureScore(sleepLog, breakdown);

    return {
      score,
      qualityRating: this.scoreToQuality(score),
      breakdown,
    };
  }

  /**
   * Compute individual score components
   */
  private computeBreakdown(sleepLog: SleepLog): SleepScoreResult['breakdown'] {
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
   * Calculate total score from breakdown
   */
  private computeArchitectureScore(sleepLog: SleepLog, breakdown: SleepScoreResult['breakdown']): number {
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
   * 85-100 → 5 (Excellent)
   * 70-84  → 4 (Good)
   * 55-69  → 3 (Fair)
   * 40-54  → 2 (Poor)
   * 0-39   → 1 (Very Poor)
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
}

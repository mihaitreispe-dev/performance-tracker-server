import { Injectable } from '@nestjs/common';
import {
  HealthMetricType,
  HrvBaselineDaily,
  NewHrvBaselineDaily,
  SuppressionSeverity,
  SuppressionThresholds,
} from 'src/database/interfaces';
import { formatDateToYMD } from 'src/lib/util';
import { DailyHealthMetricRepository } from 'src/repositories/daily-health-metric.repository';
import { HrvBaselineRepository } from 'src/repositories/hrv-baseline.repository';

export interface HrvBaselineResult {
  date: string;
  hrvValue: number | null;
  restingHr: number | null;
  hrv7DayAvg: number | null;
  hrv7DayStd: number | null;
  hrvZscore: number | null;
  isSuppressed: boolean;
  suppressionSeverity: SuppressionSeverity;
}

export interface HrvTrend {
  currentValue: number | null;
  baseline7Day: number | null;
  zScore: number | null;
  trend: 'improving' | 'stable' | 'declining' | 'suppressed' | 'unknown';
  suppressionDays: number;
}

@Injectable()
export class HrvBaselineService {
  private readonly BASELINE_DAYS = 7;
  private readonly MIN_DATA_POINTS = 3;

  constructor(
    private readonly hrvBaselineRepository: HrvBaselineRepository,
    private readonly dailyHealthMetricRepository: DailyHealthMetricRepository,
  ) {}

  /**
   * Calculate HRV baseline for a specific date
   */
  async calculateBaseline(userId: string, date: Date): Promise<HrvBaselineResult> {
    const targetDate = new Date(date);
    targetDate.setHours(0, 0, 0, 0);

    // Get today's HRV from daily health metrics
    const todayHrvMetrics = await this.dailyHealthMetricRepository.findByUserDateAndType(
      userId,
      targetDate,
      HealthMetricType.HRV,
    );
    const todayRhrMetrics = await this.dailyHealthMetricRepository.findByUserDateAndType(
      userId,
      targetDate,
      HealthMetricType.RESTING_HEART_RATE,
    );

    const hrvValue = todayHrvMetrics.length > 0 ? parseFloat(todayHrvMetrics[0].value) : null;
    const restingHr = todayRhrMetrics.length > 0 ? parseFloat(todayRhrMetrics[0].value) : null;

    // Get historical HRV data for baseline calculation
    const startDate = new Date(targetDate);
    startDate.setDate(startDate.getDate() - this.BASELINE_DAYS);

    const historicalMetrics = await this.dailyHealthMetricRepository.findMany({
      userId,
      metricType: HealthMetricType.HRV,
      dateFrom: startDate,
      dateTo: new Date(targetDate.getTime() - 24 * 60 * 60 * 1000), // Exclude today
    });

    const historicalValues = historicalMetrics
      .map((m) => parseFloat(m.value))
      .filter((v) => !isNaN(v) && v > 0);

    // Calculate 7-day rolling stats
    let hrv7DayAvg: number | null = null;
    let hrv7DayStd: number | null = null;
    let hrvZscore: number | null = null;
    let isSuppressed = false;
    let suppressionSeverity: SuppressionSeverity = null;

    if (historicalValues.length >= this.MIN_DATA_POINTS) {
      hrv7DayAvg = this.calculateMean(historicalValues);
      hrv7DayStd = this.calculateStd(historicalValues, hrv7DayAvg);

      if (hrvValue !== null && hrv7DayStd > 0) {
        hrvZscore = (hrvValue - hrv7DayAvg) / hrv7DayStd;

        // Determine suppression
        if (hrvZscore < SuppressionThresholds.SEVERE) {
          isSuppressed = true;
          suppressionSeverity = 'severe';
        } else if (hrvZscore < SuppressionThresholds.MODERATE) {
          isSuppressed = true;
          suppressionSeverity = 'moderate';
        } else if (hrvZscore < SuppressionThresholds.MILD) {
          isSuppressed = true;
          suppressionSeverity = 'mild';
        }
      }
    }

    // Store the result
    const data: NewHrvBaselineDaily = {
      user_id: userId,
      date: formatDateToYMD(targetDate),
      hrv_value: hrvValue,
      resting_hr: restingHr,
      hrv_7day_avg: hrv7DayAvg !== null ? Math.round(hrv7DayAvg * 100) / 100 : null,
      hrv_7day_std: hrv7DayStd !== null ? Math.round(hrv7DayStd * 100) / 100 : null,
      hrv_zscore: hrvZscore !== null ? Math.round(hrvZscore * 100) / 100 : null,
      is_suppressed: isSuppressed,
      suppression_severity: suppressionSeverity,
      metadata: {
        dataSource: todayHrvMetrics[0]?.provider,
        hrvMeasurementCount: todayHrvMetrics.length,
        hrvValues: historicalValues,
      },
    };

    await this.hrvBaselineRepository.upsert(data);

    return {
      date: formatDateToYMD(targetDate),
      hrvValue,
      restingHr,
      hrv7DayAvg: hrv7DayAvg !== null ? Math.round(hrv7DayAvg * 100) / 100 : null,
      hrv7DayStd: hrv7DayStd !== null ? Math.round(hrv7DayStd * 100) / 100 : null,
      hrvZscore: hrvZscore !== null ? Math.round(hrvZscore * 100) / 100 : null,
      isSuppressed,
      suppressionSeverity,
    };
  }

  /**
   * Get the latest HRV baseline for a user
   */
  async getLatest(userId: string): Promise<HrvBaselineDaily | null> {
    const latest = await this.hrvBaselineRepository.getLatestForUser(userId);
    return latest || null;
  }

  /**
   * Get HRV trend analysis
   */
  async getTrend(userId: string): Promise<HrvTrend> {
    const latest = await this.hrvBaselineRepository.getLatestForUser(userId);
    const history = await this.hrvBaselineRepository.getDateRange(userId, 30);

    if (!latest || history.length === 0) {
      return {
        currentValue: null,
        baseline7Day: null,
        zScore: null,
        trend: 'unknown',
        suppressionDays: 0,
      };
    }

    const currentValue = latest.hrv_value ? parseFloat(latest.hrv_value) : null;
    const baseline7Day = latest.hrv_7day_avg ? parseFloat(latest.hrv_7day_avg) : null;
    const zScore = latest.hrv_zscore ? parseFloat(latest.hrv_zscore) : null;
    const suppressionDays = history.filter((h) => h.is_suppressed).length;

    let trend: HrvTrend['trend'] = 'unknown';

    if (latest.is_suppressed) {
      trend = 'suppressed';
    } else if (zScore !== null) {
      if (zScore > 0.5) {
        trend = 'improving';
      } else if (zScore < -0.5) {
        trend = 'declining';
      } else {
        trend = 'stable';
      }
    }

    return {
      currentValue,
      baseline7Day,
      zScore,
      trend,
      suppressionDays,
    };
  }

  /**
   * Get historical HRV data
   */
  async getHistory(userId: string, days: number = 30): Promise<HrvBaselineDaily[]> {
    return this.hrvBaselineRepository.getDateRange(userId, days);
  }

  /**
   * Get HRV suppression history
   */
  async getSuppressionHistory(userId: string, days: number = 30): Promise<HrvBaselineDaily[]> {
    return this.hrvBaselineRepository.getSuppressionHistory(userId, days);
  }

  /**
   * Get HRV statistics for a period
   */
  async getStats(userId: string, days: number = 30) {
    return this.hrvBaselineRepository.getHrvStats(userId, days);
  }

  /**
   * Backfill historical HRV baselines
   */
  async backfillHistory(userId: string, days: number = 30): Promise<void> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    startDate.setHours(0, 0, 0, 0);

    const endDate = new Date();
    endDate.setHours(0, 0, 0, 0);

    const currentDate = new Date(startDate);
    while (currentDate <= endDate) {
      await this.calculateBaseline(userId, new Date(currentDate));
      currentDate.setDate(currentDate.getDate() + 1);
    }
  }

  private calculateMean(values: number[]): number {
    if (values.length === 0) return 0;
    return values.reduce((sum, val) => sum + val, 0) / values.length;
  }

  private calculateStd(values: number[], mean: number): number {
    if (values.length < 2) return 0;
    const squaredDiffs = values.map((val) => Math.pow(val - mean, 2));
    const avgSquaredDiff = squaredDiffs.reduce((sum, val) => sum + val, 0) / values.length;
    return Math.sqrt(avgSquaredDiff);
  }
}

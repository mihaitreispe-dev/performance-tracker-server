import { Injectable, Logger } from '@nestjs/common';
import { SleepBaseline, SleepLog } from 'src/database/interfaces';
import { SleepBaselineRepository } from 'src/repositories/sleep-baseline.repository';
import { SleepLogRepository } from 'src/repositories/sleep-log.repository';

export interface CalculatedBaseline {
  tstAvg: number | null; // seconds
  tstStd: number | null;
  seAvg: number | null; // 0-1
  seStd: number | null;
  hrvAvg: number | null;
  hrvStd: number | null;
  hrNadirAvg: number | null;
  hrNadirStd: number | null;
  sleepDebt7Day: number | null; // seconds (negative = deficit)
  sleepDebt14Day: number | null;
  dataPointsCount: number;
}

@Injectable()
export class SleepBaselineService {
  private static readonly BASELINE_DAYS = 14;
  private static readonly MIN_DATA_POINTS = 5;
  private static readonly OPTIMAL_TST_SECONDS = 7.5 * 3600; // 7.5 hours = 27000 seconds

  private readonly logger = new Logger(SleepBaselineService.name);

  constructor(
    private readonly sleepBaselineRepository: SleepBaselineRepository,
    private readonly sleepLogRepository: SleepLogRepository,
  ) {}

  /**
   * Get or calculate baseline for a specific date
   * Returns cached baseline if available, otherwise calculates and stores it
   */
  async getOrCalculateBaseline(userId: string, date: Date): Promise<SleepBaseline | null> {
    // Try to get existing baseline
    const existing = await this.sleepBaselineRepository.findByUserAndDate(userId, date);
    if (existing) {
      return existing;
    }

    // Calculate and store new baseline
    const calculated = await this.calculateBaseline(userId, date);
    if (!calculated || calculated.dataPointsCount < SleepBaselineService.MIN_DATA_POINTS) {
      return null;
    }

    // Store the baseline
    const baseline = await this.sleepBaselineRepository.upsert(userId, date, {
      tst_14day_avg: calculated.tstAvg,
      tst_14day_std: calculated.tstStd,
      se_14day_avg: calculated.seAvg?.toFixed(4) ?? null,
      se_14day_std: calculated.seStd?.toFixed(4) ?? null,
      sleep_hrv_14day_avg: calculated.hrvAvg?.toFixed(2) ?? null,
      sleep_hrv_14day_std: calculated.hrvStd?.toFixed(2) ?? null,
      hr_nadir_14day_avg: calculated.hrNadirAvg?.toFixed(2) ?? null,
      hr_nadir_14day_std: calculated.hrNadirStd?.toFixed(2) ?? null,
      sleep_debt_7day: calculated.sleepDebt7Day,
      sleep_debt_14day: calculated.sleepDebt14Day,
      data_points_count: calculated.dataPointsCount,
    });

    return baseline;
  }

  /**
   * Calculate baseline from historical sleep logs
   * Uses 14 days of data excluding the target date
   */
  async calculateBaseline(userId: string, date: Date): Promise<CalculatedBaseline | null> {
    // Get 14 days prior to the target date
    const endDate = new Date(date);
    endDate.setDate(endDate.getDate() - 1); // Exclude current date

    const startDate = new Date(endDate);
    startDate.setDate(startDate.getDate() - SleepBaselineService.BASELINE_DAYS + 1);

    const sleepLogs = await this.sleepLogRepository.findByUserAndDateRange(userId, startDate, endDate);

    if (sleepLogs.length < SleepBaselineService.MIN_DATA_POINTS) {
      this.logger.debug(
        `Insufficient data points for baseline: ${sleepLogs.length}/${SleepBaselineService.MIN_DATA_POINTS}`,
      );
      return null;
    }

    // Filter to primary logs per day (prefer wearable over manual)
    const primaryLogsMap = new Map<string, SleepLog>();
    for (const log of sleepLogs) {
      const dateKey = log.log_date instanceof Date ? log.log_date.toISOString().split('T')[0] : String(log.log_date);
      const existing = primaryLogsMap.get(dateKey);
      if (!existing || (existing.source === 'manual' && log.source !== 'manual')) {
        primaryLogsMap.set(dateKey, log);
      }
    }
    const primaryLogs = Array.from(primaryLogsMap.values());

    // Calculate TST statistics
    const tstValues = primaryLogs.map((log) => log.total_duration_seconds - log.awake_duration_seconds);
    const tstAvg = this.mean(tstValues);
    const tstStd = this.std(tstValues, tstAvg);

    // Calculate SE (Sleep Efficiency) statistics
    const seValues = primaryLogs
      .filter((log) => {
        const tib = log.time_in_bed_seconds ?? log.total_duration_seconds;
        return tib > 0;
      })
      .map((log) => {
        const tst = log.total_duration_seconds - log.awake_duration_seconds;
        const tib = log.time_in_bed_seconds ?? log.total_duration_seconds;
        return tst / tib;
      });
    const seAvg = seValues.length >= SleepBaselineService.MIN_DATA_POINTS ? this.mean(seValues) : null;
    const seStd = seAvg !== null ? this.std(seValues, seAvg) : null;

    // Calculate HRV statistics (only for logs with HRV data)
    const hrvValues = primaryLogs.filter((log) => log.avg_hrv !== null).map((log) => log.avg_hrv!);
    const hrvAvg = hrvValues.length >= SleepBaselineService.MIN_DATA_POINTS ? this.mean(hrvValues) : null;
    const hrvStd = hrvAvg !== null ? this.std(hrvValues, hrvAvg) : null;

    // Calculate HR nadir statistics
    const hrNadirValues = primaryLogs.filter((log) => log.hr_nadir !== null).map((log) => log.hr_nadir!);
    const hrNadirAvg =
      hrNadirValues.length >= SleepBaselineService.MIN_DATA_POINTS ? this.mean(hrNadirValues) : null;
    const hrNadirStd = hrNadirAvg !== null ? this.std(hrNadirValues, hrNadirAvg) : null;

    // Calculate sleep debt (cumulative deviation from optimal)
    const sleepDebt7Day = this.calculateSleepDebt(primaryLogs.slice(-7));
    const sleepDebt14Day = this.calculateSleepDebt(primaryLogs);

    return {
      tstAvg: Math.round(tstAvg),
      tstStd: Math.round(tstStd),
      seAvg,
      seStd,
      hrvAvg,
      hrvStd,
      hrNadirAvg,
      hrNadirStd,
      sleepDebt7Day,
      sleepDebt14Day,
      dataPointsCount: primaryLogs.length,
    };
  }

  /**
   * Calculate sleep debt as cumulative deviation from optimal TST
   * Negative value indicates deficit
   */
  private calculateSleepDebt(logs: SleepLog[]): number | null {
    if (logs.length === 0) return null;

    let debt = 0;
    for (const log of logs) {
      const tst = log.total_duration_seconds - log.awake_duration_seconds;
      const deviation = tst - SleepBaselineService.OPTIMAL_TST_SECONDS;
      debt += deviation;
    }
    return Math.round(debt);
  }

  /**
   * Calculate mean of values
   */
  private mean(values: number[]): number {
    if (values.length === 0) return 0;
    return values.reduce((sum, val) => sum + val, 0) / values.length;
  }

  /**
   * Calculate standard deviation
   */
  private std(values: number[], mean: number): number {
    if (values.length < 2) return 0;
    const squaredDiffs = values.map((val) => Math.pow(val - mean, 2));
    const variance = squaredDiffs.reduce((sum, val) => sum + val, 0) / (values.length - 1);
    return Math.sqrt(variance);
  }

  /**
   * Calculate z-score for a given value against baseline
   */
  calculateZScore(value: number, avg: number | null, std: number | null): number | null {
    if (avg === null || std === null || std === 0) {
      return null;
    }
    return (value - avg) / std;
  }

  /**
   * Convert sleep debt from seconds to hours for display
   */
  sleepDebtToHours(debtSeconds: number | null): number | null {
    if (debtSeconds === null) return null;
    return Math.round((debtSeconds / 3600) * 10) / 10; // Round to 1 decimal
  }
}

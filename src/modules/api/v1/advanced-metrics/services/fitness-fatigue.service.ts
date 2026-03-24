import { forwardRef, Inject, Injectable } from '@nestjs/common';
import {
  ACWRRiskLevel,
  NewFitnessFatigueDaily,
  OvertrainingRiskLevel,
  TrainingRecommendation,
} from 'src/database/interfaces';
import { formatDateToYMD } from 'src/lib/util';
import { FitnessFatigueRepository } from 'src/repositories/fitness-fatigue.repository';
import { TrainingStressRepository } from 'src/repositories/training-stress.repository';
import { WorkoutExecutionRepository } from 'src/repositories/workout-execution.repository';

import { TrainingStressService } from './training-stress.service';

export interface FitnessFatigueResult {
  date: string;
  ctl: number; // Chronic Training Load (Fitness)
  atl: number; // Acute Training Load (Fatigue)
  tsb: number; // Training Stress Balance (Form)
  dailyTss: number;
  rampRate: number | null;
  recommendation: TrainingRecommendation;
  acwr: number | null; // Acute:Chronic Workload Ratio
  acwrRiskLevel: ACWRRiskLevel | null;
  monotony: number | null; // Training monotony (7-day)
  strain: number | null; // Training strain (weekly load × monotony)
  overtrainingRisk: OvertrainingRiskLevel | null;
}

export interface PMCChartData {
  data: FitnessFatigueResult[];
  currentForm: {
    ctl: number;
    atl: number;
    tsb: number;
    recommendation: TrainingRecommendation;
    recommendationText: string;
  };
}

@Injectable()
export class FitnessFatigueService {
  // Constants for exponential decay
  private readonly CTL_DECAY = 42; // Chronic Training Load time constant (days)
  private readonly ATL_DECAY = 7; // Acute Training Load time constant (days)

  constructor(
    private readonly fitnessFatigueRepository: FitnessFatigueRepository,
    private readonly trainingStressRepository: TrainingStressRepository,
    private readonly workoutExecutionRepository: WorkoutExecutionRepository,
    @Inject(forwardRef(() => TrainingStressService))
    private readonly trainingStressService: TrainingStressService,
  ) {}

  /**
   * Calculate and update CTL/ATL/TSB for a user
   * Should be called after each workout or daily as a batch job
   */
  async calculateForUser(userId: string, targetDate?: Date): Promise<FitnessFatigueResult> {
    const date = targetDate || new Date();
    date.setHours(0, 0, 0, 0);

    // Get yesterday's values (or start from zero)
    const yesterday = new Date(date);
    yesterday.setDate(yesterday.getDate() - 1);

    const yesterdayData = await this.fitnessFatigueRepository.findByUserAndDate(userId, yesterday);
    const previousCTL = yesterdayData ? Number.parseFloat(yesterdayData.ctl) : 0;
    const previousATL = yesterdayData ? Number.parseFloat(yesterdayData.atl) : 0;

    // Get today's TSS
    const dailyTss = await this.trainingStressRepository.getTotalTSSForDate(userId, date);

    // Calculate new CTL and ATL using exponential decay
    // CTL = Yesterday's CTL + (Today's TSS - Yesterday's CTL) / 42
    // ATL = Yesterday's ATL + (Today's TSS - Yesterday's ATL) / 7
    const ctl = previousCTL + (dailyTss - previousCTL) / this.CTL_DECAY;
    const atl = previousATL + (dailyTss - previousATL) / this.ATL_DECAY;
    const tsb = ctl - atl;

    // Calculate ramp rate (weekly CTL change)
    const rampRate = await this.calculateRampRate(userId, date, ctl);

    // Calculate ACWR (Acute:Chronic Workload Ratio)
    const acwr = ctl > 0 ? atl / ctl : 0;
    const acwrRiskLevel = this.getACWRRiskLevel(acwr);

    // Calculate Monotony/Strain (7-day window)
    const monotonyStrain = await this.calculateMonotonyStrain(userId, date, dailyTss);

    // Count workouts for the day
    const startOfDay = new Date(date);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    const workouts = await this.workoutExecutionRepository.findMany({
      filter: {
        userId,
        completedDateFrom: startOfDay,
        completedDateTo: endOfDay,
        completed: true,
      },
    });

    // Store the result
    const data: NewFitnessFatigueDaily = {
      user_id: userId,
      date: formatDateToYMD(date),
      ctl: Math.round(ctl * 100) / 100,
      atl: Math.round(atl * 100) / 100,
      tsb: Math.round(tsb * 100) / 100,
      daily_tss: Math.round(dailyTss * 100) / 100,
      ramp_rate: rampRate,
      acwr: acwr > 0 ? Math.round(acwr * 100) / 100 : null,
      acwr_risk_level: acwr > 0 ? acwrRiskLevel : null,
      monotony: monotonyStrain.monotony,
      strain: monotonyStrain.strain,
      overtraining_risk: monotonyStrain.risk,
      workout_count: workouts.length,
    };

    await this.fitnessFatigueRepository.upsert(data);

    return {
      date: formatDateToYMD(date),
      ctl: Math.round(ctl * 100) / 100,
      atl: Math.round(atl * 100) / 100,
      tsb: Math.round(tsb * 100) / 100,
      dailyTss: Math.round(dailyTss * 100) / 100,
      rampRate,
      recommendation: this.getRecommendation(tsb),
      acwr: acwr > 0 ? Math.round(acwr * 100) / 100 : null,
      acwrRiskLevel: acwr > 0 ? acwrRiskLevel : null,
      monotony: monotonyStrain.monotony,
      strain: monotonyStrain.strain,
      overtrainingRisk: monotonyStrain.risk,
    };
  }

  /**
   * Backfill historical data for a user
   */
  async backfillHistory(userId: string, days: number = 90): Promise<void> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    startDate.setHours(0, 0, 0, 0);

    const endDate = new Date();
    endDate.setHours(23, 59, 59, 999);

    // First, find all completed workouts in the date range
    const workouts = await this.workoutExecutionRepository.findMany({
      filter: {
        userId,
        completedDateFrom: startDate,
        completedDateTo: endDate,
        completed: true,
      },
    });

    // Calculate TSS for any workouts that don't have it yet
    for (const workout of workouts) {
      const existingTss = await this.trainingStressRepository.findByWorkoutExecutionId(workout.id);
      if (!existingTss) {
        await this.trainingStressService.calculateForWorkout(workout.id);
      }
    }

    // Reset endDate for the day-by-day calculation
    endDate.setHours(0, 0, 0, 0);

    // Delete existing fitness/fatigue data for the range
    await this.fitnessFatigueRepository.deleteByUserAndDateRange(userId, startDate, endDate);

    // Estimate initial CTL/ATL for new users (PMC seeding)
    // Check if user has any data before the start date
    const dataBeforeStart = await this.fitnessFatigueRepository.findByUserAndDate(
      userId,
      new Date(startDate.getTime() - 24 * 60 * 60 * 1000), // day before start
    );

    let initialCTL = 0;
    let initialATL = 0;

    if (!dataBeforeStart) {
      // No historical data - estimate baseline from first 14 days of training
      const seedingPeriodEnd = new Date(startDate);
      seedingPeriodEnd.setDate(seedingPeriodEnd.getDate() + 14);

      let totalTSS = 0;
      let daysWithData = 0;

      const seedDate = new Date(startDate);
      while (seedDate <= seedingPeriodEnd && seedDate <= endDate) {
        const dailyTss = await this.trainingStressRepository.getTotalTSSForDate(userId, seedDate);
        if (dailyTss > 0) {
          totalTSS += dailyTss;
          daysWithData++;
        }
        seedDate.setDate(seedDate.getDate() + 1);
      }

      if (daysWithData > 0) {
        // Calculate average daily TSS and use it as the steady-state estimate
        // At steady state: CTL ≈ ATL ≈ average daily TSS
        const avgDailyTSS = totalTSS / daysWithData;

        // Assume they were training at ~80% of this load before starting to track
        // This prevents the "new user shock" where first workouts seem extremely fatiguing
        initialCTL = avgDailyTSS * 0.8;
        initialATL = avgDailyTSS * 0.8;
      }
    }

    // Store the seeded initial values for the day before start
    if (initialCTL > 0 || initialATL > 0) {
      const dayBeforeStart = new Date(startDate);
      dayBeforeStart.setDate(dayBeforeStart.getDate() - 1);

      const seedData: NewFitnessFatigueDaily = {
        user_id: userId,
        date: formatDateToYMD(dayBeforeStart),
        ctl: Math.round(initialCTL * 100) / 100,
        atl: Math.round(initialATL * 100) / 100,
        tsb: 0, // At steady state, TSB ≈ 0
        daily_tss: 0,
        ramp_rate: null,
        workout_count: 0,
      };

      await this.fitnessFatigueRepository.upsert(seedData);
    }

    // Calculate day by day
    const currentDate = new Date(startDate);
    while (currentDate <= endDate) {
      await this.calculateForUser(userId, new Date(currentDate));
      currentDate.setDate(currentDate.getDate() + 1);
    }
  }

  /**
   * Get PMC chart data for a date range
   * Fills gaps and extends to today with proper exponential decay
   */
  async getPMCChartData(userId: string, days: number = 90): Promise<PMCChartData> {
    const records = await this.fitnessFatigueRepository.getDateRange(userId, days);

    // If no data, return empty with zeros
    if (records.length === 0) {
      return {
        data: [],
        currentForm: {
          ctl: 0,
          atl: 0,
          tsb: 0,
          recommendation: TrainingRecommendation.NEUTRAL,
          recommendationText: 'No training data available',
        },
      };
    }

    // Create a map of existing records by date
    const recordMap = new Map<string, (typeof records)[0]>();
    for (const r of records) {
      recordMap.set(formatDateToYMD(r.date), r);
    }

    // Generate all dates from (today - days) to today
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const startDate = new Date(today);
    startDate.setDate(startDate.getDate() - days + 1);

    const data: FitnessFatigueResult[] = [];

    // Decay factors per day with no training (TSS = 0)
    const ctlDecayFactor = 1 - 1 / this.CTL_DECAY; // 41/42 ≈ 0.976
    const atlDecayFactor = 1 - 1 / this.ATL_DECAY; // 6/7 ≈ 0.857

    let lastCTL = 0;
    let lastATL = 0;

    const currentDate = new Date(startDate);
    while (currentDate <= today) {
      const dateStr = formatDateToYMD(currentDate);
      const existingRecord = recordMap.get(dateStr);

      if (existingRecord) {
        // Use actual data
        lastCTL = Number.parseFloat(existingRecord.ctl);
        lastATL = Number.parseFloat(existingRecord.atl);
        const tsb = Number.parseFloat(existingRecord.tsb);

        data.push({
          date: dateStr,
          ctl: lastCTL,
          atl: lastATL,
          tsb,
          dailyTss: Number.parseFloat(existingRecord.daily_tss),
          rampRate: existingRecord.ramp_rate ? Number.parseFloat(existingRecord.ramp_rate) : null,
          recommendation: this.getRecommendation(tsb),
          acwr: existingRecord.acwr ? Number.parseFloat(existingRecord.acwr) : null,
          acwrRiskLevel: (existingRecord.acwr_risk_level as ACWRRiskLevel) || null,
          monotony: existingRecord.monotony ? Number.parseFloat(existingRecord.monotony) : null,
          strain: existingRecord.strain ? Number.parseFloat(existingRecord.strain) : null,
          overtrainingRisk: (existingRecord.overtraining_risk as OvertrainingRiskLevel) || null,
        });
      } else if (lastCTL > 0 || lastATL > 0) {
        // No data for this day but we have previous values - apply decay
        lastCTL = Math.round(lastCTL * ctlDecayFactor * 100) / 100;
        lastATL = Math.round(lastATL * atlDecayFactor * 100) / 100;

        // CTL/ATL decay very slowly - floor at 0.1 to avoid floating point noise
        if (lastCTL < 0.1) lastCTL = 0;
        if (lastATL < 0.1) lastATL = 0;

        const tsb = Math.round((lastCTL - lastATL) * 100) / 100;

        // Calculate ACWR
        const acwr = lastCTL > 0 ? Math.round((lastATL / lastCTL) * 100) / 100 : null;

        data.push({
          date: dateStr,
          ctl: lastCTL,
          atl: lastATL,
          tsb,
          dailyTss: 0,
          rampRate: null,
          recommendation: this.getRecommendation(tsb),
          acwr,
          acwrRiskLevel: acwr ? this.getACWRRiskLevel(acwr) : null,
          monotony: null,
          strain: null,
          overtrainingRisk: null,
        });
      }
      // If lastCTL and lastATL are both 0, skip this date (no data yet)

      currentDate.setDate(currentDate.getDate() + 1);
    }

    // Get current form from the last data point
    const latestData = data[data.length - 1];
    const currentTsb = latestData?.tsb ?? 0;
    const recommendation = this.getRecommendation(currentTsb);

    return {
      data,
      currentForm: {
        ctl: latestData?.ctl ?? 0,
        atl: latestData?.atl ?? 0,
        tsb: currentTsb,
        recommendation,
        recommendationText: this.getRecommendationText(recommendation, currentTsb),
      },
    };
  }

  /**
   * Get the latest fitness/fatigue data for a user
   */
  async getLatest(userId: string): Promise<FitnessFatigueResult | null> {
    const latest = await this.fitnessFatigueRepository.getLatestForUser(userId);

    if (!latest) return null;

    const tsb = Number.parseFloat(latest.tsb);

    return {
      date: formatDateToYMD(latest.date),
      ctl: Number.parseFloat(latest.ctl),
      atl: Number.parseFloat(latest.atl),
      tsb,
      dailyTss: Number.parseFloat(latest.daily_tss),
      rampRate: latest.ramp_rate ? Number.parseFloat(latest.ramp_rate) : null,
      recommendation: this.getRecommendation(tsb),
      acwr: latest.acwr ? Number.parseFloat(latest.acwr) : null,
      acwrRiskLevel: (latest.acwr_risk_level as ACWRRiskLevel) || null,
      monotony: latest.monotony ? Number.parseFloat(latest.monotony) : null,
      strain: latest.strain ? Number.parseFloat(latest.strain) : null,
      overtrainingRisk: (latest.overtraining_risk as OvertrainingRiskLevel) || null,
    };
  }

  /**
   * Calculate ramp rate (weekly CTL change)
   */
  private async calculateRampRate(userId: string, date: Date, currentCTL: number): Promise<number | null> {
    const weekAgo = new Date(date);
    weekAgo.setDate(weekAgo.getDate() - 7);

    const weekAgoData = await this.fitnessFatigueRepository.findByUserAndDate(userId, weekAgo);

    if (!weekAgoData) return null;

    const weekAgoCTL = Number.parseFloat(weekAgoData.ctl);
    const rampRate = currentCTL - weekAgoCTL;

    return Math.round(rampRate * 100) / 100;
  }

  /**
   * Get ACWR risk level based on acute:chronic workload ratio
   * Risk zones:
   * - < 0.8: Undertraining (Blue)
   * - 0.8 - 1.3: Optimal (Green)
   * - 1.3 - 1.5: Elevated (Yellow)
   * - > 1.5: High (Red)
   */
  private getACWRRiskLevel(acwr: number): ACWRRiskLevel {
    if (acwr < 0.8) return ACWRRiskLevel.UNDERTRAINING;
    if (acwr <= 1.3) return ACWRRiskLevel.OPTIMAL;
    if (acwr <= 1.5) return ACWRRiskLevel.ELEVATED;
    return ACWRRiskLevel.HIGH;
  }

  /**
   * Calculate monotony and strain metrics for overtraining detection
   * Uses a 7-day rolling window
   *
   * Formulas:
   * - Monotony = Average Daily Load / Standard Deviation of Daily Load
   * - Strain = Weekly Total Load × Monotony
   *
   * Thresholds:
   * - Monotony > 1.5: Warning, > 2.0: Danger
   * - Strain > 1500: Warning, > 2000: Danger
   */
  private async calculateMonotonyStrain(
    userId: string,
    date: Date,
    todayTss: number,
  ): Promise<{ monotony: number | null; strain: number | null; risk: OvertrainingRiskLevel | null }> {
    // Get last 6 days of TSS (we have today's TSS already)
    const weekStart = new Date(date);
    weekStart.setDate(weekStart.getDate() - 6);

    const records = await this.fitnessFatigueRepository.findMany({
      filter: {
        userId,
        dateFrom: weekStart,
        dateTo: new Date(date.getTime() - 24 * 60 * 60 * 1000), // Up to yesterday
      },
      sort: [{ field: 'date', direction: 'asc' }],
    });

    // Build 7-day TSS array
    const dailyTSS: number[] = records.map((r) => Number.parseFloat(r.daily_tss));
    dailyTSS.push(todayTss); // Add today's TSS

    if (dailyTSS.length < 7) {
      return { monotony: null, strain: null, risk: null };
    }

    // Calculate average
    const avg = dailyTSS.reduce((a, b) => a + b, 0) / dailyTSS.length;

    // Calculate standard deviation
    const variance = dailyTSS.reduce((sum, val) => sum + Math.pow(val - avg, 2), 0) / dailyTSS.length;
    const stdDev = Math.sqrt(variance);

    // Calculate monotony (avoid division by zero)
    const monotony = stdDev > 0 ? avg / stdDev : 0;

    // Calculate strain (weekly total × monotony)
    const weeklyTotal = dailyTSS.reduce((a, b) => a + b, 0);
    const strain = weeklyTotal * monotony;

    // Determine risk level
    let risk: OvertrainingRiskLevel = OvertrainingRiskLevel.LOW;
    if (strain > 2000 || monotony > 2.0) {
      risk = OvertrainingRiskLevel.HIGH;
    } else if (strain > 1500 || monotony > 1.5) {
      risk = OvertrainingRiskLevel.MODERATE;
    }

    return {
      monotony: Math.round(monotony * 100) / 100,
      strain: Math.round(strain * 100) / 100,
      risk,
    };
  }

  /**
   * Get training recommendation based on TSB
   */
  private getRecommendation(tsb: number): TrainingRecommendation {
    if (tsb > 25) return TrainingRecommendation.VERY_FRESH;
    if (tsb > 5) return TrainingRecommendation.FRESH;
    if (tsb > -10) return TrainingRecommendation.NEUTRAL;
    if (tsb > -25) return TrainingRecommendation.FATIGUED;
    return TrainingRecommendation.VERY_FATIGUED;
  }

  /**
   * Get human-readable recommendation text
   */
  private getRecommendationText(recommendation: TrainingRecommendation, tsb: number): string {
    const tsbFormatted = tsb >= 0 ? `+${Math.round(tsb)}` : Math.round(tsb).toString();

    switch (recommendation) {
      case TrainingRecommendation.VERY_FRESH:
        return `Very Fresh (${tsbFormatted}) - Ready for race or peak performance`;
      case TrainingRecommendation.FRESH:
        return `Fresh (${tsbFormatted}) - Good for hard training or key workouts`;
      case TrainingRecommendation.NEUTRAL:
        return `Neutral (${tsbFormatted}) - Normal training load sustainable`;
      case TrainingRecommendation.FATIGUED:
        return `Fatigued (${tsbFormatted}) - Consider easy day or active recovery`;
      case TrainingRecommendation.VERY_FATIGUED:
        return `Very Fatigued (${tsbFormatted}) - Rest day recommended`;
    }
  }

  /**
   * Predict future TSB based on planned training
   */
  async predictFutureTSB(userId: string, plannedDailyTSS: number[]): Promise<FitnessFatigueResult[]> {
    const latest = await this.fitnessFatigueRepository.getLatestForUser(userId);

    let ctl = latest ? Number.parseFloat(latest.ctl) : 0;
    let atl = latest ? Number.parseFloat(latest.atl) : 0;

    const predictions: FitnessFatigueResult[] = [];
    const startDate = new Date();
    startDate.setDate(startDate.getDate() + 1);

    for (let i = 0; i < plannedDailyTSS.length; i++) {
      const date = new Date(startDate);
      date.setDate(date.getDate() + i);
      const dailyTss = plannedDailyTSS[i];

      ctl = ctl + (dailyTss - ctl) / this.CTL_DECAY;
      atl = atl + (dailyTss - atl) / this.ATL_DECAY;
      const tsb = ctl - atl;

      // Calculate ACWR for prediction
      const acwr = ctl > 0 ? atl / ctl : 0;

      predictions.push({
        date: formatDateToYMD(date),
        ctl: Math.round(ctl * 100) / 100,
        atl: Math.round(atl * 100) / 100,
        tsb: Math.round(tsb * 100) / 100,
        dailyTss,
        rampRate: null,
        recommendation: this.getRecommendation(tsb),
        acwr: acwr > 0 ? Math.round(acwr * 100) / 100 : null,
        acwrRiskLevel: acwr > 0 ? this.getACWRRiskLevel(acwr) : null,
        monotony: null, // Not calculated for predictions
        strain: null,
        overtrainingRisk: null,
      });
    }

    return predictions;
  }

  /**
   * Calculate optimal TSS for target TSB
   */
  calculateOptimalTSS(currentCTL: number, currentATL: number, targetTSB: number): number {
    // TSB = CTL - ATL
    // We want to find TSS that achieves target TSB

    // After one day with TSS:
    // new_CTL = CTL + (TSS - CTL) / 42
    // new_ATL = ATL + (TSS - ATL) / 7
    // new_TSB = new_CTL - new_ATL

    // Solving for TSS:
    // targetTSB = (CTL + (TSS - CTL) / 42) - (ATL + (TSS - ATL) / 7)
    // targetTSB = CTL + TSS/42 - CTL/42 - ATL - TSS/7 + ATL/7
    // targetTSB = CTL(1 - 1/42) - ATL(1 - 1/7) + TSS(1/42 - 1/7)
    // TSS(1/42 - 1/7) = targetTSB - CTL(41/42) + ATL(6/7)
    // TSS = (targetTSB - CTL(41/42) + ATL(6/7)) / (1/42 - 1/7)
    // TSS = (targetTSB - CTL(41/42) + ATL(6/7)) / (-5/42)
    // TSS = (targetTSB - CTL(41/42) + ATL(6/7)) * (-42/5)

    const numerator = targetTSB - currentCTL * (41 / 42) + currentATL * (6 / 7);
    const tss = numerator * (-42 / 5);

    return Math.max(0, Math.round(tss));
  }
}

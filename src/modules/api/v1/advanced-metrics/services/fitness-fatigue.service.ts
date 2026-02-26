import { Injectable } from '@nestjs/common';
import { NewFitnessFatigueDaily, TrainingRecommendation } from 'src/database/interfaces';
import { formatDateToYMD } from 'src/lib/util';
import { FitnessFatigueRepository } from 'src/repositories/fitness-fatigue.repository';
import { TrainingStressRepository } from 'src/repositories/training-stress.repository';
import { WorkoutExecutionRepository } from 'src/repositories/workout-execution.repository';

export interface FitnessFatigueResult {
  date: string;
  ctl: number; // Chronic Training Load (Fitness)
  atl: number; // Acute Training Load (Fatigue)
  tsb: number; // Training Stress Balance (Form)
  dailyTss: number;
  rampRate: number | null;
  recommendation: TrainingRecommendation;
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
    endDate.setHours(0, 0, 0, 0);

    // Delete existing data for the range
    await this.fitnessFatigueRepository.deleteByUserAndDateRange(userId, startDate, endDate);

    // Calculate day by day
    const currentDate = new Date(startDate);
    while (currentDate <= endDate) {
      await this.calculateForUser(userId, new Date(currentDate));
      currentDate.setDate(currentDate.getDate() + 1);
    }
  }

  /**
   * Get PMC chart data for a date range
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

    const data: FitnessFatigueResult[] = records.map((r) => ({
      date: formatDateToYMD(r.date),
      ctl: Number.parseFloat(r.ctl),
      atl: Number.parseFloat(r.atl),
      tsb: Number.parseFloat(r.tsb),
      dailyTss: Number.parseFloat(r.daily_tss),
      rampRate: r.ramp_rate ? Number.parseFloat(r.ramp_rate) : null,
      recommendation: this.getRecommendation(Number.parseFloat(r.tsb)),
    }));

    // Get current (latest) values
    const latest = records[records.length - 1];
    const currentTsb = Number.parseFloat(latest.tsb);
    const recommendation = this.getRecommendation(currentTsb);

    return {
      data,
      currentForm: {
        ctl: Number.parseFloat(latest.ctl),
        atl: Number.parseFloat(latest.atl),
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

      predictions.push({
        date: formatDateToYMD(date),
        ctl: Math.round(ctl * 100) / 100,
        atl: Math.round(atl * 100) / 100,
        tsb: Math.round(tsb * 100) / 100,
        dailyTss,
        rampRate: null,
        recommendation: this.getRecommendation(tsb),
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

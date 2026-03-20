import { Injectable } from '@nestjs/common';
import { FitnessFatigueService } from '../../advanced-metrics/services/fitness-fatigue.service';

export interface TaperAssessment {
  projectedTsb: number;
  assessment: 'optimal' | 'overtapered' | 'undertapered' | 'fatigued';
  timeFactor: number;
  description: string;
}

export interface TaperDay {
  date: string;
  suggestedTss: number;
  projectedCtl: number;
  projectedAtl: number;
  projectedTsb: number;
  description: string;
}

export interface TaperPlan {
  raceDate: string;
  daysUntilRace: number;
  currentCtl: number;
  currentAtl: number;
  currentTsb: number;
  targetTsb: number;
  projectedRaceDayTsb: number;
  raceDayAssessment: TaperAssessment;
  dailyPlan: TaperDay[];
  recommendations: string[];
}

@Injectable()
export class TaperOptimizationService {
  // TSB thresholds for race-day form
  private readonly TSB_OPTIMAL_MIN = 5;
  private readonly TSB_OPTIMAL_MAX = 25;
  private readonly TSB_OVERTAPERED = 30;

  constructor(private readonly fitnessFatigueService: FitnessFatigueService) {}

  /**
   * Calculate time adjustment factor based on projected TSB
   *
   * | Projected TSB | Assessment    | Time Factor |
   * |---------------|---------------|-------------|
   * | +5 to +25     | Optimal       | 0.98-1.00   |
   * | > +25         | Overtapered   | 1.00+       |
   * | -10 to +5     | Undertapered  | 1.00-1.01   |
   * | < -10         | Fatigued      | 1.02+       |
   */
  calculateFormAdjustment(projectedTsb: number): TaperAssessment {
    if (projectedTsb >= this.TSB_OPTIMAL_MIN && projectedTsb <= this.TSB_OPTIMAL_MAX) {
      // Optimal taper - could be 2% faster
      const optimality = (projectedTsb - this.TSB_OPTIMAL_MIN) / (this.TSB_OPTIMAL_MAX - this.TSB_OPTIMAL_MIN);
      const timeFactor = 1.0 - 0.02 * optimality;
      return {
        projectedTsb,
        assessment: 'optimal',
        timeFactor: Math.round(timeFactor * 1000) / 1000,
        description: `Form is optimal for race day. Expect peak performance with ${Math.round((1 - timeFactor) * 100)}% potential improvement.`,
      };
    }

    if (projectedTsb > this.TSB_OVERTAPERED) {
      // Overtapered - detraining penalty
      const excessTaper = projectedTsb - this.TSB_OVERTAPERED;
      const penalty = Math.min(0.03, excessTaper * 0.002); // Max 3% penalty
      return {
        projectedTsb,
        assessment: 'overtapered',
        timeFactor: 1.0 + penalty,
        description: `Risk of detraining. Consider adding light training to maintain fitness. Potential ${Math.round(penalty * 100)}% slowdown.`,
      };
    }

    if (projectedTsb >= -10) {
      // Undertapered
      const fatigue = this.TSB_OPTIMAL_MIN - projectedTsb;
      const penalty = Math.min(0.01, fatigue * 0.001);
      return {
        projectedTsb,
        assessment: 'undertapered',
        timeFactor: 1.0 + penalty,
        description: `Slightly undertapered. Consider reducing training volume leading up to race. Potential ${Math.round(penalty * 100)}% slowdown.`,
      };
    }

    // Fatigued
    const severeFatigue = Math.abs(projectedTsb + 10);
    const penalty = 0.02 + severeFatigue * 0.005; // 0.5% slower per point below -10
    return {
      projectedTsb,
      assessment: 'fatigued',
      timeFactor: Math.round((1.0 + Math.min(0.10, penalty)) * 1000) / 1000,
      description: `Significantly fatigued. Rest is essential before race. Potential ${Math.round(penalty * 100)}% slowdown if racing without recovery.`,
    };
  }

  /**
   * Generate a taper plan leading to race day
   */
  async generateTaperPlan(
    userId: string,
    raceDateStr: string,
    targetTsb: number = 15,
  ): Promise<TaperPlan> {
    const raceDate = new Date(raceDateStr);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const daysUntilRace = Math.ceil((raceDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

    // Get current fitness/fatigue state
    const current = await this.fitnessFatigueService.getLatest(userId);

    const currentCtl = current?.ctl || 0;
    const currentAtl = current?.atl || 0;
    const currentTsb = current?.tsb || 0;

    // Generate daily TSS plan to achieve target TSB
    const dailyPlan = this.calculateTaperSchedule(
      currentCtl,
      currentAtl,
      daysUntilRace,
      targetTsb,
    );

    // Project race day form
    const plannedTss = dailyPlan.map((d) => d.suggestedTss);
    const projectedForm = await this.fitnessFatigueService.predictFutureTSB(userId, plannedTss);

    const raceDayProjection = projectedForm[projectedForm.length - 1];
    const raceDayAssessment = this.calculateFormAdjustment(raceDayProjection?.tsb || currentTsb);

    // Generate recommendations
    const recommendations = this.generateRecommendations(
      currentCtl,
      currentTsb,
      daysUntilRace,
      raceDayAssessment,
    );

    return {
      raceDate: raceDateStr,
      daysUntilRace,
      currentCtl,
      currentAtl,
      currentTsb,
      targetTsb,
      projectedRaceDayTsb: raceDayProjection?.tsb || currentTsb,
      raceDayAssessment,
      dailyPlan,
      recommendations,
    };
  }

  /**
   * Calculate daily TSS to achieve target TSB by race day
   */
  private calculateTaperSchedule(
    currentCtl: number,
    currentAtl: number,
    daysUntilRace: number,
    targetTsb: number,
  ): TaperDay[] {
    const plan: TaperDay[] = [];
    const CTL_DECAY = 42;
    const ATL_DECAY = 7;

    let ctl = currentCtl;
    let atl = currentAtl;

    // Calculate typical daily TSS (based on current ATL)
    const normalDailyTss = atl;

    // Taper strategy: gradually reduce TSS
    for (let day = 1; day <= daysUntilRace; day++) {
      const date = new Date();
      date.setDate(date.getDate() + day);
      const dateStr = date.toISOString().split('T')[0];

      // Progressive taper reduction
      const daysRemaining = daysUntilRace - day + 1;
      const taperRatio = this.calculateTaperRatio(day, daysUntilRace);

      let suggestedTss = Math.round(normalDailyTss * taperRatio);

      // Ensure we're on track for target TSB
      // TSB = CTL - ATL, we want to increase TSB by reducing ATL faster than CTL
      const projectedTsb = ctl - atl;
      const targetTsbAtDay = currentCtl - currentAtl + ((targetTsb - (currentCtl - currentAtl)) * day / daysUntilRace);

      // Adjust TSS if we're off track
      if (projectedTsb < targetTsbAtDay - 5) {
        // Need to rest more
        suggestedTss = Math.round(suggestedTss * 0.7);
      } else if (projectedTsb > targetTsbAtDay + 5) {
        // Can train more
        suggestedTss = Math.round(suggestedTss * 1.3);
      }

      // Update projections
      const dailyTss = Math.max(0, suggestedTss);
      ctl = ctl + (dailyTss - ctl) / CTL_DECAY;
      atl = atl + (dailyTss - atl) / ATL_DECAY;
      const tsb = ctl - atl;

      let description = '';
      if (daysRemaining === 1) {
        description = 'Race day - rest or very light shakeout';
      } else if (daysRemaining === 2) {
        description = 'Day before race - easy recovery only';
      } else if (daysRemaining <= 4) {
        description = 'Final taper - short easy sessions';
      } else if (daysRemaining <= 7) {
        description = 'Active taper - reduced volume and intensity';
      } else if (daysRemaining <= 14) {
        description = 'Early taper - begin reducing volume';
      } else {
        description = 'Normal training with slight reduction';
      }

      plan.push({
        date: dateStr,
        suggestedTss: dailyTss,
        projectedCtl: Math.round(ctl * 100) / 100,
        projectedAtl: Math.round(atl * 100) / 100,
        projectedTsb: Math.round(tsb * 100) / 100,
        description,
      });
    }

    return plan;
  }

  /**
   * Calculate taper ratio for a given day
   * Uses exponential taper model
   */
  private calculateTaperRatio(dayNumber: number, totalDays: number): number {
    const daysFromRace = totalDays - dayNumber + 1;

    if (totalDays <= 7) {
      // Short taper
      if (daysFromRace <= 1) return 0.2;
      if (daysFromRace <= 2) return 0.3;
      return 0.5;
    }

    if (totalDays <= 14) {
      // Standard 2-week taper
      if (daysFromRace <= 1) return 0.2;
      if (daysFromRace <= 2) return 0.3;
      if (daysFromRace <= 4) return 0.4;
      if (daysFromRace <= 7) return 0.6;
      return 0.8;
    }

    // 3-week taper
    if (daysFromRace <= 1) return 0.2;
    if (daysFromRace <= 2) return 0.3;
    if (daysFromRace <= 4) return 0.4;
    if (daysFromRace <= 7) return 0.5;
    if (daysFromRace <= 14) return 0.7;
    return 0.9;
  }

  /**
   * Generate taper recommendations
   */
  private generateRecommendations(
    currentCtl: number,
    currentTsb: number,
    daysUntilRace: number,
    assessment: TaperAssessment,
  ): string[] {
    const recommendations: string[] = [];

    // General fitness assessment
    if (currentCtl < 30) {
      recommendations.push('Your fitness level is moderate. Focus on maintaining current fitness while tapering.');
    } else if (currentCtl > 70) {
      recommendations.push('Excellent fitness base. A proper taper will help you peak on race day.');
    }

    // Current fatigue
    if (currentTsb < -15) {
      recommendations.push('You are currently very fatigued. Prioritize rest in the early taper phase.');
    } else if (currentTsb > 15) {
      recommendations.push('You are well-rested. Be careful not to over-taper and lose fitness.');
    }

    // Time until race
    if (daysUntilRace < 7) {
      recommendations.push('Limited time for taper. Focus on rest, sleep, and nutrition.');
    } else if (daysUntilRace >= 14 && daysUntilRace <= 21) {
      recommendations.push('Ideal taper length. Gradually reduce volume while maintaining some intensity.');
    } else if (daysUntilRace > 21) {
      recommendations.push('Extended time until race. Maintain training for another week before starting taper.');
    }

    // Assessment-specific recommendations
    switch (assessment.assessment) {
      case 'optimal':
        recommendations.push('Your taper plan is on track for optimal race day performance.');
        break;
      case 'overtapered':
        recommendations.push('Risk of detraining. Include short, high-quality sessions to maintain sharpness.');
        break;
      case 'undertapered':
        recommendations.push('Consider reducing training load more aggressively to arrive fresher.');
        break;
      case 'fatigued':
        recommendations.push('Prioritize sleep, nutrition, and complete rest days to recover before race day.');
        break;
    }

    // General advice
    recommendations.push('Maintain normal sleep schedule and increase sleep by 30-60 min if possible.');
    recommendations.push('Stay hydrated and focus on carbohydrate loading 2-3 days before the race.');

    return recommendations;
  }

  /**
   * Project TSB for a specific date given current state and planned training
   */
  async projectTsbForDate(userId: string, targetDate: Date): Promise<number> {
    const current = await this.fitnessFatigueService.getLatest(userId);
    if (!current) return 0;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const daysUntil = Math.ceil((targetDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

    if (daysUntil <= 0) {
      return current.tsb;
    }

    // Assume average daily TSS based on current ATL for days without planned workouts
    const avgDailyTss = current.atl * 0.5; // Assume moderate taper
    const plannedTss = Array(daysUntil).fill(avgDailyTss);

    const projections = await this.fitnessFatigueService.predictFutureTSB(userId, plannedTss);

    return projections[projections.length - 1]?.tsb || current.tsb;
  }
}

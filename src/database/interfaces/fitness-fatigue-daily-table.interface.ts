import type { ColumnType, Insertable, Selectable, Updateable } from 'kysely';

export interface FitnessFatigueDailyMetadata {
  workoutIds?: string[];
  tssBreakdown?: { workoutId: string; tss: number }[];
  notes?: string;
}

export interface FitnessFatigueDailyTable {
  id: ColumnType<string, string | undefined, never>;
  user_id: string;
  date: ColumnType<Date, Date | string, Date | string>;
  ctl: ColumnType<string, string | number, string | number>; // Chronic Training Load (Fitness)
  atl: ColumnType<string, string | number, string | number>; // Acute Training Load (Fatigue)
  tsb: ColumnType<string, string | number, string | number>; // Training Stress Balance (Form)
  daily_tss: ColumnType<string, string | number, string | number>; // Sum of TSS for the day
  ramp_rate: ColumnType<string | null, string | number | null, string | number | null>; // Weekly CTL change rate
  acwr: ColumnType<string | null, string | number | null, string | number | null>; // Acute:Chronic Workload Ratio
  acwr_risk_level: ColumnType<string | null, string | null, string | null>; // 'undertraining' | 'optimal' | 'elevated' | 'high'
  monotony: ColumnType<string | null, string | number | null, string | number | null>; // Training monotony (7-day)
  strain: ColumnType<string | null, string | number | null, string | number | null>; // Training strain (weekly load × monotony)
  overtraining_risk: ColumnType<string | null, string | null, string | null>; // 'low' | 'moderate' | 'high'
  workout_count: ColumnType<number, number | undefined, number>;
  metadata: ColumnType<
    FitnessFatigueDailyMetadata | null,
    FitnessFatigueDailyMetadata | null,
    FitnessFatigueDailyMetadata | null
  >;
  created_at: ColumnType<Date, never, never>;
  updated_at: ColumnType<Date, never, Date>;
}

export type FitnessFatigueDaily = Selectable<FitnessFatigueDailyTable>;
export type NewFitnessFatigueDaily = Insertable<FitnessFatigueDailyTable>;
export type UpdateFitnessFatigueDaily = Updateable<FitnessFatigueDailyTable>;

// Helper types for TSB-based recommendations
export const TrainingRecommendation = {
  VERY_FRESH: 'very_fresh', // TSB > 25
  FRESH: 'fresh', // TSB 5 to 25
  NEUTRAL: 'neutral', // TSB -10 to 5
  FATIGUED: 'fatigued', // TSB -25 to -10
  VERY_FATIGUED: 'very_fatigued', // TSB < -25
} as const;

export type TrainingRecommendation = (typeof TrainingRecommendation)[keyof typeof TrainingRecommendation];

// ACWR (Acute:Chronic Workload Ratio) risk levels
export const ACWRRiskLevel = {
  UNDERTRAINING: 'undertraining', // ACWR < 0.8
  OPTIMAL: 'optimal', // ACWR 0.8 - 1.3
  ELEVATED: 'elevated', // ACWR 1.3 - 1.5
  HIGH: 'high', // ACWR > 1.5
} as const;

export type ACWRRiskLevel = (typeof ACWRRiskLevel)[keyof typeof ACWRRiskLevel];

// Overtraining risk levels based on monotony/strain
export const OvertrainingRiskLevel = {
  LOW: 'low',
  MODERATE: 'moderate', // Monotony > 1.5 or Strain > 1500
  HIGH: 'high', // Monotony > 2.0 or Strain > 2000
} as const;

export type OvertrainingRiskLevel = (typeof OvertrainingRiskLevel)[keyof typeof OvertrainingRiskLevel];

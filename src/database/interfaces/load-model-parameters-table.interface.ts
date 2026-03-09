import type { ColumnType, Insertable, Selectable, Updateable } from 'kysely';

export interface ParameterSnapshot {
  date: string;
  params: {
    aerobic_ctl_decay: number;
    aerobic_atl_decay: number;
    msk_ctl_decay: number;
    msk_atl_decay: number;
    neural_ctl_decay: number;
    neural_atl_decay: number;
    run_aerobic_coef: number;
    bike_aerobic_coef: number;
    swim_aerobic_coef: number;
    strength_aerobic_coef: number;
    w_sleep: number;
    w_alcohol: number;
    w_stress: number;
  };
  mae?: number;
}

export interface PredictionError {
  date: string;
  predicted: number;
  actual: number;
  error: number;
  features?: {
    aerobic_tsb?: number;
    msk_tsb?: number;
    neural_tsb?: number;
    sleep_quality?: number;
    alcohol_units?: number;
    stress_level?: number;
  };
}

export interface LoadModelParametersTable {
  id: ColumnType<string, string | undefined, never>;
  user_id: string;

  // Time constants (personalizable via Bayesian learning)
  aerobic_ctl_decay: ColumnType<string, string | number | undefined, string | number>;
  aerobic_atl_decay: ColumnType<string, string | number | undefined, string | number>;
  msk_ctl_decay: ColumnType<string, string | number | undefined, string | number>;
  msk_atl_decay: ColumnType<string, string | number | undefined, string | number>;
  neural_ctl_decay: ColumnType<string, string | number | undefined, string | number>;
  neural_atl_decay: ColumnType<string, string | number | undefined, string | number>;

  // Sport scaling coefficients
  run_aerobic_coef: ColumnType<string, string | number | undefined, string | number>;
  bike_aerobic_coef: ColumnType<string, string | number | undefined, string | number>;
  swim_aerobic_coef: ColumnType<string, string | number | undefined, string | number>;
  strength_aerobic_coef: ColumnType<string, string | number | undefined, string | number>;

  // Recovery journal weights
  w_sleep: ColumnType<string, string | number | undefined, string | number>;
  w_alcohol: ColumnType<string, string | number | undefined, string | number>;
  w_stress: ColumnType<string, string | number | undefined, string | number>;

  // Bayesian learning state
  parameter_confidence: ColumnType<string, string | number | undefined, string | number>;
  data_points_used: ColumnType<number, number | undefined, number>;
  last_update_date: ColumnType<Date | null, Date | string | null, Date | string | null>;

  // Rolling prediction accuracy
  mae_7day: ColumnType<string | null, string | number | null, string | number | null>;
  mae_30day: ColumnType<string | null, string | number | null, string | number | null>;

  // Parameter history for rollback (last 10 snapshots)
  parameter_history: ColumnType<ParameterSnapshot[], ParameterSnapshot[] | undefined, ParameterSnapshot[]>;

  // Error tracking (last 90 days of prediction errors)
  prediction_errors: ColumnType<PredictionError[], PredictionError[] | undefined, PredictionError[]>;

  created_at: ColumnType<Date, never, never>;
  updated_at: ColumnType<Date, never, Date>;
}

export type LoadModelParameters = Selectable<LoadModelParametersTable>;
export type NewLoadModelParameters = Insertable<LoadModelParametersTable>;
export type UpdateLoadModelParameters = Updateable<LoadModelParametersTable>;

// Default parameter values interface
export interface LoadModelParameterValues {
  aerobic_ctl_decay: number;
  aerobic_atl_decay: number;
  msk_ctl_decay: number;
  msk_atl_decay: number;
  neural_ctl_decay: number;
  neural_atl_decay: number;
  run_aerobic_coef: number;
  bike_aerobic_coef: number;
  swim_aerobic_coef: number;
  strength_aerobic_coef: number;
  w_sleep: number;
  w_alcohol: number;
  w_stress: number;
  parameter_confidence: number;
  data_points_used: number;
}

// Default parameter values
export const DefaultLoadModelParameters: LoadModelParameterValues = {
  aerobic_ctl_decay: 42,
  aerobic_atl_decay: 7,
  msk_ctl_decay: 21,
  msk_atl_decay: 5,
  neural_ctl_decay: 10,
  neural_atl_decay: 3,
  run_aerobic_coef: 1.0,
  bike_aerobic_coef: 0.85,
  swim_aerobic_coef: 0.7,
  strength_aerobic_coef: 0.3,
  w_sleep: 0.3,
  w_alcohol: 0.2,
  w_stress: 0.15,
  parameter_confidence: 0,
  data_points_used: 0,
};

// Learnable parameter configuration
export interface LearnableParameterConfig {
  default: number;
  bounds: [number, number];
  learningRate: number;
}

export const LearnableParameters: Record<string, LearnableParameterConfig> = {
  aerobic_ctl_decay: { default: 42, bounds: [28, 60], learningRate: 0.1 },
  aerobic_atl_decay: { default: 7, bounds: [4, 14], learningRate: 0.05 },
  msk_ctl_decay: { default: 21, bounds: [14, 35], learningRate: 0.1 },
  msk_atl_decay: { default: 5, bounds: [3, 10], learningRate: 0.05 },
  neural_ctl_decay: { default: 10, bounds: [7, 21], learningRate: 0.1 },
  neural_atl_decay: { default: 3, bounds: [2, 7], learningRate: 0.05 },
  run_aerobic_coef: { default: 1.0, bounds: [0.7, 1.3], learningRate: 0.02 },
  bike_aerobic_coef: { default: 0.85, bounds: [0.5, 1.2], learningRate: 0.02 },
  swim_aerobic_coef: { default: 0.7, bounds: [0.4, 1.0], learningRate: 0.02 },
  strength_aerobic_coef: { default: 0.3, bounds: [0.1, 0.6], learningRate: 0.02 },
  w_sleep: { default: 0.3, bounds: [0.1, 0.5], learningRate: 0.01 },
  w_alcohol: { default: 0.2, bounds: [0.05, 0.4], learningRate: 0.01 },
  w_stress: { default: 0.15, bounds: [0.05, 0.3], learningRate: 0.01 },
};

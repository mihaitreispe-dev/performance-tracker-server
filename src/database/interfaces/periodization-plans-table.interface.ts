import { Generated, Insertable, Selectable, Updateable, ColumnType } from 'kysely';

export type PeriodizationStatus = 'suggested' | 'accepted' | 'custom';
export type PeriodizationCreator = 'system' | 'coach' | 'athlete';

export interface PeriodizationPhase {
  name: string;
  start_date: string;
  end_date: string;
  weeks: number;
  focus: string;
  description: string | null;
  volume_percentage: number;
  intensity_percentage: number;
}

export interface PeriodizationPlansTable {
  id: Generated<string>;
  athlete_race_id: string;
  status: PeriodizationStatus;
  // JSONB: select returns parsed array, insert/update accepts string or array
  phases: ColumnType<PeriodizationPhase[], PeriodizationPhase[] | string, PeriodizationPhase[] | string>;
  created_by: PeriodizationCreator;
  created_at: Generated<Date>;
  modified_at: Generated<Date>;
}

export type PeriodizationPlan = Selectable<PeriodizationPlansTable>;
export type NewPeriodizationPlan = Insertable<PeriodizationPlansTable>;
export type PeriodizationPlanUpdate = Updateable<PeriodizationPlansTable>;

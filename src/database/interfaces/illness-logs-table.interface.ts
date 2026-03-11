import { Generated, Insertable, Selectable, Updateable } from 'kysely';

import { Timestamp } from './timestamp';

export enum IllnessType {
  COLD = 'cold',
  FLU = 'flu',
  STOMACH = 'stomach',
  FEVER = 'fever',
  FATIGUE = 'fatigue',
  COVID = 'covid',
  ALLERGIES = 'allergies',
  HEADACHE = 'headache',
  OTHER = 'other',
}

export interface IllnessLogsTable {
  id: Generated<string>;
  user_id: string;
  illness_type: IllnessType;
  severity: number; // 1-10
  start_date: Date | string;
  end_date: Date | string | null;
  symptoms: string[] | null;
  affects_training: Generated<boolean>;
  notes: string | null;
  coach_notified_at: Timestamp | null;
  created_at: Generated<Timestamp>;
  updated_at: Generated<Timestamp>;
}

export type IllnessLog = Selectable<IllnessLogsTable>;
export type NewIllnessLog = Insertable<IllnessLogsTable>;
export type IllnessLogUpdate = Updateable<IllnessLogsTable>;

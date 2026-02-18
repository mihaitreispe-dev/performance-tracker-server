import type { ColumnType, Insertable, Selectable } from 'kysely';

import { PersonalRecordType } from './personal-records-table.interface';

export interface PersonalRecordHistoryTable {
  id: ColumnType<string, string | undefined, never>;
  user_id: string;
  record_type: PersonalRecordType;
  exercise_id: string | null;
  value: ColumnType<string, string | number, string | number>;
  unit: string;
  workout_execution_id: string;
  achieved_at: ColumnType<Date, Date | string, Date | string>;
  created_at: ColumnType<Date, never, never>;
}

export type PersonalRecordHistory = Selectable<PersonalRecordHistoryTable>;
export type NewPersonalRecordHistory = Insertable<PersonalRecordHistoryTable>;

export { PersonalRecordType };

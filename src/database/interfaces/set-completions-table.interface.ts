import { Generated, Insertable, Selectable, Updateable } from 'kysely';

import { Timestamp } from './timestamp';

export interface SetCompletionsTable {
  id: Generated<string>;
  workout_execution_id: string;
  exercise_instance_id: string;
  set_number: number;
  actual_reps: number | null;
  actual_load: string | null;
  actual_time_seconds: number | null;
  rpe: number | null;
  completed_at: Timestamp;
  skipped: Generated<boolean>;
  notes: string | null;
  created_at: Generated<Timestamp>;
}

export type SetCompletion = Selectable<SetCompletionsTable>;
export type NewSetCompletion = Insertable<SetCompletionsTable>;
export type SetCompletionUpdate = Updateable<SetCompletionsTable>;

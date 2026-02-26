import { Generated, Insertable, Selectable, Updateable } from 'kysely';

import { Timestamp } from './timestamp';

export interface ExerciseChainsTable {
  id: Generated<string>;
  created_at: Generated<Timestamp>;
  updated_at: Generated<Timestamp>;
}

export type ExerciseChain = Selectable<ExerciseChainsTable>;
export type NewExerciseChain = Insertable<ExerciseChainsTable>;
export type ExerciseChainUpdate = Updateable<ExerciseChainsTable>;

export interface ExerciseChainMembersTable {
  chain_id: string;
  exercise_id: string;
  position: number;
  created_at: Generated<Timestamp>;
}

export type ExerciseChainMember = Selectable<ExerciseChainMembersTable>;
export type NewExerciseChainMember = Insertable<ExerciseChainMembersTable>;
export type ExerciseChainMemberUpdate = Updateable<ExerciseChainMembersTable>;

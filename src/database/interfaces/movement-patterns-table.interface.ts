import { Generated, Insertable, Selectable, Updateable } from 'kysely';

import { Timestamp } from './timestamp';

/**
 * Global movement-pattern reference data (squat / hinge / push / pull / …).
 * An exercise has at most one (exercises.movement_pattern_id).
 */
export interface MovementPatternsTable {
  id: Generated<string>;
  name: string;
  created_at: Generated<Timestamp>;
  updated_at: Generated<Timestamp>;
}

export type MovementPattern = Selectable<MovementPatternsTable>;
export type NewMovementPattern = Insertable<MovementPatternsTable>;
export type MovementPatternUpdate = Updateable<MovementPatternsTable>;

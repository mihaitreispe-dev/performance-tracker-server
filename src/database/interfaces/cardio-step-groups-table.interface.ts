import { Generated, Insertable, Selectable, Updateable } from 'kysely';

import { Timestamp } from './timestamp';

export interface CardioStepGroupsTable {
  id: Generated<string>;
  repeat: Generated<number>;
  created_at: Generated<Timestamp>;
  updated_at: Generated<Timestamp>;
}

export type CardioStepGroup = Selectable<CardioStepGroupsTable>;
export type NewCardioStepGroup = Insertable<CardioStepGroupsTable>;
export type CardioStepGroupUpdate = Updateable<CardioStepGroupsTable>;

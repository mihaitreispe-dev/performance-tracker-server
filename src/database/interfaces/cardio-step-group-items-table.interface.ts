import { Generated, Insertable, Selectable, Updateable } from 'kysely';

import { Timestamp } from './timestamp';

export interface CardioStepGroupItemsTable {
  id: Generated<string>;
  group_id: string;
  cardio_step_id: string;
  position: number;
  created_at: Generated<Timestamp>;
}

export type CardioStepGroupItem = Selectable<CardioStepGroupItemsTable>;
export type NewCardioStepGroupItem = Insertable<CardioStepGroupItemsTable>;
export type CardioStepGroupItemUpdate = Updateable<CardioStepGroupItemsTable>;

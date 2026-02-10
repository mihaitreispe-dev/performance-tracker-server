import { Generated, Insertable, Selectable, Updateable } from 'kysely';

import { Timestamp } from './timestamp';

export enum CardioSportType {
  RUN = 'run',
  CYCLING = 'cycling',
  SWIMMING = 'swimming',
}

export interface CardioCategoriesTable {
  id: Generated<string>;
  sport_type: CardioSportType;
  name: string;
  user_id: string | null;
  created_at: Generated<Timestamp>;
}

export type CardioCategory = Selectable<CardioCategoriesTable>;
export type NewCardioCategory = Insertable<CardioCategoriesTable>;
export type CardioCategoryUpdate = Updateable<CardioCategoriesTable>;

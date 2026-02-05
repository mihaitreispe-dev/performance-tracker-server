import { Generated, Insertable, Selectable, Updateable } from 'kysely';

import { Timestamp } from './timestamp';

export interface EquipmentTable {
  id: Generated<string>;
  name: string;
  created_at: Generated<Timestamp>;
  updated_at: Generated<Timestamp>;
}

export type Equipment = Selectable<EquipmentTable>;
export type NewEquipment = Insertable<EquipmentTable>;
export type EquipmentUpdate = Updateable<EquipmentTable>;

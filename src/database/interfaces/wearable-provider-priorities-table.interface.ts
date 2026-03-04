import { Generated, Insertable, Selectable, Updateable } from 'kysely';

import { Timestamp } from './timestamp';
import { WearableDataCategory, WearableProvider } from './wearable-provider-connections-table.interface';

export interface WearableProviderPrioritiesTable {
  id: Generated<string>;
  user_id: string;
  category: WearableDataCategory;
  provider: WearableProvider;
  priority: number;
  created_at: Generated<Timestamp>;
  updated_at: Generated<Timestamp>;
}

export type WearableProviderPriority = Selectable<WearableProviderPrioritiesTable>;
export type NewWearableProviderPriority = Insertable<WearableProviderPrioritiesTable>;
export type WearableProviderPriorityUpdate = Updateable<WearableProviderPrioritiesTable>;

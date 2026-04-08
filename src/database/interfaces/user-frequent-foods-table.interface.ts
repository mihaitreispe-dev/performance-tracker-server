import type { ColumnType, Insertable, Selectable, Updateable } from 'kysely';

export interface UserFrequentFoodsTable {
  id: ColumnType<string, string | undefined, never>;
  user_id: string;
  food_id: string;
  use_count: ColumnType<number, number | undefined, number>;
  last_used_at: ColumnType<Date, Date | string, Date | string>;
  is_favorite: ColumnType<boolean, boolean | undefined, boolean>;
  created_at: ColumnType<Date, never, never>;
  updated_at: ColumnType<Date, never, Date>;
}

export type UserFrequentFood = Selectable<UserFrequentFoodsTable>;
export type NewUserFrequentFood = Insertable<UserFrequentFoodsTable>;
export type UserFrequentFoodUpdate = Updateable<UserFrequentFoodsTable>;

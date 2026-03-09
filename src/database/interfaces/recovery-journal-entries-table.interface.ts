import type { ColumnType, Insertable, Selectable, Updateable } from 'kysely';

export interface RecoveryJournalEntriesTable {
  id: ColumnType<string, string | undefined, never>;
  user_id: string;
  entry_date: ColumnType<Date, Date | string, Date | string>;

  // Sleep quality (manual supplement to wearable data)
  sleep_quality_rating: ColumnType<number | null, number | null, number | null>; // 1-5
  sleep_latency_minutes: ColumnType<number | null, number | null, number | null>;
  sleep_disturbances: ColumnType<number | null, number | null, number | null>;

  // Subjective metrics (1-10 sliders)
  perceived_recovery: ColumnType<number | null, number | null, number | null>;
  muscle_soreness: ColumnType<number | null, number | null, number | null>;
  energy_level: ColumnType<number | null, number | null, number | null>;
  mood: ColumnType<number | null, number | null, number | null>;
  stress_level: ColumnType<number | null, number | null, number | null>;
  motivation_level: ColumnType<number | null, number | null, number | null>;

  // Lifestyle factors
  caffeine_mg: ColumnType<number | null, number | null, number | null>;
  caffeine_cutoff_time: ColumnType<string | null, string | null, string | null>; // TIME stored as string
  alcohol_units: ColumnType<string | null, string | number | null, string | number | null>;
  hydration_liters: ColumnType<string | null, string | number | null, string | number | null>;
  meal_quality: ColumnType<number | null, number | null, number | null>; // 1-5

  // Notes
  injury_concerns: ColumnType<string | null, string | null, string | null>;
  notes: ColumnType<string | null, string | null, string | null>;

  created_at: ColumnType<Date, never, never>;
  updated_at: ColumnType<Date, never, Date>;
}

export type RecoveryJournalEntry = Selectable<RecoveryJournalEntriesTable>;
export type NewRecoveryJournalEntry = Insertable<RecoveryJournalEntriesTable>;
export type UpdateRecoveryJournalEntry = Updateable<RecoveryJournalEntriesTable>;

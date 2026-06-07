import { Generated, Insertable, Selectable } from 'kysely';

import { Timestamp } from './timestamp';

/**
 * Per-user log of completed snack plays — see migration
 * 1774404000000. One row per `autoAdvanceOnEnd`-fired completion in
 * the rehabit player; re-watches are intentionally separate rows
 * (each play is a real engagement event).
 *
 * Pure log table — there's no update path, so no Updateable export.
 * Either we have the play recorded or we don't; corrections are
 * deletions, not edits.
 */
export interface SnackCompletionsTable {
  id: Generated<string>;
  user_id: string;
  content_item_id: string;
  organisation_id: string;
  /**
   * Optional client-reported duration in seconds — the time the user
   * actually spent inside the player before completion fired (not
   * the snack's intrinsic length). Nullable since the player can
   * fire completion without a meaningful watched-duration on edge
   * cases (HLS error → user closes the player).
   */
  duration_seconds: number | null;
  completed_at: Generated<Timestamp>;
  created_at: Generated<Timestamp>;
}

export type SnackCompletion = Selectable<SnackCompletionsTable>;
export type NewSnackCompletion = Insertable<SnackCompletionsTable>;

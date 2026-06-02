import { Kysely, sql } from 'kysely';

/**
 * Per-exercise voice-over fields. Lets coaches attach an audio cue
 * that plays alongside the exercise demo in the workout player.
 *
 * Two modes, captured in `voiceover_mode`:
 *  - 'off'                  — no voice-over (default; preserves
 *                              existing behaviour for every legacy
 *                              exercise)
 *  - 'recorded'             — the coach uploaded an audio file;
 *                              voiceover_s3_bucket / s3_key /
 *                              mime_type point at it
 *  - 'generated_from_cues'  — the client generates speech via the
 *                              browser Web Speech API at playback
 *                              time. Reads `voiceover_script` when
 *                              non-null, otherwise falls back to
 *                              the exercise's `cues` joined with
 *                              ". " separators
 *
 * `voiceover_script` is optional even in generated mode — null means
 * "use the cues". When set, the coach has overridden the auto-derived
 * script with custom narration text without losing the cue chips
 * shown in the player overlay.
 *
 * Recorded-mode columns are nullable + only populated when mode is
 * 'recorded'; a CHECK constraint enforces the pairing so an exercise
 * can't claim recorded mode without the file pointer.
 *
 * No index needed — voice-over is a per-row property read with the
 * rest of the exercise; no query filters on it at scale.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    ALTER TABLE exercises
      ADD COLUMN voiceover_mode TEXT NOT NULL DEFAULT 'off',
      ADD COLUMN voiceover_s3_bucket TEXT NULL,
      ADD COLUMN voiceover_s3_key TEXT NULL,
      ADD COLUMN voiceover_mime_type TEXT NULL,
      ADD COLUMN voiceover_script TEXT NULL
  `.execute(db);

  await sql`
    ALTER TABLE exercises
      ADD CONSTRAINT exercises_voiceover_mode_chk
      CHECK (voiceover_mode IN ('off', 'recorded', 'generated_from_cues'))
  `.execute(db);

  /*
   * recorded mode requires the S3 pointer + mime type. generated mode
   * doesn't reference S3 at all (it's a runtime client-side TTS). off
   * mode requires neither. The constraint catches misconfigured rows
   * before they ever reach the player.
   */
  await sql`
    ALTER TABLE exercises
      ADD CONSTRAINT exercises_voiceover_recorded_chk
      CHECK (
        voiceover_mode <> 'recorded'
        OR (voiceover_s3_bucket IS NOT NULL AND voiceover_s3_key IS NOT NULL AND voiceover_mime_type IS NOT NULL)
      )
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE exercises DROP CONSTRAINT IF EXISTS exercises_voiceover_recorded_chk`.execute(db);
  await sql`ALTER TABLE exercises DROP CONSTRAINT IF EXISTS exercises_voiceover_mode_chk`.execute(db);
  await sql`
    ALTER TABLE exercises
      DROP COLUMN IF EXISTS voiceover_script,
      DROP COLUMN IF EXISTS voiceover_mime_type,
      DROP COLUMN IF EXISTS voiceover_s3_key,
      DROP COLUMN IF EXISTS voiceover_s3_bucket,
      DROP COLUMN IF EXISTS voiceover_mode
  `.execute(db);
}

import { Kysely, sql } from 'kysely';

/**
 * Multi-language content translations — the locale dimension the
 * content model has never had.
 *
 * One row per (target, language). A "target" is a thing with spoken
 * or scripted words worth translating:
 *  - 'exercise_voiceover' — an exercise's voice-over (the coach's
 *                            recorded audio, or the cues/script the
 *                            client TTS speaks). `target_id` = exercises.id
 *  - 'exercise_intro'     — the talking-head intro attached to an
 *                            exercise (separate content_item or the
 *                            inline intro markers on the demo video).
 *                            `target_id` = exercises.id
 *  - 'content_item'       — a snack / course lesson / exercise-intro
 *                            content_item. `target_id` = content_items.id
 *
 * The pipeline fills this row in stages, tracked by `review_status`:
 *   pending → transcribing → machine_translated → in_review
 *           → approved → published   (or → failed)
 *
 * `source_text` is the original words: for generated-from-cues
 * voice-overs we already have it (joined cues / voiceover_script); for
 * recorded audio and talking-head intros we run AWS Transcribe and
 * store its transcript here. `translated_text` is the machine
 * translation, then human-edited in the org review UI before publish —
 * mistranslating a coaching cue ("keep your back straight") is a safety
 * issue, so nothing reaches an athlete without an explicit approve.
 *
 * Output pointers cover both fidelity tiers:
 *  - caption_vtt_*       — a WebVTT subtitle track (Layer 1)
 *  - dubbed_audio_*      — a cloned-voice MP3 from ElevenLabs (Layer 2)
 *
 * Job columns (transcribe_*, dub_*) make the async work durable across
 * restarts — the cron poller advances rows by their stored job handle,
 * exactly like the MediaConvert / Rekognition pipelines.
 *
 * `organisation_id` is nullable: exercises can be user-owned (not org
 * scoped) while content_items are always org-owned. When set, it lets
 * the org review UI list every translation in one query.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    CREATE TABLE content_translations (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

      -- what's being translated
      target_type TEXT NOT NULL,
      target_id UUID NOT NULL,
      locale TEXT NOT NULL,
      source_locale TEXT NOT NULL DEFAULT 'en',
      organisation_id UUID REFERENCES organisations(id) ON DELETE CASCADE,

      -- text pipeline
      source_text TEXT,
      translated_text TEXT,
      review_status TEXT NOT NULL DEFAULT 'pending',

      -- speech-to-text bookkeeping (recorded voice-over + intro audio)
      transcribe_job_name TEXT,
      transcribe_status TEXT,

      -- caption output (Layer 1)
      caption_vtt_s3_bucket TEXT,
      caption_vtt_s3_key TEXT,

      -- dubbed-audio output (Layer 2 — ElevenLabs cloned voice)
      dub_provider TEXT,
      dub_job_id TEXT,
      dub_status TEXT,
      dubbed_audio_s3_bucket TEXT,
      dubbed_audio_s3_key TEXT,
      dubbed_audio_mime_type TEXT,

      -- review audit
      reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
      reviewed_at TIMESTAMPTZ,
      published_at TIMESTAMPTZ,

      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

      CONSTRAINT content_translations_target_type_chk
        CHECK (target_type IN ('exercise_voiceover', 'exercise_intro', 'content_item')),
      CONSTRAINT content_translations_review_status_chk
        CHECK (review_status IN (
          'pending', 'transcribing', 'machine_translated',
          'in_review', 'approved', 'published', 'failed'
        )),
      CONSTRAINT content_translations_unique UNIQUE (target_type, target_id, locale)
    )
  `.execute(db);

  // Primary read path: "all translations for this target" (the review
  // panel + the player's locale lookup). The UNIQUE constraint already
  // covers (target_type, target_id, locale) point lookups.
  await sql`
    CREATE INDEX content_translations_target_idx
      ON content_translations (target_type, target_id)
  `.execute(db);

  // Org-wide listing for the review dashboard.
  await sql`
    CREATE INDEX content_translations_org_idx
      ON content_translations (organisation_id)
  `.execute(db);

  /*
   * Coach voice settings for the (later) cloned-voice dub. Consent is
   * an explicit, timestamped opt-in — we will not clone a real person's
   * voice without it, so the dub step stays gated on a non-null
   * consent. `elevenlabs_voice_id` is the handle ElevenLabs returns
   * once that coach's voice is cloned. Both nullable; absent for every
   * legacy user.
   */
  await sql`
    ALTER TABLE users
      ADD COLUMN voice_clone_consent_at TIMESTAMPTZ NULL,
      ADD COLUMN elevenlabs_voice_id TEXT NULL
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`
    ALTER TABLE users
      DROP COLUMN IF EXISTS elevenlabs_voice_id,
      DROP COLUMN IF EXISTS voice_clone_consent_at
  `.execute(db);
  await sql`DROP TABLE IF EXISTS content_translations`.execute(db);
}

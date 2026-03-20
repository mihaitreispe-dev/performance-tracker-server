import { Kysely } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable('sleep_logs')
    // Sleep onset and fragmentation metrics
    .addColumn('sleep_onset_latency_seconds', 'integer')
    .addColumn('waso_seconds', 'integer') // Wake After Sleep Onset
    .addColumn('waso_count', 'integer') // Number of wake episodes
    .addColumn('time_in_bed_seconds', 'integer') // TIB for efficiency calculation

    // HR nadir analysis
    .addColumn('hr_nadir', 'integer')
    .addColumn('hr_nadir_timestamp', 'timestamptz')

    // HRV trend analysis (first half vs second half)
    .addColumn('hrv_first_half_avg', 'decimal(6, 2)')
    .addColumn('hrv_second_half_avg', 'decimal(6, 2)')

    // Sleep efficiency (TST / TIB)
    .addColumn('sleep_efficiency', 'decimal(5, 4)')

    // Computed score and breakdown
    .addColumn('computed_score', 'integer')
    .addColumn('computed_score_breakdown', 'jsonb')
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable('sleep_logs')
    .dropColumn('sleep_onset_latency_seconds')
    .dropColumn('waso_seconds')
    .dropColumn('waso_count')
    .dropColumn('time_in_bed_seconds')
    .dropColumn('hr_nadir')
    .dropColumn('hr_nadir_timestamp')
    .dropColumn('hrv_first_half_avg')
    .dropColumn('hrv_second_half_avg')
    .dropColumn('sleep_efficiency')
    .dropColumn('computed_score')
    .dropColumn('computed_score_breakdown')
    .execute();
}

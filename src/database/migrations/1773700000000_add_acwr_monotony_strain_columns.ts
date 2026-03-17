import { type Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  // Add ACWR columns
  await db.schema
    .alterTable('fitness_fatigue_daily')
    .addColumn('acwr', 'decimal(4, 2)', (col) => col.defaultTo(null))
    .execute();

  await db.schema
    .alterTable('fitness_fatigue_daily')
    .addColumn('acwr_risk_level', 'varchar(20)', (col) => col.defaultTo(null))
    .execute();

  // Add Monotony/Strain columns
  await db.schema
    .alterTable('fitness_fatigue_daily')
    .addColumn('monotony', 'decimal(4, 2)', (col) => col.defaultTo(null))
    .execute();

  await db.schema
    .alterTable('fitness_fatigue_daily')
    .addColumn('strain', 'decimal(8, 2)', (col) => col.defaultTo(null))
    .execute();

  await db.schema
    .alterTable('fitness_fatigue_daily')
    .addColumn('overtraining_risk', 'varchar(20)', (col) => col.defaultTo(null))
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable('fitness_fatigue_daily').dropColumn('acwr').execute();
  await db.schema.alterTable('fitness_fatigue_daily').dropColumn('acwr_risk_level').execute();
  await db.schema.alterTable('fitness_fatigue_daily').dropColumn('monotony').execute();
  await db.schema.alterTable('fitness_fatigue_daily').dropColumn('strain').execute();
  await db.schema.alterTable('fitness_fatigue_daily').dropColumn('overtraining_risk').execute();
}

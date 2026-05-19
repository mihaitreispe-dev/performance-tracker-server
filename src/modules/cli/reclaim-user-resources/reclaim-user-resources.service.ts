import { Injectable, Logger } from '@nestjs/common';
import { Kysely, sql } from 'kysely';
import { Command, Console } from 'nestjs-console';
import { InjectKysely } from 'nestjs-kysely';

import { Database, OrganisationRole } from 'src/database/interfaces';

/**
 * Tables that carry an `organisation_id` and a user-owned column.
 *
 * The "user column" is the field that determines whether the user owns the row —
 * usually `user_id`, sometimes `owner_user_id` or `coach_id`. We migrate any row
 * the user owns from whichever org it sits in today into the target org.
 *
 * `modules` is intentionally excluded: per-athlete module overrides should follow
 * the athlete (athlete_user_id), and athletes don't run this CLI for themselves —
 * they sit inside an existing membership. Leaving these alone is the safe default.
 *
 * `coach_athlete_relationships` is excluded: those describe relationships between
 * users, not "owned" resources, and re-tagging them changes the coach's tenancy
 * view in ways that should be done deliberately, not bulk-reclaimed.
 */
const OWNED_TABLES: Array<{ table: string; userColumn: string; label: string }> = [
  { table: 'exercises', userColumn: 'user_id', label: 'exercises' },
  { table: 'workouts', userColumn: 'user_id', label: 'workouts' },
  { table: 'workout_plans', userColumn: 'user_id', label: 'workout plans' },
  { table: 'workout_schedules', userColumn: 'user_id', label: 'workout schedules' },
  { table: 'content_items', userColumn: 'owner_user_id', label: 'content items' },
  { table: 'courses', userColumn: 'owner_user_id', label: 'courses' },
  { table: 'coach_assigned_workouts', userColumn: 'coach_id', label: 'coach-assigned workouts' },
];

interface RunOptions {
  userId?: string;
  email?: string;
  targetOrgId?: string;
  targetOrgSlug?: string;
  createWorkspace?: boolean;
  dryRun?: boolean;
}

@Injectable()
@Console()
export class ReclaimUserResourcesService {
  private readonly logger = new Logger(ReclaimUserResourcesService.name);

  constructor(@InjectKysely() private readonly db: Kysely<Database>) {}

  @Command({
    command: 'reclaim-user-resources',
    description:
      'Move every tenant-scoped resource owned by a user (by user_id / owner_user_id / coach_id) into a target organisation. Use when the v0 → multi-tenant backfill stranded a user’s data in the hidden personal-athletes/system orgs.',
    options: [
      { flags: '--user-id <value>', description: 'Target user uuid' },
      { flags: '--email <value>', description: 'Target user email (alternative to --user-id)' },
      {
        flags: '--target-org-id <value>',
        description:
          'Destination org uuid. Optional — defaults to the user’s only visible (non-hidden) membership.',
      },
      {
        flags: '--target-org-slug <value>',
        description: 'Destination org slug (alternative to --target-org-id).',
      },
      {
        flags: '--create-workspace',
        description:
          'If the user has no visible membership, create a personal workspace named "<display_name>’s Workspace" and use it as the target. Without this flag the command aborts in that case.',
      },
      { flags: '--dry-run', description: 'Print what would change without writing anything' },
    ],
  })
  async run(opts: RunOptions): Promise<void> {
    this.logger.log(`reclaim-user-resources starting (dryRun=${!!opts.dryRun})`);

    // ---- 1. Resolve the user ----------------------------------------------------
    if (!opts.userId && !opts.email) {
      throw new Error('Provide --user-id or --email');
    }
    const userRow = await this.db
      .selectFrom('users')
      .select(['id', 'email', 'display_name', 'roles'])
      .where((eb) =>
        opts.userId ? eb('id', '=', opts.userId) : eb('email', '=', opts.email ?? ''),
      )
      .executeTakeFirst();
    if (!userRow) {
      throw new Error(`User not found (--user-id=${opts.userId} --email=${opts.email})`);
    }
    this.logger.log(`User: ${userRow.email} (${userRow.id}) — roles: ${(userRow.roles ?? []).join(',')}`);

    // ---- 2. Resolve the target org ---------------------------------------------
    const targetOrg = await this.resolveTargetOrg(userRow, opts);
    this.logger.log(`Target org: ${targetOrg.name} (slug=${targetOrg.slug}, id=${targetOrg.id})`);

    // ---- 3. Walk each owned table, count current placement, plan moves ---------
    let totalToMove = 0;
    const plannedMoves: Array<{ label: string; fromCounts: Record<string, number>; total: number }> = [];

    for (const { table, userColumn, label } of OWNED_TABLES) {
      // Count rows owned by this user, grouped by current org. Use raw SQL because
      // the table/column are runtime values — they don't fit Kysely's typed builder.
      const grouped = await sql<{
        slug: string;
        name: string;
        rows: string;
      }>`
        SELECT o.slug AS slug, o.name AS name, COUNT(*)::text AS rows
        FROM ${sql.ref(table)} t
        JOIN organisations o ON o.id = t.organisation_id
        WHERE t.${sql.ref(userColumn)} = ${userRow.id}
          AND t.organisation_id != ${targetOrg.id}
        GROUP BY o.slug, o.name
      `.execute(this.db);

      const fromCounts: Record<string, number> = {};
      let total = 0;
      for (const r of grouped.rows) {
        const n = Number(r.rows);
        fromCounts[`${r.slug} (${r.name})`] = n;
        total += n;
      }
      plannedMoves.push({ label, fromCounts, total });
      totalToMove += total;
    }

    this.logger.log('');
    this.logger.log('Plan:');
    for (const move of plannedMoves) {
      if (move.total === 0) {
        this.logger.log(`  ${move.label.padEnd(28)} no rows to move`);
        continue;
      }
      this.logger.log(`  ${move.label.padEnd(28)} ${move.total} row(s)`);
      for (const [orgLabel, n] of Object.entries(move.fromCounts)) {
        this.logger.log(`     ← ${n} from ${orgLabel}`);
      }
    }
    this.logger.log('');

    if (totalToMove === 0) {
      this.logger.log('Nothing to move. Done.');
      return;
    }

    if (opts.dryRun) {
      this.logger.log(`DRY RUN — ${totalToMove} row(s) would move into ${targetOrg.slug}. No changes written.`);
      return;
    }

    // ---- 4. Execute the moves inside a single transaction ----------------------
    await this.db.transaction().execute(async (trx) => {
      for (const { table, userColumn, label } of OWNED_TABLES) {
        const result = await sql`
          UPDATE ${sql.ref(table)}
          SET organisation_id = ${targetOrg.id}
          WHERE ${sql.ref(userColumn)} = ${userRow.id}
            AND organisation_id != ${targetOrg.id}
        `.execute(trx);
        const updated = Number(result.numAffectedRows ?? 0);
        if (updated > 0) {
          this.logger.log(`  ✓ ${label}: ${updated} row(s) → ${targetOrg.slug}`);
        }
      }
    });

    this.logger.log('');
    this.logger.log(`Done. ${totalToMove} row(s) reclaimed into ${targetOrg.slug}.`);
  }

  /**
   * Pick the destination org based on (in priority order):
   *   1. --target-org-id / --target-org-slug if given
   *   2. The user's only visible (non-hidden) membership, if there is exactly one
   *   3. If --create-workspace is set, create "<display_name>'s Workspace" + OWNER membership
   *   4. Otherwise refuse and list the user's memberships so the operator can pick one
   */
  private async resolveTargetOrg(
    user: { id: string; email: string; display_name: string | null },
    opts: RunOptions,
  ): Promise<{ id: string; slug: string; name: string }> {
    if (opts.targetOrgId) {
      const org = await this.db
        .selectFrom('organisations')
        .select(['id', 'slug', 'name'])
        .where('id', '=', opts.targetOrgId)
        .executeTakeFirst();
      if (!org) throw new Error(`No org with id ${opts.targetOrgId}`);
      return org;
    }
    if (opts.targetOrgSlug) {
      const org = await this.db
        .selectFrom('organisations')
        .select(['id', 'slug', 'name'])
        .where('slug', '=', opts.targetOrgSlug)
        .executeTakeFirst();
      if (!org) throw new Error(`No org with slug ${opts.targetOrgSlug}`);
      return org;
    }

    const memberships = await this.db
      .selectFrom('organisation_memberships as m')
      .innerJoin('organisations as o', 'o.id', 'm.organisation_id')
      .select(['o.id', 'o.slug', 'o.name', 'm.role'])
      .where('m.user_id', '=', user.id)
      .where('m.accepted_at', 'is not', null)
      .execute();

    const visible = memberships.filter((m) => m.slug !== 'personal-athletes' && m.slug !== 'system');

    if (visible.length === 1) {
      return { id: visible[0].id, slug: visible[0].slug, name: visible[0].name };
    }

    if (visible.length === 0) {
      if (!opts.createWorkspace) {
        this.logger.error(
          `${user.email} has no visible memberships. Re-run with --create-workspace to auto-create one, or pass --target-org-id/--target-org-slug.`,
        );
        if (memberships.length > 0) {
          this.logger.error('Existing (hidden) memberships:');
          for (const m of memberships) this.logger.error(`  - ${m.slug} (${m.name}) as ${m.role}`);
        }
        throw new Error('No visible target org and --create-workspace not set');
      }
      return this.createPersonalWorkspace(user);
    }

    // visible.length > 1 — be conservative.
    this.logger.error(`${user.email} belongs to ${visible.length} visible orgs; pick one explicitly:`);
    for (const m of visible) {
      this.logger.error(`  --target-org-id ${m.id}    # ${m.slug} (${m.name}) as ${m.role}`);
    }
    throw new Error('Ambiguous target — multiple visible memberships, pass --target-org-id');
  }

  private async createPersonalWorkspace(user: {
    id: string;
    email: string;
    display_name: string | null;
  }): Promise<{ id: string; slug: string; name: string }> {
    const baseName = (user.display_name && user.display_name.trim()) || user.email.split('@')[0];
    const name = `${baseName}'s Workspace`;
    const slugBase = baseName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    const slug = `${slugBase || 'workspace'}-${user.id.slice(0, 8)}`;

    this.logger.log(`Creating personal workspace "${name}" (slug=${slug})`);

    const inserted = await this.db
      .insertInto('organisations')
      .values({
        name,
        slug,
        created_by_user_id: user.id,
      })
      .returning(['id', 'slug', 'name'])
      .executeTakeFirstOrThrow();

    await this.db
      .insertInto('organisation_memberships')
      .values({
        organisation_id: inserted.id,
        user_id: user.id,
        role: OrganisationRole.OWNER,
        accepted_at: sql`now()` as never,
      })
      .execute();

    return inserted;
  }
}

import { Injectable } from '@nestjs/common';
import { Kysely, sql } from 'kysely';
import { InjectKysely } from 'nestjs-kysely';

import {
  Database,
  NewOrganisationApiKey,
  OrganisationApiKey,
} from 'src/database/interfaces';

@Injectable()
export class OrganisationApiKeyRepository {
  constructor(@InjectKysely() private readonly db: Kysely<Database>) {}

  async create(row: NewOrganisationApiKey): Promise<OrganisationApiKey> {
    return this.db
      .insertInto('organisation_api_keys')
      .values(row)
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  async findById(id: string): Promise<OrganisationApiKey | undefined> {
    return this.db
      .selectFrom('organisation_api_keys')
      .where('id', '=', id)
      .selectAll()
      .executeTakeFirst();
  }

  /**
   * Look up an *active* key by its visible prefix. Caller is expected to verify
   * the secret portion against `key_hash`. Revoked/expired keys are filtered out
   * here so callers can't accidentally use a tombstoned row.
   */
  async findActiveByPrefix(prefix: string): Promise<OrganisationApiKey | undefined> {
    const now = new Date();
    return this.db
      .selectFrom('organisation_api_keys')
      .where('key_prefix', '=', prefix)
      .where('revoked_at', 'is', null)
      .where((eb) => eb.or([eb('expires_at', 'is', null), eb('expires_at', '>', now)]))
      .selectAll()
      .executeTakeFirst();
  }

  async listByOrganisation(organisationId: string): Promise<OrganisationApiKey[]> {
    return this.db
      .selectFrom('organisation_api_keys')
      .where('organisation_id', '=', organisationId)
      .selectAll()
      .orderBy('created_at', 'desc')
      .execute();
  }

  async revoke(id: string): Promise<OrganisationApiKey> {
    return this.db
      .updateTable('organisation_api_keys')
      .set({ revoked_at: sql`now()`, updated_at: sql`now()` })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  /**
   * Debounced last_used touch. Only writes if the previous value is older than
   * `debounceSeconds`, so a hot key doesn't hammer the row on every request.
   * Implemented as raw SQL because the interval comparison doesn't round-trip
   * through Kysely's typed builder cleanly.
   */
  async touchLastUsed(id: string, debounceSeconds = 60): Promise<void> {
    await sql`
      UPDATE organisation_api_keys
      SET last_used_at = now()
      WHERE id = ${id}
        AND (last_used_at IS NULL OR last_used_at < now() - make_interval(secs => ${debounceSeconds}))
    `.execute(this.db);
  }
}

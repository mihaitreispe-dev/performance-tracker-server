import { Injectable, Logger } from '@nestjs/common';
import { Kysely } from 'kysely';
import { InjectKysely } from 'nestjs-kysely';
import { Database, MembershipAuditLog, NewMembershipAuditLog } from 'src/database/interfaces';

/**
 * Repository for the append-only membership_audit_log. Writes never
 * throw — audit failures must NOT mask the underlying mutation
 * (catching at the service layer would be possible too, but pushing
 * the swallow into the repo keeps every call site honest). The
 * caller can fire-and-forget without worrying about losing the user-
 * visible response to a logging hiccup.
 */
@Injectable()
export class MembershipAuditLogRepository {
  private readonly logger = new Logger(MembershipAuditLogRepository.name);

  constructor(@InjectKysely() private readonly db: Kysely<Database>) {}

  async record(data: NewMembershipAuditLog): Promise<MembershipAuditLog | null> {
    try {
      return await this.db
        .insertInto('membership_audit_log')
        .values(data)
        .returningAll()
        .executeTakeFirstOrThrow();
    } catch (err) {
      // Log loudly but DO NOT throw — losing an audit row is better
      // than blocking the membership change.
      this.logger.error(
        `Failed to write membership audit row for org=${data.organisation_id} action=${data.action}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return null;
    }
  }
}

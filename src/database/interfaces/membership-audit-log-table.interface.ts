import { ColumnType, Generated, Insertable, Selectable } from 'kysely';

import { Timestamp } from './timestamp';

/**
 * Discrete actions written to the audit log. Strings (not an enum)
 * because the column is varchar — a future action can land via
 * migration + service write without an enum-type rebuild.
 */
export type MembershipAuditAction =
  | 'invited'
  | 'accepted'
  | 'role_changed'
  | 'removed'
  | 'self_left';

export interface MembershipAuditLogTable {
  id: Generated<string>;
  organisation_id: string;
  /** Null only if the actor's user row was later deleted (FK SET NULL). */
  actor_user_id: string | null;
  /** Null only if the target's user row was later deleted (FK SET NULL). */
  target_user_id: string | null;
  /** ID of the membership row at action time; preserved across removal. */
  membership_id: string | null;
  action: MembershipAuditAction;
  /** Role before the action. Null for actions that don't change role (invite, accept). */
  from_role: string | null;
  /** Role after the action. Null for actions that don't leave a role (remove, self_left). */
  to_role: string | null;
  /** Actor's role at the time — captured so a later role change doesn't rewrite history. */
  actor_role: string;
  metadata: ColumnType<
    Record<string, unknown>,
    Record<string, unknown> | undefined,
    Record<string, unknown>
  >;
  created_at: Generated<Timestamp>;
}

export type MembershipAuditLog = Selectable<MembershipAuditLogTable>;
export type NewMembershipAuditLog = Insertable<MembershipAuditLogTable>;

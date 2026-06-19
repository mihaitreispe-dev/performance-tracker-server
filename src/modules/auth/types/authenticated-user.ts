export interface AuthUser {
  id: string;
  /**
   * When set, this request is being made by a platform admin acting as
   * the user identified by `id`. Surfaced from the JWT's `imp` claim.
   * Audit logs / the "you are impersonating X" banner key off this; absent
   * on ordinary requests.
   */
  impersonatorId?: string;
  /**
   * The organisation this token is scoped to, from the JWT's `org` claim.
   * Present for org-scoped first-party sessions (ReHabit / public OAuth);
   * ActiveOrgGuard trusts it over the X-Organisation-Id header. Absent for
   * org-agnostic tokens, which select their org via that header instead.
   */
  organisationId?: string;
}

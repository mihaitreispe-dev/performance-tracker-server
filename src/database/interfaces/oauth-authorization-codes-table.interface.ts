import { Generated, Insertable, Selectable } from 'kysely';

import { Timestamp } from './timestamp';

/**
 * Short-lived authorization codes minted by the hosted auth page and redeemed by
 * the integrator's backend at /v1/public/auth/token. Single-use, ~5 minute TTL.
 *
 *   code         — 32-byte url-safe base64. PK, indexed.
 *   redirect_uri — captured at mint time and re-verified at redemption so a leaked
 *                  code can't be redirected to a different URI than the user
 *                  originally consented to.
 *   used_at      — non-null after first successful redemption; subsequent
 *                  attempts fail. (Compare-and-swap discipline in the repo.)
 */
export interface OAuthAuthorizationCodesTable {
  code: string;
  organisation_id: string;
  api_key_id: string;
  user_id: string;
  redirect_uri: string;
  expires_at: Timestamp;
  used_at: Timestamp | null;
  /**
   * PKCE challenge captured at mint time. NULL when the caller didn't opt in
   * (legacy integrator-backend flow). For public clients the service refuses
   * to mint a code without it.
   */
  code_challenge: string | null;
  /** Algorithm used to derive `code_challenge` from `code_verifier`. Currently only 'S256'. */
  code_challenge_method: string | null;
  created_at: Generated<Timestamp>;
}

export type OAuthAuthorizationCode = Selectable<OAuthAuthorizationCodesTable>;
export type NewOAuthAuthorizationCode = Insertable<OAuthAuthorizationCodesTable>;

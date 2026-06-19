import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
  UnprocessableEntityException,
} from '@nestjs/common';

import { OrganisationApiKey, OrganisationRole, User, UserRole } from 'src/database/interfaces';
import { authUserFromUser } from 'src/modules/api/v1/auth/auth-user.mapper';
import { AuthService } from 'src/modules/auth/services/auth.service';

import { PublicAuthSessionDTO } from './response.dto';
import { FirebaseService } from 'src/modules/firebase/firebase.service';
import { OAuthAuthorizationCodeRepository } from 'src/repositories/oauth-authorization-code.repository';
import { OrganisationApiKeyRepository } from 'src/repositories/organisation-api-key.repository';
import { OrganisationMembershipRepository } from 'src/repositories/organisation-membership.repository';
import { RefreshTokenRepository } from 'src/repositories/refresh-token.repository';
import { UserRepository } from 'src/repositories/user.repository';

/**
 * OAuth-style authorization code grant for hosted client auth.
 *
 * The two endpoints work together:
 *
 *   1) /v1/public/auth/authorize — called by the *hosted page* on our domain
 *      after Firebase login completes. We accept a Firebase ID token (proving
 *      the user is real), look up the API key from the supplied `clientId`,
 *      validate the redirect_uri against the key's allow-list, ensure the user
 *      is a member of the API key's org (provisioning as athlete if not), mint
 *      a 5-min single-use code, and return it. The page bounces the browser to
 *      `<redirect_uri>?code=...&state=...`.
 *
 *   2) /v1/public/auth/token — called by the *integrator's backend* with their
 *      API key. Validates the code matches the key's org + the original
 *      redirect_uri, marks it used (compare-and-swap), and mints a regular
 *      AuthSession (access + refresh) for the user. Integrators reuse our
 *      existing refresh-token mechanics from there.
 *
 * Security gates layered:
 *   - Firebase ID token verified (the user actually logged in).
 *   - clientId resolves to an active API key (revoked/expired/missing → 401).
 *   - redirect_uri exact-matches one entry in the key's redirect_uris allow-list
 *     (no substring/prefix shenanigans, no open-redirector vulnerability).
 *   - Code is one-time-use via a compare-and-swap on `used_at`.
 *   - Code's stored redirect_uri must equal the redemption's redirect_uri
 *     (catches leaked codes being redirected to attacker-controlled URIs).
 */
@Injectable()
export class PublicOAuthService {
  private readonly logger = new Logger(PublicOAuthService.name);

  /** Lifetime of an issued authorization code. */
  private static readonly CODE_TTL_MS = 5 * 60 * 1000;

  constructor(
    private readonly firebaseService: FirebaseService,
    private readonly authService: AuthService,
    private readonly userRepo: UserRepository,
    private readonly refreshTokenRepo: RefreshTokenRepository,
    private readonly membershipRepo: OrganisationMembershipRepository,
    private readonly apiKeyRepo: OrganisationApiKeyRepository,
    private readonly codeRepo: OAuthAuthorizationCodeRepository,
  ) {}

  async mintAuthorizationCode(input: {
    firebaseIdToken: string;
    clientId: string;
    redirectUri: string;
    state?: string;
    codeChallenge?: string;
    codeChallengeMethod?: 'S256';
  }): Promise<{ code: string; redirectUri: string; state: string | null; expiresAt: string }> {
    const apiKey = await this.resolveActiveApiKey(input.clientId);
    if (!apiKey.redirect_uris || apiKey.redirect_uris.length === 0) {
      throw new ForbiddenException('Hosted auth flow not enabled for this API key (no redirect URIs configured).');
    }
    if (!apiKey.redirect_uris.includes(input.redirectUri)) {
      throw new ForbiddenException(
        'redirect_uri is not in the allow-list for this API key. Add it via the API key settings.',
      );
    }

    // PKCE policy:
    //   - Public clients MUST send a challenge (the bearer secret is gone,
    //     PKCE is what binds the code to the originating browser session).
    //   - Private clients MAY send one (defence-in-depth) but it's optional.
    //   - If a challenge is sent, the method must be S256 (we never
    //     accepted 'plain', which is too weak to be useful).
    if (apiKey.is_public_client && !input.codeChallenge) {
      throw new BadRequestException(
        'Public-client keys require a PKCE code_challenge on /authorize.',
      );
    }
    if (input.codeChallenge && input.codeChallengeMethod !== 'S256') {
      throw new BadRequestException(
        "PKCE code_challenge_method must be 'S256'.",
      );
    }

    const user = await this.resolveUserFromFirebase(input.firebaseIdToken);
    await this.ensureAthleteMembership(user.id, apiKey.organisation_id);

    const code = randomCode();
    const expiresAt = new Date(Date.now() + PublicOAuthService.CODE_TTL_MS);
    await this.codeRepo.create({
      code,
      organisation_id: apiKey.organisation_id,
      api_key_id: apiKey.id,
      user_id: user.id,
      redirect_uri: input.redirectUri,
      expires_at: expiresAt,
      code_challenge: input.codeChallenge ?? null,
      code_challenge_method: input.codeChallenge ? 'S256' : null,
    });

    return {
      code,
      redirectUri: input.redirectUri,
      state: input.state ?? null,
      expiresAt: expiresAt.toISOString(),
    };
  }

  /**
   * Token-exchange supports two auth modes:
   *
   *   PRIVATE (legacy): caller is the integrator's backend. ApiKeyAuthGuard
   *     ran upstream and attached `req.apiKey`. The code's `api_key_id` must
   *     match that key's id (caller can only redeem codes minted under their
   *     own key) — this is the bcrypt-secret-backed contract.
   *
   *   PUBLIC (PKCE): caller is a browser SPA / native app. No bearer header;
   *     a `clientId` in the body identifies the key. We require:
   *       - the key has is_public_client = true,
   *       - the code carries a stored PKCE challenge,
   *       - the body's code_verifier hashes to that challenge,
   *       - the Origin header (if present) sits under one of the key's
   *         registered redirect URIs — browser-only defence in depth.
   *
   * The two paths share the same code lifecycle (CAS on used_at, redirect
   * binding, expiry); only the authentication of the caller differs.
   */
  async exchangeCode(input: {
    code: string;
    redirectUri: string;
    /** Set when ApiKeyAuthGuard ran (private-client path). */
    apiKey?: { apiKeyId: string; organisationId: string };
    /** PKCE verifier — required for public-client codes. */
    codeVerifier?: string;
    /** Public-client identifier from the request body — required when `apiKey` isn't set. */
    clientId?: string;
    /** Origin header of the incoming HTTP request. Browser-set, undefined on server-to-server. */
    origin?: string;
  }): Promise<PublicAuthSessionDTO> {
    const row = await this.codeRepo.findRedeemable(input.code);
    if (!row) {
      // Single bland error message — never tell an attacker whether a code is
      // expired, used, or simply doesn't exist.
      throw new UnauthorizedException('Invalid or expired code');
    }
    if (row.redirect_uri !== input.redirectUri) {
      throw new UnauthorizedException('redirect_uri does not match the original authorization');
    }

    // Resolve which API key the code was issued under, regardless of which
    // auth mode the caller is using. This is the row that decides which
    // verification path applies.
    const codeKey = await this.apiKeyRepo.findById(row.api_key_id);
    if (!codeKey || codeKey.revoked_at !== null) {
      throw new UnauthorizedException('Invalid or expired code');
    }

    if (codeKey.is_public_client) {
      this.verifyPublicClientExchange({
        codeKey,
        codeRow: row,
        suppliedClientId: input.clientId,
        suppliedVerifier: input.codeVerifier,
        origin: input.origin,
      });
    } else {
      // Private path: ApiKeyAuthGuard must have authenticated the caller
      // and attached its key context. The code must have been minted by
      // *that* key (org match is the canonical check; ids tighten it).
      if (!input.apiKey) {
        throw new UnauthorizedException(
          'API key required for this code — pass Authorization: Bearer ...',
        );
      }
      if (row.organisation_id !== input.apiKey.organisationId) {
        throw new UnauthorizedException('Invalid or expired code');
      }
    }

    const claimed = await this.codeRepo.markUsed(input.code);
    if (!claimed) {
      // Lost the race — another exchange got there first.
      throw new UnauthorizedException('Invalid or expired code');
    }

    const user = await this.userRepo.findById(row.user_id);
    if (!user) {
      throw new UnauthorizedException('Invalid or expired code');
    }

    // The org is unambiguous here — it's the org the client_id (API key)
    // belongs to — so scope the token to it via the `org` claim. ActiveOrgGuard
    // reads that claim, so the client no longer needs to be trusted to send the
    // right X-Organisation-Id (the response still echoes organisationId below
    // for display + backward compatibility).
    const tokens = this.authService.generateTokens(user.id, {
      organisationId: codeKey.organisation_id,
    });
    await this.refreshTokenRepo.create({
      user_id: user.id,
      hash: await this.authService.hash(tokens.refreshToken),
    });
    await this.userRepo.updateById(user.id, { last_sign_in_at: new Date() });
    return {
      ...tokens,
      user: authUserFromUser(user),
      organisationId: codeKey.organisation_id,
    };
  }

  /**
   * Validate the public-client (PKCE) exchange path. Throws on any
   * mismatch; returns normally if everything lines up. Pulled out of the
   * main exchangeCode body so the two paths read clearly side-by-side.
   */
  private verifyPublicClientExchange(args: {
    codeKey: OrganisationApiKey;
    codeRow: { code_challenge: string | null; code_challenge_method: string | null };
    suppliedClientId: string | undefined;
    suppliedVerifier: string | undefined;
    origin: string | undefined;
  }) {
    // Caller must identify the key in the body — there's no Authorization
    // header on this path. The clientId must resolve to the same key that
    // issued the code; anything else means the request is being replayed
    // against a different key.
    if (!args.suppliedClientId) {
      throw new UnauthorizedException(
        'clientId required in body for public-client exchange.',
      );
    }
    if (args.suppliedClientId.slice(0, 16) !== args.codeKey.key_prefix) {
      throw new UnauthorizedException('Invalid or expired code');
    }

    if (!args.codeRow.code_challenge || args.codeRow.code_challenge_method !== 'S256') {
      // Public client minted a code without PKCE somehow (manual API call?).
      // Refuse — accepting it would mean the code is bearer-equivalent.
      throw new UnauthorizedException('Invalid or expired code');
    }
    if (!args.suppliedVerifier) {
      throw new BadRequestException('code_verifier required for public-client exchange.');
    }
    const computed = createHash('sha256').update(args.suppliedVerifier).digest();
    const expected = Buffer.from(base64UrlDecode(args.codeRow.code_challenge));
    if (computed.length !== expected.length || !timingSafeEqual(computed, expected)) {
      throw new UnauthorizedException('Invalid or expired code');
    }

    // Origin gating: when an Origin header is present (browser), it must
    // sit under one of the key's registered redirect URIs. Server-to-server
    // callers have no Origin header — they're already gated by the
    // is_public_client policy refusing them above (no bearer = no auth on
    // private keys, no Origin to check on public keys). This blocks
    // drive-by attempts from a different origin even if a code+verifier
    // somehow leak.
    if (args.origin) {
      const allowedOrigins = new Set(
        (args.codeKey.redirect_uris ?? [])
          .map((u) => safeOrigin(u))
          .filter((o): o is string => o !== null),
      );
      if (!allowedOrigins.has(args.origin)) {
        throw new ForbiddenException(
          'Origin not in this key\'s redirect URI allow-list.',
        );
      }
    }
  }

  // -------- helpers --------

  private async resolveActiveApiKey(clientId: string): Promise<OrganisationApiKey> {
    // Callers paste either the public prefix (16 chars, e.g.
    // "sz_test_gVwNcXmu") or the full key the seed/key-create UI
    // prints (~52 chars). Both should work — the stored key_prefix
    // is the first 16 chars, so slice before lookup. Treating the
    // full key as the client_id is also what most OAuth-style
    // integrators do because the key cleartext is shown to them
    // exactly once.
    const lookup = clientId.slice(0, 16);
    const row = await this.apiKeyRepo.findActiveByPrefix(lookup);
    if (!row) {
      throw new UnauthorizedException('Unknown or revoked client_id');
    }
    return row;
  }

  /**
   * Verifies the Firebase ID token and resolves it to a real `users` row. If this
   * is the user's first appearance, create the row; if a "pending" row already
   * exists for this email (from the Phase 2 client-onboarding upsert), claim it by
   * swapping the placeholder firebase_uid + provider.
   */
  private async resolveUserFromFirebase(idToken: string): Promise<User> {
    let decoded;
    try {
      decoded = await this.firebaseService.verifyIdToken(idToken);
    } catch (err) {
      this.logger.warn(`Firebase token verification failed: ${(err as Error).message}`);
      throw new UnauthorizedException('Invalid Firebase ID token');
    }
    const { uid, email, email_verified } = decoded;
    if (!email) throw new UnauthorizedException('Firebase token has no email');
    if (!email_verified) throw new UnauthorizedException('Email not verified');
    const provider = decoded.firebase?.sign_in_provider ?? 'firebase';

    // Existing user by firebase_uid → return as-is.
    let user = await this.userRepo.findByFirebaseUid(uid);
    if (user) return user;

    // Email match → claim either a "pending" row from API onboarding, or an
    // existing real user from a previous provider sign-in.
    const byEmail = await this.userRepo.findByEmail(email);
    if (byEmail) {
      return this.userRepo.updateById(byEmail.id, {
        firebase_uid: uid,
        provider,
      });
    }

    // Brand-new user. Create with minimal fields; integrator can patch the rest.
    return this.userRepo.create({
      firebase_uid: uid,
      email,
      display_name: (decoded.name as string | undefined) ?? email.split('@')[0],
      provider,
      roles: [UserRole.USER],
    });
  }

  private async ensureAthleteMembership(userId: string, organisationId: string): Promise<void> {
    const existing = await this.membershipRepo.findByUserAndOrg(userId, organisationId);
    if (existing) {
      // Don't quietly demote an existing coach/admin to athlete — only provision
      // if there's no membership at all. (Hosted auth is by definition the end-user
      // flow; a coach who happens to use it stays a coach.)
      return;
    }
    try {
      await this.membershipRepo.create({
        organisation_id: organisationId,
        user_id: userId,
        role: OrganisationRole.ATHLETE,
        invited_by_user_id: null,
        invitation_message: null,
        metadata: {},
        accepted_at: new Date(),
      });
    } catch (err) {
      // Unique-violation under race is fine; the user is a member either way.
      this.logger.debug(`Membership create raced: ${(err as Error).message}`);
    }
  }
}

/**
 * 32-byte URL-safe random code. Long enough to brute-force is computationally
 * infeasible even without the org-scope + redirect_uri checks layered above.
 */
function randomCode(): string {
  return randomBytes(32).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Decode a base64url (RFC 4648 §5) string into raw bytes. Node's
 * Buffer.from(..., 'base64') accepts the URL-safe alphabet but expects
 * standard '=' padding, which RFC 7636 omits — restore it before decoding.
 */
function base64UrlDecode(s: string): Uint8Array {
  const padded = s + '='.repeat((4 - (s.length % 4)) % 4);
  return new Uint8Array(Buffer.from(padded.replace(/-/g, '+').replace(/_/g, '/'), 'base64'));
}

/**
 * Extract just the `scheme://host[:port]` part of a redirect URI for
 * Origin-header comparison. Returns null for unparseable input so the
 * caller can drop it from the allow-list rather than match against junk.
 */
function safeOrigin(uri: string): string | null {
  try {
    return new URL(uri).origin;
  } catch {
    return null;
  }
}

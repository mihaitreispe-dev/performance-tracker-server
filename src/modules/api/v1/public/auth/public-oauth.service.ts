import { randomBytes } from 'node:crypto';

import {
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
    });

    return {
      code,
      redirectUri: input.redirectUri,
      state: input.state ?? null,
      expiresAt: expiresAt.toISOString(),
    };
  }

  async exchangeCode(input: {
    code: string;
    redirectUri: string;
    apiKey: { apiKeyId: string; organisationId: string };
  }): Promise<PublicAuthSessionDTO> {
    const row = await this.codeRepo.findRedeemable(input.code);
    if (!row) {
      // Single bland error message — never tell an attacker whether a code is
      // expired, used, or simply doesn't exist.
      throw new UnauthorizedException('Invalid or expired code');
    }
    if (row.organisation_id !== input.apiKey.organisationId) {
      throw new UnauthorizedException('Invalid or expired code');
    }
    if (row.redirect_uri !== input.redirectUri) {
      throw new UnauthorizedException('redirect_uri does not match the original authorization');
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

    const tokens = this.authService.generateTokens(user.id);
    await this.refreshTokenRepo.create({
      user_id: user.id,
      hash: await this.authService.hash(tokens.refreshToken),
    });
    await this.userRepo.updateById(user.id, { last_sign_in_at: new Date() });

    // Stamp the API key's org id on the response so the third-party
    // app knows what to put in X-Organisation-Id on subsequent requests.
    // For the auth flow, the org is unambiguous — it's the org the
    // client_id (API key) belongs to.
    return {
      ...tokens,
      user: authUserFromUser(user),
      organisationId: input.apiKey.organisationId,
    };
  }

  // -------- helpers --------

  private async resolveActiveApiKey(clientId: string): Promise<OrganisationApiKey> {
    const row = await this.apiKeyRepo.findActiveByPrefix(clientId);
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

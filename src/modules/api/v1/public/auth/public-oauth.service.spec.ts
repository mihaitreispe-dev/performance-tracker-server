import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import {
  OAuthAuthorizationCode,
  OrganisationApiKey,
  OrganisationMembership,
  OrganisationRole,
  User,
  UserRole,
} from 'src/database/interfaces';
import { AuthService } from 'src/modules/auth/services/auth.service';
import { FirebaseService } from 'src/modules/firebase/firebase.service';
import { OAuthAuthorizationCodeRepository } from 'src/repositories/oauth-authorization-code.repository';
import { OrganisationApiKeyRepository } from 'src/repositories/organisation-api-key.repository';
import { OrganisationMembershipRepository } from 'src/repositories/organisation-membership.repository';
import { RefreshTokenRepository } from 'src/repositories/refresh-token.repository';
import { UserRepository } from 'src/repositories/user.repository';

import { PublicOAuthService } from './public-oauth.service';

const ORG = 'org-1';
const REDIRECT = 'https://client.example.com/cb';

const makeApiKey = (overrides: Partial<OrganisationApiKey> = {}): OrganisationApiKey =>
  ({
    id: 'key-1',
    organisation_id: ORG,
    name: 'Production',
    key_prefix: 'sz_live_abcd1234',
    key_hash: 'hash',
    scopes: ['auth:exchange'],
    redirect_uris: [REDIRECT],
    last_used_at: null,
    revoked_at: null,
    expires_at: null,
    created_by_user_id: 'admin-1',
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  }) as unknown as OrganisationApiKey;

const makeUser = (overrides: Partial<User> = {}): User =>
  ({
    id: 'u-1',
    firebase_uid: 'fb-uid-1',
    email: 'client@example.com',
    display_name: 'Client',
    first_name: null,
    last_name: null,
    picture_s3_bucket: null,
    picture_s3_key: null,
    provider: 'google.com',
    roles: [UserRole.USER],
    fcm_tokens: [],
    created_at: new Date(),
    updated_at: new Date(),
    last_sign_in_at: null,
    ...overrides,
  }) as unknown as User;

const makeCode = (overrides: Partial<OAuthAuthorizationCode> = {}): OAuthAuthorizationCode =>
  ({
    code: 'COD3',
    organisation_id: ORG,
    api_key_id: 'key-1',
    user_id: 'u-1',
    redirect_uri: REDIRECT,
    expires_at: new Date(Date.now() + 5 * 60 * 1000),
    used_at: null,
    created_at: new Date(),
    ...overrides,
  }) as unknown as OAuthAuthorizationCode;

describe('PublicOAuthService', () => {
  let service: PublicOAuthService;
  let firebase: jest.Mocked<FirebaseService>;
  let userRepo: jest.Mocked<UserRepository>;
  let membershipRepo: jest.Mocked<OrganisationMembershipRepository>;
  let apiKeyRepo: jest.Mocked<OrganisationApiKeyRepository>;
  let codeRepo: jest.Mocked<OAuthAuthorizationCodeRepository>;
  let refreshRepo: jest.Mocked<RefreshTokenRepository>;
  let authService: jest.Mocked<AuthService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PublicOAuthService,
        {
          provide: FirebaseService,
          useValue: {
            verifyIdToken: jest.fn().mockResolvedValue({
              uid: 'fb-uid-1',
              email: 'client@example.com',
              email_verified: true,
              firebase: { sign_in_provider: 'google.com' },
            }),
          },
        },
        {
          provide: AuthService,
          useValue: {
            generateTokens: jest.fn().mockReturnValue({
              accessToken: 'access-token',
              refreshToken: 'refresh-token',
              tokenType: 'bearer',
            }),
            hash: jest.fn().mockResolvedValue('hashed-refresh'),
          },
        },
        {
          provide: UserRepository,
          useValue: {
            findById: jest.fn(),
            findByFirebaseUid: jest.fn(),
            findByEmail: jest.fn(),
            updateById: jest.fn(),
            create: jest.fn(),
          },
        },
        {
          provide: RefreshTokenRepository,
          useValue: { create: jest.fn().mockResolvedValue(undefined) },
        },
        {
          provide: OrganisationMembershipRepository,
          useValue: {
            findByUserAndOrg: jest.fn(),
            create: jest.fn(),
          },
        },
        {
          provide: OrganisationApiKeyRepository,
          useValue: { findActiveByPrefix: jest.fn() },
        },
        {
          provide: OAuthAuthorizationCodeRepository,
          useValue: {
            create: jest.fn().mockResolvedValue(undefined),
            findRedeemable: jest.fn(),
            markUsed: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get(PublicOAuthService);
    firebase = module.get(FirebaseService);
    userRepo = module.get(UserRepository);
    membershipRepo = module.get(OrganisationMembershipRepository);
    apiKeyRepo = module.get(OrganisationApiKeyRepository);
    codeRepo = module.get(OAuthAuthorizationCodeRepository);
    refreshRepo = module.get(RefreshTokenRepository);
    authService = module.get(AuthService);
  });

  // ---- mintAuthorizationCode ----

  describe('mintAuthorizationCode', () => {
    it('rejects unknown client_id', async () => {
      apiKeyRepo.findActiveByPrefix.mockResolvedValue(undefined as never);
      await expect(
        service.mintAuthorizationCode({
          firebaseIdToken: 'fb',
          clientId: 'sz_live_missing',
          redirectUri: REDIRECT,
        }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('rejects when the key has no redirect URIs configured', async () => {
      apiKeyRepo.findActiveByPrefix.mockResolvedValue(makeApiKey({ redirect_uris: [] }));
      await expect(
        service.mintAuthorizationCode({
          firebaseIdToken: 'fb',
          clientId: 'sz_live_abcd1234',
          redirectUri: REDIRECT,
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('rejects redirect_uri not in the allow-list (no substring escapes)', async () => {
      apiKeyRepo.findActiveByPrefix.mockResolvedValue(makeApiKey({ redirect_uris: [REDIRECT] }));
      await expect(
        service.mintAuthorizationCode({
          firebaseIdToken: 'fb',
          clientId: 'sz_live_abcd1234',
          redirectUri: 'https://attacker.com/cb',
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('rejects when Firebase rejects the token', async () => {
      apiKeyRepo.findActiveByPrefix.mockResolvedValue(makeApiKey());
      firebase.verifyIdToken.mockRejectedValueOnce(new Error('bad token'));
      await expect(
        service.mintAuthorizationCode({
          firebaseIdToken: 'fb',
          clientId: 'sz_live_abcd1234',
          redirectUri: REDIRECT,
        }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('rejects unverified emails', async () => {
      apiKeyRepo.findActiveByPrefix.mockResolvedValue(makeApiKey());
      firebase.verifyIdToken.mockResolvedValueOnce({
        uid: 'fb-uid-1',
        email: 'client@example.com',
        email_verified: false,
      } as never);
      await expect(
        service.mintAuthorizationCode({
          firebaseIdToken: 'fb',
          clientId: 'sz_live_abcd1234',
          redirectUri: REDIRECT,
        }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('claims an existing pending user (email match) by swapping firebase_uid', async () => {
      apiKeyRepo.findActiveByPrefix.mockResolvedValue(makeApiKey());
      userRepo.findByFirebaseUid.mockResolvedValue(undefined as never);
      userRepo.findByEmail.mockResolvedValue(makeUser({ firebase_uid: 'pending:abc', provider: 'pending' }));
      userRepo.updateById.mockResolvedValue(makeUser({ firebase_uid: 'fb-uid-1', provider: 'google.com' }));
      membershipRepo.findByUserAndOrg.mockResolvedValue(undefined as never);
      membershipRepo.create.mockResolvedValue({} as OrganisationMembership);

      const out = await service.mintAuthorizationCode({
        firebaseIdToken: 'fb',
        clientId: 'sz_live_abcd1234',
        redirectUri: REDIRECT,
        state: 'csrf-xyz',
      });

      expect(userRepo.updateById).toHaveBeenCalledWith('u-1', {
        firebase_uid: 'fb-uid-1',
        provider: 'google.com',
      });
      expect(out.state).toBe('csrf-xyz');
      expect(out.redirectUri).toBe(REDIRECT);
      expect(out.code).toMatch(/^[A-Za-z0-9_-]+$/);
      expect(codeRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ organisation_id: ORG, redirect_uri: REDIRECT, user_id: 'u-1' }),
      );
    });

    it('creates a new user when neither firebase_uid nor email match', async () => {
      apiKeyRepo.findActiveByPrefix.mockResolvedValue(makeApiKey());
      userRepo.findByFirebaseUid.mockResolvedValue(undefined as never);
      userRepo.findByEmail.mockResolvedValue(undefined as never);
      userRepo.create.mockResolvedValue(makeUser({ id: 'u-new' }));
      membershipRepo.findByUserAndOrg.mockResolvedValue(undefined as never);
      membershipRepo.create.mockResolvedValue({} as OrganisationMembership);

      await service.mintAuthorizationCode({
        firebaseIdToken: 'fb',
        clientId: 'sz_live_abcd1234',
        redirectUri: REDIRECT,
      });

      expect(userRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          firebase_uid: 'fb-uid-1',
          email: 'client@example.com',
          roles: [UserRole.USER],
        }),
      );
    });

    it('does not provision a new membership when one already exists (e.g. a coach signing in)', async () => {
      apiKeyRepo.findActiveByPrefix.mockResolvedValue(makeApiKey());
      userRepo.findByFirebaseUid.mockResolvedValue(makeUser());
      membershipRepo.findByUserAndOrg.mockResolvedValue({
        role: OrganisationRole.COACH,
      } as OrganisationMembership);

      await service.mintAuthorizationCode({
        firebaseIdToken: 'fb',
        clientId: 'sz_live_abcd1234',
        redirectUri: REDIRECT,
      });

      expect(membershipRepo.create).not.toHaveBeenCalled();
    });
  });

  // ---- exchangeCode ----

  describe('exchangeCode', () => {
    const apiKey = { apiKeyId: 'key-1', organisationId: ORG };

    it('returns a session on the happy path', async () => {
      codeRepo.findRedeemable.mockResolvedValue(makeCode());
      codeRepo.markUsed.mockResolvedValue(true);
      userRepo.findById.mockResolvedValue(makeUser());
      userRepo.updateById.mockResolvedValue(makeUser());

      const result = await service.exchangeCode({ code: 'COD3', redirectUri: REDIRECT, apiKey });

      expect(result.accessToken).toBe('access-token');
      expect(result.refreshToken).toBe('refresh-token');
      expect(refreshRepo.create).toHaveBeenCalledWith({ user_id: 'u-1', hash: 'hashed-refresh' });
      expect(authService.generateTokens).toHaveBeenCalledWith('u-1');
    });

    it('rejects unknown / expired / already-used codes uniformly', async () => {
      codeRepo.findRedeemable.mockResolvedValue(undefined as never);
      await expect(
        service.exchangeCode({ code: 'nope', redirectUri: REDIRECT, apiKey }),
      ).rejects.toThrow(UnauthorizedException);
      expect(codeRepo.markUsed).not.toHaveBeenCalled();
    });

    it('rejects a code minted for a different org (apiKey/org mismatch)', async () => {
      codeRepo.findRedeemable.mockResolvedValue(makeCode({ organisation_id: 'other-org' }));
      await expect(
        service.exchangeCode({ code: 'COD3', redirectUri: REDIRECT, apiKey }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('rejects when redirect_uri differs from the originally-authorised value', async () => {
      codeRepo.findRedeemable.mockResolvedValue(makeCode());
      await expect(
        service.exchangeCode({
          code: 'COD3',
          redirectUri: 'https://attacker.com/cb',
          apiKey,
        }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('rejects when CAS lost the race (someone else marked used first)', async () => {
      codeRepo.findRedeemable.mockResolvedValue(makeCode());
      codeRepo.markUsed.mockResolvedValue(false);
      await expect(
        service.exchangeCode({ code: 'COD3', redirectUri: REDIRECT, apiKey }),
      ).rejects.toThrow(UnauthorizedException);
      expect(authService.generateTokens).not.toHaveBeenCalled();
    });

    it('rejects when the user row disappeared between mint and exchange', async () => {
      codeRepo.findRedeemable.mockResolvedValue(makeCode());
      codeRepo.markUsed.mockResolvedValue(true);
      userRepo.findById.mockResolvedValue(undefined as never);
      await expect(
        service.exchangeCode({ code: 'COD3', redirectUri: REDIRECT, apiKey }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });
});

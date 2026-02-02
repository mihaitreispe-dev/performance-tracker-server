import { BadRequestException, Injectable, Logger, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { Request } from 'express';
import { UserRole } from 'src/database/interfaces';
import { ClientInfo } from 'src/lib/util/client-info';
import { splitName } from 'src/lib/util/split-name';
import { authUserFromUser } from 'src/modules/api/v1/auth/auth-user.mapper';
import { GrantType } from 'src/modules/api/v1/auth/types';
import { getUserPictureUrl } from 'src/modules/api/v1/mappers/user.mapper';
import { AuthService } from 'src/modules/auth/services/auth.service';
import { AuthUser } from 'src/modules/auth/types/authenticated-user';
import { AppConfigService } from 'src/modules/config/app-config.service';
import { FirebaseService } from 'src/modules/firebase/firebase.service';
import { S3Service } from 'src/modules/s3/s3.service';
import { RefreshTokenRepository } from 'src/repositories/refresh-token.repository';
import { UserRepository } from 'src/repositories/user.repository';

import { CreateTokensBody, CreateTokensQuery, RevokeTokensBody } from './request.dto';
import { AuthSessionResponse, AuthUserResponse } from './response.dto';

@Injectable()
export class AuthApiService {
  private readonly logger = new Logger(AuthApiService.name);
  constructor(
    private readonly authService: AuthService,
    private readonly firebaseService: FirebaseService,
    private readonly s3Service: S3Service,
    private readonly configService: AppConfigService,
    private readonly userRepo: UserRepository,
    private readonly refreshTokenRepo: RefreshTokenRepository,
  ) {}

  async createTokens(
    req: Request,
    reqQuery: CreateTokensQuery,
    reqBody: CreateTokensBody,
  ): Promise<AuthSessionResponse> {
    const { grantType } = reqQuery;
    if (grantType === GrantType.firebase) {
      const { idToken, fcmToken, displayName } = reqBody;
      if (!idToken) {
        throw new BadRequestException('Missing idToken');
      }
      try {
        const idTokenVerifyResult = await this.firebaseService.verifyIdToken(idToken);
        const { uid, email, name: firebaseName, email_verified } = idTokenVerifyResult;
        const provider = this.mapProvider(idTokenVerifyResult.firebase?.sign_in_provider ?? 'unknown');
        if (!email) {
          throw new UnauthorizedException('Missing email');
        }
        if (!email_verified) {
          throw new UnauthorizedException('Email not verified');
        }
        let client: string | undefined;

        const xClientInfoHeader = req.headers['x-client-info'];
        if (xClientInfoHeader && typeof xClientInfoHeader === 'string') {
          const xClientInfoHeaderParts = xClientInfoHeader.split('/');
          if (xClientInfoHeaderParts.length > 0) {
            client = xClientInfoHeader.split('/')[0];
          }
        }
        // TODO: check if client is permitted ClientInfo

        const roles = [UserRole.USER];
        if (client === ClientInfo.creator) {
          roles.push(UserRole.COACH);
        }

        let name: string | undefined;
        if (firebaseName && typeof firebaseName === 'string') {
          name = firebaseName;
        }
        const nameOrDisplayName: string | undefined | null = name ?? displayName;
        const { firstName, lastName } = nameOrDisplayName
          ? splitName(nameOrDisplayName)
          : { firstName: null, lastName: null };

        let user = await this.userRepo.findByFirebaseUid(uid);
        if (!user) {
          user = await this.userRepo.findByEmail(email);
          if (user) {
            user = await this.userRepo.updateById(user.id, { firebase_uid: uid });
          }
        }
        if (!user) {
          user = await this.userRepo.create({
            firebase_uid: uid,
            email,
            display_name: nameOrDisplayName ?? '',
            first_name: firstName,
            last_name: lastName,
            provider,
            roles,
          });
        } else {
          const mergedRoles = [...new Set([...user.roles, ...roles])];
          await this.userRepo.updateById(user.id, {
            roles: mergedRoles,
            first_name: user.first_name ?? firstName,
            last_name: user.last_name ?? lastName,
          });
        }

        const tokens = await this.authService.generateTokens(user.id);
        await this.refreshTokenRepo.create({
          user_id: user.id,
          hash: await this.authService.hash(tokens.refreshToken),
        });
        await this.userRepo.updateById(user.id, { last_sign_in_at: new Date() });
        if (fcmToken) {
          await this.userRepo.addFcmToken(user.id, fcmToken);
        }
        return { data: { ...tokens, user: authUserFromUser(user) } };
      } catch (error) {
        Logger.error(error);
        throw new UnauthorizedException();
      }
    } else if (grantType === GrantType.refreshToken) {
      const { refreshToken } = reqBody;
      if (!refreshToken) {
        throw new BadRequestException('Missing refreshToken');
      }
      const decodedToken = await this.authService.verifyRefreshToken(refreshToken);
      const user = await this.userRepo.findById(decodedToken.sub);
      if (!user) {
        throw new UnauthorizedException();
      }
      const tokens = await this.authService.generateTokens(user.id);
      const refreshTokens = await this.refreshTokenRepo.findManyByUserId(user.id);
      await this.refreshTokenRepo.create({
        user_id: user.id,
        hash: await this.authService.hash(tokens.refreshToken),
      });
      for (const existingRefreshToken of refreshTokens) {
        const matches = await this.authService.validateHash(refreshToken, existingRefreshToken.hash);
        if (matches) {
          await this.refreshTokenRepo.deleteById(existingRefreshToken.id);
          break;
        }
      }
      return { data: { ...tokens, user: authUserFromUser(user) } };
    } else {
      throw new BadRequestException('Invalid grantType');
    }
  }

  async revokeTokens(req: Request & { user: AuthUser }, reqBody: RevokeTokensBody): Promise<void> {
    const { refreshToken, fcmToken } = reqBody;
    try {
      const decodedToken = await this.authService.verifyRefreshToken(refreshToken);
      if (decodedToken.sub !== req.user.id) {
        throw new UnauthorizedException();
      }
      const refreshTokens = await this.refreshTokenRepo.findManyByUserId(decodedToken.sub);
      for (const existingRefreshToken of refreshTokens) {
        const matches = await this.authService.validateHash(refreshToken, existingRefreshToken.hash);
        if (matches) {
          await this.refreshTokenRepo.deleteById(existingRefreshToken.id);
          break;
        }
      }
      if (fcmToken) {
        await this.userRepo.removeFcmToken(decodedToken.sub, fcmToken);
      }
    } catch (error) {
      Logger.error(error);
      throw new UnauthorizedException();
    }
  }

  async getUser(req: Request & { user: AuthUser }): Promise<AuthUserResponse> {
    const user = await this.userRepo.findById(req.user.id);
    if (!user) {
      throw new NotFoundException();
    }
    return {
      data: {
        id: user.id,
        displayName: user.display_name,
        firstName: user.first_name,
        lastName: user.last_name,
        picture: await getUserPictureUrl(
          this.configService,
          this.s3Service,
          user.picture_s3_bucket,
          user.picture_s3_key,
        ),
      },
    };
  }

  private mapProvider(providerId: string): string {
    switch (providerId) {
      case 'google.com':
        return 'google';
      case 'apple.com':
        return 'apple';
      case 'password':
        return 'email';
      default:
        return providerId;
    }
  }
}

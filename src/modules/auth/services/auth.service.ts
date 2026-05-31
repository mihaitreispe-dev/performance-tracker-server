import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import ms, { StringValue } from 'ms';
import { TokenType } from 'src/modules/auth/types/token-type';
import { AppConfigService } from 'src/modules/config/app-config.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly configService: AppConfigService,
    private readonly jwtService: JwtService,
  ) {}

  public generateTokens(userId: string, opts?: { impersonatorId?: string | null }) {
    // `imp` (impersonator id) sits alongside the standard `sub` so a platform
    // admin acting as another user can be tracked end-to-end (audit logs read
    // the claim, the client UI surfaces a "you are impersonating X" banner
    // off it). Absent for normal logins. Propagated through refresh too so
    // the impersonation context survives a token rotation.
    const baseClaims: Record<string, string> = { sub: userId };
    if (opts?.impersonatorId) baseClaims.imp = opts.impersonatorId;

    const accessTokenExpiresIn = this.configService.jwtAccessTokenExpiry;
    let accessTokenExpiresInMs: number | undefined;
    if (accessTokenExpiresIn) {
      if (typeof accessTokenExpiresIn === 'string') {
        accessTokenExpiresInMs = ms(accessTokenExpiresIn as StringValue);
      } else {
        accessTokenExpiresInMs = accessTokenExpiresIn;
      }
    }
    const accessToken = this.jwtService.sign(baseClaims, {
      secret: this.configService.jwtAccessTokenSecret,
      ...(accessTokenExpiresIn ? { expiresIn: accessTokenExpiresIn as StringValue } : {}),
    });

    const refreshTokenExpiresIn = this.configService.jwtRefreshTokenExpiry;
    let refreshTokenExpiresInMs: number | undefined;
    if (refreshTokenExpiresIn) {
      if (typeof refreshTokenExpiresIn === 'string') {
        refreshTokenExpiresInMs = ms(refreshTokenExpiresIn as StringValue);
      } else {
        refreshTokenExpiresInMs = refreshTokenExpiresIn;
      }
    }
    const refreshToken = this.jwtService.sign(baseClaims, {
      secret: this.configService.jwtRefreshTokenSecret,
      ...(refreshTokenExpiresIn ? { expiresIn: refreshTokenExpiresIn as StringValue } : {}),
    });

    return {
      accessToken,
      accessTokenExpiresIn: accessTokenExpiresInMs,
      refreshToken,
      refreshTokenExpiresIn: refreshTokenExpiresInMs,
      tokenType: 'bearer' as TokenType,
    };
  }

  public async verifyAccessToken(token: string) {
    let payload;
    try {
      payload = await this.jwtService.verifyAsync(token, { secret: this.configService.jwtAccessTokenSecret });
    } catch (_error) {
      throw new UnauthorizedException();
    }
    if (typeof payload !== 'object' || !('sub' in payload) || !payload.sub) {
      throw new UnauthorizedException();
    }
    return payload as jwt.JwtPayload & { sub: string };
  }

  public async verifyRefreshToken(token: string) {
    let payload;
    try {
      payload = await this.jwtService.verifyAsync(token, { secret: this.configService.jwtRefreshTokenSecret });
    } catch (_error) {
      throw new UnauthorizedException();
    }
    if (typeof payload !== 'object' || !('sub' in payload) || !payload.sub) {
      throw new UnauthorizedException();
    }
    return payload as jwt.JwtPayload & { sub: string };
  }

  public async validateHash(value: string, hash: string): Promise<boolean> {
    return bcrypt.compare(value, hash);
  }

  public async hash(text: string): Promise<string> {
    return bcrypt.hash(text, 10);
  }
}

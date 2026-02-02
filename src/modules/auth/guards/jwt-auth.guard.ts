import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { AuthService } from 'src/modules/auth/services/auth.service';
import { AuthUser } from 'src/modules/auth/types/authenticated-user';

const DISABLE_JWT_AUTH_GUARD_KEY = 'DISABLE_JWT_AUTH_GUARD_KEY';
export const DisableJwtAuthGuard = () => SetMetadata(DISABLE_JWT_AUTH_GUARD_KEY, true);

const OPTIONAL_JWT_AUTH_GUARD_KEY = 'OPTIONAL_JWT_AUTH_GUARD_KEY';
export const OptionalJwtAuthGuard = () => SetMetadata(OPTIONAL_JWT_AUTH_GUARD_KEY, true);

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private authService: AuthService,
    private reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const jwtIsSkipped = this.reflector.getAllAndOverride<boolean>(DISABLE_JWT_AUTH_GUARD_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (jwtIsSkipped) {
      return true;
    }

    const jwtIsOptional = this.reflector.getAllAndOverride<boolean>(OPTIONAL_JWT_AUTH_GUARD_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    const request = context.switchToHttp().getRequest();
    const token = this.extractTokenFromHeader(request);
    if (!token) {
      if (jwtIsOptional) {
        return true;
      }
      throw new UnauthorizedException();
    }
    try {
      const payload = await this.authService.verifyAccessToken(token);
      // 💡 We're assigning the payload to the request object here
      // so that we can access it in our route handlers
      request['user'] = { id: payload.sub } as AuthUser;
    } catch {
      if (jwtIsOptional) {
        return true;
      }
      throw new UnauthorizedException();
    }
    return true;
  }

  private extractTokenFromHeader(request: Request): string | undefined {
    const [type, token] = request.headers['authorization']?.split(' ') ?? [];
    return type === 'Bearer' ? token : undefined;
  }
}

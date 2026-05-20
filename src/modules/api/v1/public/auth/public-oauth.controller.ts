import { Body, Controller, Post, Req } from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiOperation,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import { Request } from 'express';

import { SkipActiveOrg } from 'src/modules/auth/guards/active-org.guard';
import { DisableJwtAuthGuard } from 'src/modules/auth/guards/jwt-auth.guard';
import type { ApiKeyContext } from 'src/modules/auth/api-key/api-key.guard';
import { PublicApiRoute } from 'src/modules/auth/api-key/public-api-route.decorator';

import { PublicOAuthService } from './public-oauth.service';
import { AuthorizeBody, TokenExchangeBody } from './request.dto';
import { AuthorizeResponse, PublicAuthSessionResponse } from './response.dto';

type PublicRequest = Request & { apiKey: ApiKeyContext };

@ApiTags('Public')
@Controller('public/auth')
@SkipActiveOrg()
export class PublicOAuthController {
  constructor(private readonly service: PublicOAuthService) {}

  /**
   * Called by the hosted /embed/auth page on our domain after Firebase login.
   * NOT API-key-authed — the page lives on our domain and uses the user's freshly
   * minted Firebase ID token. Per-request gating happens inside the service
   * (clientId → API key lookup, redirect_uri allow-list, Firebase verify).
   */
  @Post('authorize')
  @DisableJwtAuthGuard()
  @ApiOperation({
    summary:
      'Mint a single-use authorization code from a Firebase login. Called by the hosted auth page on our domain — not the integrator backend.',
  })
  @ApiCreatedResponse({ type: AuthorizeResponse })
  async authorize(@Body() body: AuthorizeBody): Promise<AuthorizeResponse> {
    const data = await this.service.mintAuthorizationCode({
      firebaseIdToken: body.firebaseIdToken,
      clientId: body.clientId,
      redirectUri: body.redirectUri,
      state: body.state,
    });
    return { data };
  }

  /**
   * Called by the integrator's backend with their API key. Exchanges the
   * authorization code for a regular AuthSession (access + refresh) that they
   * can hand to the user just like any first-party Firebase login.
   */
  @Post('token')
  @PublicApiRoute('auth:exchange')
  @ApiSecurity('apiKey')
  @ApiOperation({
    summary:
      'Exchange a single-use authorization code for a session (access + refresh tokens) for the user.',
  })
  @ApiCreatedResponse({ type: PublicAuthSessionResponse })
  async token(
    @Req() req: PublicRequest,
    @Body() body: TokenExchangeBody,
  ): Promise<PublicAuthSessionResponse> {
    const data = await this.service.exchangeCode({
      code: body.code,
      redirectUri: body.redirectUri,
      apiKey: req.apiKey,
    });
    return { data };
  }
}

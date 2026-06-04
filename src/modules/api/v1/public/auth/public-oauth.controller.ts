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
import { OptionalPublicApiRoute } from 'src/modules/auth/api-key/public-api-route.decorator';

import { PublicOAuthService } from './public-oauth.service';
import { AuthorizeBody, TokenExchangeBody } from './request.dto';
import { AuthorizeResponse, PublicAuthSessionResponse } from './response.dto';

type PublicRequest = Request & { apiKey?: ApiKeyContext };

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
      codeChallenge: body.codeChallenge,
      codeChallengeMethod: body.codeChallengeMethod,
    });
    return { data };
  }

  /**
   * Exchange the authorization code for a regular AuthSession.
   *
   * Two caller archetypes share this endpoint:
   *
   *   - **Integrator backend** holding a private API key: sends
   *     `Authorization: Bearer <key>` and the ApiKeyAuthGuard authenticates
   *     them upstream. This is the original integrator-server flow.
   *
   *   - **Browser SPA / native app** using a public-client key: sends no
   *     bearer; identifies the key via `clientId` in the body, proves
   *     possession of the originating session with `codeVerifier` (PKCE).
   *
   * OptionalPublicApiRoute() runs the API-key guard only when a bearer is
   * present; the service decides which auth mode applies based on the
   * code's stored key.
   */
  @Post('token')
  @OptionalPublicApiRoute('auth:exchange')
  @ApiSecurity('apiKey')
  @ApiOperation({
    summary:
      'Exchange a single-use authorization code for a session. Supports private-key (Bearer) and public-client (PKCE) callers.',
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
      codeVerifier: body.codeVerifier,
      clientId: body.clientId,
      // Origin is browser-set; server-to-server callers don't send it. Used
      // for the public-client CORS-style allow-list check inside the service.
      origin: typeof req.headers.origin === 'string' ? req.headers.origin : undefined,
    });
    return { data };
  }
}

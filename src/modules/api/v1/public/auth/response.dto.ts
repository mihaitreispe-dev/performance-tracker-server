import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { UserRole } from 'src/database/interfaces';

/**
 * Public-facing copy of the AuthUser shape. Duplicated rather than imported because
 * the first-party `AuthUserDTO` lives inside a private file scope and we don't want
 * to couple our public OpenAPI surface to its private export shape.
 */
export class PublicAuthUserDTO {
  @ApiProperty()
  id: string;

  @ApiProperty()
  displayName: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  firstName?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  lastName?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  picture?: string | null;

  @ApiProperty({ type: [String], enum: UserRole })
  roles: UserRole[];

  @ApiPropertyOptional({ type: String, nullable: true })
  coachId?: string | null;
}

export class AuthorizeCodeDTO {
  @ApiProperty({ description: 'Single-use authorization code. Expires in ~5 minutes.' })
  code: string;

  @ApiProperty({ description: 'Original redirect_uri the page should navigate to.' })
  redirectUri: string;

  @ApiPropertyOptional({ nullable: true, description: 'Echoed back from the request.' })
  state: string | null;

  @ApiProperty({ description: 'ISO timestamp at which the code stops being redeemable.' })
  expiresAt: string;
}

export class AuthorizeResponse {
  @ApiProperty({ type: AuthorizeCodeDTO })
  data: AuthorizeCodeDTO;
}

/**
 * Shape returned from POST /v1/public/auth/token. Mirrors the regular AuthSession
 * (access + refresh tokens + the AuthUser) so integrators can drop these straight
 * into the same client-side mechanics the first-party app uses.
 */
export class PublicAuthSessionDTO {
  @ApiProperty()
  accessToken: string;

  @ApiPropertyOptional({ type: Number })
  accessTokenExpiresIn?: number;

  @ApiProperty()
  refreshToken: string;

  @ApiPropertyOptional({ type: Number, nullable: true })
  refreshTokenExpiresIn?: number | null;

  @ApiProperty({ example: 'bearer' })
  tokenType: string;

  @ApiProperty({ type: PublicAuthUserDTO })
  user: PublicAuthUserDTO;

  /**
   * The id of the org this session was minted against — derived from the
   * API key the integrator's OAuth client_id resolves to. Third-party
   * apps put this in the X-Organisation-Id header on every subsequent
   * request to /v1/me/* and the rest of the first-party JWT surface;
   * removes the need for the app to round-trip /v1/organisations/me
   * just to figure out the active org.
   */
  @ApiProperty()
  organisationId: string;
}

export class PublicAuthSessionResponse {
  @ApiProperty({ type: PublicAuthSessionDTO })
  data: PublicAuthSessionDTO;
}

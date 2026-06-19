import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, IsUrl, MaxLength, MinLength } from 'class-validator';

export class AuthorizeBody {
  @ApiProperty({
    description:
      'Firebase ID token from the hosted page (Firebase Auth on our domain). Proves the user just logged in.',
  })
  @IsString()
  @MinLength(20)
  firebaseIdToken: string;

  @ApiProperty({
    description: 'API key prefix identifying the integrating org. Same value the key starts with (sz_live_…).',
  })
  @IsString()
  @MinLength(10)
  clientId: string;

  @ApiProperty({
    description: 'Where to redirect the browser after minting the code. Must be in the key\'s allow-list.',
  })
  @IsString()
  @MaxLength(2000)
  // require_tld:false lets dev-time callbacks like http://localhost:5180/callback
  // through — validator.js otherwise rejects them because "localhost" has no
  // dot/TLD. Production redirect URIs still need a real host since the key's
  // allow-list is what actually gates dispatch (this validator is just a
  // shape check).
  @IsUrl({ require_protocol: true, require_valid_protocol: true, require_tld: false })
  redirectUri: string;

  @ApiPropertyOptional({ description: 'Opaque value echoed back to the relying party. CSRF defence.' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  state?: string;

  @ApiPropertyOptional({
    description:
      'PKCE code challenge (RFC 7636) — base64url(SHA256(code_verifier)). Required for public-client keys.',
  })
  @IsOptional()
  @IsString()
  @MinLength(43)
  @MaxLength(128)
  codeChallenge?: string;

  @ApiPropertyOptional({
    enum: ['S256'],
    description: 'PKCE challenge method. Only S256 is supported; plain is disallowed by policy.',
  })
  @IsOptional()
  @IsIn(['S256'])
  codeChallengeMethod?: 'S256';
}

export class TokenExchangeBody {
  @ApiProperty({ description: 'Single-use authorization code from /v1/public/auth/authorize.' })
  @IsString()
  @MinLength(20)
  code: string;

  @ApiProperty({ description: 'Must be byte-identical to the redirect_uri used to mint the code.' })
  @IsString()
  @MaxLength(2000)
  redirectUri: string;

  @ApiPropertyOptional({
    description:
      'PKCE code verifier (RFC 7636). Required when the code was minted with a code_challenge; required for all public-client keys.',
  })
  @IsOptional()
  @IsString()
  @MinLength(43)
  @MaxLength(128)
  codeVerifier?: string;

  @ApiPropertyOptional({
    description:
      'Public-client identifier (the API key prefix or full key). Required for public-client keys, ignored otherwise — the Bearer header is the canonical auth for private keys.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  clientId?: string;
}

/**
 * Direct branded sign-in: trade a Firebase ID token for an org-scoped session
 * in one call, with no hosted page / authorization-code round-trip. The
 * Firebase token is the proof of identity; the API key (Bearer for private
 * clients, `clientId` for public ones) identifies the org.
 */
export class FirebaseSessionBody {
  @ApiProperty({
    description:
      'Firebase ID token from the branded in-app sign-in. Proves the user just authenticated with Firebase.',
  })
  @IsString()
  @MinLength(20)
  firebaseIdToken: string;

  @ApiPropertyOptional({
    description:
      'Public-client identifier (the API key prefix or full key). Required for public-client keys; private keys authenticate via the Bearer header instead.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  clientId?: string;

  @ApiPropertyOptional({ description: 'FCM device token to register for push notifications at sign-in.' })
  @IsOptional()
  @IsString()
  @MaxLength(4096)
  fcmToken?: string;
}

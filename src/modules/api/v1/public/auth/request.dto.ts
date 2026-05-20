import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUrl, MaxLength, MinLength } from 'class-validator';

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
  @IsUrl({ require_protocol: true, require_valid_protocol: true })
  redirectUri: string;

  @ApiPropertyOptional({ description: 'Opaque value echoed back to the relying party. CSRF defence.' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  state?: string;
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
}

import { ApiProperty } from '@nestjs/swagger';
import { Equals, IsBoolean, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

/**
 * Body for POST /v1/me/device-tokens. The token is the FCM registration
 * token returned by Firebase Messaging on the client. Platform is
 * advisory (we don't dispatch differently on it today but the field
 * future-proofs us for "iOS-only campaigns" or similar rule additions).
 */
export class RegisterDeviceTokenBody {
  @ApiProperty({ description: 'FCM registration token from Firebase Messaging.' })
  @IsString()
  @MinLength(8)
  @MaxLength(4096)
  token: string;

  @ApiProperty({ enum: ['web', 'ios', 'android'], required: false })
  @IsOptional()
  @IsString()
  @IsIn(['web', 'ios', 'android'])
  platform?: 'web' | 'ios' | 'android';
}

/**
 * Body for POST /v1/me/checkout-session — JWT-authed equivalent of
 * the public-API `/v1/public/clients/:id/checkout-session`. The caller
 * IS the client; the user id comes from req.user, not the body.
 */
export class MeCheckoutSessionBody {
  @ApiProperty({ description: 'Stripe price id (price_...) for the plan the user is buying.' })
  @IsString()
  @MinLength(3)
  priceId: string;

  @ApiProperty({ description: 'Where to send the user after a successful checkout.' })
  @IsString()
  @MaxLength(2000)
  successUrl: string;

  @ApiProperty({ description: 'Where to send the user if they cancel before paying.' })
  @IsString()
  @MaxLength(2000)
  cancelUrl: string;

  @ApiProperty({ required: false, description: 'Optional Stripe promotion code id.' })
  @IsOptional()
  @IsString()
  promotionCodeId?: string;
}

export class MeBillingPortalSessionBody {
  @ApiProperty({ description: 'Where Stripe should return the user after they close the portal.' })
  @IsString()
  @MaxLength(2000)
  returnUrl: string;
}

/**
 * Body for POST /v1/me/voice-clone/upload-url — presign a PUT for the
 * coach's voice-clone enrollment sample.
 */
export class VoiceCloneUploadUrlBody {
  @ApiProperty({ description: 'Sample filename (e.g. sample.webm).' })
  @IsString()
  @MaxLength(200)
  filename: string;

  @ApiProperty({ description: 'Audio MIME type (audio/webm, audio/mpeg, audio/mp4, audio/wav).' })
  @IsString()
  mimeType: string;
}

/**
 * Body for POST /v1/me/voice-clone — enroll the uploaded sample as a
 * cloned voice. `consent` MUST be true: we will not clone a real
 * person's voice without an explicit, recorded opt-in.
 */
export class EnrollVoiceCloneBody {
  @ApiProperty({ description: 'S3 key returned by the upload-url call.' })
  @IsString()
  s3Key: string;

  @ApiProperty({ description: 'Audio MIME type of the uploaded sample.' })
  @IsString()
  mimeType: string;

  @ApiProperty({ description: 'Explicit consent to clone the coach\'s voice. Must be true.' })
  @IsBoolean()
  @Equals(true)
  consent: boolean;
}

/**
 * Body for PATCH /v1/me/profile. Lets the authed user rename themselves
 * from a client settings screen. Every field is optional — the client
 * sends only what changed. `displayName` is what the apps render in
 * chrome (header, greetings); first/last are the structured split.
 */
export class UpdateMyProfileBody {
  @ApiProperty({ required: false, description: 'Name shown in app chrome.' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  displayName?: string;

  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  firstName?: string;

  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  lastName?: string;
}

/**
 * Query for GET /v1/me/featured-content. Caller passes the resource
 * kinds it cares about — typically `workout,course,snack,plan` for a
 * home-screen carousel. Default: all kinds.
 */
export class ListFeaturedContentQuery {
  @ApiProperty({
    required: false,
    description: 'Comma-separated kinds: workout,course,snack,plan. Default: all.',
  })
  @IsOptional()
  @IsString()
  kinds?: string;

  @ApiProperty({
    required: false,
    description: 'Maximum rows per kind. Default 12, cap 50.',
  })
  @IsOptional()
  @IsString()
  limit?: string;
}

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

// ---------- Connect onboarding ----------

export class StartConnectOnboardingDto {
  @ApiPropertyOptional({ description: 'ISO-3166-1 alpha-2 country code (e.g. "US", "GB"). Stripe routes capabilities accordingly.' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(2)
  country?: string;

  @ApiPropertyOptional({ description: 'Pre-fill the operator email on the Stripe onboarding page.' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  email?: string;

  @ApiProperty({
    description:
      'Where Stripe should bring the user back after onboarding. Typically your /organisations/:id/settings?tab=billing URL.',
  })
  @IsString()
  @MaxLength(2000)
  returnUrl: string;
}

export class UpdateConnectAccountDto {
  @ApiPropertyOptional({
    description:
      'Platform fee on every subscription charge, in basis points (10000 = 100%). Capped to a sane range to prevent fat-fingered 100% fees.',
    minimum: 0,
    maximum: 5000,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  platformFeeBps?: number;
}

// ---------- Catalogue ----------

export class CreateProductDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;
}

export class CreatePriceDto {
  @ApiProperty({ description: 'Local product id (uuid, not the Stripe id).' })
  @IsUUID()
  productId: string;

  @ApiProperty({ description: 'ISO-4217 currency code, lower-case (e.g. "usd").' })
  @IsString()
  @MinLength(3)
  @MaxLength(3)
  currency: string;

  @ApiProperty({ description: 'Amount in the smallest currency unit (cents).' })
  @IsInt()
  @Min(0)
  unitAmount: number;

  @ApiProperty({ enum: ['month', 'year'] })
  @IsIn(['month', 'year'])
  interval: 'month' | 'year';

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  intervalCount?: number;

  @ApiPropertyOptional({ description: 'Free trial length in days, 0–365.' })
  @IsOptional()
  @IsInt()
  @Min(0)
  trialPeriodDays?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  nickname?: string;
}

// ---------- Coupons ----------

export class CreateCouponDto {
  @ApiPropertyOptional({ description: 'Percent off, 1–100. Mutually exclusive with amountOff.' })
  @IsOptional()
  @IsInt()
  @Min(1)
  percentOff?: number;

  @ApiPropertyOptional({ description: 'Amount off in the smallest currency unit. Requires currency.' })
  @IsOptional()
  @IsInt()
  @Min(1)
  amountOff?: number;

  @ApiPropertyOptional({ description: 'ISO-4217 currency, required if amountOff is set.' })
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(3)
  currency?: string;

  @ApiProperty({ enum: ['once', 'repeating', 'forever'] })
  @IsIn(['once', 'repeating', 'forever'])
  duration: 'once' | 'repeating' | 'forever';

  @ApiPropertyOptional({ description: 'Required when duration=repeating.' })
  @IsOptional()
  @IsInt()
  @Min(1)
  durationInMonths?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  maxRedemptions?: number;

  @ApiPropertyOptional({ description: 'Unix seconds. Coupon stops being redeemable after this point.' })
  @IsOptional()
  @IsInt()
  redeemBy?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  @ApiPropertyOptional({
    description:
      'Customer-facing code to mint a Stripe promotion_code for. If omitted, only an internal coupon is created.',
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  code?: string;
}

// ---------- Refunds ----------

export class CreateRefundDto {
  @ApiProperty({ description: 'Stripe PaymentIntent id (pi_xxx). Refunds the most-recent charge on it.' })
  @IsString()
  @MinLength(5)
  paymentIntentId: string;

  @ApiPropertyOptional({
    description: 'Partial refund — amount in smallest currency unit. Omit for a full refund.',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  amount?: number;

  @ApiPropertyOptional({ enum: ['duplicate', 'fraudulent', 'requested_by_customer'] })
  @IsOptional()
  @IsEnum(['duplicate', 'fraudulent', 'requested_by_customer'])
  reason?: 'duplicate' | 'fraudulent' | 'requested_by_customer';
}

// ---------- Params ----------

export class OrgIdParam {
  @IsUUID()
  id: string;
}

export class OrgIdProductIdParams {
  @IsUUID()
  id: string;

  @IsUUID()
  productId: string;
}

export class OrgIdPriceIdParams {
  @IsUUID()
  id: string;

  @IsUUID()
  priceId: string;
}

export class OrgIdCouponIdParams {
  @IsUUID()
  id: string;

  @IsUUID()
  couponId: string;
}

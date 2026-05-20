import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

/**
 * Body for creating a Checkout Session for an existing client.
 *
 * `priceId` is the *Stripe* price id (price_...) rather than our local uuid —
 * matches what GET /v1/public/products returns. Lets a third-party app render
 * a price card straight from the listing and POST the same id back.
 */
export class CreateCheckoutSessionBody {
  @ApiProperty({ description: 'Stripe price id (price_...) for the plan the client is buying.' })
  @IsString()
  @MinLength(3)
  priceId: string;

  @ApiProperty({ description: 'Where to send the customer after a successful checkout.' })
  @IsString()
  @MaxLength(2000)
  successUrl: string;

  @ApiProperty({ description: 'Where to send the customer if they cancel before paying.' })
  @IsString()
  @MaxLength(2000)
  cancelUrl: string;

  @ApiPropertyOptional({ description: 'Optional Stripe promotion code id (promo_...) to pre-apply at checkout.' })
  @IsOptional()
  @IsString()
  promotionCodeId?: string;
}

export class CreateBillingPortalSessionBody {
  @ApiProperty({ description: 'Where Stripe should bring the customer back from the portal.' })
  @IsString()
  @MaxLength(2000)
  returnUrl: string;
}

export class PublicClientIdParam {
  @IsUUID()
  id: string;
}

export class ListPublicProductsQuery {
  @ApiPropertyOptional({
    description:
      "Include archived/inactive products + prices in the response. Defaults to false (active-only).",
  })
  @IsOptional()
  @IsBoolean()
  includeInactive?: boolean;
}

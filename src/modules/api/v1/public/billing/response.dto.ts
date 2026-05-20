import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Read-side product listing for the public API. Embeds the product's active
 * prices so a third-party app can render the catalogue in a single round trip.
 */
export class PublicBillingPriceDTO {
  @ApiProperty({ description: 'Stripe price id — pass this to /checkout-session.' })
  stripePriceId: string;

  @ApiPropertyOptional({ nullable: true }) nickname: string | null;
  @ApiProperty({ description: 'ISO-4217 currency code, lowercase.' }) currency: string;
  @ApiProperty({ description: 'Amount in the smallest currency unit (cents for USD).' }) unitAmount: number;
  @ApiProperty({ description: "'month' | 'year'." }) interval: string;
  @ApiProperty() intervalCount: number;
  @ApiPropertyOptional({ nullable: true }) trialPeriodDays: number | null;
  @ApiProperty() active: boolean;
}

export class PublicBillingProductDTO {
  @ApiProperty({ description: 'Stripe product id.' }) stripeProductId: string;
  @ApiProperty() name: string;
  @ApiPropertyOptional({ nullable: true }) description: string | null;
  @ApiProperty() active: boolean;
  @ApiProperty({ type: [PublicBillingPriceDTO] }) prices: PublicBillingPriceDTO[];
}

export class PublicBillingProductListResponse {
  @ApiProperty({ type: [PublicBillingProductDTO] }) data: PublicBillingProductDTO[];
}

export class PublicCheckoutSessionDTO {
  @ApiProperty({ description: 'Stripe Checkout Session id (cs_...).' }) id: string;
  @ApiProperty({ description: "Hosted Checkout URL — redirect the customer's browser here." }) url: string;
}

export class PublicCheckoutSessionResponse {
  @ApiProperty({ type: PublicCheckoutSessionDTO }) data: PublicCheckoutSessionDTO;
}

export class PublicBillingPortalSessionDTO {
  @ApiProperty({ description: 'Hosted billing portal URL — redirect the customer here.' }) url: string;
}

export class PublicBillingPortalSessionResponse {
  @ApiProperty({ type: PublicBillingPortalSessionDTO }) data: PublicBillingPortalSessionDTO;
}

export class PublicClientSubscriptionDTO {
  @ApiProperty() stripeSubscriptionId: string;
  @ApiProperty() stripePriceId: string;
  @ApiProperty({ description: "Stripe subscription status: 'trialing'|'active'|'past_due'|'canceled'|..." }) status: string;
  @ApiPropertyOptional({ nullable: true }) currentPeriodStart: string | null;
  @ApiPropertyOptional({ nullable: true }) currentPeriodEnd: string | null;
  @ApiProperty() cancelAtPeriodEnd: boolean;
  @ApiPropertyOptional({ nullable: true }) trialEnd: string | null;
}

/**
 * Response for GET /v1/public/clients/:id/subscription. `data: null` means the
 * client has no active subscription yet — distinct from a 404 (the client
 * itself not being found in the org).
 */
export class PublicClientSubscriptionResponse {
  @ApiProperty({ type: PublicClientSubscriptionDTO, nullable: true }) data: PublicClientSubscriptionDTO | null;
}

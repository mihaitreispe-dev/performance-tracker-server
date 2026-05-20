import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ConnectAccountDTO {
  @ApiProperty() organisationId: string;
  @ApiProperty() stripeAccountId: string;
  @ApiProperty() chargesEnabled: boolean;
  @ApiProperty() payoutsEnabled: boolean;
  @ApiProperty() detailsSubmitted: boolean;
  @ApiPropertyOptional({ nullable: true }) defaultCurrency: string | null;
  @ApiPropertyOptional({ nullable: true }) country: string | null;
  @ApiProperty({ description: 'Platform fee in basis points (10000 = 100%).' })
  platformFeeBps: number;
}

export class ConnectAccountResponse {
  @ApiProperty({ type: ConnectAccountDTO }) data: ConnectAccountDTO;
}

export class OnboardingLinkDTO {
  @ApiProperty({
    description:
      "Stripe-hosted onboarding URL. Single-use, short-lived (~minutes). Redirect the org admin's browser here.",
  })
  url: string;

  @ApiProperty() expiresAt: string;
}

export class OnboardingLinkResponse {
  @ApiProperty({ type: OnboardingLinkDTO }) data: OnboardingLinkDTO;
}

export class LoginLinkDTO {
  @ApiProperty({ description: 'Single-use URL into the org admin\'s Stripe Express dashboard.' })
  url: string;
}

export class LoginLinkResponse {
  @ApiProperty({ type: LoginLinkDTO }) data: LoginLinkDTO;
}

// ---------- Catalogue ----------

export class BillingProductDTO {
  @ApiProperty() id: string;
  @ApiProperty() stripeProductId: string;
  @ApiProperty() name: string;
  @ApiPropertyOptional({ nullable: true }) description: string | null;
  @ApiProperty() active: boolean;
  @ApiProperty() createdAt: string;
}

export class BillingProductResponse {
  @ApiProperty({ type: BillingProductDTO }) data: BillingProductDTO;
}

export class BillingProductListResponse {
  @ApiProperty({ type: [BillingProductDTO] }) data: BillingProductDTO[];
}

export class BillingPriceDTO {
  @ApiProperty() id: string;
  @ApiProperty() stripeProductId: string;
  @ApiProperty() stripePriceId: string;
  @ApiPropertyOptional({ nullable: true }) nickname: string | null;
  @ApiProperty() currency: string;
  @ApiProperty() unitAmount: number;
  @ApiProperty() interval: string;
  @ApiProperty() intervalCount: number;
  @ApiPropertyOptional({ nullable: true }) trialPeriodDays: number | null;
  @ApiProperty() active: boolean;
  @ApiProperty() createdAt: string;
}

export class BillingPriceResponse {
  @ApiProperty({ type: BillingPriceDTO }) data: BillingPriceDTO;
}

export class BillingPriceListResponse {
  @ApiProperty({ type: [BillingPriceDTO] }) data: BillingPriceDTO[];
}

// ---------- Coupons ----------

export class BillingCouponDTO {
  @ApiProperty() id: string;
  @ApiProperty() stripeCouponId: string;
  @ApiPropertyOptional({ nullable: true }) stripePromotionCodeId: string | null;
  @ApiPropertyOptional({ nullable: true }) code: string | null;
  @ApiPropertyOptional({ nullable: true }) percentOff: number | null;
  @ApiPropertyOptional({ nullable: true }) amountOff: number | null;
  @ApiPropertyOptional({ nullable: true }) currency: string | null;
  @ApiProperty() duration: string;
  @ApiPropertyOptional({ nullable: true }) durationInMonths: number | null;
  @ApiPropertyOptional({ nullable: true }) maxRedemptions: number | null;
  @ApiPropertyOptional({ nullable: true }) redeemBy: string | null;
  @ApiProperty() active: boolean;
  @ApiProperty() createdAt: string;
}

export class BillingCouponResponse {
  @ApiProperty({ type: BillingCouponDTO }) data: BillingCouponDTO;
}

export class BillingCouponListResponse {
  @ApiProperty({ type: [BillingCouponDTO] }) data: BillingCouponDTO[];
}

// ---------- Subscriptions ----------

export class BillingSubscriptionDTO {
  @ApiProperty() id: string;
  @ApiPropertyOptional({ nullable: true }) userId: string | null;
  @ApiProperty() stripeCustomerId: string;
  @ApiProperty() stripeSubscriptionId: string;
  @ApiProperty() stripePriceId: string;
  @ApiProperty() status: string;
  @ApiPropertyOptional({ nullable: true }) currentPeriodStart: string | null;
  @ApiPropertyOptional({ nullable: true }) currentPeriodEnd: string | null;
  @ApiProperty() cancelAtPeriodEnd: boolean;
  @ApiPropertyOptional({ nullable: true }) trialEnd: string | null;
}

export class BillingSubscriptionListResponse {
  @ApiProperty({ type: [BillingSubscriptionDTO] }) data: BillingSubscriptionDTO[];
}

// ---------- Refunds ----------

export class RefundDTO {
  @ApiProperty() id: string;
  @ApiProperty() amount: number;
  @ApiProperty() currency: string;
  @ApiProperty() status: string;
  @ApiPropertyOptional({ nullable: true }) reason: string | null;
}

export class RefundResponse {
  @ApiProperty({ type: RefundDTO }) data: RefundDTO;
}

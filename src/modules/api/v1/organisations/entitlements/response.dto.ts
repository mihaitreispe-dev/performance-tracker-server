import { ApiProperty } from '@nestjs/swagger';

import type { RequiredTierDTO } from 'src/modules/entitlements/entitlements.service';

/**
 * Recurring-price hint surfaced alongside the tier name — the admin UI
 * uses it for inline "currently $X/mo" labels next to each tier without
 * having to reach into the billing endpoints for the same info.
 */
export class TierPriceHintResponse {
  @ApiProperty() stripePriceId!: string;
  @ApiProperty({ description: 'Smallest currency unit (cents for USD).' }) unitAmount!: number;
  @ApiProperty() currency!: string;
  @ApiProperty({ description: "'month' | 'year' for recurring prices." }) interval!: string;
}

export class TierResponse {
  @ApiProperty({ description: 'Local stripe_products.id.' }) id!: string;
  @ApiProperty({ description: 'Bare Stripe product id (prod_…).' }) stripeProductId!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ nullable: true, type: String }) description!: string | null;
  @ApiProperty({ nullable: true, type: TierPriceHintResponse })
  cheapestPrice!: TierPriceHintResponse | null;
}

export class EntitlementsListResponse {
  @ApiProperty({ type: [TierResponse] })
  data!: RequiredTierDTO[];
}

/**
 * Lock-status payload returned to any authenticated org member who asks
 * about a specific resource. Mirrors the public-API shape so the same
 * client-side paywall component renders consistently whether it's
 * driven by the internal endpoint (athletes inside the admin app) or
 * the public one (sample-app consumers).
 */
export class LockStatusBody {
  @ApiProperty() locked!: boolean;
  @ApiProperty({ type: [TierResponse] }) requiredTiers!: RequiredTierDTO[];
}

export class LockStatusResponse {
  @ApiProperty({ type: LockStatusBody }) data!: LockStatusBody;
}

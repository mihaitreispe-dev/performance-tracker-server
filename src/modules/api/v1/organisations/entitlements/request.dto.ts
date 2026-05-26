import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsIn, IsString, IsUUID } from 'class-validator';

import type { EntitlementResourceType } from 'src/database/interfaces';

/**
 * URL params for entitlement endpoints —
 * `/organisations/:id/resources/:resourceType/:resourceId/entitlements`.
 * `resourceType` is constrained at the DTO level (matching the DB check)
 * so a wrong kind 400s before we touch the service.
 */
export class EntitlementResourceParams {
  @ApiProperty({ description: 'Organisation id', format: 'uuid' })
  @IsUUID()
  id!: string;

  @ApiProperty({
    description: 'Kind of resource being gated',
    enum: ['workout', 'content_item', 'course'],
  })
  @IsString()
  @IsIn(['workout', 'content_item', 'course'])
  resourceType!: EntitlementResourceType;

  @ApiProperty({ description: 'Resource id (workout / content_item / course)', format: 'uuid' })
  @IsUUID()
  resourceId!: string;
}

/**
 * Replace-all semantics: the admin sends the desired final set of
 * product ids. Empty array clears the gate (resource becomes free).
 */
export class ReplaceEntitlementsDto {
  @ApiProperty({
    description:
      'Local stripe_products.id values that should unlock this resource. Empty array removes all gating.',
    type: [String],
  })
  @IsArray()
  @IsUUID(undefined, { each: true })
  stripeProductIds!: string[];
}

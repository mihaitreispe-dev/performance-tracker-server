import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Subset of stripe_products shape — keeps the client surface small and
 * stable. Lifted into its own DTO because two endpoints expose it
 * (entitlements roll-up + subscribe-tab catalog).
 */
export class MyProductDTO {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiPropertyOptional({ nullable: true })
  description: string | null;

  @ApiProperty()
  active: boolean;
}

/**
 * Per-resource-kind list of ids the user has unlocked. Empty kind keys
 * are omitted so the JSON stays tight on the wire.
 *
 * The client matches a workout/course/snack id against the relevant
 * array to know "do I show a play button or a lock badge?" without
 * issuing a per-resource lock check.
 */
export class MyUnlockedResourcesDTO {
  @ApiProperty({ type: [String], description: 'workout ids the user can play' })
  workout: string[];

  @ApiProperty({ type: [String], description: 'course ids the user can play' })
  course: string[];

  @ApiProperty({
    type: [String],
    description: 'content_item ids (movement snacks + course lessons) the user can play',
  })
  content_item: string[];
}

export class MyEntitlementsDTO {
  @ApiProperty({ type: [MyProductDTO] })
  products: MyProductDTO[];

  @ApiProperty({ type: MyUnlockedResourcesDTO })
  unlockedResources: MyUnlockedResourcesDTO;
}

export class MyEntitlementsResponse {
  @ApiProperty({ type: MyEntitlementsDTO })
  data: MyEntitlementsDTO;
}

// ----------------------------------------------------------------------------
// Featured content
// ----------------------------------------------------------------------------

export enum FeaturedItemKind {
  WORKOUT = 'workout',
  COURSE = 'course',
  SNACK = 'snack',
  PLAN = 'plan',
}

/**
 * One featured row. The shape is deliberately flat — every kind
 * surfaces the same minimum tuple (id / title / coverUrl / locked) so
 * the home-screen carousel can render a uniform card without per-kind
 * branching. Detail screens fetch the full resource by id.
 */
export class FeaturedItemDTO {
  @ApiProperty({ enum: FeaturedItemKind })
  kind: FeaturedItemKind;

  @ApiProperty()
  id: string;

  @ApiProperty()
  title: string;

  @ApiPropertyOptional({ nullable: true })
  description: string | null;

  @ApiPropertyOptional({ nullable: true })
  coverUrl: string | null;

  @ApiPropertyOptional({ nullable: true, description: 'ISO timestamp; null if open-ended.' })
  featuredFrom: string | null;

  @ApiPropertyOptional({ nullable: true, description: 'ISO timestamp; null if evergreen.' })
  featuredUntil: string | null;

  @ApiProperty({ description: 'True if the user cannot currently play this resource.' })
  locked: boolean;
}

export class FeaturedContentResponse {
  @ApiProperty({ type: [FeaturedItemDTO] })
  data: FeaturedItemDTO[];
}

// ----------------------------------------------------------------------------
// Device-token register/unregister
// ----------------------------------------------------------------------------

export class DeviceTokenAckDTO {
  @ApiProperty({ description: 'Tokens currently stored for the user after the op.' })
  count: number;
}

export class DeviceTokenAckResponse {
  @ApiProperty({ type: DeviceTokenAckDTO })
  data: DeviceTokenAckDTO;
}

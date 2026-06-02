import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsObject, IsOptional, IsString, MaxLength, ValidateNested } from 'class-validator';

/**
 * One QoE / funnel / logging-friction event from the player. The
 * server stores it verbatim with the caller's user_id + active org_id
 * stamped in.
 *
 * `eventType` is a namespaced string ('player.startup', 'workout.
 * block_complete', 'set.logging_committed', etc.) — see the client
 * emitter for the catalogue. We cap length at 64 because the client
 * never authors a longer name and 64 is well above the realistic
 * ceiling.
 *
 * `metric` is an open jsonb shape per event_type. The DTO doesn't
 * validate inner keys — that would bind the schema to a fixed event
 * catalogue and force a deploy for every new metric.
 */
export class PlayerTelemetryEventDto {
  @ApiProperty({ maxLength: 64 })
  @IsString()
  @MaxLength(64)
  eventType: string;

  @ApiProperty({ type: 'object', additionalProperties: true })
  @IsObject()
  @IsOptional()
  metric?: Record<string, unknown>;
}

/**
 * Bulk-insert body. The client batches events between intervals — one
 * round-trip for 50 events beats 50 fetches. Cap at 100/batch to bound
 * the request size on the wire and the SQL insert width.
 */
export class IngestPlayerTelemetryDto {
  @ApiProperty({ type: [PlayerTelemetryEventDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => PlayerTelemetryEventDto)
  events: PlayerTelemetryEventDto[];
}

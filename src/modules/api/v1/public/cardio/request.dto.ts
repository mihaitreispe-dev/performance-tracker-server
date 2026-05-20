import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsLatitude,
  IsLongitude,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

import { CardioMetricType } from 'src/database/interfaces';
import type { GeoJSONLineString } from 'src/database/interfaces';

export class ExecutionIdParam {
  @IsUUID()
  id: string;
}

// ---- Route upload ----

/**
 * Subset of GeoJSON we accept. Coordinates are [lon, lat] or [lon, lat, elevation]
 * per the GeoJSON spec — the storage column accepts either tuple shape.
 */
export class RouteGeoJSONBody {
  @ApiProperty({ enum: ['LineString'] })
  @IsString()
  type: 'LineString';

  @ApiProperty({
    description: 'Array of [lon, lat] or [lon, lat, elevation] tuples. ≥2 points.',
    type: 'array',
    items: { type: 'array', items: { type: 'number' } },
  })
  @IsArray()
  coordinates: number[][];
}

export class RouteMarkerBody {
  @ApiPropertyOptional({ default: 'split' })
  @IsOptional()
  @IsString()
  markerType?: string;

  @ApiPropertyOptional({ description: '1-indexed within the route.' })
  @IsOptional()
  @IsInt()
  @Min(1)
  markerNumber?: number;

  @ApiProperty()
  @IsLatitude()
  latitude: number;

  @ApiProperty()
  @IsLongitude()
  longitude: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  elevationMeters?: number;

  @ApiProperty({ description: 'ISO timestamp of the marker.' })
  @IsDateString()
  recordedAt: string;

  @ApiProperty({ description: 'Duration of this split, in seconds.' })
  @IsInt()
  @Min(0)
  splitTimeSeconds: number;

  @ApiProperty({ description: 'Total elapsed seconds at this marker.' })
  @IsInt()
  @Min(0)
  cumulativeTimeSeconds: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(20)
  @Max(240)
  avgHeartRate?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(60)
  avgPaceSecondsPerKm?: number;
}

export class UploadRouteBody {
  @ApiProperty({ type: RouteGeoJSONBody })
  @ValidateNested()
  @Type(() => RouteGeoJSONBody)
  route: GeoJSONLineString;

  @ApiProperty({ description: 'Total route distance in metres.' })
  @IsNumber()
  @Min(0)
  totalDistanceMeters: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  elevationGainMeters?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  elevationLossMeters?: number;

  @ApiPropertyOptional({ type: [RouteMarkerBody], description: 'Optional split markers.' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => RouteMarkerBody)
  markers?: RouteMarkerBody[];
}

// ---- Cardio metrics batch ----

export class CardioMetricSample {
  @ApiProperty({ enum: CardioMetricType })
  @IsEnum(CardioMetricType)
  metricType: CardioMetricType;

  @ApiProperty({ description: 'ISO timestamp when the sample was recorded.' })
  @IsDateString()
  recordedAt: string;

  @ApiProperty()
  @IsNumber()
  value: number;

  @ApiProperty({ description: 'e.g. "bpm", "wm", "rpm", "m/s", "m"' })
  @IsString()
  unit: string;
}

export class CardioMetricsBatchBody {
  @ApiProperty({ type: [CardioMetricSample] })
  @IsArray()
  @ArrayMinSize(0)
  @ArrayMaxSize(50_000)
  @ValidateNested({ each: true })
  @Type(() => CardioMetricSample)
  samples: CardioMetricSample[];
}

export class ListCardioMetricsQuery {
  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number = 0;

  @ApiPropertyOptional({ default: 50000, maximum: 50000 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50_000)
  limit?: number = 50_000;

  @ApiPropertyOptional({ enum: CardioMetricType, description: 'Filter to one stream.' })
  @IsOptional()
  @IsEnum(CardioMetricType)
  metricType?: CardioMetricType;
}

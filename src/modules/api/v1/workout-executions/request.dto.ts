import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { CardioMetricType, WorkoutExecutionSource } from 'src/database/interfaces';
import type { SortOptions } from 'src/lib/http/decorators/sort-param';
import { SortParam } from 'src/lib/http/decorators/sort-param';
import { PageQuery } from 'src/lib/http/dto/page-request.dto';
import { IsEnumString } from 'src/lib/validators/is-enum-string';

import { WorkoutExecutionSortField } from './types';

export class ListWorkoutExecutionsQuery extends PageQuery {
  @ApiPropertyOptional({ type: String, description: 'Filter by workout schedule ID' })
  @IsUUID()
  @IsOptional()
  workoutScheduleId?: string;

  @ApiPropertyOptional({ enum: WorkoutExecutionSource, description: 'Filter by source' })
  @IsEnumString(WorkoutExecutionSource)
  @IsOptional()
  source?: WorkoutExecutionSource;

  @ApiPropertyOptional({ type: String, format: 'date-time', description: 'Start date (inclusive)' })
  @IsDateString()
  @IsOptional()
  dateFrom?: string;

  @ApiPropertyOptional({ type: String, format: 'date-time', description: 'End date (inclusive)' })
  @IsDateString()
  @IsOptional()
  dateTo?: string;

  @ApiPropertyOptional({ type: Boolean, description: 'Filter by completion status' })
  @IsBoolean()
  @Type(() => Boolean)
  @IsOptional()
  completed?: boolean;

  @SortParam(WorkoutExecutionSortField)
  sort?: SortOptions<'started_at' | 'completed_at' | 'created_at' | 'updated_at'>;
}

export class StartWorkoutExecutionBody {
  @ApiProperty({ description: 'Workout schedule ID to start executing' })
  @IsUUID()
  workoutScheduleId: string;

  @ApiPropertyOptional({ type: String, format: 'date-time', description: 'Start time (defaults to now)' })
  @IsDateString()
  @IsOptional()
  startedAt?: string;

  @ApiPropertyOptional({ type: String, description: 'Optional notes' })
  @IsString()
  @IsOptional()
  notes?: string;
}

export class UpdateWorkoutExecutionBody {
  @ApiPropertyOptional({ type: String, format: 'date-time', description: 'Completion time' })
  @IsDateString()
  @IsOptional()
  completedAt?: string;

  @ApiPropertyOptional({ type: Number, description: 'Duration in seconds' })
  @IsInt()
  @Min(0)
  @IsOptional()
  durationSeconds?: number;

  @ApiPropertyOptional({ type: String, description: 'Notes' })
  @IsString()
  @IsOptional()
  notes?: string;
}

export class WorkoutExecutionIdParam {
  @ApiProperty({ description: 'Workout execution ID' })
  @IsUUID()
  id: string;
}

// Set Completions

export class CompleteSetBody {
  @ApiProperty({ description: 'Exercise instance ID' })
  @IsUUID()
  exerciseInstanceId: string;

  @ApiProperty({ type: Number, description: 'Set number (1-based)' })
  @IsInt()
  @Min(1)
  setNumber: number;

  @ApiPropertyOptional({ type: Number, description: 'Actual reps performed' })
  @IsInt()
  @Min(0)
  @IsOptional()
  actualReps?: number;

  @ApiPropertyOptional({ type: Number, description: 'Actual load used' })
  @IsNumber()
  @Min(0)
  @IsOptional()
  actualLoad?: number;

  @ApiPropertyOptional({ type: Number, description: 'Actual time in seconds' })
  @IsInt()
  @Min(0)
  @IsOptional()
  actualTimeSeconds?: number;

  @ApiPropertyOptional({ type: Number, description: 'RPE (1-10)' })
  @IsInt()
  @Min(1)
  @Max(10)
  @IsOptional()
  rpe?: number;

  @ApiPropertyOptional({ type: Boolean, description: 'Whether the set was skipped' })
  @IsBoolean()
  @IsOptional()
  skipped?: boolean;

  @ApiPropertyOptional({ type: String, description: 'Notes for this set' })
  @IsString()
  @IsOptional()
  notes?: string;
}

export class ListSetCompletionsQuery {
  @ApiPropertyOptional({ type: String, description: 'Filter by exercise instance ID' })
  @IsUUID()
  @IsOptional()
  exerciseInstanceId?: string;
}

// Cardio Metrics

export class CardioMetricBody {
  @ApiProperty({ enum: CardioMetricType, description: 'Type of metric' })
  @IsEnumString(CardioMetricType)
  metricType: CardioMetricType;

  @ApiProperty({ type: String, format: 'date-time', description: 'When the metric was recorded' })
  @IsDateString()
  recordedAt: string;

  @ApiProperty({ type: Number, description: 'Metric value' })
  @IsNumber()
  value: number;

  @ApiProperty({ type: String, description: 'Unit of measurement (bpm, watts, rpm, etc.)' })
  @IsString()
  unit: string;
}

export class BatchUploadMetricsBody {
  @ApiProperty({ type: [CardioMetricBody], description: 'Array of metrics to upload' })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CardioMetricBody)
  metrics: CardioMetricBody[];
}

export class ListMetricsQuery {
  @ApiPropertyOptional({ enum: CardioMetricType, description: 'Filter by metric type' })
  @IsEnumString(CardioMetricType)
  @IsOptional()
  metricType?: CardioMetricType;
}

// Route

export class RouteMarkerBody {
  @ApiProperty({ type: String, description: 'Marker type (km or mile)' })
  @IsString()
  markerType: string;

  @ApiProperty({ type: Number, description: 'Marker number (1 for first km/mile, etc.)' })
  @IsInt()
  @Min(1)
  markerNumber: number;

  @ApiProperty({ type: Number, description: 'Latitude' })
  @IsNumber()
  latitude: number;

  @ApiProperty({ type: Number, description: 'Longitude' })
  @IsNumber()
  longitude: number;

  @ApiPropertyOptional({ type: Number, description: 'Elevation in meters' })
  @IsNumber()
  @IsOptional()
  elevationMeters?: number;

  @ApiProperty({ type: String, format: 'date-time', description: 'When the marker was reached' })
  @IsDateString()
  recordedAt: string;

  @ApiProperty({ type: Number, description: 'Split time in seconds' })
  @IsInt()
  @Min(0)
  splitTimeSeconds: number;

  @ApiProperty({ type: Number, description: 'Cumulative time in seconds' })
  @IsInt()
  @Min(0)
  cumulativeTimeSeconds: number;

  @ApiPropertyOptional({ type: Number, description: 'Average heart rate for this split' })
  @IsInt()
  @IsOptional()
  avgHeartRate?: number;

  @ApiPropertyOptional({ type: Number, description: 'Average pace in seconds per km' })
  @IsInt()
  @IsOptional()
  avgPaceSecondsPerKm?: number;
}

export class GeoJSONLineStringBody {
  @ApiProperty({ type: String, enum: ['LineString'] })
  @IsString()
  type: 'LineString';

  @ApiProperty({
    type: 'array',
    items: { type: 'array', items: { type: 'number' } },
    description: 'Array of [lng, lat] or [lng, lat, elevation] coordinates',
    example: [
      [-122.4194, 37.7749],
      [-122.4195, 37.775, 10],
    ],
  })
  @IsArray()
  coordinates: number[][];
}

export class UploadRouteBody {
  @ApiProperty({ type: GeoJSONLineStringBody, description: 'Route as GeoJSON LineString' })
  @ValidateNested()
  @Type(() => GeoJSONLineStringBody)
  routeGeojson: GeoJSONLineStringBody;

  @ApiProperty({ type: Number, description: 'Total distance in meters' })
  @IsNumber()
  @Min(0)
  totalDistanceMeters: number;

  @ApiPropertyOptional({ type: Number, description: 'Elevation gain in meters' })
  @IsNumber()
  @IsOptional()
  elevationGainMeters?: number;

  @ApiPropertyOptional({ type: Number, description: 'Elevation loss in meters' })
  @IsNumber()
  @IsOptional()
  elevationLossMeters?: number;

  @ApiPropertyOptional({ type: [RouteMarkerBody], description: 'Route markers (km/mile splits)' })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RouteMarkerBody)
  @IsOptional()
  markers?: RouteMarkerBody[];
}

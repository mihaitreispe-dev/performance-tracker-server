import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsNumber, IsObject, IsOptional, IsString, IsUUID, ValidateNested } from 'class-validator';
import { CardioMetricType, WorkoutExecutionSource } from 'src/database/interfaces';
import { ItemResponse } from 'src/lib/http/dto/item-response.dto';
import { PageResponse } from 'src/lib/http/dto/page-response.dto';
import { IsEnumString } from 'src/lib/validators/is-enum-string';

import { WorkoutInfoDTO } from '../workout-schedules/response.dto';

export class WorkoutExecutionDTO {
  @ApiProperty()
  @IsUUID()
  id: string;

  @ApiProperty()
  @IsUUID()
  userId: string;

  @ApiPropertyOptional({ type: String })
  @IsUUID()
  @IsOptional()
  workoutScheduleId?: string | null;

  @ApiPropertyOptional()
  @IsObject()
  @ValidateNested()
  @IsOptional()
  workout?: WorkoutInfoDTO | null;

  @ApiProperty()
  @IsString()
  startedAt: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  @IsString()
  @IsOptional()
  completedAt?: string | null;

  @ApiPropertyOptional({ type: Number, nullable: true })
  @IsNumber()
  @IsOptional()
  durationSeconds?: number | null;

  @ApiProperty({ enum: WorkoutExecutionSource })
  @IsEnumString(WorkoutExecutionSource)
  source: WorkoutExecutionSource;

  @ApiPropertyOptional({ type: String, nullable: true })
  @IsString()
  @IsOptional()
  externalId?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  @IsString()
  @IsOptional()
  notes?: string | null;

  @ApiPropertyOptional({ type: Number, nullable: true, description: 'Session RPE (1-10)' })
  @IsNumber()
  @IsOptional()
  sessionRpe?: number | null;

  @ApiPropertyOptional({ type: Number, nullable: true, description: 'sRPE-TSS (RPE × duration in minutes)' })
  @IsNumber()
  @IsOptional()
  srpeTss?: number | null;

  @ApiPropertyOptional({ type: String, nullable: true, description: 'When session RPE was collected' })
  @IsString()
  @IsOptional()
  rpeCollectedAt?: string | null;

  @ApiProperty()
  @IsString()
  createdAt: string;

  @ApiProperty()
  @IsString()
  updatedAt: string;
}

export class WorkoutExecutionResponse extends ItemResponse<WorkoutExecutionDTO> {
  @ApiProperty()
  @IsObject({ always: true })
  @ValidateNested()
  declare data: WorkoutExecutionDTO;
}

export class WorkoutExecutionListResponse extends PageResponse<WorkoutExecutionDTO> {
  @ApiProperty({ type: [WorkoutExecutionDTO] })
  @IsArray({ always: true })
  @ValidateNested()
  declare data: WorkoutExecutionDTO[];
}

// Set Completions

export class SetCompletionDTO {
  @ApiProperty()
  @IsUUID()
  id: string;

  @ApiProperty()
  @IsUUID()
  workoutExecutionId: string;

  @ApiProperty()
  @IsUUID()
  exerciseInstanceId: string;

  @ApiProperty()
  @IsNumber()
  setNumber: number;

  @ApiPropertyOptional({ type: Number, nullable: true })
  @IsNumber()
  @IsOptional()
  actualReps?: number | null;

  @ApiPropertyOptional({ type: Number, nullable: true })
  @IsNumber()
  @IsOptional()
  actualLoad?: number | null;

  @ApiPropertyOptional({ type: Number, nullable: true })
  @IsNumber()
  @IsOptional()
  actualTimeSeconds?: number | null;

  @ApiPropertyOptional({ type: Number, nullable: true })
  @IsNumber()
  @IsOptional()
  rpe?: number | null;

  @ApiProperty()
  @IsString()
  completedAt: string;

  @ApiProperty()
  skipped: boolean;

  @ApiPropertyOptional({ type: String, nullable: true })
  @IsString()
  @IsOptional()
  notes?: string | null;

  @ApiProperty()
  @IsString()
  createdAt: string;
}

export class SetCompletionResponse extends ItemResponse<SetCompletionDTO> {
  @ApiProperty()
  @IsObject({ always: true })
  @ValidateNested()
  declare data: SetCompletionDTO;
}

export class SetCompletionListResponse extends PageResponse<SetCompletionDTO> {
  @ApiProperty({ type: [SetCompletionDTO] })
  @IsArray({ always: true })
  @ValidateNested()
  declare data: SetCompletionDTO[];
}

// Cardio Metrics

export class CardioMetricDTO {
  @ApiProperty()
  @IsUUID()
  id: string;

  @ApiProperty()
  @IsUUID()
  workoutExecutionId: string;

  @ApiProperty({ enum: CardioMetricType })
  @IsEnumString(CardioMetricType)
  metricType: CardioMetricType;

  @ApiProperty()
  @IsString()
  recordedAt: string;

  @ApiProperty()
  @IsNumber()
  value: number;

  @ApiProperty()
  @IsString()
  unit: string;

  @ApiProperty()
  @IsString()
  createdAt: string;
}

export class CardioMetricListResponse extends PageResponse<CardioMetricDTO> {
  @ApiProperty({ type: [CardioMetricDTO] })
  @IsArray({ always: true })
  @ValidateNested()
  declare data: CardioMetricDTO[];
}

export class BatchUploadMetricsResponse {
  @ApiProperty({ description: 'Number of metrics uploaded' })
  @IsNumber()
  count: number;
}

// Route

export class RouteMarkerDTO {
  @ApiProperty()
  @IsUUID()
  id: string;

  @ApiProperty()
  @IsString()
  markerType: string;

  @ApiProperty()
  @IsNumber()
  markerNumber: number;

  @ApiProperty()
  @IsNumber()
  latitude: number;

  @ApiProperty()
  @IsNumber()
  longitude: number;

  @ApiPropertyOptional({ type: Number, nullable: true })
  @IsNumber()
  @IsOptional()
  elevationMeters?: number | null;

  @ApiProperty()
  @IsString()
  recordedAt: string;

  @ApiProperty()
  @IsNumber()
  splitTimeSeconds: number;

  @ApiProperty()
  @IsNumber()
  cumulativeTimeSeconds: number;

  @ApiPropertyOptional({ type: Number, nullable: true })
  @IsNumber()
  @IsOptional()
  avgHeartRate?: number | null;

  @ApiPropertyOptional({ type: Number, nullable: true })
  @IsNumber()
  @IsOptional()
  avgPaceSecondsPerKm?: number | null;
}

export class GeoJSONLineStringDTO {
  @ApiProperty({ enum: ['LineString'] })
  @IsString()
  type: 'LineString';

  @ApiProperty({
    type: 'array',
    items: { type: 'array', items: { type: 'number' } },
    description: 'Array of [lng, lat] or [lng, lat, elevation] coordinates',
  })
  @IsArray()
  coordinates: number[][];
}

export class WorkoutRouteDTO {
  @ApiProperty()
  @IsUUID()
  id: string;

  @ApiProperty()
  @IsUUID()
  workoutExecutionId: string;

  @ApiProperty()
  @IsObject()
  @ValidateNested()
  routeGeojson: GeoJSONLineStringDTO;

  @ApiProperty()
  @IsNumber()
  totalDistanceMeters: number;

  @ApiPropertyOptional({ type: Number, nullable: true })
  @IsNumber()
  @IsOptional()
  elevationGainMeters?: number | null;

  @ApiPropertyOptional({ type: Number, nullable: true })
  @IsNumber()
  @IsOptional()
  elevationLossMeters?: number | null;

  @ApiProperty({ type: [RouteMarkerDTO] })
  @IsArray()
  @ValidateNested({ each: true })
  markers: RouteMarkerDTO[];

  @ApiProperty()
  @IsString()
  createdAt: string;
}

export class WorkoutRouteResponse extends ItemResponse<WorkoutRouteDTO> {
  @ApiProperty()
  @IsObject({ always: true })
  @ValidateNested()
  declare data: WorkoutRouteDTO;
}

// Session RPE

export class SessionRPEDTO {
  @ApiProperty({ description: 'Session RPE (1-10)' })
  @IsNumber()
  sessionRpe: number;

  @ApiProperty({ description: 'sRPE-TSS (RPE × duration in minutes)' })
  @IsNumber()
  srpeTss: number;

  @ApiPropertyOptional({ type: Number, nullable: true, description: 'Calculated TSS from power/pace/HR' })
  @IsNumber()
  @IsOptional()
  calculatedTss?: number | null;

  @ApiPropertyOptional({ type: Number, nullable: true, description: 'Ratio of sRPE-TSS to calculated TSS' })
  @IsNumber()
  @IsOptional()
  rpeTssRatio?: number | null;

  @ApiProperty({ description: 'Whether accumulated fatigue was detected' })
  accumulatedFatigueFlag: boolean;

  @ApiProperty({ description: 'When the RPE was collected' })
  @IsString()
  rpeCollectedAt: string;
}

export class SessionRPEResponse extends ItemResponse<SessionRPEDTO> {
  @ApiProperty()
  @IsObject({ always: true })
  @ValidateNested()
  declare data: SessionRPEDTO;
}

// ---- Completion summary (powers the player's end-of-workout screen) ----

export class WorkoutExecutionExercisePerfDTO {
  @ApiProperty()
  exerciseId: string;

  @ApiProperty()
  exerciseName: string;

  @ApiProperty({ description: 'Number of set_completions captured for this exercise (skipped + done).' })
  setsCompleted: number;

  @ApiProperty()
  setsSkipped: number;

  @ApiPropertyOptional({ type: Number, nullable: true, description: 'Total reps across all completed sets.' })
  totalReps: number | null;

  @ApiPropertyOptional({
    type: Number,
    nullable: true,
    description: 'Total time-under-load across all completed time-based sets, in seconds.',
  })
  totalTimeSeconds: number | null;

  @ApiPropertyOptional({
    type: Number,
    nullable: true,
    description: 'Σ(actual_load × actual_reps) for strength sets; null otherwise.',
  })
  totalVolume: number | null;

  @ApiPropertyOptional({ type: Number, nullable: true, description: 'Average RPE across the completed sets.' })
  avgRpe: number | null;
}

export class WorkoutExecutionSummaryDTO {
  @ApiProperty()
  executionId: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  workoutId: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  workoutName: string | null;

  @ApiProperty()
  startedAt: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  completedAt: string | null;

  @ApiProperty({ description: 'Wall-clock duration in seconds.' })
  totalDurationSeconds: number;

  @ApiProperty()
  exercisesPlanned: number;

  @ApiProperty({ description: 'Distinct exercises with at least one set completion.' })
  exercisesCompleted: number;

  @ApiProperty()
  setsPlanned: number;

  @ApiProperty()
  setsCompleted: number;

  @ApiProperty()
  setsSkipped: number;

  @ApiProperty({ description: 'setsCompleted / setsPlanned, [0..1].' })
  completionRatio: number;

  @ApiPropertyOptional({
    type: Number,
    nullable: true,
    description: 'Coach-collected session RPE (1-10); null if not captured.',
  })
  sessionRpe: number | null;

  @ApiPropertyOptional({ type: Number, nullable: true, description: 'Mean of all per-set RPEs captured.' })
  avgRpe: number | null;

  @ApiPropertyOptional({
    type: Number,
    nullable: true,
    description: 'Σ(load × reps) across strength sets, null if no strength sets had a load.',
  })
  totalVolume: number | null;

  @ApiProperty({ type: [WorkoutExecutionExercisePerfDTO] })
  perExercise: WorkoutExecutionExercisePerfDTO[];
}

export class WorkoutExecutionSummaryResponse extends ItemResponse<WorkoutExecutionSummaryDTO> {
  @ApiProperty()
  @IsObject({ always: true })
  @ValidateNested()
  declare data: WorkoutExecutionSummaryDTO;
}

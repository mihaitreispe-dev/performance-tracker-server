import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsEnum, IsInt, IsOptional, IsString, IsUUID, Max, Min, ValidateNested } from 'class-validator';
import { BodyPart, BodyView, PainTrend } from 'src/database/interfaces';

export class ListPainLogsQuery {
  @ApiPropertyOptional({ description: 'Workout execution ID to filter by' })
  @IsUUID()
  @IsOptional()
  workoutExecutionId?: string;

  @ApiPropertyOptional({ enum: BodyPart, description: 'Filter by body part' })
  @IsEnum(BodyPart)
  @IsOptional()
  bodyPart?: BodyPart;

  @ApiPropertyOptional({ enum: BodyView, description: 'Filter by body view' })
  @IsEnum(BodyView)
  @IsOptional()
  bodyView?: BodyView;

  @ApiPropertyOptional({ type: Number, description: 'Minimum pain level (1-10)' })
  @IsInt()
  @Min(1)
  @Max(10)
  @Type(() => Number)
  @IsOptional()
  minPainLevel?: number;

  @ApiPropertyOptional({ type: Number, description: 'Maximum pain level (1-10)' })
  @IsInt()
  @Min(1)
  @Max(10)
  @Type(() => Number)
  @IsOptional()
  maxPainLevel?: number;

  @ApiPropertyOptional({ type: Number, description: 'Offset for pagination' })
  @IsInt()
  @Min(0)
  @Type(() => Number)
  @IsOptional()
  offset?: number;

  @ApiPropertyOptional({ type: Number, description: 'Limit for pagination' })
  @IsInt()
  @Min(1)
  @Max(100)
  @Type(() => Number)
  @IsOptional()
  limit?: number;
}

export class CreatePainLogBody {
  @ApiProperty({ description: 'Workout execution ID this pain log is attached to' })
  @IsUUID()
  workoutExecutionId: string;

  @ApiProperty({ enum: BodyPart, description: 'Body part where pain was experienced' })
  @IsEnum(BodyPart)
  bodyPart: BodyPart;

  @ApiProperty({ enum: BodyView, description: 'Body view (front, back, left_foot, right_foot)' })
  @IsEnum(BodyView)
  bodyView: BodyView;

  @ApiProperty({ type: Number, description: 'Pain level (1-10)', minimum: 1, maximum: 10 })
  @IsInt()
  @Min(1)
  @Max(10)
  @Type(() => Number)
  painLevel: number;

  @ApiPropertyOptional({ type: Number, description: 'When pain started (% of workout, 0-100)', default: 0 })
  @IsInt()
  @Min(0)
  @Max(100)
  @Type(() => Number)
  @IsOptional()
  painDurationStart?: number;

  @ApiPropertyOptional({ type: Number, description: 'When pain ended (% of workout, 0-100)', default: 100 })
  @IsInt()
  @Min(0)
  @Max(100)
  @Type(() => Number)
  @IsOptional()
  painDurationEnd?: number;

  @ApiPropertyOptional({ enum: PainTrend, description: 'Pain trend during workout', default: 'constant' })
  @IsEnum(PainTrend)
  @IsOptional()
  painTrend?: PainTrend;

  @ApiPropertyOptional({ description: 'Additional notes about the pain' })
  @IsString()
  @IsOptional()
  notes?: string;
}

export class CreatePainLogItemBody {
  @ApiProperty({ enum: BodyPart, description: 'Body part where pain was experienced' })
  @IsEnum(BodyPart)
  bodyPart: BodyPart;

  @ApiProperty({ enum: BodyView, description: 'Body view (front, back, left_foot, right_foot)' })
  @IsEnum(BodyView)
  bodyView: BodyView;

  @ApiProperty({ type: Number, description: 'Pain level (1-10)', minimum: 1, maximum: 10 })
  @IsInt()
  @Min(1)
  @Max(10)
  @Type(() => Number)
  painLevel: number;

  @ApiPropertyOptional({ type: Number, description: 'When pain started (% of workout, 0-100)', default: 0 })
  @IsInt()
  @Min(0)
  @Max(100)
  @Type(() => Number)
  @IsOptional()
  painDurationStart?: number;

  @ApiPropertyOptional({ type: Number, description: 'When pain ended (% of workout, 0-100)', default: 100 })
  @IsInt()
  @Min(0)
  @Max(100)
  @Type(() => Number)
  @IsOptional()
  painDurationEnd?: number;

  @ApiPropertyOptional({ enum: PainTrend, description: 'Pain trend during workout', default: 'constant' })
  @IsEnum(PainTrend)
  @IsOptional()
  painTrend?: PainTrend;

  @ApiPropertyOptional({ description: 'Additional notes about the pain' })
  @IsString()
  @IsOptional()
  notes?: string;
}

export class BatchCreatePainLogsBody {
  @ApiProperty({ description: 'Workout execution ID this pain log is attached to' })
  @IsUUID()
  workoutExecutionId: string;

  @ApiProperty({ type: [CreatePainLogItemBody], description: 'Array of pain log entries' })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreatePainLogItemBody)
  painLogs: CreatePainLogItemBody[];
}

export class UpdatePainLogBody {
  @ApiPropertyOptional({ type: Number, description: 'Pain level (1-10)', minimum: 1, maximum: 10 })
  @IsInt()
  @Min(1)
  @Max(10)
  @Type(() => Number)
  @IsOptional()
  painLevel?: number;

  @ApiPropertyOptional({ type: Number, description: 'When pain started (% of workout, 0-100)' })
  @IsInt()
  @Min(0)
  @Max(100)
  @Type(() => Number)
  @IsOptional()
  painDurationStart?: number;

  @ApiPropertyOptional({ type: Number, description: 'When pain ended (% of workout, 0-100)' })
  @IsInt()
  @Min(0)
  @Max(100)
  @Type(() => Number)
  @IsOptional()
  painDurationEnd?: number;

  @ApiPropertyOptional({ enum: PainTrend, description: 'Pain trend during workout' })
  @IsEnum(PainTrend)
  @IsOptional()
  painTrend?: PainTrend;

  @ApiPropertyOptional({ description: 'Additional notes about the pain' })
  @IsString()
  @IsOptional()
  notes?: string;
}

export class PainLogIdParam {
  @ApiProperty({ description: 'Pain log ID' })
  @IsUUID()
  id: string;
}

export class WorkoutExecutionIdParam {
  @ApiProperty({ description: 'Workout execution ID' })
  @IsUUID()
  workoutExecutionId: string;
}

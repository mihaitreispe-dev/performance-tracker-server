import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsObject, IsOptional, IsString, IsUUID, ValidateNested } from 'class-validator';
import { WorkoutDifficulty, WorkoutType } from 'src/database/interfaces';
import { ItemResponse } from 'src/lib/http/dto/item-response.dto';
import { PageResponse } from 'src/lib/http/dto/page-response.dto';
import { IsEnumString } from 'src/lib/validators/is-enum-string';

export class WorkoutInfoDTO {
  @ApiProperty()
  @IsUUID()
  id: string;

  @ApiProperty()
  @IsString()
  name: string;

  @ApiPropertyOptional({ type: String })
  @IsString()
  @IsOptional()
  description?: string | null;

  @ApiProperty({ enum: WorkoutDifficulty })
  @IsEnumString(WorkoutDifficulty)
  difficulty: WorkoutDifficulty;

  @ApiProperty({ enum: WorkoutType })
  @IsEnumString(WorkoutType)
  type: WorkoutType;
}

export class ExecutionSummaryDTO {
  @ApiProperty({ description: 'Execution ID' })
  @IsUUID()
  id: string;

  @ApiProperty({
    type: Boolean,
    description:
      'True when this execution ended early or skipped exercise(s). Lets calendar / history surfaces show a "Partial" marker without a second fetch against the execution row.',
  })
  partial: boolean;

  @ApiPropertyOptional({ type: Number, description: 'Duration in seconds' })
  @IsOptional()
  durationSeconds?: number | null;

  @ApiPropertyOptional({ type: Number, description: 'Total distance in meters' })
  @IsOptional()
  distanceMeters?: number | null;

  @ApiPropertyOptional({ type: Number, description: 'Average pace in seconds per km' })
  @IsOptional()
  paceSecondsPerKm?: number | null;

  @ApiPropertyOptional({ type: String, description: 'Workout execution start time' })
  @IsString()
  @IsOptional()
  startedAt?: string | null;

  @ApiPropertyOptional({ type: String, description: 'Workout execution completion time' })
  @IsString()
  @IsOptional()
  completedAt?: string | null;

  @ApiPropertyOptional({ type: Number, description: 'Average heart rate in bpm' })
  @IsOptional()
  avgHeartRate?: number | null;

  @ApiPropertyOptional({ type: Number, description: 'Max heart rate in bpm' })
  @IsOptional()
  maxHeartRate?: number | null;

  @ApiPropertyOptional({ type: Number, description: 'Min heart rate in bpm' })
  @IsOptional()
  minHeartRate?: number | null;

  @ApiPropertyOptional({ type: Number, description: 'Elevation gain in meters' })
  @IsOptional()
  elevationGainMeters?: number | null;

  @ApiPropertyOptional({ type: Number, description: 'Calories burned' })
  @IsOptional()
  caloriesBurned?: number | null;
}

export class WorkoutScheduleDTO {
  @ApiProperty()
  @IsUUID()
  id: string;

  @ApiProperty()
  @IsUUID()
  userId: string;

  @ApiProperty()
  @IsObject()
  @ValidateNested()
  workout: WorkoutInfoDTO;

  @ApiProperty({ type: String, format: 'date' })
  @IsString()
  scheduledDate: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  @IsString()
  @IsOptional()
  completedAt?: string | null;

  @ApiPropertyOptional({ type: ExecutionSummaryDTO, description: 'Execution summary when includeExecution=true' })
  @IsObject()
  @ValidateNested()
  @IsOptional()
  execution?: ExecutionSummaryDTO | null;

  @ApiProperty()
  @IsString()
  createdAt: string;

  @ApiProperty()
  @IsString()
  updatedAt: string;
}

export class WorkoutScheduleResponse extends ItemResponse<WorkoutScheduleDTO> {
  @ApiProperty()
  @IsObject({ always: true })
  @ValidateNested()
  declare data: WorkoutScheduleDTO;
}

export class WorkoutScheduleListResponse extends PageResponse<WorkoutScheduleDTO> {
  @ApiProperty({ type: [WorkoutScheduleDTO] })
  @IsArray({ always: true })
  @ValidateNested()
  declare data: WorkoutScheduleDTO[];
}

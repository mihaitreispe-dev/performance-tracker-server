import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

export class ListScheduledWorkoutsQuery {
  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number = 0;

  @ApiPropertyOptional({ default: 50, maximum: 200 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number = 50;

  @ApiPropertyOptional({ description: 'ISO date — only return schedules on/after.' })
  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @ApiPropertyOptional({ description: 'ISO date — only return schedules on/before.' })
  @IsOptional()
  @IsDateString()
  dateTo?: string;

  @ApiPropertyOptional({ description: 'When set, filters to completed or not-yet-completed schedules.' })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  completed?: boolean;
}

export class StartExecutionBody {
  @ApiPropertyOptional({
    description:
      'Schedule the execution is for. If omitted, the execution is treated as ad-hoc (no calendar link).',
  })
  @IsOptional()
  @IsUUID()
  workoutScheduleId?: string;

  @ApiPropertyOptional({ description: 'ISO timestamp. Defaults to now.' })
  @IsOptional()
  @IsDateString()
  startedAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}

export class CompletePublicSetBody {
  @ApiPropertyOptional({ description: 'The exercise_instance this set belongs to.' })
  @IsUUID()
  exerciseInstanceId: string;

  @ApiPropertyOptional({ description: '1-indexed set ordinal within the exercise.' })
  @IsInt()
  @Min(1)
  setNumber: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  actualReps?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  actualLoad?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  actualTimeSeconds?: number;

  @ApiPropertyOptional({ description: 'Rate of perceived exertion, 1–10.' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  rpe?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  skipped?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}

export class FinishExecutionBody {
  @ApiPropertyOptional({ description: 'ISO timestamp. Defaults to now.' })
  @IsOptional()
  @IsDateString()
  completedAt?: string;

  @ApiPropertyOptional({ description: 'Override the computed duration in seconds.' })
  @IsOptional()
  @IsInt()
  @Min(0)
  durationSeconds?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}

export class ListExecutionHistoryQuery {
  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number = 0;

  @ApiPropertyOptional({ default: 50, maximum: 200 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number = 50;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  dateTo?: string;

  @ApiPropertyOptional({ description: 'true = only finished executions; false = only in-flight.' })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  completed?: boolean;
}

export class ClientIdParam {
  @IsUUID()
  id: string;
}

export class ExecutionIdParam {
  @IsUUID()
  id: string;
}

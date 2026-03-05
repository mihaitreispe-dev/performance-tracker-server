import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsDateString, IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';
import { WorkoutPlanGoal } from 'src/database/interfaces';
import type { SortOptions } from 'src/lib/http/decorators/sort-param';
import { SortParam } from 'src/lib/http/decorators/sort-param';
import { PageQuery } from 'src/lib/http/dto/page-request.dto';
import { IsEnumString } from 'src/lib/validators/is-enum-string';

import { WorkoutPlanSortField } from './types';

export class ListWorkoutPlansQuery extends PageQuery {
  @ApiPropertyOptional({ description: 'Search by name or description' })
  @IsString()
  @IsOptional()
  q?: string;

  @ApiPropertyOptional({ description: 'Filter by goal', enum: WorkoutPlanGoal })
  @IsEnumString(WorkoutPlanGoal)
  @IsOptional()
  goal?: WorkoutPlanGoal;

  @ApiPropertyOptional({ description: 'Include plan items in response' })
  @IsBoolean()
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  includeItems?: boolean;

  @SortParam(WorkoutPlanSortField)
  sort?: SortOptions<'name' | 'duration_weeks' | 'created_at' | 'updated_at'>;
}

export class CreateWorkoutPlanBody {
  @ApiProperty({ description: 'Plan name' })
  @IsString()
  name: string;

  @ApiPropertyOptional({ description: 'Plan description' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ description: 'Plan goal', enum: WorkoutPlanGoal })
  @IsEnumString(WorkoutPlanGoal)
  @IsOptional()
  goal?: WorkoutPlanGoal;

  @ApiProperty({ description: 'Duration in weeks (1-52)', minimum: 1, maximum: 52 })
  @IsInt()
  @Min(1)
  @Max(52)
  @Type(() => Number)
  durationWeeks: number;
}

export class UpdateWorkoutPlanBody {
  @ApiPropertyOptional({ description: 'Plan name' })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiPropertyOptional({ description: 'Plan description' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ description: 'Plan goal', enum: WorkoutPlanGoal })
  @IsEnumString(WorkoutPlanGoal)
  @IsOptional()
  goal?: WorkoutPlanGoal;

  @ApiPropertyOptional({ description: 'Duration in weeks (1-52)', minimum: 1, maximum: 52 })
  @IsInt()
  @Min(1)
  @Max(52)
  @Type(() => Number)
  @IsOptional()
  durationWeeks?: number;
}

export class WorkoutPlanIdParam {
  @ApiProperty({ description: 'Workout plan ID' })
  @IsUUID()
  id: string;
}

export class WorkoutPlanItemIdParam {
  @ApiProperty({ description: 'Workout plan ID' })
  @IsUUID()
  id: string;

  @ApiProperty({ description: 'Workout plan item ID' })
  @IsUUID()
  itemId: string;
}

export class AddWorkoutPlanItemBody {
  @ApiProperty({ description: 'Workout ID to add to the plan' })
  @IsUUID()
  workoutId: string;

  @ApiProperty({ description: 'Week number (1-based)', minimum: 1 })
  @IsInt()
  @Min(1)
  @Type(() => Number)
  weekNumber: number;

  @ApiProperty({ description: 'Day of week (1=Monday, 7=Sunday)', minimum: 1, maximum: 7 })
  @IsInt()
  @Min(1)
  @Max(7)
  @Type(() => Number)
  dayOfWeek: number;
}

export class ActivatePlanBody {
  @ApiProperty({ description: 'Start date for the plan (YYYY-MM-DD)', type: String, format: 'date' })
  @IsDateString()
  startDate: string;
}

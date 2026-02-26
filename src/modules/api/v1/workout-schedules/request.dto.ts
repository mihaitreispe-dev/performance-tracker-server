import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsDateString, IsOptional, IsUUID } from 'class-validator';
import type { SortOptions } from 'src/lib/http/decorators/sort-param';
import { SortParam } from 'src/lib/http/decorators/sort-param';
import { PageQuery } from 'src/lib/http/dto/page-request.dto';

import { WorkoutScheduleSortField } from './types';

export class ListWorkoutSchedulesQuery extends PageQuery {
  @ApiPropertyOptional({ type: String, description: 'Filter by workout ID' })
  @IsUUID()
  @IsOptional()
  workoutId?: string;

  @ApiPropertyOptional({ type: String, format: 'date', description: 'Start date (inclusive) YYYY-MM-DD' })
  @IsDateString()
  @IsOptional()
  dateFrom?: string;

  @ApiPropertyOptional({ type: String, format: 'date', description: 'End date (inclusive) YYYY-MM-DD' })
  @IsDateString()
  @IsOptional()
  dateTo?: string;

  @ApiPropertyOptional({ type: Boolean, description: 'Filter by completion status' })
  @IsBoolean()
  @Type(() => Boolean)
  @IsOptional()
  completed?: boolean;

  @ApiPropertyOptional({
    type: Boolean,
    description: 'Include execution summary (distance, duration, pace) in response',
  })
  @IsBoolean()
  @Type(() => Boolean)
  @IsOptional()
  includeExecution?: boolean;

  @SortParam(WorkoutScheduleSortField)
  sort?: SortOptions<'scheduled_date' | 'created_at' | 'updated_at'>;
}

export class CreateWorkoutScheduleBody {
  @ApiProperty({ description: 'Workout ID to schedule' })
  @IsUUID()
  workoutId: string;

  @ApiProperty({ type: String, format: 'date', description: 'Date to schedule the workout YYYY-MM-DD' })
  @IsDateString()
  scheduledDate: string;
}

export class UpdateWorkoutScheduleBody {
  @ApiPropertyOptional({ type: String, format: 'date', description: 'New scheduled date YYYY-MM-DD' })
  @IsDateString()
  @IsOptional()
  scheduledDate?: string;

  @ApiPropertyOptional({
    type: Boolean,
    description: 'Mark as completed (sets completed_at to now) or uncompleted (clears completed_at)',
  })
  @IsBoolean()
  @IsOptional()
  completed?: boolean;
}

export class WorkoutScheduleIdParam {
  @ApiProperty({ description: 'Workout schedule ID' })
  @IsUUID()
  id: string;
}

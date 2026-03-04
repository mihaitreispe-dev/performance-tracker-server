import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsInt, IsNumber, IsOptional, IsString, IsUUID, Min, ValidateNested } from 'class-validator';
import {
  CardioStepMode,
  CardioStepType,
  ExerciseInstanceIntensity,
  ExerciseInstanceMode,
  ExerciseInstanceTempo,
  WorkoutDifficulty,
  WorkoutType,
} from 'src/database/interfaces';
import { type SortOptions, SortParam } from 'src/lib/http/decorators/sort-param';
import { SearchableQuery } from 'src/lib/http/dto/page-request.dto';
import { IsEnumString } from 'src/lib/validators/is-enum-string';

import { WorkoutSortField } from './types';

export class ListWorkoutsQuery extends SearchableQuery {
  @ApiPropertyOptional({ enum: WorkoutType, description: 'Filter by workout type' })
  @IsEnumString(WorkoutType)
  @IsOptional()
  type?: WorkoutType;

  @ApiPropertyOptional({ enum: WorkoutDifficulty, description: 'Filter by difficulty' })
  @IsEnumString(WorkoutDifficulty)
  @IsOptional()
  difficulty?: WorkoutDifficulty;

  @SortParam(WorkoutSortField)
  sort?: SortOptions<'name' | 'created_at' | 'updated_at'>;
}

export class GroupExerciseInstanceBody {
  @ApiProperty({ description: 'Exercise ID' })
  @IsUUID()
  exerciseId: string;

  @ApiProperty({ enum: ExerciseInstanceMode, description: 'Mode: reps or time' })
  @IsEnumString(ExerciseInstanceMode)
  mode: ExerciseInstanceMode;

  @ApiProperty({ description: 'Number of sets' })
  @IsInt()
  @Min(1)
  sets: number;

  @ApiPropertyOptional({ type: Number, description: 'Number of reps' })
  @IsInt()
  @Min(1)
  @IsOptional()
  reps?: number;

  @ApiPropertyOptional({ type: Number, description: 'Execution time in seconds' })
  @IsInt()
  @Min(1)
  @IsOptional()
  executionTime?: number;

  @ApiPropertyOptional({ type: Number, description: 'Load in kg/lbs' })
  @IsNumber()
  @Min(0)
  @IsOptional()
  load?: number;

  @ApiPropertyOptional({ enum: ExerciseInstanceIntensity, description: 'Intensity level' })
  @IsEnumString(ExerciseInstanceIntensity)
  @IsOptional()
  intensity?: ExerciseInstanceIntensity;

  @ApiPropertyOptional({ enum: ExerciseInstanceTempo, description: 'Tempo' })
  @IsEnumString(ExerciseInstanceTempo)
  @IsOptional()
  tempo?: ExerciseInstanceTempo;

  @ApiPropertyOptional({ type: String, description: 'Notes for this exercise instance' })
  @IsString()
  @IsOptional()
  notes?: string;
}

export class ExerciseInstanceItemBody {
  @ApiProperty({ enum: ['exercise_instance'], description: 'Item type' })
  @IsString()
  type: 'exercise_instance';

  @ApiProperty({ description: 'Exercise ID' })
  @IsUUID()
  exerciseId: string;

  @ApiProperty({ enum: ExerciseInstanceMode, description: 'Mode: reps or time' })
  @IsEnumString(ExerciseInstanceMode)
  mode: ExerciseInstanceMode;

  @ApiProperty({ description: 'Number of sets' })
  @IsInt()
  @Min(1)
  sets: number;

  @ApiPropertyOptional({ type: Number, description: 'Number of reps' })
  @IsInt()
  @Min(1)
  @IsOptional()
  reps?: number;

  @ApiPropertyOptional({ type: Number, description: 'Execution time in seconds' })
  @IsInt()
  @Min(1)
  @IsOptional()
  executionTime?: number;

  @ApiPropertyOptional({ type: Number, description: 'Load in kg/lbs' })
  @IsNumber()
  @Min(0)
  @IsOptional()
  load?: number;

  @ApiPropertyOptional({ enum: ExerciseInstanceIntensity, description: 'Intensity level' })
  @IsEnumString(ExerciseInstanceIntensity)
  @IsOptional()
  intensity?: ExerciseInstanceIntensity;

  @ApiPropertyOptional({ enum: ExerciseInstanceTempo, description: 'Tempo' })
  @IsEnumString(ExerciseInstanceTempo)
  @IsOptional()
  tempo?: ExerciseInstanceTempo;

  @ApiPropertyOptional({ type: String, description: 'Notes for this exercise instance' })
  @IsString()
  @IsOptional()
  notes?: string;
}

export class GroupItemBody {
  @ApiProperty({ enum: ['group'], description: 'Item type' })
  @IsString()
  type: 'group';

  @ApiPropertyOptional({ type: Number, description: 'Number of times to repeat the group' })
  @IsInt()
  @Min(1)
  @IsOptional()
  repeat?: number;

  @ApiProperty({ type: [GroupExerciseInstanceBody], description: 'Exercise instances in the group' })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => GroupExerciseInstanceBody)
  items: GroupExerciseInstanceBody[];
}

// Cardio step body for use in groups
export class CardioStepBody {
  @ApiProperty({ enum: CardioStepType, description: 'Step type' })
  @IsEnumString(CardioStepType)
  stepType: CardioStepType;

  @ApiProperty({ enum: CardioStepMode, description: 'Step mode: duration or distance' })
  @IsEnumString(CardioStepMode)
  mode: CardioStepMode;

  @ApiPropertyOptional({ type: Number, description: 'Duration in seconds (when mode = duration)' })
  @IsInt()
  @Min(1)
  @IsOptional()
  duration?: number;

  @ApiPropertyOptional({ type: Number, description: 'Distance in meters (when mode = distance)' })
  @IsInt()
  @Min(1)
  @IsOptional()
  distance?: number;

  // HR targets
  @ApiPropertyOptional({ type: Number, description: 'Heart rate minimum (bpm)' })
  @IsInt()
  @Min(30)
  @IsOptional()
  hrMin?: number;

  @ApiPropertyOptional({ type: Number, description: 'Heart rate maximum (bpm)' })
  @IsInt()
  @Min(30)
  @IsOptional()
  hrMax?: number;

  @ApiPropertyOptional({ type: Number, description: 'Heart rate zone (1-7)' })
  @IsInt()
  @Min(1)
  @IsOptional()
  hrZone?: number;

  // Power targets
  @ApiPropertyOptional({ type: Number, description: 'Power minimum (watts)' })
  @IsInt()
  @Min(0)
  @IsOptional()
  powerMin?: number;

  @ApiPropertyOptional({ type: Number, description: 'Power maximum (watts)' })
  @IsInt()
  @Min(0)
  @IsOptional()
  powerMax?: number;

  @ApiPropertyOptional({ type: Number, description: 'Power zone (1-7)' })
  @IsInt()
  @Min(1)
  @IsOptional()
  powerZone?: number;

  // Pace targets
  @ApiPropertyOptional({ type: Number, description: 'Pace minimum (seconds per km)' })
  @IsInt()
  @Min(0)
  @IsOptional()
  paceMin?: number;

  @ApiPropertyOptional({ type: Number, description: 'Pace maximum (seconds per km)' })
  @IsInt()
  @Min(0)
  @IsOptional()
  paceMax?: number;

  @ApiPropertyOptional({ type: Number, description: 'Pace zone (1-7)' })
  @IsInt()
  @Min(1)
  @IsOptional()
  paceZone?: number;

  // RPE targets
  @ApiPropertyOptional({ type: Number, description: 'RPE minimum (1-10)' })
  @IsInt()
  @Min(1)
  @IsOptional()
  rpeMin?: number;

  @ApiPropertyOptional({ type: Number, description: 'RPE maximum (1-10)' })
  @IsInt()
  @Min(1)
  @IsOptional()
  rpeMax?: number;

  @ApiPropertyOptional({ type: Number, description: 'RPE zone (1-7)' })
  @IsInt()
  @Min(1)
  @IsOptional()
  rpeZone?: number;

  @ApiPropertyOptional({ type: String, description: 'Notes for this step' })
  @IsString()
  @IsOptional()
  notes?: string;
}

export class WorkoutItemBody {
  @ApiProperty({ description: 'Item type: exercise_instance, group, cardio_step, or cardio_step_group' })
  @IsString()
  type: 'exercise_instance' | 'group' | 'cardio_step' | 'cardio_step_group';

  // exercise_instance fields
  @ApiPropertyOptional({ description: 'Exercise ID (for exercise_instance type)' })
  @IsUUID()
  @IsOptional()
  exerciseId?: string;

  @ApiPropertyOptional({ enum: ExerciseInstanceMode, description: 'Mode: reps or time (for exercise_instance type)' })
  @IsEnumString(ExerciseInstanceMode)
  @IsOptional()
  mode?: ExerciseInstanceMode;

  @ApiPropertyOptional({ type: Number, description: 'Number of sets (for exercise_instance type)' })
  @IsInt()
  @Min(1)
  @IsOptional()
  sets?: number;

  @ApiPropertyOptional({ type: Number, description: 'Number of reps' })
  @IsInt()
  @Min(1)
  @IsOptional()
  reps?: number;

  @ApiPropertyOptional({ type: Number, description: 'Execution time in seconds' })
  @IsInt()
  @Min(1)
  @IsOptional()
  executionTime?: number;

  @ApiPropertyOptional({ type: Number, description: 'Load in kg/lbs' })
  @IsNumber()
  @Min(0)
  @IsOptional()
  load?: number;

  @ApiPropertyOptional({ enum: ExerciseInstanceIntensity, description: 'Intensity level' })
  @IsEnumString(ExerciseInstanceIntensity)
  @IsOptional()
  intensity?: ExerciseInstanceIntensity;

  @ApiPropertyOptional({ enum: ExerciseInstanceTempo, description: 'Tempo' })
  @IsEnumString(ExerciseInstanceTempo)
  @IsOptional()
  tempo?: ExerciseInstanceTempo;

  @ApiPropertyOptional({ type: String, description: 'Notes for this exercise instance' })
  @IsString()
  @IsOptional()
  notes?: string;

  // group fields
  @ApiPropertyOptional({ type: Number, description: 'Number of times to repeat the group' })
  @IsInt()
  @Min(1)
  @IsOptional()
  repeat?: number;

  @ApiPropertyOptional({ type: [GroupExerciseInstanceBody], description: 'Exercise instances in the group' })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => GroupExerciseInstanceBody)
  @IsOptional()
  items?: GroupExerciseInstanceBody[];

  // cardio_step fields
  @ApiPropertyOptional({ enum: CardioStepType, description: 'Step type (for cardio_step type)' })
  @IsEnumString(CardioStepType)
  @IsOptional()
  stepType?: CardioStepType;

  @ApiPropertyOptional({
    enum: CardioStepMode,
    description: 'Cardio step mode: duration or distance (for cardio_step type)',
  })
  @IsEnumString(CardioStepMode)
  @IsOptional()
  cardioStepMode?: CardioStepMode;

  @ApiPropertyOptional({ type: Number, description: 'Duration in seconds (for cardio_step type)' })
  @IsInt()
  @Min(1)
  @IsOptional()
  duration?: number;

  @ApiPropertyOptional({ type: Number, description: 'Distance in meters (for cardio_step type)' })
  @IsInt()
  @Min(1)
  @IsOptional()
  distance?: number;

  @ApiPropertyOptional({ type: Number, description: 'Heart rate minimum (bpm)' })
  @IsInt()
  @Min(30)
  @IsOptional()
  hrMin?: number;

  @ApiPropertyOptional({ type: Number, description: 'Heart rate maximum (bpm)' })
  @IsInt()
  @Min(30)
  @IsOptional()
  hrMax?: number;

  @ApiPropertyOptional({ type: Number, description: 'Heart rate zone (1-7)' })
  @IsInt()
  @Min(1)
  @IsOptional()
  hrZone?: number;

  // Power targets (for cardio_step type)
  @ApiPropertyOptional({ type: Number, description: 'Power minimum (watts)' })
  @IsInt()
  @Min(0)
  @IsOptional()
  powerMin?: number;

  @ApiPropertyOptional({ type: Number, description: 'Power maximum (watts)' })
  @IsInt()
  @Min(0)
  @IsOptional()
  powerMax?: number;

  @ApiPropertyOptional({ type: Number, description: 'Power zone (1-7)' })
  @IsInt()
  @Min(1)
  @IsOptional()
  powerZone?: number;

  // Pace targets (for cardio_step type)
  @ApiPropertyOptional({ type: Number, description: 'Pace minimum (seconds per km)' })
  @IsInt()
  @Min(0)
  @IsOptional()
  paceMin?: number;

  @ApiPropertyOptional({ type: Number, description: 'Pace maximum (seconds per km)' })
  @IsInt()
  @Min(0)
  @IsOptional()
  paceMax?: number;

  @ApiPropertyOptional({ type: Number, description: 'Pace zone (1-7)' })
  @IsInt()
  @Min(1)
  @IsOptional()
  paceZone?: number;

  // RPE targets (for cardio_step type)
  @ApiPropertyOptional({ type: Number, description: 'RPE minimum (1-10)' })
  @IsInt()
  @Min(1)
  @IsOptional()
  rpeMin?: number;

  @ApiPropertyOptional({ type: Number, description: 'RPE maximum (1-10)' })
  @IsInt()
  @Min(1)
  @IsOptional()
  rpeMax?: number;

  @ApiPropertyOptional({ type: Number, description: 'RPE zone (1-7)' })
  @IsInt()
  @Min(1)
  @IsOptional()
  rpeZone?: number;

  // cardio_step_group fields
  @ApiPropertyOptional({
    type: [CardioStepBody],
    description: 'Cardio steps in the group (for cardio_step_group type)',
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CardioStepBody)
  @IsOptional()
  cardioSteps?: CardioStepBody[];
}

export class CreateWorkoutBody {
  @ApiProperty({ description: 'Workout name' })
  @IsString()
  name: string;

  @ApiPropertyOptional({ type: String, description: 'Workout description' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({ enum: WorkoutDifficulty, description: 'Workout difficulty' })
  @IsEnumString(WorkoutDifficulty)
  difficulty: WorkoutDifficulty;

  @ApiProperty({ enum: WorkoutType, description: 'Workout type' })
  @IsEnumString(WorkoutType)
  type: WorkoutType;

  @ApiPropertyOptional({ type: String, description: 'Cardio category ID (for run/cycling/swimming workouts)' })
  @IsUUID()
  @IsOptional()
  cardioCategoryId?: string;

  @ApiProperty({ type: [WorkoutItemBody], description: 'Workout items' })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WorkoutItemBody)
  items: WorkoutItemBody[];
}

export class UpdateWorkoutBody {
  @ApiPropertyOptional({ type: String, description: 'Workout name' })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiPropertyOptional({ type: String, description: 'Workout description' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ enum: WorkoutDifficulty, description: 'Workout difficulty' })
  @IsEnumString(WorkoutDifficulty)
  @IsOptional()
  difficulty?: WorkoutDifficulty;

  @ApiPropertyOptional({ enum: WorkoutType, description: 'Workout type' })
  @IsEnumString(WorkoutType)
  @IsOptional()
  type?: WorkoutType;

  @ApiPropertyOptional({ type: String, description: 'Cardio category ID (for run/cycling/swimming workouts)' })
  @IsUUID()
  @IsOptional()
  cardioCategoryId?: string;

  @ApiPropertyOptional({ type: [WorkoutItemBody], description: 'Workout items (replaces all existing)' })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WorkoutItemBody)
  @IsOptional()
  items?: WorkoutItemBody[];
}

export class WorkoutIdParam {
  @ApiProperty({ description: 'Workout ID' })
  @IsUUID()
  id: string;
}

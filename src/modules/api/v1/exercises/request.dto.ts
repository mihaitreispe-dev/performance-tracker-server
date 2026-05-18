import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsOptional, IsString, IsUUID } from 'class-validator';
import { ExerciseLevel, ExerciseVisibility } from 'src/database/interfaces';
import { type SortOptions, SortParam } from 'src/lib/http/decorators/sort-param';
import { SearchableQuery } from 'src/lib/http/dto/page-request.dto';
import { IsEnumString } from 'src/lib/validators/is-enum-string';

import { ExerciseSortField } from './types';

export class ListExercisesQuery extends SearchableQuery {
  @ApiPropertyOptional({ enum: ExerciseVisibility, description: 'Filter by visibility' })
  @IsEnumString(ExerciseVisibility)
  @IsOptional()
  visibility?: ExerciseVisibility;

  @ApiPropertyOptional({ type: String, description: 'Filter by category' })
  @IsString()
  @IsOptional()
  category?: string;

  @ApiPropertyOptional({ enum: ExerciseLevel, description: 'Filter by level' })
  @IsEnumString(ExerciseLevel)
  @IsOptional()
  level?: ExerciseLevel;

  @SortParam(ExerciseSortField)
  sort?: SortOptions<'name' | 'created_at' | 'updated_at'>;
}

export class CreateExerciseBody {
  @ApiProperty({ description: 'Exercise name' })
  @IsString()
  name: string;

  @ApiPropertyOptional({ type: String, description: 'Exercise description' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ type: [String], description: 'Exercise cues' })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  cues?: string[];

  @ApiPropertyOptional({ type: String, description: 'Exercise category' })
  @IsString()
  @IsOptional()
  category?: string;

  @ApiPropertyOptional({ enum: ExerciseLevel, description: 'Exercise level' })
  @IsEnumString(ExerciseLevel)
  @IsOptional()
  level?: ExerciseLevel;

  @ApiPropertyOptional({ enum: ExerciseVisibility, description: 'Visibility (private/public)' })
  @IsEnumString(ExerciseVisibility)
  @IsOptional()
  visibility?: ExerciseVisibility;

  @ApiPropertyOptional({ type: String, description: 'Video MIME type (e.g. video/mp4)' })
  @IsString()
  @IsOptional()
  videoMimeType?: string;

  @ApiPropertyOptional({ type: [String], description: 'Equipment IDs to link' })
  @IsArray()
  @IsUUID('4', { each: true })
  @IsOptional()
  equipmentIds?: string[];

  @ApiPropertyOptional({ type: [String], description: 'Primary muscle group IDs' })
  @IsArray()
  @IsUUID('4', { each: true })
  @IsOptional()
  primaryMuscleGroupIds?: string[];

  @ApiPropertyOptional({ type: [String], description: 'Secondary muscle group IDs' })
  @IsArray()
  @IsUUID('4', { each: true })
  @IsOptional()
  secondaryMuscleGroupIds?: string[];
}

export class UpdateExerciseBody {
  @ApiPropertyOptional({ type: String, description: 'Exercise name' })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiPropertyOptional({ type: String, description: 'Exercise description' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ type: [String], description: 'Exercise cues' })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  cues?: string[];

  @ApiPropertyOptional({ type: String, description: 'Exercise category' })
  @IsString()
  @IsOptional()
  category?: string;

  @ApiPropertyOptional({ enum: ExerciseLevel, description: 'Exercise level' })
  @IsEnumString(ExerciseLevel)
  @IsOptional()
  level?: ExerciseLevel;

  @ApiPropertyOptional({ enum: ExerciseVisibility, description: 'Visibility (private/public)' })
  @IsEnumString(ExerciseVisibility)
  @IsOptional()
  visibility?: ExerciseVisibility;

  @ApiPropertyOptional({ type: String, description: 'Video MIME type (e.g. video/mp4) - provide to reset video' })
  @IsString()
  @IsOptional()
  videoMimeType?: string;

  @ApiPropertyOptional({ type: [String], description: 'Equipment IDs to link (replaces existing)' })
  @IsArray()
  @IsUUID('4', { each: true })
  @IsOptional()
  equipmentIds?: string[];

  @ApiPropertyOptional({ type: [String], description: 'Primary muscle group IDs (replaces existing)' })
  @IsArray()
  @IsUUID('4', { each: true })
  @IsOptional()
  primaryMuscleGroupIds?: string[];

  @ApiPropertyOptional({ type: [String], description: 'Secondary muscle group IDs (replaces existing)' })
  @IsArray()
  @IsUUID('4', { each: true })
  @IsOptional()
  secondaryMuscleGroupIds?: string[];

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Intro content_item ID (kind=exercise_intro). Pass null to clear.',
  })
  @IsUUID()
  @IsOptional()
  introContentItemId?: string | null;
}

export class ExerciseIdParam {
  @ApiProperty({ description: 'Exercise ID' })
  @IsUUID()
  id: string;
}

export class UpdateExerciseChainBody {
  @ApiProperty({ type: [String], description: 'Ordered list of exercise IDs in the chain (position 0 = easiest)' })
  @IsArray()
  @IsUUID('4', { each: true })
  memberIds: string[];
}

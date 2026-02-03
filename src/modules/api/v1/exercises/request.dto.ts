import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsOptional, IsString, IsUUID } from 'class-validator';
import { SearchableQuery } from 'src/lib/http/dto/page-request.dto';
import { type SortOptions, SortParam } from 'src/lib/http/decorators/sort-param';
import { IsEnumString } from 'src/lib/validators/is-enum-string';
import { ExerciseVisibility } from 'src/database/interfaces';

import { ExerciseSortField } from './types';

export class ListExercisesQuery extends SearchableQuery {
  @ApiPropertyOptional({ enum: ExerciseVisibility, description: 'Filter by visibility' })
  @IsEnumString(ExerciseVisibility)
  @IsOptional()
  visibility?: ExerciseVisibility;

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

  @ApiPropertyOptional({ enum: ExerciseVisibility, description: 'Visibility (private/public)' })
  @IsEnumString(ExerciseVisibility)
  @IsOptional()
  visibility?: ExerciseVisibility;

  @ApiPropertyOptional({ type: String, description: 'Video MIME type (e.g. video/mp4)' })
  @IsString()
  @IsOptional()
  videoMimeType?: string;
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

  @ApiPropertyOptional({ enum: ExerciseVisibility, description: 'Visibility (private/public)' })
  @IsEnumString(ExerciseVisibility)
  @IsOptional()
  visibility?: ExerciseVisibility;

  @ApiPropertyOptional({ type: String, description: 'Video MIME type (e.g. video/mp4) - provide to reset video' })
  @IsString()
  @IsOptional()
  videoMimeType?: string;
}

export class ExerciseIdParam {
  @ApiProperty({ description: 'Exercise ID' })
  @IsUUID()
  id: string;
}

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/** Shared shapes for /v1/public/* responses. Kept deliberately small so we can */
/* iterate the underlying schema without breaking integrators on every change. */

export class PublicListMeta {
  @ApiProperty()
  totalCount: number;

  @ApiProperty()
  offset: number;

  @ApiProperty()
  limit: number;
}

export class PublicWorkoutDTO {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiPropertyOptional({ nullable: true })
  description: string | null;

  @ApiProperty()
  difficulty: string;

  @ApiProperty()
  type: string;

  @ApiProperty()
  createdAt: string;
}

export class PublicWorkoutListResponse {
  @ApiProperty({ type: [PublicWorkoutDTO] })
  data: PublicWorkoutDTO[];

  @ApiProperty({ type: PublicListMeta })
  meta: PublicListMeta;
}

export class PublicWorkoutResponse {
  @ApiProperty({ type: PublicWorkoutDTO })
  data: PublicWorkoutDTO;
}

export class PublicCourseDTO {
  @ApiProperty()
  id: string;

  @ApiProperty()
  title: string;

  @ApiPropertyOptional({ nullable: true })
  description: string | null;

  @ApiProperty()
  status: string;

  @ApiProperty()
  createdAt: string;
}

export class PublicCourseListResponse {
  @ApiProperty({ type: [PublicCourseDTO] })
  data: PublicCourseDTO[];

  @ApiProperty({ type: PublicListMeta })
  meta: PublicListMeta;
}

export class PublicCourseResponse {
  @ApiProperty({ type: PublicCourseDTO })
  data: PublicCourseDTO;
}

export class PublicMovementSnackDTO {
  @ApiProperty()
  id: string;

  @ApiProperty()
  title: string;

  @ApiPropertyOptional({ nullable: true })
  description: string | null;

  @ApiProperty()
  status: string;

  @ApiPropertyOptional({ nullable: true })
  videoUrl: string | null;

  @ApiPropertyOptional({ nullable: true, type: [String] })
  tags: string[];

  @ApiProperty()
  createdAt: string;
}

export class PublicMovementSnackListResponse {
  @ApiProperty({ type: [PublicMovementSnackDTO] })
  data: PublicMovementSnackDTO[];

  @ApiProperty({ type: PublicListMeta })
  meta: PublicListMeta;
}

export class PublicMovementSnackResponse {
  @ApiProperty({ type: PublicMovementSnackDTO })
  data: PublicMovementSnackDTO;
}

export class PublicExerciseDTO {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiPropertyOptional({ nullable: true })
  description: string | null;

  @ApiPropertyOptional({ nullable: true })
  category: string | null;

  @ApiPropertyOptional({ nullable: true })
  level: string | null;

  @ApiProperty({ type: [String] })
  cues: string[];

  @ApiProperty()
  createdAt: string;
}

export class PublicExerciseListResponse {
  @ApiProperty({ type: [PublicExerciseDTO] })
  data: PublicExerciseDTO[];

  @ApiProperty({ type: PublicListMeta })
  meta: PublicListMeta;
}

export class PublicExerciseResponse {
  @ApiProperty({ type: PublicExerciseDTO })
  data: PublicExerciseDTO;
}

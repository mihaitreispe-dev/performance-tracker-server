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

/**
 * One step inside a workout's structure. Flattened from workout_items →
 * (exercise_instance | exercise_instance_group_items) so the sample/3rd-party
 * apps can drive a play-along UI with one round-trip. Groups are exposed as
 * sibling steps with the same `groupId` set; consumers that don't care about
 * supersets can ignore it.
 */
export class PublicWorkoutStepDTO {
  @ApiProperty() exerciseInstanceId: string;
  @ApiProperty() exerciseId: string;
  @ApiProperty() exerciseName: string;
  @ApiPropertyOptional({ nullable: true }) exerciseDescription: string | null;
  @ApiProperty({ type: [String] }) cues: string[];
  @ApiProperty({ description: 'Position in the workout. Stable across reads.' }) position: number;
  @ApiPropertyOptional({
    nullable: true,
    description: "Group id when this step is part of a superset, else null.",
  })
  groupId: string | null;
  @ApiProperty({ description: "'reps' | 'time'" }) mode: string;
  @ApiProperty() sets: number;
  @ApiPropertyOptional({ nullable: true }) reps: number | null;
  @ApiPropertyOptional({ nullable: true, description: 'Seconds, for time-mode steps.' })
  executionTime: number | null;
  @ApiPropertyOptional({ nullable: true }) load: string | null;
  @ApiPropertyOptional({ nullable: true }) intensity: string | null;
  @ApiPropertyOptional({ nullable: true }) tempo: string | null;
  @ApiPropertyOptional({ nullable: true }) notes: string | null;
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

  @ApiPropertyOptional({
    type: [PublicWorkoutStepDTO],
    description:
      'Only populated on the detail endpoint (GET /public/workouts/:id). List endpoints omit it to keep the payload small.',
  })
  structure?: PublicWorkoutStepDTO[];
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

import { Injectable, NotFoundException } from '@nestjs/common';

import {
  ContentItem,
  ContentItemKind,
  ContentItemStatus,
  Course,
  CourseStatus,
  Exercise,
  ExerciseStatus,
  Workout,
} from 'src/database/interfaces';
import { ContentItemRepository } from 'src/repositories/content-item.repository';
import { CourseRepository } from 'src/repositories/course.repository';
import { ExerciseRepository } from 'src/repositories/exercise.repository';
import { S3Service } from 'src/modules/s3/s3.service';
import { WorkoutRepository } from 'src/repositories/workout.repository';

import {
  PublicCourseDTO,
  PublicCourseListResponse,
  PublicCourseResponse,
  PublicExerciseDTO,
  PublicExerciseListResponse,
  PublicExerciseResponse,
  PublicMovementSnackDTO,
  PublicMovementSnackListResponse,
  PublicMovementSnackResponse,
  PublicWorkoutDTO,
  PublicWorkoutListResponse,
  PublicWorkoutResponse,
} from './response.dto';

interface PaginationOpts {
  offset: number;
  limit: number;
  search?: string;
  tag?: string;
}

/**
 * Read-only service powering /v1/public/*. Every method takes the organisation id
 * resolved by ApiKeyAuthGuard and forwards it to the existing repos — same tenant
 * boundary as the logged-in surface, exposed through the API key auth band.
 */
@Injectable()
export class PublicApiService {
  constructor(
    private readonly workoutRepo: WorkoutRepository,
    private readonly courseRepo: CourseRepository,
    private readonly contentItemRepo: ContentItemRepository,
    private readonly exerciseRepo: ExerciseRepository,
    private readonly s3Service: S3Service,
  ) {}

  // ----------------------------- Workouts -----------------------------

  async listWorkouts(organisationId: string, opts: PaginationOpts): Promise<PublicWorkoutListResponse> {
    const [rows, totalCount] = await Promise.all([
      this.workoutRepo.findMany({
        organisationId,
        filter: opts.search ? { search: opts.search } : undefined,
        offset: opts.offset,
        limit: opts.limit,
      }),
      this.workoutRepo.countMany(organisationId, opts.search ? { search: opts.search } : undefined),
    ]);
    return {
      data: rows.map(mapWorkoutDTO),
      meta: { totalCount, offset: opts.offset, limit: opts.limit },
    };
  }

  async getWorkout(organisationId: string, id: string): Promise<PublicWorkoutResponse> {
    const row = await this.workoutRepo.findById(id);
    if (!row || row.organisation_id !== organisationId) {
      throw new NotFoundException('Workout not found');
    }
    return { data: mapWorkoutDTO(row) };
  }

  // ----------------------------- Courses -----------------------------

  async listCourses(organisationId: string, opts: PaginationOpts): Promise<PublicCourseListResponse> {
    // Only expose published courses on the public surface — drafts stay coach-only.
    const rows = await this.courseRepo.list(
      organisationId,
      { status: CourseStatus.PUBLISHED },
      { offset: opts.offset, limit: opts.limit },
    );
    return {
      data: rows.map(mapCourseDTO),
      meta: { totalCount: rows.length, offset: opts.offset, limit: opts.limit },
    };
  }

  async getCourse(organisationId: string, id: string): Promise<PublicCourseResponse> {
    const row = await this.courseRepo.findById(id, organisationId);
    if (!row || row.status !== CourseStatus.PUBLISHED) {
      throw new NotFoundException('Course not found');
    }
    return { data: mapCourseDTO(row) };
  }

  // ------------------------ Movement snacks --------------------------

  async listMovementSnacks(
    organisationId: string,
    opts: PaginationOpts,
  ): Promise<PublicMovementSnackListResponse> {
    const rows = await this.contentItemRepo.list(
      {
        organisationId,
        kind: ContentItemKind.SNACK,
        status: ContentItemStatus.READY,
        tag: opts.tag,
      },
      { offset: opts.offset, limit: opts.limit },
    );
    const data = await Promise.all(rows.map((r) => this.mapMovementSnackDTO(r)));
    return {
      data,
      meta: { totalCount: rows.length, offset: opts.offset, limit: opts.limit },
    };
  }

  async getMovementSnack(
    organisationId: string,
    id: string,
  ): Promise<PublicMovementSnackResponse> {
    const row = await this.contentItemRepo.findByIdInOrg(id, organisationId);
    if (!row || row.kind !== ContentItemKind.SNACK || row.status !== ContentItemStatus.READY) {
      throw new NotFoundException('Movement snack not found');
    }
    return { data: await this.mapMovementSnackDTO(row) };
  }

  // ----------------------------- Exercises ---------------------------

  async listExercises(organisationId: string, opts: PaginationOpts): Promise<PublicExerciseListResponse> {
    // Pull a larger window from the repo (it doesn't natively filter by status), then
    // drop anything not in the publishable status before slicing for the response.
    const fetchLimit = (opts.limit ?? 50) * 2;
    const raw = await this.exerciseRepo.findMany({
      organisationId,
      filter: opts.search ? { search: opts.search } : undefined,
      offset: opts.offset,
      limit: fetchLimit,
    });
    const publishable = raw.filter((r) => r.status === ExerciseStatus.ASSETS_DONE);
    const sliced = publishable.slice(0, opts.limit);
    return {
      data: sliced.map(mapExerciseDTO),
      meta: { totalCount: publishable.length, offset: opts.offset, limit: opts.limit },
    };
  }

  async getExercise(organisationId: string, id: string): Promise<PublicExerciseResponse> {
    const row = await this.exerciseRepo.findById(id);
    if (!row || row.organisation_id !== organisationId || row.status !== ExerciseStatus.ASSETS_DONE) {
      throw new NotFoundException('Exercise not found');
    }
    return { data: mapExerciseDTO(row) };
  }

  // -------------------------- Helpers --------------------------------

  private async mapMovementSnackDTO(row: ContentItem): Promise<PublicMovementSnackDTO> {
    const videoUrl =
      row.video_s3_bucket && row.video_s3_key
        ? await this.s3Service
            .getSignedUrlGET({ bucket: row.video_s3_bucket, key: row.video_s3_key })
            .catch(() => null)
        : null;
    return {
      id: row.id,
      title: row.title,
      description: row.description,
      status: row.status,
      videoUrl,
      tags: row.tags ?? [],
      createdAt: isoOf(row.created_at),
    };
  }
}

function mapWorkoutDTO(row: Workout): PublicWorkoutDTO {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    difficulty: row.difficulty,
    type: row.type,
    createdAt: isoOf(row.created_at),
  };
}

function mapCourseDTO(row: Course): PublicCourseDTO {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    status: row.status,
    createdAt: isoOf(row.created_at),
  };
}

function mapExerciseDTO(row: Exercise): PublicExerciseDTO {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    category: row.category,
    level: row.level,
    cues: row.cues ?? [],
    createdAt: isoOf(row.created_at),
  };
}

function isoOf(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string') return new Date(value).toISOString();
  return new Date().toISOString();
}

import { Injectable, NotFoundException } from '@nestjs/common';
import { Kysely } from 'kysely';
import { InjectKysely } from 'nestjs-kysely';

import {
  ContentItem,
  ContentItemKind,
  ContentItemStatus,
  Course,
  CourseStatus,
  Database,
  Exercise,
  ExerciseStatus,
  Workout,
} from 'src/database/interfaces';
import { EntitlementsService, LockStatusDTO } from 'src/modules/entitlements/entitlements.service';
import { ContentItemRepository } from 'src/repositories/content-item.repository';
import { CourseRepository } from 'src/repositories/course.repository';
import { ExerciseRepository } from 'src/repositories/exercise.repository';
import { S3Service } from 'src/modules/s3/s3.service';
import { WorkoutRepository } from 'src/repositories/workout.repository';

import { PublicLockStatusDTO, PublicWorkoutStepDTO } from './response.dto';

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

/** Sentinel for free / un-gated resources — avoids re-allocating an empty object per row. */
const FREE_LOCK: PublicLockStatusDTO = { locked: false, requiredTiers: [] };

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
    private readonly entitlements: EntitlementsService,
    @InjectKysely() private readonly db: Kysely<Database>,
  ) {}

  // ----------------------------- Workouts -----------------------------

  async listWorkouts(
    organisationId: string,
    opts: PaginationOpts,
    clientUserId: string | null = null,
  ): Promise<PublicWorkoutListResponse> {
    const [rows, totalCount] = await Promise.all([
      this.workoutRepo.findMany({
        organisationId,
        filter: opts.search ? { search: opts.search } : undefined,
        offset: opts.offset,
        limit: opts.limit,
      }),
      this.workoutRepo.countMany(organisationId, opts.search ? { search: opts.search } : undefined),
    ]);
    const lockByResource = await this.entitlements.getLockStatusMap(
      clientUserId,
      'workout',
      rows.map((r) => r.id),
    );
    return {
      data: rows.map((row) => mapWorkoutDTO(row, lockByResource.get(row.id) ?? FREE_LOCK)),
      meta: { totalCount, offset: opts.offset, limit: opts.limit },
    };
  }

  /**
   * Detail endpoint. When `clientUserId` is provided we enforce the
   * paywall — locked resources throw a 402 with the tier payload so the
   * caller can render the upsell screen. When it's omitted (e.g. an
   * unauthenticated catalogue browse) we still stamp the lock metadata
   * but always return the structure; callers in that band aren't a
   * specific user yet so there's nothing meaningful to enforce against.
   *
   * We deliberately do the access assertion BEFORE loading the heavy
   * `structure` payload — no point burning a join query for a request
   * we're about to 402.
   */
  async getWorkout(
    organisationId: string,
    id: string,
    clientUserId: string | null = null,
  ): Promise<PublicWorkoutResponse> {
    const row = await this.workoutRepo.findById(id);
    if (!row || row.organisation_id !== organisationId) {
      throw new NotFoundException('Workout not found');
    }
    const lock = clientUserId
      ? await this.entitlements.assertAccess({
          organisationId,
          userId: clientUserId,
          resourceType: 'workout',
          resourceId: id,
        })
      : await this.entitlements.getLockStatus(null, 'workout', id);
    const structure = await this.loadWorkoutStructure(id);
    return { data: { ...mapWorkoutDTO(row, lock), structure } };
  }

  /**
   * Flatten workout_items → exercise_instances (+ group items) → exercises in
   * one query so the public detail endpoint hands back everything an athlete
   * UI needs to play along (exercise name, prescribed sets/reps/load, cues).
   *
   * Standalone exercise_instance items and items inside an
   * exercise_instance_group are emitted as sibling steps, distinguished by
   * `groupId`. Consumers that don't care about supersets can ignore the
   * field. Ordering: workout_item.position ASC, then group_item.position ASC
   * within a group.
   */
  private async loadWorkoutStructure(workoutId: string): Promise<PublicWorkoutStepDTO[]> {
    // Standalone exercise instances (workout_item → exercise_instance directly).
    const standalone = await this.db
      .selectFrom('workout_items as wi')
      .innerJoin('exercise_instances as ei', 'ei.id', 'wi.exercise_instance_id')
      .innerJoin('exercises as e', 'e.id', 'ei.exercise_id')
      .where('wi.workout_id', '=', workoutId)
      .where('wi.exercise_instance_id', 'is not', null)
      .select([
        'wi.position as wi_position',
        'ei.id as ei_id',
        'ei.mode',
        'ei.sets',
        'ei.reps',
        'ei.execution_time',
        'ei.load',
        'ei.intensity',
        'ei.tempo',
        'ei.notes',
        'e.id as ex_id',
        'e.name as ex_name',
        'e.description as ex_description',
        'e.cues as ex_cues',
      ])
      .execute();

    // Grouped instances. We dive through exercise_instance_group_items to fetch
    // every exercise_instance underneath each workout_item that references a
    // group. The outer ORDER BY is on (wi.position, gi.position) so the
    // flattened list reads in the order a coach would walk through a superset.
    const grouped = await this.db
      .selectFrom('workout_items as wi')
      .innerJoin('exercise_instance_group_items as gi', 'gi.group_id', 'wi.exercise_instance_group_id')
      .innerJoin('exercise_instances as ei', 'ei.id', 'gi.exercise_instance_id')
      .innerJoin('exercises as e', 'e.id', 'ei.exercise_id')
      .where('wi.workout_id', '=', workoutId)
      .where('wi.exercise_instance_group_id', 'is not', null)
      .select([
        'wi.position as wi_position',
        'gi.position as gi_position',
        'wi.exercise_instance_group_id as group_id',
        'ei.id as ei_id',
        'ei.mode',
        'ei.sets',
        'ei.reps',
        'ei.execution_time',
        'ei.load',
        'ei.intensity',
        'ei.tempo',
        'ei.notes',
        'e.id as ex_id',
        'e.name as ex_name',
        'e.description as ex_description',
        'e.cues as ex_cues',
      ])
      .execute();

    const steps: PublicWorkoutStepDTO[] = [
      ...standalone.map((s) => ({
        exerciseInstanceId: s.ei_id,
        exerciseId: s.ex_id,
        exerciseName: s.ex_name,
        exerciseDescription: s.ex_description,
        cues: (s.ex_cues as string[] | null) ?? [],
        position: s.wi_position,
        groupId: null,
        mode: s.mode,
        sets: s.sets,
        reps: s.reps,
        executionTime: s.execution_time,
        load: s.load,
        intensity: s.intensity,
        tempo: s.tempo,
        notes: s.notes,
      })),
      ...grouped.map((g) => ({
        exerciseInstanceId: g.ei_id,
        exerciseId: g.ex_id,
        exerciseName: g.ex_name,
        exerciseDescription: g.ex_description,
        cues: (g.ex_cues as string[] | null) ?? [],
        // Synthesise a fractional position so grouped items sort *between*
        // their parent workout_item and the next one without us pulling sort
        // logic into JS-side comparator gymnastics.
        position: g.wi_position + (g.gi_position ?? 0) / 1000,
        groupId: g.group_id,
        mode: g.mode,
        sets: g.sets,
        reps: g.reps,
        executionTime: g.execution_time,
        load: g.load,
        intensity: g.intensity,
        tempo: g.tempo,
        notes: g.notes,
      })),
    ].sort((a, b) => a.position - b.position);

    // Re-base positions to 1..N so they're presentable to consumers.
    return steps.map((s, idx) => ({ ...s, position: idx + 1 }));
  }

  // ----------------------------- Courses -----------------------------

  async listCourses(
    organisationId: string,
    opts: PaginationOpts,
    clientUserId: string | null = null,
  ): Promise<PublicCourseListResponse> {
    // Only expose published courses on the public surface — drafts stay coach-only.
    const rows = await this.courseRepo.list(
      organisationId,
      { status: CourseStatus.PUBLISHED },
      { offset: opts.offset, limit: opts.limit },
    );
    const lockByResource = await this.entitlements.getLockStatusMap(
      clientUserId,
      'course',
      rows.map((r) => r.id),
    );
    return {
      data: rows.map((row) => mapCourseDTO(row, lockByResource.get(row.id) ?? FREE_LOCK)),
      meta: { totalCount: rows.length, offset: opts.offset, limit: opts.limit },
    };
  }

  async getCourse(
    organisationId: string,
    id: string,
    clientUserId: string | null = null,
  ): Promise<PublicCourseResponse> {
    const row = await this.courseRepo.findById(id, organisationId);
    if (!row || row.status !== CourseStatus.PUBLISHED) {
      throw new NotFoundException('Course not found');
    }
    const lock = clientUserId
      ? await this.entitlements.assertAccess({
          organisationId,
          userId: clientUserId,
          resourceType: 'course',
          resourceId: id,
        })
      : await this.entitlements.getLockStatus(null, 'course', id);
    return { data: mapCourseDTO(row, lock) };
  }

  // ------------------------ Movement snacks --------------------------

  async listMovementSnacks(
    organisationId: string,
    opts: PaginationOpts,
    clientUserId: string | null = null,
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
    const lockByResource = await this.entitlements.getLockStatusMap(
      clientUserId,
      'content_item',
      rows.map((r) => r.id),
    );
    const data = await Promise.all(
      rows.map((r) => this.mapMovementSnackDTO(r, lockByResource.get(r.id) ?? FREE_LOCK)),
    );
    return {
      data,
      meta: { totalCount: rows.length, offset: opts.offset, limit: opts.limit },
    };
  }

  async getMovementSnack(
    organisationId: string,
    id: string,
    clientUserId: string | null = null,
  ): Promise<PublicMovementSnackResponse> {
    const row = await this.contentItemRepo.findByIdInOrg(id, organisationId);
    if (!row || row.kind !== ContentItemKind.SNACK || row.status !== ContentItemStatus.READY) {
      throw new NotFoundException('Movement snack not found');
    }
    const lock = clientUserId
      ? await this.entitlements.assertAccess({
          organisationId,
          userId: clientUserId,
          resourceType: 'content_item',
          resourceId: id,
        })
      : await this.entitlements.getLockStatus(null, 'content_item', id);
    return { data: await this.mapMovementSnackDTO(row, lock) };
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

  private async mapMovementSnackDTO(
    row: ContentItem,
    lock: PublicLockStatusDTO,
  ): Promise<PublicMovementSnackDTO> {
    // Hide the playable video URL from locked snacks so a malicious
    // client can't lift the underlying media just by reading the list
    // response. They still get title + description so the paywall card
    // can preview what they'd unlock.
    const videoUrl =
      !lock.locked && row.video_s3_bucket && row.video_s3_key
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
      lock,
    };
  }
}

function mapWorkoutDTO(row: Workout, lock: PublicLockStatusDTO): PublicWorkoutDTO {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    difficulty: row.difficulty,
    type: row.type,
    createdAt: isoOf(row.created_at),
    lock,
  };
}

function mapCourseDTO(row: Course, lock: PublicLockStatusDTO): PublicCourseDTO {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    status: row.status,
    createdAt: isoOf(row.created_at),
    lock,
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

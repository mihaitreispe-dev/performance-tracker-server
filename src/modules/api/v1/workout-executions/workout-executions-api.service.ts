import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { type Request } from 'express';
import {
  CardioMetric,
  CoachAthleteStatus,
  GeoJSONLineString,
  RouteMarker,
  SetCompletion,
  Workout,
  WorkoutExecution,
  WorkoutExecutionSource,
  WorkoutRoute,
  WorkoutSchedule,
  WorkoutVisibility,
} from 'src/database/interfaces';
import { AuthUser } from 'src/modules/auth/types/authenticated-user';
import { WeatherService } from 'src/modules/weather/weather.service';
import { AthletePrivacySettingsRepository } from 'src/repositories/athlete-privacy-settings.repository';
import { OrganisationMembershipRepository } from 'src/repositories/organisation-membership.repository';
import { CardioMetricsRepository } from 'src/repositories/cardio-metrics.repository';
import { CoachAthleteRelationshipRepository } from 'src/repositories/coach-athlete-relationship.repository';
import { ExecutionWeatherRepository } from 'src/repositories/execution-weather.repository';
import { ExerciseInstanceRepository } from 'src/repositories/exercise-instance.repository';
import { ExerciseRepository } from 'src/repositories/exercise.repository';
import { RpeTssTrackingRepository } from 'src/repositories/rpe-tss-tracking.repository';
import { SetCompletionRepository } from 'src/repositories/set-completion.repository';
import { TrainingStressRepository } from 'src/repositories/training-stress.repository';
import { WorkoutRepository } from 'src/repositories/workout.repository';
import {
  WorkoutExecutionFilter,
  WorkoutExecutionRepository,
  WorkoutExecutionSort,
} from 'src/repositories/workout-execution.repository';
import { WorkoutRouteRepository } from 'src/repositories/workout-route.repository';
import { WorkoutScheduleRepository } from 'src/repositories/workout-schedule.repository';

import { OutboundSyncApiService } from '../outbound-sync/outbound-sync-api.service';
import { NotificationRulesService } from 'src/modules/notification-rules/notification-rules.service';

import { PersonalRecordsDetectionService } from '../personal-records/personal-records-detection.service';
import { WorkoutInfoDTO } from '../workout-schedules/response.dto';
import {
  BatchUploadMetricsBody,
  CompleteSetBody,
  LastActualsLookupBody,
  ListMetricsQuery,
  ListSetCompletionsQuery,
  ListWorkoutExecutionsQuery,
  StartWorkoutExecutionBody,
  UpdateSessionRPEBody,
  UpdateWorkoutExecutionBody,
  UploadRouteBody,
} from './request.dto';
import {
  BatchUploadMetricsResponse,
  CardioMetricDTO,
  CardioMetricListResponse,
  LastActualsDTO,
  LastActualsResponse,
  RouteMarkerDTO,
  SessionRPEDTO,
  SessionRPEResponse,
  SetCompletionDTO,
  SetCompletionListResponse,
  SetCompletionResponse,
  WorkoutExecutionDTO,
  WorkoutExecutionExercisePerfDTO,
  WorkoutExecutionListResponse,
  WorkoutExecutionResponse,
  WorkoutExecutionSummaryDTO,
  WorkoutExecutionSummaryResponse,
  WorkoutRouteDTO,
  WorkoutRouteResponse,
} from './response.dto';

@Injectable()
export class WorkoutExecutionsApiService {
  private readonly logger = new Logger(WorkoutExecutionsApiService.name);

  constructor(
    private readonly workoutExecutionRepository: WorkoutExecutionRepository,
    private readonly setCompletionRepository: SetCompletionRepository,
    private readonly cardioMetricsRepository: CardioMetricsRepository,
    private readonly workoutRouteRepository: WorkoutRouteRepository,
    private readonly workoutScheduleRepository: WorkoutScheduleRepository,
    private readonly workoutRepository: WorkoutRepository,
    private readonly personalRecordsDetectionService: PersonalRecordsDetectionService,
    private readonly weatherService: WeatherService,
    private readonly executionWeatherRepository: ExecutionWeatherRepository,
    private readonly relationshipRepository: CoachAthleteRelationshipRepository,
    private readonly privacySettingsRepository: AthletePrivacySettingsRepository,
    private readonly rpeTssTrackingRepository: RpeTssTrackingRepository,
    private readonly trainingStressRepository: TrainingStressRepository,
    private readonly exerciseInstanceRepository: ExerciseInstanceRepository,
    private readonly exerciseRepository: ExerciseRepository,
    // Used by the ad-hoc start path to verify the caller is a member
    // of the org that owns the org_library workout they're starting.
    private readonly organisationMembershipRepository: OrganisationMembershipRepository,
    // D3 — workout completions enqueue outbound sync jobs for every
    // provider this user has connected. Service is @Global() so no
    // module-level import is needed in the executions module.
    private readonly outboundSyncService: OutboundSyncApiService,
    // F1b — workout completions also fire any enabled
    // on_action_completion notification rules across every org the
    // athlete is a member of. Best-effort: failures inside the
    // engine never block the completion response.
    private readonly notificationRulesService: NotificationRulesService,
  ) {}

  // Workout Executions

  async list(
    req: Request & { user: AuthUser },
    query: ListWorkoutExecutionsQuery,
  ): Promise<WorkoutExecutionListResponse> {
    const filter: WorkoutExecutionFilter = {
      userId: req.user.id,
      workoutScheduleId: query.workoutScheduleId,
      source: query.source,
      dateFrom: query.dateFrom ? new Date(query.dateFrom) : undefined,
      dateTo: query.dateTo ? new Date(query.dateTo) : undefined,
      completed: query.completed,
    };

    const sort: WorkoutExecutionSort[] | undefined = query.sort?.map((s) => ({
      field: s.field as 'started_at' | 'completed_at' | 'created_at' | 'updated_at',
      direction: s.direction,
    }));

    const [executions, totalCount] = await Promise.all([
      this.workoutExecutionRepository.findMany({
        filter,
        sort,
        offset: query.offset,
        limit: query.limit ?? 50,
      }),
      this.workoutExecutionRepository.countMany(filter),
    ]);

    // Fetch workouts for executions that have schedule IDs using bulk fetch
    const scheduleIds = [
      ...new Set(executions.filter((e) => e.workout_schedule_id).map((e) => e.workout_schedule_id!)),
    ];
    const scheduleMap = new Map<string, WorkoutSchedule>();
    const workoutMap = new Map<string, Workout>();

    if (scheduleIds.length > 0) {
      // Bulk fetch schedules instead of N individual queries
      const schedules = await this.workoutScheduleRepository.findByIds(scheduleIds);
      for (const schedule of schedules) {
        scheduleMap.set(schedule.id, schedule);
      }

      // Bulk fetch workouts instead of N individual queries
      const workoutIds = [...new Set([...scheduleMap.values()].map((s) => s.workout_id))];
      const workouts = await this.workoutRepository.findByIds(workoutIds);
      for (const workout of workouts) {
        workoutMap.set(workout.id, workout);
      }
    }

    const data = executions.map((execution) => {
      const schedule = execution.workout_schedule_id ? scheduleMap.get(execution.workout_schedule_id) : undefined;
      const workout = schedule ? workoutMap.get(schedule.workout_id) : undefined;
      return this.mapExecutionToDTO(execution, workout);
    });

    return {
      data,
      offset: query.offset,
      limit: query.limit,
      totalCount,
    };
  }

  /**
   * Smart-prefill lookup (B6). One bulk query per workout open: the
   * player POSTs all exercise IDs in the upcoming session and gets
   * back the user's most recent completed actuals for each — so
   * each set row pre-populates with what they did last time instead
   * of the bare prescription.
   *
   * Exercises the user has never logged are absent from the response;
   * the client falls back to the prescription. No 404 even when the
   * input contains unknown exercise IDs — the analytics value of the
   * endpoint is "best-effort union of what we know," not strict
   * resolution.
   */
  async getLastActuals(
    req: Request & { user: AuthUser },
    body: LastActualsLookupBody,
  ): Promise<LastActualsResponse> {
    const map = await this.setCompletionRepository.findLastByUserAndExercises(
      req.user.id,
      body.exerciseIds,
    );
    const data: LastActualsDTO[] = [];
    for (const [exerciseId, completion] of map.entries()) {
      data.push({
        exerciseId,
        actualReps: completion.actual_reps,
        actualLoad: completion.actual_load == null ? null : Number(completion.actual_load),
        actualTimeSeconds: completion.actual_time_seconds,
        rpe: completion.rpe,
        completedAt:
          completion.completed_at instanceof Date
            ? completion.completed_at.toISOString()
            : String(completion.completed_at),
      });
    }
    return { data };
  }

  async getById(req: Request & { user: AuthUser }, id: string): Promise<WorkoutExecutionResponse> {
    const execution = await this.workoutExecutionRepository.findById(id);
    if (!execution) {
      throw new NotFoundException('Workout execution not found');
    }

    // Check if user owns the execution or is a coach with access
    if (execution.user_id !== req.user.id) {
      // Check if user is a coach with active relationship and athlete has shared analytics
      const relationship = await this.relationshipRepository.findActiveByCoachAndAthlete(
        req.user.id,
        execution.user_id,
      );

      if (!relationship || relationship.status !== CoachAthleteStatus.ACTIVE) {
        throw new ForbiddenException('Access denied');
      }

      const settings = await this.privacySettingsRepository.findByUserId(execution.user_id);
      if (!settings?.share_analytics) {
        throw new ForbiddenException('Athlete has not shared analytics with you');
      }
    }

    let workout: Workout | undefined;
    if (execution.workout_schedule_id) {
      const schedule = await this.workoutScheduleRepository.findById(execution.workout_schedule_id);
      if (schedule) {
        workout = await this.workoutRepository.findById(schedule.workout_id);
      }
    }

    return { data: this.mapExecutionToDTO(execution, workout) };
  }

  /**
   * Aggregates a workout execution into the shape the player's end-of-workout screen needs.
   * Composed from the existing tables (no new schema); see WorkoutExecutionSummaryDTO for shape.
   */
  async getSummary(
    req: Request & { user: AuthUser },
    executionId: string,
  ): Promise<WorkoutExecutionSummaryResponse> {
    const execution = await this.workoutExecutionRepository.findById(executionId);
    if (!execution) {
      throw new NotFoundException('Workout execution not found');
    }
    if (execution.user_id !== req.user.id) {
      // Coach-with-access path: same gate as getById.
      const relationship = await this.relationshipRepository.findActiveByCoachAndAthlete(
        req.user.id,
        execution.user_id,
      );
      if (!relationship || relationship.status !== CoachAthleteStatus.ACTIVE) {
        throw new ForbiddenException('Access denied');
      }
      const settings = await this.privacySettingsRepository.findByUserId(execution.user_id);
      if (!settings?.share_analytics) {
        throw new ForbiddenException('Athlete has not shared analytics with you');
      }
    }

    // Walk the schedule → workout → workout_items chain to get planned counts. Out-of-the-box
    // workout_items model holds either an exercise_instance_group or an exercise_instance.
    // For the summary we care about *exercise instances* — that's where sets live.
    let workout: Workout | undefined;
    let plannedInstances: Array<{ id: string; exerciseId: string; setsPlanned: number }> = [];
    if (execution.workout_schedule_id) {
      const schedule = await this.workoutScheduleRepository.findById(execution.workout_schedule_id);
      if (schedule) {
        workout = await this.workoutRepository.findById(schedule.workout_id);
      }
    }

    // Load set_completions for this execution.
    const completions = await this.setCompletionRepository.findMany({
      filter: { workoutExecutionId: executionId },
      limit: 10_000,
    });

    // Resolve exercise_instance_id → exercise_id → exercise name for each completion's parent.
    const instanceIds = Array.from(new Set(completions.map((c) => c.exercise_instance_id)));
    const instances = instanceIds.length > 0 ? await this.exerciseInstanceRepository.findByIds(instanceIds) : [];
    const instanceById = new Map(instances.map((i) => [i.id, i]));

    const exerciseIds = Array.from(new Set(instances.map((i) => i.exercise_id)));
    const exercises = exerciseIds.length > 0 ? await this.exerciseRepository.findByIds(exerciseIds) : [];
    const exerciseById = new Map(exercises.map((e) => [e.id, e]));

    // Build per-exercise aggregates by walking the completions once.
    const perExerciseAcc = new Map<
      string,
      {
        exerciseId: string;
        exerciseName: string;
        setsCompleted: number;
        setsSkipped: number;
        repsSum: number;
        timeSecSum: number;
        volumeSum: number;
        rpeSum: number;
        rpeCount: number;
        hasReps: boolean;
        hasTime: boolean;
        hasVolume: boolean;
      }
    >();

    for (const c of completions) {
      const inst = instanceById.get(c.exercise_instance_id);
      if (!inst) continue;
      const ex = exerciseById.get(inst.exercise_id);
      const key = inst.exercise_id;
      const slot = perExerciseAcc.get(key) ?? {
        exerciseId: key,
        exerciseName: ex?.name ?? 'Unknown exercise',
        setsCompleted: 0,
        setsSkipped: 0,
        repsSum: 0,
        timeSecSum: 0,
        volumeSum: 0,
        rpeSum: 0,
        rpeCount: 0,
        hasReps: false,
        hasTime: false,
        hasVolume: false,
      };
      if (c.skipped) {
        slot.setsSkipped += 1;
      } else {
        slot.setsCompleted += 1;
        if (c.actual_reps !== null && c.actual_reps !== undefined) {
          slot.repsSum += c.actual_reps;
          slot.hasReps = true;
        }
        if (c.actual_time_seconds !== null && c.actual_time_seconds !== undefined) {
          slot.timeSecSum += c.actual_time_seconds;
          slot.hasTime = true;
        }
        if (
          c.actual_reps !== null &&
          c.actual_reps !== undefined &&
          c.actual_load !== null &&
          c.actual_load !== undefined
        ) {
          slot.volumeSum += Number(c.actual_load) * c.actual_reps;
          slot.hasVolume = true;
        }
      }
      if (c.rpe !== null && c.rpe !== undefined) {
        slot.rpeSum += c.rpe;
        slot.rpeCount += 1;
      }
      perExerciseAcc.set(key, slot);
    }

    const perExercise: WorkoutExecutionExercisePerfDTO[] = Array.from(perExerciseAcc.values()).map((s) => ({
      exerciseId: s.exerciseId,
      exerciseName: s.exerciseName,
      setsCompleted: s.setsCompleted,
      setsSkipped: s.setsSkipped,
      totalReps: s.hasReps ? s.repsSum : null,
      totalTimeSeconds: s.hasTime ? s.timeSecSum : null,
      totalVolume: s.hasVolume ? s.volumeSum : null,
      avgRpe: s.rpeCount > 0 ? s.rpeSum / s.rpeCount : null,
    }));

    const setsCompleted = completions.filter((c) => !c.skipped).length;
    const setsSkipped = completions.length - setsCompleted;
    const setsPlanned = plannedInstances.reduce((sum, i) => sum + i.setsPlanned, 0) || completions.length;
    const exercisesPlanned = plannedInstances.length || perExerciseAcc.size;
    const exercisesCompleted = perExerciseAcc.size;

    const rpeCompletions = completions.filter((c) => c.rpe !== null && c.rpe !== undefined);
    const avgRpe =
      rpeCompletions.length > 0
        ? rpeCompletions.reduce((sum, c) => sum + (c.rpe ?? 0), 0) / rpeCompletions.length
        : null;
    const totalVolume = perExercise
      .map((p) => p.totalVolume ?? 0)
      .reduce((a, b) => a + b, 0) || null;

    const startedAt =
      execution.started_at instanceof Date
        ? execution.started_at.toISOString()
        : String(execution.started_at);
    const completedAt = execution.completed_at
      ? execution.completed_at instanceof Date
        ? execution.completed_at.toISOString()
        : String(execution.completed_at)
      : null;

    const data: WorkoutExecutionSummaryDTO = {
      executionId: execution.id,
      workoutId: workout?.id ?? null,
      workoutName: workout?.name ?? null,
      startedAt,
      completedAt,
      totalDurationSeconds: execution.duration_seconds ?? 0,
      exercisesPlanned,
      exercisesCompleted,
      setsPlanned,
      setsCompleted,
      setsSkipped,
      completionRatio: setsPlanned > 0 ? setsCompleted / setsPlanned : 0,
      sessionRpe: execution.session_rpe ?? null,
      avgRpe,
      totalVolume,
      perExercise,
    };
    return { data };
  }

  async start(req: Request & { user: AuthUser }, body: StartWorkoutExecutionBody): Promise<WorkoutExecutionResponse> {
    // Body shape: exactly one of workoutId / workoutScheduleId must be
    // supplied. Class-validator can't express "one of N" cleanly with
    // class-validator decorators alone, so we enforce it here. This
    // ALSO covers the no-op "both unset" case which would otherwise
    // sail through validation since both fields are @IsOptional.
    if (!body.workoutScheduleId && !body.workoutId) {
      throw new BadRequestException(
        'Either workoutScheduleId (scheduled) or workoutId (ad-hoc) is required.',
      );
    }
    if (body.workoutScheduleId && body.workoutId) {
      throw new BadRequestException(
        'Pass only one of workoutScheduleId or workoutId, not both.',
      );
    }

    // Resolve the schedule we'll attach the execution to. In the
    // scheduled mode we just verify the supplied schedule. In the
    // ad-hoc mode we synthesise a schedule for today against the
    // workout — this keeps the existing schedule_id foreign key on
    // executions intact (no schema split needed) while letting
    // callers like the rehabit app start a library workout without
    // pre-populating the calendar.
    let schedule: WorkoutSchedule;
    if (body.workoutScheduleId) {
      const found = await this.workoutScheduleRepository.findById(body.workoutScheduleId);
      if (!found) {
        throw new NotFoundException('Workout schedule not found');
      }
      if (found.user_id !== req.user.id) {
        throw new ForbiddenException('Access denied to this workout schedule');
      }
      schedule = found;
    } else {
      // body.workoutId — ad-hoc path.
      schedule = await this.resolveAdHocSchedule(req.user.id, body.workoutId!);
    }

    const execution = await this.workoutExecutionRepository.create({
      user_id: req.user.id,
      workout_schedule_id: schedule.id,
      started_at: body.startedAt ? new Date(body.startedAt) : new Date(),
      source: WorkoutExecutionSource.MANUAL,
      notes: body.notes ?? null,
    });

    const workout = await this.workoutRepository.findById(schedule.workout_id);

    return { data: this.mapExecutionToDTO(execution, workout) };
  }

  /**
   * Ad-hoc start helper: verify the user can access the workout (owner
   * OR a member of the org and the workout is `org_library`), then
   * create a schedule row for today's date pointing at it. The
   * execution rows in this codebase are always anchored via
   * workout_schedule_id; rather than introduce a parallel "no
   * schedule" code path we mint a lightweight schedule on the fly.
   *
   * The created schedule is intentionally unattributed to a plan / day
   * (it's a plain "I did this workout today" marker). The user's
   * calendar surface treats it the same as any other one-off entry,
   * which is the right semantic — an ad-hoc start IS a one-off entry.
   */
  private async resolveAdHocSchedule(userId: string, workoutId: string): Promise<WorkoutSchedule> {
    const workout = await this.workoutRepository.findById(workoutId);
    if (!workout) {
      throw new NotFoundException('Workout not found');
    }
    // Access check mirrors WorkoutsApiService.getById: owner is fine,
    // org_library inside the same organisation is fine, anything else
    // is forbidden. We don't have AuthedRequest here (the service
    // takes a plain Request), so we read organisation membership off
    // the workout itself — if the user owns it, allow; if it's
    // org_library and the user shares the org, allow.
    const isOwner = workout.user_id === userId;
    if (!isOwner) {
      if (workout.visibility !== WorkoutVisibility.ORG_LIBRARY) {
        throw new ForbiddenException('Access denied to this workout');
      }
      // Membership check against the workout's organisation. Plain
      // SQL — no @Global() org-membership service exists in this
      // module's import surface, so we hit the repo directly via the
      // schedule repository's underlying db (shared connection).
      const isMember = await this.userIsMemberOfOrg(userId, workout.organisation_id);
      if (!isMember) {
        throw new ForbiddenException('Access denied to this workout');
      }
    }

    return this.workoutScheduleRepository.create({
      organisation_id: workout.organisation_id,
      user_id: userId,
      workout_id: workout.id,
      scheduled_date: new Date(),
    });
  }

  /**
   * Lightweight org-membership check used only by the ad-hoc start
   * path. The `org_library` visibility makes a workout visible to
   * every accepted member of the workout's organisation; this is the
   * exact same check WorkoutsApiService runs implicitly through
   * `assertActiveOrg` + `organisation_id` filtering on getById.
   */
  private async userIsMemberOfOrg(userId: string, organisationId: string): Promise<boolean> {
    const row = await this.organisationMembershipRepository.findByUserAndOrg(
      userId,
      organisationId,
    );
    return !!row;
  }

  async update(
    req: Request & { user: AuthUser },
    id: string,
    body: UpdateWorkoutExecutionBody,
  ): Promise<WorkoutExecutionResponse> {
    const execution = await this.workoutExecutionRepository.findById(id);
    if (!execution) {
      throw new NotFoundException('Workout execution not found');
    }
    if (execution.user_id !== req.user.id) {
      throw new ForbiddenException('Access denied');
    }

    // F-06 idempotency: the completion side-effects (writing
    // completed_at, finishing the schedule, detecting PRs, fetching
    // weather) must fire EXACTLY once per execution even if the
    // client double-taps Finish, two devices race the same execution,
    // or an offline-queued call lands after the canonical completion.
    //
    // The canonical "is this already finished?" signal is
    // `execution.completed_at != null` — we snapshot it BEFORE we
    // call updateById so a concurrent write doesn't lie to us, and
    // we drop completedAt from the patch when it's already set so
    // the timestamp stays anchored to the first finisher. The rest
    // of the patch (notes, durationSeconds) is still honoured because
    // those are legitimately editable after finish.
    const alreadyFinished = execution.completed_at != null;

    const updateData: Record<string, unknown> = {};
    if (body.completedAt !== undefined && !alreadyFinished) {
      updateData.completed_at = new Date(body.completedAt);
    }
    if (body.durationSeconds !== undefined && !alreadyFinished) {
      // durationSeconds is part of the completion snapshot; once
      // anchored, we don't let later writes shift it either.
      updateData.duration_seconds = body.durationSeconds;
    }
    // `partial` is part of the completion snapshot too (spec B7):
    // once a workout is finished as partial, a later "completion"
    // call from another device shouldn't be able to flip it to
    // non-partial. Bound by the same alreadyFinished gate.
    if (body.partial !== undefined && !alreadyFinished) {
      updateData.partial = body.partial;
    }
    if (body.notes !== undefined) {
      updateData.notes = body.notes;
    }

    // If alreadyFinished AND the patch was *only* completion fields,
    // updateData ends up empty — return the existing row instead of
    // running a no-op SQL update. This keeps the response idempotent
    // (same DTO back as the first finisher saw) without an extra
    // round trip.
    const updatedExecution =
      Object.keys(updateData).length > 0
        ? await this.workoutExecutionRepository.updateById(id, updateData as any)
        : execution;

    // The schedule update + PR detection + weather fetch are the
    // "first-finisher only" side effects. Skip them if we just
    // observed alreadyFinished — they ran for the original caller.
    const isFirstFinish = !alreadyFinished && body.completedAt;

    if (isFirstFinish && updatedExecution.workout_schedule_id) {
      const completionDate = new Date(body.completedAt!);
      // Use UTC methods to avoid timezone issues
      const completionDateOnly = new Date(
        Date.UTC(completionDate.getUTCFullYear(), completionDate.getUTCMonth(), completionDate.getUTCDate()),
      );

      await this.workoutScheduleRepository.updateById(updatedExecution.workout_schedule_id, {
        completed_at: completionDate,
        scheduled_date: completionDateOnly,
      });
    }

    // Trigger PR detection + weather fetch only on the first finish.
    // Both are best-effort fire-and-forget; we still want them
    // gated so a second finisher doesn't risk a double-insert in
    // the detector (depends on its own dedup, which we shouldn't rely
    // on from this layer).
    if (isFirstFinish) {
      this.personalRecordsDetectionService.detectAndStorePRs(id, req.user.id).catch((error) => {
        this.logger.error(`Failed to detect PRs for execution ${id}:`, error);
      });

      this.triggerWeatherFetch(id, updatedExecution.started_at);

      // D3 outbound sync — enqueue jobs for every provider this user
      // has connected (Strava, Apple Health, Google Fit, …). Same
      // first-finish gate as PR detection so multi-device race
      // doesn't queue duplicates (the DB unique constraint on
      // (execution, provider) is the safety net regardless).
      //
      // Snapshot the data the providers need at enqueue time so the
      // worker isn't sensitive to mid-flight edits of the underlying
      // execution / sets. Today the providers' actual push happens
      // out-of-band via the runWorker() cron entry.
      this.outboundSyncService
        .enqueueForExecution(updatedExecution, {
          startedAt: updatedExecution.started_at,
          completedAt: updatedExecution.completed_at,
          durationSeconds: updatedExecution.duration_seconds,
          partial: updatedExecution.partial,
          notes: updatedExecution.notes,
          sessionRpe: updatedExecution.session_rpe,
        })
        .catch((error) => {
          this.logger.error(`Failed to enqueue outbound sync for ${id}:`, error);
        });

      // F1b — fire any enabled on_action_completion notification
      // rules across every org the athlete is a member of.
      // Fire-and-forget: a misconfigured rule, an FCM outage, etc.
      // must never block the user's finish response.
      this.notificationRulesService
        .fireOnActionCompletion({
          userId: req.user.id,
          eventType: 'workout_finished',
        })
        .catch((error) => {
          this.logger.error(`Failed to fire on_action_completion for ${id}:`, error);
        });
    }

    let workout: Workout | undefined;
    if (updatedExecution.workout_schedule_id) {
      const schedule = await this.workoutScheduleRepository.findById(updatedExecution.workout_schedule_id);
      if (schedule) {
        workout = await this.workoutRepository.findById(schedule.workout_id);
      }
    }

    return { data: this.mapExecutionToDTO(updatedExecution, workout) };
  }

  async delete(req: Request & { user: AuthUser }, id: string): Promise<void> {
    const execution = await this.workoutExecutionRepository.findById(id);
    if (!execution) {
      throw new NotFoundException('Workout execution not found');
    }
    if (execution.user_id !== req.user.id) {
      throw new ForbiddenException('Access denied');
    }

    await this.workoutExecutionRepository.deleteById(id);
  }

  // Session RPE

  async updateSessionRPE(
    req: Request & { user: AuthUser },
    id: string,
    body: UpdateSessionRPEBody,
  ): Promise<SessionRPEResponse> {
    const execution = await this.workoutExecutionRepository.findById(id);
    if (!execution) {
      throw new NotFoundException('Workout execution not found');
    }
    if (execution.user_id !== req.user.id) {
      throw new ForbiddenException('Access denied');
    }

    // Workout must be completed to record session RPE
    if (!execution.completed_at || !execution.duration_seconds) {
      throw new BadRequestException('Workout must be completed with duration to record session RPE');
    }

    const now = new Date();
    const durationMinutes = execution.duration_seconds / 60;

    // Calculate sRPE-TSS using Foster method: RPE × duration in minutes
    const srpeTss = body.sessionRpe * durationMinutes;

    // Get calculated TSS from training stress scores (if available)
    const trainingStress = await this.trainingStressRepository.findByWorkoutExecutionId(id);
    const calculatedTss = trainingStress?.tss ? Number.parseFloat(trainingStress.tss) : null;

    // Calculate RPE:TSS ratio
    let rpeTssRatio: number | null = null;
    if (calculatedTss && calculatedTss > 0) {
      rpeTssRatio = srpeTss / calculatedTss;
    }

    // Check for accumulated fatigue (average ratio > 1.3 over last 7 days)
    const avgRatio = await this.rpeTssTrackingRepository.getAverageRatio(req.user.id, 7);
    const accumulatedFatigueFlag = avgRatio !== null && avgRatio > 1.3;

    // Update workout execution with session RPE
    await this.workoutExecutionRepository.updateById(id, {
      session_rpe: body.sessionRpe,
      srpe_tss: srpeTss.toFixed(2),
      rpe_collected_at: now,
    });

    // Create or update tracking record
    const existingTracking = await this.rpeTssTrackingRepository.findByWorkoutExecutionId(id);
    if (existingTracking) {
      await this.rpeTssTrackingRepository.updateById(existingTracking.id, {
        session_rpe: body.sessionRpe,
        srpe_tss: srpeTss.toFixed(2),
        calculated_tss: calculatedTss?.toFixed(2) ?? null,
        rpe_tss_ratio: rpeTssRatio?.toFixed(2) ?? null,
        accumulated_fatigue_flag: accumulatedFatigueFlag,
      });
    } else {
      await this.rpeTssTrackingRepository.create({
        user_id: req.user.id,
        workout_execution_id: id,
        session_rpe: body.sessionRpe,
        srpe_tss: srpeTss.toFixed(2),
        calculated_tss: calculatedTss?.toFixed(2) ?? null,
        rpe_tss_ratio: rpeTssRatio?.toFixed(2) ?? null,
        accumulated_fatigue_flag: accumulatedFatigueFlag,
      });
    }

    const responseData: SessionRPEDTO = {
      sessionRpe: body.sessionRpe,
      srpeTss,
      calculatedTss,
      rpeTssRatio,
      accumulatedFatigueFlag,
      rpeCollectedAt: now.toISOString(),
    };

    return { data: responseData };
  }

  async getSessionRPE(req: Request & { user: AuthUser }, id: string): Promise<SessionRPEResponse> {
    const execution = await this.workoutExecutionRepository.findById(id);
    if (!execution) {
      throw new NotFoundException('Workout execution not found');
    }

    // Check if user owns the execution or is a coach with access
    if (execution.user_id !== req.user.id) {
      const relationship = await this.relationshipRepository.findActiveByCoachAndAthlete(
        req.user.id,
        execution.user_id,
      );

      if (!relationship || relationship.status !== CoachAthleteStatus.ACTIVE) {
        throw new ForbiddenException('Access denied');
      }

      const settings = await this.privacySettingsRepository.findByUserId(execution.user_id);
      if (!settings?.share_analytics) {
        throw new ForbiddenException('Athlete has not shared analytics with you');
      }
    }

    if (!execution.session_rpe) {
      throw new NotFoundException('Session RPE not recorded for this workout');
    }

    const tracking = await this.rpeTssTrackingRepository.findByWorkoutExecutionId(id);

    const responseData: SessionRPEDTO = {
      sessionRpe: execution.session_rpe,
      srpeTss: execution.srpe_tss ? Number.parseFloat(execution.srpe_tss) : 0,
      calculatedTss: tracking?.calculated_tss ? Number.parseFloat(tracking.calculated_tss) : null,
      rpeTssRatio: tracking?.rpe_tss_ratio ? Number.parseFloat(tracking.rpe_tss_ratio) : null,
      accumulatedFatigueFlag: tracking?.accumulated_fatigue_flag ?? false,
      rpeCollectedAt: execution.rpe_collected_at
        ? new Date(execution.rpe_collected_at).toISOString()
        : new Date().toISOString(),
    };

    return { data: responseData };
  }

  // Set Completions

  async completeSet(
    req: Request & { user: AuthUser },
    executionId: string,
    body: CompleteSetBody,
  ): Promise<SetCompletionResponse> {
    const execution = await this.workoutExecutionRepository.findById(executionId);
    if (!execution) {
      throw new NotFoundException('Workout execution not found');
    }
    if (execution.user_id !== req.user.id) {
      throw new ForbiddenException('Access denied');
    }

    // Check if set completion already exists
    const existing = await this.setCompletionRepository.findByExecutionAndSet(
      executionId,
      body.exerciseInstanceId,
      body.setNumber,
    );

    let setCompletion: SetCompletion;
    if (existing) {
      // Update existing
      setCompletion = await this.setCompletionRepository.updateById(existing.id, {
        actual_reps: body.actualReps ?? null,
        actual_load: body.actualLoad?.toString() ?? null,
        actual_time_seconds: body.actualTimeSeconds ?? null,
        rpe: body.rpe ?? null,
        skipped: body.skipped ?? false,
        notes: body.notes ?? null,
        completed_at: new Date(),
      });
    } else {
      // Create new
      setCompletion = await this.setCompletionRepository.create({
        workout_execution_id: executionId,
        exercise_instance_id: body.exerciseInstanceId,
        set_number: body.setNumber,
        actual_reps: body.actualReps ?? null,
        actual_load: body.actualLoad?.toString() ?? null,
        actual_time_seconds: body.actualTimeSeconds ?? null,
        rpe: body.rpe ?? null,
        completed_at: new Date(),
        skipped: body.skipped ?? false,
        notes: body.notes ?? null,
      });
    }

    return { data: this.mapSetCompletionToDTO(setCompletion) };
  }

  async listSetCompletions(
    req: Request & { user: AuthUser },
    executionId: string,
    query: ListSetCompletionsQuery,
  ): Promise<SetCompletionListResponse> {
    const execution = await this.workoutExecutionRepository.findById(executionId);
    if (!execution) {
      throw new NotFoundException('Workout execution not found');
    }

    // Check if user owns the execution or is a coach with access
    if (execution.user_id !== req.user.id) {
      // Check if user is a coach with active relationship and athlete has shared analytics
      const relationship = await this.relationshipRepository.findActiveByCoachAndAthlete(
        req.user.id,
        execution.user_id,
      );

      if (!relationship || relationship.status !== CoachAthleteStatus.ACTIVE) {
        throw new ForbiddenException('Access denied');
      }

      const settings = await this.privacySettingsRepository.findByUserId(execution.user_id);
      if (!settings?.share_analytics) {
        throw new ForbiddenException('Athlete has not shared analytics with you');
      }
    }

    const setCompletions = await this.setCompletionRepository.findMany({
      filter: {
        workoutExecutionId: executionId,
        exerciseInstanceId: query.exerciseInstanceId,
      },
      sort: [{ field: 'set_number', direction: 'asc' }],
    });

    return {
      data: setCompletions.map((sc) => this.mapSetCompletionToDTO(sc)),
    };
  }

  // Cardio Metrics

  async uploadMetrics(
    req: Request & { user: AuthUser },
    executionId: string,
    body: BatchUploadMetricsBody,
  ): Promise<BatchUploadMetricsResponse> {
    const execution = await this.workoutExecutionRepository.findById(executionId);
    if (!execution) {
      throw new NotFoundException('Workout execution not found');
    }
    if (execution.user_id !== req.user.id) {
      throw new ForbiddenException('Access denied');
    }

    if (body.metrics.length === 0) {
      return { count: 0 };
    }

    const metricsToCreate = body.metrics.map((m) => ({
      workout_execution_id: executionId,
      metric_type: m.metricType,
      recorded_at: new Date(m.recordedAt),
      value: m.value.toString(),
      unit: m.unit,
    }));

    const created = await this.cardioMetricsRepository.createMany(metricsToCreate);
    return { count: created.length };
  }

  async listMetrics(
    req: Request & { user: AuthUser },
    executionId: string,
    query: ListMetricsQuery,
  ): Promise<CardioMetricListResponse> {
    const execution = await this.workoutExecutionRepository.findById(executionId);
    if (!execution) {
      throw new NotFoundException('Workout execution not found');
    }

    // Check if user owns the execution or is a coach with access
    if (execution.user_id !== req.user.id) {
      // Check if user is a coach with active relationship and athlete has shared analytics
      const relationship = await this.relationshipRepository.findActiveByCoachAndAthlete(
        req.user.id,
        execution.user_id,
      );

      if (!relationship || relationship.status !== CoachAthleteStatus.ACTIVE) {
        throw new ForbiddenException('Access denied');
      }

      const settings = await this.privacySettingsRepository.findByUserId(execution.user_id);
      if (!settings?.share_analytics) {
        throw new ForbiddenException('Athlete has not shared analytics with you');
      }
    }

    const metrics = await this.cardioMetricsRepository.findMany({
      filter: {
        workoutExecutionId: executionId,
        metricType: query.metricType,
      },
    });

    return {
      data: metrics.map((m) => this.mapCardioMetricToDTO(m)),
    };
  }

  // Routes

  async uploadRoute(
    req: Request & { user: AuthUser },
    executionId: string,
    body: UploadRouteBody,
  ): Promise<WorkoutRouteResponse> {
    const execution = await this.workoutExecutionRepository.findById(executionId);
    if (!execution) {
      throw new NotFoundException('Workout execution not found');
    }
    if (execution.user_id !== req.user.id) {
      throw new ForbiddenException('Access denied');
    }

    // Check if route already exists
    const existingRoute = await this.workoutRouteRepository.findByExecutionId(executionId);
    if (existingRoute) {
      throw new BadRequestException('Route already exists for this execution');
    }

    const route = await this.workoutRouteRepository.create({
      workout_execution_id: executionId,
      route_geojson: body.routeGeojson as GeoJSONLineString,
      total_distance_meters: body.totalDistanceMeters.toString(),
      elevation_gain_meters: body.elevationGainMeters?.toString() ?? null,
      elevation_loss_meters: body.elevationLossMeters?.toString() ?? null,
    });

    let markers: RouteMarker[] = [];
    if (body.markers && body.markers.length > 0) {
      const markersToCreate = body.markers.map((m) => ({
        workout_route_id: route.id,
        marker_type: m.markerType,
        marker_number: m.markerNumber,
        latitude: m.latitude.toString(),
        longitude: m.longitude.toString(),
        elevation_meters: m.elevationMeters?.toString() ?? null,
        recorded_at: new Date(m.recordedAt),
        split_time_seconds: m.splitTimeSeconds,
        cumulative_time_seconds: m.cumulativeTimeSeconds,
        avg_heart_rate: m.avgHeartRate ?? null,
        avg_pace_seconds_per_km: m.avgPaceSecondsPerKm ?? null,
      }));
      markers = await this.workoutRouteRepository.createMarkers(markersToCreate);
    }

    return { data: this.mapWorkoutRouteToDTO(route, markers) };
  }

  async getRoute(req: Request & { user: AuthUser }, executionId: string): Promise<WorkoutRouteResponse> {
    const execution = await this.workoutExecutionRepository.findById(executionId);
    if (!execution) {
      throw new NotFoundException('Workout execution not found');
    }

    // Check if user owns the execution or is a coach with access
    if (execution.user_id !== req.user.id) {
      // Check if user is a coach with active relationship and athlete has shared analytics
      const relationship = await this.relationshipRepository.findActiveByCoachAndAthlete(
        req.user.id,
        execution.user_id,
      );

      if (!relationship || relationship.status !== CoachAthleteStatus.ACTIVE) {
        throw new ForbiddenException('Access denied');
      }

      const settings = await this.privacySettingsRepository.findByUserId(execution.user_id);
      if (!settings?.share_analytics) {
        throw new ForbiddenException('Athlete has not shared analytics with you');
      }
    }

    const route = await this.workoutRouteRepository.findByExecutionId(executionId);
    if (!route) {
      throw new NotFoundException('Route not found for this execution');
    }

    const markers = await this.workoutRouteRepository.findMarkersByRouteId(route.id);

    return { data: this.mapWorkoutRouteToDTO(route, markers) };
  }

  // Weather

  /**
   * Trigger weather fetch asynchronously for a workout execution that has route data.
   * Weather is fetched from the first coordinate of the route at the workout start time.
   */
  private triggerWeatherFetch(executionId: string, startedAt: Date | string): void {
    (async () => {
      try {
        // Check if route exists for this execution
        const route = await this.workoutRouteRepository.findByExecutionId(executionId);
        if (!route) {
          this.logger.debug(`No route found for execution ${executionId}, skipping weather fetch`);
          return;
        }

        // Extract coordinates from route GeoJSON (format: [longitude, latitude])
        const coordinates = route.route_geojson.coordinates;
        if (!coordinates || coordinates.length === 0) {
          this.logger.debug(`No coordinates in route for execution ${executionId}, skipping weather fetch`);
          return;
        }

        const [longitude, latitude] = coordinates[0];
        const workoutStartedAt = startedAt instanceof Date ? startedAt : new Date(startedAt);

        // Fetch weather asynchronously
        await this.weatherService.fetchAndStoreWeather({
          workoutExecutionId: executionId,
          latitude,
          longitude,
          startedAt: workoutStartedAt,
        });
      } catch (error) {
        this.logger.error(`Failed to fetch weather for execution ${executionId}:`, error);
      }
    })();
  }

  // Mappers

  private mapExecutionToDTO(execution: WorkoutExecution, workout?: Workout): WorkoutExecutionDTO {
    const startedAt =
      execution.started_at instanceof Date ? execution.started_at.toISOString() : String(execution.started_at);
    const completedAt = execution.completed_at
      ? execution.completed_at instanceof Date
        ? execution.completed_at.toISOString()
        : String(execution.completed_at)
      : null;
    const createdAt =
      execution.created_at instanceof Date ? execution.created_at.toISOString() : String(execution.created_at);
    const updatedAt =
      execution.updated_at instanceof Date ? execution.updated_at.toISOString() : String(execution.updated_at);

    let workoutInfo: WorkoutInfoDTO | null = null;
    if (workout) {
      workoutInfo = {
        id: workout.id,
        name: workout.name,
        description: workout.description,
        difficulty: workout.difficulty,
        type: workout.type,
      };
    }

    const rpeCollectedAt = execution.rpe_collected_at
      ? execution.rpe_collected_at instanceof Date
        ? execution.rpe_collected_at.toISOString()
        : String(execution.rpe_collected_at)
      : null;

    return {
      id: execution.id,
      userId: execution.user_id,
      workoutScheduleId: execution.workout_schedule_id,
      workout: workoutInfo,
      startedAt,
      completedAt,
      durationSeconds: execution.duration_seconds,
      source: execution.source,
      externalId: execution.external_id,
      notes: execution.notes,
      sessionRpe: execution.session_rpe,
      srpeTss: execution.srpe_tss ? Number.parseFloat(execution.srpe_tss) : null,
      rpeCollectedAt,
      // partial defaults false at the DB layer; coerce to boolean
      // defensively for older rows where the migration hadn't backfilled
      // yet (NOT NULL DEFAULT false ensures this never bites at
      // runtime, but a strict map keeps TypeScript honest).
      partial: !!execution.partial,
      createdAt,
      updatedAt,
    };
  }

  private mapSetCompletionToDTO(sc: SetCompletion): SetCompletionDTO {
    const completedAt = sc.completed_at instanceof Date ? sc.completed_at.toISOString() : String(sc.completed_at);
    const createdAt = sc.created_at instanceof Date ? sc.created_at.toISOString() : String(sc.created_at);

    return {
      id: sc.id,
      workoutExecutionId: sc.workout_execution_id,
      exerciseInstanceId: sc.exercise_instance_id,
      setNumber: sc.set_number,
      actualReps: sc.actual_reps,
      actualLoad: sc.actual_load ? Number.parseFloat(sc.actual_load) : null,
      actualTimeSeconds: sc.actual_time_seconds,
      rpe: sc.rpe,
      completedAt,
      skipped: sc.skipped,
      notes: sc.notes,
      createdAt,
    };
  }

  private mapCardioMetricToDTO(m: CardioMetric): CardioMetricDTO {
    const recordedAt = m.recorded_at instanceof Date ? m.recorded_at.toISOString() : String(m.recorded_at);
    const createdAt = m.created_at instanceof Date ? m.created_at.toISOString() : String(m.created_at);

    return {
      id: m.id,
      workoutExecutionId: m.workout_execution_id,
      metricType: m.metric_type,
      recordedAt,
      value: Number.parseFloat(m.value),
      unit: m.unit,
      createdAt,
    };
  }

  private mapRouteMarkerToDTO(marker: RouteMarker): RouteMarkerDTO {
    const recordedAt =
      marker.recorded_at instanceof Date ? marker.recorded_at.toISOString() : String(marker.recorded_at);

    return {
      id: marker.id,
      markerType: marker.marker_type,
      markerNumber: marker.marker_number,
      latitude: Number.parseFloat(marker.latitude),
      longitude: Number.parseFloat(marker.longitude),
      elevationMeters: marker.elevation_meters ? Number.parseFloat(marker.elevation_meters) : null,
      recordedAt,
      splitTimeSeconds: marker.split_time_seconds,
      cumulativeTimeSeconds: marker.cumulative_time_seconds,
      avgHeartRate: marker.avg_heart_rate,
      avgPaceSecondsPerKm: marker.avg_pace_seconds_per_km,
    };
  }

  private mapWorkoutRouteToDTO(route: WorkoutRoute, markers: RouteMarker[]): WorkoutRouteDTO {
    const createdAt = route.created_at instanceof Date ? route.created_at.toISOString() : String(route.created_at);

    return {
      id: route.id,
      workoutExecutionId: route.workout_execution_id,
      routeGeojson: route.route_geojson as any,
      totalDistanceMeters: Number.parseFloat(route.total_distance_meters),
      elevationGainMeters: route.elevation_gain_meters ? Number.parseFloat(route.elevation_gain_meters) : null,
      elevationLossMeters: route.elevation_loss_meters ? Number.parseFloat(route.elevation_loss_meters) : null,
      markers: markers.map((m) => this.mapRouteMarkerToDTO(m)),
      createdAt,
    };
  }
}

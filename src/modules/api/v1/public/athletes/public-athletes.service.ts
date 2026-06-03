import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import {
  OrganisationRole,
  PersonalRecord,
  SetCompletion,
  Workout,
  WorkoutExecution,
  WorkoutExecutionSource,
  WorkoutSchedule,
} from 'src/database/interfaces';
import { ExerciseRepository } from 'src/repositories/exercise.repository';
import { ExerciseInstanceRepository } from 'src/repositories/exercise-instance.repository';
import { NotificationRuleRepository } from 'src/repositories/notification-rule.repository';
import { OrganisationMembershipRepository } from 'src/repositories/organisation-membership.repository';
import { PersonalRecordRepository } from 'src/repositories/personal-record.repository';
import { SetCompletionRepository } from 'src/repositories/set-completion.repository';
import { WorkoutRepository } from 'src/repositories/workout.repository';
import { WorkoutExecutionRepository } from 'src/repositories/workout-execution.repository';
import { WorkoutScheduleRepository } from 'src/repositories/workout-schedule.repository';

import {
  CompletePublicSetBody,
  FinishExecutionBody,
  ListExecutionHistoryQuery,
  ListScheduledWorkoutsQuery,
  StartExecutionBody,
} from './request.dto';
import {
  PublicExecutionHistoryResponse,
  PublicExecutionSummaryResponse,
  PublicPersonalRecordListResponse,
  PublicScheduledWorkoutDTO,
  PublicScheduledWorkoutListResponse,
  PublicSetCompletionDTO,
  PublicSetCompletionResponse,
  PublicWorkoutExecutionDTO,
  PublicWorkoutExecutionResponse,
} from './response.dto';

/**
 * Tier-1 athlete-facing surface exposed to third-party apps via API key.
 *
 * Every method takes (organisationId, userId-or-executionId) and short-circuits
 * to 404 unless the resource is reachable within the active organisation. The
 * boundary check is layered: first we ensure the user is a member of the org
 * (athlete-roled), then for execution-specific endpoints we also re-verify the
 * execution belongs to that user. Defence in depth — a leaked user_id from a
 * different tenant can't be used to fish for executions.
 *
 * No new tables in this phase; we reuse the existing repos that the first-party
 * client already uses, just with a thinner DTO shape suitable for public use.
 */
@Injectable()
export class PublicAthletesService {
  constructor(
    private readonly membershipRepo: OrganisationMembershipRepository,
    private readonly scheduleRepo: WorkoutScheduleRepository,
    private readonly executionRepo: WorkoutExecutionRepository,
    private readonly setCompletionRepo: SetCompletionRepository,
    private readonly personalRecordRepo: PersonalRecordRepository,
    private readonly workoutRepo: WorkoutRepository,
    private readonly exerciseInstanceRepo: ExerciseInstanceRepository,
    private readonly exerciseRepo: ExerciseRepository,
    private readonly notificationRuleRepo: NotificationRuleRepository,
  ) {}

  // -------- Pending notifications (integrator poll) -----------------

  /**
   * F1c — list deliveries the notification engine queued for this
   * user with route='external_app'. Used by integrators whose org
   * has uses_external_app=true; they poll on app boot + at intervals,
   * passing `since=<last-seen sentAt>` as the watermark.
   *
   * No auth-level constraint on uses_external_app — we always return
   * whatever's queued; if the org is using our first-party app instead,
   * the engine never writes external_app rows so the list stays empty.
   * That keeps the integrator's polling code free to enable / disable
   * the feature server-side without code churn.
   */
  async listPendingNotifications(
    organisationId: string,
    userId: string,
    since: string | null,
  ): Promise<{
    data: Array<{
      id: string;
      ruleId: string;
      title: string;
      body: string;
      clickAction: string | null;
      sentAt: string;
    }>;
  }> {
    await this.assertClientMembership(organisationId, userId);
    const rows = await this.notificationRuleRepo.listExternalDeliveriesForUser(
      userId,
      organisationId,
      since,
    );
    if (rows.length === 0) return { data: [] };

    // Join in title/body/clickAction from the rule rows. Done as a
    // batched lookup so we don't fan out N rule fetches.
    const ruleIds = [...new Set(rows.map((r) => r.rule_id))];
    const rules = await Promise.all(ruleIds.map((id) => this.notificationRuleRepo.findById(id)));
    const ruleById = new Map(rules.filter((r) => r != null).map((r) => [r!.id, r!]));

    return {
      data: rows.map((r) => {
        const rule = ruleById.get(r.rule_id);
        return {
          id: r.id,
          ruleId: r.rule_id,
          title: rule?.title ?? '(deleted rule)',
          body: rule?.body ?? '',
          clickAction: rule?.click_action ?? null,
          sentAt:
            r.sent_at instanceof Date ? r.sent_at.toISOString() : String(r.sent_at),
        };
      }),
    };
  }

  // -------- Schedules --------

  async listScheduledWorkouts(
    organisationId: string,
    userId: string,
    query: ListScheduledWorkoutsQuery,
  ): Promise<PublicScheduledWorkoutListResponse> {
    await this.assertClientMembership(organisationId, userId);
    const offset = query.offset ?? 0;
    const limit = query.limit ?? 50;
    const rows = await this.scheduleRepo.findMany({
      organisationId,
      filter: {
        userId,
        dateFrom: query.dateFrom ? new Date(query.dateFrom) : undefined,
        dateTo: query.dateTo ? new Date(query.dateTo) : undefined,
        completed: query.completed,
      },
      sort: [{ field: 'scheduled_date', direction: 'asc' }],
      offset,
      limit,
    });

    // Bulk-fetch the referenced workouts so the response is self-contained.
    const workoutIds = Array.from(new Set(rows.map((s) => s.workout_id)));
    const workouts = await this.workoutRepo.findByIds(workoutIds);
    const byId = new Map(workouts.map((w) => [w.id, w]));

    const data = rows.map((s) => mapScheduledDTO(s, byId.get(s.workout_id)));
    return { data, meta: { totalCount: rows.length, offset, limit } };
  }

  // -------- Executions --------

  async startExecution(
    organisationId: string,
    userId: string,
    body: StartExecutionBody,
  ): Promise<PublicWorkoutExecutionResponse> {
    await this.assertClientMembership(organisationId, userId);

    // Ensure the schedule (if any) is the user's and in this org. Workout-only
    // ad-hoc executions are supported by leaving workoutScheduleId unset.
    if (body.workoutScheduleId) {
      const schedule = await this.scheduleRepo.findById(body.workoutScheduleId);
      if (!schedule || schedule.user_id !== userId || schedule.organisation_id !== organisationId) {
        throw new NotFoundException('Schedule not found in this organisation');
      }
    }

    const execution = await this.executionRepo.create({
      user_id: userId,
      workout_schedule_id: body.workoutScheduleId ?? null,
      started_at: body.startedAt ? new Date(body.startedAt) : new Date(),
      source: WorkoutExecutionSource.MANUAL,
      notes: body.notes ?? null,
    });
    return { data: mapExecutionDTO(execution) };
  }

  async completeSet(
    organisationId: string,
    executionId: string,
    body: CompletePublicSetBody,
  ): Promise<PublicSetCompletionResponse> {
    const execution = await this.assertExecutionInOrg(organisationId, executionId);
    if (execution.completed_at) {
      throw new BadRequestException('Workout has already been finished; sets are read-only');
    }

    // Idempotent upsert by (exerciseInstanceId, setNumber). Lets the third-party
    // app retry without producing duplicate rows; matches first-party semantics.
    const existing = await this.setCompletionRepo.findByExecutionAndSet(
      execution.id,
      body.exerciseInstanceId,
      body.setNumber,
    );
    const payload = {
      actual_reps: body.actualReps ?? null,
      actual_load: body.actualLoad?.toString() ?? null,
      actual_time_seconds: body.actualTimeSeconds ?? null,
      rpe: body.rpe ?? null,
      notes: body.notes ?? null,
      skipped: body.skipped ?? false,
    };
    let row: SetCompletion;
    if (existing) {
      row = await this.setCompletionRepo.updateById(existing.id, {
        ...payload,
        completed_at: new Date(),
      });
    } else {
      row = await this.setCompletionRepo.create({
        workout_execution_id: execution.id,
        exercise_instance_id: body.exerciseInstanceId,
        set_number: body.setNumber,
        completed_at: new Date(),
        ...payload,
      });
    }
    return { data: mapSetCompletionDTO(row) };
  }

  async finishExecution(
    organisationId: string,
    executionId: string,
    body: FinishExecutionBody,
  ): Promise<PublicWorkoutExecutionResponse> {
    const execution = await this.assertExecutionInOrg(organisationId, executionId);

    // Idempotent: a second finish call returns the existing completed row instead
    // of mutating completed_at. Lets retries collapse on flaky networks.
    if (execution.completed_at) {
      return { data: mapExecutionDTO(execution) };
    }

    const completedAt = body.completedAt ? new Date(body.completedAt) : new Date();
    const startedAt =
      execution.started_at instanceof Date ? execution.started_at : new Date(execution.started_at);
    const computedDuration = Math.max(
      0,
      Math.floor((completedAt.getTime() - startedAt.getTime()) / 1000),
    );

    const updated = await this.executionRepo.updateById(executionId, {
      completed_at: completedAt,
      duration_seconds: body.durationSeconds ?? computedDuration,
      notes: body.notes ?? execution.notes,
    });
    return { data: mapExecutionDTO(updated) };
  }

  /**
   * Aggregated stats for an execution: time, sets, exercises, completion ratio,
   * volume, RPE. Mirrors the internal WorkoutExecutionsApiService.getSummary
   * aggregation but is gated by API-key membership instead of JWT user-or-coach
   * access. We duplicate the aggregation rather than depend on the internal
   * service because the internal one is tightly coupled to the JWT request shape;
   * extracting a shared computer is a follow-up refactor when both surfaces are
   * stable.
   */
  async getExecutionSummary(
    organisationId: string,
    executionId: string,
  ): Promise<PublicExecutionSummaryResponse> {
    const execution = await this.assertExecutionInOrg(organisationId, executionId);

    let workout: Workout | undefined;
    if (execution.workout_schedule_id) {
      const schedule = await this.scheduleRepo.findById(execution.workout_schedule_id);
      if (schedule) workout = await this.workoutRepo.findById(schedule.workout_id);
    }

    const completions = await this.setCompletionRepo.findMany({
      filter: { workoutExecutionId: execution.id },
      limit: 10_000,
    });
    const instanceIds = Array.from(new Set(completions.map((c) => c.exercise_instance_id)));
    const instances = instanceIds.length ? await this.exerciseInstanceRepo.findByIds(instanceIds) : [];
    const instanceById = new Map(instances.map((i) => [i.id, i]));
    const exerciseIds = Array.from(new Set(instances.map((i) => i.exercise_id)));
    const exercises = exerciseIds.length ? await this.exerciseRepo.findByIds(exerciseIds) : [];
    const exerciseById = new Map(exercises.map((e) => [e.id, e]));

    interface Acc {
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
    const acc = new Map<string, Acc>();
    for (const c of completions) {
      const inst = instanceById.get(c.exercise_instance_id);
      if (!inst) continue;
      const ex = exerciseById.get(inst.exercise_id);
      const slot = acc.get(inst.exercise_id) ?? {
        exerciseId: inst.exercise_id,
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
        if (c.actual_reps != null) {
          slot.repsSum += c.actual_reps;
          slot.hasReps = true;
        }
        if (c.actual_time_seconds != null) {
          slot.timeSecSum += c.actual_time_seconds;
          slot.hasTime = true;
        }
        if (c.actual_reps != null && c.actual_load != null) {
          slot.volumeSum += Number(c.actual_load) * c.actual_reps;
          slot.hasVolume = true;
        }
      }
      if (c.rpe != null) {
        slot.rpeSum += c.rpe;
        slot.rpeCount += 1;
      }
      acc.set(inst.exercise_id, slot);
    }

    const perExercise = Array.from(acc.values()).map((s) => ({
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
    const setsPlanned = completions.length;
    const rpeCompletions = completions.filter((c) => c.rpe != null);
    const avgRpe =
      rpeCompletions.length > 0
        ? rpeCompletions.reduce((sum, c) => sum + (c.rpe ?? 0), 0) / rpeCompletions.length
        : null;
    const totalVolume =
      perExercise.map((p) => p.totalVolume ?? 0).reduce((a, b) => a + b, 0) || null;

    return {
      data: {
        executionId: execution.id,
        workoutId: workout?.id ?? null,
        workoutName: workout?.name ?? null,
        startedAt: isoOf(execution.started_at),
        completedAt: execution.completed_at ? isoOf(execution.completed_at) : null,
        totalDurationSeconds: execution.duration_seconds ?? 0,
        exercisesPlanned: acc.size,
        exercisesCompleted: acc.size,
        setsPlanned,
        setsCompleted,
        setsSkipped,
        completionRatio: setsPlanned > 0 ? setsCompleted / setsPlanned : 0,
        sessionRpe: execution.session_rpe ?? null,
        avgRpe,
        totalVolume,
        perExercise,
      },
    };
  }

  async listExecutionHistory(
    organisationId: string,
    userId: string,
    query: ListExecutionHistoryQuery,
  ): Promise<PublicExecutionHistoryResponse> {
    await this.assertClientMembership(organisationId, userId);
    const offset = query.offset ?? 0;
    const limit = query.limit ?? 50;
    const rows = await this.executionRepo.findMany({
      filter: {
        userId,
        completed: query.completed,
        dateFrom: query.dateFrom ? new Date(query.dateFrom) : undefined,
        dateTo: query.dateTo ? new Date(query.dateTo) : undefined,
      },
      sort: [{ field: 'started_at', direction: 'desc' }],
      offset,
      limit,
    });
    return {
      data: rows.map(mapExecutionDTO),
      meta: { totalCount: rows.length, offset, limit },
    };
  }

  async listPersonalRecords(
    organisationId: string,
    userId: string,
  ): Promise<PublicPersonalRecordListResponse> {
    await this.assertClientMembership(organisationId, userId);
    const rows = await this.personalRecordRepo.findMany({ userId });
    return { data: rows.map(mapPRDTO) };
  }

  // -------- guards --------

  private async assertClientMembership(organisationId: string, userId: string): Promise<void> {
    const membership = await this.membershipRepo.findByUserAndOrg(userId, organisationId);
    if (!membership || membership.role !== OrganisationRole.ATHLETE) {
      throw new NotFoundException('Client not found in this organisation');
    }
  }

  /**
   * Used by execution-specific endpoints. Loads the execution, then verifies it
   * belongs to a member of the active org. Returns the execution so callers can
   * use the loaded row without a second fetch.
   */
  private async assertExecutionInOrg(
    organisationId: string,
    executionId: string,
  ): Promise<WorkoutExecution> {
    const execution = await this.executionRepo.findById(executionId);
    if (!execution) {
      throw new NotFoundException('Workout execution not found');
    }
    const membership = await this.membershipRepo.findByUserAndOrg(execution.user_id, organisationId);
    if (!membership) {
      // No information leak about whether the execution exists in another org.
      throw new NotFoundException('Workout execution not found');
    }
    if (membership.role !== OrganisationRole.ATHLETE) {
      throw new ForbiddenException('Execution does not belong to an athlete in this organisation');
    }
    return execution;
  }
}

// ---- mappers ----

function mapScheduledDTO(s: WorkoutSchedule, workout?: Workout): PublicScheduledWorkoutDTO {
  return {
    id: s.id,
    workoutId: s.workout_id,
    workoutName: workout?.name ?? null,
    workoutType: workout?.type ?? null,
    difficulty: workout?.difficulty ?? null,
    scheduledDate: isoOf(s.scheduled_date),
    completedAt: s.completed_at ? isoOf(s.completed_at) : null,
  };
}

function mapExecutionDTO(e: WorkoutExecution): PublicWorkoutExecutionDTO {
  return {
    id: e.id,
    userId: e.user_id,
    workoutScheduleId: e.workout_schedule_id,
    startedAt: isoOf(e.started_at),
    completedAt: e.completed_at ? isoOf(e.completed_at) : null,
    durationSeconds: e.duration_seconds,
    source: e.source,
    notes: e.notes,
    sessionRpe: e.session_rpe,
  };
}

function mapSetCompletionDTO(s: SetCompletion): PublicSetCompletionDTO {
  return {
    id: s.id,
    workoutExecutionId: s.workout_execution_id,
    exerciseInstanceId: s.exercise_instance_id,
    setNumber: s.set_number,
    actualReps: s.actual_reps,
    actualLoad: s.actual_load ? Number.parseFloat(s.actual_load) : null,
    actualTimeSeconds: s.actual_time_seconds,
    rpe: s.rpe,
    skipped: s.skipped,
    notes: s.notes,
    completedAt: isoOf(s.completed_at),
  };
}

function mapPRDTO(r: PersonalRecord) {
  return {
    id: r.id,
    userId: r.user_id,
    recordType: r.record_type,
    exerciseId: r.exercise_id,
    workoutType: r.workout_type,
    value: Number.parseFloat(r.value),
    unit: r.unit,
    workoutExecutionId: r.workout_execution_id,
    achievedAt: isoOf(r.achieved_at),
  };
}

function isoOf(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string') return new Date(value).toISOString();
  return new Date().toISOString();
}

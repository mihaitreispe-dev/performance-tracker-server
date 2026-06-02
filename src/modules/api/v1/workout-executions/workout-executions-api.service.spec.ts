import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Request } from 'express';

import {
  CoachAthleteStatus,
  Exercise,
  ExerciseInstance,
  ExerciseInstanceMode,
  ExerciseLevel,
  ExerciseStatus,
  ExerciseVisibility,
  SetCompletion,
  WorkoutExecution,
  WorkoutExecutionSource,
} from '../../../../database/interfaces';
import { AthletePrivacySettingsRepository } from '../../../../repositories/athlete-privacy-settings.repository';
import { CardioMetricsRepository } from '../../../../repositories/cardio-metrics.repository';
import { CoachAthleteRelationshipRepository } from '../../../../repositories/coach-athlete-relationship.repository';
import { ExecutionWeatherRepository } from '../../../../repositories/execution-weather.repository';
import { ExerciseRepository } from '../../../../repositories/exercise.repository';
import { ExerciseInstanceRepository } from '../../../../repositories/exercise-instance.repository';
import { RpeTssTrackingRepository } from '../../../../repositories/rpe-tss-tracking.repository';
import { SetCompletionRepository } from '../../../../repositories/set-completion.repository';
import { TrainingStressRepository } from '../../../../repositories/training-stress.repository';
import { WorkoutRepository } from '../../../../repositories/workout.repository';
import { WorkoutExecutionRepository } from '../../../../repositories/workout-execution.repository';
import { WorkoutRouteRepository } from '../../../../repositories/workout-route.repository';
import { WorkoutScheduleRepository } from '../../../../repositories/workout-schedule.repository';
import { AuthUser } from '../../../auth/types/authenticated-user';
import { WeatherService } from '../../../weather/weather.service';
import { PersonalRecordsDetectionService } from '../personal-records/personal-records-detection.service';
import { WorkoutExecutionsApiService } from './workout-executions-api.service';

const userId = 'user-1';
const executionId = 'exec-1';

const mockUser: AuthUser = { id: userId };
const reqFor = (id = userId): Request & { user: AuthUser } =>
  ({ user: { ...mockUser, id } }) as Request & { user: AuthUser };

const baseExecution = {
  id: executionId,
  user_id: userId,
  workout_schedule_id: null,
  started_at: new Date('2026-05-19T10:00:00Z'),
  completed_at: new Date('2026-05-19T10:45:00Z'),
  duration_seconds: 2700,
  source: WorkoutExecutionSource.MANUAL,
  external_id: null,
  notes: null,
  session_rpe: null,
  srpe_tss: null,
  rpe_collected_at: null,
  created_at: new Date('2026-05-19T10:00:00Z'),
  updated_at: new Date('2026-05-19T10:45:00Z'),
} as unknown as WorkoutExecution;

const makeCompletion = (overrides: Partial<SetCompletion> = {}): SetCompletion =>
  ({
    id: 'sc-' + Math.random().toString(36).slice(2),
    workout_execution_id: executionId,
    exercise_instance_id: 'inst-A',
    set_number: 1,
    actual_reps: 10,
    actual_load: '100',
    actual_time_seconds: null,
    rpe: 7,
    completed_at: new Date(),
    skipped: false,
    notes: null,
    created_at: new Date(),
    ...overrides,
  }) as unknown as SetCompletion;

const makeInstance = (id: string, exerciseId: string): ExerciseInstance =>
  ({
    id,
    exercise_id: exerciseId,
    mode: ExerciseInstanceMode.REPS,
    sets: 3,
    reps: 10,
    execution_time: null,
    load: '100',
    intensity: null,
    tempo: null,
    notes: null,
    created_at: new Date(),
    updated_at: new Date(),
  }) as unknown as ExerciseInstance;

const makeExercise = (id: string, name: string): Exercise =>
  ({
    id,
    organisation_id: 'org-1',
    name,
    description: null,
    cues: [],
    visibility: ExerciseVisibility.PRIVATE,
    user_id: userId,
    picture_s3_bucket: null,
    picture_s3_key: null,
    video_s3_bucket: null,
    video_s3_key: null,
    video_mime_type: null,
    category: null,
    level: ExerciseLevel.BEGINNER,
    status: ExerciseStatus.ASSETS_DONE,
    media_convert_job_id: null,
    intro_content_item_id: null,
    intro_start_seconds: null,
    intro_end_seconds: null,
    vimeo_video_id: null,
    created_at: new Date(),
    updated_at: new Date(),
  }) as unknown as Exercise;

describe('WorkoutExecutionsApiService.getSummary', () => {
  let service: WorkoutExecutionsApiService;
  let workoutExecutionRepo: jest.Mocked<WorkoutExecutionRepository>;
  let setCompletionRepo: jest.Mocked<SetCompletionRepository>;
  let exerciseInstanceRepo: jest.Mocked<ExerciseInstanceRepository>;
  let exerciseRepo: jest.Mocked<ExerciseRepository>;
  let relationshipRepo: jest.Mocked<CoachAthleteRelationshipRepository>;
  let privacyRepo: jest.Mocked<AthletePrivacySettingsRepository>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WorkoutExecutionsApiService,
        { provide: WorkoutExecutionRepository, useValue: { findById: jest.fn() } },
        { provide: SetCompletionRepository, useValue: { findMany: jest.fn() } },
        { provide: CardioMetricsRepository, useValue: {} },
        { provide: WorkoutRouteRepository, useValue: {} },
        { provide: WorkoutScheduleRepository, useValue: { findById: jest.fn() } },
        { provide: WorkoutRepository, useValue: { findById: jest.fn() } },
        { provide: PersonalRecordsDetectionService, useValue: {} },
        { provide: WeatherService, useValue: {} },
        { provide: ExecutionWeatherRepository, useValue: {} },
        {
          provide: CoachAthleteRelationshipRepository,
          useValue: { findActiveByCoachAndAthlete: jest.fn() },
        },
        {
          provide: AthletePrivacySettingsRepository,
          useValue: { findByUserId: jest.fn() },
        },
        { provide: RpeTssTrackingRepository, useValue: {} },
        { provide: TrainingStressRepository, useValue: {} },
        { provide: ExerciseInstanceRepository, useValue: { findByIds: jest.fn() } },
        { provide: ExerciseRepository, useValue: { findByIds: jest.fn() } },
      ],
    }).compile();

    service = module.get(WorkoutExecutionsApiService);
    workoutExecutionRepo = module.get(WorkoutExecutionRepository);
    setCompletionRepo = module.get(SetCompletionRepository);
    exerciseInstanceRepo = module.get(ExerciseInstanceRepository);
    exerciseRepo = module.get(ExerciseRepository);
    relationshipRepo = module.get(CoachAthleteRelationshipRepository);
    privacyRepo = module.get(AthletePrivacySettingsRepository);
  });

  it('throws NotFoundException when execution does not exist', async () => {
    workoutExecutionRepo.findById.mockResolvedValue(undefined as unknown as WorkoutExecution);
    await expect(service.getSummary(reqFor(), executionId)).rejects.toThrow(NotFoundException);
  });

  it('throws ForbiddenException when execution belongs to another user with no coach relationship', async () => {
    workoutExecutionRepo.findById.mockResolvedValue({ ...baseExecution, user_id: 'someone-else' });
    relationshipRepo.findActiveByCoachAndAthlete.mockResolvedValue(undefined as never);
    await expect(service.getSummary(reqFor(), executionId)).rejects.toThrow(ForbiddenException);
  });

  it('throws Forbidden when coach exists but athlete has not shared analytics', async () => {
    workoutExecutionRepo.findById.mockResolvedValue({ ...baseExecution, user_id: 'athlete-2' });
    relationshipRepo.findActiveByCoachAndAthlete.mockResolvedValue({
      id: 'rel-1',
      status: CoachAthleteStatus.ACTIVE,
    } as never);
    privacyRepo.findByUserId.mockResolvedValue({ share_analytics: false } as never);
    await expect(service.getSummary(reqFor(), executionId)).rejects.toThrow(ForbiddenException);
  });

  it('aggregates per-exercise volume, reps, time, and RPE across multiple completions', async () => {
    workoutExecutionRepo.findById.mockResolvedValue(baseExecution);
    setCompletionRepo.findMany.mockResolvedValue([
      makeCompletion({ exercise_instance_id: 'inst-A', set_number: 1, actual_reps: 10, actual_load: '100', rpe: 7 }),
      makeCompletion({ exercise_instance_id: 'inst-A', set_number: 2, actual_reps: 8, actual_load: '100', rpe: 8 }),
      makeCompletion({
        exercise_instance_id: 'inst-B',
        set_number: 1,
        actual_reps: null,
        actual_load: null,
        actual_time_seconds: 60,
        rpe: 6,
      }),
      makeCompletion({
        exercise_instance_id: 'inst-B',
        set_number: 2,
        actual_reps: null,
        actual_load: null,
        actual_time_seconds: 75,
        rpe: null,
      }),
    ]);
    exerciseInstanceRepo.findByIds.mockResolvedValue([
      makeInstance('inst-A', 'ex-1'),
      makeInstance('inst-B', 'ex-2'),
    ]);
    exerciseRepo.findByIds.mockResolvedValue([
      makeExercise('ex-1', 'Bench Press'),
      makeExercise('ex-2', 'Plank'),
    ]);

    const { data } = await service.getSummary(reqFor(), executionId);

    expect(data.setsCompleted).toBe(4);
    expect(data.setsSkipped).toBe(0);
    expect(data.exercisesCompleted).toBe(2);
    expect(data.completionRatio).toBe(1);
    // Avg RPE: (7+8+6) / 3 = 7
    expect(data.avgRpe).toBeCloseTo(7);
    // Volume from bench press: (10 + 8) * 100 = 1800. Plank had no load.
    expect(data.totalVolume).toBe(1800);

    const bench = data.perExercise.find((p) => p.exerciseName === 'Bench Press')!;
    expect(bench.setsCompleted).toBe(2);
    expect(bench.totalReps).toBe(18);
    expect(bench.totalVolume).toBe(1800);
    expect(bench.totalTimeSeconds).toBeNull();
    expect(bench.avgRpe).toBeCloseTo(7.5);

    const plank = data.perExercise.find((p) => p.exerciseName === 'Plank')!;
    expect(plank.setsCompleted).toBe(2);
    expect(plank.totalReps).toBeNull();
    expect(plank.totalTimeSeconds).toBe(135);
    expect(plank.totalVolume).toBeNull();
    expect(plank.avgRpe).toBeCloseTo(6);
  });

  it('counts skipped sets separately from completed', async () => {
    workoutExecutionRepo.findById.mockResolvedValue(baseExecution);
    setCompletionRepo.findMany.mockResolvedValue([
      makeCompletion({ set_number: 1, skipped: false }),
      makeCompletion({ set_number: 2, skipped: true, actual_reps: null, actual_load: null }),
      makeCompletion({ set_number: 3, skipped: true, actual_reps: null, actual_load: null }),
    ]);
    exerciseInstanceRepo.findByIds.mockResolvedValue([makeInstance('inst-A', 'ex-1')]);
    exerciseRepo.findByIds.mockResolvedValue([makeExercise('ex-1', 'Squat')]);

    const { data } = await service.getSummary(reqFor(), executionId);

    expect(data.setsCompleted).toBe(1);
    expect(data.setsSkipped).toBe(2);
    expect(data.perExercise[0].setsCompleted).toBe(1);
    expect(data.perExercise[0].setsSkipped).toBe(2);
    // setsPlanned falls back to completions.length (3); ratio is 1/3
    expect(data.completionRatio).toBeCloseTo(1 / 3);
  });

  it('returns an empty summary when there are no completions', async () => {
    workoutExecutionRepo.findById.mockResolvedValue(baseExecution);
    setCompletionRepo.findMany.mockResolvedValue([]);
    exerciseInstanceRepo.findByIds.mockResolvedValue([]);
    exerciseRepo.findByIds.mockResolvedValue([]);

    const { data } = await service.getSummary(reqFor(), executionId);

    expect(data.setsCompleted).toBe(0);
    expect(data.setsSkipped).toBe(0);
    expect(data.exercisesCompleted).toBe(0);
    expect(data.perExercise).toEqual([]);
    expect(data.avgRpe).toBeNull();
    expect(data.totalVolume).toBeNull();
    expect(data.completionRatio).toBe(0);
  });

  it('labels exercises as "Unknown exercise" when the exercise row is missing', async () => {
    workoutExecutionRepo.findById.mockResolvedValue(baseExecution);
    setCompletionRepo.findMany.mockResolvedValue([makeCompletion()]);
    exerciseInstanceRepo.findByIds.mockResolvedValue([makeInstance('inst-A', 'ex-missing')]);
    exerciseRepo.findByIds.mockResolvedValue([]);

    const { data } = await service.getSummary(reqFor(), executionId);
    expect(data.perExercise[0].exerciseName).toBe('Unknown exercise');
  });

  it('emits null totalVolume when no completion has both reps and load', async () => {
    workoutExecutionRepo.findById.mockResolvedValue(baseExecution);
    setCompletionRepo.findMany.mockResolvedValue([
      makeCompletion({ actual_reps: 10, actual_load: null }),
      makeCompletion({ actual_reps: null, actual_load: '50', actual_time_seconds: 30 }),
    ]);
    exerciseInstanceRepo.findByIds.mockResolvedValue([makeInstance('inst-A', 'ex-1')]);
    exerciseRepo.findByIds.mockResolvedValue([makeExercise('ex-1', 'Mobility')]);

    const { data } = await service.getSummary(reqFor(), executionId);
    expect(data.totalVolume).toBeNull();
  });
});

describe('WorkoutExecutionsApiService.update — finish idempotency (A3)', () => {
  let service: WorkoutExecutionsApiService;
  let workoutExecutionRepo: jest.Mocked<WorkoutExecutionRepository>;
  let workoutScheduleRepo: jest.Mocked<WorkoutScheduleRepository>;
  let workoutRepo: jest.Mocked<WorkoutRepository>;
  let prDetectionService: jest.Mocked<PersonalRecordsDetectionService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WorkoutExecutionsApiService,
        {
          provide: WorkoutExecutionRepository,
          useValue: { findById: jest.fn(), updateById: jest.fn() },
        },
        { provide: SetCompletionRepository, useValue: {} },
        { provide: CardioMetricsRepository, useValue: {} },
        { provide: WorkoutRouteRepository, useValue: { findByExecutionId: jest.fn() } },
        {
          provide: WorkoutScheduleRepository,
          useValue: { findById: jest.fn(), updateById: jest.fn() },
        },
        { provide: WorkoutRepository, useValue: { findById: jest.fn() } },
        {
          provide: PersonalRecordsDetectionService,
          useValue: { detectAndStorePRs: jest.fn().mockResolvedValue(undefined) },
        },
        { provide: WeatherService, useValue: {} },
        { provide: ExecutionWeatherRepository, useValue: {} },
        { provide: CoachAthleteRelationshipRepository, useValue: {} },
        { provide: AthletePrivacySettingsRepository, useValue: {} },
        { provide: RpeTssTrackingRepository, useValue: {} },
        { provide: TrainingStressRepository, useValue: {} },
        { provide: ExerciseInstanceRepository, useValue: {} },
        { provide: ExerciseRepository, useValue: {} },
      ],
    }).compile();

    service = module.get(WorkoutExecutionsApiService);
    workoutExecutionRepo = module.get(WorkoutExecutionRepository);
    workoutScheduleRepo = module.get(WorkoutScheduleRepository);
    workoutRepo = module.get(WorkoutRepository);
    prDetectionService = module.get(PersonalRecordsDetectionService);
  });

  // A double-tap on Finish or a multi-device race should fire the
  // completion side-effects (PR detection, schedule completion,
  // weather fetch) exactly once — the spec's F-06 contract.

  it('runs completion side-effects on the first finish', async () => {
    const pending = { ...baseExecution, completed_at: null, workout_schedule_id: 'sched-1' } as WorkoutExecution;
    workoutExecutionRepo.findById.mockResolvedValue(pending);
    workoutExecutionRepo.updateById.mockResolvedValue({
      ...pending,
      completed_at: new Date('2026-05-19T11:00:00Z'),
      duration_seconds: 3600,
    } as WorkoutExecution);
    workoutScheduleRepo.findById.mockResolvedValue({
      id: 'sched-1',
      workout_id: 'workout-1',
    } as never);
    workoutRepo.findById.mockResolvedValue(undefined as never);

    await service.update(reqFor(), executionId, {
      completedAt: '2026-05-19T11:00:00Z',
      durationSeconds: 3600,
    });

    // completed_at made it into the patch
    expect(workoutExecutionRepo.updateById).toHaveBeenCalledWith(
      executionId,
      expect.objectContaining({ completed_at: expect.any(Date), duration_seconds: 3600 }),
    );
    // schedule got marked finished
    expect(workoutScheduleRepo.updateById).toHaveBeenCalledWith(
      'sched-1',
      expect.objectContaining({ completed_at: expect.any(Date) }),
    );
    // PR detection fired
    expect(prDetectionService.detectAndStorePRs).toHaveBeenCalledWith(executionId, userId);
  });

  it('skips completion side-effects when execution is already finished (multi-device race)', async () => {
    const alreadyDone = {
      ...baseExecution,
      completed_at: new Date('2026-05-19T10:45:00Z'),
      workout_schedule_id: 'sched-1',
    } as WorkoutExecution;
    workoutExecutionRepo.findById.mockResolvedValue(alreadyDone);
    workoutRepo.findById.mockResolvedValue(undefined as never);

    await service.update(reqFor(), executionId, {
      completedAt: '2026-05-19T11:15:00Z',
      durationSeconds: 4500,
    });

    // No write to the execution row at all — completedAt + duration
    // were both rejected because alreadyFinished, and there are no
    // other patch fields in this body.
    expect(workoutExecutionRepo.updateById).not.toHaveBeenCalled();
    // No schedule write
    expect(workoutScheduleRepo.updateById).not.toHaveBeenCalled();
    // No PR re-detection
    expect(prDetectionService.detectAndStorePRs).not.toHaveBeenCalled();
  });

  it('still allows notes edit after finish (notes are not part of the completion snapshot)', async () => {
    const alreadyDone = {
      ...baseExecution,
      completed_at: new Date('2026-05-19T10:45:00Z'),
      workout_schedule_id: null,
    } as WorkoutExecution;
    workoutExecutionRepo.findById.mockResolvedValue(alreadyDone);
    workoutExecutionRepo.updateById.mockResolvedValue({
      ...alreadyDone,
      notes: 'felt great',
    } as WorkoutExecution);
    workoutRepo.findById.mockResolvedValue(undefined as never);

    await service.update(reqFor(), executionId, {
      // Important: caller may also re-send completedAt; we must drop
      // it from the patch but still process notes.
      completedAt: '2026-05-19T11:15:00Z',
      notes: 'felt great',
    });

    expect(workoutExecutionRepo.updateById).toHaveBeenCalledWith(
      executionId,
      // Only notes — no completed_at, no duration_seconds.
      { notes: 'felt great' },
    );
    expect(prDetectionService.detectAndStorePRs).not.toHaveBeenCalled();
  });
});

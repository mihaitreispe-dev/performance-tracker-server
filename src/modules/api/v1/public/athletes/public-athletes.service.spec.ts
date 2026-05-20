import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import {
  OrganisationMembership,
  OrganisationRole,
  SetCompletion,
  WorkoutExecution,
  WorkoutExecutionSource,
} from 'src/database/interfaces';
import { ExerciseRepository } from 'src/repositories/exercise.repository';
import { ExerciseInstanceRepository } from 'src/repositories/exercise-instance.repository';
import { OrganisationMembershipRepository } from 'src/repositories/organisation-membership.repository';
import { PersonalRecordRepository } from 'src/repositories/personal-record.repository';
import { SetCompletionRepository } from 'src/repositories/set-completion.repository';
import { WorkoutRepository } from 'src/repositories/workout.repository';
import { WorkoutExecutionRepository } from 'src/repositories/workout-execution.repository';
import { WorkoutScheduleRepository } from 'src/repositories/workout-schedule.repository';

import { PublicAthletesService } from './public-athletes.service';

const ORG = 'org-1';
const OTHER_ORG = 'org-other';
const USER = 'u-1';
const EXEC = 'exec-1';

const athleteMembership = (over: Partial<OrganisationMembership> = {}) =>
  ({
    id: 'm-1',
    organisation_id: ORG,
    user_id: USER,
    role: OrganisationRole.ATHLETE,
    ...over,
  }) as unknown as OrganisationMembership;

const inflightExecution = (over: Partial<WorkoutExecution> = {}) =>
  ({
    id: EXEC,
    user_id: USER,
    workout_schedule_id: null,
    started_at: new Date('2026-05-20T09:00:00Z'),
    completed_at: null,
    duration_seconds: null,
    source: WorkoutExecutionSource.MANUAL,
    notes: null,
    session_rpe: null,
    srpe_tss: null,
    rpe_collected_at: null,
    created_at: new Date(),
    updated_at: new Date(),
    ...over,
  }) as unknown as WorkoutExecution;

const completedExecution = (over: Partial<WorkoutExecution> = {}) =>
  inflightExecution({
    completed_at: new Date('2026-05-20T10:00:00Z'),
    duration_seconds: 3600,
    ...over,
  });

const makeSetRow = (over: Partial<SetCompletion> = {}): SetCompletion =>
  ({
    id: 'sc-1',
    workout_execution_id: EXEC,
    exercise_instance_id: 'inst-1',
    set_number: 1,
    actual_reps: 10,
    actual_load: '100',
    actual_time_seconds: null,
    rpe: 8,
    completed_at: new Date(),
    skipped: false,
    notes: null,
    created_at: new Date(),
    ...over,
  }) as unknown as SetCompletion;

describe('PublicAthletesService', () => {
  let service: PublicAthletesService;
  let memRepo: jest.Mocked<OrganisationMembershipRepository>;
  let scheduleRepo: jest.Mocked<WorkoutScheduleRepository>;
  let execRepo: jest.Mocked<WorkoutExecutionRepository>;
  let setRepo: jest.Mocked<SetCompletionRepository>;
  let prRepo: jest.Mocked<PersonalRecordRepository>;
  let workoutRepo: jest.Mocked<WorkoutRepository>;
  let instanceRepo: jest.Mocked<ExerciseInstanceRepository>;
  let exerciseRepo: jest.Mocked<ExerciseRepository>;

  beforeEach(async () => {
    const m: TestingModule = await Test.createTestingModule({
      providers: [
        PublicAthletesService,
        {
          provide: OrganisationMembershipRepository,
          useValue: { findByUserAndOrg: jest.fn() },
        },
        {
          provide: WorkoutScheduleRepository,
          useValue: { findById: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
        },
        {
          provide: WorkoutExecutionRepository,
          useValue: {
            findById: jest.fn(),
            findMany: jest.fn().mockResolvedValue([]),
            create: jest.fn(),
            updateById: jest.fn(),
          },
        },
        {
          provide: SetCompletionRepository,
          useValue: {
            findByExecutionAndSet: jest.fn(),
            findMany: jest.fn().mockResolvedValue([]),
            create: jest.fn(),
            updateById: jest.fn(),
          },
        },
        {
          provide: PersonalRecordRepository,
          useValue: { findMany: jest.fn().mockResolvedValue([]) },
        },
        {
          provide: WorkoutRepository,
          useValue: { findByIds: jest.fn().mockResolvedValue([]), findById: jest.fn() },
        },
        {
          provide: ExerciseInstanceRepository,
          useValue: { findByIds: jest.fn().mockResolvedValue([]) },
        },
        {
          provide: ExerciseRepository,
          useValue: { findByIds: jest.fn().mockResolvedValue([]) },
        },
      ],
    }).compile();

    service = m.get(PublicAthletesService);
    memRepo = m.get(OrganisationMembershipRepository);
    scheduleRepo = m.get(WorkoutScheduleRepository);
    execRepo = m.get(WorkoutExecutionRepository);
    setRepo = m.get(SetCompletionRepository);
    prRepo = m.get(PersonalRecordRepository);
    workoutRepo = m.get(WorkoutRepository);
    instanceRepo = m.get(ExerciseInstanceRepository);
    exerciseRepo = m.get(ExerciseRepository);
  });

  describe('tenant isolation', () => {
    it('listScheduledWorkouts 404s when the user is not in the org', async () => {
      memRepo.findByUserAndOrg.mockResolvedValue(undefined as never);
      await expect(
        service.listScheduledWorkouts(OTHER_ORG, USER, { offset: 0, limit: 50 }),
      ).rejects.toThrow(NotFoundException);
    });

    it('listScheduledWorkouts 404s when the user is in the org but role is not athlete', async () => {
      memRepo.findByUserAndOrg.mockResolvedValue(athleteMembership({ role: OrganisationRole.COACH }));
      await expect(
        service.listScheduledWorkouts(ORG, USER, { offset: 0, limit: 50 }),
      ).rejects.toThrow(NotFoundException);
    });

    it('startExecution rejects a schedule from a different org', async () => {
      memRepo.findByUserAndOrg.mockResolvedValue(athleteMembership());
      scheduleRepo.findById.mockResolvedValue({
        id: 'sch-1',
        organisation_id: OTHER_ORG,
        user_id: USER,
      } as never);
      await expect(
        service.startExecution(ORG, USER, { workoutScheduleId: 'sch-1' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('completeSet 404s when execution belongs to a user not in the org', async () => {
      execRepo.findById.mockResolvedValue(inflightExecution({ user_id: 'someone-else' }));
      memRepo.findByUserAndOrg.mockResolvedValue(undefined as never);
      await expect(
        service.completeSet(ORG, EXEC, { exerciseInstanceId: 'inst-1', setNumber: 1 }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('completeSet', () => {
    beforeEach(() => {
      execRepo.findById.mockResolvedValue(inflightExecution());
      memRepo.findByUserAndOrg.mockResolvedValue(athleteMembership());
    });

    it('creates a new row when no completion exists for (instance, setNumber)', async () => {
      setRepo.findByExecutionAndSet.mockResolvedValue(undefined as never);
      setRepo.create.mockResolvedValue(makeSetRow());
      const res = await service.completeSet(ORG, EXEC, {
        exerciseInstanceId: 'inst-1',
        setNumber: 1,
        actualReps: 10,
        actualLoad: 100,
        rpe: 8,
      });
      expect(setRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          workout_execution_id: EXEC,
          exercise_instance_id: 'inst-1',
          set_number: 1,
          actual_reps: 10,
          actual_load: '100',
        }),
      );
      expect(setRepo.updateById).not.toHaveBeenCalled();
      expect(res.data.id).toBe('sc-1');
    });

    it('updates an existing row (idempotent upsert)', async () => {
      setRepo.findByExecutionAndSet.mockResolvedValue(makeSetRow({ id: 'sc-prev', actual_reps: 8 }));
      setRepo.updateById.mockResolvedValue(makeSetRow({ id: 'sc-prev', actual_reps: 12 }));
      const res = await service.completeSet(ORG, EXEC, {
        exerciseInstanceId: 'inst-1',
        setNumber: 1,
        actualReps: 12,
      });
      expect(setRepo.updateById).toHaveBeenCalledWith(
        'sc-prev',
        expect.objectContaining({ actual_reps: 12 }),
      );
      expect(setRepo.create).not.toHaveBeenCalled();
      expect(res.data.actualReps).toBe(12);
    });

    it('rejects writes against a finished execution', async () => {
      execRepo.findById.mockResolvedValue(completedExecution());
      memRepo.findByUserAndOrg.mockResolvedValue(athleteMembership());
      await expect(
        service.completeSet(ORG, EXEC, { exerciseInstanceId: 'inst-1', setNumber: 1 }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('finishExecution', () => {
    it('writes completed_at + computed duration when not yet finished', async () => {
      execRepo.findById.mockResolvedValue(inflightExecution());
      memRepo.findByUserAndOrg.mockResolvedValue(athleteMembership());
      execRepo.updateById.mockResolvedValue(completedExecution());

      await service.finishExecution(ORG, EXEC, { completedAt: '2026-05-20T10:00:00Z' });

      expect(execRepo.updateById).toHaveBeenCalledWith(
        EXEC,
        expect.objectContaining({
          completed_at: new Date('2026-05-20T10:00:00Z'),
          duration_seconds: 3600,
        }),
      );
    });

    it('is idempotent — a second finish returns the existing completed row', async () => {
      const completed = completedExecution();
      execRepo.findById.mockResolvedValue(completed);
      memRepo.findByUserAndOrg.mockResolvedValue(athleteMembership());

      await service.finishExecution(ORG, EXEC, {});

      expect(execRepo.updateById).not.toHaveBeenCalled();
    });

    it('marks the execution as not belonging to an athlete role when the user is a coach', async () => {
      execRepo.findById.mockResolvedValue(inflightExecution());
      memRepo.findByUserAndOrg.mockResolvedValue(
        athleteMembership({ role: OrganisationRole.COACH }),
      );
      await expect(service.finishExecution(ORG, EXEC, {})).rejects.toThrow(ForbiddenException);
    });
  });

  describe('listPersonalRecords', () => {
    it('scopes by user, returns PRs', async () => {
      memRepo.findByUserAndOrg.mockResolvedValue(athleteMembership());
      prRepo.findMany.mockResolvedValue([
        {
          id: 'pr-1',
          user_id: USER,
          record_type: 'best_1rm',
          exercise_id: 'ex-1',
          workout_type: null,
          value: '120',
          unit: 'kg',
          workout_execution_id: 'exec-old',
          achieved_at: new Date('2026-05-01T00:00:00Z'),
          created_at: new Date(),
          updated_at: new Date(),
        } as never,
      ]);
      const out = await service.listPersonalRecords(ORG, USER);
      expect(prRepo.findMany).toHaveBeenCalledWith({ userId: USER });
      expect(out.data[0].value).toBe(120);
      expect(out.data[0].unit).toBe('kg');
    });
  });

  describe('getExecutionSummary', () => {
    it('aggregates completions into per-exercise + totals', async () => {
      execRepo.findById.mockResolvedValue(completedExecution());
      memRepo.findByUserAndOrg.mockResolvedValue(athleteMembership());
      setRepo.findMany.mockResolvedValue([
        makeSetRow({ id: 's1', exercise_instance_id: 'inst-A', set_number: 1, actual_reps: 10, actual_load: '100' }),
        makeSetRow({ id: 's2', exercise_instance_id: 'inst-A', set_number: 2, actual_reps: 8, actual_load: '100' }),
        makeSetRow({
          id: 's3',
          exercise_instance_id: 'inst-B',
          set_number: 1,
          actual_reps: null,
          actual_load: null,
          actual_time_seconds: 60,
        }),
      ]);
      instanceRepo.findByIds.mockResolvedValue([
        { id: 'inst-A', exercise_id: 'ex-A' } as never,
        { id: 'inst-B', exercise_id: 'ex-B' } as never,
      ]);
      exerciseRepo.findByIds.mockResolvedValue([
        { id: 'ex-A', name: 'Bench Press' } as never,
        { id: 'ex-B', name: 'Plank' } as never,
      ]);

      const { data } = await service.getExecutionSummary(ORG, EXEC);
      expect(data.setsCompleted).toBe(3);
      expect(data.exercisesCompleted).toBe(2);
      // Volume only from bench (reps × load), not from plank (time-based)
      expect(data.totalVolume).toBe(1800);
      const bench = data.perExercise.find((p: { exerciseName: string }) => p.exerciseName === 'Bench Press');
      expect(bench).toMatchObject({ totalReps: 18, totalVolume: 1800 });
    });
  });
});

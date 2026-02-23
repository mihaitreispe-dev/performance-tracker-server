import { Test, TestingModule } from '@nestjs/testing';
import { AnalyticsApiService } from './analytics-api.service';
import { CardioMetricsRepository } from '../../../../repositories/cardio-metrics.repository';
import { DailyTrainingLoadRepository } from '../../../../repositories/daily-training-load.repository';
import { ExecutionWeatherRepository } from '../../../../repositories/execution-weather.repository';
import { ExerciseRepository } from '../../../../repositories/exercise.repository';
import { ExerciseInstanceRepository } from '../../../../repositories/exercise-instance.repository';
import { MuscleGroupRepository } from '../../../../repositories/muscle-group.repository';
import { PersonalRecordRepository } from '../../../../repositories/personal-record.repository';
import { SetCompletionRepository } from '../../../../repositories/set-completion.repository';
import { UserSettingsRepository } from '../../../../repositories/user-settings.repository';
import { WorkoutRepository } from '../../../../repositories/workout.repository';
import { WorkoutExecutionRepository } from '../../../../repositories/workout-execution.repository';
import { WorkoutRouteRepository } from '../../../../repositories/workout-route.repository';
import { WorkoutScheduleRepository } from '../../../../repositories/workout-schedule.repository';
import { WorkoutExecutionSource, WorkoutType } from '../../../../database/interfaces';
import { AuthUser } from '../../../auth/types/authenticated-user';
import { Request } from 'express';

describe('AnalyticsApiService', () => {
  let service: AnalyticsApiService;
  let workoutExecutionRepository: jest.Mocked<WorkoutExecutionRepository>;
  let workoutScheduleRepository: jest.Mocked<WorkoutScheduleRepository>;
  let workoutRepository: jest.Mocked<WorkoutRepository>;

  const mockUser: AuthUser = {
    id: 'user-1',
    email: 'test@test.com',
    displayName: 'Test User',
    roles: [],
  };

  const createMockRequest = (): Request & { user: AuthUser } => {
    return { user: mockUser } as Request & { user: AuthUser };
  };

  beforeEach(async () => {
    const mockWorkoutExecutionRepo = {
      findMany: jest.fn(),
      findById: jest.fn(),
    };

    const mockWorkoutScheduleRepo = {
      findMany: jest.fn(),
      findById: jest.fn(),
    };

    const mockWorkoutRepo = {
      findById: jest.fn(),
      findByIds: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AnalyticsApiService,
        { provide: WorkoutExecutionRepository, useValue: mockWorkoutExecutionRepo },
        { provide: SetCompletionRepository, useValue: {} },
        { provide: CardioMetricsRepository, useValue: {} },
        { provide: WorkoutRouteRepository, useValue: {} },
        { provide: WorkoutScheduleRepository, useValue: mockWorkoutScheduleRepo },
        { provide: WorkoutRepository, useValue: mockWorkoutRepo },
        { provide: ExerciseInstanceRepository, useValue: {} },
        { provide: ExerciseRepository, useValue: {} },
        { provide: UserSettingsRepository, useValue: {} },
        { provide: MuscleGroupRepository, useValue: {} },
        { provide: DailyTrainingLoadRepository, useValue: {} },
        { provide: PersonalRecordRepository, useValue: {} },
        { provide: ExecutionWeatherRepository, useValue: {} },
      ],
    }).compile();

    service = module.get<AnalyticsApiService>(AnalyticsApiService);
    workoutExecutionRepository = module.get(WorkoutExecutionRepository);
    workoutScheduleRepository = module.get(WorkoutScheduleRepository);
    workoutRepository = module.get(WorkoutRepository);
  });

  describe('getStreak', () => {
    it('should return zero streak when no workouts exist', async () => {
      workoutExecutionRepository.findMany.mockResolvedValue([]);

      const result = await service.getStreak(createMockRequest());

      expect(result.data.currentStreakWeeks).toBe(0);
      expect(result.data.longestStreakWeeks).toBe(0);
      expect(result.data.totalWorkouts).toBe(0);
    });

    it('should count a week toward streak when it has 3+ workouts', async () => {
      // Create 3 workouts for last week
      const lastWeekMonday = getLastWeekMonday();
      const executions = [
        createMockExecution('exec-1', addDays(lastWeekMonday, 0)),
        createMockExecution('exec-2', addDays(lastWeekMonday, 2)),
        createMockExecution('exec-3', addDays(lastWeekMonday, 4)),
      ];

      workoutExecutionRepository.findMany.mockResolvedValue(executions);
      workoutScheduleRepository.findById.mockResolvedValue(null);

      const result = await service.getStreak(createMockRequest());

      expect(result.data.currentStreakWeeks).toBe(1);
      expect(result.data.totalWorkouts).toBe(3);
    });

    it('should not count a week with less than 3 workouts', async () => {
      // Create only 2 workouts for last week
      const lastWeekMonday = getLastWeekMonday();
      const executions = [
        createMockExecution('exec-1', addDays(lastWeekMonday, 0)),
        createMockExecution('exec-2', addDays(lastWeekMonday, 2)),
      ];

      workoutExecutionRepository.findMany.mockResolvedValue(executions);
      workoutScheduleRepository.findById.mockResolvedValue(null);

      const result = await service.getStreak(createMockRequest());

      expect(result.data.currentStreakWeeks).toBe(0);
      expect(result.data.totalWorkouts).toBe(2);
    });

    it('should calculate consecutive week streak correctly', async () => {
      // Create 3+ workouts for 3 consecutive weeks
      const lastWeekMonday = getLastWeekMonday();
      const twoWeeksAgoMonday = addDays(lastWeekMonday, -7);
      const threeWeeksAgoMonday = addDays(lastWeekMonday, -14);

      const executions = [
        // Three weeks ago - 3 workouts
        createMockExecution('exec-1', addDays(threeWeeksAgoMonday, 0)),
        createMockExecution('exec-2', addDays(threeWeeksAgoMonday, 2)),
        createMockExecution('exec-3', addDays(threeWeeksAgoMonday, 4)),
        // Two weeks ago - 3 workouts
        createMockExecution('exec-4', addDays(twoWeeksAgoMonday, 0)),
        createMockExecution('exec-5', addDays(twoWeeksAgoMonday, 2)),
        createMockExecution('exec-6', addDays(twoWeeksAgoMonday, 4)),
        // Last week - 3 workouts
        createMockExecution('exec-7', addDays(lastWeekMonday, 0)),
        createMockExecution('exec-8', addDays(lastWeekMonday, 2)),
        createMockExecution('exec-9', addDays(lastWeekMonday, 4)),
      ];

      workoutExecutionRepository.findMany.mockResolvedValue(executions);
      workoutScheduleRepository.findById.mockResolvedValue(null);

      const result = await service.getStreak(createMockRequest());

      expect(result.data.currentStreakWeeks).toBe(3);
      expect(result.data.longestStreakWeeks).toBe(3);
    });

    it('should break streak when a week has less than 3 workouts', async () => {
      const lastWeekMonday = getLastWeekMonday();
      const twoWeeksAgoMonday = addDays(lastWeekMonday, -7);
      const threeWeeksAgoMonday = addDays(lastWeekMonday, -14);

      const executions = [
        // Three weeks ago - 3 workouts (streak starts)
        createMockExecution('exec-1', addDays(threeWeeksAgoMonday, 0)),
        createMockExecution('exec-2', addDays(threeWeeksAgoMonday, 2)),
        createMockExecution('exec-3', addDays(threeWeeksAgoMonday, 4)),
        // Two weeks ago - only 2 workouts (streak breaks)
        createMockExecution('exec-4', addDays(twoWeeksAgoMonday, 0)),
        createMockExecution('exec-5', addDays(twoWeeksAgoMonday, 2)),
        // Last week - 3 workouts (new streak)
        createMockExecution('exec-6', addDays(lastWeekMonday, 0)),
        createMockExecution('exec-7', addDays(lastWeekMonday, 2)),
        createMockExecution('exec-8', addDays(lastWeekMonday, 4)),
      ];

      workoutExecutionRepository.findMany.mockResolvedValue(executions);
      workoutScheduleRepository.findById.mockResolvedValue(null);

      const result = await service.getStreak(createMockRequest());

      expect(result.data.currentStreakWeeks).toBe(1);
      // Longest streak was 1 week (not consecutive because of gap)
      expect(result.data.longestStreakWeeks).toBe(1);
    });

    it('should include current week in streak if it has 3+ workouts', async () => {
      const thisWeekMonday = getThisWeekMonday();
      const lastWeekMonday = addDays(thisWeekMonday, -7);

      const executions = [
        // Last week - 3 workouts
        createMockExecution('exec-1', addDays(lastWeekMonday, 0)),
        createMockExecution('exec-2', addDays(lastWeekMonday, 2)),
        createMockExecution('exec-3', addDays(lastWeekMonday, 4)),
        // This week - 3 workouts
        createMockExecution('exec-4', addDays(thisWeekMonday, 0)),
        createMockExecution('exec-5', addDays(thisWeekMonday, 1)),
        createMockExecution('exec-6', addDays(thisWeekMonday, 2)),
      ];

      workoutExecutionRepository.findMany.mockResolvedValue(executions);
      workoutScheduleRepository.findById.mockResolvedValue(null);

      const result = await service.getStreak(createMockRequest());

      expect(result.data.currentStreakWeeks).toBe(2);
      expect(result.data.currentWeekOnTrack).toBe(true);
      expect(result.data.workoutsNeededThisWeek).toBe(0);
    });

    it('should return correct weeks breakdown', async () => {
      workoutExecutionRepository.findMany.mockResolvedValue([]);

      const result = await service.getStreak(createMockRequest());

      // Should return 4 weeks of data
      expect(result.data.weeks).toHaveLength(4);

      // Each week should have 7 days
      for (const week of result.data.weeks) {
        expect(week.days).toHaveLength(7);
      }
    });
  });
});

// Helper functions
function createMockExecution(id: string, completedAt: Date) {
  return {
    id,
    user_id: 'user-1',
    workout_schedule_id: null,
    started_at: new Date(completedAt.getTime() - 3600000).toISOString(),
    completed_at: completedAt.toISOString(),
    duration_seconds: 3600,
    source: WorkoutExecutionSource.MANUAL,
    external_id: null,
    notes: null,
    created_at: completedAt.toISOString(),
    updated_at: completedAt.toISOString(),
  };
}

function getThisWeekMonday(): Date {
  const today = new Date();
  const dayOfWeek = today.getDay();
  const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const monday = new Date(today);
  monday.setDate(today.getDate() + diffToMonday);
  monday.setHours(0, 0, 0, 0);
  return monday;
}

function getLastWeekMonday(): Date {
  const thisWeekMonday = getThisWeekMonday();
  return addDays(thisWeekMonday, -7);
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

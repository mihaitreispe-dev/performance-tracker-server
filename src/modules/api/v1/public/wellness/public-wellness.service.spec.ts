import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import {
  BodyPart,
  BodyView,
  OrganisationMembership,
  OrganisationRole,
  PainTrend,
  WellnessCheckinSource,
} from 'src/database/interfaces';
import { AthleteProfileMetricsRepository } from 'src/repositories/athlete-profile-metrics.repository';
import { DailyNutritionSummaryRepository } from 'src/repositories/daily-nutrition-summary.repository';
import { OrganisationMembershipRepository } from 'src/repositories/organisation-membership.repository';
import { PainLogRepository } from 'src/repositories/pain-log.repository';
import { QuickWellnessCheckinRepository } from 'src/repositories/quick-wellness-checkin.repository';
import { RecoveryJournalRepository } from 'src/repositories/recovery-journal.repository';
import { SleepLogRepository } from 'src/repositories/sleep-log.repository';
import { UserNutritionGoalsRepository } from 'src/repositories/user-nutrition-goals.repository';
import { WorkoutExecutionRepository } from 'src/repositories/workout-execution.repository';

import { PublicWellnessService } from './public-wellness.service';

const ORG = 'org-1';
const USER = 'u-1';

const athleteMembership = (): OrganisationMembership =>
  ({ id: 'm-1', organisation_id: ORG, user_id: USER, role: OrganisationRole.ATHLETE }) as never;

describe('PublicWellnessService', () => {
  let service: PublicWellnessService;
  let memRepo: jest.Mocked<OrganisationMembershipRepository>;
  let profileRepo: jest.Mocked<AthleteProfileMetricsRepository>;
  let sleepRepo: jest.Mocked<SleepLogRepository>;
  let painRepo: jest.Mocked<PainLogRepository>;
  let recoveryRepo: jest.Mocked<RecoveryJournalRepository>;
  let checkinRepo: jest.Mocked<QuickWellnessCheckinRepository>;
  let nutritionRepo: jest.Mocked<DailyNutritionSummaryRepository>;
  let nutritionGoalsRepo: jest.Mocked<UserNutritionGoalsRepository>;
  let execRepo: jest.Mocked<WorkoutExecutionRepository>;

  beforeEach(async () => {
    const m: TestingModule = await Test.createTestingModule({
      providers: [
        PublicWellnessService,
        { provide: OrganisationMembershipRepository, useValue: { findByUserAndOrg: jest.fn() } },
        {
          provide: AthleteProfileMetricsRepository,
          useValue: { findByUserId: jest.fn(), upsert: jest.fn() },
        },
        {
          provide: SleepLogRepository,
          useValue: { create: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
        },
        {
          provide: PainLogRepository,
          useValue: { create: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
        },
        {
          provide: RecoveryJournalRepository,
          useValue: { upsert: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
        },
        {
          provide: QuickWellnessCheckinRepository,
          useValue: { upsert: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
        },
        {
          provide: DailyNutritionSummaryRepository,
          useValue: {
            upsert: jest.fn(),
            findByUserAndDateRange: jest.fn().mockResolvedValue([]),
          },
        },
        {
          provide: UserNutritionGoalsRepository,
          useValue: { findByUserId: jest.fn(), upsert: jest.fn() },
        },
        { provide: WorkoutExecutionRepository, useValue: { findById: jest.fn() } },
      ],
    }).compile();

    service = m.get(PublicWellnessService);
    memRepo = m.get(OrganisationMembershipRepository);
    profileRepo = m.get(AthleteProfileMetricsRepository);
    sleepRepo = m.get(SleepLogRepository);
    painRepo = m.get(PainLogRepository);
    recoveryRepo = m.get(RecoveryJournalRepository);
    checkinRepo = m.get(QuickWellnessCheckinRepository);
    nutritionRepo = m.get(DailyNutritionSummaryRepository);
    nutritionGoalsRepo = m.get(UserNutritionGoalsRepository);
    execRepo = m.get(WorkoutExecutionRepository);
  });

  describe('tenant isolation', () => {
    it('createSleepLog 404s when the user is not an athlete in the org', async () => {
      memRepo.findByUserAndOrg.mockResolvedValue(undefined as never);
      await expect(
        service.createSleepLog(ORG, USER, { logDate: '2026-05-20', totalDurationSeconds: 3600 }),
      ).rejects.toThrow(NotFoundException);
    });

    it('upsertRecovery 404s when the membership role is not athlete', async () => {
      memRepo.findByUserAndOrg.mockResolvedValue(
        { ...athleteMembership(), role: OrganisationRole.COACH },
      );
      await expect(
        service.upsertRecovery(ORG, USER, { entryDate: '2026-05-20' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('createPainLog 404s when the execution is missing', async () => {
      execRepo.findById.mockResolvedValue(undefined as never);
      await expect(
        service.createPainLog(ORG, 'exec-missing', {
          bodyPart: BodyPart.LEFT_KNEE,
          bodyView: BodyView.FRONT,
          painLevel: 4,
          painDurationStart: 0,
          painDurationEnd: 100,
          painTrend: PainTrend.CONSTANT,
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('createPainLog 404s when execution user is not in the org', async () => {
      execRepo.findById.mockResolvedValue({ id: 'exec-1', user_id: USER } as never);
      memRepo.findByUserAndOrg.mockResolvedValue(undefined as never);
      await expect(
        service.createPainLog(ORG, 'exec-1', {
          bodyPart: BodyPart.LEFT_KNEE,
          bodyView: BodyView.FRONT,
          painLevel: 4,
          painDurationStart: 0,
          painDurationEnd: 100,
          painTrend: PainTrend.CONSTANT,
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('upsert idempotency', () => {
    beforeEach(() => memRepo.findByUserAndOrg.mockResolvedValue(athleteMembership()));

    it('upsertRecovery forwards to repo.upsert', async () => {
      recoveryRepo.upsert.mockResolvedValue({
        id: 'r-1',
        user_id: USER,
        entry_date: new Date('2026-05-20'),
        sleep_quality_rating: 4,
        sleep_latency_minutes: null,
        sleep_disturbances: null,
        perceived_recovery: null,
        muscle_soreness: null,
        energy_level: null,
        mood: null,
        stress_level: null,
        motivation_level: null,
        caffeine_mg: null,
        caffeine_cutoff_time: null,
        alcohol_units: null,
        hydration_liters: null,
        meal_quality: null,
      } as never);
      const res = await service.upsertRecovery(ORG, USER, { entryDate: '2026-05-20', sleepQualityRating: 4 });
      expect(recoveryRepo.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ user_id: USER, sleep_quality_rating: 4 }),
      );
      expect(res.data.sleepQualityRating).toBe(4);
    });

    it('upsertWellnessCheckin maps to MANUAL source (no API enum value today)', async () => {
      checkinRepo.upsert.mockResolvedValue({
        id: 'c-1',
        user_id: USER,
        checkin_date: '2026-05-20',
        sleep_quality: 5,
        energy_level: null,
        muscle_soreness: null,
        stress_level: null,
        training_readiness: null,
        completion_seconds: null,
        source: WellnessCheckinSource.MANUAL,
        created_at: new Date(),
        updated_at: new Date(),
      } as never);
      await service.upsertWellnessCheckin(ORG, USER, { checkinDate: '2026-05-20', sleepQuality: 5 });
      expect(checkinRepo.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ source: WellnessCheckinSource.MANUAL }),
      );
    });

    it('upsertNutritionSummary fills missing macros with 0 defaults', async () => {
      nutritionRepo.upsert.mockResolvedValue({
        id: 'n-1',
        user_id: USER,
        date: '2026-05-20',
        total_calories: '2000',
        total_protein: '150',
        total_carbs: '0',
        total_fat: '0',
        total_fiber: '0',
        total_sugar: '0',
        total_sodium: '0',
      } as never);
      await service.upsertNutritionSummary(ORG, USER, {
        date: '2026-05-20',
        totalCalories: 2000,
        totalProtein: 150,
      });
      expect(nutritionRepo.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ total_calories: 2000, total_protein: 150, total_carbs: 0 }),
      );
    });

    it('upsertNutritionGoals normalises auto-calc flag and forwards weight-based inputs', async () => {
      nutritionGoalsRepo.upsert.mockResolvedValue({} as never);
      await service.upsertNutritionGoals(ORG, USER, {
        autoCalculateFromWeight: true,
        caloriesPerKg: 35,
        proteinGPerKg: 2,
      });
      expect(nutritionGoalsRepo.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          auto_calculate_from_weight: true,
          calories_per_kg: 35,
          protein_g_per_kg: 2,
        }),
      );
    });

    it('updateProfileMetrics forwards optional weight/height as raw numbers', async () => {
      profileRepo.upsert.mockResolvedValue({} as never);
      await service.updateProfileMetrics(ORG, USER, { weightKg: 82.5, heightCm: 178 });
      expect(profileRepo.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ weight_kg: 82.5, height_cm: 178 }),
      );
    });
  });

  describe('pain log in-memory date filtering', () => {
    it('filters pain logs by dateFrom/dateTo after fetching', async () => {
      memRepo.findByUserAndOrg.mockResolvedValue(athleteMembership());
      painRepo.findMany.mockResolvedValue([
        { id: 'p1', user_id: USER, created_at: new Date('2026-04-30T00:00:00Z') } as never,
        { id: 'p2', user_id: USER, created_at: new Date('2026-05-15T00:00:00Z') } as never,
        { id: 'p3', user_id: USER, created_at: new Date('2026-05-20T00:00:00Z') } as never,
      ]);
      const res = await service.listPainLogsForClient(ORG, USER, {
        dateFrom: '2026-05-01',
        dateTo: '2026-05-31',
        offset: 0,
        limit: 50,
      });
      expect(res.data).toHaveLength(2);
      expect(res.data.map((r) => r.id)).toEqual(['p2', 'p3']);
    });
  });
});

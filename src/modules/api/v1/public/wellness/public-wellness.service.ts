import { Injectable, NotFoundException } from '@nestjs/common';

import {
  DailyNutritionSummary,
  OrganisationRole,
  PainLog,
  QuickWellnessCheckin,
  RecoveryJournalEntry,
  SleepLog,
  UserNutritionGoals,
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

import {
  ListDateRangeQuery,
  PainLogBody,
  RecoveryJournalBody,
  SleepLogBody,
  UpdateProfileMetricsBody,
  UpsertNutritionGoalsBody,
  UpsertNutritionSummaryBody,
  WellnessCheckinBody,
} from './request.dto';
import {
  PublicNutritionGoalsResponse,
  PublicNutritionSummaryDTO,
  PublicNutritionSummaryListResponse,
  PublicNutritionSummaryResponse,
  PublicPainLogDTO,
  PublicPainLogListResponse,
  PublicPainLogResponse,
  PublicProfileMetricsDTO,
  PublicProfileMetricsResponse,
  PublicRecoveryEntryDTO,
  PublicRecoveryEntryListResponse,
  PublicRecoveryEntryResponse,
  PublicSleepLogDTO,
  PublicSleepLogListResponse,
  PublicSleepLogResponse,
  PublicWellnessCheckinDTO,
  PublicWellnessCheckinListResponse,
  PublicWellnessCheckinResponse,
} from './response.dto';

/**
 * Phase 6 — read/write surface for the wellness + recovery data an athlete logs
 * day-to-day. Six resource families, all user-owned, all gated by the API key's
 * org membership for the target client.
 *
 *   - Profile metrics — single-row per user (weight/height/etc.); PATCH-upsert.
 *   - Sleep logs       — per-night entries; POST creates, GET range.
 *   - Pain logs        — tied to a workout execution; POST inside an execution.
 *   - Recovery journal — one entry per (user, date); PUT upserts.
 *   - Wellness check-in — one entry per (user, date); PUT upserts.
 *   - Nutrition        — daily summary upsert + per-user goals upsert.
 *
 * Tenant boundary is identical to Phase 5: `findByUserAndOrg(userId, orgId)` with
 * role=athlete is the gate. For pain logs we additionally re-verify the execution
 * belongs to that user, mirroring the layered check Phase 5 already does for
 * execution-scoped writes.
 */
@Injectable()
export class PublicWellnessService {
  constructor(
    private readonly membershipRepo: OrganisationMembershipRepository,
    private readonly profileRepo: AthleteProfileMetricsRepository,
    private readonly sleepRepo: SleepLogRepository,
    private readonly painRepo: PainLogRepository,
    private readonly recoveryRepo: RecoveryJournalRepository,
    private readonly checkinRepo: QuickWellnessCheckinRepository,
    private readonly nutritionRepo: DailyNutritionSummaryRepository,
    private readonly nutritionGoalsRepo: UserNutritionGoalsRepository,
    private readonly executionRepo: WorkoutExecutionRepository,
  ) {}

  // ---- Profile metrics ----

  async getProfileMetrics(
    organisationId: string,
    userId: string,
  ): Promise<PublicProfileMetricsResponse> {
    await this.assertClientMembership(organisationId, userId);
    const row = await this.profileRepo.findByUserId(userId);
    return { data: mapProfileMetricsDTO(userId, row) };
  }

  async updateProfileMetrics(
    organisationId: string,
    userId: string,
    body: UpdateProfileMetricsBody,
  ): Promise<PublicProfileMetricsResponse> {
    await this.assertClientMembership(organisationId, userId);
    const row = await this.profileRepo.upsert({
      user_id: userId,
      birth_date: body.birthDate ?? null,
      gender: body.gender ?? null,
      weight_kg: body.weightKg ?? null,
      height_cm: body.heightCm ?? null,
      // Leave the rest untouched on upsert — the existing upsert path handles
      // null vs undefined correctly. Public callers shouldn't set training-load
      // internals via this endpoint.
    } as never);
    return { data: mapProfileMetricsDTO(userId, row) };
  }

  // ---- Sleep ----

  async createSleepLog(
    organisationId: string,
    userId: string,
    body: SleepLogBody,
  ): Promise<PublicSleepLogResponse> {
    await this.assertClientMembership(organisationId, userId);
    const row = await this.sleepRepo.create({
      user_id: userId,
      log_date: new Date(body.logDate),
      start_time: body.startTime ? new Date(body.startTime) : null,
      end_time: body.endTime ? new Date(body.endTime) : null,
      total_duration_seconds: body.totalDurationSeconds,
      avg_resting_hr: body.avgRestingHr ?? null,
      avg_hrv: body.avgHrv ?? null,
      source: 'manual',
    } as never);
    return { data: mapSleepDTO(row) };
  }

  async listSleepLogs(
    organisationId: string,
    userId: string,
    query: ListDateRangeQuery,
  ): Promise<PublicSleepLogListResponse> {
    await this.assertClientMembership(organisationId, userId);
    const rows = await this.sleepRepo.findMany({
      filter: {
        userId,
        startDate: query.dateFrom ? new Date(query.dateFrom) : undefined,
        endDate: query.dateTo ? new Date(query.dateTo) : undefined,
      },
      offset: query.offset ?? 0,
      limit: query.limit ?? 50,
    });
    return {
      data: rows.map(mapSleepDTO),
      meta: { totalCount: rows.length, offset: query.offset ?? 0, limit: query.limit ?? 50 },
    };
  }

  // ---- Pain ----

  async createPainLog(
    organisationId: string,
    executionId: string,
    body: PainLogBody,
  ): Promise<PublicPainLogResponse> {
    const execution = await this.executionRepo.findById(executionId);
    if (!execution) throw new NotFoundException('Workout execution not found');
    await this.assertClientMembership(organisationId, execution.user_id);

    const row = await this.painRepo.create({
      user_id: execution.user_id,
      workout_execution_id: executionId,
      body_part: body.bodyPart,
      body_view: body.bodyView,
      pain_level: body.painLevel,
      pain_duration_start: body.painDurationStart,
      pain_duration_end: body.painDurationEnd,
      pain_trend: body.painTrend,
      notes: body.notes ?? null,
      is_injury: body.isInjury ?? false,
      injury_type: body.injuryType ?? null,
      expected_recovery_days: body.expectedRecoveryDays ?? null,
    } as never);
    return { data: mapPainDTO(row) };
  }

  async listPainLogsForClient(
    organisationId: string,
    userId: string,
    query: ListDateRangeQuery,
  ): Promise<PublicPainLogListResponse> {
    await this.assertClientMembership(organisationId, userId);
    // PainLogFilter doesn't currently take a date range — that's a repo-level gap.
    // For the public surface we pull the user's pain logs and apply the date window
    // in-memory. Volume is small (pain logs are per-injury, not per-set), so this
    // is cheap; if it grows we'll teach the repo about date ranges.
    const allRows = await this.painRepo.findMany({
      filter: { userId },
      offset: query.offset ?? 0,
      limit: query.limit ?? 50,
    });
    const from = query.dateFrom ? new Date(query.dateFrom).getTime() : -Infinity;
    const to = query.dateTo ? new Date(query.dateTo).getTime() + 86_400_000 : Infinity;
    const rows = allRows.filter((r) => {
      const t = r.created_at instanceof Date ? r.created_at.getTime() : new Date(String(r.created_at)).getTime();
      return t >= from && t < to;
    });
    return {
      data: rows.map(mapPainDTO),
      meta: { totalCount: rows.length, offset: query.offset ?? 0, limit: query.limit ?? 50 },
    };
  }

  // ---- Recovery journal ----

  async upsertRecovery(
    organisationId: string,
    userId: string,
    body: RecoveryJournalBody,
  ): Promise<PublicRecoveryEntryResponse> {
    await this.assertClientMembership(organisationId, userId);
    const row = await this.recoveryRepo.upsert({
      user_id: userId,
      entry_date: new Date(body.entryDate),
      sleep_quality_rating: body.sleepQualityRating ?? null,
      sleep_latency_minutes: body.sleepLatencyMinutes ?? null,
      sleep_disturbances: body.sleepDisturbances ?? null,
      perceived_recovery: body.perceivedRecovery ?? null,
      muscle_soreness: body.muscleSoreness ?? null,
      energy_level: body.energyLevel ?? null,
      mood: body.mood ?? null,
      stress_level: body.stressLevel ?? null,
      motivation_level: body.motivationLevel ?? null,
      caffeine_mg: body.caffeineMg ?? null,
      caffeine_cutoff_time: body.caffeineCutoffTime ?? null,
      alcohol_units: body.alcoholUnits ?? null,
      hydration_liters: body.hydrationLiters ?? null,
      meal_quality: body.mealQuality ?? null,
    } as never);
    return { data: mapRecoveryDTO(row) };
  }

  async listRecovery(
    organisationId: string,
    userId: string,
    query: ListDateRangeQuery,
  ): Promise<PublicRecoveryEntryListResponse> {
    await this.assertClientMembership(organisationId, userId);
    const rows = await this.recoveryRepo.findMany({
      filter: {
        userId,
        dateFrom: query.dateFrom ? new Date(query.dateFrom) : undefined,
        dateTo: query.dateTo ? new Date(query.dateTo) : undefined,
      },
      offset: query.offset ?? 0,
      limit: query.limit ?? 50,
    });
    return {
      data: rows.map(mapRecoveryDTO),
      meta: { totalCount: rows.length, offset: query.offset ?? 0, limit: query.limit ?? 50 },
    };
  }

  // ---- Wellness check-ins ----

  async upsertWellnessCheckin(
    organisationId: string,
    userId: string,
    body: WellnessCheckinBody,
  ): Promise<PublicWellnessCheckinResponse> {
    await this.assertClientMembership(organisationId, userId);
    const row = await this.checkinRepo.upsert({
      user_id: userId,
      checkin_date: body.checkinDate,
      sleep_quality: body.sleepQuality ?? null,
      energy_level: body.energyLevel ?? null,
      muscle_soreness: body.muscleSoreness ?? null,
      stress_level: body.stressLevel ?? null,
      training_readiness: body.trainingReadiness ?? null,
      completion_seconds: body.completionSeconds ?? null,
      // No 'api' enum value exists today — surface as MANUAL (the canonical
       // user-provided band). A future migration can add WellnessCheckinSource.API
       // if we want to distinguish integrator-driven entries on the dashboards.
      source: WellnessCheckinSource.MANUAL as never,
    } as never);
    return { data: mapCheckinDTO(row) };
  }

  async listWellnessCheckins(
    organisationId: string,
    userId: string,
    query: ListDateRangeQuery,
  ): Promise<PublicWellnessCheckinListResponse> {
    await this.assertClientMembership(organisationId, userId);
    const rows = await this.checkinRepo.findMany({
      filter: {
        userId,
        dateFrom: query.dateFrom ? new Date(query.dateFrom) : undefined,
        dateTo: query.dateTo ? new Date(query.dateTo) : undefined,
      },
      offset: query.offset ?? 0,
      limit: query.limit ?? 50,
    });
    return {
      data: rows.map(mapCheckinDTO),
      meta: { totalCount: rows.length, offset: query.offset ?? 0, limit: query.limit ?? 50 },
    };
  }

  // ---- Nutrition ----

  async upsertNutritionSummary(
    organisationId: string,
    userId: string,
    body: UpsertNutritionSummaryBody,
  ): Promise<PublicNutritionSummaryResponse> {
    await this.assertClientMembership(organisationId, userId);
    const row = await this.nutritionRepo.upsert({
      user_id: userId,
      date: body.date,
      total_calories: body.totalCalories ?? 0,
      total_protein: body.totalProtein ?? 0,
      total_carbs: body.totalCarbs ?? 0,
      total_fat: body.totalFat ?? 0,
      total_fiber: body.totalFiber ?? 0,
      total_sugar: body.totalSugar ?? 0,
      total_sodium: body.totalSodium ?? 0,
    } as never);
    return { data: mapNutritionSummaryDTO(row) };
  }

  async listNutritionSummaries(
    organisationId: string,
    userId: string,
    query: ListDateRangeQuery,
  ): Promise<PublicNutritionSummaryListResponse> {
    await this.assertClientMembership(organisationId, userId);
    const from = query.dateFrom ? new Date(query.dateFrom) : new Date(Date.now() - 30 * 86_400_000);
    const to = query.dateTo ? new Date(query.dateTo) : new Date();
    const rows = await this.nutritionRepo.findByUserAndDateRange(userId, from, to);
    return {
      data: rows.map(mapNutritionSummaryDTO),
      meta: { totalCount: rows.length, offset: 0, limit: rows.length },
    };
  }

  async getNutritionGoals(
    organisationId: string,
    userId: string,
  ): Promise<PublicNutritionGoalsResponse> {
    await this.assertClientMembership(organisationId, userId);
    const row = await this.nutritionGoalsRepo.findByUserId(userId);
    return { data: mapNutritionGoalsDTO(userId, row) };
  }

  async upsertNutritionGoals(
    organisationId: string,
    userId: string,
    body: UpsertNutritionGoalsBody,
  ): Promise<PublicNutritionGoalsResponse> {
    await this.assertClientMembership(organisationId, userId);
    const row = await this.nutritionGoalsRepo.upsert({
      user_id: userId,
      daily_calories: body.dailyCalories ?? null,
      protein_g: body.proteinG ?? null,
      carbs_g: body.carbsG ?? null,
      fat_g: body.fatG ?? null,
      fiber_g: body.fiberG ?? null,
      protein_percent: body.proteinPercent ?? null,
      carbs_percent: body.carbsPercent ?? null,
      fat_percent: body.fatPercent ?? null,
      auto_calculate_from_weight: body.autoCalculateFromWeight ?? false,
      calories_per_kg: body.caloriesPerKg ?? null,
      protein_g_per_kg: body.proteinGPerKg ?? null,
    } as never);
    return { data: mapNutritionGoalsDTO(userId, row) };
  }

  // ---- helpers ----

  private async assertClientMembership(organisationId: string, userId: string): Promise<void> {
    const membership = await this.membershipRepo.findByUserAndOrg(userId, organisationId);
    if (!membership || membership.role !== OrganisationRole.ATHLETE) {
      throw new NotFoundException('Client not found in this organisation');
    }
  }
}

// ---- mappers ----

function mapProfileMetricsDTO(userId: string, row: unknown): PublicProfileMetricsDTO {
  const r = (row ?? {}) as Record<string, unknown>;
  return {
    userId,
    weightKg: r.weight_kg != null ? Number.parseFloat(String(r.weight_kg)) : null,
    heightCm: r.height_cm != null ? Number.parseFloat(String(r.height_cm)) : null,
    birthDate: r.birth_date ? isoOf(r.birth_date) : null,
    gender: (r.gender as string | null) ?? null,
    yearsTraining: (r.years_training as number | null) ?? null,
    weeklyVolumeHours:
      r.weekly_volume_hours != null ? Number.parseFloat(String(r.weekly_volume_hours)) : null,
  };
}

function mapSleepDTO(row: SleepLog): PublicSleepLogDTO {
  return {
    id: row.id,
    userId: row.user_id,
    logDate: ymdOf(row.log_date),
    startTime: row.start_time ? isoOf(row.start_time) : null,
    endTime: row.end_time ? isoOf(row.end_time) : null,
    totalDurationSeconds: row.total_duration_seconds,
    avgRestingHr: row.avg_resting_hr,
    avgHrv: row.avg_hrv,
    source: row.source,
  };
}

function mapPainDTO(row: PainLog): PublicPainLogDTO {
  return {
    id: row.id,
    userId: row.user_id,
    workoutExecutionId: row.workout_execution_id,
    bodyPart: row.body_part,
    bodyView: row.body_view,
    painLevel: row.pain_level,
    painDurationStart: row.pain_duration_start,
    painDurationEnd: row.pain_duration_end,
    painTrend: row.pain_trend,
    notes: row.notes,
    isInjury: row.is_injury,
    injuryType: row.injury_type ?? null,
    expectedRecoveryDays: row.expected_recovery_days,
    createdAt: isoOf(row.created_at),
  };
}

function mapRecoveryDTO(row: RecoveryJournalEntry): PublicRecoveryEntryDTO {
  return {
    id: row.id,
    userId: row.user_id,
    entryDate: ymdOf(row.entry_date),
    sleepQualityRating: row.sleep_quality_rating ?? null,
    sleepLatencyMinutes: row.sleep_latency_minutes ?? null,
    sleepDisturbances: row.sleep_disturbances ?? null,
    perceivedRecovery: row.perceived_recovery ?? null,
    muscleSoreness: row.muscle_soreness ?? null,
    energyLevel: row.energy_level ?? null,
    mood: row.mood ?? null,
    stressLevel: row.stress_level ?? null,
    motivationLevel: row.motivation_level ?? null,
    caffeineMg: row.caffeine_mg ?? null,
    caffeineCutoffTime: row.caffeine_cutoff_time ?? null,
    alcoholUnits: row.alcohol_units != null ? Number.parseFloat(String(row.alcohol_units)) : null,
    hydrationLiters:
      row.hydration_liters != null ? Number.parseFloat(String(row.hydration_liters)) : null,
    mealQuality: row.meal_quality ?? null,
  };
}

function mapCheckinDTO(row: QuickWellnessCheckin): PublicWellnessCheckinDTO {
  return {
    id: row.id,
    userId: row.user_id,
    checkinDate: ymdOf(row.checkin_date),
    sleepQuality: row.sleep_quality,
    energyLevel: row.energy_level,
    muscleSoreness: row.muscle_soreness,
    stressLevel: row.stress_level,
    trainingReadiness: row.training_readiness,
    completionSeconds: row.completion_seconds,
    source: row.source,
  };
}

function mapNutritionSummaryDTO(row: DailyNutritionSummary): PublicNutritionSummaryDTO {
  return {
    id: row.id,
    userId: row.user_id,
    date: ymdOf(row.date),
    totalCalories: Number.parseFloat(String(row.total_calories)),
    totalProtein: Number.parseFloat(String(row.total_protein)),
    totalCarbs: Number.parseFloat(String(row.total_carbs)),
    totalFat: Number.parseFloat(String(row.total_fat)),
    totalFiber: Number.parseFloat(String(row.total_fiber)),
    totalSugar: Number.parseFloat(String(row.total_sugar)),
    totalSodium: Number.parseFloat(String(row.total_sodium)),
  };
}

function mapNutritionGoalsDTO(userId: string, row: UserNutritionGoals | undefined) {
  if (!row) {
    return {
      userId,
      dailyCalories: null,
      proteinG: null,
      carbsG: null,
      fatG: null,
      fiberG: null,
      proteinPercent: null,
      carbsPercent: null,
      fatPercent: null,
      autoCalculateFromWeight: false,
      caloriesPerKg: null,
      proteinGPerKg: null,
    };
  }
  const numOrNull = (v: unknown) => (v == null ? null : Number.parseFloat(String(v)));
  return {
    userId,
    dailyCalories: numOrNull(row.daily_calories),
    proteinG: numOrNull(row.protein_g),
    carbsG: numOrNull(row.carbs_g),
    fatG: numOrNull(row.fat_g),
    fiberG: numOrNull(row.fiber_g),
    proteinPercent: numOrNull(row.protein_percent),
    carbsPercent: numOrNull(row.carbs_percent),
    fatPercent: numOrNull(row.fat_percent),
    autoCalculateFromWeight: !!row.auto_calculate_from_weight,
    caloriesPerKg: numOrNull(row.calories_per_kg),
    proteinGPerKg: numOrNull(row.protein_g_per_kg),
  };
}

function isoOf(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string') return new Date(value).toISOString();
  return new Date().toISOString();
}

/** Render a value as YYYY-MM-DD. Tolerates Date, ISO string, or YYYY-MM-DD string. */
function ymdOf(value: unknown): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === 'string') return value.length >= 10 ? value.slice(0, 10) : value;
  return new Date().toISOString().slice(0, 10);
}

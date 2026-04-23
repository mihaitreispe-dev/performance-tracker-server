import { Injectable, NotFoundException } from '@nestjs/common';
import { type Request } from 'express';
import { PersonalRecord, PersonalRecordHistory, PersonalRecordType, WorkoutType } from 'src/database/interfaces';
import { AuthUser } from 'src/modules/auth/types/authenticated-user';
import { ExerciseRepository } from 'src/repositories/exercise.repository';
import { PersonalRecordRepository } from 'src/repositories/personal-record.repository';

import {
  ListPersonalRecordsQuery,
  PeriodComparisonQuery,
  PREvolutionQuery,
  PRHistoryQuery,
  RecentPRsQuery,
} from './request.dto';
import {
  ExercisePRsDTO,
  ExercisePRsResponse,
  PeriodComparisonDTO,
  PeriodComparisonResponse,
  PeriodPRSummaryDTO,
  PersonalRecordDTO,
  PersonalRecordListResponse,
  PREvolutionDTO,
  PREvolutionPointDTO,
  PREvolutionResponse,
  PRHistoryDTO,
  PRHistoryRecordDTO,
  PRHistoryResponse,
  RecentPRDTO,
  RecentPRsResponse,
} from './response.dto';

@Injectable()
export class PersonalRecordsApiService {
  constructor(
    private readonly personalRecordRepository: PersonalRecordRepository,
    private readonly exerciseRepository: ExerciseRepository,
  ) {}

  async list(req: Request & { user: AuthUser }, query: ListPersonalRecordsQuery): Promise<PersonalRecordListResponse> {
    const records = await this.personalRecordRepository.findMany({
      userId: req.user.id,
      category: query.category as 'strength' | 'cardio_distance' | 'cardio_other' | undefined,
      exerciseId: query.exerciseId,
      workoutType: query.workoutType,
    });

    // Get exercise names for strength PRs
    const exerciseIds = [...new Set(records.filter((r) => r.exercise_id).map((r) => r.exercise_id!))];
    const exerciseNames = await this.getExerciseNames(exerciseIds);

    const recordDTOs = records.map((r) => this.mapToDTO(r, exerciseNames.get(r.exercise_id ?? '')));

    return { data: { records: recordDTOs } };
  }

  async getStrengthPRsForExercise(req: Request & { user: AuthUser }, exerciseId: string): Promise<ExercisePRsResponse> {
    const exercise = await this.exerciseRepository.findById(exerciseId);
    if (!exercise) {
      throw new NotFoundException('Exercise not found');
    }

    const records = await this.personalRecordRepository.findForExercise(req.user.id, exerciseId);

    const maxWeight = records.find((r) => r.record_type === PersonalRecordType.MAX_WEIGHT);
    const maxReps = records.find((r) => r.record_type === PersonalRecordType.MAX_REPS);
    const maxVolumeSet = records.find((r) => r.record_type === PersonalRecordType.MAX_VOLUME_SET);

    const data: ExercisePRsDTO = {
      exerciseId,
      exerciseName: exercise.name,
      maxWeight: maxWeight ? this.mapToDTO(maxWeight, exercise.name) : null,
      maxReps: maxReps ? this.mapToDTO(maxReps, exercise.name) : null,
      maxVolumeSet: maxVolumeSet ? this.mapToDTO(maxVolumeSet, exercise.name) : null,
    };

    return { data };
  }

  async getEvolution(req: Request & { user: AuthUser }, query: PREvolutionQuery): Promise<PREvolutionResponse> {
    const days = query.days ?? 365;
    const dateFrom = new Date();
    dateFrom.setDate(dateFrom.getDate() - days);

    const history = await this.personalRecordRepository.findHistory({
      userId: req.user.id,
      recordType: query.recordType,
      exerciseId: query.exerciseId,
      dateFrom,
    });

    // Get current best (pass null for workoutType to get any sport)
    const currentBest = await this.personalRecordRepository.findByUserTypeExerciseAndWorkoutType(
      req.user.id,
      query.recordType,
      query.exerciseId ?? null,
      null, // workoutType - null to find any
    );

    let exerciseName: string | null = null;
    if (query.exerciseId) {
      const exercise = await this.exerciseRepository.findById(query.exerciseId);
      exerciseName = exercise?.name ?? null;
    }

    const unit = history.length > 0 ? history[0].unit : (currentBest?.unit ?? this.getDefaultUnit(query.recordType));

    const historyPoints: PREvolutionPointDTO[] = history.map((h) => ({
      value: Number.parseFloat(h.value),
      formattedValue: this.formatValue(Number.parseFloat(h.value), h.unit, query.recordType),
      achievedAt: h.achieved_at instanceof Date ? h.achieved_at.toISOString() : String(h.achieved_at),
      workoutExecutionId: h.workout_execution_id,
    }));

    const data: PREvolutionDTO = {
      recordType: query.recordType,
      exerciseId: query.exerciseId ?? null,
      exerciseName,
      unit,
      history: historyPoints,
      currentBest: currentBest ? this.mapToDTO(currentBest, exerciseName) : null,
    };

    return { data };
  }

  async getPeriodComparison(
    req: Request & { user: AuthUser },
    query: PeriodComparisonQuery,
  ): Promise<PeriodComparisonResponse> {
    const result = await this.personalRecordRepository.getPeriodComparison({
      userId: req.user.id,
      period1Start: new Date(query.period1Start),
      period1End: new Date(query.period1End),
      period2Start: new Date(query.period2Start),
      period2End: new Date(query.period2End),
    });

    // Get exercise names
    const allPRs = [...result.period1PRs, ...result.period2PRs];
    const exerciseIds = [...new Set(allPRs.filter((p) => p.exercise_id).map((p) => p.exercise_id!))];
    const exerciseNames = await this.getExerciseNames(exerciseIds);

    const period1: PeriodPRSummaryDTO = {
      periodStart: query.period1Start,
      periodEnd: query.period1End,
      prCount: result.period1Count,
      prs: result.period1PRs.map((p) => this.mapHistoryToDTO(p, exerciseNames.get(p.exercise_id ?? ''))),
    };

    const period2: PeriodPRSummaryDTO = {
      periodStart: query.period2Start,
      periodEnd: query.period2End,
      prCount: result.period2Count,
      prs: result.period2PRs.map((p) => this.mapHistoryToDTO(p, exerciseNames.get(p.exercise_id ?? ''))),
    };

    const changePercentage =
      result.period2Count > 0
        ? ((result.period1Count - result.period2Count) / result.period2Count) * 100
        : result.period1Count > 0
          ? 100
          : 0;

    const data: PeriodComparisonDTO = {
      period1,
      period2,
      changePercentage: Math.round(changePercentage * 10) / 10,
    };

    return { data };
  }

  async getRecentPRs(req: Request & { user: AuthUser }, query: RecentPRsQuery): Promise<RecentPRsResponse> {
    const days = query.days ?? 7;
    const recentHistory = await this.personalRecordRepository.findRecentPRs({
      userId: req.user.id,
      days,
    });

    // Get exercise names
    const exerciseIds = [...new Set(recentHistory.filter((p) => p.exercise_id).map((p) => p.exercise_id!))];
    const exerciseNames = await this.getExerciseNames(exerciseIds);

    // For each recent PR, calculate improvement
    const recentPRs: RecentPRDTO[] = [];

    for (const pr of recentHistory) {
      // Find previous PR in history
      const allHistory = await this.personalRecordRepository.findHistory({
        userId: req.user.id,
        recordType: pr.record_type,
        exerciseId: pr.exercise_id ?? undefined,
        dateTo: new Date(pr.achieved_at.getTime() - 1), // Before this PR
      });

      const previousPR = allHistory.length > 0 ? allHistory[allHistory.length - 1] : null;
      const value = Number.parseFloat(pr.value);
      const previousValue = previousPR ? Number.parseFloat(previousPR.value) : null;

      let improvement: number | null = null;
      let improvementPercentage: number | null = null;

      if (previousValue !== null) {
        improvement = value - previousValue;
        improvementPercentage = (improvement / previousValue) * 100;

        // For time-based PRs, improvement is negative (faster)
        // We want to show it as positive improvement
        if (this.isTimeBased(pr.record_type)) {
          improvement = -improvement;
          improvementPercentage = -improvementPercentage;
        }
      }

      recentPRs.push({
        id: pr.id,
        recordType: pr.record_type,
        exerciseId: pr.exercise_id,
        exerciseName: exerciseNames.get(pr.exercise_id ?? '') ?? null,
        workoutType: pr.workout_type ?? null,
        value,
        unit: pr.unit,
        formattedValue: this.formatValue(value, pr.unit, pr.record_type),
        achievedAt: pr.achieved_at instanceof Date ? pr.achieved_at.toISOString() : String(pr.achieved_at),
        improvement: improvement !== null ? Math.round(improvement * 100) / 100 : null,
        improvementPercentage: improvementPercentage !== null ? Math.round(improvementPercentage * 10) / 10 : null,
      });
    }

    return {
      data: {
        recentPRs,
        totalCount: recentPRs.length,
      },
    };
  }

  async getHistory(req: Request & { user: AuthUser }, query: PRHistoryQuery): Promise<PRHistoryResponse> {
    const workoutType = query.workoutType as WorkoutType | undefined;

    // Get all historical records sorted by value (best first)
    const history = await this.personalRecordRepository.findAllHistory({
      userId: req.user.id,
      recordType: query.recordType,
      exerciseId: query.exerciseId,
      workoutType,
    });

    let exerciseName: string | null = null;
    if (query.exerciseId) {
      const exercise = await this.exerciseRepository.findById(query.exerciseId);
      exerciseName = exercise?.name ?? null;
    }

    const unit = history.length > 0 ? history[0].unit : this.getDefaultUnit(query.recordType);

    // Map history records with rank and isCurrent flag
    // The first record in the sorted list is the best value, so it's the current best
    const records: PRHistoryRecordDTO[] = history.map((h, index) => ({
      id: h.id,
      recordType: h.record_type,
      exerciseId: h.exercise_id,
      exerciseName,
      workoutType: h.workout_type ?? null,
      value: Number.parseFloat(h.value),
      unit: h.unit,
      formattedValue: this.formatValue(Number.parseFloat(h.value), h.unit, h.record_type),
      workoutExecutionId: h.workout_execution_id,
      achievedAt: h.achieved_at instanceof Date ? h.achieved_at.toISOString() : String(h.achieved_at),
      isCurrent: index === 0, // First record in sorted list is always the best
      rank: index + 1,
    }));

    const data: PRHistoryDTO = {
      recordType: query.recordType,
      exerciseId: query.exerciseId ?? null,
      exerciseName,
      unit,
      records,
      totalCount: records.length,
    };

    return { data };
  }

  // Helper methods

  private async getExerciseNames(exerciseIds: string[]): Promise<Map<string, string>> {
    const names = new Map<string, string>();
    if (exerciseIds.length === 0) return names;

    const exercises = await Promise.all(exerciseIds.map((id) => this.exerciseRepository.findById(id)));
    for (const exercise of exercises) {
      if (exercise) {
        names.set(exercise.id, exercise.name);
      }
    }
    return names;
  }

  private mapToDTO(record: PersonalRecord, exerciseName?: string | null): PersonalRecordDTO {
    const value = Number.parseFloat(record.value);
    return {
      id: record.id,
      recordType: record.record_type,
      exerciseId: record.exercise_id,
      exerciseName: exerciseName ?? null,
      workoutType: record.workout_type ?? null,
      value,
      unit: record.unit,
      formattedValue: this.formatValue(value, record.unit, record.record_type),
      workoutExecutionId: record.workout_execution_id,
      achievedAt: record.achieved_at instanceof Date ? record.achieved_at.toISOString() : String(record.achieved_at),
      createdAt: record.created_at instanceof Date ? record.created_at.toISOString() : String(record.created_at),
      updatedAt: record.updated_at instanceof Date ? record.updated_at.toISOString() : String(record.updated_at),
    };
  }

  private mapHistoryToDTO(record: PersonalRecordHistory, exerciseName?: string | null): PersonalRecordDTO {
    const value = Number.parseFloat(record.value);
    return {
      id: record.id,
      recordType: record.record_type,
      exerciseId: record.exercise_id,
      exerciseName: exerciseName ?? null,
      workoutType: record.workout_type ?? null,
      value,
      unit: record.unit,
      formattedValue: this.formatValue(value, record.unit, record.record_type),
      workoutExecutionId: record.workout_execution_id,
      achievedAt: record.achieved_at instanceof Date ? record.achieved_at.toISOString() : String(record.achieved_at),
      createdAt: record.created_at instanceof Date ? record.created_at.toISOString() : String(record.created_at),
      updatedAt: record.created_at instanceof Date ? record.created_at.toISOString() : String(record.created_at),
    };
  }

  private formatValue(value: number, unit: string, _recordType: PersonalRecordType): string {
    if (unit === 'seconds') {
      return this.formatTime(value);
    }
    if (unit === 'meters' && value >= 1000) {
      return `${(value / 1000).toFixed(2)} km`;
    }
    if (unit === 'kg') {
      return `${value} kg`;
    }
    if (unit === 'reps') {
      return `${value} reps`;
    }
    return `${value} ${unit}`;
  }

  private formatTime(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  }

  private getDefaultUnit(recordType: PersonalRecordType): string {
    switch (recordType) {
      case PersonalRecordType.MAX_WEIGHT:
      case PersonalRecordType.MAX_VOLUME_SET:
        return 'kg';
      case PersonalRecordType.MAX_REPS:
        return 'reps';
      case PersonalRecordType.FASTEST_1K:
      case PersonalRecordType.FASTEST_5K:
      case PersonalRecordType.FASTEST_10K:
      case PersonalRecordType.FASTEST_HALF_MARATHON:
      case PersonalRecordType.FASTEST_MARATHON:
      case PersonalRecordType.FASTEST_KM_SPLIT:
      case PersonalRecordType.FASTEST_MILE_SPLIT:
      case PersonalRecordType.LONGEST_DURATION:
        return 'seconds';
      case PersonalRecordType.LONGEST_DISTANCE:
      case PersonalRecordType.MAX_ELEVATION_GAIN:
        return 'meters';
      default:
        return '';
    }
  }

  private isTimeBased(recordType: PersonalRecordType): boolean {
    return [
      PersonalRecordType.FASTEST_1K,
      PersonalRecordType.FASTEST_5K,
      PersonalRecordType.FASTEST_10K,
      PersonalRecordType.FASTEST_HALF_MARATHON,
      PersonalRecordType.FASTEST_MARATHON,
      PersonalRecordType.FASTEST_KM_SPLIT,
      PersonalRecordType.FASTEST_MILE_SPLIT,
    ].includes(recordType);
  }
}

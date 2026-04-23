import { Injectable, NotFoundException } from '@nestjs/common';
import { type Request } from 'express';
import { IllnessLog, QuickWellnessCheckin, WellnessCheckinSource } from 'src/database/interfaces';
import { formatDateToYMD } from 'src/lib/util';
import { AuthUser } from 'src/modules/auth/types/authenticated-user';
import { IllnessLogRepository } from 'src/repositories/illness-log.repository';
import { QuickWellnessCheckinRepository } from 'src/repositories/quick-wellness-checkin.repository';

import {
  CreateQuickWellnessCheckinBody,
  IllnessLogBody,
  ListIllnessLogsQuery,
  UpdateIllnessLogBody,
  UpdateQuickWellnessCheckinBody,
  WellnessCheckinHistoryQuery,
} from './request.dto';
import {
  IllnessLogDTO,
  IllnessLogListResponse,
  IllnessLogResponse,
  QuickWellnessCheckinDTO,
  QuickWellnessCheckinListResponse,
  QuickWellnessCheckinResponse,
  WellnessAveragesDTO,
  WellnessAveragesResponse,
  WellnessTrendDTO,
  WellnessTrendResponse,
} from './response.dto';

@Injectable()
export class WellnessService {
  constructor(
    private readonly quickWellnessCheckinRepository: QuickWellnessCheckinRepository,
    private readonly illnessLogRepository: IllnessLogRepository,
  ) {}

  /**
   * Create a new quick wellness check-in
   */
  async createCheckin(
    req: Request & { user: AuthUser },
    body: CreateQuickWellnessCheckinBody,
  ): Promise<QuickWellnessCheckinResponse> {
    const checkin = await this.quickWellnessCheckinRepository.upsert({
      user_id: req.user.id,
      checkin_date: body.checkinDate,
      sleep_quality: body.sleepQuality ?? null,
      energy_level: body.energyLevel ?? null,
      muscle_soreness: body.muscleSoreness ?? null,
      stress_level: body.stressLevel ?? null,
      training_readiness: body.trainingReadiness ?? null,
      completion_seconds: body.completionSeconds ?? null,
      source: body.source ?? WellnessCheckinSource.MANUAL,
    });

    return { data: this.mapToDTO(checkin) };
  }

  /**
   * Get check-in for a specific date
   */
  async getByDate(req: Request & { user: AuthUser }, date: string): Promise<QuickWellnessCheckinResponse> {
    const checkin = await this.quickWellnessCheckinRepository.findByUserAndDate(req.user.id, new Date(date));

    if (!checkin) {
      throw new NotFoundException('No check-in found for this date');
    }

    return { data: this.mapToDTO(checkin) };
  }

  /**
   * Get today's check-in
   */
  async getToday(req: Request & { user: AuthUser }): Promise<QuickWellnessCheckinResponse> {
    const today = new Date();
    const checkin = await this.quickWellnessCheckinRepository.findByUserAndDate(req.user.id, today);

    if (!checkin) {
      throw new NotFoundException('No check-in found for today');
    }

    return { data: this.mapToDTO(checkin) };
  }

  /**
   * Update an existing check-in
   */
  async updateCheckin(
    req: Request & { user: AuthUser },
    id: string,
    body: UpdateQuickWellnessCheckinBody,
  ): Promise<QuickWellnessCheckinResponse> {
    const existing = await this.quickWellnessCheckinRepository.findById(id);

    if (!existing) {
      throw new NotFoundException('Check-in not found');
    }

    if (existing.user_id !== req.user.id) {
      throw new NotFoundException('Check-in not found');
    }

    const updated = await this.quickWellnessCheckinRepository.updateById(id, {
      sleep_quality: body.sleepQuality ?? existing.sleep_quality,
      energy_level: body.energyLevel ?? existing.energy_level,
      muscle_soreness: body.muscleSoreness ?? existing.muscle_soreness,
      stress_level: body.stressLevel ?? existing.stress_level,
      training_readiness: body.trainingReadiness ?? existing.training_readiness,
      completion_seconds: body.completionSeconds ?? existing.completion_seconds,
      source: body.source ?? existing.source,
    });

    return { data: this.mapToDTO(updated) };
  }

  /**
   * Delete a check-in
   */
  async deleteCheckin(req: Request & { user: AuthUser }, id: string): Promise<void> {
    const existing = await this.quickWellnessCheckinRepository.findById(id);

    if (!existing) {
      throw new NotFoundException('Check-in not found');
    }

    if (existing.user_id !== req.user.id) {
      throw new NotFoundException('Check-in not found');
    }

    await this.quickWellnessCheckinRepository.deleteById(id);
  }

  /**
   * Get check-in history
   */
  async getHistory(
    req: Request & { user: AuthUser },
    query: WellnessCheckinHistoryQuery,
  ): Promise<QuickWellnessCheckinListResponse> {
    const days = query.days ?? 30;
    const checkins = await this.quickWellnessCheckinRepository.getDateRange(req.user.id, days);

    return { data: checkins.map((c) => this.mapToDTO(c)) };
  }

  /**
   * Get average wellness scores
   */
  async getAverages(
    req: Request & { user: AuthUser },
    query: WellnessCheckinHistoryQuery,
  ): Promise<WellnessAveragesResponse> {
    const days = query.days ?? 7;
    const averages = await this.quickWellnessCheckinRepository.getAverageScores(req.user.id, days);

    const data: WellnessAveragesDTO = {
      sleepQuality: averages.sleepQuality ? Math.round(averages.sleepQuality * 100) / 100 : null,
      energyLevel: averages.energyLevel ? Math.round(averages.energyLevel * 100) / 100 : null,
      muscleSoreness: averages.muscleSoreness ? Math.round(averages.muscleSoreness * 100) / 100 : null,
      stressLevel: averages.stressLevel ? Math.round(averages.stressLevel * 100) / 100 : null,
      trainingReadiness: averages.trainingReadiness ? Math.round(averages.trainingReadiness * 100) / 100 : null,
      daysIncluded: days,
    };

    return { data };
  }

  /**
   * Get wellness trend
   */
  async getTrend(
    req: Request & { user: AuthUser },
    query: WellnessCheckinHistoryQuery,
  ): Promise<WellnessTrendResponse> {
    const days = query.days ?? 7;
    const checkins = await this.quickWellnessCheckinRepository.getDateRange(req.user.id, days);

    if (checkins.length === 0) {
      return {
        data: {
          current: 50,
          average: 50,
          trend: 'stable',
          compliancePercentage: 0,
        },
      };
    }

    // Calculate current score from most recent check-in
    const latest = checkins[checkins.length - 1];
    const currentScore = this.calculateWellnessScore(latest);

    // Calculate average score
    const scores = checkins.map((c) => this.calculateWellnessScore(c));
    const averageScore = scores.reduce((a, b) => a + b, 0) / scores.length;

    // Determine trend
    let trend: 'improving' | 'stable' | 'declining' = 'stable';
    if (checkins.length >= 3) {
      const recentScores = scores.slice(-3);
      const olderScores = scores.slice(0, -3);
      if (olderScores.length > 0) {
        const recentAvg = recentScores.reduce((a, b) => a + b, 0) / recentScores.length;
        const olderAvg = olderScores.reduce((a, b) => a + b, 0) / olderScores.length;
        if (recentAvg > olderAvg + 5) trend = 'improving';
        else if (recentAvg < olderAvg - 5) trend = 'declining';
      }
    }

    // Calculate compliance (percentage of days with check-ins)
    const compliancePercentage = Math.round((checkins.length / days) * 100);

    const data: WellnessTrendDTO = {
      current: Math.round(currentScore),
      average: Math.round(averageScore),
      trend,
      compliancePercentage,
    };

    return { data };
  }

  /**
   * Calculate composite wellness score from check-in (0-100)
   */
  calculateWellnessScore(checkin: QuickWellnessCheckin): number {
    const values: number[] = [];

    if (checkin.sleep_quality) values.push(checkin.sleep_quality);
    if (checkin.energy_level) values.push(checkin.energy_level);
    if (checkin.muscle_soreness) values.push(checkin.muscle_soreness);
    if (checkin.stress_level) values.push(checkin.stress_level);
    if (checkin.training_readiness) values.push(checkin.training_readiness);

    if (values.length === 0) return 50; // Neutral if no data

    // Average of 1-5 values, scaled to 0-100
    const average = values.reduce((a, b) => a + b, 0) / values.length;
    return ((average - 1) / 4) * 100;
  }

  /**
   * Map database entity to DTO
   */
  private mapToDTO(checkin: QuickWellnessCheckin): QuickWellnessCheckinDTO {
    const checkinDate =
      checkin.checkin_date instanceof Date ? formatDateToYMD(checkin.checkin_date) : String(checkin.checkin_date);
    const createdAt =
      checkin.created_at instanceof Date ? checkin.created_at.toISOString() : String(checkin.created_at);
    const updatedAt =
      checkin.updated_at instanceof Date ? checkin.updated_at.toISOString() : String(checkin.updated_at);

    return {
      id: checkin.id,
      userId: checkin.user_id,
      checkinDate,
      sleepQuality: checkin.sleep_quality,
      energyLevel: checkin.energy_level,
      muscleSoreness: checkin.muscle_soreness,
      stressLevel: checkin.stress_level,
      trainingReadiness: checkin.training_readiness,
      completionSeconds: checkin.completion_seconds,
      source: checkin.source,
      wellnessScore: this.calculateWellnessScore(checkin),
      createdAt,
      updatedAt,
    };
  }

  // Illness Logs

  /**
   * Create a new illness log
   */
  async createIllnessLog(req: Request & { user: AuthUser }, body: IllnessLogBody): Promise<IllnessLogResponse> {
    const illnessLog = await this.illnessLogRepository.create({
      user_id: req.user.id,
      illness_type: body.illnessType,
      severity: body.severity,
      start_date: body.startDate,
      end_date: body.endDate ?? null,
      symptoms: body.symptoms ?? null,
      affects_training: body.affectsTraining ?? true,
      notes: body.notes ?? null,
    });

    return { data: this.mapIllnessLogToDTO(illnessLog) };
  }

  /**
   * Get illness log by ID
   */
  async getIllnessLogById(req: Request & { user: AuthUser }, id: string): Promise<IllnessLogResponse> {
    const illnessLog = await this.illnessLogRepository.findById(id);

    if (!illnessLog || illnessLog.user_id !== req.user.id) {
      throw new NotFoundException('Illness log not found');
    }

    return { data: this.mapIllnessLogToDTO(illnessLog) };
  }

  /**
   * List illness logs
   */
  async listIllnessLogs(
    req: Request & { user: AuthUser },
    query: ListIllnessLogsQuery,
  ): Promise<IllnessLogListResponse> {
    const dateFrom = query.days ? new Date() : undefined;
    if (dateFrom) {
      dateFrom.setDate(dateFrom.getDate() - (query.days ?? 90));
    }

    const illnessLogs = await this.illnessLogRepository.findMany({
      filter: {
        userId: req.user.id,
        illnessType: query.illnessType,
        isActive: query.activeOnly ? true : undefined,
        dateFrom,
      },
    });

    return { data: illnessLogs.map((log) => this.mapIllnessLogToDTO(log)) };
  }

  /**
   * Get active illness logs
   */
  async getActiveIllnessLogs(req: Request & { user: AuthUser }): Promise<IllnessLogListResponse> {
    const illnessLogs = await this.illnessLogRepository.getActiveForUser(req.user.id);
    return { data: illnessLogs.map((log) => this.mapIllnessLogToDTO(log)) };
  }

  /**
   * Update an illness log
   */
  async updateIllnessLog(
    req: Request & { user: AuthUser },
    id: string,
    body: UpdateIllnessLogBody,
  ): Promise<IllnessLogResponse> {
    const existing = await this.illnessLogRepository.findById(id);

    if (!existing || existing.user_id !== req.user.id) {
      throw new NotFoundException('Illness log not found');
    }

    const updated = await this.illnessLogRepository.updateById(id, {
      illness_type: body.illnessType ?? existing.illness_type,
      severity: body.severity ?? existing.severity,
      start_date: body.startDate ?? existing.start_date,
      end_date: body.endDate !== undefined ? body.endDate : existing.end_date,
      symptoms: body.symptoms ?? existing.symptoms,
      affects_training: body.affectsTraining ?? existing.affects_training,
      notes: body.notes ?? existing.notes,
    });

    return { data: this.mapIllnessLogToDTO(updated) };
  }

  /**
   * Resolve an illness (set end date to today)
   */
  async resolveIllnessLog(req: Request & { user: AuthUser }, id: string): Promise<IllnessLogResponse> {
    const existing = await this.illnessLogRepository.findById(id);

    if (!existing || existing.user_id !== req.user.id) {
      throw new NotFoundException('Illness log not found');
    }

    const updated = await this.illnessLogRepository.updateById(id, {
      end_date: formatDateToYMD(new Date()),
    });

    return { data: this.mapIllnessLogToDTO(updated) };
  }

  /**
   * Delete an illness log
   */
  async deleteIllnessLog(req: Request & { user: AuthUser }, id: string): Promise<void> {
    const existing = await this.illnessLogRepository.findById(id);

    if (!existing || existing.user_id !== req.user.id) {
      throw new NotFoundException('Illness log not found');
    }

    await this.illnessLogRepository.deleteById(id);
  }

  /**
   * Map illness log to DTO
   */
  private mapIllnessLogToDTO(log: IllnessLog): IllnessLogDTO {
    const startDate = log.start_date instanceof Date ? formatDateToYMD(log.start_date) : String(log.start_date);
    const endDate = log.end_date
      ? log.end_date instanceof Date
        ? formatDateToYMD(log.end_date)
        : String(log.end_date)
      : null;
    const createdAt = log.created_at instanceof Date ? log.created_at.toISOString() : String(log.created_at);
    const updatedAt = log.updated_at instanceof Date ? log.updated_at.toISOString() : String(log.updated_at);
    const coachNotifiedAt = log.coach_notified_at
      ? log.coach_notified_at instanceof Date
        ? log.coach_notified_at.toISOString()
        : String(log.coach_notified_at)
      : null;

    return {
      id: log.id,
      userId: log.user_id,
      illnessType: log.illness_type,
      severity: log.severity,
      startDate,
      endDate,
      symptoms: log.symptoms,
      affectsTraining: log.affects_training,
      notes: log.notes,
      isActive: endDate === null,
      coachNotifiedAt,
      createdAt,
      updatedAt,
    };
  }
}

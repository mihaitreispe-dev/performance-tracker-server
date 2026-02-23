import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { type Request } from 'express';
import { SleepLog } from 'src/database/interfaces';
import { AuthUser } from 'src/modules/auth/types/authenticated-user';
import { SleepLogFilter, SleepLogRepository } from 'src/repositories/sleep-log.repository';

import { CreateSleepLogBody, ListSleepLogsQuery, UpdateSleepLogBody } from './request.dto';
import { SleepLogDTO, SleepLogListResponse, SleepLogResponse } from './response.dto';

@Injectable()
export class SleepApiService {
  private readonly logger = new Logger(SleepApiService.name);

  constructor(private readonly sleepLogRepository: SleepLogRepository) {}

  async list(req: Request & { user: AuthUser }, query: ListSleepLogsQuery): Promise<SleepLogListResponse> {
    const filter: SleepLogFilter = {
      userId: req.user.id,
      startDate: query.startDate ? new Date(query.startDate) : undefined,
      endDate: query.endDate ? new Date(query.endDate) : undefined,
    };

    const [sleepLogs, totalCount] = await Promise.all([
      this.sleepLogRepository.findMany({
        filter,
        offset: query.offset,
        limit: query.limit ?? 50,
      }),
      this.sleepLogRepository.countMany(filter),
    ]);

    return {
      data: sleepLogs.map((log) => this.mapSleepLogToDTO(log)),
      offset: query.offset,
      limit: query.limit,
      totalCount,
    };
  }

  async getByDate(req: Request & { user: AuthUser }, date: string): Promise<SleepLogListResponse> {
    const logDate = new Date(date);
    const sleepLogs = await this.sleepLogRepository.findByUserAndDate(req.user.id, logDate);

    return {
      data: sleepLogs.map((log) => this.mapSleepLogToDTO(log)),
    };
  }

  async getById(req: Request & { user: AuthUser }, id: string): Promise<SleepLogResponse> {
    const sleepLog = await this.sleepLogRepository.findById(id);
    if (!sleepLog) {
      throw new NotFoundException('Sleep log not found');
    }
    if (sleepLog.user_id !== req.user.id) {
      throw new ForbiddenException('Access denied');
    }

    return { data: this.mapSleepLogToDTO(sleepLog) };
  }

  async create(req: Request & { user: AuthUser }, body: CreateSleepLogBody): Promise<SleepLogResponse> {
    const sleepLog = await this.sleepLogRepository.create({
      user_id: req.user.id,
      log_date: new Date(body.logDate),
      start_time: body.startTime ? new Date(body.startTime) : null,
      end_time: body.endTime ? new Date(body.endTime) : null,
      total_duration_seconds: body.totalDurationSeconds,
      awake_duration_seconds: body.awakeDurationSeconds ?? 0,
      light_duration_seconds: body.lightDurationSeconds ?? 0,
      deep_duration_seconds: body.deepDurationSeconds ?? 0,
      rem_duration_seconds: body.remDurationSeconds ?? 0,
      avg_resting_hr: body.avgRestingHr ?? null,
      avg_hrv: body.avgHrv ?? null,
      hr_samples: null,
      source: 'manual',
      external_id: null,
    });

    return { data: this.mapSleepLogToDTO(sleepLog) };
  }

  async update(req: Request & { user: AuthUser }, id: string, body: UpdateSleepLogBody): Promise<SleepLogResponse> {
    const sleepLog = await this.sleepLogRepository.findById(id);
    if (!sleepLog) {
      throw new NotFoundException('Sleep log not found');
    }
    if (sleepLog.user_id !== req.user.id) {
      throw new ForbiddenException('Access denied');
    }

    // Only allow editing manual logs
    if (sleepLog.source !== 'manual') {
      throw new ForbiddenException('Cannot edit non-manual sleep logs');
    }

    const updateData: Record<string, unknown> = {};
    if (body.startTime !== undefined) {
      updateData.start_time = new Date(body.startTime);
    }
    if (body.endTime !== undefined) {
      updateData.end_time = new Date(body.endTime);
    }
    if (body.totalDurationSeconds !== undefined) {
      updateData.total_duration_seconds = body.totalDurationSeconds;
    }
    if (body.awakeDurationSeconds !== undefined) {
      updateData.awake_duration_seconds = body.awakeDurationSeconds;
    }
    if (body.lightDurationSeconds !== undefined) {
      updateData.light_duration_seconds = body.lightDurationSeconds;
    }
    if (body.deepDurationSeconds !== undefined) {
      updateData.deep_duration_seconds = body.deepDurationSeconds;
    }
    if (body.remDurationSeconds !== undefined) {
      updateData.rem_duration_seconds = body.remDurationSeconds;
    }
    if (body.avgRestingHr !== undefined) {
      updateData.avg_resting_hr = body.avgRestingHr;
    }
    if (body.avgHrv !== undefined) {
      updateData.avg_hrv = body.avgHrv;
    }

    const updatedSleepLog = await this.sleepLogRepository.updateById(id, updateData as any);

    return { data: this.mapSleepLogToDTO(updatedSleepLog) };
  }

  async delete(req: Request & { user: AuthUser }, id: string): Promise<void> {
    const sleepLog = await this.sleepLogRepository.findById(id);
    if (!sleepLog) {
      throw new NotFoundException('Sleep log not found');
    }
    if (sleepLog.user_id !== req.user.id) {
      throw new ForbiddenException('Access denied');
    }

    // Only allow deleting manual logs
    if (sleepLog.source !== 'manual') {
      throw new ForbiddenException('Cannot delete non-manual sleep logs');
    }

    await this.sleepLogRepository.deleteById(id);
  }

  private mapSleepLogToDTO(log: SleepLog): SleepLogDTO {
    const logDate = log.log_date instanceof Date ? log.log_date.toISOString().split('T')[0] : String(log.log_date);
    const startTime = log.start_time
      ? log.start_time instanceof Date
        ? log.start_time.toISOString()
        : String(log.start_time)
      : null;
    const endTime = log.end_time
      ? log.end_time instanceof Date
        ? log.end_time.toISOString()
        : String(log.end_time)
      : null;
    const createdAt = log.created_at instanceof Date ? log.created_at.toISOString() : String(log.created_at);
    const updatedAt = log.updated_at instanceof Date ? log.updated_at.toISOString() : String(log.updated_at);

    return {
      id: log.id,
      userId: log.user_id,
      logDate,
      startTime,
      endTime,
      totalDurationSeconds: log.total_duration_seconds,
      awakeDurationSeconds: log.awake_duration_seconds,
      lightDurationSeconds: log.light_duration_seconds,
      deepDurationSeconds: log.deep_duration_seconds,
      remDurationSeconds: log.rem_duration_seconds,
      avgRestingHr: log.avg_resting_hr,
      avgHrv: log.avg_hrv,
      hrSamples: log.hr_samples,
      source: log.source,
      externalId: log.external_id,
      createdAt,
      updatedAt,
    };
  }
}

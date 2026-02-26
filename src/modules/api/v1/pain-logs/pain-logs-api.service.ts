import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { type Request } from 'express';
import { PainLog, PainTrend } from 'src/database/interfaces';
import { AuthUser } from 'src/modules/auth/types/authenticated-user';
import { PainLogFilter, PainLogRepository } from 'src/repositories/pain-log.repository';
import { WorkoutExecutionRepository } from 'src/repositories/workout-execution.repository';

import { BatchCreatePainLogsBody, CreatePainLogBody, ListPainLogsQuery, UpdatePainLogBody } from './request.dto';
import { PainLogDTO, PainLogListResponse, PainLogResponse } from './response.dto';

@Injectable()
export class PainLogsApiService {
  private readonly logger = new Logger(PainLogsApiService.name);

  constructor(
    private readonly painLogRepository: PainLogRepository,
    private readonly workoutExecutionRepository: WorkoutExecutionRepository,
  ) {}

  async list(req: Request & { user: AuthUser }, query: ListPainLogsQuery): Promise<PainLogListResponse> {
    const filter: PainLogFilter = {
      userId: req.user.id,
      workoutExecutionId: query.workoutExecutionId,
      bodyPart: query.bodyPart,
      bodyView: query.bodyView,
      minPainLevel: query.minPainLevel,
      maxPainLevel: query.maxPainLevel,
    };

    const [painLogs, totalCount] = await Promise.all([
      this.painLogRepository.findMany({
        filter,
        offset: query.offset,
        limit: query.limit ?? 50,
      }),
      this.painLogRepository.countMany(filter),
    ]);

    return {
      data: painLogs.map((log) => this.mapPainLogToDTO(log)),
      offset: query.offset,
      limit: query.limit,
      totalCount,
    };
  }

  async getByWorkoutExecution(
    req: Request & { user: AuthUser },
    workoutExecutionId: string,
  ): Promise<PainLogListResponse> {
    // Verify user owns the workout execution
    const execution = await this.workoutExecutionRepository.findById(workoutExecutionId);
    if (!execution) {
      throw new NotFoundException('Workout execution not found');
    }
    if (execution.user_id !== req.user.id) {
      throw new ForbiddenException('Access denied');
    }

    const painLogs = await this.painLogRepository.findByWorkoutExecutionId(workoutExecutionId);

    return {
      data: painLogs.map((log) => this.mapPainLogToDTO(log)),
    };
  }

  async getById(req: Request & { user: AuthUser }, id: string): Promise<PainLogResponse> {
    const painLog = await this.painLogRepository.findById(id);
    if (!painLog) {
      throw new NotFoundException('Pain log not found');
    }
    if (painLog.user_id !== req.user.id) {
      throw new ForbiddenException('Access denied');
    }

    return { data: this.mapPainLogToDTO(painLog) };
  }

  async create(req: Request & { user: AuthUser }, body: CreatePainLogBody): Promise<PainLogResponse> {
    // Verify user owns the workout execution
    const execution = await this.workoutExecutionRepository.findById(body.workoutExecutionId);
    if (!execution) {
      throw new NotFoundException('Workout execution not found');
    }
    if (execution.user_id !== req.user.id) {
      throw new ForbiddenException('Access denied');
    }

    const painLog = await this.painLogRepository.create({
      user_id: req.user.id,
      workout_execution_id: body.workoutExecutionId,
      body_part: body.bodyPart,
      body_view: body.bodyView,
      pain_level: body.painLevel,
      pain_duration_start: body.painDurationStart ?? 0,
      pain_duration_end: body.painDurationEnd ?? 100,
      pain_trend: body.painTrend ?? PainTrend.CONSTANT,
      notes: body.notes ?? null,
    });

    return { data: this.mapPainLogToDTO(painLog) };
  }

  async batchCreate(req: Request & { user: AuthUser }, body: BatchCreatePainLogsBody): Promise<PainLogListResponse> {
    // Verify user owns the workout execution
    const execution = await this.workoutExecutionRepository.findById(body.workoutExecutionId);
    if (!execution) {
      throw new NotFoundException('Workout execution not found');
    }
    if (execution.user_id !== req.user.id) {
      throw new ForbiddenException('Access denied');
    }

    // Delete existing pain logs for this execution before creating new ones
    await this.painLogRepository.deleteByWorkoutExecutionId(body.workoutExecutionId);

    if (body.painLogs.length === 0) {
      return { data: [] };
    }

    const painLogs = await this.painLogRepository.createMany(
      body.painLogs.map((log) => ({
        user_id: req.user.id,
        workout_execution_id: body.workoutExecutionId,
        body_part: log.bodyPart,
        body_view: log.bodyView,
        pain_level: log.painLevel,
        pain_duration_start: log.painDurationStart ?? 0,
        pain_duration_end: log.painDurationEnd ?? 100,
        pain_trend: log.painTrend ?? PainTrend.CONSTANT,
        notes: log.notes ?? null,
      })),
    );

    return { data: painLogs.map((log) => this.mapPainLogToDTO(log)) };
  }

  async update(req: Request & { user: AuthUser }, id: string, body: UpdatePainLogBody): Promise<PainLogResponse> {
    const painLog = await this.painLogRepository.findById(id);
    if (!painLog) {
      throw new NotFoundException('Pain log not found');
    }
    if (painLog.user_id !== req.user.id) {
      throw new ForbiddenException('Access denied');
    }

    const updateData: Record<string, unknown> = {};
    if (body.painLevel !== undefined) {
      updateData.pain_level = body.painLevel;
    }
    if (body.painDurationStart !== undefined) {
      updateData.pain_duration_start = body.painDurationStart;
    }
    if (body.painDurationEnd !== undefined) {
      updateData.pain_duration_end = body.painDurationEnd;
    }
    if (body.painTrend !== undefined) {
      updateData.pain_trend = body.painTrend;
    }
    if (body.notes !== undefined) {
      updateData.notes = body.notes;
    }

    const updatedPainLog = await this.painLogRepository.updateById(id, updateData as any);

    return { data: this.mapPainLogToDTO(updatedPainLog) };
  }

  async delete(req: Request & { user: AuthUser }, id: string): Promise<void> {
    const painLog = await this.painLogRepository.findById(id);
    if (!painLog) {
      throw new NotFoundException('Pain log not found');
    }
    if (painLog.user_id !== req.user.id) {
      throw new ForbiddenException('Access denied');
    }

    await this.painLogRepository.deleteById(id);
  }

  private mapPainLogToDTO(log: PainLog): PainLogDTO {
    const createdAt = log.created_at instanceof Date ? log.created_at.toISOString() : String(log.created_at);
    const updatedAt = log.updated_at instanceof Date ? log.updated_at.toISOString() : String(log.updated_at);

    return {
      id: log.id,
      userId: log.user_id,
      workoutExecutionId: log.workout_execution_id,
      bodyPart: log.body_part,
      bodyView: log.body_view,
      painLevel: log.pain_level,
      painDurationStart: log.pain_duration_start,
      painDurationEnd: log.pain_duration_end,
      painTrend: log.pain_trend,
      notes: log.notes,
      createdAt,
      updatedAt,
    };
  }
}

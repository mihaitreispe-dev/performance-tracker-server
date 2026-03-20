import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { type Request } from 'express';
import { SleepBaseline, SleepLog, WearableDataCategory } from 'src/database/interfaces';
import { AuthUser } from 'src/modules/auth/types/authenticated-user';
import { SleepLogFilter, SleepLogRepository } from 'src/repositories/sleep-log.repository';
import { WearableProviderPriorityRepository } from 'src/repositories/wearable-provider-priority.repository';

import { CreateSleepLogBody, ListSleepLogsQuery, UpdateSleepLogBody } from './request.dto';
import {
  DailySleepSourceDTO,
  DailySleepSummaryDTO,
  DailySleepSummaryResponse,
  EnhancedSleepMetricsDTO,
  SleepInsightDTO,
  SleepLogDTO,
  SleepLogListResponse,
  SleepLogResponse,
  SleepScoreBreakdownDTO,
  SleepStagesDTO,
  SleepZScoresDTO,
} from './response.dto';
import { SleepBaselineService } from './sleep-baseline.service';
import { EnhancedScoreResult, SleepScoreService } from './sleep-score.service';

@Injectable()
export class SleepApiService {
  private readonly logger = new Logger(SleepApiService.name);

  constructor(
    private readonly sleepLogRepository: SleepLogRepository,
    private readonly priorityRepo: WearableProviderPriorityRepository,
    private readonly sleepScoreService: SleepScoreService,
    private readonly sleepBaselineService: SleepBaselineService,
  ) {}

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

  /**
   * Get daily sleep summary aggregating all sources for a date
   */
  async getDailySummary(req: Request & { user: AuthUser }, date: string): Promise<DailySleepSummaryResponse> {
    const logDate = new Date(date);
    const userId = req.user.id;

    // Get all sleep logs for this date
    const sleepLogs = await this.sleepLogRepository.findByUserAndDate(userId, logDate);

    // Get the user's priority provider for sleep
    const priorityProvider = await this.priorityRepo.getHighestPriorityProvider(userId, WearableDataCategory.SLEEP);

    // Get baseline for enhanced scoring
    const baseline = await this.sleepBaselineService.getOrCalculateBaseline(userId, logDate);

    // Determine primary source
    let primarySource: string | null = null;
    if (sleepLogs.length > 0) {
      if (priorityProvider) {
        // Use priority provider if it has data
        const priorityLog = sleepLogs.find((log) => log.source === priorityProvider);
        if (priorityLog) {
          primarySource = priorityProvider;
        } else {
          // Fall back to first non-manual source, or manual if that's all we have
          const syncedLog = sleepLogs.find((log) => log.source !== 'manual');
          primarySource = syncedLog?.source ?? sleepLogs[0].source;
        }
      } else {
        // No priority set - prefer synced data over manual
        const syncedLog = sleepLogs.find((log) => log.source !== 'manual');
        primarySource = syncedLog?.source ?? sleepLogs[0].source;
      }
    }

    // Check if we have synced (non-manual) data
    const hasSyncedData = sleepLogs.some((log) => log.source !== 'manual');

    // Build sources array with scores
    const sources: DailySleepSourceDTO[] = sleepLogs.map((log) => {
      const scoreResult = this.sleepScoreService.computeScore(log);
      return {
        source: log.source,
        isPrimary: log.source === primarySource,
        sleepLog: this.mapSleepLogToDTO(log),
        computedScore: scoreResult.score,
        qualityRating: scoreResult.qualityRating,
      };
    });

    // Get aggregated data from primary source
    const primaryLog = sleepLogs.find((log) => log.source === primarySource);
    let totalDurationSeconds: number | null = null;
    let sleepScore: number | null = null;
    let qualityRating: number | null = null;
    let avgHrv: number | null = null;
    let avgRestingHr: number | null = null;
    let stages: SleepStagesDTO | null = null;

    // Enhanced scoring fields
    let scoreConfidence: number | null = null;
    let scoreBreakdown: SleepScoreBreakdownDTO | null = null;
    let zScores: SleepZScoresDTO | null = null;
    let insights: SleepInsightDTO[] = [];
    let enhancedMetrics: EnhancedSleepMetricsDTO | null = null;
    let sleepDebt7Day: number | null = null;

    if (primaryLog) {
      totalDurationSeconds = primaryLog.total_duration_seconds;
      avgHrv = primaryLog.avg_hrv;
      avgRestingHr = primaryLog.avg_resting_hr;
      stages = {
        awake: primaryLog.awake_duration_seconds,
        light: primaryLog.light_duration_seconds,
        deep: primaryLog.deep_duration_seconds,
        rem: primaryLog.rem_duration_seconds,
      };

      // Use enhanced scoring
      const enhancedResult = this.sleepScoreService.computeEnhancedScore(primaryLog, baseline);
      sleepScore = enhancedResult.score;
      qualityRating = enhancedResult.qualityRating;
      scoreConfidence = enhancedResult.confidence;
      scoreBreakdown = enhancedResult.breakdown;
      zScores = enhancedResult.zScores;
      insights = enhancedResult.insights;

      // Build enhanced metrics
      enhancedMetrics = this.buildEnhancedMetrics(primaryLog);

      // Get sleep debt from baseline
      if (baseline?.sleep_debt_7day !== null && baseline?.sleep_debt_7day !== undefined) {
        sleepDebt7Day = this.sleepBaselineService.sleepDebtToHours(baseline.sleep_debt_7day);
      }
    }

    const summary: DailySleepSummaryDTO = {
      date,
      primarySource,
      hasSyncedData,
      sources,
      totalDurationSeconds,
      sleepScore,
      qualityRating,
      avgHrv,
      avgRestingHr,
      stages,
      // Enhanced fields
      scoreConfidence,
      scoreBreakdown,
      zScores,
      insights,
      enhancedMetrics,
      sleepDebt7Day,
    };

    return { data: summary };
  }

  /**
   * Build enhanced metrics DTO from sleep log
   */
  private buildEnhancedMetrics(log: SleepLog): EnhancedSleepMetricsDTO {
    return {
      sleepOnsetLatencySeconds: log.sleep_onset_latency_seconds,
      wasoSeconds: log.waso_seconds,
      wasoCount: log.waso_count,
      timeInBedSeconds: log.time_in_bed_seconds,
      sleepEfficiency: log.sleep_efficiency ? parseFloat(log.sleep_efficiency) : null,
      hrNadir: log.hr_nadir,
      hrvFirstHalfAvg: log.hrv_first_half_avg ? parseFloat(log.hrv_first_half_avg) : null,
      hrvSecondHalfAvg: log.hrv_second_half_avg ? parseFloat(log.hrv_second_half_avg) : null,
    };
  }

  /**
   * Set the primary sleep source for a user
   */
  async setPrimarySleepSource(req: Request & { user: AuthUser }, provider: string): Promise<void> {
    const userId = req.user.id;

    // Validate provider is a known wearable provider or 'manual'
    const validProviders = ['manual', 'garmin', 'whoop', 'apple_health', 'oura'];
    if (!validProviders.includes(provider)) {
      throw new NotFoundException(`Unknown provider: ${provider}`);
    }

    // Set this provider as highest priority for sleep
    await this.priorityRepo.setProviderAsHighestPriority(userId, WearableDataCategory.SLEEP, provider as any);
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

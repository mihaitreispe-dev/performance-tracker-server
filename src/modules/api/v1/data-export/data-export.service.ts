import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { type Request } from 'express';
import { DataExportCategory, DataExportFormat, DataExportJob, DataExportJobStatus } from 'src/database/interfaces';
import { s3Keys } from 'src/lib/util/s3-keys';
import { AuthUser } from 'src/modules/auth/types/authenticated-user';
import { AppConfigService } from 'src/modules/config/app-config.service';
import { S3Service } from 'src/modules/s3/s3.service';
import { CardioMetricsRepository } from 'src/repositories/cardio-metrics.repository';
import { DailyHealthMetricRepository } from 'src/repositories/daily-health-metric.repository';
import { DailyTrainingLoadRepository } from 'src/repositories/daily-training-load.repository';
import { DataExportJobRepository } from 'src/repositories/data-export-job.repository';
import { PersonalRecordRepository } from 'src/repositories/personal-record.repository';
import { SleepLogRepository } from 'src/repositories/sleep-log.repository';
import { UserSettingsRepository } from 'src/repositories/user-settings.repository';
import { WorkoutRepository } from 'src/repositories/workout.repository';
import { WorkoutExecutionRepository } from 'src/repositories/workout-execution.repository';
import { WorkoutRouteRepository } from 'src/repositories/workout-route.repository';

import { CsvExporter, ExportData } from './exporters/csv.exporter';
import { JsonExporter } from './exporters/json.exporter';
import { RequestExportBody } from './request.dto';
import {
  DataExportJobDTO,
  DataExportJobListResponse,
  DataExportJobResponse,
  DownloadUrlResponse,
} from './response.dto';

@Injectable()
export class DataExportService {
  private readonly logger = new Logger(DataExportService.name);

  constructor(
    private readonly dataExportJobRepo: DataExportJobRepository,
    private readonly workoutRepo: WorkoutRepository,
    private readonly workoutExecutionRepo: WorkoutExecutionRepository,
    private readonly cardioMetricsRepo: CardioMetricsRepository,
    private readonly workoutRouteRepo: WorkoutRouteRepository,
    private readonly dailyHealthMetricRepo: DailyHealthMetricRepository,
    private readonly personalRecordRepo: PersonalRecordRepository,
    private readonly dailyTrainingLoadRepo: DailyTrainingLoadRepository,
    private readonly userSettingsRepo: UserSettingsRepository,
    private readonly sleepLogRepo: SleepLogRepository,
    private readonly s3Service: S3Service,
    private readonly configService: AppConfigService,
    private readonly csvExporter: CsvExporter,
    private readonly jsonExporter: JsonExporter,
  ) {}

  async requestExport(req: Request & { user: AuthUser }, body: RequestExportBody): Promise<DataExportJobResponse> {
    // Check rate limit (max 1 export per hour)
    const recentExports = await this.dataExportJobRepo.countByUserInPeriod(req.user.id, 1);
    if (recentExports >= 1) {
      throw new BadRequestException('You can only request one export per hour. Please try again later.');
    }

    // Default to all categories if none specified
    const categories = body.categories ?? Object.values(DataExportCategory);

    // Create export job record
    const job = await this.dataExportJobRepo.create({
      user_id: req.user.id,
      format: body.format,
      categories,
      status: DataExportJobStatus.PENDING,
    });

    // Start async processing
    this.processExportAsync(job);

    return { data: this.mapJobToDTO(job) };
  }

  private async processExportAsync(job: DataExportJob): Promise<void> {
    try {
      await this.dataExportJobRepo.markStarted(job.id);

      // Gather data based on categories
      const data = await this.gatherExportData(job.user_id, job.categories);

      // Calculate total items
      const totalItems = Object.values(data).reduce((sum, arr) => sum + arr.length, 0);
      await this.dataExportJobRepo.updateProgress(job.id, 0, totalItems);

      // Generate export based on format
      let exportBuffer: Buffer;
      let filename: string;

      switch (job.format) {
        case DataExportFormat.CSV:
          exportBuffer = await this.csvExporter.export(data);
          filename = `export_${new Date().toISOString().split('T')[0]}.zip`;
          break;
        case DataExportFormat.JSON:
          exportBuffer = await this.jsonExporter.export(data);
          filename = `export_${new Date().toISOString().split('T')[0]}.zip`;
          break;
        case DataExportFormat.FIT:
          // FIT export is more complex - for now, default to JSON
          this.logger.warn('FIT export not yet fully implemented, falling back to JSON');
          exportBuffer = await this.jsonExporter.export(data);
          filename = `export_${new Date().toISOString().split('T')[0]}.zip`;
          break;
        default:
          throw new Error(`Unsupported export format: ${job.format}`);
      }

      // Upload to S3
      const s3Key = s3Keys.dataExport(job.user_id, job.id, filename);
      const bucket = this.configService.get('S3_UPLOAD_BUCKET') || '';

      await this.s3Service.uploadFile({
        bucket,
        key: s3Key,
        data: exportBuffer,
        additionalParams: {
          ContentType: 'application/zip',
        },
      });

      // Generate presigned download URL (expires in 24 hours)
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
      const downloadUrl = await this.s3Service.getSignedUrlGET({
        bucket,
        key: s3Key,
        expires: 24 * 60 * 60,
        contentDisposition: `attachment; filename="${filename}"`,
      });

      // Mark job as completed
      await this.dataExportJobRepo.markCompleted(
        job.id,
        downloadUrl || '',
        bucket,
        s3Key,
        exportBuffer.length,
        expiresAt,
      );

      this.logger.log(`Export job ${job.id} completed: ${totalItems} items exported`);
    } catch (error) {
      this.logger.error(`Export job ${job.id} failed: ${error}`);
      await this.dataExportJobRepo.markFailed(job.id, error instanceof Error ? error.message : String(error));
    }
  }

  private async gatherExportData(userId: string, categories: DataExportCategory[]): Promise<ExportData> {
    const data: ExportData = {
      workouts: [],
      workoutExecutions: [],
      cardioMetrics: [],
      routes: [],
      healthMetrics: [],
      personalRecords: [],
      trainingLoad: [],
      userSettings: [],
      sleepLogs: [],
    };

    for (const category of categories) {
      switch (category) {
        case DataExportCategory.WORKOUTS:
          data.workouts = await this.workoutRepo.findMany({
            filter: { userId },
            limit: 10000,
          });
          break;

        case DataExportCategory.WORKOUT_EXECUTIONS:
          data.workoutExecutions = await this.workoutExecutionRepo.findMany({
            filter: { userId },
            limit: 10000,
          });
          break;

        case DataExportCategory.CARDIO_METRICS: {
          // Get execution IDs for the user, then fetch metrics
          const executions = await this.workoutExecutionRepo.findMany({
            filter: { userId },
            limit: 10000,
          });
          for (const exec of executions) {
            const metrics = await this.cardioMetricsRepo.findByExecutionId(exec.id);
            data.cardioMetrics.push(...metrics);
          }
          break;
        }

        case DataExportCategory.ROUTES: {
          const executionsForRoutes = await this.workoutExecutionRepo.findMany({
            filter: { userId },
            limit: 10000,
          });
          for (const exec of executionsForRoutes) {
            const route = await this.workoutRouteRepo.findByExecutionId(exec.id);
            if (route) {
              data.routes.push(route);
            }
          }
          break;
        }

        case DataExportCategory.HEALTH_METRICS:
          data.healthMetrics = await this.dailyHealthMetricRepo.findMany({
            userId,
          });
          break;

        case DataExportCategory.PERSONAL_RECORDS:
          data.personalRecords = await this.personalRecordRepo.findMany({
            userId,
          });
          break;

        case DataExportCategory.TRAINING_LOAD:
          data.trainingLoad = await this.dailyTrainingLoadRepo.findMany({
            filter: { userId },
          });
          break;

        case DataExportCategory.USER_SETTINGS: {
          const settings = await this.userSettingsRepo.findByUserId(userId);
          if (settings) {
            data.userSettings = [settings];
          }
          break;
        }

        case DataExportCategory.SLEEP:
          data.sleepLogs = await this.sleepLogRepo.findMany({
            filter: { userId },
          });
          break;
      }
    }

    return data;
  }

  async getJob(req: Request & { user: AuthUser }, jobId: string): Promise<DataExportJobResponse> {
    const job = await this.dataExportJobRepo.findByIdAndUser(jobId, req.user.id);
    if (!job) {
      throw new NotFoundException('Export job not found');
    }

    return { data: this.mapJobToDTO(job) };
  }

  async listJobs(req: Request & { user: AuthUser }): Promise<DataExportJobListResponse> {
    const jobs = await this.dataExportJobRepo.findLatestByUser(req.user.id, 20);
    return { data: jobs.map((j) => this.mapJobToDTO(j)) };
  }

  async getDownloadUrl(req: Request & { user: AuthUser }, jobId: string): Promise<DownloadUrlResponse> {
    const job = await this.dataExportJobRepo.findByIdAndUser(jobId, req.user.id);
    if (!job) {
      throw new NotFoundException('Export job not found');
    }

    if (job.status !== DataExportJobStatus.COMPLETED) {
      throw new BadRequestException('Export is not ready for download');
    }

    if (job.expires_at && new Date(job.expires_at) < new Date()) {
      throw new BadRequestException('Export has expired. Please request a new export.');
    }

    // Generate a fresh presigned URL
    const downloadUrl = await this.s3Service.getSignedUrlGET({
      bucket: job.s3_bucket!,
      key: job.s3_key!,
      expires: 60 * 60, // 1 hour
      contentDisposition: `attachment; filename="export_${job.id}.zip"`,
    });

    return {
      downloadUrl,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    };
  }

  private mapJobToDTO(job: DataExportJob): DataExportJobDTO {
    return {
      id: job.id,
      format: job.format,
      categories: job.categories,
      status: job.status,
      downloadUrl: job.download_url,
      expiresAt: job.expires_at ? new Date(String(job.expires_at)).toISOString() : null,
      totalItems: job.total_items,
      processedItems: job.processed_items,
      fileSizeBytes: job.file_size_bytes,
      errorMessage: job.error_message,
      startedAt: job.started_at ? new Date(String(job.started_at)).toISOString() : null,
      completedAt: job.completed_at ? new Date(String(job.completed_at)).toISOString() : null,
      createdAt: new Date(String(job.created_at)).toISOString(),
      updatedAt: new Date(String(job.updated_at)).toISOString(),
    };
  }
}

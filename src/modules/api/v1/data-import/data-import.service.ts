import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { type Request } from 'express';
import { DataImportJob, DataImportJobStatus, DataImportType } from 'src/database/interfaces';
import { s3Keys } from 'src/lib/util/s3-keys';
import { AuthUser } from 'src/modules/auth/types/authenticated-user';
import { AppConfigService } from 'src/modules/config/app-config.service';
import { S3Service } from 'src/modules/s3/s3.service';
import { DataImportJobRepository } from 'src/repositories/data-import-job.repository';

import { GarminArchiveProcessor } from './garmin-archive.processor';
import { ConfirmUploadBody, RequestUploadUrlBody, StartProcessingBody } from './request.dto';
import {
  DataImportJobDTO,
  DataImportJobListResponse,
  DataImportJobResponse,
  RequestUploadUrlDTO,
  RequestUploadUrlResponse,
} from './response.dto';

@Injectable()
export class DataImportService {
  private readonly logger = new Logger(DataImportService.name);

  constructor(
    private readonly dataImportJobRepo: DataImportJobRepository,
    private readonly s3Service: S3Service,
    private readonly configService: AppConfigService,
    private readonly garminArchiveProcessor: GarminArchiveProcessor,
  ) {}

  async requestUploadUrl(
    req: Request & { user: AuthUser },
    body: RequestUploadUrlBody,
  ): Promise<RequestUploadUrlResponse> {
    // Check rate limit (max 5 imports per day)
    const recentImports = await this.dataImportJobRepo.countByUserInPeriod(req.user.id, 24);
    if (recentImports >= 5) {
      throw new BadRequestException('You have reached the maximum of 5 imports per day. Please try again later.');
    }

    // Generate S3 key for the upload
    const s3Key = s3Keys.dataImportArchive(req.user.id, body.importType, body.fileName);

    // Create import job record
    const job = await this.dataImportJobRepo.create({
      user_id: req.user.id,
      import_type: body.importType,
      status: DataImportJobStatus.PENDING,
      s3_bucket: this.configService.get('S3_UPLOAD_BUCKET'),
      s3_key: s3Key,
      file_name: body.fileName,
    });

    // Generate presigned upload URL
    const presignedResult = await this.s3Service.getPresignedUploadUrl({
      key: s3Key,
      contentType: body.contentType || 'application/zip',
      bucket: this.configService.get('S3_UPLOAD_BUCKET') || '',
    });

    const response: RequestUploadUrlDTO = {
      jobId: job.id,
      uploadUrl: presignedResult.url,
      s3Key,
      expiresIn: 3600, // 1 hour
    };

    return { data: response };
  }

  async confirmUpload(req: Request & { user: AuthUser }, body: ConfirmUploadBody): Promise<DataImportJobResponse> {
    const job = await this.dataImportJobRepo.findByIdAndUser(body.jobId, req.user.id);
    if (!job) {
      throw new NotFoundException('Import job not found');
    }

    if (job.status !== DataImportJobStatus.PENDING) {
      throw new BadRequestException('Import job is not in pending state');
    }

    // Verify the file exists in S3
    const exists = await this.s3Service.objectExists({
      bucket: job.s3_bucket!,
      key: job.s3_key!,
    });

    if (!exists) {
      throw new BadRequestException('Uploaded file not found. Please try uploading again.');
    }

    // Update job status
    const updatedJob = await this.dataImportJobRepo.updateById(job.id, {
      status: DataImportJobStatus.UPLOADING,
      file_size_bytes: body.fileSizeBytes,
    });

    return { data: this.mapJobToDTO(updatedJob) };
  }

  async startProcessing(req: Request & { user: AuthUser }, body: StartProcessingBody): Promise<DataImportJobResponse> {
    const job = await this.dataImportJobRepo.findByIdAndUser(body.jobId, req.user.id);
    if (!job) {
      throw new NotFoundException('Import job not found');
    }

    if (job.status !== DataImportJobStatus.UPLOADING) {
      throw new BadRequestException('Import job must be in uploading state to start processing');
    }

    // Mark job as extracting
    await this.dataImportJobRepo.updateById(job.id, {
      status: DataImportJobStatus.EXTRACTING,
      started_at: new Date(),
    });

    // Process asynchronously
    this.processArchiveAsync(job);

    const updatedJob = await this.dataImportJobRepo.findById(job.id);
    return { data: this.mapJobToDTO(updatedJob!) };
  }

  private async processArchiveAsync(job: DataImportJob): Promise<void> {
    try {
      // Download the archive from S3
      this.logger.log(`Downloading archive for job ${job.id}`);
      const archiveData = await this.s3Service.getObject({
        bucket: job.s3_bucket!,
        key: job.s3_key!,
      });

      // Mark as processing
      await this.dataImportJobRepo.updateById(job.id, {
        status: DataImportJobStatus.PROCESSING,
      });

      // Process based on import type
      let result;
      switch (job.import_type) {
        case DataImportType.GARMIN_ARCHIVE:
          result = await this.garminArchiveProcessor.processArchive(archiveData, job);
          break;
        case DataImportType.TRAININGPEAKS_ARCHIVE:
          // TrainingPeaks uses a similar structure to Garmin
          result = await this.garminArchiveProcessor.processArchive(archiveData, job);
          break;
        default:
          throw new Error(`Unsupported import type: ${job.import_type}`);
      }

      // Mark as completed
      await this.dataImportJobRepo.markCompleted(job.id);

      this.logger.log(
        `Import job ${job.id} completed: ${result.processedCount} processed, ${result.skippedCount} skipped, ${result.failedCount} failed`,
      );

      // Clean up S3 file after successful processing
      try {
        await this.s3Service.deleteObject({
          bucket: job.s3_bucket!,
          key: job.s3_key!,
        });
      } catch (error) {
        this.logger.warn(`Failed to clean up S3 file for job ${job.id}: ${error}`);
      }
    } catch (error) {
      this.logger.error(`Import job ${job.id} failed: ${error}`);
      await this.dataImportJobRepo.markFailed(job.id, error instanceof Error ? error.message : String(error));
    }
  }

  async getJob(req: Request & { user: AuthUser }, jobId: string): Promise<DataImportJobResponse> {
    const job = await this.dataImportJobRepo.findByIdAndUser(jobId, req.user.id);
    if (!job) {
      throw new NotFoundException('Import job not found');
    }

    return { data: this.mapJobToDTO(job) };
  }

  async listJobs(req: Request & { user: AuthUser }): Promise<DataImportJobListResponse> {
    const jobs = await this.dataImportJobRepo.findMany({
      userId: req.user.id,
    });

    return { data: jobs.map((j) => this.mapJobToDTO(j)) };
  }

  async cancelJob(req: Request & { user: AuthUser }, jobId: string): Promise<void> {
    const job = await this.dataImportJobRepo.findByIdAndUser(jobId, req.user.id);
    if (!job) {
      throw new NotFoundException('Import job not found');
    }

    if (job.status === DataImportJobStatus.COMPLETED || job.status === DataImportJobStatus.FAILED) {
      throw new BadRequestException('Cannot cancel a completed or failed job');
    }

    await this.dataImportJobRepo.markFailed(job.id, 'Cancelled by user');

    // Clean up S3 file
    if (job.s3_bucket && job.s3_key) {
      try {
        await this.s3Service.deleteObject({
          bucket: job.s3_bucket,
          key: job.s3_key,
        });
      } catch (error) {
        this.logger.warn(`Failed to clean up S3 file for cancelled job ${job.id}: ${error}`);
      }
    }
  }

  private mapJobToDTO(job: DataImportJob): DataImportJobDTO {
    return {
      id: job.id,
      importType: job.import_type,
      status: job.status,
      fileName: job.file_name,
      fileSizeBytes: job.file_size_bytes,
      totalItems: job.total_items,
      processedItems: job.processed_items,
      skippedItems: job.skipped_items,
      failedItems: job.failed_items,
      errorMessage: job.error_message,
      startedAt: job.started_at ? new Date(String(job.started_at)).toISOString() : null,
      completedAt: job.completed_at ? new Date(String(job.completed_at)).toISOString() : null,
      createdAt: new Date(String(job.created_at)).toISOString(),
      updatedAt: new Date(String(job.updated_at)).toISOString(),
    };
  }
}

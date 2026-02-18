import * as stream from 'node:stream';

import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { type Request } from 'express';
import {
  GeoJSONLineString,
  WorkoutExecutionSource,
  WorkoutFileImport,
  WorkoutFileImportStatus,
} from 'src/database/interfaces';
import { s3Keys } from 'src/lib/util/s3-keys';
import { AuthUser } from 'src/modules/auth/types/authenticated-user';
import { S3Service } from 'src/modules/s3/s3.service';
import { CardioMetricsRepository } from 'src/repositories/cardio-metrics.repository';
import { WorkoutExecutionRepository } from 'src/repositories/workout-execution.repository';
import { WorkoutFileImportRepository } from 'src/repositories/workout-file-import.repository';
import { WorkoutRouteRepository } from 'src/repositories/workout-route.repository';
import { WorkoutScheduleRepository } from 'src/repositories/workout-schedule.repository';
import { v4 as uuidv4 } from 'uuid';

import { RequestUploadBody } from './request.dto';
import {
  WorkoutFileImportDTO,
  WorkoutFileUploadResultDTO,
  WorkoutFileUploadResultResponse,
  WorkoutFileUploadUrlResponse,
} from './response.dto';
import { WorkoutFileParserService } from './workout-file-parser.service';

@Injectable()
export class WorkoutFileImportsApiService {
  private readonly logger = new Logger(WorkoutFileImportsApiService.name);

  constructor(
    private readonly importRepository: WorkoutFileImportRepository,
    private readonly s3Service: S3Service,
    private readonly parserService: WorkoutFileParserService,
    private readonly workoutExecutionRepository: WorkoutExecutionRepository,
    private readonly cardioMetricsRepository: CardioMetricsRepository,
    private readonly workoutRouteRepository: WorkoutRouteRepository,
    private readonly workoutScheduleRepository: WorkoutScheduleRepository,
  ) {}

  async requestUpload(
    req: Request & { user: AuthUser },
    body: RequestUploadBody,
  ): Promise<WorkoutFileUploadUrlResponse> {
    const userId = req.user.id;

    // Generate unique filename
    const uniqueFilename = `${uuidv4()}-${body.fileName}`;
    const s3Key = s3Keys.upload.workoutImport({ userId, filename: uniqueFilename }).file;

    // Create import record
    const importRecord = await this.importRepository.create({
      user_id: userId,
      file_name: body.fileName,
      file_format: body.fileFormat,
      file_size_bytes: body.fileSizeBytes,
      s3_bucket: this.s3Service.uploadBucket,
      s3_key: s3Key,
      status: WorkoutFileImportStatus.PENDING,
      workout_schedule_id: body.workoutScheduleId || null,
    });

    // Generate presigned URL (valid for 1 hour)
    const expiresIn = 3600;
    const uploadUrl = await this.s3Service.getSignedUrlPUT({
      bucket: this.s3Service.uploadBucket,
      key: s3Key,
      expires: expiresIn,
      contentType: 'application/octet-stream',
    });

    const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

    return {
      data: {
        uploadId: importRecord.id,
        uploadUrl,
        expiresAt,
      },
    };
  }

  async notifyUploadComplete(
    req: Request & { user: AuthUser },
    uploadId: string,
  ): Promise<WorkoutFileUploadResultResponse> {
    const importRecord = await this.importRepository.findById(uploadId);

    if (!importRecord) {
      throw new NotFoundException('Import record not found');
    }

    if (importRecord.user_id !== req.user.id) {
      throw new ForbiddenException('Access denied');
    }

    // Update status to processing
    await this.importRepository.updateById(uploadId, {
      status: WorkoutFileImportStatus.PROCESSING,
    });

    try {
      // Download file from S3
      const fileStream = await this.s3Service.getObjectStream({
        bucket: importRecord.s3_bucket,
        key: importRecord.s3_key,
      });

      // Convert stream to buffer
      const fileBuffer = await this.streamToBuffer(fileStream);

      // Parse the file
      const parsedData = await this.parserService.parse(fileBuffer, importRecord.file_format);

      this.logger.log(
        `Parsed file: ${parsedData.metrics.length} metrics, ${parsedData.routePoints.length} route points, ${parsedData.laps.length} laps`,
      );

      // Determine the source based on file format
      const sourceMap: Record<string, WorkoutExecutionSource> = {
        fit: WorkoutExecutionSource.GARMIN,
        tcx: WorkoutExecutionSource.GARMIN,
        gpx: WorkoutExecutionSource.MANUAL,
      };
      const source = sourceMap[importRecord.file_format] || WorkoutExecutionSource.MANUAL;

      // Create workout execution with actual dates from the file
      const execution = await this.workoutExecutionRepository.create({
        user_id: req.user.id,
        workout_schedule_id: importRecord.workout_schedule_id,
        started_at: parsedData.startTime,
        completed_at: parsedData.endTime || null,
        duration_seconds: parsedData.totalDurationSeconds ? Math.round(parsedData.totalDurationSeconds) : null,
        source,
        external_id: `import-${importRecord.id}`,
        notes: `Imported from ${importRecord.file_name}`,
      });

      this.logger.log(`Created workout execution: ${execution.id}`);

      // Create cardio metrics (batch insert for performance)
      if (parsedData.metrics.length > 0) {
        // Sample metrics to reduce data volume (keep every 5th point for large files)
        const sampledMetrics =
          parsedData.metrics.length > 5000 ? parsedData.metrics.filter((_, i) => i % 5 === 0) : parsedData.metrics;

        const metricsToCreate = sampledMetrics.map((m) => ({
          workout_execution_id: execution.id,
          metric_type: m.metricType,
          recorded_at: m.recordedAt,
          value: m.value.toString(),
          unit: m.unit,
        }));

        // Insert in batches of 1000
        for (let i = 0; i < metricsToCreate.length; i += 1000) {
          const batch = metricsToCreate.slice(i, i + 1000);
          await this.cardioMetricsRepository.createMany(batch);
        }

        this.logger.log(`Created ${metricsToCreate.length} cardio metrics`);
      }

      // Create route if we have GPS data
      if (parsedData.routePoints.length > 0) {
        // Build GeoJSON LineString - coordinates are [longitude, latitude] or [longitude, latitude, elevation]
        const coordinates = parsedData.routePoints.map((p) => {
          if (p.elevation !== undefined) {
            return [p.longitude, p.latitude, p.elevation] as [number, number, number];
          }
          return [p.longitude, p.latitude] as [number, number];
        });

        const routeGeojson: GeoJSONLineString = {
          type: 'LineString',
          coordinates: coordinates as [number, number][] | [number, number, number][],
        };

        // Calculate total distance from parsed data or route points
        const totalDistance = parsedData.totalDistanceMeters || this.calculateRouteDistance(parsedData.routePoints);

        const route = await this.workoutRouteRepository.create({
          workout_execution_id: execution.id,
          route_geojson: routeGeojson,
          total_distance_meters: totalDistance.toString(),
          elevation_gain_meters: parsedData.elevationGainMeters?.toString() || null,
          elevation_loss_meters: parsedData.elevationLossMeters?.toString() || null,
        });

        this.logger.log(`Created workout route: ${route.id}`);

        // Create route markers from laps
        if (parsedData.laps.length > 0) {
          let cumulativeTime = 0;
          const markersToCreate = parsedData.laps.map((lap) => {
            cumulativeTime += lap.totalTimeSeconds;
            return {
              workout_route_id: route.id,
              marker_type: 'km',
              marker_number: lap.lapNumber,
              latitude: (lap.startLatitude || parsedData.routePoints[0]?.latitude || 0).toString(),
              longitude: (lap.startLongitude || parsedData.routePoints[0]?.longitude || 0).toString(),
              elevation_meters: lap.startElevation?.toString() || null,
              recorded_at: lap.startTime,
              split_time_seconds: Math.round(lap.totalTimeSeconds),
              cumulative_time_seconds: Math.round(cumulativeTime),
              avg_heart_rate: lap.avgHeartRate ? Math.round(lap.avgHeartRate) : null,
              avg_pace_seconds_per_km: lap.avgPaceSecondsPerKm ? Math.round(lap.avgPaceSecondsPerKm) : null,
            };
          });

          await this.workoutRouteRepository.createMarkers(markersToCreate);
          this.logger.log(`Created ${markersToCreate.length} route markers`);
        }
      }

      // Mark the linked schedule as completed if present
      if (importRecord.workout_schedule_id) {
        await this.workoutScheduleRepository.updateById(importRecord.workout_schedule_id, {
          completed_at: parsedData.endTime || parsedData.startTime,
        });
        this.logger.log(`Marked schedule ${importRecord.workout_schedule_id} as completed`);
      }

      // Update import record as completed
      const finalRecord = await this.importRepository.updateById(uploadId, {
        status: WorkoutFileImportStatus.COMPLETED,
        workout_execution_id: execution.id,
        processed_at: new Date(),
      });

      return {
        data: this.mapToResultDTO(finalRecord),
      };
    } catch (error) {
      this.logger.error('Failed to process workout file:', error);

      // Update import record as failed
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      const failedRecord = await this.importRepository.updateById(uploadId, {
        status: WorkoutFileImportStatus.FAILED,
        error_message: errorMessage,
        processed_at: new Date(),
      });

      return {
        data: this.mapToResultDTO(failedRecord),
      };
    }
  }

  async getUploadStatus(req: Request & { user: AuthUser }, uploadId: string): Promise<WorkoutFileUploadResultResponse> {
    const importRecord = await this.importRepository.findById(uploadId);

    if (!importRecord) {
      throw new NotFoundException('Import record not found');
    }

    if (importRecord.user_id !== req.user.id) {
      throw new ForbiddenException('Access denied');
    }

    return {
      data: this.mapToResultDTO(importRecord),
    };
  }

  private async streamToBuffer(readable: stream.Readable): Promise<Buffer> {
    const chunks: Buffer[] = [];
    for await (const chunk of readable) {
      chunks.push(Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }

  private calculateRouteDistance(points: { latitude: number; longitude: number }[]): number {
    let distance = 0;
    for (let i = 1; i < points.length; i++) {
      distance += this.haversineDistance(
        points[i - 1].latitude,
        points[i - 1].longitude,
        points[i].latitude,
        points[i].longitude,
      );
    }
    return distance;
  }

  private haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371000; // Earth radius in meters
    const dLat = this.toRad(lat2 - lat1);
    const dLon = this.toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRad(lat1)) * Math.cos(this.toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  private toRad(deg: number): number {
    return deg * (Math.PI / 180);
  }

  private mapToResultDTO(record: WorkoutFileImport): WorkoutFileUploadResultDTO {
    return {
      uploadId: record.id,
      status: record.status,
      workoutExecutionId: record.workout_execution_id || undefined,
      error: record.error_message || undefined,
    };
  }

  private mapToDTO(record: WorkoutFileImport): WorkoutFileImportDTO {
    const createdAt = record.created_at instanceof Date ? record.created_at.toISOString() : String(record.created_at);

    return {
      id: record.id,
      fileName: record.file_name,
      fileFormat: record.file_format,
      status: record.status,
      workoutScheduleId: record.workout_schedule_id || undefined,
      workoutExecutionId: record.workout_execution_id || undefined,
      errorMessage: record.error_message || undefined,
      createdAt,
    };
  }
}

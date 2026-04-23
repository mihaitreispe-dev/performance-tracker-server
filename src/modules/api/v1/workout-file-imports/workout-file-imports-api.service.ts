import * as stream from 'node:stream';

import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { type Request } from 'express';
import {
  CardioStepMode,
  CardioStepType,
  GeoJSONLineString,
  WorkoutDifficulty,
  WorkoutExecutionSource,
  WorkoutFileImport,
  WorkoutFileImportStatus,
  WorkoutType,
} from 'src/database/interfaces';
import { s3Keys } from 'src/lib/util/s3-keys';
import { AuthUser } from 'src/modules/auth/types/authenticated-user';
import { S3Service } from 'src/modules/s3/s3.service';
import { WeatherService } from 'src/modules/weather/weather.service';
import { CardioMetricsRepository } from 'src/repositories/cardio-metrics.repository';
import { CardioStepRepository } from 'src/repositories/cardio-step.repository';
import { WorkoutRepository } from 'src/repositories/workout.repository';
import { WorkoutExecutionRepository } from 'src/repositories/workout-execution.repository';
import { WorkoutFileImportRepository } from 'src/repositories/workout-file-import.repository';
import { WorkoutRouteRepository } from 'src/repositories/workout-route.repository';
import { WorkoutScheduleRepository } from 'src/repositories/workout-schedule.repository';
import { v4 as uuidv4 } from 'uuid';

import { ConfirmImportBody, ImportSportType, LapIntensity, ParsedLapDTO, RequestUploadBody } from './request.dto';
import {
  ImportPreviewDTO,
  ImportPreviewResponse,
  WorkoutFileImportDTO,
  WorkoutFileUploadResultDTO,
  WorkoutFileUploadResultResponse,
  WorkoutFileUploadUrlResponse,
} from './response.dto';
import {
  DetectedSportType,
  ParsedLap,
  ParsedWorkoutFile,
  WorkoutFileParserService,
} from './workout-file-parser.service';

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
    private readonly workoutRepository: WorkoutRepository,
    private readonly cardioStepRepository: CardioStepRepository,
    private readonly weatherService: WeatherService,
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

        // Fetch weather data asynchronously (fire and forget)
        const firstPoint = parsedData.routePoints[0];
        this.weatherService
          .fetchAndStoreWeather({
            workoutExecutionId: execution.id,
            latitude: firstPoint.latitude,
            longitude: firstPoint.longitude,
            startedAt: parsedData.startTime,
          })
          .catch((err) => this.logger.error(`Failed to fetch weather for imported workout: ${err.message}`));

        // Create route markers from laps (only for valid km or mile laps)
        if (parsedData.laps.length > 0) {
          const markersToCreate = this.createMarkersFromLaps(route.id, parsedData.laps, parsedData.routePoints[0]);

          if (markersToCreate.length > 0) {
            await this.workoutRouteRepository.createMarkers(markersToCreate);
            this.logger.log(`Created ${markersToCreate.length} route markers`);
          }
        }
      }

      const scheduleId = importRecord.workout_schedule_id;

      // If a schedule was linked (import to existing workout), mark it as completed
      if (scheduleId) {
        await this.workoutScheduleRepository.updateById(scheduleId, {
          completed_at: parsedData.endTime || parsedData.startTime,
        });
        this.logger.log(`Marked schedule ${scheduleId} as completed`);

        // Update import record as completed
        const finalRecord = await this.importRepository.updateById(uploadId, {
          status: WorkoutFileImportStatus.COMPLETED,
          workout_execution_id: execution.id,
          processed_at: new Date(),
        });

        return {
          data: this.mapToResultDTO(finalRecord, {
            executionStartedAt: parsedData.startTime,
            sportType: parsedData.sportType,
            scheduleId,
          }),
        };
      }

      // For standalone imports (no schedule linked), mark as PROCESSING
      // The workout will be created when user confirms via /confirm endpoint
      const processingRecord = await this.importRepository.updateById(uploadId, {
        status: WorkoutFileImportStatus.PROCESSING,
        workout_execution_id: execution.id,
      });

      return {
        data: this.mapToResultDTO(processingRecord, {
          executionStartedAt: parsedData.startTime,
          sportType: parsedData.sportType,
        }),
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

    // Fetch execution start time if the import completed successfully
    let executionStartedAt: Date | null = null;
    if (importRecord.workout_execution_id) {
      const execution = await this.workoutExecutionRepository.findById(importRecord.workout_execution_id);
      executionStartedAt = execution?.started_at || null;
    }

    return {
      data: this.mapToResultDTO(importRecord, { executionStartedAt }),
    };
  }

  /**
   * Parse uploaded file and return preview data without creating workout
   */
  async getImportPreview(req: Request & { user: AuthUser }, uploadId: string): Promise<ImportPreviewResponse> {
    const importRecord = await this.importRepository.findById(uploadId);

    if (!importRecord) {
      throw new NotFoundException('Import record not found');
    }

    if (importRecord.user_id !== req.user.id) {
      throw new ForbiddenException('Access denied');
    }

    // Download and parse the file
    const fileStream = await this.s3Service.getObjectStream({
      bucket: importRecord.s3_bucket,
      key: importRecord.s3_key,
    });

    const fileBuffer = await this.streamToBuffer(fileStream);
    const parsedData = await this.parserService.parse(fileBuffer, importRecord.file_format);

    // Generate suggested name
    const suggestedName = this.generateWorkoutName(
      parsedData.sportType,
      parsedData.sportName,
      parsedData.startTime,
      parsedData.totalDistanceMeters,
    );

    // Map parsed laps to DTOs
    const rawLaps: ParsedLapDTO[] = parsedData.laps.map((lap) => ({
      lapNumber: lap.lapNumber,
      durationSeconds: Math.round(lap.totalTimeSeconds),
      elapsedTimeSeconds: Math.round(lap.elapsedTimeSeconds),
      distanceMeters: Math.round(lap.distanceMeters),
      avgHeartRate: lap.avgHeartRate ? Math.round(lap.avgHeartRate) : undefined,
      avgPaceSecondsPerKm: lap.avgPaceSecondsPerKm ? Math.round(lap.avgPaceSecondsPerKm) : undefined,
      name: lap.name,
      intensity: lap.intensity as LapIntensity | undefined,
      notes: lap.name || `Lap ${lap.lapNumber}`,
    }));

    // Merge adjacent warmup, cooldown, and rest laps
    const laps = this.mergeAdjacentLaps(rawLaps);

    // Map pauses to DTOs
    const pauses = parsedData.pauses.map((pause) => ({
      startTime: pause.startTime.toISOString(),
      endTime: pause.endTime.toISOString(),
      durationSeconds: Math.round(pause.durationSeconds),
    }));

    return {
      data: {
        uploadId,
        suggestedName,
        sportType: parsedData.sportType as ImportSportType,
        sportName: parsedData.sportName,
        startTime: parsedData.startTime.toISOString(),
        endTime: parsedData.endTime?.toISOString(),
        totalDurationSeconds: parsedData.totalDurationSeconds ? Math.round(parsedData.totalDurationSeconds) : undefined,
        elapsedDurationSeconds: parsedData.elapsedDurationSeconds
          ? Math.round(parsedData.elapsedDurationSeconds)
          : undefined,
        totalDistanceMeters: parsedData.totalDistanceMeters ? Math.round(parsedData.totalDistanceMeters) : undefined,
        elevationGainMeters: parsedData.elevationGainMeters ? Math.round(parsedData.elevationGainMeters) : undefined,
        laps,
        metricsCount: parsedData.metrics.length,
        hasRouteData: parsedData.routePoints.length > 0,
        pauses,
      },
    };
  }

  /**
   * Confirm import and create workout with (possibly modified) data
   */
  async confirmImport(
    req: Request & { user: AuthUser },
    uploadId: string,
    body: ConfirmImportBody,
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
      // Download and parse the file again (we need the metrics and route data)
      const fileStream = await this.s3Service.getObjectStream({
        bucket: importRecord.s3_bucket,
        key: importRecord.s3_key,
      });

      const fileBuffer = await this.streamToBuffer(fileStream);
      const parsedData = await this.parserService.parse(fileBuffer, importRecord.file_format);

      // Determine the source based on file format
      const sourceMap: Record<string, WorkoutExecutionSource> = {
        fit: WorkoutExecutionSource.GARMIN,
        tcx: WorkoutExecutionSource.GARMIN,
        gpx: WorkoutExecutionSource.MANUAL,
      };
      const source = sourceMap[importRecord.file_format] || WorkoutExecutionSource.MANUAL;

      // Create workout execution
      const execution = await this.workoutExecutionRepository.create({
        user_id: req.user.id,
        workout_schedule_id: body.workoutScheduleId || null,
        started_at: parsedData.startTime,
        completed_at: parsedData.endTime || null,
        duration_seconds: parsedData.totalDurationSeconds ? Math.round(parsedData.totalDurationSeconds) : null,
        source,
        external_id: `import-${importRecord.id}`,
        notes: `Imported from ${importRecord.file_name}`,
      });

      this.logger.log(`Created workout execution: ${execution.id}`);

      // Create cardio metrics
      if (parsedData.metrics.length > 0) {
        const sampledMetrics =
          parsedData.metrics.length > 5000 ? parsedData.metrics.filter((_, i) => i % 5 === 0) : parsedData.metrics;

        const metricsToCreate = sampledMetrics.map((m) => ({
          workout_execution_id: execution.id,
          metric_type: m.metricType,
          recorded_at: m.recordedAt,
          value: m.value.toString(),
          unit: m.unit,
        }));

        for (let i = 0; i < metricsToCreate.length; i += 1000) {
          const batch = metricsToCreate.slice(i, i + 1000);
          await this.cardioMetricsRepository.createMany(batch);
        }

        this.logger.log(`Created ${metricsToCreate.length} cardio metrics`);
      }

      // Create route if we have GPS data
      if (parsedData.routePoints.length > 0) {
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

        const totalDistance = parsedData.totalDistanceMeters || this.calculateRouteDistance(parsedData.routePoints);

        const route = await this.workoutRouteRepository.create({
          workout_execution_id: execution.id,
          route_geojson: routeGeojson,
          total_distance_meters: totalDistance.toString(),
          elevation_gain_meters: parsedData.elevationGainMeters?.toString() || null,
          elevation_loss_meters: parsedData.elevationLossMeters?.toString() || null,
        });

        this.logger.log(`Created workout route: ${route.id}`);

        // Fetch weather data asynchronously (fire and forget)
        const firstPointConfirm = parsedData.routePoints[0];
        this.weatherService
          .fetchAndStoreWeather({
            workoutExecutionId: execution.id,
            latitude: firstPointConfirm.latitude,
            longitude: firstPointConfirm.longitude,
            startedAt: parsedData.startTime,
          })
          .catch((err) => this.logger.error(`Failed to fetch weather for confirmed import: ${err.message}`));

        // Create route markers from laps (only for valid km or mile laps)
        if (parsedData.laps.length > 0) {
          const markersToCreate = this.createMarkersFromLaps(route.id, parsedData.laps, parsedData.routePoints[0]);

          if (markersToCreate.length > 0) {
            await this.workoutRouteRepository.createMarkers(markersToCreate);
            this.logger.log(`Created ${markersToCreate.length} route markers`);
          }
        }
      }

      // Create workout and schedule using user-provided data
      const workoutAndSchedule = await this.createWorkoutFromUserData(
        req.user.id,
        body.workoutName,
        body.description,
        body.sportType,
        parsedData.startTime,
        body.laps,
        parsedData.totalDistanceMeters,
        parsedData.totalDurationSeconds,
      );

      // Update execution to link to the schedule
      await this.workoutExecutionRepository.updateById(execution.id, {
        workout_schedule_id: workoutAndSchedule.scheduleId,
      });

      // Mark the schedule as completed
      await this.workoutScheduleRepository.updateById(workoutAndSchedule.scheduleId, {
        completed_at: parsedData.endTime || parsedData.startTime,
      });

      this.logger.log(`Created workout ${workoutAndSchedule.workoutId} and schedule ${workoutAndSchedule.scheduleId}`);

      // Update import record as completed
      const finalRecord = await this.importRepository.updateById(uploadId, {
        status: WorkoutFileImportStatus.COMPLETED,
        workout_execution_id: execution.id,
        processed_at: new Date(),
      });

      return {
        data: this.mapToResultDTO(finalRecord, {
          executionStartedAt: parsedData.startTime,
          sportType: body.sportType,
          workoutId: workoutAndSchedule.workoutId,
          scheduleId: workoutAndSchedule.scheduleId,
        }),
      };
    } catch (error) {
      this.logger.error('Failed to process workout file:', error);

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

  /**
   * Create workout from user-provided data (from preview/edit flow)
   */
  private async createWorkoutFromUserData(
    userId: string,
    workoutName: string,
    description: string | undefined,
    sportType: ImportSportType,
    startTime: Date,
    laps: ParsedLapDTO[],
    totalDistanceMeters: number | undefined,
    totalDurationSeconds: number | undefined,
  ): Promise<{ workoutId: string; scheduleId: string }> {
    // Map import sport type to workout type
    const workoutTypeMap: Record<ImportSportType, WorkoutType> = {
      [ImportSportType.RUN]: WorkoutType.RUN,
      [ImportSportType.CYCLING]: WorkoutType.CYCLING,
      [ImportSportType.SWIMMING]: WorkoutType.SWIMMING,
      [ImportSportType.STRENGTH]: WorkoutType.STRENGTH,
      [ImportSportType.CARDIO]: WorkoutType.CARDIO,
      [ImportSportType.FLEXIBILITY]: WorkoutType.FLEXIBILITY,
      [ImportSportType.HIIT]: WorkoutType.HIIT,
      [ImportSportType.CIRCUIT]: WorkoutType.CIRCUIT,
      [ImportSportType.WALKING]: WorkoutType.WALKING,
      [ImportSportType.CUSTOM]: WorkoutType.CUSTOM,
    };
    const workoutType = workoutTypeMap[sportType] || WorkoutType.CUSTOM;

    // Create the workout
    const workout = await this.workoutRepository.create({
      user_id: userId,
      name: workoutName,
      description: description || 'Imported activity.',
      type: workoutType,
      difficulty: this.estimateDifficulty([], totalDurationSeconds),
      cardio_category_id: null,
    });

    // Create cardio steps from laps
    if (laps.length > 0) {
      await this.createCardioStepsFromLapDTOs(workout.id, laps);
    } else if (totalDistanceMeters && totalDurationSeconds) {
      await this.createSingleCardioStep(workout.id, totalDistanceMeters, totalDurationSeconds);
    }

    // Create a schedule for the workout date
    const scheduledDate = new Date(startTime);
    scheduledDate.setHours(0, 0, 0, 0);

    const schedule = await this.workoutScheduleRepository.create({
      user_id: userId,
      workout_id: workout.id,
      scheduled_date: scheduledDate,
      workout_plan_id: null,
      coach_notes: null,
      created_by_coach_id: null,
    });

    return { workoutId: workout.id, scheduleId: schedule.id };
  }

  /**
   * Map lap intensity to cardio step type
   */
  private mapIntensityToStepType(intensity: LapIntensity | undefined): CardioStepType {
    if (!intensity) return CardioStepType.ACTIVITY;

    const typeMap: Record<LapIntensity, CardioStepType> = {
      [LapIntensity.WARMUP]: CardioStepType.WARM_UP,
      [LapIntensity.COOLDOWN]: CardioStepType.COOL_DOWN,
      [LapIntensity.REST]: CardioStepType.REST,
      [LapIntensity.ACTIVE]: CardioStepType.ACTIVITY,
    };

    return typeMap[intensity] || CardioStepType.ACTIVITY;
  }

  /**
   * Create cardio steps from user-provided lap DTOs
   */
  private async createCardioStepsFromLapDTOs(workoutId: string, laps: ParsedLapDTO[]): Promise<void> {
    const stepsData = laps.map((lap) => ({
      type: this.mapIntensityToStepType(lap.intensity),
      mode: CardioStepMode.DISTANCE,
      duration: Math.round(lap.durationSeconds),
      distance: Math.round(lap.distanceMeters),
      hr_min: lap.avgHeartRate ? Math.round(Math.max(0, lap.avgHeartRate - 10)) : null,
      hr_max: lap.avgHeartRate ? Math.round(lap.avgHeartRate + 10) : null,
      hr_zone: null,
      power_min: null,
      power_max: null,
      power_zone: null,
      pace_min: lap.avgPaceSecondsPerKm ? Math.round(Math.max(0, lap.avgPaceSecondsPerKm - 15)) : null,
      pace_max: lap.avgPaceSecondsPerKm ? Math.round(lap.avgPaceSecondsPerKm + 15) : null,
      pace_zone: null,
      rpe_min: null,
      rpe_max: null,
      rpe_zone: null,
      notes: lap.notes || lap.name || `Lap ${lap.lapNumber}`,
    }));

    const steps = await this.cardioStepRepository.createMany(stepsData);

    const workoutItems = steps.map((step, index) => ({
      workout_id: workoutId,
      position: index,
      exercise_instance_id: null,
      exercise_instance_group_id: null,
      cardio_step_id: step.id,
      cardio_step_group_id: null,
    }));

    await this.workoutRepository.createWorkoutItems(workoutItems);
  }

  /**
   * Generate a suggested workout name
   */
  private generateWorkoutName(
    sportType: DetectedSportType,
    sportName: string | undefined,
    startTime: Date,
    totalDistanceMeters: number | undefined,
  ): string {
    const dateStr = startTime.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });
    const sportLabel = this.getSportLabel(sportType, sportName);
    const distanceStr = totalDistanceMeters ? ` - ${(totalDistanceMeters / 1000).toFixed(1)}km` : '';
    return `${sportLabel} ${dateStr}${distanceStr}`;
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

  private mapToResultDTO(
    record: WorkoutFileImport,
    options?: {
      executionStartedAt?: Date | null;
      sportType?: DetectedSportType | ImportSportType;
      workoutId?: string;
      scheduleId?: string;
    },
  ): WorkoutFileUploadResultDTO {
    return {
      uploadId: record.id,
      status: record.status,
      workoutExecutionId: record.workout_execution_id || undefined,
      workoutExecutionStartedAt: options?.executionStartedAt?.toISOString() || undefined,
      sportType: options?.sportType,
      workoutId: options?.workoutId,
      workoutScheduleId: options?.scheduleId,
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

  /**
   * Create a workout with cardio steps from parsed file data
   */
  private async createWorkoutFromParsedData(
    userId: string,
    sportType: DetectedSportType,
    sportName: string | undefined,
    startTime: Date,
    laps: ParsedLap[],
    totalDistanceMeters: number | undefined,
    totalDurationSeconds: number | undefined,
    fileName: string,
  ): Promise<{ workoutId: string; scheduleId: string }> {
    // Map sport type to workout type
    const workoutTypeMap: Record<DetectedSportType, WorkoutType> = {
      run: WorkoutType.RUN,
      cycling: WorkoutType.CYCLING,
      swimming: WorkoutType.SWIMMING,
      unknown: WorkoutType.CARDIO,
    };
    const workoutType = workoutTypeMap[sportType];

    // Generate workout name
    const dateStr = startTime.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });
    const sportLabel = this.getSportLabel(sportType, sportName);
    const distanceStr = totalDistanceMeters ? ` - ${(totalDistanceMeters / 1000).toFixed(1)}km` : '';
    const workoutName = `${sportLabel} ${dateStr}${distanceStr}`;

    // Generate description
    const durationStr = totalDurationSeconds ? this.formatDuration(totalDurationSeconds) : 'Unknown duration';
    const description = `Imported activity from ${fileName}. Duration: ${durationStr}.`;

    // Create the workout
    const workout = await this.workoutRepository.create({
      user_id: userId,
      name: workoutName,
      description,
      type: workoutType,
      difficulty: this.estimateDifficulty(laps, totalDurationSeconds),
      cardio_category_id: null,
    });

    // Merge adjacent warmup/cooldown/rest laps before creating steps
    const mergedLaps = this.mergeAdjacentParsedLaps(laps);

    // Create cardio steps from merged laps
    if (mergedLaps.length > 0) {
      await this.createCardioStepsFromLaps(workout.id, mergedLaps);
    } else if (totalDistanceMeters && totalDurationSeconds) {
      // If no laps, create a single activity step
      await this.createSingleCardioStep(workout.id, totalDistanceMeters, totalDurationSeconds);
    }

    // Create a schedule for the workout date
    // Use the date part only (normalize to midnight)
    const scheduledDate = new Date(startTime);
    scheduledDate.setHours(0, 0, 0, 0);

    const schedule = await this.workoutScheduleRepository.create({
      user_id: userId,
      workout_id: workout.id,
      scheduled_date: scheduledDate,
      workout_plan_id: null,
      coach_notes: null,
      created_by_coach_id: null,
    });

    return { workoutId: workout.id, scheduleId: schedule.id };
  }

  /**
   * Map parsed lap intensity to cardio step type
   */
  private mapParsedIntensityToStepType(intensity: ParsedLap['intensity']): CardioStepType {
    if (!intensity) return CardioStepType.ACTIVITY;

    const typeMap: Record<NonNullable<ParsedLap['intensity']>, CardioStepType> = {
      warmup: CardioStepType.WARM_UP,
      cooldown: CardioStepType.COOL_DOWN,
      rest: CardioStepType.REST,
      active: CardioStepType.ACTIVITY,
    };

    return typeMap[intensity] || CardioStepType.ACTIVITY;
  }

  /**
   * Create cardio steps from parsed laps
   */
  private async createCardioStepsFromLaps(workoutId: string, laps: ParsedLap[]): Promise<void> {
    // Create cardio steps for each lap
    const stepsData = laps.map((lap) => ({
      type: this.mapParsedIntensityToStepType(lap.intensity),
      mode: CardioStepMode.DISTANCE,
      duration: Math.round(lap.totalTimeSeconds),
      distance: Math.round(lap.distanceMeters),
      hr_min: lap.avgHeartRate ? Math.round(Math.max(0, lap.avgHeartRate - 10)) : null,
      hr_max: lap.avgHeartRate ? Math.round(lap.avgHeartRate + 10) : null,
      hr_zone: null,
      power_min: null,
      power_max: null,
      power_zone: null,
      pace_min: lap.avgPaceSecondsPerKm ? Math.round(Math.max(0, lap.avgPaceSecondsPerKm - 15)) : null,
      pace_max: lap.avgPaceSecondsPerKm ? Math.round(lap.avgPaceSecondsPerKm + 15) : null,
      pace_zone: null,
      rpe_min: null,
      rpe_max: null,
      rpe_zone: null,
      notes: lap.name || `Lap ${lap.lapNumber}`,
    }));

    const steps = await this.cardioStepRepository.createMany(stepsData);

    // Create workout items to link steps to the workout
    const workoutItems = steps.map((step, index) => ({
      workout_id: workoutId,
      position: index,
      exercise_instance_id: null,
      exercise_instance_group_id: null,
      cardio_step_id: step.id,
      cardio_step_group_id: null,
    }));

    await this.workoutRepository.createWorkoutItems(workoutItems);
  }

  /**
   * Create a single cardio step when no laps are available
   */
  private async createSingleCardioStep(
    workoutId: string,
    distanceMeters: number,
    durationSeconds: number,
  ): Promise<void> {
    const avgPace = (durationSeconds / distanceMeters) * 1000;

    const step = await this.cardioStepRepository.create({
      type: CardioStepType.ACTIVITY,
      mode: CardioStepMode.DISTANCE,
      duration: Math.round(durationSeconds),
      distance: Math.round(distanceMeters),
      hr_min: null,
      hr_max: null,
      hr_zone: null,
      power_min: null,
      power_max: null,
      power_zone: null,
      pace_min: Math.round(Math.max(0, avgPace - 15)),
      pace_max: Math.round(avgPace + 15),
      pace_zone: null,
      rpe_min: null,
      rpe_max: null,
      rpe_zone: null,
      notes: 'Main activity',
    });

    await this.workoutRepository.createWorkoutItems([
      {
        workout_id: workoutId,
        position: 0,
        exercise_instance_id: null,
        exercise_instance_group_id: null,
        cardio_step_id: step.id,
        cardio_step_group_id: null,
      },
    ]);
  }

  private getSportLabel(sportType: DetectedSportType, sportName?: string): string {
    if (sportName) {
      // Clean up sport name (e.g., "running_trail" -> "Trail Run")
      const cleanName = sportName
        .replace(/_/g, ' ')
        .replace(/running/i, 'Run')
        .replace(/cycling/i, 'Ride')
        .replace(/swimming/i, 'Swim');
      return cleanName.charAt(0).toUpperCase() + cleanName.slice(1);
    }

    const labels: Record<DetectedSportType, string> = {
      run: 'Run',
      cycling: 'Ride',
      swimming: 'Swim',
      unknown: 'Activity',
    };
    return labels[sportType];
  }

  private formatDuration(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.round(seconds % 60);

    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    if (minutes > 0) {
      return `${minutes}m ${secs}s`;
    }
    return `${secs}s`;
  }

  private estimateDifficulty(laps: ParsedLap[], totalDurationSeconds?: number): WorkoutDifficulty {
    // Simple heuristic based on duration
    const duration = totalDurationSeconds || laps.reduce((sum, lap) => sum + lap.totalTimeSeconds, 0);

    if (duration < 20 * 60) return WorkoutDifficulty.EASY; // < 20 min
    if (duration < 45 * 60) return WorkoutDifficulty.MODERATE; // < 45 min
    if (duration < 90 * 60) return WorkoutDifficulty.HARD; // < 90 min
    return WorkoutDifficulty.EXTREME; // >= 90 min
  }

  /**
   * Merge adjacent laps that have the same mergeable intensity (warmup, cooldown, rest).
   * Active laps and laps without intensity are not merged.
   */
  private mergeAdjacentLaps(laps: ParsedLapDTO[]): ParsedLapDTO[] {
    if (laps.length === 0) return [];

    const mergeableIntensities = new Set<LapIntensity>([LapIntensity.WARMUP, LapIntensity.COOLDOWN, LapIntensity.REST]);

    const result: ParsedLapDTO[] = [];
    let currentMerged: ParsedLapDTO | null = null;
    let mergedCount = 0;

    for (const lap of laps) {
      const isMergeable = lap.intensity && mergeableIntensities.has(lap.intensity);

      if (!isMergeable) {
        // Not mergeable - flush any pending merge and add this lap
        if (currentMerged) {
          result.push(this.finalizeMergedLap(currentMerged, mergedCount));
          currentMerged = null;
          mergedCount = 0;
        }
        result.push(lap);
        continue;
      }

      // This lap is mergeable
      if (currentMerged && currentMerged.intensity === lap.intensity) {
        // Same intensity as current merge - combine them
        currentMerged = this.combineLaps(currentMerged, lap);
        mergedCount++;
      } else {
        // Different intensity or first mergeable lap
        if (currentMerged) {
          result.push(this.finalizeMergedLap(currentMerged, mergedCount));
        }
        currentMerged = { ...lap };
        mergedCount = 1;
      }
    }

    // Flush any remaining merged lap
    if (currentMerged) {
      result.push(this.finalizeMergedLap(currentMerged, mergedCount));
    }

    // Renumber laps sequentially
    return result.map((lap, index) => ({
      ...lap,
      lapNumber: index + 1,
    }));
  }

  /**
   * Combine two laps into one, summing durations/distances and averaging HR/pace
   */
  private combineLaps(base: ParsedLapDTO, addition: ParsedLapDTO): ParsedLapDTO {
    const totalDuration = base.durationSeconds + addition.durationSeconds;
    const totalElapsedTime =
      (base.elapsedTimeSeconds ?? base.durationSeconds) + (addition.elapsedTimeSeconds ?? addition.durationSeconds);
    const totalDistance = base.distanceMeters + addition.distanceMeters;

    // Use elapsed time for weighted averages (moving time, more accurate)
    const baseElapsed = base.elapsedTimeSeconds ?? base.durationSeconds;
    const additionElapsed = addition.elapsedTimeSeconds ?? addition.durationSeconds;

    // Weighted average for heart rate (by elapsed time)
    let avgHeartRate: number | undefined;
    if (base.avgHeartRate !== undefined && addition.avgHeartRate !== undefined) {
      avgHeartRate = Math.round(
        (base.avgHeartRate * baseElapsed + addition.avgHeartRate * additionElapsed) / totalElapsedTime,
      );
    } else if (base.avgHeartRate !== undefined) {
      avgHeartRate = base.avgHeartRate;
    } else if (addition.avgHeartRate !== undefined) {
      avgHeartRate = addition.avgHeartRate;
    }

    // Weighted average for pace (by distance)
    let avgPaceSecondsPerKm: number | undefined;
    if (base.avgPaceSecondsPerKm !== undefined && addition.avgPaceSecondsPerKm !== undefined && totalDistance > 0) {
      avgPaceSecondsPerKm = Math.round(
        (base.avgPaceSecondsPerKm * base.distanceMeters + addition.avgPaceSecondsPerKm * addition.distanceMeters) /
          totalDistance,
      );
    } else if (base.avgPaceSecondsPerKm !== undefined) {
      avgPaceSecondsPerKm = base.avgPaceSecondsPerKm;
    } else if (addition.avgPaceSecondsPerKm !== undefined) {
      avgPaceSecondsPerKm = addition.avgPaceSecondsPerKm;
    }

    return {
      ...base,
      durationSeconds: totalDuration,
      elapsedTimeSeconds: totalElapsedTime,
      distanceMeters: totalDistance,
      avgHeartRate,
      avgPaceSecondsPerKm,
    };
  }

  /**
   * Finalize a merged lap with appropriate name and notes
   */
  private finalizeMergedLap(lap: ParsedLapDTO, mergedCount: number): ParsedLapDTO {
    const intensityNames: Record<LapIntensity, string> = {
      [LapIntensity.WARMUP]: 'Warm Up',
      [LapIntensity.COOLDOWN]: 'Cool Down',
      [LapIntensity.REST]: 'Recovery',
      [LapIntensity.ACTIVE]: 'Active',
    };

    const name = lap.intensity ? intensityNames[lap.intensity] : lap.name;
    const notes = mergedCount > 1 ? `${name} (${mergedCount} segments merged)` : name;

    return {
      ...lap,
      name,
      notes,
    };
  }

  /**
   * Merge adjacent parsed laps (internal ParsedLap format) with the same mergeable intensity.
   * Used when creating workouts from imported files.
   */
  private mergeAdjacentParsedLaps(laps: ParsedLap[]): ParsedLap[] {
    if (laps.length === 0) return [];

    const mergeableIntensities = new Set(['warmup', 'cooldown', 'rest']);

    const result: ParsedLap[] = [];
    let currentMerged: ParsedLap | null = null;
    let mergedCount = 0;

    for (const lap of laps) {
      const isMergeable = lap.intensity && mergeableIntensities.has(lap.intensity);

      if (!isMergeable) {
        // Not mergeable - flush any pending merge and add this lap
        if (currentMerged) {
          result.push(this.finalizeMergedParsedLap(currentMerged, mergedCount));
          currentMerged = null;
          mergedCount = 0;
        }
        result.push(lap);
        continue;
      }

      // This lap is mergeable
      if (currentMerged && currentMerged.intensity === lap.intensity) {
        // Same intensity as current merge - combine them
        currentMerged = this.combineParsedLaps(currentMerged, lap);
        mergedCount++;
      } else {
        // Different intensity or first mergeable lap
        if (currentMerged) {
          result.push(this.finalizeMergedParsedLap(currentMerged, mergedCount));
        }
        currentMerged = { ...lap };
        mergedCount = 1;
      }
    }

    // Flush any remaining merged lap
    if (currentMerged) {
      result.push(this.finalizeMergedParsedLap(currentMerged, mergedCount));
    }

    // Renumber laps sequentially
    return result.map((lap, index) => ({
      ...lap,
      lapNumber: index + 1,
    }));
  }

  /**
   * Combine two parsed laps into one
   */
  private combineParsedLaps(base: ParsedLap, addition: ParsedLap): ParsedLap {
    const totalDuration = base.totalTimeSeconds + addition.totalTimeSeconds;
    const totalDistance = base.distanceMeters + addition.distanceMeters;

    // Weighted average for heart rate (by duration)
    let avgHeartRate: number | undefined;
    if (base.avgHeartRate !== undefined && addition.avgHeartRate !== undefined) {
      avgHeartRate =
        (base.avgHeartRate * base.totalTimeSeconds + addition.avgHeartRate * addition.totalTimeSeconds) / totalDuration;
    } else if (base.avgHeartRate !== undefined) {
      avgHeartRate = base.avgHeartRate;
    } else if (addition.avgHeartRate !== undefined) {
      avgHeartRate = addition.avgHeartRate;
    }

    // Weighted average for pace (by distance)
    let avgPaceSecondsPerKm: number | undefined;
    if (base.avgPaceSecondsPerKm !== undefined && addition.avgPaceSecondsPerKm !== undefined && totalDistance > 0) {
      avgPaceSecondsPerKm =
        (base.avgPaceSecondsPerKm * base.distanceMeters + addition.avgPaceSecondsPerKm * addition.distanceMeters) /
        totalDistance;
    } else if (base.avgPaceSecondsPerKm !== undefined) {
      avgPaceSecondsPerKm = base.avgPaceSecondsPerKm;
    } else if (addition.avgPaceSecondsPerKm !== undefined) {
      avgPaceSecondsPerKm = addition.avgPaceSecondsPerKm;
    }

    return {
      ...base,
      totalTimeSeconds: totalDuration,
      distanceMeters: totalDistance,
      avgHeartRate,
      avgPaceSecondsPerKm,
    };
  }

  /**
   * Finalize a merged parsed lap with appropriate name
   */
  private finalizeMergedParsedLap(lap: ParsedLap, mergedCount: number): ParsedLap {
    const intensityNames: Record<string, string> = {
      warmup: 'Warm Up',
      cooldown: 'Cool Down',
      rest: 'Recovery',
      active: 'Active',
    };

    const name = lap.intensity ? intensityNames[lap.intensity] || lap.name : lap.name;

    return {
      ...lap,
      name: mergedCount > 1 ? `${name} (${mergedCount} segments)` : name,
    };
  }

  /**
   * Create route markers from laps, but only if laps represent valid km or mile splits.
   * Garmin watches can have various auto-lap settings (200m, 400m, 1km, 1 mile, etc.)
   * We only want to create markers for ~1km or ~1 mile splits.
   */
  private createMarkersFromLaps(
    routeId: string,
    laps: ParsedLap[],
    firstRoutePoint?: { latitude: number; longitude: number },
  ): {
    workout_route_id: string;
    marker_type: string;
    marker_number: number;
    latitude: string;
    longitude: string;
    elevation_meters: string | null;
    recorded_at: Date;
    split_time_seconds: number;
    cumulative_time_seconds: number;
    avg_heart_rate: number | null;
    avg_pace_seconds_per_km: number | null;
  }[] {
    if (laps.length === 0) return [];

    // Calculate average lap distance to determine lap type
    const lapsWithDistance = laps.filter((l) => l.distanceMeters > 0);
    if (lapsWithDistance.length === 0) return [];

    const totalDistance = lapsWithDistance.reduce((sum, l) => sum + l.distanceMeters, 0);
    const avgLapDistance = totalDistance / lapsWithDistance.length;

    // Determine marker type based on average lap distance
    // Allow 20% tolerance for GPS inaccuracy
    const isKmLap = avgLapDistance >= 800 && avgLapDistance <= 1200;
    const isMileLap = avgLapDistance >= 1400 && avgLapDistance <= 1900; // ~1609m +/- 15%

    if (!isKmLap && !isMileLap) {
      // Laps are not standard km or mile - skip creating markers
      // This handles 200m, 400m, or other custom auto-lap settings
      this.logger.log(
        `Skipping marker creation: average lap distance ${Math.round(avgLapDistance)}m is not a standard split`,
      );
      return [];
    }

    const markerType = isKmLap ? 'km' : 'mile';
    this.logger.log(
      `Creating ${markerType} markers from ${laps.length} laps (avg distance: ${Math.round(avgLapDistance)}m)`,
    );

    let cumulativeTime = 0;
    let markerNumber = 0;

    return laps
      .filter((lap) => {
        // Only include laps that are close to the expected distance
        const expectedDistance = isKmLap ? 1000 : 1609;
        const tolerance = expectedDistance * 0.25; // 25% tolerance
        return lap.distanceMeters >= expectedDistance - tolerance && lap.distanceMeters <= expectedDistance + tolerance;
      })
      .map((lap) => {
        cumulativeTime += lap.totalTimeSeconds;
        markerNumber++;

        return {
          workout_route_id: routeId,
          marker_type: markerType,
          marker_number: markerNumber,
          latitude: (lap.startLatitude || firstRoutePoint?.latitude || 0).toString(),
          longitude: (lap.startLongitude || firstRoutePoint?.longitude || 0).toString(),
          elevation_meters: lap.startElevation?.toString() || null,
          recorded_at: lap.startTime,
          split_time_seconds: Math.round(lap.totalTimeSeconds),
          cumulative_time_seconds: Math.round(cumulativeTime),
          avg_heart_rate: lap.avgHeartRate ? Math.round(lap.avgHeartRate) : null,
          avg_pace_seconds_per_km: lap.avgPaceSecondsPerKm ? Math.round(lap.avgPaceSecondsPerKm) : null,
        };
      });
  }
}

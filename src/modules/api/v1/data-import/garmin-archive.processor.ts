import * as path from 'node:path';

import { Injectable, Logger } from '@nestjs/common';
import AdmZip from 'adm-zip';
import { DataImportJob, GeoJSONLineString, WorkoutExecutionSource, WorkoutFileFormat } from 'src/database/interfaces';
import { CardioMetricsRepository } from 'src/repositories/cardio-metrics.repository';
import { DataImportJobRepository } from 'src/repositories/data-import-job.repository';
import { WorkoutExecutionRepository } from 'src/repositories/workout-execution.repository';
import { WorkoutRouteRepository } from 'src/repositories/workout-route.repository';

import { WorkoutFileParserService } from '../workout-file-imports/workout-file-parser.service';
import { ArchiveProcessingResult } from './strava-archive.processor';

@Injectable()
export class GarminArchiveProcessor {
  private readonly logger = new Logger(GarminArchiveProcessor.name);

  constructor(
    private readonly workoutFileParser: WorkoutFileParserService,
    private readonly workoutExecutionRepo: WorkoutExecutionRepository,
    private readonly cardioMetricsRepo: CardioMetricsRepository,
    private readonly workoutRouteRepo: WorkoutRouteRepository,
    private readonly dataImportJobRepo: DataImportJobRepository,
  ) {}

  async processArchive(zipBuffer: Buffer, job: DataImportJob): Promise<ArchiveProcessingResult> {
    const result: ArchiveProcessingResult = {
      totalFiles: 0,
      processedCount: 0,
      skippedCount: 0,
      failedCount: 0,
      errors: [],
    };

    try {
      const zip = new AdmZip(zipBuffer);
      const zipEntries = zip.getEntries();

      // Garmin export structure:
      // - DI_CONNECT/DI-Connect-Fitness/
      //   - UploadedFiles_{user_id}/ (contains FIT files)
      //   - {user_id}_Activities.csv (metadata)
      //   - Activities/ (may contain additional files)
      const activityFiles = zipEntries.filter((entry) => {
        const entryPath = entry.entryName.toLowerCase();
        return (
          !entry.isDirectory &&
          (entryPath.includes('uploadedfiles') ||
            entryPath.includes('activities/') ||
            entryPath.includes('fitness/')) &&
          (entryPath.endsWith('.fit') ||
            entryPath.endsWith('.fit.gz') ||
            entryPath.endsWith('.gpx') ||
            entryPath.endsWith('.tcx'))
        );
      });

      result.totalFiles = activityFiles.length;

      // Update job with total items
      await this.dataImportJobRepo.updateById(job.id, {
        total_items: result.totalFiles,
      });

      this.logger.log(`Found ${result.totalFiles} activity files in Garmin archive`);

      // Process each activity file
      for (const entry of activityFiles) {
        try {
          const fileName = path.basename(entry.entryName);
          let fileBuffer = entry.getData();

          // Handle gzipped files
          if (entry.entryName.endsWith('.gz')) {
            const zlib = await import('node:zlib');
            fileBuffer = zlib.gunzipSync(fileBuffer);
          }

          // Determine file format
          const format = this.getFileFormat(entry.entryName);
          if (!format) {
            result.skippedCount++;
            continue;
          }

          // Try to extract activity ID from filename
          // Garmin pattern: {activity_id}.fit, {activity_id}_ACTIVITY.fit, etc.
          const externalId = this.extractGarminActivityId(fileName);

          // Check if already imported
          if (externalId) {
            const existing = await this.workoutExecutionRepo.findByExternalId(
              externalId,
              WorkoutExecutionSource.GARMIN,
            );
            if (existing) {
              this.logger.debug(`Skipping already imported activity: ${externalId}`);
              result.skippedCount++;
              await this.updateProgress(job.id, result);
              continue;
            }
          }

          // Parse the workout file
          const parsed = await this.workoutFileParser.parse(fileBuffer, format);

          // Create workout execution
          const execution = await this.workoutExecutionRepo.create({
            user_id: job.user_id,
            workout_schedule_id: null,
            started_at: parsed.startTime,
            completed_at:
              parsed.endTime ?? new Date(parsed.startTime.getTime() + (parsed.totalDurationSeconds ?? 0) * 1000),
            duration_seconds: parsed.totalDurationSeconds ?? null,
            source: WorkoutExecutionSource.GARMIN,
            external_id: externalId ?? `garmin_archive:${fileName}`,
            notes: `Imported from Garmin Connect archive: ${fileName}`,
          });

          // Create route if we have GPS data
          if (parsed.routePoints.length > 0) {
            const hasElevation = parsed.routePoints.some((p) => p.elevation !== undefined);
            const coordinates: GeoJSONLineString['coordinates'] = hasElevation
              ? parsed.routePoints.map((p) => [p.longitude, p.latitude, p.elevation ?? 0] as [number, number, number])
              : parsed.routePoints.map((p) => [p.longitude, p.latitude] as [number, number]);

            await this.workoutRouteRepo.create({
              workout_execution_id: execution.id,
              route_geojson: {
                type: 'LineString',
                coordinates,
              },
              total_distance_meters: String(parsed.totalDistanceMeters ?? 0),
              elevation_gain_meters: parsed.elevationGainMeters ? String(parsed.elevationGainMeters) : null,
              elevation_loss_meters: parsed.elevationLossMeters ? String(parsed.elevationLossMeters) : null,
            });
          }

          // Create cardio metrics (sample them to avoid excessive data)
          const sampledMetrics = this.sampleMetrics(parsed.metrics, 100);
          for (const metric of sampledMetrics) {
            await this.cardioMetricsRepo.create({
              workout_execution_id: execution.id,
              metric_type: metric.metricType,
              recorded_at: metric.recordedAt,
              value: String(metric.value),
              unit: metric.unit,
            });
          }

          result.processedCount++;
          this.logger.debug(`Processed activity file: ${fileName}`);
        } catch (error) {
          result.failedCount++;
          result.errors.push(`${entry.entryName}: ${error instanceof Error ? error.message : String(error)}`);
          this.logger.error(`Failed to process ${entry.entryName}: ${error}`);
        }

        await this.updateProgress(job.id, result);
      }
    } catch (error) {
      this.logger.error(`Failed to process Garmin archive: ${error}`);
      throw error;
    }

    return result;
  }

  private getFileFormat(filePath: string): WorkoutFileFormat | null {
    const lowerPath = filePath.toLowerCase();
    if (lowerPath.endsWith('.fit') || lowerPath.endsWith('.fit.gz')) {
      return WorkoutFileFormat.FIT;
    }
    if (lowerPath.endsWith('.gpx')) {
      return WorkoutFileFormat.GPX;
    }
    if (lowerPath.endsWith('.tcx')) {
      return WorkoutFileFormat.TCX;
    }
    return null;
  }

  private extractGarminActivityId(fileName: string): string | null {
    // Garmin export filenames can be:
    // - {activity_id}.fit
    // - {activity_id}_ACTIVITY.fit
    // - activity_{activity_id}.fit
    const match = fileName.match(/(?:^|activity_?)(\d+)(?:_ACTIVITY)?\.(?:fit|gpx|tcx)/i);
    if (match) {
      return match[1];
    }
    return null;
  }

  private sampleMetrics(metrics: any[], maxPerType: number): any[] {
    // Group metrics by type
    const byType = new Map<string, any[]>();
    for (const metric of metrics) {
      const type = metric.metricType;
      if (!byType.has(type)) {
        byType.set(type, []);
      }
      byType.get(type)!.push(metric);
    }

    // Sample each type
    const sampled: any[] = [];
    for (const [, typeMetrics] of byType) {
      if (typeMetrics.length <= maxPerType) {
        sampled.push(...typeMetrics);
      } else {
        // Take evenly spaced samples
        const step = typeMetrics.length / maxPerType;
        for (let i = 0; i < maxPerType; i++) {
          sampled.push(typeMetrics[Math.floor(i * step)]);
        }
      }
    }

    return sampled;
  }

  private async updateProgress(jobId: string, result: ArchiveProcessingResult): Promise<void> {
    await this.dataImportJobRepo.updateProgress(jobId, result.processedCount, result.skippedCount, result.failedCount);
  }
}

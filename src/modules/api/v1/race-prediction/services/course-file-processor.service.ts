import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { WorkoutFileFormat } from 'src/database/interfaces';

import { ParsedRoutePoint, WorkoutFileParserService } from '../../workout-file-imports/workout-file-parser.service';
import { CourseProfile, ElevationPoint } from './course-analysis.service';

export interface CourseValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  stats: {
    pointCount: number;
    distanceMeters: number;
    elevationCoverage: number; // Percentage of points with elevation data
    averagePointSpacing: number; // Average meters between points
  };
}

@Injectable()
export class CourseFileProcessorService {
  private readonly logger = new Logger(CourseFileProcessorService.name);

  // Minimum requirements for a valid course
  private readonly MIN_POINTS = 10;
  private readonly MIN_DISTANCE_METERS = 100;
  private readonly MIN_ELEVATION_COVERAGE = 0.5; // At least 50% of points should have elevation
  private readonly MAX_POINT_SPACING_METERS = 500; // Warn if average spacing > 500m

  constructor(private readonly parserService: WorkoutFileParserService) {}

  /**
   * Parse a course file (GPX or FIT) and extract the course profile.
   *
   * @param buffer - File buffer
   * @param format - File format ('gpx' or 'fit')
   * @returns CourseProfile with elevation points
   */
  async parseCourseFile(buffer: Buffer, format: 'gpx' | 'fit'): Promise<CourseProfile> {
    const workoutFormat = format === 'gpx' ? WorkoutFileFormat.GPX : WorkoutFileFormat.FIT;

    this.logger.debug(`Parsing course file, format: ${format}`);

    const parsed = await this.parserService.parse(buffer, workoutFormat);

    if (!parsed.routePoints || parsed.routePoints.length === 0) {
      throw new BadRequestException('Course file contains no route points');
    }

    // Extract elevation profile from route points
    const elevationPoints = this.extractElevationProfile(parsed.routePoints);

    // Calculate total distance
    const totalDistance = this.calculateTotalDistance(parsed.routePoints);

    // Calculate elevation gain/loss
    const { gain, loss } = this.calculateElevationChanges(elevationPoints);

    const profile: CourseProfile = {
      points: elevationPoints,
      totalDistanceMeters: totalDistance,
      totalElevationGain: gain,
      totalElevationLoss: loss,
    };

    // Validate the profile
    const validation = this.validateCourseForPrediction(profile);
    if (!validation.isValid) {
      throw new BadRequestException(`Invalid course file: ${validation.errors.join(', ')}`);
    }

    // Log warnings if any
    if (validation.warnings.length > 0) {
      this.logger.warn(`Course validation warnings: ${validation.warnings.join(', ')}`);
    }

    this.logger.debug(
      `Parsed course: ${totalDistance.toFixed(0)}m, ` +
        `${gain.toFixed(0)}m gain, ${loss.toFixed(0)}m loss, ` +
        `${elevationPoints.length} points`,
    );

    return profile;
  }

  /**
   * Extract elevation points with distance from route points.
   * Calculates cumulative distance from start.
   *
   * @param routePoints - Parsed route points from file
   * @returns Array of elevation points with distance
   */
  extractElevationProfile(routePoints: ParsedRoutePoint[]): ElevationPoint[] {
    const elevationPoints: ElevationPoint[] = [];
    let cumulativeDistance = 0;

    for (let i = 0; i < routePoints.length; i++) {
      const point = routePoints[i];

      // Calculate distance from previous point
      if (i > 0) {
        const prevPoint = routePoints[i - 1];
        const segmentDistance = this.haversineDistance(
          prevPoint.latitude,
          prevPoint.longitude,
          point.latitude,
          point.longitude,
        );
        cumulativeDistance += segmentDistance;
      }

      // Only include points with valid elevation
      if (point.elevation !== undefined && !Number.isNaN(point.elevation)) {
        elevationPoints.push({
          distance: cumulativeDistance,
          elevation: point.elevation,
        });
      } else {
        // Interpolate elevation if missing but we have surrounding data
        const interpolated = this.interpolateElevation(routePoints, i);
        if (interpolated !== null) {
          elevationPoints.push({
            distance: cumulativeDistance,
            elevation: interpolated,
          });
        }
      }
    }

    return elevationPoints;
  }

  /**
   * Validate course profile for prediction suitability.
   *
   * @param profile - Course profile to validate
   * @returns Validation result with errors and warnings
   */
  validateCourseForPrediction(profile: CourseProfile): CourseValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check minimum points
    if (profile.points.length < this.MIN_POINTS) {
      errors.push(`Insufficient data points (${profile.points.length}). Need at least ${this.MIN_POINTS}.`);
    }

    // Check minimum distance
    if (profile.totalDistanceMeters < this.MIN_DISTANCE_METERS) {
      errors.push(
        `Course too short (${profile.totalDistanceMeters.toFixed(0)}m). ` +
          `Need at least ${this.MIN_DISTANCE_METERS}m.`,
      );
    }

    // Check elevation data coverage
    const elevationCoverage =
      profile.points.length > 0
        ? profile.points.filter((p) => p.elevation !== undefined).length / profile.points.length
        : 0;

    if (elevationCoverage < this.MIN_ELEVATION_COVERAGE) {
      errors.push(
        `Insufficient elevation data (${(elevationCoverage * 100).toFixed(0)}% coverage). ` +
          `Need at least ${this.MIN_ELEVATION_COVERAGE * 100}%.`,
      );
    }

    // Calculate average point spacing
    const avgSpacing = profile.points.length > 1 ? profile.totalDistanceMeters / (profile.points.length - 1) : 0;

    if (avgSpacing > this.MAX_POINT_SPACING_METERS) {
      warnings.push(
        `Low resolution data (${avgSpacing.toFixed(0)}m average spacing). ` + 'Prediction accuracy may be reduced.',
      );
    }

    // Check for suspicious elevation data
    if (profile.totalElevationGain > profile.totalDistanceMeters * 0.5) {
      warnings.push('Unusually high elevation gain detected. Please verify the course file.');
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      stats: {
        pointCount: profile.points.length,
        distanceMeters: profile.totalDistanceMeters,
        elevationCoverage,
        averagePointSpacing: avgSpacing,
      },
    };
  }

  /**
   * Calculate total distance from route points using Haversine formula.
   */
  private calculateTotalDistance(routePoints: ParsedRoutePoint[]): number {
    let totalDistance = 0;

    for (let i = 1; i < routePoints.length; i++) {
      const prevPoint = routePoints[i - 1];
      const currPoint = routePoints[i];
      totalDistance += this.haversineDistance(
        prevPoint.latitude,
        prevPoint.longitude,
        currPoint.latitude,
        currPoint.longitude,
      );
    }

    return totalDistance;
  }

  /**
   * Calculate total elevation gain and loss from elevation points.
   */
  private calculateElevationChanges(points: ElevationPoint[]): { gain: number; loss: number } {
    let gain = 0;
    let loss = 0;

    for (let i = 1; i < points.length; i++) {
      const diff = points[i].elevation - points[i - 1].elevation;
      if (diff > 0) {
        gain += diff;
      } else {
        loss += Math.abs(diff);
      }
    }

    return { gain, loss };
  }

  /**
   * Interpolate missing elevation data from surrounding points.
   */
  private interpolateElevation(routePoints: ParsedRoutePoint[], index: number): number | null {
    // Find nearest points with elevation before and after
    let beforeIdx = index - 1;
    let afterIdx = index + 1;

    while (beforeIdx >= 0 && routePoints[beforeIdx].elevation === undefined) {
      beforeIdx--;
    }

    while (afterIdx < routePoints.length && routePoints[afterIdx].elevation === undefined) {
      afterIdx++;
    }

    // If we have both before and after, interpolate
    if (
      beforeIdx >= 0 &&
      afterIdx < routePoints.length &&
      routePoints[beforeIdx].elevation !== undefined &&
      routePoints[afterIdx].elevation !== undefined
    ) {
      const beforeElev = routePoints[beforeIdx].elevation!;
      const afterElev = routePoints[afterIdx].elevation!;
      const ratio = (index - beforeIdx) / (afterIdx - beforeIdx);
      return beforeElev + (afterElev - beforeElev) * ratio;
    }

    // If we only have before, use that
    if (beforeIdx >= 0 && routePoints[beforeIdx].elevation !== undefined) {
      return routePoints[beforeIdx].elevation!;
    }

    // If we only have after, use that
    if (afterIdx < routePoints.length && routePoints[afterIdx].elevation !== undefined) {
      return routePoints[afterIdx].elevation!;
    }

    return null;
  }

  /**
   * Calculate distance between two points using Haversine formula.
   */
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
}

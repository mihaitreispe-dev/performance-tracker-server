import { Injectable } from '@nestjs/common';

export interface ElevationProfile {
  totalElevationGain: number;
  totalElevationLoss: number;
  distanceMeters: number;
  averageGradePercent?: number;
  maxGradePercent?: number;
  segments?: ElevationSegment[];
}

export interface ElevationSegment {
  startDistanceMeters: number;
  endDistanceMeters: number;
  elevationGainMeters: number;
  elevationLossMeters: number;
  gradePercent: number;
}

export interface CourseAdjustment {
  elevationTimeFactor: number;
  elevationTimeAdjustmentSeconds: number;
  description: string;
  segmentAdjustments?: SegmentAdjustment[];
}

export interface SegmentAdjustment {
  segmentNumber: number;
  distanceMeters: number;
  baseTimeSeconds: number;
  adjustedTimeSeconds: number;
  adjustmentSeconds: number;
  reason: string;
}

@Injectable()
export class CourseAnalysisService {
  // Running elevation adjustments (per km basis)
  // +12 sec per 100m elevation gain per km
  // -8 sec per 100m elevation loss per km
  private readonly RUN_GAIN_SECONDS_PER_100M = 12;
  private readonly RUN_LOSS_SECONDS_PER_100M = 8;

  // Cycling grade impact
  // Each 1% average grade adds ~5% to time
  private readonly BIKE_GRADE_FACTOR = 0.05;

  /**
   * Calculate running course time adjustment based on elevation
   */
  calculateRunningElevationAdjustment(
    flatTimeSeconds: number,
    distanceMeters: number,
    elevationProfile: ElevationProfile,
  ): CourseAdjustment {
    const distanceKm = distanceMeters / 1000;

    // Calculate elevation impact per km
    const gainPerKm = elevationProfile.totalElevationGain / distanceKm;
    const lossPerKm = elevationProfile.totalElevationLoss / distanceKm;

    // Time adjustment per km
    const gainAdjustmentPerKm = (gainPerKm / 100) * this.RUN_GAIN_SECONDS_PER_100M;
    const lossAdjustmentPerKm = (lossPerKm / 100) * this.RUN_LOSS_SECONDS_PER_100M;

    // Total adjustment (gain adds time, loss subtracts)
    const netAdjustmentPerKm = gainAdjustmentPerKm - lossAdjustmentPerKm;
    const totalAdjustmentSeconds = Math.round(netAdjustmentPerKm * distanceKm);

    // Calculate time factor
    const elevationTimeFactor = 1 + (totalAdjustmentSeconds / flatTimeSeconds);

    // Generate description
    let description = '';
    if (totalAdjustmentSeconds > 30) {
      description = `Hilly course with ${elevationProfile.totalElevationGain}m gain will add approximately ${this.formatTime(totalAdjustmentSeconds)} to your flat time.`;
    } else if (totalAdjustmentSeconds < -30) {
      description = `Net downhill course with ${elevationProfile.totalElevationLoss}m loss could save approximately ${this.formatTime(Math.abs(totalAdjustmentSeconds))}.`;
    } else {
      description = 'Course elevation profile is relatively flat or balanced.';
    }

    return {
      elevationTimeFactor: Math.round(elevationTimeFactor * 1000) / 1000,
      elevationTimeAdjustmentSeconds: totalAdjustmentSeconds,
      description,
    };
  }

  /**
   * Calculate cycling course time adjustment based on grade
   */
  calculateCyclingElevationAdjustment(
    flatTimeSeconds: number,
    distanceMeters: number,
    elevationProfile: ElevationProfile,
    riderWeightKg: number = 70,
    bikeWeightKg: number = 9,
  ): CourseAdjustment {
    const distanceKm = distanceMeters / 1000;
    const totalWeight = riderWeightKg + bikeWeightKg;

    // Calculate average grade
    const netElevation = elevationProfile.totalElevationGain - elevationProfile.totalElevationLoss;
    const avgGradePercent = (netElevation / distanceMeters) * 100;

    // For significant climbs, use power-based model
    // P = P_flat + (mass × g × grade × velocity)
    // Where grade is expressed as a fraction

    // Simple model: each 1% average grade adds ~5% to time
    const gradeImpact = Math.abs(avgGradePercent) * this.BIKE_GRADE_FACTOR;

    let timeFactor: number;
    let adjustmentSeconds: number;

    if (avgGradePercent > 0) {
      // Climbing - time increases
      timeFactor = 1 + gradeImpact;
      adjustmentSeconds = Math.round(flatTimeSeconds * gradeImpact);
    } else {
      // Descending - time decreases (but less than climbing adds)
      // Descent benefit is ~60% of climb penalty due to air resistance
      const descentBenefit = gradeImpact * 0.6;
      timeFactor = 1 - descentBenefit;
      adjustmentSeconds = -Math.round(flatTimeSeconds * descentBenefit);
    }

    // Account for elevation gain on net-flat courses
    if (Math.abs(avgGradePercent) < 0.5 && elevationProfile.totalElevationGain > 500) {
      // Rolling course - climbing uses more energy than descending saves
      const rollingFactor = (elevationProfile.totalElevationGain / 1000) * 0.02;
      timeFactor += rollingFactor;
      adjustmentSeconds += Math.round(flatTimeSeconds * rollingFactor);
    }

    // Generate description
    let description = '';
    if (avgGradePercent > 2) {
      description = `Mountainous course with ${elevationProfile.totalElevationGain}m climbing. Expect significant time penalty on climbs.`;
    } else if (avgGradePercent > 0.5) {
      description = `Uphill course with net ${netElevation}m elevation gain. Plan for increased effort.`;
    } else if (avgGradePercent < -0.5) {
      description = `Net downhill course. Potential time savings, but maintain power on flats.`;
    } else if (elevationProfile.totalElevationGain > 500) {
      description = `Rolling course with ${elevationProfile.totalElevationGain}m total climbing. Pace climbing sections conservatively.`;
    } else {
      description = 'Relatively flat course. Expected time close to flat terrain prediction.';
    }

    return {
      elevationTimeFactor: Math.round(timeFactor * 1000) / 1000,
      elevationTimeAdjustmentSeconds: adjustmentSeconds,
      description,
    };
  }

  /**
   * Calculate segment-by-segment adjustments for running
   */
  calculateRunningSegmentAdjustments(
    flatPaceSecondsPerKm: number,
    segments: ElevationSegment[],
  ): SegmentAdjustment[] {
    return segments.map((segment, index) => {
      const segmentDistanceKm = (segment.endDistanceMeters - segment.startDistanceMeters) / 1000;
      const baseTimeSeconds = flatPaceSecondsPerKm * segmentDistanceKm;

      // Calculate grade for this segment
      const gainAdjustment = (segment.elevationGainMeters / 100) * this.RUN_GAIN_SECONDS_PER_100M;
      const lossAdjustment = (segment.elevationLossMeters / 100) * this.RUN_LOSS_SECONDS_PER_100M;
      const netAdjustment = gainAdjustment - lossAdjustment;

      let reason = '';
      if (segment.gradePercent > 3) {
        reason = 'Steep uphill - significantly slower';
      } else if (segment.gradePercent > 1) {
        reason = 'Gradual climb - moderate impact';
      } else if (segment.gradePercent < -3) {
        reason = 'Steep downhill - faster but controlled';
      } else if (segment.gradePercent < -1) {
        reason = 'Gradual descent - slight time savings';
      } else {
        reason = 'Relatively flat segment';
      }

      return {
        segmentNumber: index + 1,
        distanceMeters: segment.endDistanceMeters - segment.startDistanceMeters,
        baseTimeSeconds: Math.round(baseTimeSeconds),
        adjustedTimeSeconds: Math.round(baseTimeSeconds + netAdjustment),
        adjustmentSeconds: Math.round(netAdjustment),
        reason,
      };
    });
  }

  /**
   * Parse elevation profile from GPX or similar data
   * This is a simplified version - actual implementation would parse GPX/FIT files
   */
  parseElevationProfile(
    elevationPoints: { distance: number; elevation: number }[],
    segmentDistanceMeters: number = 1000,
  ): ElevationProfile {
    if (elevationPoints.length < 2) {
      return {
        totalElevationGain: 0,
        totalElevationLoss: 0,
        distanceMeters: 0,
      };
    }

    let totalGain = 0;
    let totalLoss = 0;
    const segments: ElevationSegment[] = [];

    let currentSegmentStart = elevationPoints[0].distance;
    let segmentGain = 0;
    let segmentLoss = 0;

    for (let i = 1; i < elevationPoints.length; i++) {
      const elevDiff = elevationPoints[i].elevation - elevationPoints[i - 1].elevation;

      if (elevDiff > 0) {
        totalGain += elevDiff;
        segmentGain += elevDiff;
      } else {
        totalLoss += Math.abs(elevDiff);
        segmentLoss += Math.abs(elevDiff);
      }

      // Check if we've completed a segment
      if (elevationPoints[i].distance - currentSegmentStart >= segmentDistanceMeters) {
        const segmentDistance = elevationPoints[i].distance - currentSegmentStart;
        const netElevation = segmentGain - segmentLoss;
        const gradePercent = (netElevation / segmentDistance) * 100;

        segments.push({
          startDistanceMeters: currentSegmentStart,
          endDistanceMeters: elevationPoints[i].distance,
          elevationGainMeters: segmentGain,
          elevationLossMeters: segmentLoss,
          gradePercent: Math.round(gradePercent * 100) / 100,
        });

        currentSegmentStart = elevationPoints[i].distance;
        segmentGain = 0;
        segmentLoss = 0;
      }
    }

    // Add final segment if there's remaining distance
    if (segmentGain > 0 || segmentLoss > 0) {
      const lastPoint = elevationPoints[elevationPoints.length - 1];
      const segmentDistance = lastPoint.distance - currentSegmentStart;
      const netElevation = segmentGain - segmentLoss;
      const gradePercent = segmentDistance > 0 ? (netElevation / segmentDistance) * 100 : 0;

      segments.push({
        startDistanceMeters: currentSegmentStart,
        endDistanceMeters: lastPoint.distance,
        elevationGainMeters: segmentGain,
        elevationLossMeters: segmentLoss,
        gradePercent: Math.round(gradePercent * 100) / 100,
      });
    }

    const totalDistance = elevationPoints[elevationPoints.length - 1].distance;
    const netElevation = totalGain - totalLoss;
    const avgGrade = (netElevation / totalDistance) * 100;
    const maxGrade = segments.length > 0
      ? Math.max(...segments.map((s) => Math.abs(s.gradePercent)))
      : 0;

    return {
      totalElevationGain: Math.round(totalGain),
      totalElevationLoss: Math.round(totalLoss),
      distanceMeters: Math.round(totalDistance),
      averageGradePercent: Math.round(avgGrade * 100) / 100,
      maxGradePercent: Math.round(maxGrade * 100) / 100,
      segments,
    };
  }

  /**
   * Format time in human-readable format
   */
  private formatTime(seconds: number): string {
    const absSeconds = Math.abs(seconds);
    if (absSeconds < 60) {
      return `${absSeconds}s`;
    }
    const minutes = Math.floor(absSeconds / 60);
    const remainingSeconds = absSeconds % 60;
    if (minutes < 60) {
      return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
    }
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return `${hours}:${remainingMinutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
  }
}

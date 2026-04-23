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

export interface ElevationPoint {
  distance: number;
  elevation: number;
}

export interface CourseProfile {
  points: ElevationPoint[];
  totalDistanceMeters: number;
  totalElevationGain: number;
  totalElevationLoss: number;
}

export interface CourseSegmentPrediction {
  segmentNumber: number;
  startDistanceMeters: number;
  endDistanceMeters: number;
  averageGradePercent: number;
  elevationGain: number;
  elevationLoss: number;
  adjustedPaceSecondsPerKm: number;
  segmentTimeSeconds: number;
  cumulativeTimeSeconds: number;
}

export interface CourseBasedPredictionResult {
  predictedTimeSeconds: number;
  flatEquivalentTimeSeconds: number;
  segments: CourseSegmentPrediction[];
  elevationProfile: { distance: number; elevation: number; pace: number }[];
  summary: {
    totalElevationGain: number;
    totalElevationLoss: number;
    steepestClimbPercent: number;
    steepestDescentPercent: number;
    averageGradePercent: number;
  };
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

  // Minetti model constants
  // Reference: Minetti et al. (2002) - Energy cost of walking and running at extreme uphill and downhill slopes
  // Cr(i) = 155.4i^5 - 30.4i^4 - 43.3i^3 + 46.3i^2 + 19.5i + 3.6
  // Where i = grade as decimal (0.05 = 5%)
  private readonly MINETTI_FLAT_COST = 3.6; // Cr at 0% grade (J/kg/m)

  // Grade limits for the model (beyond these, clip the values)
  private readonly MAX_GRADE = 0.2; // 20%
  private readonly MIN_GRADE = -0.2; // -20%

  // Minimum pace cap for downhill (prevent unrealistic speeds)
  // Default: ~4:00/km = 240 sec/km = 4.17 m/s
  private readonly DEFAULT_DOWNHILL_SPEED_CAP_MPS = 4.17;

  // Cycling grade impact
  // Each 1% average grade adds ~5% to time
  private readonly BIKE_GRADE_FACTOR = 0.05;

  // ==========================================================================
  // Minetti Grade Cost Model
  // ==========================================================================

  /**
   * Calculate the metabolic cost of running at a given grade using the Minetti model.
   * Formula: Cr(i) = 155.4i^5 - 30.4i^4 - 43.3i^3 + 46.3i^2 + 19.5i + 3.6
   *
   * @param gradeDecimal - Grade as decimal (e.g., 0.05 = 5% grade)
   * @returns Cost in J/kg/m
   */
  calculateMinettiCost(gradeDecimal: number): number {
    // Clip grade to model limits
    const i = Math.max(this.MIN_GRADE, Math.min(this.MAX_GRADE, gradeDecimal));

    // Minetti polynomial
    const cost =
      155.4 * Math.pow(i, 5) - 30.4 * Math.pow(i, 4) - 43.3 * Math.pow(i, 3) + 46.3 * Math.pow(i, 2) + 19.5 * i + 3.6;

    // Ensure cost is never below a minimum threshold (very steep downhill can go negative)
    return Math.max(cost, 1.5);
  }

  /**
   * Calculate grade-adjusted velocity based on Minetti cost model.
   * Assumes constant power output, so velocity inversely scales with cost.
   *
   * v_grade = v_flat * (Cr_flat / Cr_grade)
   *
   * @param flatVelocityMps - Flat terrain velocity in m/s
   * @param gradeDecimal - Grade as decimal
   * @param downhillSpeedCapMps - Maximum speed for downhill (default ~4:00/km)
   * @returns Adjusted velocity in m/s
   */
  calculateGradeAdjustedVelocity(
    flatVelocityMps: number,
    gradeDecimal: number,
    downhillSpeedCapMps: number = this.DEFAULT_DOWNHILL_SPEED_CAP_MPS,
  ): number {
    const flatCost = this.MINETTI_FLAT_COST;
    const gradeCost = this.calculateMinettiCost(gradeDecimal);

    // Velocity inversely proportional to cost (constant power assumption)
    let adjustedVelocity = flatVelocityMps * (flatCost / gradeCost);

    // Cap downhill speed to prevent unrealistic paces
    if (gradeDecimal < 0) {
      adjustedVelocity = Math.min(adjustedVelocity, downhillSpeedCapMps);
    }

    return adjustedVelocity;
  }

  /**
   * Smooth elevation profile using a rolling window average.
   * Helps reduce GPS noise in elevation data.
   *
   * @param points - Raw elevation points
   * @param windowMeters - Window size in meters (default 100m)
   * @returns Smoothed elevation points
   */
  smoothElevationProfile(points: ElevationPoint[], windowMeters: number = 100): ElevationPoint[] {
    if (points.length < 3) return points;

    const smoothed: ElevationPoint[] = [];

    for (let i = 0; i < points.length; i++) {
      const currentDistance = points[i].distance;
      const windowStart = currentDistance - windowMeters / 2;
      const windowEnd = currentDistance + windowMeters / 2;

      // Find all points within the window
      const windowPoints = points.filter((p) => p.distance >= windowStart && p.distance <= windowEnd);

      // Average elevation within window
      const avgElevation = windowPoints.reduce((sum, p) => sum + p.elevation, 0) / windowPoints.length;

      smoothed.push({
        distance: currentDistance,
        elevation: avgElevation,
      });
    }

    return smoothed;
  }

  /**
   * Calculate course-based prediction using the Minetti model.
   * Provides segment-by-segment pacing with grade adjustments.
   *
   * @param flatPredictionSeconds - Predicted flat terrain time in seconds
   * @param courseProfile - Course elevation profile
   * @param options - Configuration options
   * @returns Full course prediction with segments
   */
  calculateCourseBasedPrediction(
    flatPredictionSeconds: number,
    courseProfile: CourseProfile,
    options: {
      segmentDistanceMeters?: number;
      applyFadeFactor?: boolean;
      downhillSpeedCapMps?: number;
      smoothingWindowMeters?: number;
    } = {},
  ): CourseBasedPredictionResult {
    const {
      segmentDistanceMeters = 1000,
      applyFadeFactor = false,
      downhillSpeedCapMps = this.DEFAULT_DOWNHILL_SPEED_CAP_MPS,
      smoothingWindowMeters = 100,
    } = options;

    // Smooth the elevation data
    const smoothedPoints = this.smoothElevationProfile(courseProfile.points, smoothingWindowMeters);

    // Calculate flat velocity
    const flatVelocityMps = courseProfile.totalDistanceMeters / flatPredictionSeconds;

    // Build segments
    const segments: CourseSegmentPrediction[] = [];
    const elevationProfile: { distance: number; elevation: number; pace: number }[] = [];

    let cumulativeTime = 0;
    let segmentNumber = 1;
    let currentSegmentStart = 0;

    // Track elevation stats
    let totalGain = 0;
    let totalLoss = 0;
    let steepestClimb = 0;
    let steepestDescent = 0;

    // Process each point to build segments
    let segmentGain = 0;
    let segmentLoss = 0;
    let segmentGrades: number[] = [];
    let segmentTimes: number[] = [];

    for (let i = 1; i < smoothedPoints.length; i++) {
      const prevPoint = smoothedPoints[i - 1];
      const currPoint = smoothedPoints[i];
      const distanceDelta = currPoint.distance - prevPoint.distance;

      if (distanceDelta <= 0) continue;

      const elevationDelta = currPoint.elevation - prevPoint.elevation;
      const grade = elevationDelta / distanceDelta;

      // Track elevation changes
      if (elevationDelta > 0) {
        segmentGain += elevationDelta;
        totalGain += elevationDelta;
      } else {
        segmentLoss += Math.abs(elevationDelta);
        totalLoss += Math.abs(elevationDelta);
      }

      // Track steepest sections
      const gradePercent = grade * 100;
      if (gradePercent > steepestClimb) steepestClimb = gradePercent;
      if (gradePercent < steepestDescent) steepestDescent = gradePercent;

      // Calculate adjusted velocity for this micro-segment
      const adjustedVelocity = this.calculateGradeAdjustedVelocity(flatVelocityMps, grade, downhillSpeedCapMps);

      // Time for this micro-segment
      const microTime = distanceDelta / adjustedVelocity;
      cumulativeTime += microTime;
      segmentTimes.push(microTime);
      segmentGrades.push(grade);

      // Add to elevation profile
      const paceSecondsPerKm = 1000 / adjustedVelocity;
      elevationProfile.push({
        distance: currPoint.distance,
        elevation: currPoint.elevation,
        pace: paceSecondsPerKm,
      });

      // Check if we've completed a segment
      if (currPoint.distance - currentSegmentStart >= segmentDistanceMeters) {
        const segmentDistance = currPoint.distance - currentSegmentStart;
        const avgGrade = segmentGrades.length > 0 ? segmentGrades.reduce((a, b) => a + b, 0) / segmentGrades.length : 0;
        const segmentTime = segmentTimes.reduce((a, b) => a + b, 0);
        const avgPace = (segmentTime / segmentDistance) * 1000;

        segments.push({
          segmentNumber,
          startDistanceMeters: currentSegmentStart,
          endDistanceMeters: currPoint.distance,
          averageGradePercent: Math.round(avgGrade * 10000) / 100,
          elevationGain: Math.round(segmentGain * 10) / 10,
          elevationLoss: Math.round(segmentLoss * 10) / 10,
          adjustedPaceSecondsPerKm: Math.round(avgPace * 10) / 10,
          segmentTimeSeconds: Math.round(segmentTime),
          cumulativeTimeSeconds: Math.round(cumulativeTime),
        });

        segmentNumber++;
        currentSegmentStart = currPoint.distance;
        segmentGain = 0;
        segmentLoss = 0;
        segmentGrades = [];
        segmentTimes = [];
      }
    }

    // Handle final partial segment
    if (segmentTimes.length > 0) {
      const lastPoint = smoothedPoints[smoothedPoints.length - 1];
      const segmentDistance = lastPoint.distance - currentSegmentStart;
      const avgGrade = segmentGrades.length > 0 ? segmentGrades.reduce((a, b) => a + b, 0) / segmentGrades.length : 0;
      const segmentTime = segmentTimes.reduce((a, b) => a + b, 0);
      const avgPace = segmentDistance > 0 ? (segmentTime / segmentDistance) * 1000 : 0;

      segments.push({
        segmentNumber,
        startDistanceMeters: currentSegmentStart,
        endDistanceMeters: lastPoint.distance,
        averageGradePercent: Math.round(avgGrade * 10000) / 100,
        elevationGain: Math.round(segmentGain * 10) / 10,
        elevationLoss: Math.round(segmentLoss * 10) / 10,
        adjustedPaceSecondsPerKm: Math.round(avgPace * 10) / 10,
        segmentTimeSeconds: Math.round(segmentTime),
        cumulativeTimeSeconds: Math.round(cumulativeTime),
      });
    }

    // Apply optional fade factor (for longer races, expect some slowdown)
    let predictedTime = cumulativeTime;
    if (applyFadeFactor && courseProfile.totalDistanceMeters > 10000) {
      // Apply 1-3% fade for longer races
      const distanceKm = courseProfile.totalDistanceMeters / 1000;
      const fadeFactor = 1 + Math.min(0.03, (distanceKm - 10) * 0.001);
      predictedTime *= fadeFactor;
    }

    return {
      predictedTimeSeconds: Math.round(predictedTime),
      flatEquivalentTimeSeconds: flatPredictionSeconds,
      segments,
      elevationProfile,
      summary: {
        totalElevationGain: Math.round(totalGain),
        totalElevationLoss: Math.round(totalLoss),
        steepestClimbPercent: Math.round(steepestClimb * 100) / 100,
        steepestDescentPercent: Math.round(Math.abs(steepestDescent) * 100) / 100,
        averageGradePercent: Math.round(((totalGain - totalLoss) / courseProfile.totalDistanceMeters) * 10000) / 100,
      },
    };
  }

  // ==========================================================================
  // Legacy Elevation Adjustment Methods (kept for compatibility)
  // ==========================================================================

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
    const elevationTimeFactor = 1 + totalAdjustmentSeconds / flatTimeSeconds;

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
      description = 'Net downhill course. Potential time savings, but maintain power on flats.';
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
  calculateRunningSegmentAdjustments(flatPaceSecondsPerKm: number, segments: ElevationSegment[]): SegmentAdjustment[] {
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
    const maxGrade = segments.length > 0 ? Math.max(...segments.map((s) => Math.abs(s.gradePercent))) : 0;

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

import { Injectable, Logger } from '@nestjs/common';
import {
  CourseSegment,
  EffortZone,
  FatigueModel,
  MentalCheckpoint,
  PacingStrategy as PacingStrategyType,
} from 'src/database/interfaces';

@Injectable()
export class PacingStrategyService {
  private readonly logger = new Logger(PacingStrategyService.name);

  /**
   * Apply pacing strategy to course segments
   */
  applyPacingStrategy(
    segments: CourseSegment[],
    strategy: PacingStrategyType,
    targetTimeSeconds?: number,
  ): { segments: CourseSegment[]; negativeSplitRatio?: number } {
    switch (strategy) {
      case 'negative_split':
        return this.applyNegativeSplit(segments);
      case 'conservative':
        return this.applyConservativeStart(segments);
      case 'progressive':
        return this.applyProgressiveBuild(segments);
      case 'even':
      default:
        return { segments }; // Already have grade-adjusted paces
    }
  }

  /**
   * Apply negative split strategy
   * First half: 2-3% slower
   * Second half: 2-3% faster
   */
  private applyNegativeSplit(segments: CourseSegment[]): { segments: CourseSegment[]; negativeSplitRatio: number } {
    const totalDistance = segments[segments.length - 1].end_distance_meters;
    const halfwayPoint = totalDistance / 2;

    const FIRST_HALF_ADJUSTMENT = 1.025; // 2.5% slower
    const SECOND_HALF_ADJUSTMENT = 0.975; // 2.5% faster

    const adjustedSegments = segments.map((segment) => {
      const segmentMidpoint = (segment.start_distance_meters + segment.end_distance_meters) / 2;
      const isFirstHalf = segmentMidpoint < halfwayPoint;

      const adjustment = isFirstHalf ? FIRST_HALF_ADJUSTMENT : SECOND_HALF_ADJUSTMENT;
      const newPace = segment.adjusted_pace_seconds_per_km * adjustment;
      const newTime = (newPace * segment.distance_meters) / 1000;

      return {
        ...segment,
        adjusted_pace_seconds_per_km: newPace,
        segment_time_seconds: newTime,
      };
    });

    // Recalculate cumulative times
    return {
      segments: this.recalculateCumulativeTimes(adjustedSegments),
      negativeSplitRatio: FIRST_HALF_ADJUSTMENT / SECOND_HALF_ADJUSTMENT,
    };
  }

  /**
   * Apply conservative start strategy
   * First 20%: 5% slower (warmup)
   * Middle 60%: target pace
   * Final 20%: push if feeling good
   */
  private applyConservativeStart(segments: CourseSegment[]): { segments: CourseSegment[] } {
    const totalDistance = segments[segments.length - 1].end_distance_meters;
    const firstThird = totalDistance * 0.2;
    const lastThird = totalDistance * 0.8;

    const adjustedSegments = segments.map((segment) => {
      const segmentMidpoint = (segment.start_distance_meters + segment.end_distance_meters) / 2;

      let adjustment = 1.0;
      if (segmentMidpoint < firstThird) {
        adjustment = 1.05; // 5% slower
      } else if (segmentMidpoint > lastThird) {
        adjustment = 0.98; // 2% faster (conservative push)
      }

      const newPace = segment.adjusted_pace_seconds_per_km * adjustment;
      const newTime = (newPace * segment.distance_meters) / 1000;

      return {
        ...segment,
        adjusted_pace_seconds_per_km: newPace,
        segment_time_seconds: newTime,
      };
    });

    return { segments: this.recalculateCumulativeTimes(adjustedSegments) };
  }

  /**
   * Apply progressive build strategy
   * Gradual acceleration throughout race
   */
  private applyProgressiveBuild(segments: CourseSegment[]): { segments: CourseSegment[] } {
    const totalDistance = segments[segments.length - 1].end_distance_meters;

    const adjustedSegments = segments.map((segment) => {
      const segmentMidpoint = (segment.start_distance_meters + segment.end_distance_meters) / 2;
      const progressPercent = segmentMidpoint / totalDistance;

      // Start 5% slower, finish 5% faster (linear progression)
      const adjustment = 1.05 - progressPercent * 0.1;

      const newPace = segment.adjusted_pace_seconds_per_km * adjustment;
      const newTime = (newPace * segment.distance_meters) / 1000;

      return {
        ...segment,
        adjusted_pace_seconds_per_km: newPace,
        segment_time_seconds: newTime,
      };
    });

    return { segments: this.recalculateCumulativeTimes(adjustedSegments) };
  }

  /**
   * Recalculate cumulative times after pace adjustments
   */
  private recalculateCumulativeTimes(segments: CourseSegment[]): CourseSegment[] {
    let cumulativeTime = 0;

    return segments.map((segment) => {
      cumulativeTime += segment.segment_time_seconds;
      return {
        ...segment,
        cumulative_time_seconds: cumulativeTime,
      };
    });
  }

  /**
   * Calculate effort zones for each segment
   * Based on grade, distance into race, and predicted fatigue
   */
  calculateEffortZones(segments: CourseSegment[], lthrBpm?: number): EffortZone[] {
    const totalDistance = segments[segments.length - 1].end_distance_meters;

    return segments.map((segment) => {
      const progressPercent = (segment.end_distance_meters / totalDistance) * 100;
      const grade = segment.average_grade_percent;

      // Determine zone based on grade and fatigue
      let zoneName: string;
      let rpeScale: number;
      let targetHrMin: number | undefined;
      let targetHrMax: number | undefined;
      let description: string;

      if (progressPercent < 5) {
        // Warmup phase
        zoneName = 'Warmup';
        rpeScale = 3;
        description = 'Easy start, find your rhythm, settle into race pace gradually';
        if (lthrBpm) {
          targetHrMin = Math.round(lthrBpm * 0.6);
          targetHrMax = Math.round(lthrBpm * 0.7);
        }
      } else if (grade < -3) {
        // Steep downhill
        zoneName = 'Controlled Downhill';
        rpeScale = 4;
        description = 'Control effort on downhill, save legs for later';
        if (lthrBpm) {
          targetHrMin = Math.round(lthrBpm * 0.75);
          targetHrMax = Math.round(lthrBpm * 0.85);
        }
      } else if (grade > 4) {
        // Steep uphill
        zoneName = 'Threshold Climb';
        rpeScale = 7;
        description = 'Push the climb but stay controlled, even effort not pace';
        if (lthrBpm) {
          targetHrMin = Math.round(lthrBpm * 0.95);
          targetHrMax = Math.round(lthrBpm * 1.03);
        }
      } else if (grade > 2) {
        // Moderate uphill
        zoneName = 'Tempo Climb';
        rpeScale = 6;
        description = 'Steady effort up the hill, maintain rhythm';
        if (lthrBpm) {
          targetHrMin = Math.round(lthrBpm * 0.88);
          targetHrMax = Math.round(lthrBpm * 0.95);
        }
      } else if (progressPercent > 90) {
        // Final push
        zoneName = 'Final Push';
        rpeScale = 8;
        description = 'Empty the tank, give everything you have left';
        if (lthrBpm) {
          targetHrMin = Math.round(lthrBpm * 0.95);
          targetHrMax = Math.round(lthrBpm * 1.05);
        }
      } else {
        // Race pace (flat/rolling)
        zoneName = 'Race Pace';
        rpeScale = 5;
        description = 'Steady race pace, sustainable effort';
        if (lthrBpm) {
          targetHrMin = Math.round(lthrBpm * 0.82);
          targetHrMax = Math.round(lthrBpm * 0.88);
        }
      }

      return {
        segment_number: segment.segment_number,
        zone_name: zoneName,
        target_hr_min: targetHrMin,
        target_hr_max: targetHrMax,
        target_pace_min_seconds_per_km: segment.adjusted_pace_seconds_per_km * 0.98,
        target_pace_max_seconds_per_km: segment.adjusted_pace_seconds_per_km * 1.02,
        rpe_scale: rpeScale,
        description: description,
      };
    });
  }

  /**
   * Generate fatigue model with mental checkpoints
   */
  generateFatigueModel(distanceMeters: number, raceType: string): FatigueModel {
    const distanceKm = distanceMeters / 1000;

    // Baseline fade factor (expected slowdown)
    let baselineFadeFactor: number;
    if (distanceKm >= 42) {
      baselineFadeFactor = 1.03; // 3% for marathon
    } else if (distanceKm >= 21) {
      baselineFadeFactor = 1.015; // 1.5% for half marathon
    } else if (distanceKm >= 10) {
      baselineFadeFactor = 1.005; // 0.5% for 10K
    } else {
      baselineFadeFactor = 1.0; // Negligible for shorter races
    }

    // Critical fatigue point (where things get hard)
    const criticalFatiguePointKm = distanceKm * 0.75;

    // Mental checkpoints
    const mentalCheckpoints: MentalCheckpoint[] = [
      {
        distance_km: distanceKm * 0.25,
        percentage_complete: 25,
        message: 'First Quarter Complete',
        advice: 'Stay relaxed and patient. Save your energy for the second half.',
      },
      {
        distance_km: distanceKm * 0.5,
        percentage_complete: 50,
        message: 'Halfway There!',
        advice: 'Check in with your body. Adjust effort if needed. The real race starts now.',
      },
      {
        distance_km: distanceKm * 0.75,
        percentage_complete: 75,
        message: 'Three Quarters Done',
        advice: 'This is where champions are made. Dig deep and stay strong.',
      },
      {
        distance_km: distanceKm * 0.9,
        percentage_complete: 90,
        message: 'Final Push - Almost There!',
        advice: 'Leave nothing on the course. Give it everything you have.',
      },
    ];

    const pacingGuidance =
      'Start conservatively, build gradually, and finish strong. Even effort throughout is more important than even pace, especially on hilly courses.';

    return {
      baseline_fade_factor: baselineFadeFactor,
      critical_fatigue_point_km: criticalFatiguePointKm,
      mental_checkpoints: mentalCheckpoints,
      pacing_guidance: pacingGuidance,
    };
  }
}

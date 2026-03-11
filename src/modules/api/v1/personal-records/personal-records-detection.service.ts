import { Injectable, Logger } from '@nestjs/common';
import {
  NewPersonalRecord,
  PersonalRecordType,
  RouteMarker,
  SetCompletion,
  WorkoutExecution,
  WorkoutRoute,
  WorkoutType,
} from 'src/database/interfaces';
import { ExerciseInstanceRepository } from 'src/repositories/exercise-instance.repository';
import { PersonalRecordRepository } from 'src/repositories/personal-record.repository';
import { SetCompletionRepository } from 'src/repositories/set-completion.repository';
import { WorkoutExecutionRepository } from 'src/repositories/workout-execution.repository';
import { WorkoutRouteRepository } from 'src/repositories/workout-route.repository';
import { WorkoutRepository } from 'src/repositories/workout.repository';
import { WorkoutScheduleRepository } from 'src/repositories/workout-schedule.repository';

interface DetectedPR {
  recordType: PersonalRecordType;
  exerciseId: string | null;
  workoutType: WorkoutType | null;
  value: number;
  unit: string;
}

// Distance thresholds in meters
const DISTANCE_THRESHOLDS = {
  [PersonalRecordType.FASTEST_1K]: 1000,
  [PersonalRecordType.FASTEST_5K]: 5000,
  [PersonalRecordType.FASTEST_10K]: 10000,
  [PersonalRecordType.FASTEST_HALF_MARATHON]: 21097.5,
  [PersonalRecordType.FASTEST_MARATHON]: 42195,
};

@Injectable()
export class PersonalRecordsDetectionService {
  private readonly logger = new Logger(PersonalRecordsDetectionService.name);

  constructor(
    private readonly personalRecordRepository: PersonalRecordRepository,
    private readonly setCompletionRepository: SetCompletionRepository,
    private readonly workoutRouteRepository: WorkoutRouteRepository,
    private readonly exerciseInstanceRepository: ExerciseInstanceRepository,
    private readonly workoutExecutionRepository: WorkoutExecutionRepository,
    private readonly workoutRepository: WorkoutRepository,
    private readonly workoutScheduleRepository: WorkoutScheduleRepository,
  ) {}

  async detectAndStorePRs(executionId: string, userId: string): Promise<void> {
    try {
      const execution = await this.workoutExecutionRepository.findById(executionId);
      if (!execution || !execution.completed_at) {
        return;
      }

      const achievedAt = execution.completed_at;

      // Get workout type from the execution
      const workoutType = await this.getWorkoutType(execution);

      // Detect all potential PRs
      const [strengthPRs, cardioPRs] = await Promise.all([
        this.detectStrengthPRs(executionId),
        this.detectCardioPRs(executionId, execution, workoutType),
      ]);

      const allDetectedPRs = [...strengthPRs, ...cardioPRs];

      // Compare with existing PRs and save new records
      for (const detected of allDetectedPRs) {
        await this.processDetectedPR(detected, userId, executionId, achievedAt);
      }

      this.logger.log(
        `PR detection completed for execution ${executionId}: ${allDetectedPRs.length} potential PRs detected`,
      );
    } catch (error) {
      this.logger.error(`Error detecting PRs for execution ${executionId}:`, error);
    }
  }

  private async getWorkoutType(execution: WorkoutExecution): Promise<WorkoutType | null> {
    // Get workout type from schedule
    if (execution.workout_schedule_id) {
      const schedule = await this.workoutScheduleRepository.findById(execution.workout_schedule_id);
      if (schedule?.workout_id) {
        const workout = await this.workoutRepository.findById(schedule.workout_id);
        if (workout?.type) {
          return workout.type;
        }
      }
    }

    return null;
  }

  private async detectStrengthPRs(executionId: string): Promise<DetectedPR[]> {
    const setCompletions = await this.setCompletionRepository.findMany({
      filter: { workoutExecutionId: executionId },
    });

    if (setCompletions.length === 0) {
      return [];
    }

    // Get exercise IDs from exercise instances
    const exerciseInstanceIds = [...new Set(setCompletions.map((sc) => sc.exercise_instance_id))];
    const exerciseInstances = await Promise.all(
      exerciseInstanceIds.map((id) => this.exerciseInstanceRepository.findById(id)),
    );

    // Map exercise instance ID to exercise ID
    const instanceToExercise = new Map<string, string>();
    for (const instance of exerciseInstances) {
      if (instance) {
        instanceToExercise.set(instance.id, instance.exercise_id);
      }
    }

    // Group set completions by exercise
    const byExercise = new Map<string, SetCompletion[]>();
    for (const sc of setCompletions) {
      const exerciseId = instanceToExercise.get(sc.exercise_instance_id);
      if (!exerciseId) continue;
      if (!byExercise.has(exerciseId)) {
        byExercise.set(exerciseId, []);
      }
      byExercise.get(exerciseId)!.push(sc);
    }

    const detectedPRs: DetectedPR[] = [];

    for (const [exerciseId, sets] of byExercise) {
      // Filter out skipped sets
      const completedSets = sets.filter((s) => !s.skipped);

      // Max weight
      const maxWeight = this.findMaxWeight(completedSets);
      if (maxWeight !== null) {
        detectedPRs.push({
          recordType: PersonalRecordType.MAX_WEIGHT,
          exerciseId,
          workoutType: null, // Strength PRs are exercise-specific, not sport-specific
          value: maxWeight,
          unit: 'kg',
        });
      }

      // Max reps (any weight)
      const maxReps = this.findMaxReps(completedSets);
      if (maxReps !== null) {
        detectedPRs.push({
          recordType: PersonalRecordType.MAX_REPS,
          exerciseId,
          workoutType: null,
          value: maxReps,
          unit: 'reps',
        });
      }

      // Max volume set (load * reps)
      const maxVolumeSet = this.findMaxVolumeSet(completedSets);
      if (maxVolumeSet !== null) {
        detectedPRs.push({
          recordType: PersonalRecordType.MAX_VOLUME_SET,
          exerciseId,
          workoutType: null,
          value: maxVolumeSet,
          unit: 'kg',
        });
      }
    }

    return detectedPRs;
  }

  private findMaxWeight(sets: SetCompletion[]): number | null {
    let max: number | null = null;
    for (const s of sets) {
      if (s.actual_load) {
        const load = Number.parseFloat(s.actual_load);
        if (max === null || load > max) {
          max = load;
        }
      }
    }
    return max;
  }

  private findMaxReps(sets: SetCompletion[]): number | null {
    let max: number | null = null;
    for (const s of sets) {
      if (s.actual_reps !== null) {
        if (max === null || s.actual_reps > max) {
          max = s.actual_reps;
        }
      }
    }
    return max;
  }

  private findMaxVolumeSet(sets: SetCompletion[]): number | null {
    let max: number | null = null;
    for (const s of sets) {
      if (s.actual_load && s.actual_reps !== null) {
        const volume = Number.parseFloat(s.actual_load) * s.actual_reps;
        if (max === null || volume > max) {
          max = volume;
        }
      }
    }
    return max;
  }

  private async detectCardioPRs(
    executionId: string,
    execution: WorkoutExecution,
    workoutType: WorkoutType | null,
  ): Promise<DetectedPR[]> {
    const route = await this.workoutRouteRepository.findByExecutionId(executionId);
    if (!route) {
      return [];
    }

    const markers = await this.workoutRouteRepository.findMarkersByRouteId(route.id);
    const detectedPRs: DetectedPR[] = [];

    // Distance-based PRs (fastest times)
    const distancePRs = this.detectDistancePRs(markers, workoutType);
    detectedPRs.push(...distancePRs);

    // Split PRs
    const splitPRs = this.detectSplitPRs(markers, workoutType);
    detectedPRs.push(...splitPRs);

    // Other cardio PRs
    const otherPRs = this.detectOtherCardioPRs(route, execution, workoutType);
    detectedPRs.push(...otherPRs);

    return detectedPRs;
  }

  private detectDistancePRs(markers: RouteMarker[], workoutType: WorkoutType | null): DetectedPR[] {
    const detectedPRs: DetectedPR[] = [];

    for (const [recordType, targetDistance] of Object.entries(DISTANCE_THRESHOLDS)) {
      // Find the first marker where cumulative distance >= target
      // We use marker_number * 1000 for km markers as an approximation
      // Or check cumulative time at the appropriate marker
      const sortedMarkers = [...markers].sort((a, b) => a.marker_number - b.marker_number);

      for (const marker of sortedMarkers) {
        // Assuming km markers, marker_number * 1000 gives meters
        const distanceAtMarker =
          marker.marker_type === 'km' ? marker.marker_number * 1000 : marker.marker_number * 1609.34; // miles to meters

        if (distanceAtMarker >= targetDistance && marker.cumulative_time_seconds) {
          detectedPRs.push({
            recordType: recordType as PersonalRecordType,
            exerciseId: null,
            workoutType,
            value: marker.cumulative_time_seconds,
            unit: 'seconds',
          });
          break;
        }
      }
    }

    return detectedPRs;
  }

  private detectSplitPRs(markers: RouteMarker[], workoutType: WorkoutType | null): DetectedPR[] {
    const detectedPRs: DetectedPR[] = [];

    // Fastest km split
    const kmMarkers = markers.filter((m) => m.marker_type === 'km');
    if (kmMarkers.length > 0) {
      const fastestKm = Math.min(...kmMarkers.map((m) => m.split_time_seconds));
      detectedPRs.push({
        recordType: PersonalRecordType.FASTEST_KM_SPLIT,
        exerciseId: null,
        workoutType,
        value: fastestKm,
        unit: 'seconds',
      });
    }

    // Fastest mile split
    const mileMarkers = markers.filter((m) => m.marker_type === 'mile');
    if (mileMarkers.length > 0) {
      const fastestMile = Math.min(...mileMarkers.map((m) => m.split_time_seconds));
      detectedPRs.push({
        recordType: PersonalRecordType.FASTEST_MILE_SPLIT,
        exerciseId: null,
        workoutType,
        value: fastestMile,
        unit: 'seconds',
      });
    }

    return detectedPRs;
  }

  private detectOtherCardioPRs(
    route: WorkoutRoute,
    execution: WorkoutExecution,
    workoutType: WorkoutType | null,
  ): DetectedPR[] {
    const detectedPRs: DetectedPR[] = [];

    // Longest distance
    if (route.total_distance_meters) {
      detectedPRs.push({
        recordType: PersonalRecordType.LONGEST_DISTANCE,
        exerciseId: null,
        workoutType,
        value: Number.parseFloat(route.total_distance_meters),
        unit: 'meters',
      });
    }

    // Max elevation gain
    if (route.elevation_gain_meters) {
      detectedPRs.push({
        recordType: PersonalRecordType.MAX_ELEVATION_GAIN,
        exerciseId: null,
        workoutType,
        value: Number.parseFloat(route.elevation_gain_meters),
        unit: 'meters',
      });
    }

    // Longest duration
    if (execution.duration_seconds) {
      detectedPRs.push({
        recordType: PersonalRecordType.LONGEST_DURATION,
        exerciseId: null,
        workoutType,
        value: execution.duration_seconds,
        unit: 'seconds',
      });
    }

    return detectedPRs;
  }

  private async processDetectedPR(
    detected: DetectedPR,
    userId: string,
    executionId: string,
    achievedAt: Date,
  ): Promise<void> {
    const existingPR = await this.personalRecordRepository.findByUserTypeExerciseAndWorkoutType(
      userId,
      detected.recordType,
      detected.exerciseId,
      detected.workoutType,
    );

    // Determine if this is a new PR
    const isNewPR = this.isNewPR(detected, existingPR);

    if (isNewPR) {
      const prData: NewPersonalRecord = {
        user_id: userId,
        record_type: detected.recordType,
        exercise_id: detected.exerciseId,
        workout_type: detected.workoutType,
        value: detected.value,
        unit: detected.unit,
        workout_execution_id: executionId,
        achieved_at: achievedAt,
      };

      // Upsert the current PR
      await this.personalRecordRepository.upsert(prData);

      // Add to history
      await this.personalRecordRepository.createHistory({
        user_id: userId,
        record_type: detected.recordType,
        exercise_id: detected.exerciseId,
        workout_type: detected.workoutType,
        value: detected.value,
        unit: detected.unit,
        workout_execution_id: executionId,
        achieved_at: achievedAt,
      });

      this.logger.log(
        `New PR detected: ${detected.recordType} = ${detected.value} ${detected.unit}` +
          (detected.exerciseId ? ` (exercise: ${detected.exerciseId})` : '') +
          (detected.workoutType ? ` (sport: ${detected.workoutType})` : ''),
      );
    }
  }

  private isNewPR(detected: DetectedPR, existing: { value: string } | undefined): boolean {
    if (!existing) {
      return true;
    }

    const existingValue = Number.parseFloat(existing.value);

    // For time-based PRs (lower is better)
    const timePRTypes: PersonalRecordType[] = [
      PersonalRecordType.FASTEST_1K,
      PersonalRecordType.FASTEST_5K,
      PersonalRecordType.FASTEST_10K,
      PersonalRecordType.FASTEST_HALF_MARATHON,
      PersonalRecordType.FASTEST_MARATHON,
      PersonalRecordType.FASTEST_KM_SPLIT,
      PersonalRecordType.FASTEST_MILE_SPLIT,
    ];

    if (timePRTypes.includes(detected.recordType)) {
      return detected.value < existingValue;
    }

    // For other PRs (higher is better)
    return detected.value > existingValue;
  }
}

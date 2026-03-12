import { Injectable, Logger } from '@nestjs/common';
import {
  NewPersonalRecord,
  PersonalRecordType,
  SetCompletion,
  WorkoutExecution,
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

// Sport-specific distance thresholds in meters
const RUNNING_DISTANCES: Record<PersonalRecordType, number> = {
  [PersonalRecordType.FASTEST_1K]: 1000,
  [PersonalRecordType.FASTEST_5K]: 5000,
  [PersonalRecordType.FASTEST_10K]: 10000,
  [PersonalRecordType.FASTEST_HALF_MARATHON]: 21097.5,
  [PersonalRecordType.FASTEST_MARATHON]: 42195,
} as Record<PersonalRecordType, number>;

const SWIMMING_DISTANCES: Record<PersonalRecordType, number> = {
  [PersonalRecordType.FASTEST_400M]: 400,
  [PersonalRecordType.FASTEST_800M]: 800,
  [PersonalRecordType.FASTEST_1500M]: 1500,
  [PersonalRecordType.FASTEST_1900M]: 1900, // Half Ironman swim
} as Record<PersonalRecordType, number>;

const CYCLING_DISTANCES: Record<PersonalRecordType, number> = {
  [PersonalRecordType.FASTEST_20K]: 20000,
  [PersonalRecordType.FASTEST_40K]: 40000,
  [PersonalRecordType.FASTEST_90K]: 90000, // Half Ironman bike
  [PersonalRecordType.FASTEST_100K]: 100000,
  [PersonalRecordType.FASTEST_180K]: 180000, // Ironman bike
} as Record<PersonalRecordType, number>;

// Minimum realistic times in seconds (based on world records with margin)
const MIN_TIMES: Record<PersonalRecordType, number> = {
  // Running
  [PersonalRecordType.FASTEST_1K]: 120, // 2 min
  [PersonalRecordType.FASTEST_5K]: 600, // 10 min
  [PersonalRecordType.FASTEST_10K]: 1200, // 20 min
  [PersonalRecordType.FASTEST_HALF_MARATHON]: 3000, // 50 min
  [PersonalRecordType.FASTEST_MARATHON]: 6000, // 100 min
  // Swimming
  [PersonalRecordType.FASTEST_400M]: 180, // 3 min
  [PersonalRecordType.FASTEST_800M]: 400, // ~6:40
  [PersonalRecordType.FASTEST_1500M]: 780, // 13 min
  [PersonalRecordType.FASTEST_1900M]: 1000, // ~16:40
  // Cycling
  [PersonalRecordType.FASTEST_20K]: 1200, // 20 min
  [PersonalRecordType.FASTEST_40K]: 2400, // 40 min
  [PersonalRecordType.FASTEST_90K]: 6000, // 100 min
  [PersonalRecordType.FASTEST_100K]: 6600, // 110 min
  [PersonalRecordType.FASTEST_180K]: 12000, // 200 min
} as Record<PersonalRecordType, number>;

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

    const exerciseInstanceIds = [...new Set(setCompletions.map((sc) => sc.exercise_instance_id))];
    const exerciseInstances = await Promise.all(
      exerciseInstanceIds.map((id) => this.exerciseInstanceRepository.findById(id)),
    );

    const instanceToExercise = new Map<string, string>();
    for (const instance of exerciseInstances) {
      if (instance) {
        instanceToExercise.set(instance.id, instance.exercise_id);
      }
    }

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
      const completedSets = sets.filter((s) => !s.skipped);

      const maxWeight = this.findMaxWeight(completedSets);
      if (maxWeight !== null) {
        detectedPRs.push({
          recordType: PersonalRecordType.MAX_WEIGHT,
          exerciseId,
          workoutType: null,
          value: maxWeight,
          unit: 'kg',
        });
      }

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
    // Skip cardio PRs if we can't determine the sport
    if (!workoutType) {
      this.logger.debug(`Skipping cardio PRs for execution ${executionId}: no workout type`);
      return [];
    }

    const route = await this.workoutRouteRepository.findByExecutionId(executionId);
    if (!route) {
      return [];
    }

    const totalDistanceMeters = route.total_distance_meters
      ? Number.parseFloat(route.total_distance_meters)
      : null;
    const totalDurationSeconds = execution.duration_seconds ?? null;

    if (!totalDistanceMeters || !totalDurationSeconds) {
      return [];
    }

    const detectedPRs: DetectedPR[] = [];

    // Detect fastest distance PRs based on sport type
    const distancePRs = this.detectDistancePRs(
      workoutType,
      totalDistanceMeters,
      totalDurationSeconds,
    );
    detectedPRs.push(...distancePRs);

    // Longest distance (per sport)
    detectedPRs.push({
      recordType: PersonalRecordType.LONGEST_DISTANCE,
      exerciseId: null,
      workoutType,
      value: totalDistanceMeters,
      unit: 'meters',
    });

    // Longest duration (per sport)
    detectedPRs.push({
      recordType: PersonalRecordType.LONGEST_DURATION,
      exerciseId: null,
      workoutType,
      value: totalDurationSeconds,
      unit: 'seconds',
    });

    return detectedPRs;
  }

  private detectDistancePRs(
    workoutType: WorkoutType,
    totalDistanceMeters: number,
    totalDurationSeconds: number,
  ): DetectedPR[] {
    const detectedPRs: DetectedPR[] = [];

    // Get distance thresholds based on sport type
    let distances: Record<PersonalRecordType, number>;
    switch (workoutType) {
      case WorkoutType.RUN:
        distances = RUNNING_DISTANCES;
        break;
      case WorkoutType.SWIMMING:
        distances = SWIMMING_DISTANCES;
        break;
      case WorkoutType.CYCLING:
        distances = CYCLING_DISTANCES;
        break;
      default:
        return [];
    }

    // Calculate average pace (time per meter)
    const avgTimePerMeter = totalDurationSeconds / totalDistanceMeters;

    for (const [recordType, targetDistance] of Object.entries(distances)) {
      // Skip if workout didn't cover this distance (with 5% GPS tolerance)
      if (totalDistanceMeters < targetDistance * 0.95) {
        continue;
      }

      // Calculate estimated time for this distance based on average pace
      // This is the simplest and most reliable method
      const estimatedTime = Math.round(avgTimePerMeter * targetDistance);

      // Validate against minimum realistic times
      const minTime = MIN_TIMES[recordType as PersonalRecordType];
      if (minTime && estimatedTime < minTime) {
        this.logger.warn(
          `Skipping ${recordType}: estimated ${estimatedTime}s is below minimum ${minTime}s`,
        );
        continue;
      }

      detectedPRs.push({
        recordType: recordType as PersonalRecordType,
        exerciseId: null,
        workoutType,
        value: estimatedTime,
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

    const isNewPR = this.isNewPR(detected, existingPR);

    // Always create a history entry for every completion (so users can see all attempts)
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

    // Only update the current best PR when it's actually a new record
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

      await this.personalRecordRepository.upsert(prData);

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

    // Time-based PRs (lower is better)
    const timePRTypes: PersonalRecordType[] = [
      // Running
      PersonalRecordType.FASTEST_1K,
      PersonalRecordType.FASTEST_5K,
      PersonalRecordType.FASTEST_10K,
      PersonalRecordType.FASTEST_HALF_MARATHON,
      PersonalRecordType.FASTEST_MARATHON,
      // Swimming
      PersonalRecordType.FASTEST_400M,
      PersonalRecordType.FASTEST_800M,
      PersonalRecordType.FASTEST_1500M,
      PersonalRecordType.FASTEST_1900M,
      // Cycling
      PersonalRecordType.FASTEST_20K,
      PersonalRecordType.FASTEST_40K,
      PersonalRecordType.FASTEST_90K,
      PersonalRecordType.FASTEST_100K,
      PersonalRecordType.FASTEST_180K,
    ];

    if (timePRTypes.includes(detected.recordType)) {
      return detected.value < existingValue;
    }

    // Other PRs (higher is better)
    return detected.value > existingValue;
  }
}

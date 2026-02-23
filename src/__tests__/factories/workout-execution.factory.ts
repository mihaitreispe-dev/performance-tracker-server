import { WorkoutExecution, WorkoutExecutionSource } from '../../database/interfaces';

let executionCounter = 0;

export interface WorkoutExecutionFactoryOptions {
  id?: string;
  userId?: string;
  workoutScheduleId?: string | null;
  startedAt?: string;
  completedAt?: string | null;
  durationSeconds?: number | null;
  source?: WorkoutExecutionSource;
  externalId?: string | null;
  notes?: string | null;
}

export function createWorkoutExecution(options: WorkoutExecutionFactoryOptions = {}): WorkoutExecution {
  executionCounter++;
  const now = new Date().toISOString();
  const startedAt = options.startedAt ?? now;

  return {
    id: options.id ?? `execution-${executionCounter}`,
    user_id: options.userId ?? 'user-1',
    workout_schedule_id: options.workoutScheduleId ?? null,
    started_at: startedAt,
    completed_at: options.completedAt ?? null,
    duration_seconds: options.durationSeconds ?? null,
    source: options.source ?? WorkoutExecutionSource.MANUAL,
    external_id: options.externalId ?? null,
    notes: options.notes ?? null,
    created_at: now,
    updated_at: now,
  };
}

export function createCompletedWorkoutExecution(options: WorkoutExecutionFactoryOptions = {}): WorkoutExecution {
  const now = new Date();
  const startedAt = options.startedAt ?? new Date(now.getTime() - 3600000).toISOString(); // 1 hour ago
  const completedAt = options.completedAt ?? now.toISOString();
  const durationSeconds = options.durationSeconds ?? 3600; // 1 hour

  return createWorkoutExecution({
    ...options,
    startedAt,
    completedAt,
    durationSeconds,
  });
}

export function createStravaExecution(options: WorkoutExecutionFactoryOptions = {}): WorkoutExecution {
  return createWorkoutExecution({
    ...options,
    source: WorkoutExecutionSource.STRAVA,
    externalId: options.externalId ?? `strava-${executionCounter}`,
  });
}

export function resetExecutionCounter(): void {
  executionCounter = 0;
}

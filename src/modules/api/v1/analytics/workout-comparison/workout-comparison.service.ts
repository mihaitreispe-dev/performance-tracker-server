import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { type Request } from 'express';
import { CardioMetricType, CoachAthleteStatus, WorkoutType } from 'src/database/interfaces';
import { AuthUser } from 'src/modules/auth/types/authenticated-user';
import { AthletePrivacySettingsRepository } from 'src/repositories/athlete-privacy-settings.repository';
import { CardioMetricsRepository } from 'src/repositories/cardio-metrics.repository';
import { CoachAthleteRelationshipRepository } from 'src/repositories/coach-athlete-relationship.repository';
import { ExerciseRepository } from 'src/repositories/exercise.repository';
import { ExerciseInstanceRepository } from 'src/repositories/exercise-instance.repository';
import { SetCompletionRepository } from 'src/repositories/set-completion.repository';
import { UserRepository } from 'src/repositories/user.repository';
import { WorkoutRepository } from 'src/repositories/workout.repository';
import { WorkoutExecutionRepository } from 'src/repositories/workout-execution.repository';
import { WorkoutRouteRepository } from 'src/repositories/workout-route.repository';
import { WorkoutScheduleRepository } from 'src/repositories/workout-schedule.repository';

import { CompareAthletesBody, CompareWorkoutsBody, MatchType, SimilarExecutionsQuery } from './request.dto';
import {
  AthleteExecutionDTO,
  CoachAthleteComparisonDataDTO,
  CoachAthleteComparisonResponse,
  ComparisonHighlightDTO,
  ComparisonMetricSummaryDTO,
  ComparisonSetSummaryDTO,
  ComparisonSplitDTO,
  ComparisonSummaryDTO,
  MatchCriteriaDTO,
  SimilarExecutionsDataDTO,
  SimilarExecutionsResponse,
  WorkoutComparisonDataDTO,
  WorkoutComparisonExecutionDTO,
  WorkoutComparisonResponse,
  WorkoutExecutionSummaryDTO,
} from './response.dto';

@Injectable()
export class WorkoutComparisonService {
  constructor(
    private readonly workoutExecutionRepository: WorkoutExecutionRepository,
    private readonly workoutScheduleRepository: WorkoutScheduleRepository,
    private readonly workoutRepository: WorkoutRepository,
    private readonly cardioMetricsRepository: CardioMetricsRepository,
    private readonly workoutRouteRepository: WorkoutRouteRepository,
    private readonly setCompletionRepository: SetCompletionRepository,
    private readonly exerciseInstanceRepository: ExerciseInstanceRepository,
    private readonly exerciseRepository: ExerciseRepository,
    private readonly relationshipRepository: CoachAthleteRelationshipRepository,
    private readonly privacySettingsRepository: AthletePrivacySettingsRepository,
    private readonly userRepository: UserRepository,
  ) {}

  async getSimilarExecutions(
    req: Request & { user: AuthUser },
    executionId: string,
    query: SimilarExecutionsQuery,
  ): Promise<SimilarExecutionsResponse> {
    // Fetch the reference execution
    const execution = await this.workoutExecutionRepository.findById(executionId);
    if (!execution) {
      throw new NotFoundException('Workout execution not found');
    }

    // Check ownership
    if (execution.user_id !== req.user.id) {
      throw new ForbiddenException('Access denied');
    }

    // Get workout info from the reference execution
    let workoutId: string | null = null;
    let workoutName = 'Unknown Workout';
    let workoutType: WorkoutType = WorkoutType.CUSTOM;

    if (execution.workout_schedule_id) {
      const schedule = await this.workoutScheduleRepository.findById(execution.workout_schedule_id);
      if (schedule) {
        const workout = await this.workoutRepository.findById(schedule.workout_id);
        if (workout) {
          workoutId = workout.id;
          workoutName = workout.name;
          workoutType = workout.type;
        }
      }
    } else if (execution.notes) {
      // For imported workouts, infer type from notes
      workoutType = this.inferWorkoutTypeFromNotes(execution.notes);
      workoutName = execution.notes.split('\n')[0] || 'Imported Workout';
    }

    // Determine match type
    const matchType = query.matchType ?? MatchType.EXACT;
    const limit = query.limit ?? 10;

    // Build date filters
    const dateFrom = query.dateFrom ? new Date(query.dateFrom) : undefined;
    const dateTo = query.dateTo ? new Date(query.dateTo + 'T23:59:59.999Z') : undefined;

    // Build match criteria
    const matchCriteria: MatchCriteriaDTO = {};

    // Find similar executions based on match type
    let similarExecutions: typeof execution[] = [];

    if (matchType === MatchType.EXACT && workoutId) {
      // Match by exact workoutId through schedule
      const schedules = await this.workoutScheduleRepository.findMany({
        filter: {
          userId: req.user.id,
          workoutId,
        },
      });

      const scheduleIds = schedules.map((s) => s.id);
      matchCriteria.workoutId = workoutId;

      if (scheduleIds.length > 0) {
        const allExecutions = await this.workoutExecutionRepository.findMany({
          filter: {
            userId: req.user.id,
            completed: true,
            dateFrom,
            dateTo,
          },
          sort: [{ field: 'started_at', direction: 'desc' }],
        });

        similarExecutions = allExecutions.filter(
          (e) => e.workout_schedule_id && scheduleIds.includes(e.workout_schedule_id) && e.id !== executionId,
        );
      }
    } else if (matchType === MatchType.NAME) {
      // Match by workout name
      matchCriteria.workoutName = workoutName;

      // Find all workouts with this name
      const workouts = await this.workoutRepository.findMany({
        filter: { userId: req.user.id },
      });
      const matchingWorkoutIds = workouts.filter((w) => w.name === workoutName).map((w) => w.id);

      if (matchingWorkoutIds.length > 0) {
        const schedules = await this.workoutScheduleRepository.findMany({
          filter: { userId: req.user.id },
        });
        const matchingScheduleIds = schedules.filter((s) => matchingWorkoutIds.includes(s.workout_id)).map((s) => s.id);

        const allExecutions = await this.workoutExecutionRepository.findMany({
          filter: {
            userId: req.user.id,
            completed: true,
            dateFrom,
            dateTo,
          },
          sort: [{ field: 'started_at', direction: 'desc' }],
        });

        similarExecutions = allExecutions.filter(
          (e) =>
            e.id !== executionId &&
            ((e.workout_schedule_id && matchingScheduleIds.includes(e.workout_schedule_id)) ||
              (e.notes && e.notes.toLowerCase().includes(workoutName.toLowerCase()))),
        );
      }
    } else {
      // Match by workout type
      matchCriteria.workoutType = workoutType;

      // Find all workouts of this type
      const workouts = await this.workoutRepository.findMany({
        filter: { userId: req.user.id, type: workoutType },
      });
      const matchingWorkoutIds = workouts.map((w) => w.id);

      const schedules = await this.workoutScheduleRepository.findMany({
        filter: { userId: req.user.id },
      });
      const matchingScheduleIds = schedules.filter((s) => matchingWorkoutIds.includes(s.workout_id)).map((s) => s.id);

      const allExecutions = await this.workoutExecutionRepository.findMany({
        filter: {
          userId: req.user.id,
          completed: true,
          dateFrom,
          dateTo,
        },
        sort: [{ field: 'started_at', direction: 'desc' }],
      });

      similarExecutions = allExecutions.filter(
        (e) =>
          e.id !== executionId &&
          ((e.workout_schedule_id && matchingScheduleIds.includes(e.workout_schedule_id)) ||
            (e.notes && this.inferWorkoutTypeFromNotes(e.notes) === workoutType)),
      );
    }

    // Limit results
    similarExecutions = similarExecutions.slice(0, limit);

    // Build execution summaries with route/metric data
    const summaries: WorkoutExecutionSummaryDTO[] = await Promise.all(
      similarExecutions.map((e) => this.buildExecutionSummary(e)),
    );

    const data: SimilarExecutionsDataDTO = {
      executions: summaries,
      matchCriteria,
    };

    return { data };
  }

  async compareWorkouts(
    req: Request & { user: AuthUser },
    body: CompareWorkoutsBody,
  ): Promise<WorkoutComparisonResponse> {
    const { executionIds, includeMetrics = true, includeSplits = true, includeSets = true } = body;

    // Fetch all executions
    const executions = await Promise.all(executionIds.map((id) => this.workoutExecutionRepository.findById(id)));

    // Validate all executions exist and user has access
    for (let i = 0; i < executions.length; i++) {
      const execution = executions[i];
      if (!execution) {
        throw new NotFoundException(`Workout execution not found: ${executionIds[i]}`);
      }

      if (execution.user_id !== req.user.id) {
        // Check coach access
        const relationship = await this.relationshipRepository.findActiveByCoachAndAthlete(
          req.user.id,
          execution.user_id,
        );

        if (!relationship || relationship.status !== CoachAthleteStatus.ACTIVE) {
          throw new ForbiddenException(`Access denied for execution: ${executionIds[i]}`);
        }

        const settings = await this.privacySettingsRepository.findByUserId(execution.user_id);
        if (!settings?.share_analytics) {
          throw new ForbiddenException(`Athlete has not shared analytics for execution: ${executionIds[i]}`);
        }
      }
    }

    // Build comparison data for each execution
    const comparisonExecutions: WorkoutComparisonExecutionDTO[] = await Promise.all(
      executions.map((e) => this.buildComparisonExecution(e!, includeMetrics, includeSplits, includeSets)),
    );

    // Calculate comparison summary
    const comparisonSummary = this.calculateComparisonSummary(comparisonExecutions);

    const data: WorkoutComparisonDataDTO = {
      executions: comparisonExecutions,
      comparisonSummary,
    };

    return { data };
  }

  async compareAthletes(
    req: Request & { user: AuthUser },
    body: CompareAthletesBody,
  ): Promise<CoachAthleteComparisonResponse> {
    const { workoutId, athleteIds, dateFrom, dateTo } = body;

    // Verify workout exists
    const workout = await this.workoutRepository.findById(workoutId);
    if (!workout) {
      throw new NotFoundException('Workout not found');
    }

    // Verify coach has access to all athletes
    const athleteExecutions: AthleteExecutionDTO[] = [];

    for (const athleteId of athleteIds) {
      const relationship = await this.relationshipRepository.findActiveByCoachAndAthlete(req.user.id, athleteId);

      if (!relationship || relationship.status !== CoachAthleteStatus.ACTIVE) {
        throw new ForbiddenException(`No active coaching relationship with athlete: ${athleteId}`);
      }

      const settings = await this.privacySettingsRepository.findByUserId(athleteId);
      if (!settings?.share_analytics) {
        // Still include athlete but mark as no data
        const user = await this.userRepository.findById(athleteId);
        athleteExecutions.push({
          athleteId,
          athleteName: user?.display_name ?? 'Unknown Athlete',
          execution: null,
          noDataReason: 'Athlete has not shared analytics',
        });
        continue;
      }

      // Find athlete's execution of this workout
      const user = await this.userRepository.findById(athleteId);
      const athleteName = user?.display_name ?? 'Unknown Athlete';

      // Get schedules for this workout
      const schedules = await this.workoutScheduleRepository.findMany({
        filter: {
          userId: athleteId,
          workoutId,
        },
      });

      const scheduleIds = schedules.map((s) => s.id);

      const dateFromFilter = dateFrom ? new Date(dateFrom) : undefined;
      const dateToFilter = dateTo ? new Date(dateTo + 'T23:59:59.999Z') : undefined;

      // Find completed executions
      const allExecutions = await this.workoutExecutionRepository.findMany({
        filter: {
          userId: athleteId,
          completed: true,
          dateFrom: dateFromFilter,
          dateTo: dateToFilter,
        },
        sort: [{ field: 'started_at', direction: 'desc' }],
        limit: 1,
      });

      const matchingExecution = allExecutions.find((e) => e.workout_schedule_id && scheduleIds.includes(e.workout_schedule_id));

      if (!matchingExecution) {
        athleteExecutions.push({
          athleteId,
          athleteName,
          execution: null,
          noDataReason: 'No completed executions found for this workout',
        });
        continue;
      }

      const executionData = await this.buildComparisonExecution(matchingExecution, true, true, true);

      athleteExecutions.push({
        athleteId,
        athleteName,
        execution: executionData,
      });
    }

    // Calculate comparison summary from valid executions
    const validExecutions = athleteExecutions
      .filter((ae) => ae.execution !== null)
      .map((ae) => ae.execution!);

    const comparisonSummary = this.calculateComparisonSummary(validExecutions);

    const data: CoachAthleteComparisonDataDTO = {
      workoutName: workout.name,
      workoutType: workout.type,
      athleteExecutions,
      comparisonSummary,
    };

    return { data };
  }

  private async buildExecutionSummary(execution: any): Promise<WorkoutExecutionSummaryDTO> {
    let workoutId: string | null = null;
    let workoutName = 'Unknown Workout';
    let workoutType: WorkoutType = WorkoutType.CUSTOM;

    if (execution.workout_schedule_id) {
      const schedule = await this.workoutScheduleRepository.findById(execution.workout_schedule_id);
      if (schedule) {
        const workout = await this.workoutRepository.findById(schedule.workout_id);
        if (workout) {
          workoutId = workout.id;
          workoutName = workout.name;
          workoutType = workout.type;
        }
      }
    } else if (execution.notes) {
      workoutType = this.inferWorkoutTypeFromNotes(execution.notes);
      workoutName = execution.notes.split('\n')[0] || 'Imported Workout';
    }

    // Get route data for distance, pace, elevation
    let distanceMeters: number | null = null;
    let paceSecondsPerKm: number | null = null;
    let elevationGainMeters: number | null = null;

    const route = await this.workoutRouteRepository.findByExecutionId(execution.id);
    if (route) {
      distanceMeters = Number.parseFloat(route.total_distance_meters);
      elevationGainMeters = route.elevation_gain_meters ? Number.parseFloat(route.elevation_gain_meters) : null;

      if (distanceMeters && execution.duration_seconds) {
        paceSecondsPerKm = (execution.duration_seconds / distanceMeters) * 1000;
      }
    }

    // Get average heart rate
    const hrMetrics = await this.cardioMetricsRepository.getAggregatedMetrics(execution.id, CardioMetricType.HEART_RATE);
    const avgHeartRate = hrMetrics?.avg ?? null;

    const startedAt =
      execution.started_at instanceof Date ? execution.started_at.toISOString() : String(execution.started_at);
    const completedAt = execution.completed_at
      ? execution.completed_at instanceof Date
        ? execution.completed_at.toISOString()
        : String(execution.completed_at)
      : null;

    return {
      id: execution.id,
      workoutId,
      workoutName,
      workoutType,
      startedAt,
      completedAt,
      durationSeconds: execution.duration_seconds,
      distanceMeters,
      paceSecondsPerKm,
      avgHeartRate,
      elevationGainMeters,
    };
  }

  private async buildComparisonExecution(
    execution: any,
    includeMetrics: boolean,
    includeSplits: boolean,
    includeSets: boolean,
  ): Promise<WorkoutComparisonExecutionDTO> {
    let workoutName = 'Unknown Workout';
    let workoutType: WorkoutType = WorkoutType.CUSTOM;

    if (execution.workout_schedule_id) {
      const schedule = await this.workoutScheduleRepository.findById(execution.workout_schedule_id);
      if (schedule) {
        const workout = await this.workoutRepository.findById(schedule.workout_id);
        if (workout) {
          workoutName = workout.name;
          workoutType = workout.type;
        }
      }
    } else if (execution.notes) {
      workoutType = this.inferWorkoutTypeFromNotes(execution.notes);
      workoutName = execution.notes.split('\n')[0] || 'Imported Workout';
    }

    // Get route data
    let distanceMeters: number | null = null;
    let paceSecondsPerKm: number | null = null;
    let elevationGainMeters: number | null = null;
    let splits: ComparisonSplitDTO[] | undefined;

    const route = await this.workoutRouteRepository.findByExecutionId(execution.id);
    if (route) {
      distanceMeters = Number.parseFloat(route.total_distance_meters);
      elevationGainMeters = route.elevation_gain_meters ? Number.parseFloat(route.elevation_gain_meters) : null;

      if (distanceMeters && execution.duration_seconds) {
        paceSecondsPerKm = (execution.duration_seconds / distanceMeters) * 1000;
      }

      if (includeSplits) {
        const markers = await this.workoutRouteRepository.findMarkersByRouteId(route.id);
        splits = markers.map((m) => ({
          splitNumber: m.marker_number,
          splitTimeSeconds: m.split_time_seconds,
          cumulativeTimeSeconds: m.cumulative_time_seconds,
          avgHeartRate: m.avg_heart_rate,
          avgPaceSecondsPerKm: m.avg_pace_seconds_per_km,
          elevationMeters: m.elevation_meters ? Number.parseFloat(m.elevation_meters) : null,
        }));
      }
    }

    // Get metrics summary
    let metricsSummary: ComparisonMetricSummaryDTO[] | undefined;
    let avgHeartRate: number | null = null;
    let maxHeartRate: number | null = null;

    if (includeMetrics) {
      metricsSummary = [];
      const metricTypes = Object.values(CardioMetricType);

      for (const metricType of metricTypes) {
        const aggregated = await this.cardioMetricsRepository.getAggregatedMetrics(execution.id, metricType);
        if (aggregated) {
          const metrics = await this.cardioMetricsRepository.findMany({
            filter: { workoutExecutionId: execution.id, metricType },
            limit: 1,
          });
          const unit = metrics.length > 0 ? metrics[0].unit : '';

          metricsSummary.push({
            metricType,
            min: aggregated.min,
            max: aggregated.max,
            avg: aggregated.avg,
            unit,
          });

          if (metricType === CardioMetricType.HEART_RATE) {
            avgHeartRate = aggregated.avg;
            maxHeartRate = aggregated.max;
          }
        }
      }
    } else {
      const hrMetrics = await this.cardioMetricsRepository.getAggregatedMetrics(
        execution.id,
        CardioMetricType.HEART_RATE,
      );
      if (hrMetrics) {
        avgHeartRate = hrMetrics.avg;
        maxHeartRate = hrMetrics.max;
      }
    }

    // Get set completions summary
    let setsSummary: ComparisonSetSummaryDTO[] | undefined;

    if (includeSets) {
      const setCompletions = await this.setCompletionRepository.findMany({
        filter: { workoutExecutionId: execution.id },
      });

      if (setCompletions.length > 0) {
        const exerciseInstanceMap = new Map<string, typeof setCompletions>();
        for (const sc of setCompletions) {
          const existing = exerciseInstanceMap.get(sc.exercise_instance_id) ?? [];
          existing.push(sc);
          exerciseInstanceMap.set(sc.exercise_instance_id, existing);
        }

        const instanceIds = [...exerciseInstanceMap.keys()];
        const instances = await this.exerciseInstanceRepository.findByIds(instanceIds);
        const instanceLookup = new Map(instances.map((i) => [i.id, i]));

        const exerciseIds = [...new Set(instances.map((i) => i.exercise_id))];
        const exercises = await this.exerciseRepository.findByIds(exerciseIds);
        const exerciseLookup = new Map(exercises.map((e) => [e.id, e]));

        setsSummary = [];
        for (const [instanceId, completions] of exerciseInstanceMap) {
          const instance = instanceLookup.get(instanceId);
          if (!instance) continue;

          const exercise = exerciseLookup.get(instance.exercise_id);
          const exerciseName = exercise?.name ?? 'Unknown Exercise';

          const completedSets = completions.filter((c) => !c.skipped).length;
          const rpes = completions.filter((c) => c.rpe !== null).map((c) => c.rpe!);
          const avgRpe = rpes.length > 0 ? rpes.reduce((a, b) => a + b, 0) / rpes.length : null;

          const reps = completions.filter((c) => c.actual_reps !== null).map((c) => c.actual_reps!);
          const totalReps = reps.length > 0 ? reps.reduce((a, b) => a + b, 0) : null;

          const loads = completions.filter((c) => c.actual_load !== null).map((c) => Number.parseFloat(c.actual_load!));
          const maxLoad = loads.length > 0 ? Math.max(...loads) : null;

          // Calculate total volume (reps * load)
          let totalVolume: number | null = null;
          if (totalReps && maxLoad) {
            totalVolume = completions
              .filter((c) => c.actual_reps !== null && c.actual_load !== null)
              .reduce((sum, c) => sum + c.actual_reps! * Number.parseFloat(c.actual_load!), 0);
          }

          setsSummary.push({
            exerciseInstanceId: instanceId,
            exerciseName,
            totalSets: instance.sets,
            completedSets,
            avgRpe,
            totalReps,
            maxLoad,
            totalVolume,
          });
        }
      }
    }

    const startedAt =
      execution.started_at instanceof Date ? execution.started_at.toISOString() : String(execution.started_at);
    const completedAt = execution.completed_at
      ? execution.completed_at instanceof Date
        ? execution.completed_at.toISOString()
        : String(execution.completed_at)
      : null;

    return {
      executionId: execution.id,
      workoutName,
      workoutType,
      startedAt,
      completedAt,
      durationSeconds: execution.duration_seconds,
      distanceMeters,
      paceSecondsPerKm,
      avgHeartRate,
      maxHeartRate,
      elevationGainMeters,
      caloriesBurned: null, // TODO: Calculate if needed
      metricsSummary,
      splits,
      setsSummary,
    };
  }

  private calculateComparisonSummary(executions: WorkoutComparisonExecutionDTO[]): ComparisonSummaryDTO {
    const summary: ComparisonSummaryDTO = {};

    // Best pace (lowest seconds per km = faster)
    const withPace = executions.filter((e) => e.paceSecondsPerKm != null);
    if (withPace.length > 0) {
      const best = withPace.reduce((a, b) => (a.paceSecondsPerKm! < b.paceSecondsPerKm! ? a : b));
      summary.bestPace = {
        executionId: best.executionId,
        value: best.paceSecondsPerKm!,
      };
    }

    // Fastest time (lowest duration)
    const withDuration = executions.filter((e) => e.durationSeconds != null);
    if (withDuration.length > 0) {
      const fastest = withDuration.reduce((a, b) => (a.durationSeconds! < b.durationSeconds! ? a : b));
      summary.fastestTime = {
        executionId: fastest.executionId,
        value: fastest.durationSeconds!,
      };
    }

    // Lowest avg HR
    const withHR = executions.filter((e) => e.avgHeartRate != null);
    if (withHR.length > 0) {
      const lowest = withHR.reduce((a, b) => (a.avgHeartRate! < b.avgHeartRate! ? a : b));
      summary.lowestAvgHR = {
        executionId: lowest.executionId,
        value: lowest.avgHeartRate!,
      };
    }

    // Most elevation gain
    const withElevation = executions.filter((e) => e.elevationGainMeters != null);
    if (withElevation.length > 0) {
      const most = withElevation.reduce((a, b) => (a.elevationGainMeters! > b.elevationGainMeters! ? a : b));
      summary.mostElevation = {
        executionId: most.executionId,
        value: most.elevationGainMeters!,
      };
    }

    // Highest volume (for strength)
    const withSets = executions.filter((e) => e.setsSummary && e.setsSummary.length > 0);
    if (withSets.length > 0) {
      const volumeByExecution = withSets.map((e) => ({
        executionId: e.executionId,
        totalVolume: e.setsSummary!.reduce((sum, s) => sum + (s.totalVolume ?? 0), 0),
      }));

      const highest = volumeByExecution.reduce((a, b) => (a.totalVolume > b.totalVolume ? a : b));
      if (highest.totalVolume > 0) {
        summary.highestVolume = {
          executionId: highest.executionId,
          value: highest.totalVolume,
        };
      }
    }

    return summary;
  }

  private inferWorkoutTypeFromNotes(notes: string | null): WorkoutType {
    if (!notes) return WorkoutType.CUSTOM;

    const lowerNotes = notes.toLowerCase();

    if (lowerNotes.includes('run') || lowerNotes.includes('running')) {
      return WorkoutType.RUN;
    }
    if (lowerNotes.includes('cycl') || lowerNotes.includes('bike') || lowerNotes.includes('biking')) {
      return WorkoutType.CYCLING;
    }
    if (lowerNotes.includes('swim')) {
      return WorkoutType.SWIMMING;
    }
    if (lowerNotes.includes('walk')) {
      return WorkoutType.WALKING;
    }
    if (lowerNotes.includes('strength') || lowerNotes.includes('weight') || lowerNotes.includes('lift')) {
      return WorkoutType.STRENGTH;
    }
    if (lowerNotes.includes('hiit') || lowerNotes.includes('interval')) {
      return WorkoutType.HIIT;
    }
    if (lowerNotes.includes('cardio')) {
      return WorkoutType.CARDIO;
    }
    if (lowerNotes.includes('yoga') || lowerNotes.includes('stretch') || lowerNotes.includes('flexibility')) {
      return WorkoutType.FLEXIBILITY;
    }

    return WorkoutType.CUSTOM;
  }
}

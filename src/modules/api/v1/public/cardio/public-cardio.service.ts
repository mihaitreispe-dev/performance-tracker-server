import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import {
  CardioMetric,
  ExecutionWeather,
  GeoJSONLineString,
  OrganisationRole,
  RouteMarker,
  WorkoutExecution,
  WorkoutRoute,
} from 'src/database/interfaces';
import { CardioMetricsRepository } from 'src/repositories/cardio-metrics.repository';
import { ExecutionWeatherRepository } from 'src/repositories/execution-weather.repository';
import { OrganisationMembershipRepository } from 'src/repositories/organisation-membership.repository';
import { WorkoutExecutionRepository } from 'src/repositories/workout-execution.repository';
import { WorkoutRouteRepository } from 'src/repositories/workout-route.repository';

import {
  CardioMetricsBatchBody,
  ListCardioMetricsQuery,
  UploadRouteBody,
} from './request.dto';
import {
  PublicCardioMetricDTO,
  PublicCardioMetricListResponse,
  PublicCardioMetricsBatchResponse,
  PublicExecutionWeatherDTO,
  PublicExecutionWeatherResponse,
  PublicRouteMarkerDTO,
  PublicWorkoutRouteDTO,
  PublicWorkoutRouteResponse,
} from './response.dto';

/**
 * Phase 7 — cardio + GPS surface for the public API. Three resource families
 * tied to a workout_execution: the GPS route (with optional split markers),
 * the time-series cardio metric streams (HR, pace, cadence, power, ...), and the
 * weather snapshot at the execution location.
 *
 * Tenant boundary: every endpoint resolves the execution first, then verifies
 * the execution's user is a member of the API key's organisation (athlete role).
 * Mirrors the layered ownership check Phase 5 / Phase 6 use for execution-scoped
 * writes.
 *
 * Single-route invariant: only one route per execution (the schema doesn't have
 * a unique constraint, but the first-party API enforces it, and the rest of the
 * system assumes it). We mirror that by refusing duplicate uploads with a 400.
 * If a third-party app needs to replace a route, they need a separate
 * delete-then-upload flow — not exposed in v1.
 */
@Injectable()
export class PublicCardioService {
  /**
   * Hard cap on the batch size for cardio metrics. 50k samples is roughly 14 hours
   * at 1Hz; a single run usually fits in one batch, and we don't want a misbehaving
   * client posting megabytes per request. Larger imports should be chunked.
   */
  private static readonly MAX_BATCH_SIZE = 50_000;

  constructor(
    private readonly membershipRepo: OrganisationMembershipRepository,
    private readonly executionRepo: WorkoutExecutionRepository,
    private readonly routeRepo: WorkoutRouteRepository,
    private readonly cardioRepo: CardioMetricsRepository,
    private readonly weatherRepo: ExecutionWeatherRepository,
  ) {}

  // -------- Routes --------

  async uploadRoute(
    organisationId: string,
    executionId: string,
    body: UploadRouteBody,
  ): Promise<PublicWorkoutRouteResponse> {
    await this.assertExecutionInOrg(organisationId, executionId);

    if (body.route.coordinates.length < 2) {
      throw new BadRequestException('A route needs at least two coordinates.');
    }

    const existing = await this.routeRepo.findByExecutionId(executionId);
    if (existing) {
      throw new BadRequestException(
        'A route already exists for this execution. Delete it first if you need to replace it.',
      );
    }

    const route = await this.routeRepo.create({
      workout_execution_id: executionId,
      route_geojson: body.route as GeoJSONLineString,
      total_distance_meters: body.totalDistanceMeters.toString(),
      elevation_gain_meters: body.elevationGainMeters?.toString() ?? null,
      elevation_loss_meters: body.elevationLossMeters?.toString() ?? null,
    });

    let markers: RouteMarker[] = [];
    if (body.markers && body.markers.length > 0) {
      markers = await this.routeRepo.createMarkers(
        body.markers.map((m, idx) => ({
          workout_route_id: route.id,
          marker_type: m.markerType ?? 'split',
          marker_number: m.markerNumber ?? idx + 1,
          latitude: m.latitude.toString(),
          longitude: m.longitude.toString(),
          elevation_meters: m.elevationMeters?.toString() ?? null,
          recorded_at: new Date(m.recordedAt),
          split_time_seconds: m.splitTimeSeconds,
          cumulative_time_seconds: m.cumulativeTimeSeconds,
          avg_heart_rate: m.avgHeartRate ?? null,
          avg_pace_seconds_per_km: m.avgPaceSecondsPerKm ?? null,
        })),
      );
    }

    return { data: mapRouteDTO(route, markers) };
  }

  async getRoute(
    organisationId: string,
    executionId: string,
  ): Promise<PublicWorkoutRouteResponse> {
    await this.assertExecutionInOrg(organisationId, executionId);
    const route = await this.routeRepo.findByExecutionId(executionId);
    if (!route) throw new NotFoundException('No route uploaded for this execution');
    const markers = await this.routeRepo.findMarkersByRouteId(route.id);
    return { data: mapRouteDTO(route, markers) };
  }

  // -------- Cardio metrics --------

  async uploadCardioMetrics(
    organisationId: string,
    executionId: string,
    body: CardioMetricsBatchBody,
  ): Promise<PublicCardioMetricsBatchResponse> {
    await this.assertExecutionInOrg(organisationId, executionId);

    if (body.samples.length === 0) {
      return { data: { count: 0 } };
    }
    if (body.samples.length > PublicCardioService.MAX_BATCH_SIZE) {
      throw new BadRequestException(
        `Too many samples — chunk into batches of ${PublicCardioService.MAX_BATCH_SIZE} or fewer.`,
      );
    }

    const rows = body.samples.map((s) => ({
      workout_execution_id: executionId,
      metric_type: s.metricType,
      recorded_at: new Date(s.recordedAt),
      value: s.value.toString(),
      unit: s.unit,
    }));
    const created = await this.cardioRepo.createMany(rows as never);
    return { data: { count: created.length } };
  }

  async listCardioMetrics(
    organisationId: string,
    executionId: string,
    query: ListCardioMetricsQuery,
  ): Promise<PublicCardioMetricListResponse> {
    await this.assertExecutionInOrg(organisationId, executionId);

    const samples = await this.cardioRepo.findMany({
      filter: {
        workoutExecutionId: executionId,
        metricType: query.metricType,
      },
      limit: query.limit ?? 50_000,
      offset: query.offset ?? 0,
    });
    return { data: samples.map(mapCardioMetricDTO) };
  }

  // -------- Weather --------

  async getWeather(
    organisationId: string,
    executionId: string,
  ): Promise<PublicExecutionWeatherResponse> {
    await this.assertExecutionInOrg(organisationId, executionId);
    const row = await this.weatherRepo.findByExecutionId(executionId);
    if (!row) throw new NotFoundException('No weather data for this execution');
    return { data: mapWeatherDTO(row) };
  }

  // -------- guards --------

  private async assertExecutionInOrg(
    organisationId: string,
    executionId: string,
  ): Promise<WorkoutExecution> {
    const execution = await this.executionRepo.findById(executionId);
    if (!execution) throw new NotFoundException('Workout execution not found');
    const membership = await this.membershipRepo.findByUserAndOrg(execution.user_id, organisationId);
    if (!membership || membership.role !== OrganisationRole.ATHLETE) {
      // 404 not 403 — don't tell attackers whether the execution exists in some other tenant.
      throw new NotFoundException('Workout execution not found');
    }
    return execution;
  }
}

// ---- mappers ----

function mapRouteDTO(route: WorkoutRoute, markers: RouteMarker[]): PublicWorkoutRouteDTO {
  return {
    id: route.id,
    workoutExecutionId: route.workout_execution_id,
    route: route.route_geojson as GeoJSONLineString,
    totalDistanceMeters: Number.parseFloat(route.total_distance_meters),
    elevationGainMeters:
      route.elevation_gain_meters != null ? Number.parseFloat(route.elevation_gain_meters) : null,
    elevationLossMeters:
      route.elevation_loss_meters != null ? Number.parseFloat(route.elevation_loss_meters) : null,
    createdAt: isoOf(route.created_at),
    markers: markers.map(mapMarkerDTO),
  };
}

function mapMarkerDTO(m: RouteMarker): PublicRouteMarkerDTO {
  return {
    id: m.id,
    markerType: m.marker_type,
    markerNumber: m.marker_number,
    latitude: Number.parseFloat(m.latitude),
    longitude: Number.parseFloat(m.longitude),
    elevationMeters: m.elevation_meters != null ? Number.parseFloat(m.elevation_meters) : null,
    recordedAt: isoOf(m.recorded_at),
    splitTimeSeconds: m.split_time_seconds,
    cumulativeTimeSeconds: m.cumulative_time_seconds,
    avgHeartRate: m.avg_heart_rate,
    avgPaceSecondsPerKm: m.avg_pace_seconds_per_km,
  };
}

function mapCardioMetricDTO(m: CardioMetric): PublicCardioMetricDTO {
  return {
    id: m.id,
    workoutExecutionId: m.workout_execution_id,
    metricType: m.metric_type,
    recordedAt: isoOf(m.recorded_at),
    value: Number.parseFloat(m.value),
    unit: m.unit,
  };
}

function mapWeatherDTO(w: ExecutionWeather): PublicExecutionWeatherDTO {
  const numOrNull = (v: unknown) => (v == null ? null : Number.parseFloat(String(v)));
  return {
    id: w.id,
    workoutExecutionId: w.workout_execution_id,
    latitude: Number.parseFloat(w.latitude),
    longitude: Number.parseFloat(w.longitude),
    recordedAt: isoOf(w.recorded_at),
    temperatureCelsius: numOrNull(w.temperature_celsius),
    feelsLikeCelsius: numOrNull(w.feels_like_celsius),
    humidityPercent: w.humidity_percent ?? null,
    windSpeedKmh: numOrNull(w.wind_speed_kmh),
    windDirectionDegrees: w.wind_direction_degrees ?? null,
    windGustsKmh: numOrNull(w.wind_gusts_kmh),
    precipitationMm: numOrNull(w.precipitation_mm),
    weatherCode: w.weather_code ?? null,
    weatherDescription: w.weather_description ?? null,
    cloudCoverPercent: w.cloud_cover_percent ?? null,
    pressureHpa: numOrNull(w.pressure_hpa),
    visibilityMeters: w.visibility_meters ?? null,
    uvIndex: numOrNull(w.uv_index),
  };
}

function isoOf(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string') return new Date(value).toISOString();
  return new Date().toISOString();
}

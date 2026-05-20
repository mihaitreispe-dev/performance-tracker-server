import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import {
  CardioMetricType,
  GeoJSONLineString,
  OrganisationMembership,
  OrganisationRole,
  RouteMarker,
  WorkoutExecution,
  WorkoutExecutionSource,
  WorkoutRoute,
} from 'src/database/interfaces';
import { CardioMetricsRepository } from 'src/repositories/cardio-metrics.repository';
import { ExecutionWeatherRepository } from 'src/repositories/execution-weather.repository';
import { OrganisationMembershipRepository } from 'src/repositories/organisation-membership.repository';
import { WorkoutExecutionRepository } from 'src/repositories/workout-execution.repository';
import { WorkoutRouteRepository } from 'src/repositories/workout-route.repository';

import { PublicCardioService } from './public-cardio.service';

const ORG = 'org-1';
const USER = 'u-1';
const EXEC = 'exec-1';

const athleteMembership = (): OrganisationMembership =>
  ({ id: 'm', organisation_id: ORG, user_id: USER, role: OrganisationRole.ATHLETE }) as never;
const inflightExecution = (): WorkoutExecution =>
  ({
    id: EXEC,
    user_id: USER,
    started_at: new Date(),
    completed_at: null,
    duration_seconds: null,
    source: WorkoutExecutionSource.MANUAL,
    workout_schedule_id: null,
    external_id: null,
    notes: null,
    session_rpe: null,
    srpe_tss: null,
    rpe_collected_at: null,
    created_at: new Date(),
    updated_at: new Date(),
  }) as never;

const sampleRouteGeoJson: GeoJSONLineString = {
  type: 'LineString',
  coordinates: [
    [-122.43, 37.78],
    [-122.42, 37.79],
    [-122.41, 37.79],
  ],
};

describe('PublicCardioService', () => {
  let service: PublicCardioService;
  let memRepo: jest.Mocked<OrganisationMembershipRepository>;
  let execRepo: jest.Mocked<WorkoutExecutionRepository>;
  let routeRepo: jest.Mocked<WorkoutRouteRepository>;
  let cardioRepo: jest.Mocked<CardioMetricsRepository>;
  let weatherRepo: jest.Mocked<ExecutionWeatherRepository>;

  beforeEach(async () => {
    const m: TestingModule = await Test.createTestingModule({
      providers: [
        PublicCardioService,
        { provide: OrganisationMembershipRepository, useValue: { findByUserAndOrg: jest.fn() } },
        { provide: WorkoutExecutionRepository, useValue: { findById: jest.fn() } },
        {
          provide: WorkoutRouteRepository,
          useValue: {
            findByExecutionId: jest.fn(),
            create: jest.fn(),
            createMarkers: jest.fn().mockResolvedValue([]),
            findMarkersByRouteId: jest.fn().mockResolvedValue([]),
          },
        },
        {
          provide: CardioMetricsRepository,
          useValue: { createMany: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
        },
        {
          provide: ExecutionWeatherRepository,
          useValue: { findByExecutionId: jest.fn() },
        },
      ],
    }).compile();

    service = m.get(PublicCardioService);
    memRepo = m.get(OrganisationMembershipRepository);
    execRepo = m.get(WorkoutExecutionRepository);
    routeRepo = m.get(WorkoutRouteRepository);
    cardioRepo = m.get(CardioMetricsRepository);
    weatherRepo = m.get(ExecutionWeatherRepository);
  });

  describe('tenant isolation', () => {
    it('uploadRoute 404s when execution belongs to a user not in the org', async () => {
      execRepo.findById.mockResolvedValue(inflightExecution());
      memRepo.findByUserAndOrg.mockResolvedValue(undefined as never);
      await expect(
        service.uploadRoute(ORG, EXEC, {
          route: sampleRouteGeoJson,
          totalDistanceMeters: 1000,
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('getRoute 404s on missing execution', async () => {
      execRepo.findById.mockResolvedValue(undefined as never);
      await expect(service.getRoute(ORG, EXEC)).rejects.toThrow(NotFoundException);
    });

    it('uploadCardioMetrics 404s when membership role is not athlete', async () => {
      execRepo.findById.mockResolvedValue(inflightExecution());
      memRepo.findByUserAndOrg.mockResolvedValue({
        ...athleteMembership(),
        role: OrganisationRole.COACH,
      });
      await expect(
        service.uploadCardioMetrics(ORG, EXEC, { samples: [] }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('uploadRoute', () => {
    beforeEach(() => {
      execRepo.findById.mockResolvedValue(inflightExecution());
      memRepo.findByUserAndOrg.mockResolvedValue(athleteMembership());
    });

    it('rejects routes with fewer than 2 coordinates', async () => {
      await expect(
        service.uploadRoute(ORG, EXEC, {
          route: { type: 'LineString', coordinates: [[-122, 37]] },
          totalDistanceMeters: 0,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('refuses to overwrite an existing route', async () => {
      routeRepo.findByExecutionId.mockResolvedValue({ id: 'r-old' } as unknown as WorkoutRoute);
      await expect(
        service.uploadRoute(ORG, EXEC, {
          route: sampleRouteGeoJson,
          totalDistanceMeters: 5000,
        }),
      ).rejects.toThrow(/already exists/);
    });

    it('creates the route + markers and returns the joined DTO', async () => {
      routeRepo.findByExecutionId.mockResolvedValue(undefined as never);
      routeRepo.create.mockResolvedValue({
        id: 'r-1',
        workout_execution_id: EXEC,
        route_geojson: sampleRouteGeoJson,
        total_distance_meters: '5000',
        elevation_gain_meters: '120',
        elevation_loss_meters: '120',
        created_at: new Date(),
      } as unknown as WorkoutRoute);
      routeRepo.createMarkers.mockResolvedValue([
        {
          id: 'mk-1',
          workout_route_id: 'r-1',
          marker_type: 'split',
          marker_number: 1,
          latitude: '37.78',
          longitude: '-122.43',
          elevation_meters: null,
          recorded_at: new Date(),
          split_time_seconds: 300,
          cumulative_time_seconds: 300,
          avg_heart_rate: 150,
          avg_pace_seconds_per_km: 360,
          created_at: new Date(),
        } as unknown as RouteMarker,
      ]);

      const out = await service.uploadRoute(ORG, EXEC, {
        route: sampleRouteGeoJson,
        totalDistanceMeters: 5000,
        elevationGainMeters: 120,
        elevationLossMeters: 120,
        markers: [
          {
            latitude: 37.78,
            longitude: -122.43,
            recordedAt: '2026-05-20T10:00:00Z',
            splitTimeSeconds: 300,
            cumulativeTimeSeconds: 300,
            avgHeartRate: 150,
            avgPaceSecondsPerKm: 360,
          },
        ],
      });

      expect(out.data.totalDistanceMeters).toBe(5000);
      expect(out.data.markers).toHaveLength(1);
      expect(out.data.markers[0].latitude).toBe(37.78);
      expect(routeRepo.createMarkers).toHaveBeenCalledTimes(1);
    });
  });

  describe('uploadCardioMetrics', () => {
    beforeEach(() => {
      execRepo.findById.mockResolvedValue(inflightExecution());
      memRepo.findByUserAndOrg.mockResolvedValue(athleteMembership());
    });

    it('returns count=0 without writing when samples are empty', async () => {
      const out = await service.uploadCardioMetrics(ORG, EXEC, { samples: [] });
      expect(out.data.count).toBe(0);
      expect(cardioRepo.createMany).not.toHaveBeenCalled();
    });

    it('rejects batches over the 50k cap', async () => {
      const samples = Array.from({ length: 50_001 }, (_, i) => ({
        metricType: CardioMetricType.HEART_RATE,
        recordedAt: new Date(2026, 0, 1, 0, 0, i).toISOString(),
        value: 150,
        unit: 'bpm',
      }));
      await expect(
        service.uploadCardioMetrics(ORG, EXEC, { samples }),
      ).rejects.toThrow(BadRequestException);
    });

    it('forwards a normal batch to createMany and returns the count', async () => {
      const samples = [
        {
          metricType: CardioMetricType.HEART_RATE,
          recordedAt: '2026-05-20T10:00:00Z',
          value: 150,
          unit: 'bpm',
        },
        {
          metricType: CardioMetricType.PACE,
          recordedAt: '2026-05-20T10:00:01Z',
          value: 4.5,
          unit: 'm/s',
        },
      ];
      cardioRepo.createMany.mockResolvedValue([{ id: '1' }, { id: '2' }] as never);
      const out = await service.uploadCardioMetrics(ORG, EXEC, { samples });
      expect(out.data.count).toBe(2);
      expect(cardioRepo.createMany).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ workout_execution_id: EXEC, metric_type: 'heart_rate', value: '150' }),
        ]),
      );
    });
  });

  describe('getWeather', () => {
    it('404s when no weather row exists for the execution', async () => {
      execRepo.findById.mockResolvedValue(inflightExecution());
      memRepo.findByUserAndOrg.mockResolvedValue(athleteMembership());
      weatherRepo.findByExecutionId.mockResolvedValue(undefined as never);
      await expect(service.getWeather(ORG, EXEC)).rejects.toThrow(NotFoundException);
    });
  });
});

import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Request } from 'express';
import { NewAthleteRace } from 'src/database/interfaces/athlete-races-table.interface';
import type { PeriodizationPhase } from 'src/database/interfaces/periodization-plans-table.interface';
import { AuthUser } from 'src/modules/auth/types/authenticated-user';
import { AthleteRaceRepository, AthleteRaceWithEvent } from 'src/repositories/athlete-race.repository';
import { PeriodizationPlanRepository } from 'src/repositories/periodization-plan.repository';
import { RaceEventRepository } from 'src/repositories/race-event.repository';

import {
  ActiveNetworkService,
  ExternalRaceEvent,
  OpenTrackService,
  RaceSearchParams,
  RunSignUpService,
  WorldTriathlonService,
} from './race-apis';
import {
  CreateAthleteRaceBody,
  GeneratePeriodizationQuery,
  SearchRacesQuery,
  UpdateAthleteRaceBody,
  UpdatePeriodizationBody,
} from './request.dto';
import { AthleteRaceDTO, PeriodizationPlanDTO, RaceEventDTO } from './response.dto';
import { AthleteLevel } from './types';

@Injectable()
export class RaceCalendarApiService {
  private readonly logger = new Logger(RaceCalendarApiService.name);

  constructor(
    private readonly raceEventRepo: RaceEventRepository,
    private readonly athleteRaceRepo: AthleteRaceRepository,
    private readonly periodizationPlanRepo: PeriodizationPlanRepository,
    private readonly activeNetworkService: ActiveNetworkService,
    private readonly runSignUpService: RunSignUpService,
    private readonly worldTriathlonService: WorldTriathlonService,
    private readonly openTrackService: OpenTrackService,
  ) {}

  // ==========================================================================
  // Race Event Search
  // ==========================================================================

  async searchRaces(query: SearchRacesQuery): Promise<RaceEventDTO[]> {
    this.logger.log(`searchRaces called with query: ${JSON.stringify(query)}`);

    // Build search params for external APIs
    const searchParams: RaceSearchParams = {
      eventType: query.event_type,
      location: query.location,
      latitude: query.latitude,
      longitude: query.longitude,
      radiusKm: query.radius_km,
      startDate: query.start_date ? new Date(query.start_date) : undefined,
      endDate: query.end_date ? new Date(query.end_date) : undefined,
      page: query.page,
      limit: query.limit,
    };

    // Search external APIs in parallel
    const [activeResults, runSignUpResults, worldTriathlonResults, openTrackResults] = await Promise.all([
      this.activeNetworkService.search(searchParams).catch((err) => {
        this.logger.warn(`ACTIVE Network search failed: ${err}`);
        return [] as ExternalRaceEvent[];
      }),
      this.runSignUpService.search(searchParams).catch((err) => {
        this.logger.warn(`RunSignUp search failed: ${err}`);
        return [] as ExternalRaceEvent[];
      }),
      this.worldTriathlonService.search(searchParams).catch((err) => {
        this.logger.warn(`World Triathlon search failed: ${err}`);
        return [] as ExternalRaceEvent[];
      }),
      this.openTrackService.search(searchParams).catch((err) => {
        this.logger.warn(`OpenTrack search failed: ${err}`);
        return [] as ExternalRaceEvent[];
      }),
    ]);

    this.logger.log(
      `External API results - ACTIVE: ${activeResults.length}, RunSignUp: ${runSignUpResults.length}, WorldTriathlon: ${worldTriathlonResults.length}, OpenTrack: ${openTrackResults.length}`,
    );

    // Combine and cache results
    const externalEvents = [...activeResults, ...runSignUpResults, ...worldTriathlonResults, ...openTrackResults];
    const cachedEvents: RaceEventDTO[] = [];

    for (const event of externalEvents) {
      try {
        // Check if already cached
        let dbEvent = await this.raceEventRepo.findByExternalId(event.externalId, event.source);

        if (!dbEvent) {
          // Cache the new event
          dbEvent = await this.raceEventRepo.create({
            external_id: event.externalId,
            source: event.source,
            name: event.name,
            description: event.description,
            event_type: event.eventType,
            date: event.date,
            location_city: event.locationCity,
            location_country: event.locationCountry,
            latitude: event.latitude,
            longitude: event.longitude,
            distance_meters: event.distanceMeters,
            elevation_gain_meters: event.elevationGainMeters,
            url: event.url,
          });
          this.logger.debug(`Cached new event: ${event.name} (${event.source})`);
        }

        cachedEvents.push(this.mapRaceEventToDTO(dbEvent));
      } catch (err) {
        this.logger.warn(`Failed to cache event ${event.externalId}: ${err}`);
      }
    }

    // Also include any previously cached events from the database that match the query
    const dbEvents = await this.raceEventRepo.findMany({
      filter: {
        eventType: query.event_type,
        locationCity: query.location,
        startDate: query.start_date ? new Date(query.start_date) : undefined,
        endDate: query.end_date ? new Date(query.end_date) : undefined,
      },
      limit: query.limit,
      offset: ((query.page ?? 1) - 1) * (query.limit ?? 20),
    });

    // Merge cached events with DB events, avoiding duplicates
    const seenIds = new Set(cachedEvents.map((e) => e.id));
    const mergedResults = [...cachedEvents];

    for (const dbEvent of dbEvents) {
      if (!seenIds.has(dbEvent.id)) {
        mergedResults.push(this.mapRaceEventToDTO(dbEvent));
        seenIds.add(dbEvent.id);
      }
    }

    // Sort by date and apply limit
    mergedResults.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    const result = mergedResults.slice(0, query.limit ?? 20);

    this.logger.log(`searchRaces returning ${result.length} events`);
    return result;
  }

  async getRaceDetails(externalId: string, source: string): Promise<RaceEventDTO> {
    // First check if we have it cached
    let event = await this.raceEventRepo.findByExternalId(
      externalId,
      source as 'active' | 'runsignup' | 'worldtriathlon' | 'opentrack' | 'manual',
    );

    if (!event) {
      // Try to fetch from external API
      this.logger.log(`Race ${externalId} not cached, fetching from ${source}`);

      let externalEvent: ExternalRaceEvent | null = null;

      if (source === 'active') {
        externalEvent = await this.activeNetworkService.getDetails(externalId);
      } else if (source === 'runsignup') {
        externalEvent = await this.runSignUpService.getDetails(externalId);
      } else if (source === 'worldtriathlon') {
        externalEvent = await this.worldTriathlonService.getDetails(externalId);
      } else if (source === 'opentrack') {
        externalEvent = await this.openTrackService.getDetails(externalId);
      }

      if (externalEvent) {
        // Cache and return
        event = await this.raceEventRepo.create({
          external_id: externalEvent.externalId,
          source: externalEvent.source,
          name: externalEvent.name,
          description: externalEvent.description,
          event_type: externalEvent.eventType,
          date: externalEvent.date,
          location_city: externalEvent.locationCity,
          location_country: externalEvent.locationCountry,
          latitude: externalEvent.latitude,
          longitude: externalEvent.longitude,
          distance_meters: externalEvent.distanceMeters,
          elevation_gain_meters: externalEvent.elevationGainMeters,
          url: externalEvent.url,
        });
      }
    }

    if (!event) {
      throw new NotFoundException('Race event not found');
    }

    return this.mapRaceEventToDTO(event);
  }

  // ==========================================================================
  // Athlete Races
  // ==========================================================================

  async listAthleteRaces(req: Request & { user: AuthUser }): Promise<AthleteRaceDTO[]> {
    const races = await this.athleteRaceRepo.findManyByUserId(req.user.id);
    return races.map((r) => this.mapAthleteRaceToDTO(r));
  }

  async getAthleteRace(req: Request & { user: AuthUser }, raceId: string): Promise<AthleteRaceDTO> {
    const race = await this.athleteRaceRepo.findByIdWithEvent(raceId);
    if (!race || race.user_id !== req.user.id) {
      throw new NotFoundException('Race not found');
    }
    return this.mapAthleteRaceToDTO(race);
  }

  async createAthleteRace(req: Request & { user: AuthUser }, body: CreateAthleteRaceBody): Promise<AthleteRaceDTO> {
    const data: NewAthleteRace = {
      user_id: req.user.id,
      race_event_id: body.race_event_id || null,
      manual_name: body.manual_name || null,
      manual_date: body.manual_date ? new Date(body.manual_date) : null,
      manual_event_type: body.manual_event_type || null,
      manual_distance_meters: body.manual_distance_meters || null,
      goal_time_seconds: body.goal_time_seconds || null,
      priority: body.priority || null,
      notes: body.notes || null,
    };

    const race = await this.athleteRaceRepo.create(data);
    const raceWithEvent = await this.athleteRaceRepo.findByIdWithEvent(race.id);
    return this.mapAthleteRaceToDTO(raceWithEvent!);
  }

  async updateAthleteRace(
    req: Request & { user: AuthUser },
    raceId: string,
    body: UpdateAthleteRaceBody,
  ): Promise<AthleteRaceDTO> {
    const existing = await this.athleteRaceRepo.findById(raceId);
    if (!existing || existing.user_id !== req.user.id) {
      throw new NotFoundException('Race not found');
    }

    await this.athleteRaceRepo.updateById(raceId, {
      goal_time_seconds: body.goal_time_seconds,
      priority: body.priority,
      notes: body.notes,
    });

    const updated = await this.athleteRaceRepo.findByIdWithEvent(raceId);
    return this.mapAthleteRaceToDTO(updated!);
  }

  async deleteAthleteRace(req: Request & { user: AuthUser }, raceId: string): Promise<void> {
    const existing = await this.athleteRaceRepo.findById(raceId);
    if (!existing || existing.user_id !== req.user.id) {
      throw new NotFoundException('Race not found');
    }

    await this.athleteRaceRepo.deleteById(raceId);
  }

  // ==========================================================================
  // Periodization
  // ==========================================================================

  async getPeriodization(
    req: Request & { user: AuthUser },
    raceId: string,
    query: GeneratePeriodizationQuery,
  ): Promise<PeriodizationPlanDTO> {
    const race = await this.athleteRaceRepo.findByIdWithEvent(raceId);
    if (!race || race.user_id !== req.user.id) {
      throw new NotFoundException('Race not found');
    }

    let plan = await this.periodizationPlanRepo.findByAthleteRaceId(raceId);

    if (!plan && query.generate) {
      // Get race date
      const raceDate = race.race_event?.date || race.manual_date;
      if (!raceDate) {
        throw new NotFoundException('Race date is required for periodization');
      }

      // Generate periodization plan
      const phases = this.calculatePeriodization(
        new Date(raceDate),
        query.race_type || 'marathon',
        query.athlete_level || 'intermediate',
      );

      plan = await this.periodizationPlanRepo.create({
        athlete_race_id: raceId,
        status: 'suggested',
        phases,
        created_by: 'system',
      });
    }

    if (!plan) {
      throw new NotFoundException('Periodization plan not found');
    }

    return this.mapPeriodizationPlanToDTO(plan);
  }

  async updatePeriodization(
    req: Request & { user: AuthUser },
    raceId: string,
    body: UpdatePeriodizationBody,
  ): Promise<PeriodizationPlanDTO> {
    const race = await this.athleteRaceRepo.findById(raceId);
    if (!race || race.user_id !== req.user.id) {
      throw new NotFoundException('Race not found');
    }

    const existing = await this.periodizationPlanRepo.findByAthleteRaceId(raceId);
    if (!existing) {
      throw new NotFoundException('Periodization plan not found');
    }

    const updated = await this.periodizationPlanRepo.updateById(existing.id, {
      phases: body.phases as PeriodizationPhase[] | undefined,
      status: body.status,
    });

    return this.mapPeriodizationPlanToDTO(updated);
  }

  // ==========================================================================
  // Periodization Calculation
  // ==========================================================================

  private calculatePeriodization(raceDate: Date, _raceType: string, _athleteLevel: AthleteLevel): PeriodizationPhase[] {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const raceDateClean = new Date(raceDate);
    raceDateClean.setHours(0, 0, 0, 0);

    const totalDays = Math.ceil((raceDateClean.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    const totalWeeks = Math.max(4, Math.floor(totalDays / 7));

    // Determine phase distribution based on total weeks
    let taperWeeks: number;
    let peakWeeks: number;
    let buildWeeks: number;
    let baseWeeks: number;

    if (totalWeeks <= 8) {
      taperWeeks = 1;
      peakWeeks = 1;
      buildWeeks = Math.floor((totalWeeks - 2) / 2);
      baseWeeks = totalWeeks - taperWeeks - peakWeeks - buildWeeks;
    } else if (totalWeeks <= 12) {
      taperWeeks = 1;
      peakWeeks = 2;
      buildWeeks = Math.floor((totalWeeks - 3) / 2);
      baseWeeks = totalWeeks - taperWeeks - peakWeeks - buildWeeks;
    } else if (totalWeeks <= 16) {
      taperWeeks = 2;
      peakWeeks = 3;
      buildWeeks = Math.floor((totalWeeks - 5) * 0.4);
      baseWeeks = totalWeeks - taperWeeks - peakWeeks - buildWeeks;
    } else {
      taperWeeks = 2;
      peakWeeks = 4;
      buildWeeks = Math.floor((totalWeeks - 6) * 0.4);
      baseWeeks = totalWeeks - taperWeeks - peakWeeks - buildWeeks;
    }

    // Calculate dates
    const phases: PeriodizationPhase[] = [];
    let currentDate = new Date(today);

    // Base Phase
    if (baseWeeks > 0) {
      const endDate = new Date(currentDate);
      endDate.setDate(endDate.getDate() + baseWeeks * 7 - 1);
      phases.push({
        name: 'Base',
        start_date: this.formatDate(currentDate),
        end_date: this.formatDate(endDate),
        weeks: baseWeeks,
        focus: 'Aerobic foundation, easy miles, strength',
        description:
          'Build your aerobic base with easy, conversational-pace runs. Focus on consistency and gradually increasing volume.',
        volume_percentage: 80,
        intensity_percentage: 60,
      });
      currentDate = new Date(endDate);
      currentDate.setDate(currentDate.getDate() + 1);
    }

    // Build Phase
    if (buildWeeks > 0) {
      const endDate = new Date(currentDate);
      endDate.setDate(endDate.getDate() + buildWeeks * 7 - 1);
      phases.push({
        name: 'Build',
        start_date: this.formatDate(currentDate),
        end_date: this.formatDate(endDate),
        weeks: buildWeeks,
        focus: 'Tempo runs, threshold work, race-specific training',
        description:
          'Increase intensity with tempo runs and threshold workouts. Maintain volume while adding quality sessions.',
        volume_percentage: 90,
        intensity_percentage: 75,
      });
      currentDate = new Date(endDate);
      currentDate.setDate(currentDate.getDate() + 1);
    }

    // Peak Phase
    if (peakWeeks > 0) {
      const endDate = new Date(currentDate);
      endDate.setDate(endDate.getDate() + peakWeeks * 7 - 1);
      phases.push({
        name: 'Peak',
        start_date: this.formatDate(currentDate),
        end_date: this.formatDate(endDate),
        weeks: peakWeeks,
        focus: 'Race-pace intervals, sharpening, simulation',
        description: 'Peak fitness with race-specific intervals. Include race simulations and tune-up events.',
        volume_percentage: 100,
        intensity_percentage: 90,
      });
      currentDate = new Date(endDate);
      currentDate.setDate(currentDate.getDate() + 1);
    }

    // Taper Phase
    if (taperWeeks > 0) {
      const endDate = new Date(raceDateClean);
      endDate.setDate(endDate.getDate() - 1);
      phases.push({
        name: 'Taper',
        start_date: this.formatDate(currentDate),
        end_date: this.formatDate(endDate),
        weeks: taperWeeks,
        focus: 'Recovery, light speedwork, race preparation',
        description: 'Reduce volume while maintaining intensity. Focus on rest, nutrition, and mental preparation.',
        volume_percentage: 50,
        intensity_percentage: 70,
      });
    }

    return phases;
  }

  private formatDate(date: Date): string {
    return date.toISOString().split('T')[0];
  }

  // ==========================================================================
  // Mappers
  // ==========================================================================

  private mapRaceEventToDTO(event: {
    id: string;
    external_id: string | null;
    source: string;
    name: string;
    description: string | null;
    event_type: string;
    date: Date;
    location_city: string | null;
    location_country: string | null;
    latitude: number | null;
    longitude: number | null;
    distance_meters: number | null;
    elevation_gain_meters: number | null;
    url: string | null;
    cached_at: Date;
  }): RaceEventDTO {
    return {
      id: event.id,
      external_id: event.external_id,
      source: event.source as RaceEventDTO['source'],
      name: event.name,
      description: event.description,
      event_type: event.event_type as RaceEventDTO['event_type'],
      date: event.date.toISOString().split('T')[0],
      location_city: event.location_city,
      location_country: event.location_country,
      latitude: event.latitude,
      longitude: event.longitude,
      distance_meters: event.distance_meters,
      elevation_gain_meters: event.elevation_gain_meters,
      url: event.url,
      cached_at: event.cached_at.toISOString(),
    };
  }

  private mapAthleteRaceToDTO(race: AthleteRaceWithEvent): AthleteRaceDTO {
    return {
      id: race.id,
      user_id: race.user_id,
      race_event_id: race.race_event_id,
      race_event: race.race_event ? this.mapRaceEventToDTO(race.race_event) : null,
      manual_name: race.manual_name,
      manual_date: race.manual_date ? race.manual_date.toISOString().split('T')[0] : null,
      manual_event_type: race.manual_event_type,
      manual_distance_meters: race.manual_distance_meters,
      goal_time_seconds: race.goal_time_seconds,
      priority: race.priority,
      course_file_path: race.course_file_path,
      notes: race.notes,
      created_at: race.created_at.toISOString(),
      updated_at: race.updated_at.toISOString(),
    };
  }

  private mapPeriodizationPlanToDTO(plan: {
    id: string;
    athlete_race_id: string;
    status: string;
    phases: PeriodizationPhase[];
    created_by: string;
    created_at: Date;
    modified_at: Date;
  }): PeriodizationPlanDTO {
    return {
      id: plan.id,
      athlete_race_id: plan.athlete_race_id,
      status: plan.status as PeriodizationPlanDTO['status'],
      phases: plan.phases,
      created_by: plan.created_by as PeriodizationPlanDTO['created_by'],
      created_at: plan.created_at.toISOString(),
      modified_at: plan.modified_at.toISOString(),
    };
  }
}

import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Request } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { NewAthleteRace } from 'src/database/interfaces/athlete-races-table.interface';
import type { PeriodizationPhase } from 'src/database/interfaces/periodization-plans-table.interface';
import { FitnessMetricType, PredictionStatus, RacePrediction, RaceSport } from 'src/database/interfaces';
import { AuthUser } from 'src/modules/auth/types/authenticated-user';
import { S3Service } from 'src/modules/s3/s3.service';
import { AthleteRaceRepository, AthleteRaceWithEvent } from 'src/repositories/athlete-race.repository';
import { AthleteProfileMetricsRepository } from 'src/repositories/athlete-profile-metrics.repository';
import { FitnessMetricsRepository } from 'src/repositories/fitness-metrics.repository';
import { PeriodizationPlanRepository } from 'src/repositories/periodization-plan.repository';
import { RaceEventRepository } from 'src/repositories/race-event.repository';
import { RacePredictionRepository } from 'src/repositories/race-prediction.repository';
import { CourseAnalysisService, CourseBasedPredictionResult } from '../race-prediction/services/course-analysis.service';
import { CourseFileProcessorService } from '../race-prediction/services/course-file-processor.service';
import { RunningPredictionService } from '../race-prediction/services/running-prediction.service';

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
  UploadCourseBody,
} from './request.dto';
import {
  AthleteRaceDTO,
  CourseBasedPredictionDTO,
  CoursePredictionSummaryDTO,
  CourseUploadResponseDTO,
  PeriodizationPlanDTO,
  RaceEventDTO,
  RacePredictionSummaryDTO,
} from './response.dto';
import { AthleteLevel, CourseMetrics } from './types';

@Injectable()
export class RaceCalendarApiService {
  private readonly logger = new Logger(RaceCalendarApiService.name);

  constructor(
    private readonly raceEventRepo: RaceEventRepository,
    private readonly athleteRaceRepo: AthleteRaceRepository,
    private readonly periodizationPlanRepo: PeriodizationPlanRepository,
    private readonly racePredictionRepo: RacePredictionRepository,
    private readonly activeNetworkService: ActiveNetworkService,
    private readonly runSignUpService: RunSignUpService,
    private readonly worldTriathlonService: WorldTriathlonService,
    private readonly openTrackService: OpenTrackService,
    private readonly s3Service: S3Service,
    private readonly courseFileProcessorService: CourseFileProcessorService,
    private readonly courseAnalysisService: CourseAnalysisService,
    private readonly runningPredictionService: RunningPredictionService,
    private readonly athleteProfileMetricsRepo: AthleteProfileMetricsRepository,
    private readonly fitnessMetricsRepo: FitnessMetricsRepository,
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

    // Fetch predictions for all races
    const predictions = await this.racePredictionRepo.findMany({
      filter: {
        userId: req.user.id,
        status: PredictionStatus.CURRENT,
      },
    });

    // Create a map of race_id -> prediction
    const predictionMap = new Map<string, RacePrediction>();
    for (const prediction of predictions) {
      if (prediction.athlete_race_id) {
        predictionMap.set(prediction.athlete_race_id, prediction);
      }
    }

    return races.map((r) => this.mapAthleteRaceToDTO(r, predictionMap.get(r.id)));
  }

  async getAthleteRace(req: Request & { user: AuthUser }, raceId: string): Promise<AthleteRaceDTO> {
    const race = await this.athleteRaceRepo.findByIdWithEvent(raceId);
    if (!race || race.user_id !== req.user.id) {
      throw new NotFoundException('Race not found');
    }

    // Get current prediction for this race
    const prediction = await this.racePredictionRepo.findCurrentForRace(req.user.id, raceId);

    return this.mapAthleteRaceToDTO(race, prediction || undefined);
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
  // Course File Management
  // ==========================================================================

  async uploadCourseFile(
    req: Request & { user: AuthUser },
    raceId: string,
    file: Express.Multer.File,
    body: UploadCourseBody,
  ): Promise<CourseUploadResponseDTO> {
    const userId = req.user.id;

    // Get the race
    const race = await this.athleteRaceRepo.findByIdWithEvent(raceId);
    if (!race || race.user_id !== userId) {
      throw new NotFoundException('Race not found');
    }

    // Validate file
    if (!file || !file.buffer) {
      throw new BadRequestException('No file uploaded');
    }

    const ext = file.originalname.toLowerCase().slice(file.originalname.lastIndexOf('.'));
    if (ext !== '.gpx' && ext !== '.fit') {
      throw new BadRequestException('Invalid file type. Only GPX and FIT files are supported.');
    }

    const fileType = ext === '.fit' ? 'fit' : 'gpx';

    // Parse the course file
    const courseProfile = await this.courseFileProcessorService.parseCourseFile(
      file.buffer,
      fileType as 'gpx' | 'fit',
    );

    // Upload to S3
    const fileUuid = uuidv4();
    const s3Key = `courses/${userId}/${raceId}/${fileUuid}${ext}`;

    await this.s3Service.uploadFile({
      bucket: this.s3Service.contentBucket,
      key: s3Key,
      data: file.buffer,
      additionalParams: {
        ContentType: fileType === 'fit' ? 'application/octet-stream' : 'application/gpx+xml',
      },
    });

    // Delete old course file if exists
    if (race.course_file_path) {
      try {
        await this.s3Service.deleteObject({
          bucket: this.s3Service.contentBucket,
          key: race.course_file_path,
        });
      } catch (err) {
        this.logger.warn(`Failed to delete old course file: ${err}`);
      }
    }

    // Update athlete race with course file path
    await this.athleteRaceRepo.updateById(raceId, {
      course_file_path: s3Key,
    });

    // Calculate course metrics
    const maxElevation = Math.max(...courseProfile.points.map((p) => p.elevation));
    const minElevation = Math.min(...courseProfile.points.map((p) => p.elevation));

    // Calculate steepest grade
    let steepestGrade: number | null = null;
    for (let i = 1; i < courseProfile.points.length; i++) {
      const distDelta = courseProfile.points[i].distance - courseProfile.points[i - 1].distance;
      if (distDelta > 0) {
        const elevDelta = courseProfile.points[i].elevation - courseProfile.points[i - 1].elevation;
        const grade = Math.abs((elevDelta / distDelta) * 100);
        if (steepestGrade === null || grade > steepestGrade) {
          steepestGrade = grade;
        }
      }
    }

    const metrics: CourseMetrics = {
      total_distance_meters: Math.round(courseProfile.totalDistanceMeters),
      elevation_gain_meters: Math.round(courseProfile.totalElevationGain),
      elevation_loss_meters: Math.round(courseProfile.totalElevationLoss),
      max_elevation_meters: Math.round(maxElevation),
      min_elevation_meters: Math.round(minElevation),
      steepest_grade_percent: steepestGrade ? Math.round(steepestGrade * 100) / 100 : null,
      num_points: courseProfile.points.length,
    };

    const response: CourseUploadResponseDTO = {
      file_path: s3Key,
      file_type: fileType,
      metrics,
    };

    // Generate prediction if requested
    if (body.generate_prediction !== false) {
      const prediction = await this.generateAndStoreCoursePrediction(
        userId,
        raceId,
        race,
        courseProfile,
        body.segment_distance_meters || 1000,
      );
      response.prediction = prediction;
    }

    return response;
  }

  async getCoursePrediction(
    req: Request & { user: AuthUser },
    raceId: string,
  ): Promise<CourseBasedPredictionDTO> {
    const userId = req.user.id;

    // Get the race
    const race = await this.athleteRaceRepo.findByIdWithEvent(raceId);
    if (!race || race.user_id !== userId) {
      throw new NotFoundException('Race not found');
    }

    if (!race.course_file_path) {
      throw new NotFoundException('No course file uploaded for this race');
    }

    // Get the current prediction
    const prediction = await this.racePredictionRepo.findCurrentForRace(userId, raceId);
    if (!prediction || !prediction.metadata?.course_prediction) {
      throw new NotFoundException('No course prediction found. Please re-upload the course file.');
    }

    const coursePrediction = prediction.metadata.course_prediction as CourseBasedPredictionResult;

    return this.formatCoursePredictionDTO(prediction, coursePrediction);
  }

  async deleteCourseFile(req: Request & { user: AuthUser }, raceId: string): Promise<void> {
    const userId = req.user.id;

    // Get the race
    const race = await this.athleteRaceRepo.findById(raceId);
    if (!race || race.user_id !== userId) {
      throw new NotFoundException('Race not found');
    }

    if (!race.course_file_path) {
      throw new NotFoundException('No course file to delete');
    }

    // Delete from S3
    try {
      await this.s3Service.deleteObject({
        bucket: this.s3Service.contentBucket,
        key: race.course_file_path,
      });
    } catch (err) {
      this.logger.warn(`Failed to delete course file from S3: ${err}`);
    }

    // Supersede course-based prediction
    await this.racePredictionRepo.supersedePreviousPredictions(userId, raceId);

    // Update race to remove course file path
    await this.athleteRaceRepo.updateById(raceId, {
      course_file_path: null,
    });
  }

  private async generateAndStoreCoursePrediction(
    userId: string,
    raceId: string,
    race: AthleteRaceWithEvent,
    courseProfile: { points: { distance: number; elevation: number }[]; totalDistanceMeters: number; totalElevationGain: number; totalElevationLoss: number },
    segmentDistanceMeters: number,
  ): Promise<CourseBasedPredictionDTO> {
    // Get athlete profile and fitness data for base prediction
    const profile = await this.athleteProfileMetricsRepo.findByUserId(userId);
    const vo2maxMetric = await this.fitnessMetricsRepo.getLatestByType(userId, FitnessMetricType.VO2_MAX);
    const vo2max = vo2maxMetric ? Number.parseFloat(vo2maxMetric.value) : undefined;
    const vo2maxConfidence = vo2maxMetric ? Number.parseFloat(vo2maxMetric.confidence || '0.5') : undefined;

    const distanceMeters = courseProfile.totalDistanceMeters;

    // Generate flat terrain base prediction
    const basePrediction = await this.runningPredictionService.predictRaceTime(userId, {
      targetDistanceMeters: distanceMeters,
      vo2max,
      vo2maxConfidence,
      yearsTraining: profile?.years_training || undefined,
    });

    // Calculate course-based prediction with Minetti model
    const coursePrediction = this.courseAnalysisService.calculateCourseBasedPrediction(
      basePrediction.predictedTimeSeconds,
      courseProfile,
      {
        segmentDistanceMeters,
        applyFadeFactor: distanceMeters > 10000,
        smoothingWindowMeters: 100,
      },
    );

    // Supersede previous predictions
    await this.racePredictionRepo.supersedePreviousPredictions(userId, raceId);

    // Store prediction in race_predictions table
    const raceDate = race.race_event?.date || race.manual_date;
    const sport = (race.race_event?.event_type || race.manual_event_type || 'run') as RaceSport;

    const stored = await this.racePredictionRepo.create({
      user_id: userId,
      athlete_race_id: raceId,
      sport,
      distance_meters: Math.round(distanceMeters),
      race_date: raceDate ? new Date(raceDate).toISOString().split('T')[0] : null,
      predicted_time_seconds: Math.round(coursePrediction.predictedTimeSeconds),
      confidence_lower_seconds: Math.round(basePrediction.confidenceLowerSeconds * (coursePrediction.predictedTimeSeconds / basePrediction.predictedTimeSeconds)),
      confidence_upper_seconds: Math.round(basePrediction.confidenceUpperSeconds * (coursePrediction.predictedTimeSeconds / basePrediction.predictedTimeSeconds)),
      confidence_score: basePrediction.confidenceScore,
      target_pace_per_km: basePrediction.targetPacePerKm,
      target_power_watts: null,
      segment_targets: null, // Temporarily disabled - race plan generator creates own segments
      risk_score: null,
      risk_factors: null,
      goal_time_seconds: race.goal_time_seconds,
      goal_achievability: null,
      status: PredictionStatus.CURRENT,
      metadata: {
        algorithms_used: ['minetti_grade_model', ...basePrediction.methods.map((m) => m.name)],
        input_metrics: {
          vo2max,
          vo2max_confidence: vo2maxConfidence,
        },
        course_prediction: coursePrediction,
        generated_by: 'course_upload',
      },
    });

    return this.formatCoursePredictionDTO(stored, coursePrediction);
  }

  private formatCoursePredictionDTO(
    prediction: RacePrediction,
    coursePrediction: CourseBasedPredictionResult,
  ): CourseBasedPredictionDTO {
    return {
      predicted_time_seconds: coursePrediction.predictedTimeSeconds,
      predicted_time_formatted: this.formatTimeToString(coursePrediction.predictedTimeSeconds),
      flat_equivalent_time_seconds: coursePrediction.flatEquivalentTimeSeconds,
      confidence_score: Number.parseFloat(prediction.confidence_score),
      segments: coursePrediction.segments.map((seg) => ({
        segment_number: seg.segmentNumber,
        start_distance_meters: seg.startDistanceMeters,
        end_distance_meters: seg.endDistanceMeters,
        average_grade_percent: seg.averageGradePercent,
        elevation_gain: seg.elevationGain,
        elevation_loss: seg.elevationLoss,
        adjusted_pace_seconds_per_km: seg.adjustedPaceSecondsPerKm,
        segment_time_seconds: seg.segmentTimeSeconds,
        cumulative_time_seconds: seg.cumulativeTimeSeconds,
      })),
      elevation_profile: coursePrediction.elevationProfile.map((p) => ({
        distance: p.distance,
        elevation: p.elevation,
        pace: p.pace,
      })),
      summary: {
        total_elevation_gain: coursePrediction.summary.totalElevationGain,
        total_elevation_loss: coursePrediction.summary.totalElevationLoss,
        steepest_climb_percent: coursePrediction.summary.steepestClimbPercent,
        steepest_descent_percent: coursePrediction.summary.steepestDescentPercent,
        average_grade_percent: coursePrediction.summary.averageGradePercent,
      },
    };
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

  private mapAthleteRaceToDTO(race: AthleteRaceWithEvent, prediction?: RacePrediction): AthleteRaceDTO {
    const dto: AthleteRaceDTO = {
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

    if (prediction) {
      dto.prediction = this.mapPredictionSummaryDTO(prediction);
    }

    return dto;
  }

  private mapPredictionSummaryDTO(prediction: RacePrediction): RacePredictionSummaryDTO {
    return {
      predicted_time_seconds: prediction.predicted_time_seconds,
      predicted_time_formatted: this.formatTimeToString(prediction.predicted_time_seconds),
      confidence_score: Number.parseFloat(prediction.confidence_score),
      target_pace_per_km: prediction.target_pace_per_km
        ? Number.parseFloat(prediction.target_pace_per_km)
        : undefined,
      goal_achievability: prediction.goal_achievability || undefined,
    };
  }

  private formatTimeToString(totalSeconds: number): string {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
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

import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  CourseSegment,
  NewRacePlan,
  PacingStrategy as PacingStrategyType,
  RacePlan,
  RacePlanStatus,
} from 'src/database/interfaces';
import { AthleteRaceRepository } from 'src/repositories/athlete-race.repository';
import { RaceEventRepository } from 'src/repositories/race-event.repository';
import { RacePlanRepository } from 'src/repositories/race-plan.repository';
import { RacePredictionRepository } from 'src/repositories/race-prediction.repository';
import { FitnessMetricsRepository } from 'src/repositories/fitness-metrics.repository';
import { AthleteProfileMetricsRepository } from 'src/repositories/athlete-profile-metrics.repository';
import { WeatherForecastService } from './weather-forecast.service';
import { WeatherAdjustmentService } from './weather-adjustment.service';
import { PacingStrategyService } from './pacing-strategy.service';
import { CourseAnalysisService } from './course-analysis.service';
import { NutritionPlanService } from './nutrition-plan.service';
import { CaffeineTolerance, GiSensitivity, CarbSource } from 'src/database/interfaces/athlete-profile-metrics-table.interface';

interface GenerateRacePlanOptions {
  pacingStrategy?: PacingStrategyType;
  forceRefresh?: boolean;
  createdBy?: 'athlete' | 'coach' | 'system';
  creatorId?: string;
}

@Injectable()
export class RacePlanGeneratorService {
  private readonly logger = new Logger(RacePlanGeneratorService.name);

  constructor(
    private readonly racePlanRepository: RacePlanRepository,
    private readonly athleteRaceRepository: AthleteRaceRepository,
    private readonly raceEventRepository: RaceEventRepository,
    private readonly racePredictionRepository: RacePredictionRepository,
    private readonly fitnessMetricsRepository: FitnessMetricsRepository,
    private readonly athleteProfileMetricsRepository: AthleteProfileMetricsRepository,
    private readonly weatherForecastService: WeatherForecastService,
    private readonly weatherAdjustmentService: WeatherAdjustmentService,
    private readonly pacingStrategyService: PacingStrategyService,
    private readonly courseAnalysisService: CourseAnalysisService,
    private readonly nutritionPlanService: NutritionPlanService,
  ) {}

  /**
   * Generate comprehensive race execution plan
   */
  async generateRacePlan(
    userId: string,
    athleteRaceId: string,
    options: GenerateRacePlanOptions = {},
  ): Promise<RacePlan> {
    this.logger.log(`Generating race plan for user ${userId}, race ${athleteRaceId}`);

    // 1. Load race details
    const athleteRace = await this.athleteRaceRepository.findById(athleteRaceId);
    if (!athleteRace || athleteRace.user_id !== userId) {
      throw new NotFoundException('Race not found');
    }

    // 2. Get existing prediction
    const prediction = await this.racePredictionRepository.findCurrentForRace(userId, athleteRaceId);
    if (!prediction) {
      throw new NotFoundException('No prediction found for this race. Generate a prediction first.');
    }

    const distanceMeters = prediction.distance_meters;
    const predictedTimeSeconds = prediction.predicted_time_seconds;
    const targetTimeSeconds = prediction.goal_time_seconds || null;

    // 3. Get course-based segments or create flat segments
    let segments: CourseSegment[] = [];
    let courseBased = false;

    if (athleteRace.course_file_path && prediction.segment_targets) {
      // Use course-based segments from prediction
      segments = this.convertSegmentTargetsToSegments(prediction.segment_targets);
      courseBased = true;
    } else {
      // Create flat course segments (1km each)
      segments = this.createFlatCourseSegments(distanceMeters, predictedTimeSeconds);
    }

    // 4. Fetch/refresh weather forecast (if location available)
    let weatherForecast = null;
    if (athleteRace.race_event_id) {
      // Try to get location from race event
      const raceEvent = await this.raceEventRepository.findById(athleteRace.race_event_id);
      if (raceEvent && raceEvent.latitude && raceEvent.longitude && athleteRace.manual_date) {
        weatherForecast = await this.weatherForecastService.getOrRefreshForecast(
          athleteRaceId,
          new Date(athleteRace.manual_date),
          parseFloat(raceEvent.latitude.toString()),
          parseFloat(raceEvent.longitude.toString()),
          undefined,
          options.forceRefresh,
        );
      }
    }

    // 5. Apply weather adjustments to segment paces
    let weatherAdjustments = null;
    if (weatherForecast) {
      const temp = parseFloat(weatherForecast.race_hour_temperature_celsius || '15');
      const humidity = weatherForecast.race_hour_humidity_percent || 50;
      const windSpeed = parseFloat(weatherForecast.race_hour_wind_speed_kmh || '0');

      weatherAdjustments = this.weatherAdjustmentService.calculateWeatherImpact(
        predictedTimeSeconds,
        distanceMeters,
        temp,
        humidity,
        windSpeed,
      );

      // Apply weather adjustment to segments
      const adjustmentFactor = 1 + weatherAdjustments.total_impact_percent / 100;
      segments = segments.map((seg) => ({
        ...seg,
        adjusted_pace_seconds_per_km: seg.adjusted_pace_seconds_per_km * adjustmentFactor,
      }));
    }

    // 6. Apply selected pacing strategy
    const strategy = options.pacingStrategy || 'even';
    const { segments: strategyAdjustedSegments, negativeSplitRatio } =
      this.pacingStrategyService.applyPacingStrategy(segments, strategy);

    // 7. Calculate effort zones per segment
    const lthrMetric = await this.fitnessMetricsRepository.getLatestByType(userId, 'lthr');
    const lthrBpm = lthrMetric ? parseFloat(lthrMetric.value) : undefined;
    const effortZones = this.pacingStrategyService.calculateEffortZones(strategyAdjustedSegments, lthrBpm);

    // 8. Generate energy management plan using personalized nutrition service
    const athleteProfile = await this.athleteProfileMetricsRepository.findByUserId(userId);
    const athleteWeightKg = athleteProfile?.weight_kg ? parseFloat(athleteProfile.weight_kg.toString()) : 70;
    const temperature = weatherForecast
      ? parseFloat(weatherForecast.race_hour_temperature_celsius || '15')
      : 15;
    const humidity = weatherForecast?.race_hour_humidity_percent || 50;

    const energyPlan = this.nutritionPlanService.generateNutritionPlan(
      distanceMeters,
      strategyAdjustedSegments[strategyAdjustedSegments.length - 1].cumulative_time_seconds,
      athleteWeightKg,
      temperature,
      humidity,
      weatherAdjustments?.hydration_multiplier || 1.0,
      {
        sweatRateMlPerHour: athleteProfile?.sweat_rate_ml_per_hour
          ? parseFloat(athleteProfile.sweat_rate_ml_per_hour.toString())
          : undefined,
        giSensitivity: (athleteProfile?.gi_sensitivity as GiSensitivity) || 'moderate',
        preferredCarbSources: (athleteProfile?.preferred_carb_sources as CarbSource[]) || [],
        caffeineTolerance: (athleteProfile?.caffeine_tolerance as CaffeineTolerance) || 'moderate',
      },
    );

    // 9. Build fatigue model
    const fatigueModel = this.pacingStrategyService.generateFatigueModel(distanceMeters, prediction.sport);

    // 10. Generate race day advice
    const warmupProtocol = this.generateWarmupProtocol(distanceMeters);
    const raceDayChecklist = this.generateRaceDayChecklist();
    const keyAdvice = this.generateKeyAdvice(distanceMeters, weatherAdjustments, strategy);

    // 11. Supersede previous plans
    await this.racePlanRepository.supersedePrevious(userId, athleteRaceId);

    // 12. Get next version number
    const planVersion = await this.racePlanRepository.getNextVersionNumber(userId, athleteRaceId);

    // 13. Store new plan
    const newPlan: NewRacePlan = {
      user_id: userId,
      athlete_race_id: athleteRaceId,
      race_prediction_id: prediction.id,
      predicted_finish_time_seconds: strategyAdjustedSegments[strategyAdjustedSegments.length - 1]
        .cumulative_time_seconds,
      target_finish_time_seconds: targetTimeSeconds,
      pacing_strategy: strategy,
      negative_split_ratio: negativeSplitRatio?.toString() || null,
      segment_splits: strategyAdjustedSegments,
      effort_zones: effortZones,
      energy_management: energyPlan,
      fatigue_model: fatigueModel,
      forecast_temperature_celsius: weatherForecast?.race_hour_temperature_celsius || null,
      forecast_humidity_percent: weatherForecast?.race_hour_humidity_percent || null,
      forecast_wind_speed_kmh: weatherForecast?.race_hour_wind_speed_kmh || null,
      weather_adjustments: weatherAdjustments,
      warmup_protocol: warmupProtocol,
      race_day_checklist: raceDayChecklist,
      key_advice: keyAdvice,
      status: RacePlanStatus.ACTIVE,
      plan_version: planVersion,
      metadata: {
        created_by: options.createdBy || 'athlete',
        creator_id: options.creatorId,
        weather_last_updated: weatherForecast?.forecast_date.toISOString(),
        course_based: courseBased,
        prediction_algorithm: prediction.metadata?.algorithms_used?.[0],
      },
    };

    return this.racePlanRepository.create(newPlan);
  }

  /**
   * Convert segment targets from prediction to full course segments
   */
  private convertSegmentTargetsToSegments(segmentTargets: any[]): CourseSegment[] {
    return segmentTargets.map((target, index) => ({
      segment_number: index + 1,
      start_distance_meters: index === 0 ? 0 : segmentTargets[index - 1].distance_meters,
      end_distance_meters: target.distance_meters,
      distance_meters: target.distance_meters - (index === 0 ? 0 : segmentTargets[index - 1].distance_meters),
      elevation_start_meters: 0,
      elevation_end_meters: 0,
      elevation_gain_meters: 0,
      elevation_loss_meters: 0,
      average_grade_percent: 0,
      base_pace_seconds_per_km: target.target_pace_per_km,
      adjusted_pace_seconds_per_km: target.target_pace_per_km,
      segment_time_seconds: target.target_time_seconds,
      cumulative_time_seconds: target.cumulative_time_seconds,
    }));
  }

  /**
   * Create flat course segments (1km each)
   */
  private createFlatCourseSegments(distanceMeters: number, predictedTimeSeconds: number): CourseSegment[] {
    const distanceKm = distanceMeters / 1000;
    const avgPaceSecondsPerKm = predictedTimeSeconds / distanceKm;
    const numSegments = Math.ceil(distanceKm);

    const segments: CourseSegment[] = [];
    for (let i = 0; i < numSegments; i++) {
      const startKm = i;
      const endKm = Math.min(i + 1, distanceKm);
      const segmentDistanceMeters = (endKm - startKm) * 1000;
      const segmentTime = avgPaceSecondsPerKm * (endKm - startKm);

      segments.push({
        segment_number: i + 1,
        start_distance_meters: startKm * 1000,
        end_distance_meters: endKm * 1000,
        distance_meters: segmentDistanceMeters,
        elevation_start_meters: 0,
        elevation_end_meters: 0,
        elevation_gain_meters: 0,
        elevation_loss_meters: 0,
        average_grade_percent: 0,
        base_pace_seconds_per_km: avgPaceSecondsPerKm,
        adjusted_pace_seconds_per_km: avgPaceSecondsPerKm,
        segment_time_seconds: segmentTime,
        cumulative_time_seconds: (i + 1) * segmentTime,
      });
    }

    return segments;
  }

  /**
   * Generate warmup protocol
   */
  private generateWarmupProtocol(distanceMeters: number): string {
    const distanceKm = distanceMeters / 1000;

    if (distanceKm >= 21) {
      return '60 minutes before start: Light 10-minute jog, dynamic stretches (leg swings, lunges), 3-4 strides building to race pace. Use bathroom 20 minutes before start.';
    } else if (distanceKm >= 10) {
      return '45 minutes before start: 15-minute easy jog, dynamic stretches, 4-5 strides building to race pace. Use bathroom 15 minutes before start.';
    } else {
      return '30 minutes before start: 20-minute warmup jog, dynamic stretches, 5-6 strides at race pace. Use bathroom 10 minutes before start.';
    }
  }

  /**
   * Generate race day checklist
   */
  private generateRaceDayChecklist(): string[] {
    return [
      'Lay out race outfit and bib the night before',
      'Set multiple alarms (phone + backup)',
      'Eat breakfast 3 hours before race start',
      'Arrive at venue 60-90 minutes early',
      'Use porta-potty before warmup',
      'Complete warmup protocol 30-45 min before start',
      'Get to correct starting corral 10 minutes before gun',
      'Start watch/GPS when you cross start line',
    ];
  }

  /**
   * Generate key race advice
   */
  private generateKeyAdvice(
    distanceMeters: number,
    weatherAdjustments: any,
    strategy: PacingStrategyType,
  ): string[] {
    const advice: string[] = [];

    // Start conservatively
    advice.push('First mile should feel ridiculously easy - you will thank yourself later');

    // Even effort vs pace
    advice.push('Focus on even effort, not even pace - especially on hills');

    // Early nutrition
    if (distanceMeters >= 15000) {
      advice.push('Start taking nutrition early (30 min in), do not wait until you feel hungry');
    }

    // Weather-specific
    if (weatherAdjustments?.heat_stress_level === 'high' || weatherAdjustments?.heat_stress_level === 'extreme') {
      advice.push('Adjust expectations for heat - prioritize finishing healthy over goal time');
    }

    // Strategy-specific
    if (strategy === 'negative_split') {
      advice.push('Resist urge to go out fast - second half is where you make up time');
    }

    // Mental toughness
    advice.push('When it gets hard, remember why you trained - you are ready for this');

    return advice;
  }
}

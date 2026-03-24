import { Injectable, NotFoundException } from '@nestjs/common';
import { Request } from 'express';
import {
  FitnessMetricType,
  GoalAchievability,
  PredictionStatus,
  RaceSport,
  SegmentTarget,
} from 'src/database/interfaces';
import { AuthUser } from 'src/modules/auth/types/authenticated-user';
import { AthleteProfileMetricsRepository } from 'src/repositories/athlete-profile-metrics.repository';
import { AthleteRaceRepository } from 'src/repositories/athlete-race.repository';
import { FitnessMetricsRepository } from 'src/repositories/fitness-metrics.repository';
import { HistoricalRaceResultsRepository } from 'src/repositories/historical-race-results.repository';
import { PersonalRecordRepository } from 'src/repositories/personal-record.repository';
import { RacePredictionRepository } from 'src/repositories/race-prediction.repository';

import {
  CourseBasedPredictionBody,
  GeneratePredictionBody,
  PredictionHistoryQuery,
  QuickPredictionBody,
  RecordRaceResultBody,
  TaperPlanQuery,
  UpdateProfileMetricsBody,
} from './request.dto';
import {
  AthleteProfileMetricsDTO,
  CourseBasedPredictionDTO,
  CourseSegmentDTO,
  HistoricalRaceResultDTO,
  PredictionAccuracyStatsDTO,
  RacePredictionDTO,
  TaperPlanDTO,
} from './response.dto';
import { CourseAnalysisService } from './services/course-analysis.service';
import { CourseFileProcessorService } from './services/course-file-processor.service';
import { CyclingPredictionResult, CyclingPredictionService } from './services/cycling-prediction.service';
import { RunningPredictionResult, RunningPredictionService } from './services/running-prediction.service';
import { TaperOptimizationService } from './services/taper-optimization.service';

type PredictionResult = RunningPredictionResult | CyclingPredictionResult;

function isRunningPrediction(result: PredictionResult): result is RunningPredictionResult {
  return 'methods' in result;
}

@Injectable()
export class RacePredictionApiService {
  constructor(
    private readonly racePredictionRepository: RacePredictionRepository,
    private readonly athleteProfileMetricsRepository: AthleteProfileMetricsRepository,
    private readonly historicalRaceResultsRepository: HistoricalRaceResultsRepository,
    private readonly athleteRaceRepository: AthleteRaceRepository,
    private readonly fitnessMetricsRepository: FitnessMetricsRepository,
    private readonly personalRecordRepository: PersonalRecordRepository,
    private readonly runningPredictionService: RunningPredictionService,
    private readonly cyclingPredictionService: CyclingPredictionService,
    private readonly taperOptimizationService: TaperOptimizationService,
    private readonly courseAnalysisService: CourseAnalysisService,
    private readonly courseFileProcessorService: CourseFileProcessorService,
  ) {}

  /**
   * Generate prediction for a registered race
   */
  async generatePrediction(
    req: Request & { user: AuthUser },
    raceId: string,
    body: GeneratePredictionBody,
  ): Promise<RacePredictionDTO> {
    const userId = req.user.id;

    // Get the athlete race
    const athleteRace = await this.athleteRaceRepository.findById(raceId);
    if (!athleteRace || athleteRace.user_id !== userId) {
      throw new NotFoundException('Race not found');
    }

    // Determine sport and distance
    const sport = (body.sport as RaceSport) || athleteRace.manual_event_type || RaceSport.RUN;
    const distanceMeters = body.distance_meters || athleteRace.manual_distance_meters || 10000;
    const raceDate = athleteRace.manual_date
      ? new Date(athleteRace.manual_date).toISOString().split('T')[0]
      : null;

    // Get athlete profile for demographics
    const profile = await this.athleteProfileMetricsRepository.findByUserId(userId);

    // Get fitness metrics
    const vo2maxMetric = await this.fitnessMetricsRepository.getLatestByType(userId, FitnessMetricType.VO2_MAX);
    const vo2max = vo2maxMetric ? Number.parseFloat(vo2maxMetric.value) : undefined;
    const vo2maxConfidence = vo2maxMetric ? Number.parseFloat(vo2maxMetric.confidence || '0.5') : undefined;

    // Generate prediction based on sport
    let prediction;
    if (sport === RaceSport.BIKE) {
      prediction = await this.cyclingPredictionService.predictCyclingTime(userId, {
        targetDistanceMeters: distanceMeters,
        weight: profile?.weight_kg ? Number.parseFloat(profile.weight_kg) : undefined,
        averageGradePercent: body.elevation_gain_meters
          ? (body.elevation_gain_meters / distanceMeters) * 100
          : undefined,
      });
    } else {
      // Running prediction (default)
      prediction = await this.runningPredictionService.predictRaceTime(userId, {
        targetDistanceMeters: distanceMeters,
        vo2max,
        vo2maxConfidence,
        yearsTraining: profile?.years_training || undefined,
      });
    }

    // Apply elevation adjustments if provided
    let elevationAdjustment = 0;
    if (body.elevation_gain_meters || body.elevation_loss_meters) {
      const elevationProfile = {
        totalElevationGain: body.elevation_gain_meters || 0,
        totalElevationLoss: body.elevation_loss_meters || 0,
        distanceMeters,
      };

      if (sport === RaceSport.RUN) {
        const adjustment = this.courseAnalysisService.calculateRunningElevationAdjustment(
          prediction.predictedTimeSeconds,
          distanceMeters,
          elevationProfile,
        );
        elevationAdjustment = adjustment.elevationTimeAdjustmentSeconds;
      }
    }

    // Apply taper adjustment if race date is in the future
    let taperFactor = 1.0;
    if (raceDate) {
      const taperAssessment = await this.taperOptimizationService.projectTsbForDate(userId, new Date(raceDate));
      const assessment = this.taperOptimizationService.calculateFormAdjustment(taperAssessment);
      taperFactor = assessment.timeFactor;
    }

    // Calculate final prediction
    const adjustedTime = Math.round(
      (prediction.predictedTimeSeconds + elevationAdjustment) * taperFactor,
    );
    const adjustedLower = Math.round(prediction.confidenceLowerSeconds * taperFactor);
    const adjustedUpper = Math.round(prediction.confidenceUpperSeconds * taperFactor);

    // Generate segment targets
    const segmentTargets = this.generateSegmentTargets(distanceMeters, adjustedTime, sport);

    // Calculate goal achievability if goal is set
    let goalAchievability: string | null = null;
    if (athleteRace.goal_time_seconds) {
      goalAchievability = this.calculateGoalAchievability(
        athleteRace.goal_time_seconds,
        adjustedTime,
        adjustedLower,
        adjustedUpper,
      );
    }

    // Risk assessment
    const { riskScore, riskFactors } = this.assessRisk(
      prediction.confidenceScore,
      taperFactor,
      body.elevation_gain_meters || 0,
      distanceMeters,
    );

    // Supersede previous predictions for this race
    await this.racePredictionRepository.supersedePreviousPredictions(userId, raceId);

    // Store prediction
    const algorithmsUsed = isRunningPrediction(prediction)
      ? prediction.methods.map((m) => m.name)
      : ['ftp_power_model'];
    const targetPacePerKm = isRunningPrediction(prediction) ? prediction.targetPacePerKm : null;
    const targetPowerWatts = !isRunningPrediction(prediction) ? prediction.targetPowerWatts : null;

    const stored = await this.racePredictionRepository.create({
      user_id: userId,
      athlete_race_id: raceId,
      sport,
      distance_meters: distanceMeters,
      race_date: raceDate,
      predicted_time_seconds: adjustedTime,
      confidence_lower_seconds: adjustedLower,
      confidence_upper_seconds: adjustedUpper,
      confidence_score: prediction.confidenceScore,
      target_pace_per_km: targetPacePerKm,
      target_power_watts: targetPowerWatts,
      segment_targets: segmentTargets,
      risk_score: riskScore,
      risk_factors: riskFactors,
      goal_time_seconds: athleteRace.goal_time_seconds,
      goal_achievability: goalAchievability,
      status: PredictionStatus.CURRENT,
      metadata: {
        algorithms_used: algorithmsUsed,
        input_metrics: {
          vo2max,
          vo2max_confidence: vo2maxConfidence,
        },
        adjustments: {
          taper_factor: taperFactor,
          elevation_factor: elevationAdjustment > 0 ? 1 + elevationAdjustment / prediction.predictedTimeSeconds : 1,
        },
      },
    });

    return this.formatPredictionDTO(stored, algorithmsUsed);
  }

  /**
   * Get existing prediction for a race
   */
  async getPrediction(req: Request & { user: AuthUser }, raceId: string): Promise<RacePredictionDTO> {
    const userId = req.user.id;

    const prediction = await this.racePredictionRepository.findCurrentForRace(userId, raceId);
    if (!prediction) {
      throw new NotFoundException('Prediction not found for this race');
    }

    return this.formatPredictionDTO(prediction, prediction.metadata?.algorithms_used || []);
  }

  /**
   * Quick prediction without a registered race
   */
  async quickPrediction(
    req: Request & { user: AuthUser },
    body: QuickPredictionBody,
  ): Promise<RacePredictionDTO> {
    const userId = req.user.id;

    // Get athlete profile
    const profile = await this.athleteProfileMetricsRepository.findByUserId(userId);

    // Get fitness metrics
    const vo2maxMetric = await this.fitnessMetricsRepository.getLatestByType(userId, FitnessMetricType.VO2_MAX);
    const vo2max = vo2maxMetric ? Number.parseFloat(vo2maxMetric.value) : undefined;
    const vo2maxConfidence = vo2maxMetric ? Number.parseFloat(vo2maxMetric.confidence || '0.5') : undefined;

    const sport = body.sport as RaceSport;

    // Generate prediction
    let prediction;
    if (sport === RaceSport.BIKE) {
      prediction = await this.cyclingPredictionService.predictCyclingTime(userId, {
        targetDistanceMeters: body.distance_meters,
        weight: profile?.weight_kg ? Number.parseFloat(profile.weight_kg) : undefined,
        averageGradePercent: body.elevation_gain_meters
          ? (body.elevation_gain_meters / body.distance_meters) * 100
          : undefined,
      });
    } else {
      prediction = await this.runningPredictionService.predictRaceTime(userId, {
        targetDistanceMeters: body.distance_meters,
        vo2max,
        vo2maxConfidence,
        yearsTraining: profile?.years_training || undefined,
      });
    }

    // Apply taper adjustment if race date provided
    let taperFactor = 1.0;
    if (body.race_date) {
      const projectedTsb = await this.taperOptimizationService.projectTsbForDate(userId, new Date(body.race_date));
      const assessment = this.taperOptimizationService.calculateFormAdjustment(projectedTsb);
      taperFactor = assessment.timeFactor;
    }

    const adjustedTime = Math.round(prediction.predictedTimeSeconds * taperFactor);

    // Store as quick prediction (no athlete_race_id)
    const algorithmsUsed = isRunningPrediction(prediction)
      ? prediction.methods.map((m) => m.name)
      : ['ftp_power_model'];
    const targetPacePerKm = isRunningPrediction(prediction) ? prediction.targetPacePerKm : null;
    const targetPowerWatts = !isRunningPrediction(prediction) ? prediction.targetPowerWatts : null;

    const stored = await this.racePredictionRepository.create({
      user_id: userId,
      athlete_race_id: null,
      sport,
      distance_meters: body.distance_meters,
      race_date: body.race_date || null,
      predicted_time_seconds: adjustedTime,
      confidence_lower_seconds: Math.round(prediction.confidenceLowerSeconds * taperFactor),
      confidence_upper_seconds: Math.round(prediction.confidenceUpperSeconds * taperFactor),
      confidence_score: prediction.confidenceScore,
      target_pace_per_km: targetPacePerKm,
      target_power_watts: targetPowerWatts,
      segment_targets: null,
      risk_score: null,
      risk_factors: null,
      goal_time_seconds: null,
      goal_achievability: null,
      status: PredictionStatus.CURRENT,
      metadata: {
        algorithms_used: algorithmsUsed,
        input_metrics: { vo2max, vo2max_confidence: vo2maxConfidence },
        adjustments: { taper_factor: taperFactor },
      },
    });

    return this.formatPredictionDTO(stored, algorithmsUsed);
  }

  /**
   * Course-based prediction using uploaded GPX/FIT file
   */
  async courseBasedPrediction(
    req: Request & { user: AuthUser },
    file: Express.Multer.File,
    body: CourseBasedPredictionBody,
  ): Promise<CourseBasedPredictionDTO> {
    const userId = req.user.id;

    // Determine file format from extension
    const ext = file.originalname.toLowerCase().slice(file.originalname.lastIndexOf('.'));
    const format = ext === '.fit' ? 'fit' : 'gpx';

    // Parse the course file
    const courseProfile = await this.courseFileProcessorService.parseCourseFile(
      file.buffer,
      format as 'gpx' | 'fit',
    );

    // Use provided distance or file distance
    const distanceMeters = body.distance_meters || courseProfile.totalDistanceMeters;

    // Get athlete profile and fitness data for base prediction
    const profile = await this.athleteProfileMetricsRepository.findByUserId(userId);
    const vo2maxMetric = await this.fitnessMetricsRepository.getLatestByType(
      userId,
      FitnessMetricType.VO2_MAX,
    );
    const vo2max = vo2maxMetric ? Number.parseFloat(vo2maxMetric.value) : undefined;
    const vo2maxConfidence = vo2maxMetric
      ? Number.parseFloat(vo2maxMetric.confidence || '0.5')
      : undefined;

    // Generate flat terrain base prediction
    const basePrediction = await this.runningPredictionService.predictRaceTime(userId, {
      targetDistanceMeters: distanceMeters,
      vo2max,
      vo2maxConfidence,
      yearsTraining: profile?.years_training || undefined,
    });

    // Apply taper adjustment if race date provided
    let taperFactor = 1.0;
    if (body.race_date) {
      const projectedTsb = await this.taperOptimizationService.projectTsbForDate(
        userId,
        new Date(body.race_date),
      );
      const assessment = this.taperOptimizationService.calculateFormAdjustment(projectedTsb);
      taperFactor = assessment.timeFactor;
    }

    const adjustedFlatTime = Math.round(basePrediction.predictedTimeSeconds * taperFactor);

    // Scale course profile if distance override was provided
    let scaledProfile = courseProfile;
    if (body.distance_meters && body.distance_meters !== courseProfile.totalDistanceMeters) {
      const scaleFactor = body.distance_meters / courseProfile.totalDistanceMeters;
      scaledProfile = {
        ...courseProfile,
        totalDistanceMeters: body.distance_meters,
        points: courseProfile.points.map((p) => ({
          distance: p.distance * scaleFactor,
          elevation: p.elevation,
        })),
      };
    }

    // Calculate course-based prediction with Minetti model
    const coursePrediction = this.courseAnalysisService.calculateCourseBasedPrediction(
      adjustedFlatTime,
      scaledProfile,
      {
        segmentDistanceMeters: body.segment_distance_meters || 1000,
        applyFadeFactor: body.apply_fade_factor || false,
        downhillSpeedCapMps: body.downhill_speed_cap_mps,
        smoothingWindowMeters: body.smoothing_window_meters || 100,
      },
    );

    // Validate and get warnings
    const validation = this.courseFileProcessorService.validateCourseForPrediction(scaledProfile);

    // Format segments for response
    const segments: CourseSegmentDTO[] = coursePrediction.segments.map((seg) => ({
      segment_number: seg.segmentNumber,
      start_distance_meters: seg.startDistanceMeters,
      end_distance_meters: seg.endDistanceMeters,
      average_grade_percent: seg.averageGradePercent,
      elevation_gain: seg.elevationGain,
      elevation_loss: seg.elevationLoss,
      adjusted_pace_seconds_per_km: seg.adjustedPaceSecondsPerKm,
      adjusted_pace_formatted: this.formatPace(seg.adjustedPaceSecondsPerKm),
      segment_time_seconds: seg.segmentTimeSeconds,
      cumulative_time_seconds: seg.cumulativeTimeSeconds,
      cumulative_time_formatted: this.formatTime(seg.cumulativeTimeSeconds),
    }));

    return {
      predicted_time_seconds: coursePrediction.predictedTimeSeconds,
      predicted_time_formatted: this.formatTime(coursePrediction.predictedTimeSeconds),
      flat_equivalent_time_seconds: coursePrediction.flatEquivalentTimeSeconds,
      flat_equivalent_time_formatted: this.formatTime(coursePrediction.flatEquivalentTimeSeconds),
      elevation_adjustment_seconds:
        coursePrediction.predictedTimeSeconds - coursePrediction.flatEquivalentTimeSeconds,
      distance_meters: distanceMeters,
      confidence_score: basePrediction.confidenceScore,
      segments,
      elevation_profile: coursePrediction.elevationProfile,
      summary: {
        total_elevation_gain: coursePrediction.summary.totalElevationGain,
        total_elevation_loss: coursePrediction.summary.totalElevationLoss,
        steepest_climb_percent: coursePrediction.summary.steepestClimbPercent,
        steepest_descent_percent: coursePrediction.summary.steepestDescentPercent,
        average_grade_percent: coursePrediction.summary.averageGradePercent,
      },
      algorithms_used: ['minetti_grade_cost', ...basePrediction.methods.map((m) => m.name)],
      warnings: validation.warnings.length > 0 ? validation.warnings : undefined,
    };
  }

  /**
   * List prediction history
   */
  async listPredictions(
    req: Request & { user: AuthUser },
    query: PredictionHistoryQuery,
  ): Promise<RacePredictionDTO[]> {
    const userId = req.user.id;

    const predictions = await this.racePredictionRepository.findMany({
      filter: {
        userId,
        sport: query.sport as RaceSport,
      },
      sort: [{ field: 'created_at', direction: 'desc' }],
      limit: query.limit || 50,
    });

    return predictions.map((p) => this.formatPredictionDTO(p, p.metadata?.algorithms_used || []));
  }

  /**
   * Record actual race result
   */
  async recordResult(
    req: Request & { user: AuthUser },
    raceId: string,
    body: RecordRaceResultBody,
  ): Promise<HistoricalRaceResultDTO> {
    const userId = req.user.id;

    // Get the athlete race
    const athleteRace = await this.athleteRaceRepository.findById(raceId);
    if (!athleteRace || athleteRace.user_id !== userId) {
      throw new NotFoundException('Race not found');
    }

    // Get current prediction if exists
    const prediction = await this.racePredictionRepository.findCurrentForRace(userId, raceId);

    // Calculate prediction error
    let predictionError: number | null = null;
    let predictionErrorPercent: number | null = null;
    if (prediction) {
      predictionError = body.finish_time_seconds - prediction.predicted_time_seconds;
      predictionErrorPercent = (predictionError / prediction.predicted_time_seconds) * 100;

      // Mark prediction as historical
      await this.racePredictionRepository.markAsHistorical(prediction.id);
    }

    // Create historical result
    const result = await this.historicalRaceResultsRepository.create({
      user_id: userId,
      athlete_race_id: raceId,
      race_name: body.race_name || athleteRace.manual_name || 'Race',
      race_date: athleteRace.manual_date || new Date(),
      sport: athleteRace.manual_event_type || RaceSport.RUN,
      distance_meters: athleteRace.manual_distance_meters || 10000,
      finish_time_seconds: body.finish_time_seconds,
      official_result: body.official_result ?? true,
      temperature_celsius: body.temperature_celsius || null,
      humidity_percent: body.humidity_percent || null,
      course_elevation_meters: body.course_elevation_meters || null,
      predicted_time_seconds: prediction?.predicted_time_seconds || null,
      prediction_error_seconds: predictionError,
      prediction_error_percent: predictionErrorPercent,
      source: 'manual',
    });

    return this.formatResultDTO(result);
  }

  /**
   * Get taper plan for a race
   */
  async getTaperPlan(
    req: Request & { user: AuthUser },
    raceId: string,
    query: TaperPlanQuery,
  ): Promise<TaperPlanDTO> {
    const userId = req.user.id;

    // Get the athlete race
    const athleteRace = await this.athleteRaceRepository.findById(raceId);
    if (!athleteRace || athleteRace.user_id !== userId) {
      throw new NotFoundException('Race not found');
    }

    if (!athleteRace.manual_date) {
      throw new NotFoundException('Race date not set');
    }

    const targetTsb = query.target_tsb || 15;
    const raceDate = new Date(athleteRace.manual_date).toISOString().split('T')[0];

    const taperPlan = await this.taperOptimizationService.generateTaperPlan(userId, raceDate, targetTsb);

    return {
      race_date: taperPlan.raceDate,
      days_until_race: taperPlan.daysUntilRace,
      current_ctl: taperPlan.currentCtl,
      current_atl: taperPlan.currentAtl,
      current_tsb: taperPlan.currentTsb,
      target_tsb: taperPlan.targetTsb,
      projected_race_day_tsb: taperPlan.projectedRaceDayTsb,
      race_day_assessment: {
        projected_tsb: taperPlan.raceDayAssessment.projectedTsb,
        assessment: taperPlan.raceDayAssessment.assessment,
        time_factor: taperPlan.raceDayAssessment.timeFactor,
        description: taperPlan.raceDayAssessment.description,
      },
      daily_plan: taperPlan.dailyPlan.map((day) => ({
        date: day.date,
        suggested_tss: day.suggestedTss,
        projected_ctl: day.projectedCtl,
        projected_atl: day.projectedAtl,
        projected_tsb: day.projectedTsb,
        description: day.description,
      })),
      recommendations: taperPlan.recommendations,
    };
  }

  /**
   * Update athlete profile metrics
   */
  async updateProfileMetrics(
    req: Request & { user: AuthUser },
    body: UpdateProfileMetricsBody,
  ): Promise<AthleteProfileMetricsDTO> {
    const userId = req.user.id;

    const profile = await this.athleteProfileMetricsRepository.upsert({
      user_id: userId,
      birth_date: body.birth_date || null,
      gender: body.gender || null,
      weight_kg: body.weight_kg || null,
      height_cm: body.height_cm || null,
      years_training: body.years_training || null,
      weekly_volume_hours: body.weekly_volume_hours || null,
    });

    return this.formatProfileDTO(profile);
  }

  /**
   * Get athlete profile metrics
   */
  async getProfileMetrics(req: Request & { user: AuthUser }): Promise<AthleteProfileMetricsDTO | null> {
    const userId = req.user.id;
    const profile = await this.athleteProfileMetricsRepository.findByUserId(userId);
    return profile ? this.formatProfileDTO(profile) : null;
  }

  /**
   * Get prediction accuracy stats
   */
  async getAccuracyStats(req: Request & { user: AuthUser }): Promise<PredictionAccuracyStatsDTO> {
    const userId = req.user.id;
    const stats = await this.historicalRaceResultsRepository.getPredictionAccuracyStats(userId);

    return {
      total_with_predictions: stats.totalWithPredictions,
      average_error_percent: Math.round(stats.averageErrorPercent * 100) / 100,
      average_error_seconds: Math.round(stats.averageErrorSeconds),
    };
  }

  // ==========================================================================
  // Helper Methods
  // ==========================================================================

  private formatPredictionDTO(prediction: any, algorithmsUsed: string[]): RacePredictionDTO {
    return {
      id: prediction.id,
      user_id: prediction.user_id,
      athlete_race_id: prediction.athlete_race_id || undefined,
      sport: prediction.sport,
      distance_meters: prediction.distance_meters,
      race_date: prediction.race_date
        ? new Date(prediction.race_date).toISOString().split('T')[0]
        : undefined,
      predicted_time_seconds: prediction.predicted_time_seconds,
      predicted_time_formatted: this.formatTime(prediction.predicted_time_seconds),
      confidence_lower_seconds: prediction.confidence_lower_seconds,
      confidence_upper_seconds: prediction.confidence_upper_seconds,
      confidence_score: Number.parseFloat(prediction.confidence_score),
      target_pace_per_km: prediction.target_pace_per_km
        ? Number.parseFloat(prediction.target_pace_per_km)
        : undefined,
      target_power_watts: prediction.target_power_watts || undefined,
      segment_targets: prediction.segment_targets || undefined,
      risk_score: prediction.risk_score || undefined,
      risk_factors: prediction.risk_factors || undefined,
      goal_time_seconds: prediction.goal_time_seconds || undefined,
      goal_achievability: prediction.goal_achievability || undefined,
      status: prediction.status,
      algorithms_used: algorithmsUsed,
      created_at: new Date(prediction.created_at).toISOString(),
    };
  }

  private formatResultDTO(result: any): HistoricalRaceResultDTO {
    return {
      id: result.id,
      user_id: result.user_id,
      athlete_race_id: result.athlete_race_id || undefined,
      race_name: result.race_name,
      race_date: new Date(result.race_date).toISOString().split('T')[0],
      sport: result.sport,
      distance_meters: result.distance_meters,
      finish_time_seconds: result.finish_time_seconds,
      finish_time_formatted: this.formatTime(result.finish_time_seconds),
      official_result: result.official_result,
      temperature_celsius: result.temperature_celsius || undefined,
      humidity_percent: result.humidity_percent || undefined,
      course_elevation_meters: result.course_elevation_meters || undefined,
      predicted_time_seconds: result.predicted_time_seconds || undefined,
      prediction_error_seconds: result.prediction_error_seconds || undefined,
      prediction_error_percent: result.prediction_error_percent
        ? Number.parseFloat(result.prediction_error_percent)
        : undefined,
      source: result.source,
      created_at: new Date(result.created_at).toISOString(),
    };
  }

  private formatProfileDTO(profile: any): AthleteProfileMetricsDTO {
    return {
      id: profile.id,
      user_id: profile.user_id,
      birth_date: profile.birth_date
        ? new Date(profile.birth_date).toISOString().split('T')[0]
        : undefined,
      gender: profile.gender || undefined,
      weight_kg: profile.weight_kg ? Number.parseFloat(profile.weight_kg) : undefined,
      height_cm: profile.height_cm ? Number.parseFloat(profile.height_cm) : undefined,
      current_vdot: profile.current_vdot ? Number.parseFloat(profile.current_vdot) : undefined,
      vdot_source: profile.vdot_source || undefined,
      vdot_calculated_at: profile.vdot_calculated_at
        ? new Date(profile.vdot_calculated_at).toISOString()
        : undefined,
      years_training: profile.years_training || undefined,
      weekly_volume_hours: profile.weekly_volume_hours
        ? Number.parseFloat(profile.weekly_volume_hours)
        : undefined,
      created_at: new Date(profile.created_at).toISOString(),
      updated_at: new Date(profile.updated_at).toISOString(),
    };
  }

  private formatTime(totalSeconds: number): string {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = Math.round(totalSeconds % 60);

    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }

  private formatPace(secondsPerKm: number): string {
    const minutes = Math.floor(secondsPerKm / 60);
    const seconds = Math.round(secondsPerKm % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }

  private generateSegmentTargets(
    distanceMeters: number,
    totalTimeSeconds: number,
    sport: string,
  ): SegmentTarget[] {
    const targets: SegmentTarget[] = [];
    const segmentDistance = sport === RaceSport.BIKE ? 5000 : 1000; // 5km for bike, 1km for run
    const numSegments = Math.ceil(distanceMeters / segmentDistance);
    const pacePerSegment = totalTimeSeconds / (distanceMeters / segmentDistance);

    for (let i = 0; i < numSegments; i++) {
      const isLastSegment = i === numSegments - 1;
      const segmentDist = isLastSegment
        ? distanceMeters - i * segmentDistance
        : segmentDistance;
      const segmentTime = isLastSegment
        ? totalTimeSeconds - i * pacePerSegment
        : pacePerSegment;

      targets.push({
        segment_number: i + 1,
        distance_meters: Math.round(segmentDist),
        target_time_seconds: Math.round(segmentTime),
        target_pace_per_km: Math.round((segmentTime / (segmentDist / 1000)) * 100) / 100,
        cumulative_time_seconds: Math.round((i + 1) * pacePerSegment),
      });
    }

    return targets;
  }

  private calculateGoalAchievability(
    goalTime: number,
    predictedTime: number,
    lowerBound: number,
    upperBound: number,
  ): string {
    if (goalTime >= upperBound) {
      return GoalAchievability.VERY_LIKELY;
    }
    if (goalTime >= predictedTime) {
      return GoalAchievability.LIKELY;
    }
    if (goalTime >= lowerBound) {
      return GoalAchievability.POSSIBLE;
    }
    return GoalAchievability.UNLIKELY;
  }

  private assessRisk(
    confidence: number,
    taperFactor: number,
    elevationGain: number,
    distanceMeters: number,
  ): { riskScore: number; riskFactors: string[] } {
    let riskScore = 0;
    const riskFactors: string[] = [];

    // Low confidence
    if (confidence < 0.5) {
      riskScore += 30;
      riskFactors.push('Limited training data available for prediction');
    } else if (confidence < 0.7) {
      riskScore += 15;
      riskFactors.push('Moderate confidence in prediction');
    }

    // Poor taper
    if (taperFactor > 1.03) {
      riskScore += 25;
      riskFactors.push('Arriving at race fatigued - rest recommended');
    } else if (taperFactor > 1.01) {
      riskScore += 10;
      riskFactors.push('Slightly undertapered for optimal performance');
    }

    // Significant elevation
    const elevationPerKm = elevationGain / (distanceMeters / 1000);
    if (elevationPerKm > 50) {
      riskScore += 20;
      riskFactors.push('Significant course elevation requires adjusted pacing');
    } else if (elevationPerKm > 25) {
      riskScore += 10;
      riskFactors.push('Course elevation will impact pace');
    }

    // Long distance multiplier
    if (distanceMeters >= 42195) {
      riskScore += 15;
      riskFactors.push('Marathon distance has inherent pacing challenges');
    } else if (distanceMeters >= 21097) {
      riskScore += 10;
      riskFactors.push('Half marathon requires disciplined pacing');
    }

    return {
      riskScore: Math.min(100, riskScore),
      riskFactors,
    };
  }
}

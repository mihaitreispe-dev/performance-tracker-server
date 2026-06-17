import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { RacePlanGeneratorService } from 'src/modules/api/v1/race-prediction/services/race-plan-generator.service';
import { WeatherForecastService } from 'src/modules/api/v1/race-prediction/services/weather-forecast.service';
import { AthleteRaceRepository } from 'src/repositories/athlete-race.repository';
import { RaceEventRepository } from 'src/repositories/race-event.repository';
import { RacePlanRepository } from 'src/repositories/race-plan.repository';
import { WeatherForecastRepository } from 'src/repositories/weather-forecast.repository';

/**
 * Cron service for automatically refreshing weather forecasts and regenerating race plans
 * Runs daily at 6:00 AM to update plans for upcoming races
 */
@Injectable()
export class WeatherRefreshCronService {
  private readonly logger = new Logger(WeatherRefreshCronService.name);

  constructor(
    private readonly racePlanRepository: RacePlanRepository,
    private readonly athleteRaceRepository: AthleteRaceRepository,
    private readonly raceEventRepository: RaceEventRepository,
    private readonly weatherForecastRepository: WeatherForecastRepository,
    private readonly weatherForecastService: WeatherForecastService,
    private readonly racePlanGeneratorService: RacePlanGeneratorService,
  ) {}

  /**
   * Daily weather refresh job
   * Runs at 6:00 AM every day
   */
  @Cron('0 6 * * *')
  async refreshWeatherForUpcomingRaces() {
    this.logger.log('Starting daily weather refresh for upcoming races');

    try {
      // Find races in the next 7 days with active plans
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() + 7);

      const activePlans = await this.racePlanRepository.findActivePlansForUpcomingRaces(7);

      if (activePlans.length === 0) {
        this.logger.log('No active race plans for upcoming races found');
        return;
      }

      this.logger.log(`Found ${activePlans.length} active race plans to check`);

      let refreshedCount = 0;
      let regeneratedCount = 0;
      let errorCount = 0;

      for (const plan of activePlans) {
        try {
          // Get athlete race details
          const athleteRace = await this.athleteRaceRepository.findById(plan.athlete_race_id);
          if (!athleteRace || !athleteRace.manual_date) {
            continue;
          }

          const raceDate = new Date(athleteRace.manual_date);

          // Skip if race is in the past
          if (raceDate < new Date()) {
            continue;
          }

          // Resolve race location. The GPX-derived coordinates on the
          // race itself take priority; legacy rows that still carry a
          // race event fall back to the event's location.
          let latitude = athleteRace.latitude;
          let longitude = athleteRace.longitude;
          if ((latitude == null || longitude == null) && athleteRace.race_event_id) {
            const raceEvent = await this.raceEventRepository.findById(athleteRace.race_event_id);
            if (raceEvent && raceEvent.latitude != null && raceEvent.longitude != null) {
              latitude = Number.parseFloat(raceEvent.latitude.toString());
              longitude = Number.parseFloat(raceEvent.longitude.toString());
            }
          }
          if (latitude == null || longitude == null) {
            continue; // No location data
          }

          // Get existing forecast
          const existingForecast = await this.weatherForecastRepository.findByAthleteRaceId(plan.athlete_race_id);

          // Check if we should refresh the forecast
          if (existingForecast && !this.weatherForecastService.shouldRefreshForecast(existingForecast, raceDate)) {
            continue;
          }

          this.logger.log(
            `Refreshing weather for race ${plan.athlete_race_id} (${athleteRace.manual_name || 'unnamed'})`,
          );

          // Fetch new forecast
          const newForecast = await this.weatherForecastService.fetchForecast(
            plan.athlete_race_id,
            raceDate,
            latitude,
            longitude,
            undefined,
          );

          refreshedCount++;

          // Check if weather changed significantly
          if (
            existingForecast &&
            this.weatherForecastService.hasSignificantWeatherChange(existingForecast, newForecast)
          ) {
            this.logger.log(`Significant weather change detected for race ${plan.athlete_race_id}, regenerating plan`);

            // Regenerate race plan with new weather
            await this.racePlanGeneratorService.generateRacePlan(plan.user_id, plan.athlete_race_id, {
              pacingStrategy: plan.pacing_strategy as any,
              forceRefresh: false, // We already have fresh forecast
              createdBy: 'system',
            });

            regeneratedCount++;

            // TODO: Send push notification to user about plan update
            this.logger.log(`Race plan regenerated for user ${plan.user_id}, race ${plan.athlete_race_id}`);
          }
        } catch (error) {
          errorCount++;
          this.logger.error(`Error processing race plan ${plan.id}:`, error.message);
        }
      }

      this.logger.log(
        `Weather refresh completed: ${refreshedCount} forecasts refreshed, ${regeneratedCount} plans regenerated, ${errorCount} errors`,
      );
    } catch (error) {
      this.logger.error('Failed to run weather refresh cron job:', error);
    }
  }

  /**
   * Cleanup old weather forecasts (optional - runs weekly)
   * Remove forecasts for races that happened more than 30 days ago
   */
  @Cron('0 3 * * 0') // Sunday at 3:00 AM
  async cleanupOldForecasts() {
    this.logger.log('Starting cleanup of old weather forecasts');

    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - 30);

      const oldForecasts = await this.weatherForecastRepository.findStaleForecasts(cutoffDate);

      if (oldForecasts.length === 0) {
        this.logger.log('No old forecasts to clean up');
        return;
      }

      this.logger.log(`Found ${oldForecasts.length} old forecasts to delete`);

      let deletedCount = 0;
      for (const forecast of oldForecasts) {
        try {
          await this.weatherForecastRepository.delete(forecast.id);
          deletedCount++;
        } catch (error) {
          this.logger.error(`Failed to delete forecast ${forecast.id}:`, error.message);
        }
      }

      this.logger.log(`Cleanup completed: ${deletedCount} forecasts deleted`);
    } catch (error) {
      this.logger.error('Failed to run forecast cleanup:', error);
    }
  }
}

import { Injectable, Logger } from '@nestjs/common';
import { Kysely, sql } from 'kysely';
import { Command, Console } from 'nestjs-console';
import { InjectKysely } from 'nestjs-kysely';
import { Database } from 'src/database/interfaces';
import { WeatherService } from 'src/modules/weather/weather.service';

interface ExecutionWithRoute {
  execution_id: string;
  started_at: Date;
  first_longitude: number;
  first_latitude: number;
  has_weather: boolean;
}

@Injectable()
@Console()
export class BackfillWeatherService {
  private readonly logger = new Logger(BackfillWeatherService.name);

  constructor(
    @InjectKysely() private readonly db: Kysely<Database>,
    private readonly weatherService: WeatherService,
  ) {}

  @Command({
    command: 'backfill-weather',
    description: 'Backfill weather data for workout executions that have routes but no weather',
    options: [
      {
        flags: '--dry-run',
        description: 'Preview what would be updated without making changes',
      },
      {
        flags: '--limit <value>',
        description: 'Limit the number of executions to process',
        defaultValue: '0',
      },
      {
        flags: '--user-id <value>',
        description: 'Only backfill for a specific user ID',
      },
      {
        flags: '--delay <value>',
        description: 'Delay between API calls in milliseconds (to avoid rate limiting)',
        defaultValue: '500',
      },
    ],
  })
  async backfillWeather(opts: {
    dryRun?: boolean;
    limit?: string;
    userId?: string;
    delay?: string;
  }) {
    const { dryRun, limit: limitStr, userId, delay: delayStr } = opts;
    const limit = Number.parseInt(limitStr || '0', 10);
    const delay = Number.parseInt(delayStr || '500', 10);

    this.logger.log('Starting backfill-weather command...');
    this.logger.log(
      `Options: dryRun=${!!dryRun}, limit=${limit || 'unlimited'}, userId=${userId || 'all'}, delay=${delay}ms`,
    );

    // Find executions with routes but no weather data
    const executions = await this.findExecutionsWithoutWeather(limit, userId);

    this.logger.log(`Found ${executions.length} executions with routes but no weather data`);

    if (executions.length === 0) {
      this.logger.log('No executions to process. All workouts with routes already have weather data.');
      return;
    }

    if (dryRun) {
      this.logger.log('\n=== DRY RUN MODE - No changes will be made ===\n');
      for (const exec of executions) {
        this.logger.log(`Would fetch weather for execution ${exec.execution_id}:`);
        this.logger.log(`  - Started at: ${exec.started_at.toISOString()}`);
        this.logger.log(`  - Location: ${exec.first_latitude.toFixed(4)}, ${exec.first_longitude.toFixed(4)}`);
      }
      this.logger.log(`\n=== DRY RUN COMPLETE - ${executions.length} executions would be processed ===`);
      return;
    }

    // Process executions
    let success = 0;
    let failed = 0;

    for (let i = 0; i < executions.length; i++) {
      const exec = executions[i];

      try {
        this.logger.log(
          `[${i + 1}/${executions.length}] Processing execution ${exec.execution_id}...`,
        );

        await this.weatherService.fetchAndStoreWeather({
          workoutExecutionId: exec.execution_id,
          latitude: exec.first_latitude,
          longitude: exec.first_longitude,
          startedAt: exec.started_at,
        });

        success++;
        this.logger.log(`  ✓ Weather fetched successfully`);

        // Add delay between API calls to avoid rate limiting
        if (i < executions.length - 1 && delay > 0) {
          await this.sleep(delay);
        }
      } catch (error) {
        failed++;
        this.logger.error(`  ✗ Failed: ${error.message}`);
      }
    }

    this.logger.log('\n=== COMPLETE ===');
    this.logger.log(`Success: ${success}`);
    this.logger.log(`Failed: ${failed}`);
  }

  private async findExecutionsWithoutWeather(
    limit: number,
    userId?: string,
  ): Promise<ExecutionWithRoute[]> {
    // Query to find executions that have routes but no weather data
    // Build query using Kysely's sql template tag
    const baseQuery = sql<{
      execution_id: string;
      started_at: Date;
      route_geojson: { type: string; coordinates: number[][] };
    }>`
      SELECT
        we.id as execution_id,
        we.started_at,
        wr.route_geojson
      FROM workout_executions we
      INNER JOIN workout_routes wr ON wr.workout_execution_id = we.id
      LEFT JOIN execution_weather ew ON ew.workout_execution_id = we.id
      WHERE ew.id IS NULL
        AND we.started_at IS NOT NULL
        ${userId ? sql`AND we.user_id = ${userId}` : sql``}
      ORDER BY we.started_at DESC
      ${limit > 0 ? sql`LIMIT ${limit}` : sql``}
    `;

    const result = await baseQuery.execute(this.db);

    // Process each row to extract the first coordinate
    const results: ExecutionWithRoute[] = [];

    for (const row of result.rows) {
      if (!row.route_geojson || !row.started_at) continue;

      const geojson = row.route_geojson;

      if (!geojson.coordinates || geojson.coordinates.length === 0) continue;

      const firstCoord = geojson.coordinates[0];
      if (!firstCoord || firstCoord.length < 2) continue;

      results.push({
        execution_id: row.execution_id,
        started_at: row.started_at instanceof Date ? row.started_at : new Date(row.started_at as unknown as string),
        first_longitude: firstCoord[0],
        first_latitude: firstCoord[1],
        has_weather: false,
      });
    }

    return results;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

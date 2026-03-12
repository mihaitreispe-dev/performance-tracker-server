import { Injectable, Logger } from '@nestjs/common';
import { Kysely } from 'kysely';
import { Command, Console } from 'nestjs-console';
import { InjectKysely } from 'nestjs-kysely';
import { Database, PersonalRecordType } from 'src/database/interfaces';
import { PersonalRecordsDetectionService } from 'src/modules/api/v1/personal-records/personal-records-detection.service';

// Deprecated PR types that should be cleaned up
const DEPRECATED_PR_TYPES: PersonalRecordType[] = [
  PersonalRecordType.FASTEST_KM_SPLIT,
  PersonalRecordType.FASTEST_MILE_SPLIT,
  PersonalRecordType.MAX_ELEVATION_GAIN,
];

interface CompletedExecution {
  id: string;
  user_id: string;
  completed_at: Date;
}

@Injectable()
@Console()
export class BackfillPRsService {
  private readonly logger = new Logger(BackfillPRsService.name);

  constructor(
    @InjectKysely() private readonly db: Kysely<Database>,
    private readonly prDetectionService: PersonalRecordsDetectionService,
  ) {}

  @Command({
    command: 'backfill-prs',
    description: 'Retroactively compute personal records for completed workout executions',
    options: [
      {
        flags: '--dry-run',
        description: 'Preview what would be processed without making changes',
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
        flags: '--clear-existing',
        description: 'Clear existing PRs before computing new ones',
      },
      {
        flags: '--delay <value>',
        description: 'Delay between processing executions in milliseconds',
        defaultValue: '100',
      },
    ],
  })
  async backfillPRs(opts: {
    dryRun?: boolean;
    limit?: string;
    userId?: string;
    clearExisting?: boolean;
    delay?: string;
  }) {
    const { dryRun, limit: limitStr, userId, clearExisting, delay: delayStr } = opts;
    const limit = Number.parseInt(limitStr || '0', 10);
    const delay = Number.parseInt(delayStr || '100', 10);

    this.logger.log('Starting backfill-prs command...');
    this.logger.log(
      `Options: dryRun=${!!dryRun}, limit=${limit || 'unlimited'}, userId=${userId || 'all'}, clearExisting=${!!clearExisting}, delay=${delay}ms`,
    );

    // Always clean up deprecated PRs and cardio PRs without sport type
    if (!dryRun) {
      this.logger.log('Cleaning up deprecated PRs and cardio PRs without sport type...');
      const cleanedUp = await this.cleanupDeprecatedPRs(userId);
      this.logger.log(`Cleaned up ${cleanedUp.records} records and ${cleanedUp.history} history entries.`);
    } else {
      this.logger.log('[DRY RUN] Would clean up deprecated PRs and cardio PRs without sport type');
    }

    // Optionally clear existing PRs
    if (clearExisting && !dryRun) {
      this.logger.log('Clearing existing PRs...');
      await this.clearExistingPRs(userId);
      this.logger.log('Existing PRs cleared.');
    } else if (clearExisting && dryRun) {
      this.logger.log('[DRY RUN] Would clear existing PRs');
    }

    // Find completed executions
    const executions = await this.findCompletedExecutions(limit, userId);

    this.logger.log(`Found ${executions.length} completed executions to process`);

    if (executions.length === 0) {
      this.logger.log('No executions to process.');
      return;
    }

    if (dryRun) {
      this.logger.log('\n=== DRY RUN MODE - No changes will be made ===\n');
      for (const exec of executions.slice(0, 20)) {
        this.logger.log(`Would process execution ${exec.id}:`);
        this.logger.log(`  - User: ${exec.user_id}`);
        this.logger.log(`  - Completed at: ${exec.completed_at.toISOString()}`);
      }
      if (executions.length > 20) {
        this.logger.log(`  ... and ${executions.length - 20} more executions`);
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
          `[${i + 1}/${executions.length}] Processing execution ${exec.id} (user: ${exec.user_id})...`,
        );

        await this.prDetectionService.detectAndStorePRs(exec.id, exec.user_id);

        success++;
        this.logger.log(`  ✓ PR detection completed`);

        // Add delay between processing to reduce database load
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

  private async findCompletedExecutions(
    limit: number,
    userId?: string,
  ): Promise<CompletedExecution[]> {
    let query = this.db
      .selectFrom('workout_executions')
      .select(['id', 'user_id', 'completed_at'])
      .where('completed_at', 'is not', null)
      .orderBy('completed_at', 'asc'); // Process oldest first

    if (userId) {
      query = query.where('user_id', '=', userId);
    }

    if (limit > 0) {
      query = query.limit(limit);
    }

    const rows = await query.execute();

    return rows.map((row) => ({
      id: row.id,
      user_id: row.user_id,
      completed_at: row.completed_at instanceof Date ? row.completed_at : new Date(row.completed_at as unknown as string),
    }));
  }

  private async clearExistingPRs(userId?: string): Promise<void> {
    // Clear personal records
    if (userId) {
      await this.db.deleteFrom('personal_records').where('user_id', '=', userId).execute();
      await this.db.deleteFrom('personal_record_history').where('user_id', '=', userId).execute();
    } else {
      await this.db.deleteFrom('personal_records').execute();
      await this.db.deleteFrom('personal_record_history').execute();
    }
  }

  private async cleanupDeprecatedPRs(userId?: string): Promise<{ records: number; history: number }> {
    // Cardio record types (non-strength) that should have a workout_type
    const cardioTypes: PersonalRecordType[] = [
      PersonalRecordType.FASTEST_1K,
      PersonalRecordType.FASTEST_5K,
      PersonalRecordType.FASTEST_10K,
      PersonalRecordType.FASTEST_HALF_MARATHON,
      PersonalRecordType.FASTEST_MARATHON,
      PersonalRecordType.FASTEST_400M,
      PersonalRecordType.FASTEST_800M,
      PersonalRecordType.FASTEST_1500M,
      PersonalRecordType.FASTEST_1900M,
      PersonalRecordType.FASTEST_20K,
      PersonalRecordType.FASTEST_40K,
      PersonalRecordType.FASTEST_90K,
      PersonalRecordType.FASTEST_100K,
      PersonalRecordType.FASTEST_180K,
      PersonalRecordType.LONGEST_DISTANCE,
      PersonalRecordType.LONGEST_DURATION,
    ];

    // Build query for deprecated types
    let recordsQuery = this.db
      .deleteFrom('personal_records')
      .where((eb) =>
        eb.or([
          // Deprecated PR types
          eb('record_type', 'in', DEPRECATED_PR_TYPES),
          // Cardio PRs without sport type
          eb.and([eb('record_type', 'in', cardioTypes), eb('workout_type', 'is', null)]),
        ]),
      );

    let historyQuery = this.db
      .deleteFrom('personal_record_history')
      .where((eb) =>
        eb.or([
          // Deprecated PR types
          eb('record_type', 'in', DEPRECATED_PR_TYPES),
          // Cardio PRs without sport type
          eb.and([eb('record_type', 'in', cardioTypes), eb('workout_type', 'is', null)]),
        ]),
      );

    if (userId) {
      recordsQuery = recordsQuery.where('user_id', '=', userId);
      historyQuery = historyQuery.where('user_id', '=', userId);
    }

    const [recordsResult, historyResult] = await Promise.all([
      recordsQuery.executeTakeFirst(),
      historyQuery.executeTakeFirst(),
    ]);

    return {
      records: Number(recordsResult.numDeletedRows),
      history: Number(historyResult.numDeletedRows),
    };
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

import { Injectable, Logger } from '@nestjs/common';
import { Kysely } from 'kysely';
import { Command, Console } from 'nestjs-console';
import { InjectKysely } from 'nestjs-kysely';
import { Database } from 'src/database/interfaces';
import { PersonalRecordsDetectionService } from 'src/modules/api/v1/personal-records/personal-records-detection.service';

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

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

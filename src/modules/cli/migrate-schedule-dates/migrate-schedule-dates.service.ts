import { Injectable, Logger } from '@nestjs/common';
import { Kysely } from 'kysely';
import { Command, Console } from 'nestjs-console';
import { InjectKysely } from 'nestjs-kysely';
import { Database } from 'src/database/interfaces';
import { WorkoutScheduleRepository } from 'src/repositories/workout-schedule.repository';

@Injectable()
@Console()
export class MigrateScheduleDatesService {
  private readonly logger = new Logger(MigrateScheduleDatesService.name);

  constructor(
    @InjectKysely() private readonly db: Kysely<Database>,
    private readonly workoutScheduleRepository: WorkoutScheduleRepository,
  ) {}

  @Command({
    command: 'migrate-schedule-dates',
    description:
      'Migrate workout schedules completed on a different date than their scheduled date to their completion date',
    options: [
      {
        flags: '--dry-run',
        description: 'Preview what would be updated without making changes',
      },
      {
        flags: '--user-id <value>',
        description: 'Only migrate schedules for a specific user',
      },
    ],
  })
  async migrateScheduleDates(opts: { dryRun?: boolean; userId?: string }) {
    const { dryRun, userId } = opts;

    this.logger.log('Starting migrate-schedule-dates command...');
    this.logger.log(`Options: dryRun=${!!dryRun}, userId=${userId || 'all'}`);

    // Find all completed schedules where scheduled_date differs from completed_at date
    let query = this.db
      .selectFrom('workout_schedules')
      .innerJoin('workouts', 'workouts.id', 'workout_schedules.workout_id')
      .select([
        'workout_schedules.id',
        'workout_schedules.user_id',
        'workout_schedules.scheduled_date',
        'workout_schedules.completed_at',
        'workouts.name as workout_name',
      ])
      .where('workout_schedules.completed_at', 'is not', null);

    if (userId) {
      query = query.where('workout_schedules.user_id', '=', userId);
    }

    const schedules = await query.execute();

    this.logger.log(`Found ${schedules.length} completed schedules to check`);

    // Filter schedules where dates don't match
    // Use UTC dates to avoid timezone issues
    const schedulesToMigrate = schedules.filter((schedule) => {
      if (!schedule.completed_at) return false;

      const scheduledDate = new Date(schedule.scheduled_date);
      const completedAt = new Date(schedule.completed_at);

      // Compare dates only using UTC to avoid timezone shifts
      const scheduledDateStr = scheduledDate.toISOString().split('T')[0];
      const completedDateStr = completedAt.toISOString().split('T')[0];

      return scheduledDateStr !== completedDateStr;
    });

    this.logger.log(`Found ${schedulesToMigrate.length} schedules with mismatched dates`);

    if (schedulesToMigrate.length === 0) {
      this.logger.log('No schedules need migration.');
      return;
    }

    if (dryRun) {
      this.logger.log('\n=== DRY RUN MODE - No changes will be made ===\n');

      for (const schedule of schedulesToMigrate) {
        const scheduledDate = new Date(schedule.scheduled_date);
        const completedAt = new Date(schedule.completed_at!);

        this.logger.log(`Would update: "${schedule.workout_name}"`);
        this.logger.log(`  - User ID: ${schedule.user_id}`);
        this.logger.log(`  - Current scheduled_date: ${scheduledDate.toISOString().split('T')[0]}`);
        this.logger.log(`  - completed_at: ${completedAt.toISOString()}`);
        this.logger.log(`  - New scheduled_date: ${completedAt.toISOString().split('T')[0]}`);
        this.logger.log('');
      }

      this.logger.log(`=== DRY RUN COMPLETE - ${schedulesToMigrate.length} schedules would be updated ===`);
      return;
    }

    // Perform the migration
    let updated = 0;
    let failed = 0;

    for (const schedule of schedulesToMigrate) {
      try {
        const completedAt = new Date(schedule.completed_at!);
        // Use UTC methods to avoid timezone issues
        const newScheduledDate = new Date(
          Date.UTC(completedAt.getUTCFullYear(), completedAt.getUTCMonth(), completedAt.getUTCDate()),
        );

        await this.workoutScheduleRepository.updateById(schedule.id, {
          scheduled_date: newScheduledDate,
        });

        updated++;
        this.logger.log(
          `[${updated}/${schedulesToMigrate.length}] Updated: "${schedule.workout_name}" ` +
            `(${new Date(schedule.scheduled_date).toISOString().split('T')[0]} -> ${newScheduledDate.toISOString().split('T')[0]})`,
        );
      } catch (error) {
        failed++;
        this.logger.error(`Failed to update schedule ${schedule.id}: ${error.message}`);
      }
    }

    this.logger.log('\n=== COMPLETE ===');
    this.logger.log(`Updated: ${updated}`);
    this.logger.log(`Failed: ${failed}`);
    this.logger.log(`Skipped (dates match): ${schedules.length - schedulesToMigrate.length}`);
  }
}

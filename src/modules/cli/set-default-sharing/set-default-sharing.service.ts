import { Injectable, Logger } from '@nestjs/common';
import { Kysely } from 'kysely';
import { Command, Console } from 'nestjs-console';
import { InjectKysely } from 'nestjs-kysely';
import { CoachAthleteStatus, Database } from 'src/database/interfaces';
import { AthletePrivacySettingsRepository } from 'src/repositories/athlete-privacy-settings.repository';
import { CoachAthleteRelationshipRepository } from 'src/repositories/coach-athlete-relationship.repository';

@Injectable()
@Console()
export class SetDefaultSharingService {
  private readonly logger = new Logger(SetDefaultSharingService.name);

  constructor(
    @InjectKysely() private readonly db: Kysely<Database>,
    private readonly coachAthleteRelationshipRepository: CoachAthleteRelationshipRepository,
    private readonly athletePrivacySettingsRepository: AthletePrivacySettingsRepository,
  ) {}

  @Command({
    command: 'set-default-sharing',
    description: 'Set all athletes to share all their data with their coach by default',
    options: [
      {
        flags: '--dry-run',
        description: 'Preview what would be updated without making changes',
      },
      {
        flags: '--athlete-id <value>',
        description: 'Only update sharing settings for a specific athlete',
      },
      {
        flags: '--coach-id <value>',
        description: 'Only update sharing settings for athletes of a specific coach',
      },
    ],
  })
  async setDefaultSharing(opts: { dryRun?: boolean; athleteId?: string; coachId?: string }) {
    const { dryRun, athleteId, coachId } = opts;

    this.logger.log('Starting set-default-sharing command...');
    this.logger.log(`Options: dryRun=${!!dryRun}, athleteId=${athleteId || 'all'}, coachId=${coachId || 'all'}`);

    // Find all active coach-athlete relationships
    const relationships = await this.coachAthleteRelationshipRepository.findMany({
      status: CoachAthleteStatus.ACTIVE,
      ...(athleteId && { athleteId }),
      ...(coachId && { coachId }),
    });

    this.logger.log(`Found ${relationships.length} active coach-athlete relationships`);

    if (relationships.length === 0) {
      this.logger.log('No active relationships found. Nothing to update.');
      return;
    }

    // Get unique athlete IDs (an athlete can only have one active coach, but just in case)
    const athleteIds = [...new Set(relationships.map((r) => r.athlete_id))];

    this.logger.log(`Found ${athleteIds.length} unique athletes to update`);

    // Full sharing settings - all data shared with coach
    const fullSharingSettings = {
      share_workouts: true,
      share_executions: true,
      share_analytics: true,
      share_calendar: true,
      share_personal_records: true,
      share_sleep_data: true,
      share_training_load: true,
    };

    if (dryRun) {
      this.logger.log('\n=== DRY RUN MODE - No changes will be made ===\n');

      for (const relationship of relationships) {
        const currentSettings = await this.athletePrivacySettingsRepository.findByUserId(relationship.athlete_id);

        this.logger.log(`Would update athlete: ${relationship.athlete_id}`);
        this.logger.log(`  - Coach: ${relationship.coach_id}`);
        this.logger.log(
          `  - Current settings: ${currentSettings ? JSON.stringify(currentSettings) : 'none (will create)'}`,
        );
        this.logger.log(`  - New settings: ${JSON.stringify(fullSharingSettings)}`);
        this.logger.log('');
      }

      this.logger.log(`=== DRY RUN COMPLETE - ${athleteIds.length} athletes would be updated ===`);
      return;
    }

    // Perform the update
    let updated = 0;
    let created = 0;
    let failed = 0;

    for (const athleteId of athleteIds) {
      try {
        const existing = await this.athletePrivacySettingsRepository.findByUserId(athleteId);

        await this.athletePrivacySettingsRepository.upsert(athleteId, fullSharingSettings);

        if (existing) {
          updated++;
          this.logger.log(`[${updated + created}/${athleteIds.length}] Updated settings for athlete: ${athleteId}`);
        } else {
          created++;
          this.logger.log(`[${updated + created}/${athleteIds.length}] Created settings for athlete: ${athleteId}`);
        }
      } catch (error) {
        failed++;
        this.logger.error(`Failed to update settings for athlete ${athleteId}: ${error.message}`);
      }
    }

    this.logger.log('\n=== COMPLETE ===');
    this.logger.log(`Updated: ${updated}`);
    this.logger.log(`Created: ${created}`);
    this.logger.log(`Failed: ${failed}`);
    this.logger.log(`Total: ${athleteIds.length}`);
  }
}

import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import { Command, Console } from 'nestjs-console';
import { firstValueFrom } from 'rxjs';
import { ExerciseLevel, ExerciseStatus, ExerciseVisibility } from 'src/database/interfaces';
import { S3Service } from 'src/modules/s3/s3.service';
import { EquipmentRepository } from 'src/repositories/equipment.repository';
import { ExerciseRepository } from 'src/repositories/exercise.repository';
import { ExerciseImageRepository } from 'src/repositories/exercise-image.repository';
import { MuscleGroupRepository } from 'src/repositories/muscle-group.repository';
import { OrganisationRepository } from 'src/repositories/organisation.repository';
import { UserRepository } from 'src/repositories/user.repository';
import { v4 as uuidv4 } from 'uuid';

interface FreeExerciseDBExercise {
  id: string;
  name: string;
  force: string | null;
  level: string;
  mechanic: string | null;
  equipment: string | null;
  primaryMuscles: string[];
  secondaryMuscles: string[];
  instructions: string[];
  category: string;
  images: string[];
}

const FREE_EXERCISE_DB_URL = 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/dist/exercises.json';
const FREE_EXERCISE_DB_IMAGE_BASE = 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises';

@Injectable()
@Console()
export class PopulateExercisesService {
  private readonly logger = new Logger(PopulateExercisesService.name);

  constructor(
    private readonly httpService: HttpService,
    private readonly exerciseRepo: ExerciseRepository,
    private readonly userRepo: UserRepository,
    private readonly equipmentRepo: EquipmentRepository,
    private readonly muscleGroupRepo: MuscleGroupRepository,
    private readonly exerciseImageRepo: ExerciseImageRepository,
    private readonly s3Service: S3Service,
    private readonly organisationRepo: OrganisationRepository,
  ) {}

  @Command({
    command: 'populate-exercises',
    description: 'Populate the database with exercises from Free Exercise DB',
    options: [
      {
        flags: '--user-id <value>',
        description: 'User ID to associate with created exercises (required)',
        required: true,
      },
      {
        flags: '--dry-run',
        description: 'Preview what would be created without making changes',
      },
      {
        flags: '--limit <value>',
        description: 'Limit the number of exercises to import',
        defaultValue: '0',
      },
      {
        flags: '--skip-images',
        description: 'Skip downloading and uploading images to S3',
      },
      {
        flags: '--visibility <value>',
        description: 'Visibility for imported exercises (private or public)',
        defaultValue: 'public',
      },
      {
        flags: '--organisation-id <value>',
        description: 'Organisation ID to tag exercises with. Defaults to the System org if omitted.',
      },
    ],
  })
  async populateExercises(opts: {
    userId: string;
    organisationId?: string;
    dryRun?: boolean;
    limit?: string;
    skipImages?: boolean;
    visibility?: string;
  }) {
    const { userId, organisationId: organisationIdArg, dryRun, limit: limitStr, skipImages, visibility: visibilityStr } = opts;
    const limit = Number.parseInt(limitStr || '0', 10);
    const visibility = visibilityStr === 'private' ? ExerciseVisibility.PRIVATE : ExerciseVisibility.PUBLIC;

    this.logger.log('Starting populate-exercises command...');
    this.logger.log(
      `Options: userId=${userId}, dryRun=${!!dryRun}, limit=${limit || 'unlimited'}, skipImages=${!!skipImages}, visibility=${visibility}`,
    );

    // Verify user exists
    const user = await this.userRepo.findById(userId);
    if (!user) {
      this.logger.error(`User with ID "${userId}" not found. Please provide a valid user ID.`);
      return;
    }
    this.logger.log(`User found: ${user.display_name} (${user.email})`);

    // Resolve target organisation: explicit arg, otherwise the System org.
    let organisationId = organisationIdArg ?? null;
    if (!organisationId) {
      const systemOrg = await this.organisationRepo.findBySlug('system');
      if (!systemOrg) {
        this.logger.error(
          'No --organisation-id provided and the System org is missing. Run the orgs backfill migration first.',
        );
        return;
      }
      organisationId = systemOrg.id;
    }
    this.logger.log(`Target organisation: ${organisationId}`);

    // Fetch exercises from Free Exercise DB
    this.logger.log('Fetching exercises from Free Exercise DB...');
    let exercises: FreeExerciseDBExercise[];
    try {
      const response = await firstValueFrom(this.httpService.get<FreeExerciseDBExercise[]>(FREE_EXERCISE_DB_URL));
      exercises = response.data;
      this.logger.log(`Fetched ${exercises.length} exercises from Free Exercise DB`);
    } catch (error) {
      this.logger.error(`Failed to fetch exercises: ${error.message}`);
      return;
    }

    // Apply limit if specified
    if (limit > 0) {
      exercises = exercises.slice(0, limit);
      this.logger.log(`Limited to ${exercises.length} exercises`);
    }

    // Check for existing exercises to avoid duplicates (scoped to the target org).
    const existingExercises = await this.exerciseRepo.findMany({ organisationId, filter: { userId } });
    const existingNames = new Set(existingExercises.map((e) => e.name.toLowerCase()));
    this.logger.log(`Found ${existingExercises.length} existing exercises for this user`);

    const exercisesToCreate = exercises.filter((e) => !existingNames.has(e.name.toLowerCase()));
    this.logger.log(
      `${exercisesToCreate.length} new exercises to create (${exercises.length - exercisesToCreate.length} duplicates skipped)`,
    );

    // Collect unique equipment and muscle group names for dry run summary
    const uniqueEquipment = new Set<string>();
    const uniqueMuscleGroups = new Set<string>();
    for (const exercise of exercisesToCreate) {
      if (exercise.equipment && exercise.equipment !== 'body only') {
        uniqueEquipment.add(exercise.equipment);
      }
      for (const muscle of exercise.primaryMuscles) {
        uniqueMuscleGroups.add(muscle);
      }
      for (const muscle of exercise.secondaryMuscles) {
        uniqueMuscleGroups.add(muscle);
      }
    }

    if (dryRun) {
      this.logger.log('\n=== DRY RUN MODE - No changes will be made ===\n');
      this.logger.log(`Equipment entries that would be created/linked: ${[...uniqueEquipment].join(', ') || 'None'}`);
      this.logger.log(
        `Muscle group entries that would be created/linked: ${[...uniqueMuscleGroups].join(', ') || 'None'}\n`,
      );
      for (const exercise of exercisesToCreate) {
        const level = this.mapLevel(exercise.level);
        this.logger.log(`Would create: "${exercise.name}"`);
        this.logger.log(`  - Category: ${exercise.category}`);
        this.logger.log(`  - Level: ${exercise.level} -> ${level || 'null'}`);
        this.logger.log(`  - Equipment: ${exercise.equipment || 'None'}`);
        this.logger.log(`  - Primary Muscles: ${exercise.primaryMuscles.join(', ') || 'None'}`);
        this.logger.log(`  - Secondary Muscles: ${exercise.secondaryMuscles.join(', ') || 'None'}`);
        this.logger.log(`  - Images: ${exercise.images.length} available`);
        this.logger.log('');
      }
      this.logger.log(`=== DRY RUN COMPLETE - ${exercisesToCreate.length} exercises would be created ===`);
      return;
    }

    // Create exercises
    let created = 0;
    let failed = 0;

    for (const exercise of exercisesToCreate) {
      try {
        const description = this.buildDescription(exercise);
        const level = this.mapLevel(exercise.level);

        const createdExercise = await this.exerciseRepo.create({
          organisation_id: organisationId,
          name: exercise.name,
          description,
          visibility,
          user_id: userId,
          level,
          status: ExerciseStatus.DRAFT,
        });

        // Download and upload all images if available
        if (!skipImages && exercise.images.length > 0) {
          for (let i = 0; i < exercise.images.length; i++) {
            try {
              const imageResult = await this.downloadAndUploadImage(exercise.images[i], createdExercise.id);
              if (imageResult) {
                await this.exerciseImageRepo.create({
                  exercise_id: createdExercise.id,
                  s3_bucket: imageResult.bucket,
                  s3_key: imageResult.key,
                  position: i,
                });
              }
            } catch (imgError) {
              this.logger.warn(`Failed to upload image ${i} for "${exercise.name}": ${imgError.message}`);
            }
          }
        }

        // Link equipment if present
        if (exercise.equipment && exercise.equipment !== 'body only') {
          try {
            const equipment = await this.equipmentRepo.findOrCreate(exercise.equipment);
            await this.equipmentRepo.linkToExercise(createdExercise.id, equipment.id);
          } catch (equipError) {
            this.logger.warn(`Failed to link equipment for "${exercise.name}": ${equipError.message}`);
          }
        }

        // Link primary muscle groups
        for (const muscleName of exercise.primaryMuscles) {
          try {
            const muscleGroup = await this.muscleGroupRepo.findOrCreate(muscleName);
            await this.muscleGroupRepo.linkToExercise(createdExercise.id, muscleGroup.id, true);
          } catch (muscleError) {
            this.logger.warn(
              `Failed to link primary muscle "${muscleName}" for "${exercise.name}": ${muscleError.message}`,
            );
          }
        }

        // Link secondary muscle groups
        for (const muscleName of exercise.secondaryMuscles) {
          try {
            const muscleGroup = await this.muscleGroupRepo.findOrCreate(muscleName);
            await this.muscleGroupRepo.linkToExercise(createdExercise.id, muscleGroup.id, false);
          } catch (muscleError) {
            this.logger.warn(
              `Failed to link secondary muscle "${muscleName}" for "${exercise.name}": ${muscleError.message}`,
            );
          }
        }

        created++;
        this.logger.log(`[${created}/${exercisesToCreate.length}] Created: "${exercise.name}"`);
      } catch (error) {
        failed++;
        this.logger.error(`Failed to create "${exercise.name}": ${error.message}`);
      }
    }

    this.logger.log('\n=== COMPLETE ===');
    this.logger.log(`Created: ${created}`);
    this.logger.log(`Failed: ${failed}`);
    this.logger.log(`Skipped (duplicates): ${exercises.length - exercisesToCreate.length}`);
  }

  private buildDescription(exercise: FreeExerciseDBExercise): string | null {
    if (exercise.instructions.length === 0) {
      return null;
    }
    return exercise.instructions.join('\n\n');
  }

  private mapLevel(level: string): ExerciseLevel | null {
    const normalized = level?.toLowerCase();
    switch (normalized) {
      case 'beginner':
        return ExerciseLevel.BEGINNER;
      case 'intermediate':
        return ExerciseLevel.INTERMEDIATE;
      case 'advanced':
      case 'expert':
        return ExerciseLevel.ADVANCED;
      default:
        return null;
    }
  }

  private getImageContentType(extension: string): string {
    const map: Record<string, string> = {
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      png: 'image/png',
      gif: 'image/gif',
      webp: 'image/webp',
      svg: 'image/svg+xml',
      bmp: 'image/bmp',
    };
    return map[extension] || 'image/jpeg';
  }

  private async downloadAndUploadImage(
    imageName: string,
    exerciseId: string,
  ): Promise<{ bucket: string; key: string } | null> {
    const imageUrl = `${FREE_EXERCISE_DB_IMAGE_BASE}/${imageName}`;

    try {
      const response = await firstValueFrom(this.httpService.get(imageUrl, { responseType: 'arraybuffer' }));

      const buffer = Buffer.from(response.data);
      const extension = imageName.split('.').pop()?.toLowerCase() || 'jpg';
      const contentType = this.getImageContentType(extension);
      const key = `exercises/${exerciseId}/images/${uuidv4()}.${extension}`;

      await this.s3Service.uploadFile({
        bucket: this.s3Service.contentBucket,
        key,
        data: buffer,
        additionalParams: {
          ContentType: contentType,
        },
      });

      return {
        bucket: this.s3Service.contentBucket,
        key,
      };
    } catch (error) {
      this.logger.warn(`Failed to download image from ${imageUrl}: ${error.message}`);
      return null;
    }
  }
}

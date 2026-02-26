import { Injectable, NotFoundException } from '@nestjs/common';
import { Request } from 'express';
import {
  Exercise,
  ExerciseImage,
  ExerciseLevel,
  ExerciseStatus,
  ExerciseVisibility,
  UserRole,
} from 'src/database/interfaces';
import { buildPageLinks } from 'src/lib/http/mappers/build-page-links';
import { s3Keys } from 'src/lib/util/s3-keys';
import { AppAccessControlService } from 'src/modules/app-access-control/app-access-control.service';
import { AuthUser } from 'src/modules/auth/types/authenticated-user';
import { AppConfigService } from 'src/modules/config/app-config.service';
import { MediaConvertService } from 'src/modules/mediaconvert/mediaconvert.service';
import { S3Service } from 'src/modules/s3/s3.service';
import { EquipmentRepository } from 'src/repositories/equipment.repository';
import { ExerciseRepository } from 'src/repositories/exercise.repository';
import { ExerciseChainMemberWithExercise, ExerciseChainRepository } from 'src/repositories/exercise-chain.repository';
import { ExerciseImageRepository } from 'src/repositories/exercise-image.repository';
import { MuscleGroupRepository } from 'src/repositories/muscle-group.repository';
import { v4 as uuidv4 } from 'uuid';

import {
  CreateExerciseBody,
  ExerciseIdParam,
  ListExercisesQuery,
  UpdateExerciseBody,
  UpdateExerciseChainBody,
} from './request.dto';
import {
  EquipmentDTO,
  ExerciseChainMemberDTO,
  ExerciseChainResponse,
  ExerciseDTO,
  ExerciseImageDTO,
  ExerciseListResponse,
  ExerciseResponse,
  ExerciseUploadUrlResponse,
  MediaAssetDTO,
  MuscleGroupDTO,
} from './response.dto';

@Injectable()
export class ExercisesApiService {
  constructor(
    private readonly exerciseRepo: ExerciseRepository,
    private readonly equipmentRepo: EquipmentRepository,
    private readonly muscleGroupRepo: MuscleGroupRepository,
    private readonly exerciseImageRepo: ExerciseImageRepository,
    private readonly exerciseChainRepo: ExerciseChainRepository,
    private readonly s3Service: S3Service,
    private readonly configService: AppConfigService,
    private readonly accessControlService: AppAccessControlService,
    private readonly mediaConvertService: MediaConvertService,
  ) {}

  async list(req: Request & { user: AuthUser }, query: ListExercisesQuery): Promise<ExerciseListResponse> {
    const { q, offset = 0, limit = 20, visibility, sort } = query;

    const filter = {
      visibility,
      search: q,
    };

    const [exercises, totalCount] = await Promise.all([
      this.exerciseRepo.findMany({ filter, sort, offset, limit }),
      this.exerciseRepo.countMany(filter),
    ]);

    const data = await Promise.all(exercises.map((e) => this.mapExerciseToDTO(e)));
    const links = buildPageLinks({
      request: req,
      apiUrl: this.configService.apiV1URL,
      limit,
      offset,
      itemCount: exercises.length,
    });

    return { data, links, offset, limit, totalCount };
  }

  async getById(req: Request & { user: AuthUser }, id: string): Promise<ExerciseResponse> {
    await this.requireAdmin(req.user.id);

    const exercise = await this.exerciseRepo.findById(id);
    if (!exercise) {
      throw new NotFoundException();
    }

    return { data: await this.mapExerciseToDTO(exercise) };
  }

  async create(req: Request & { user: AuthUser }, body: CreateExerciseBody): Promise<ExerciseResponse> {
    await this.requireAdmin(req.user.id);

    const videoFilename = body.videoMimeType
      ? `${uuidv4()}.${this.getExtensionFromMimeType(body.videoMimeType)}`
      : null;
    const videoS3Key = videoFilename
      ? s3Keys.upload.exercise({ visitorId: req.user.id, filename: videoFilename }).video
      : null;

    const exercise = await this.exerciseRepo.create({
      name: body.name,
      description: body.description ?? null,
      cues: body.cues ?? [],
      category: body.category ?? null,
      level: body.level ?? null,
      visibility: body.visibility ?? ExerciseVisibility.PRIVATE,
      user_id: req.user.id,
      video_s3_bucket: videoS3Key ? this.s3Service.uploadBucket : null,
      video_s3_key: videoS3Key,
      video_mime_type: body.videoMimeType ?? null,
      status: videoS3Key ? ExerciseStatus.UPLOAD_PENDING : ExerciseStatus.DRAFT,
    });

    // Link equipment
    if (body.equipmentIds && body.equipmentIds.length > 0) {
      for (const equipmentId of body.equipmentIds) {
        await this.equipmentRepo.linkToExercise(exercise.id, equipmentId);
      }
    }

    // Link primary muscle groups
    if (body.primaryMuscleGroupIds && body.primaryMuscleGroupIds.length > 0) {
      for (const muscleGroupId of body.primaryMuscleGroupIds) {
        await this.muscleGroupRepo.linkToExercise(exercise.id, muscleGroupId, true);
      }
    }

    // Link secondary muscle groups
    if (body.secondaryMuscleGroupIds && body.secondaryMuscleGroupIds.length > 0) {
      for (const muscleGroupId of body.secondaryMuscleGroupIds) {
        await this.muscleGroupRepo.linkToExercise(exercise.id, muscleGroupId, false);
      }
    }

    return { data: await this.mapExerciseToDTO(exercise) };
  }

  async update(req: Request & { user: AuthUser }, id: string, body: UpdateExerciseBody): Promise<ExerciseResponse> {
    await this.requireAdmin(req.user.id);

    const existing = await this.exerciseRepo.findById(id);
    if (!existing) {
      throw new NotFoundException();
    }

    const update: Record<string, any> = {};
    if (body.name !== undefined) update.name = body.name;
    if (body.description !== undefined) update.description = body.description;
    if (body.cues !== undefined) update.cues = body.cues;
    if (body.category !== undefined) update.category = body.category;
    if (body.level !== undefined) update.level = body.level;
    if (body.visibility !== undefined) update.visibility = body.visibility;

    if (body.videoMimeType !== undefined) {
      const videoFilename = `${uuidv4()}.${this.getExtensionFromMimeType(body.videoMimeType)}`;
      const videoS3Key = s3Keys.upload.exercise({ visitorId: existing.user_id, filename: videoFilename }).video;
      update.video_s3_bucket = this.s3Service.uploadBucket;
      update.video_s3_key = videoS3Key;
      update.video_mime_type = body.videoMimeType;
      update.status = ExerciseStatus.UPLOAD_PENDING;
      update.media_convert_job_id = null;
      update.picture_s3_bucket = null;
      update.picture_s3_key = null;
    }

    const exercise = await this.exerciseRepo.updateById(id, update);

    // Update equipment links if provided
    if (body.equipmentIds !== undefined) {
      // Remove existing links
      const existingEquipment = await this.equipmentRepo.findByExerciseId(id);
      for (const eq of existingEquipment) {
        await this.equipmentRepo.unlinkFromExercise(id, eq.id);
      }
      // Add new links
      for (const equipmentId of body.equipmentIds) {
        await this.equipmentRepo.linkToExercise(id, equipmentId);
      }
    }

    // Update primary muscle group links if provided
    if (body.primaryMuscleGroupIds !== undefined) {
      const existingPrimary = await this.muscleGroupRepo.findPrimaryByExerciseId(id);
      for (const mg of existingPrimary) {
        await this.muscleGroupRepo.unlinkFromExercise(id, mg.id);
      }
      for (const muscleGroupId of body.primaryMuscleGroupIds) {
        await this.muscleGroupRepo.linkToExercise(id, muscleGroupId, true);
      }
    }

    // Update secondary muscle group links if provided
    if (body.secondaryMuscleGroupIds !== undefined) {
      const existingSecondary = await this.muscleGroupRepo.findSecondaryByExerciseId(id);
      for (const mg of existingSecondary) {
        await this.muscleGroupRepo.unlinkFromExercise(id, mg.id);
      }
      for (const muscleGroupId of body.secondaryMuscleGroupIds) {
        await this.muscleGroupRepo.linkToExercise(id, muscleGroupId, false);
      }
    }

    return { data: await this.mapExerciseToDTO(exercise) };
  }

  async delete(req: Request & { user: AuthUser }, id: string): Promise<void> {
    await this.requireAdmin(req.user.id);

    const existing = await this.exerciseRepo.findById(id);
    if (!existing) {
      throw new NotFoundException();
    }

    await this.exerciseRepo.deleteById(id);
  }

  async getUploadUrl(req: Request & { user: AuthUser }, params: ExerciseIdParam): Promise<ExerciseUploadUrlResponse> {
    await this.requireAdmin(req.user.id);

    const exercise = await this.exerciseRepo.findById(params.id);
    if (!exercise) {
      throw new NotFoundException();
    }

    if (!exercise.video_s3_bucket || !exercise.video_s3_key) {
      throw new NotFoundException('Exercise has no video configured');
    }

    const videoUploadUrl = await this.s3Service.getSignedUrlPUT({
      bucket: exercise.video_s3_bucket,
      key: exercise.video_s3_key,
      contentType: exercise.video_mime_type ?? 'video/*',
    });

    return { data: { video: videoUploadUrl } };
  }

  async markUploadComplete(req: Request & { user: AuthUser }, params: ExerciseIdParam): Promise<ExerciseResponse> {
    await this.requireAdmin(req.user.id);

    const exercise = await this.exerciseRepo.findById(params.id);
    if (!exercise) {
      throw new NotFoundException();
    }

    if (!exercise.video_s3_bucket || !exercise.video_s3_key) {
      throw new NotFoundException('Exercise has no video configured');
    }

    await this.exerciseRepo.updateById(params.id, { status: ExerciseStatus.UPLOAD_DONE });

    const s3Paths = s3Keys.content.exercise({ userId: exercise.user_id, exerciseId: exercise.id });
    const mediaConvertJob = await this.mediaConvertService.createJob({
      inputURL: `s3://${exercise.video_s3_bucket}/${exercise.video_s3_key}`,
      outputS3Folder: `s3://${this.s3Service.contentBucket}/${s3Paths.base}/`,
    });

    if (mediaConvertJob) {
      await this.exerciseRepo.updateById(params.id, {
        media_convert_job_id: mediaConvertJob.Id,
        status: ExerciseStatus.ASSETS_PENDING,
      });
    }

    const updated = await this.exerciseRepo.findById(params.id);
    return { data: await this.mapExerciseToDTO(updated!) };
  }

  async getExerciseChain(req: Request & { user: AuthUser }, id: string): Promise<ExerciseChainResponse | null> {
    await this.requireAdmin(req.user.id);

    const exercise = await this.exerciseRepo.findById(id);
    if (!exercise) {
      throw new NotFoundException();
    }

    const chain = await this.exerciseChainRepo.findByExerciseId(id);
    if (!chain) {
      return null;
    }

    const members = await this.exerciseChainRepo.findChainMembers(chain.id);
    return {
      data: {
        chainId: chain.id,
        members: await Promise.all(members.map((m) => this.mapChainMemberToDTO(m))),
      },
    };
  }

  async updateExerciseChain(
    req: Request & { user: AuthUser },
    id: string,
    body: UpdateExerciseChainBody,
  ): Promise<ExerciseChainResponse> {
    await this.requireAdmin(req.user.id);

    const exercise = await this.exerciseRepo.findById(id);
    if (!exercise) {
      throw new NotFoundException();
    }

    // Ensure the current exercise is included in the chain
    if (!body.memberIds.includes(id)) {
      body.memberIds.push(id);
    }

    // Validate all exercises exist
    const exercises = await this.exerciseRepo.findByIds(body.memberIds);
    if (exercises.length !== body.memberIds.length) {
      throw new NotFoundException('One or more exercises not found');
    }

    // Check if any of the exercises already belong to other chains
    for (const exerciseId of body.memberIds) {
      if (exerciseId === id) continue;
      const existingChain = await this.exerciseChainRepo.findByExerciseId(exerciseId);
      if (existingChain) {
        const currentExerciseChain = await this.exerciseChainRepo.findByExerciseId(id);
        if (!currentExerciseChain || existingChain.id !== currentExerciseChain.id) {
          throw new NotFoundException(`Exercise ${exerciseId} already belongs to another chain`);
        }
      }
    }

    // Get or create chain
    let chain = await this.exerciseChainRepo.findByExerciseId(id);
    if (!chain) {
      chain = await this.exerciseChainRepo.createChain();
    }

    // Update members
    await this.exerciseChainRepo.setChainMembers(chain.id, body.memberIds);

    const members = await this.exerciseChainRepo.findChainMembers(chain.id);
    return {
      data: {
        chainId: chain.id,
        members: await Promise.all(members.map((m) => this.mapChainMemberToDTO(m))),
      },
    };
  }

  async removeFromChain(req: Request & { user: AuthUser }, id: string): Promise<void> {
    await this.requireAdmin(req.user.id);

    const exercise = await this.exerciseRepo.findById(id);
    if (!exercise) {
      throw new NotFoundException();
    }

    const chainId = await this.exerciseChainRepo.removeExerciseFromChain(id);
    if (chainId) {
      await this.exerciseChainRepo.deleteChainIfEmpty(chainId);
    }
  }

  private async mapChainMemberToDTO(member: ExerciseChainMemberWithExercise): Promise<ExerciseChainMemberDTO> {
    // Get picture URL for the exercise
    const exercise = await this.exerciseRepo.findById(member.exercise_id);
    const picture = exercise ? await this.getPictureUrl(exercise) : null;

    return {
      id: member.exercise_id,
      name: member.exercise_name,
      picture,
      level: member.exercise_level as ExerciseLevel | null,
      position: member.position,
    };
  }

  private async requireAdmin(userId: string): Promise<void> {
    await this.accessControlService.hasOneOfRolesOrThrow({ userId, roles: [UserRole.ADMIN] });
  }

  private async mapExerciseToDTO(exercise: Exercise): Promise<ExerciseDTO> {
    const [assets, picture, equipmentList, primaryMuscles, secondaryMuscles, exerciseImages] = await Promise.all([
      this.buildMediaAssets(exercise),
      this.getPictureUrl(exercise),
      this.equipmentRepo.findByExerciseId(exercise.id),
      this.muscleGroupRepo.findPrimaryByExerciseId(exercise.id),
      this.muscleGroupRepo.findSecondaryByExerciseId(exercise.id),
      this.exerciseImageRepo.findByExerciseId(exercise.id),
    ]);

    const equipment: EquipmentDTO[] = equipmentList.map((e) => ({ id: e.id, name: e.name }));
    const primaryMusclesDTOs: MuscleGroupDTO[] = primaryMuscles.map((m) => ({ id: m.id, name: m.name }));
    const secondaryMusclesDTOs: MuscleGroupDTO[] = secondaryMuscles.map((m) => ({ id: m.id, name: m.name }));
    const images: ExerciseImageDTO[] = await Promise.all(exerciseImages.map((img) => this.mapExerciseImageToDTO(img)));

    return {
      id: exercise.id,
      name: exercise.name,
      description: exercise.description,
      cues: exercise.cues,
      category: exercise.category,
      level: exercise.level,
      visibility: exercise.visibility,
      status: exercise.status,
      userId: exercise.user_id,
      picture: picture ?? images[0]?.url ?? null,
      images,
      assets,
      equipment,
      primaryMuscles: primaryMusclesDTOs,
      secondaryMuscles: secondaryMusclesDTOs,
      createdAt: new Date(exercise.created_at as unknown as string).toISOString(),
      updatedAt: new Date(exercise.updated_at as unknown as string).toISOString(),
    };
  }

  private async mapExerciseImageToDTO(image: ExerciseImage): Promise<ExerciseImageDTO> {
    const url = await this.getImageUrl(image.s3_bucket, image.s3_key);
    return {
      id: image.id,
      url,
      position: image.position,
    };
  }

  private async getImageUrl(bucket: string, key: string): Promise<string> {
    if (this.configService.isCloudFrontSigningEnabled && !this.configService.disableCdn) {
      return await this.s3Service.getCloudFrontSignedUrlGET({ key });
    }
    return await this.s3Service.getSignedUrlGET({ bucket, key });
  }

  private async buildMediaAssets(exercise: Exercise): Promise<MediaAssetDTO[]> {
    if (!exercise.video_s3_bucket || !exercise.video_s3_key) {
      return [];
    }

    const cdnUrl = this.configService.cdnUrl;
    const s3Paths = s3Keys.content.exercise({ userId: exercise.user_id, exerciseId: exercise.id });

    if (exercise.status === ExerciseStatus.ASSETS_DONE) {
      const posterCloudFrontUrl = this.configService.isCloudFrontSigningEnabled
        ? await this.s3Service.getCloudFrontSignedUrlGET({ key: s3Paths.poster })
        : undefined;
      const thumbnailCloudFrontUrl = this.configService.isCloudFrontSigningEnabled
        ? await this.s3Service.getCloudFrontSignedUrlGET({ key: s3Paths.thumbnail })
        : undefined;

      return [
        {
          url: `${cdnUrl}/${s3Paths.video}`,
          poster: posterCloudFrontUrl || `${cdnUrl}/${s3Paths.poster}`,
          thumbnail: thumbnailCloudFrontUrl || `${cdnUrl}/${s3Paths.thumbnail}`,
          mimeType: 'application/x-mpegURL',
        },
        {
          url: `${cdnUrl}/${s3Paths.audio}`,
          mimeType: 'audio/mp4',
        },
      ];
    }

    // Return original video for non-processed states
    const videoUrl = await this.s3Service.getSignedUrlGET({
      bucket: exercise.video_s3_bucket,
      key: exercise.video_s3_key,
    });

    return [
      {
        url: videoUrl,
        mimeType: exercise.video_mime_type ?? 'video/mp4',
      },
    ];
  }

  private async getPictureUrl(exercise: Exercise): Promise<string | null> {
    // If assets are done, use the extracted thumbnail as picture
    if (exercise.status === ExerciseStatus.ASSETS_DONE) {
      const s3Paths = s3Keys.content.exercise({ userId: exercise.user_id, exerciseId: exercise.id });
      if (this.configService.isCloudFrontSigningEnabled && !this.configService.disableCdn) {
        return await this.s3Service.getCloudFrontSignedUrlGET({ key: s3Paths.thumbnail });
      }
      return `${this.configService.cdnUrl}/${s3Paths.thumbnail}`;
    }

    // Otherwise use explicitly set picture if available
    if (exercise.picture_s3_bucket && exercise.picture_s3_key) {
      if (this.configService.isCloudFrontSigningEnabled && !this.configService.disableCdn) {
        return await this.s3Service.getCloudFrontSignedUrlGET({ key: exercise.picture_s3_key });
      }
      return await this.s3Service.getSignedUrlGET({
        bucket: exercise.picture_s3_bucket,
        key: exercise.picture_s3_key,
      });
    }

    return null;
  }

  private getExtensionFromMimeType(mimeType: string): string {
    const map: Record<string, string> = {
      'video/mp4': 'mp4',
      'video/quicktime': 'mov',
      'video/x-msvideo': 'avi',
      'video/webm': 'webm',
      'video/x-matroska': 'mkv',
    };
    return map[mimeType] || 'mp4';
  }
}

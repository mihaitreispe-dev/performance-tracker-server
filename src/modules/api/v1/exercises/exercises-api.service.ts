import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Request } from 'express';
import {
  ContentItemKind,
  Exercise,
  ExerciseImage,
  ExerciseLevel,
  ExerciseStatus,
  ExerciseVisibility,
  UserRole,
} from 'src/database/interfaces';
import { buildPageLinks } from 'src/lib/http/mappers/build-page-links';
import { assertActiveOrg } from 'src/lib/util/active-org';
import { s3Keys } from 'src/lib/util/s3-keys';
import { AppAccessControlService } from 'src/modules/app-access-control/app-access-control.service';
import { AuthUser } from 'src/modules/auth/types/authenticated-user';
import { AuthedRequest } from 'src/modules/auth/types/request-with-active-org';
import { AppConfigService } from 'src/modules/config/app-config.service';
import { LocalTranscodeService } from 'src/modules/local-transcode/local-transcode.service';
import { MediaConvertService } from 'src/modules/mediaconvert/mediaconvert.service';
import { S3Service } from 'src/modules/s3/s3.service';
import { SmartCropService } from 'src/modules/smart-crop/smart-crop.service';
import { VimeoService, type VimeoProgressiveRendition } from 'src/modules/vimeo/vimeo.service';
import { EquipmentRepository } from 'src/repositories/equipment.repository';
import { ExerciseRepository } from 'src/repositories/exercise.repository';
import { ExerciseChainMemberWithExercise, ExerciseChainRepository } from 'src/repositories/exercise-chain.repository';
import { ExerciseImageRepository } from 'src/repositories/exercise-image.repository';
import { MuscleGroupRepository } from 'src/repositories/muscle-group.repository';
import { ContentItemRepository } from 'src/repositories/content-item.repository';
import { v4 as uuidv4 } from 'uuid';

import {
  CreateExerciseBody,
  ExerciseIdParam,
  ImportExerciseFromVimeoBody,
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
    private readonly contentItemRepo: ContentItemRepository,
    private readonly vimeoService: VimeoService,
    private readonly smartCropService: SmartCropService,
    private readonly localTranscodeService: LocalTranscodeService,
  ) {}

  private readonly importLogger = new Logger('VimeoImporter');

  async list(req: AuthedRequest, query: ListExercisesQuery): Promise<ExerciseListResponse> {
    const organisationId = assertActiveOrg(req);
    const { q, offset = 0, limit = 20, visibility, sort } = query;

    const filter = {
      visibility,
      search: q,
    };

    const [exercises, totalCount] = await Promise.all([
      this.exerciseRepo.findMany({ organisationId, filter, sort, offset, limit }),
      this.exerciseRepo.countMany(organisationId, filter),
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

  async getById(req: AuthedRequest, id: string): Promise<ExerciseResponse> {
    await this.requireAdmin(req.user.id);
    const organisationId = assertActiveOrg(req);
    const exercise = await this.loadReadable(id, organisationId);
    return { data: await this.mapExerciseToDTO(exercise) };
  }

  /** Load an exercise the caller can read: own org rows or any PUBLIC row. */
  private async loadReadable(id: string, organisationId: string): Promise<Exercise> {
    const exercise = await this.exerciseRepo.findById(id);
    if (
      !exercise ||
      (exercise.organisation_id !== organisationId && exercise.visibility !== ExerciseVisibility.PUBLIC)
    ) {
      throw new NotFoundException();
    }
    return exercise;
  }

  /** Load an exercise the caller can edit: own org rows only (public rows owned elsewhere are read-only). */
  private async loadEditable(id: string, organisationId: string): Promise<Exercise> {
    const exercise = await this.exerciseRepo.findById(id);
    if (!exercise || exercise.organisation_id !== organisationId) {
      throw new NotFoundException();
    }
    return exercise;
  }

  async create(req: AuthedRequest, body: CreateExerciseBody): Promise<ExerciseResponse> {
    await this.requireAdmin(req.user.id);
    const organisationId = assertActiveOrg(req);

    // Every exercise is a video asset. The thumbnail is extracted from that
    // video by MediaConvert during the upload-completion handoff — there is
    // no image-only path. The client should already block submit without a
    // video, but we re-validate here because the API is the trust boundary.
    if (!body.videoMimeType) {
      throw new BadRequestException(
        'videoMimeType is required — every exercise must ship with a video. The thumbnail is auto-extracted.',
      );
    }

    const videoFilename = `${uuidv4()}.${this.getExtensionFromMimeType(body.videoMimeType)}`;
    const videoS3Key = s3Keys.upload.exercise({ visitorId: req.user.id, filename: videoFilename }).video;

    const exercise = await this.exerciseRepo.create({
      organisation_id: organisationId,
      name: body.name,
      description: body.description ?? null,
      cues: body.cues ?? [],
      category: body.category ?? null,
      level: body.level ?? null,
      visibility: body.visibility ?? ExerciseVisibility.PRIVATE,
      user_id: req.user.id,
      video_s3_bucket: this.s3Service.uploadBucket,
      video_s3_key: videoS3Key,
      video_mime_type: body.videoMimeType,
      status: ExerciseStatus.UPLOAD_PENDING,
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

  /**
   * Creates an exercise from a Vimeo source. Returns immediately with the exercise in
   * UPLOAD_PENDING; a fire-and-forget background task streams the MP4 from Vimeo into
   * MinIO and flips status to UPLOAD_DONE (after which the existing MediaConvert flow
   * can run on demand via markUploadComplete).
   */
  async importFromVimeo(req: AuthedRequest, body: ImportExerciseFromVimeoBody): Promise<ExerciseResponse> {
    await this.requireAdmin(req.user.id);
    const organisationId = assertActiveOrg(req);

    const videoId = this.vimeoService.parseVideoId(body.vimeoUrl);
    const meta = await this.vimeoService.fetchMetadata(videoId);
    const rendition = this.vimeoService.pickRendition(meta);

    const filename = `${uuidv4()}.mp4`;
    const videoS3Key = s3Keys.upload.exercise({ visitorId: req.user.id, filename }).video;
    const videoS3Bucket = this.s3Service.uploadBucket;

    const exercise = await this.exerciseRepo.create({
      organisation_id: organisationId,
      name: (body.name ?? meta.name).trim() || `Vimeo ${videoId}`,
      description: body.description ?? meta.description ?? null,
      cues: [],
      category: null,
      level: null,
      visibility: body.visibility ?? ExerciseVisibility.PRIVATE,
      user_id: req.user.id,
      video_s3_bucket: videoS3Bucket,
      video_s3_key: videoS3Key,
      video_mime_type: 'video/mp4',
      status: ExerciseStatus.UPLOAD_PENDING,
      vimeo_video_id: videoId,
    });

    // Fire-and-forget — caller gets an immediate response with a pending exercise.
    void this.runVimeoImport(exercise.id, rendition, videoS3Bucket, videoS3Key);

    return { data: await this.mapExerciseToDTO(exercise) };
  }

  /**
   * Re-run the Vimeo MP4 streaming for an exercise that was previously imported via Vimeo.
   * Vimeo's progressive rendition links expire, so we re-fetch metadata and pick a fresh
   * rendition. The S3 bucket/key are reused (the prior failed upload either never wrote
   * anything or wrote a partial blob that the new stream will overwrite).
   */
  async retryVimeoImport(req: AuthedRequest, exerciseId: string): Promise<ExerciseResponse> {
    await this.requireAdmin(req.user.id);
    const organisationId = assertActiveOrg(req);
    const existing = await this.loadEditable(exerciseId, organisationId);

    if (!existing.vimeo_video_id) {
      throw new UnprocessableEntityException('Exercise was not imported from Vimeo — nothing to retry');
    }
    if (!existing.video_s3_bucket || !existing.video_s3_key) {
      throw new UnprocessableEntityException('Exercise is missing the video S3 destination — cannot retry');
    }

    const meta = await this.vimeoService.fetchMetadata(existing.vimeo_video_id);
    const rendition = this.vimeoService.pickRendition(meta);

    const updated = await this.exerciseRepo.updateById(exerciseId, {
      status: ExerciseStatus.UPLOAD_PENDING,
    });

    void this.runVimeoImport(exerciseId, rendition, existing.video_s3_bucket, existing.video_s3_key);

    return { data: await this.mapExerciseToDTO(updated) };
  }

  private async runVimeoImport(
    exerciseId: string,
    rendition: VimeoProgressiveRendition,
    bucket: string,
    key: string,
  ): Promise<void> {
    try {
      this.importLogger.log(`Streaming Vimeo rendition ${rendition.rendition} into s3://${bucket}/${key} for exercise ${exerciseId}`);
      const sourceRes = await this.vimeoService.openSourceStream(rendition);
      if (!sourceRes.body) {
        throw new Error('Vimeo response had no body');
      }
      // Node's fetch returns a Web ReadableStream — convert to Node Readable for the AWS SDK upload.
      const nodeStream = (await import('node:stream')).Readable.fromWeb(
        sourceRes.body as unknown as import('node:stream/web').ReadableStream<Uint8Array>,
      );
      await this.s3Service.uploadFile({ bucket, key, data: nodeStream });
      await this.exerciseRepo.updateById(exerciseId, { status: ExerciseStatus.UPLOAD_DONE });
      this.importLogger.log(`Vimeo import complete for exercise ${exerciseId}`);
    } catch (err) {
      this.importLogger.error(
        `Vimeo import failed for exercise ${exerciseId}: ${(err as Error).message}`,
        (err as Error).stack,
      );
      try {
        await this.exerciseRepo.updateById(exerciseId, { status: ExerciseStatus.ASSETS_FAILED });
      } catch {
        // best-effort
      }
    }
  }

  async update(req: AuthedRequest, id: string, body: UpdateExerciseBody): Promise<ExerciseResponse> {
    await this.requireAdmin(req.user.id);
    const organisationId = assertActiveOrg(req);
    const existing = await this.loadEditable(id, organisationId);

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
      // Thumbnail is auto-extracted from the new video by MediaConvert. We
      // null the existing pointer so the response correctly reports "still
      // processing" until the new pipeline finishes — otherwise the UI
      // would show the previous video's thumbnail against the new clip.
      update.thumbnail_s3_bucket = null;
      update.thumbnail_s3_key = null;
    }

    if (body.introContentItemId !== undefined) {
      if (body.introContentItemId === null) {
        update.intro_content_item_id = null;
      } else {
        const intro = await this.contentItemRepo.findByIdInOrg(body.introContentItemId, existing.organisation_id);
        if (!intro) {
          throw new NotFoundException('Intro content item not found in this organisation');
        }
        if (intro.kind !== ContentItemKind.EXERCISE_INTRO) {
          throw new BadRequestException(`Intro content item must be of kind ${ContentItemKind.EXERCISE_INTRO}`);
        }
        update.intro_content_item_id = body.introContentItemId;
      }
    }

    if (body.introStartSeconds !== undefined) {
      update.intro_start_seconds = body.introStartSeconds;
    }
    if (body.introEndSeconds !== undefined) {
      update.intro_end_seconds = body.introEndSeconds;
    }
    // Defensive: if both are set, start must be < end.
    if (
      update.intro_start_seconds !== undefined &&
      update.intro_end_seconds !== undefined &&
      update.intro_start_seconds !== null &&
      update.intro_end_seconds !== null &&
      update.intro_start_seconds >= update.intro_end_seconds
    ) {
      throw new BadRequestException('introStartSeconds must be less than introEndSeconds');
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

  async delete(req: AuthedRequest, id: string): Promise<void> {
    await this.requireAdmin(req.user.id);
    const organisationId = assertActiveOrg(req);
    await this.loadEditable(id, organisationId);
    await this.exerciseRepo.deleteById(id);
  }

  async getUploadUrl(req: AuthedRequest, params: ExerciseIdParam): Promise<ExerciseUploadUrlResponse> {
    await this.requireAdmin(req.user.id);
    const organisationId = assertActiveOrg(req);
    const exercise = await this.loadEditable(params.id, organisationId);

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

  async markUploadComplete(req: AuthedRequest, params: ExerciseIdParam): Promise<ExerciseResponse> {
    await this.requireAdmin(req.user.id);
    const organisationId = assertActiveOrg(req);
    const exercise = await this.loadEditable(params.id, organisationId);

    if (!exercise.video_s3_bucket || !exercise.video_s3_key) {
      throw new NotFoundException('Exercise has no video configured');
    }

    await this.exerciseRepo.updateById(params.id, { status: ExerciseStatus.UPLOAD_DONE });
    await this.startAssetProcessing(exercise);

    const updated = await this.exerciseRepo.findById(params.id);
    return { data: await this.mapExerciseToDTO(updated!) };
  }

  /**
   * Re-runs the MediaConvert pipeline against an exercise's existing source
   * video. Used to backfill renditions added after the original encode —
   * e.g. the 16:9 companion. The source clip lives in the upload bucket and
   * is retained after processing, so re-encoding needs no re-upload.
   */
  async reprocessAssets(req: AuthedRequest, params: ExerciseIdParam): Promise<ExerciseResponse> {
    await this.requireAdmin(req.user.id);
    const organisationId = assertActiveOrg(req);
    const exercise = await this.loadEditable(params.id, organisationId);

    if (!exercise.video_s3_bucket || !exercise.video_s3_key) {
      throw new UnprocessableEntityException('Exercise has no source video to re-process');
    }

    const started = await this.startAssetProcessing(exercise);
    if (!started) {
      throw new UnprocessableEntityException(
        'Could not start media processing — MediaConvert is disabled or the job could not be created',
      );
    }

    const updated = await this.exerciseRepo.findById(params.id);
    return { data: await this.mapExerciseToDTO(updated!) };
  }

  /**
   * Kicks off a MediaConvert job for an exercise's source video and, on
   * success, records the job id + flips status to ASSETS_PENDING (the cron
   * watches it to completion). Returns false when MediaConvert is disabled
   * (local dev) or the job couldn't be created. Single source of truth for
   * both the initial upload-completion path and re-processing.
   */
  private async startAssetProcessing(exercise: Exercise): Promise<boolean> {
    if (!exercise.video_s3_bucket || !exercise.video_s3_key) {
      return false;
    }

    // Local-dev path (env split): ffmpeg stands in for MediaConvert. Flip to
    // ASSETS_PENDING and transcode in the background, mirroring how the AWS
    // path returns immediately while a job runs out of band.
    if (this.localTranscodeService.enabled) {
      await this.exerciseRepo.updateById(exercise.id, {
        status: ExerciseStatus.ASSETS_PENDING,
        media_convert_job_id: null,
        rekognition_job_id: null,
      });
      this.localTranscodeService.transcodeInBackground(exercise);
      return true;
    }

    // Smart-crop path: Rekognition detection is async (can take minutes), so
    // we only *start* the job here and persist its id. The smart-crop cron
    // polls it durably, computes the 16:9 crop, then creates the MediaConvert
    // job — surviving process restarts that a fire-and-forget poll wouldn't.
    // Flip to ASSETS_PENDING with the rekognition id set and the encode id
    // cleared so the analysis-phase query matches it.
    if (this.smartCropService.enabled) {
      const rekognitionJobId = await this.smartCropService.startDetection({
        bucket: exercise.video_s3_bucket,
        key: exercise.video_s3_key,
      });
      if (rekognitionJobId) {
        await this.exerciseRepo.updateById(exercise.id, {
          status: ExerciseStatus.ASSETS_PENDING,
          rekognition_job_id: rekognitionJobId,
          smart_crop_started_at: new Date(),
          media_convert_job_id: null,
        });
        return true;
      }
      // Detection couldn't start — fall through to a plain (letterboxed) encode.
    }

    const mediaConvertJob = await this.mediaConvertService.createJob({
      inputURL: `s3://${exercise.video_s3_bucket}/${exercise.video_s3_key}`,
      outputS3Folder: this.contentOutputFolder(exercise),
    });
    if (!mediaConvertJob) {
      return false;
    }
    await this.exerciseRepo.updateById(exercise.id, {
      media_convert_job_id: mediaConvertJob.Id,
      status: ExerciseStatus.ASSETS_PENDING,
    });
    return true;
  }

  private contentOutputFolder(exercise: Exercise): string {
    const s3Paths = s3Keys.content.exercise({ userId: exercise.user_id, exerciseId: exercise.id });
    return `s3://${this.s3Service.contentBucket}/${s3Paths.base}/`;
  }

  async getExerciseChain(req: AuthedRequest, id: string): Promise<ExerciseChainResponse | null> {
    await this.requireAdmin(req.user.id);
    const organisationId = assertActiveOrg(req);
    await this.loadReadable(id, organisationId);

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
    req: AuthedRequest,
    id: string,
    body: UpdateExerciseChainBody,
  ): Promise<ExerciseChainResponse> {
    await this.requireAdmin(req.user.id);
    const organisationId = assertActiveOrg(req);
    await this.loadEditable(id, organisationId);

    // Ensure the current exercise is included in the chain
    if (!body.memberIds.includes(id)) {
      body.memberIds.push(id);
    }

    // Validate all exercises exist AND every chain member belongs to this org (no cross-tenant chains).
    const exercises = await this.exerciseRepo.findByIds(body.memberIds);
    if (exercises.length !== body.memberIds.length) {
      throw new NotFoundException('One or more exercises not found');
    }
    for (const ex of exercises) {
      if (ex.organisation_id !== organisationId && ex.visibility !== ExerciseVisibility.PUBLIC) {
        throw new NotFoundException('One or more exercises not found');
      }
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
    const exercise = await this.exerciseRepo.findById(member.exercise_id);
    // Output is named `picture` for back-compat; the value is the auto-
    // extracted thumbnail (no uploaded-image fallback any more).
    const picture = exercise ? await this.getThumbnailUrl(exercise) : null;

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
      this.getThumbnailUrl(exercise),
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
      // `picture` is the auto-extracted thumbnail (back-compat name). Once
      // assets land it's populated; while uploading/processing it stays null
      // and the UI renders a placeholder. The `images` array is a separate
      // gallery field (independent of the thumbnail invariant).
      picture,
      images,
      assets,
      equipment,
      primaryMuscles: primaryMusclesDTOs,
      secondaryMuscles: secondaryMusclesDTOs,
      introContentItemId: exercise.intro_content_item_id ?? null,
      introStartSeconds: exercise.intro_start_seconds ?? null,
      introEndSeconds: exercise.intro_end_seconds ?? null,
      vimeoVideoId: exercise.vimeo_video_id ?? null,
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

    const s3Paths = s3Keys.content.exercise({ userId: exercise.user_id, exerciseId: exercise.id });

    if (exercise.status === ExerciseStatus.ASSETS_DONE) {
      // Resolve every content key through the same three-mode strategy
      // (local-MinIO public URL / CloudFront signed / plain CDN). Two
      // oriented HLS renditions are emitted: 9:16 portrait (primary, first)
      // and 16:9 wide. Portrait stays first so existing readers that grab
      // the first video asset are unchanged; orientation-aware players use
      // `aspectRatio` to pick the wide clip on landscape viewports.
      const [videoUrl, posterUrl, thumbnailUrl, audioUrl, videoWideUrl, posterWideUrl, thumbnailWideUrl] =
        await Promise.all([
          this.resolveContentUrl(s3Paths.video),
          this.resolveContentUrl(s3Paths.poster),
          this.resolveContentUrl(s3Paths.thumbnail),
          this.resolveContentUrl(s3Paths.audio),
          this.resolveContentUrl(s3Paths.videoWide),
          this.resolveContentUrl(s3Paths.posterWide),
          this.resolveContentUrl(s3Paths.thumbnailWide),
        ]);

      return [
        {
          url: videoUrl,
          poster: posterUrl,
          thumbnail: thumbnailUrl,
          mimeType: 'application/x-mpegURL',
          aspectRatio: '9:16',
        },
        {
          url: videoWideUrl,
          poster: posterWideUrl,
          thumbnail: thumbnailWideUrl,
          mimeType: 'application/x-mpegURL',
          aspectRatio: '16:9',
        },
        {
          url: audioUrl,
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

  /**
   * Resolves a single content-bucket key to a playable URL, picking
   * between three strategies based on config:
   *   1. disableCdn (local dev / MinIO): plain `${endpoint}/${bucket}/${key}`.
   *      We don't sign — the .m3u8 playlist references its segments by
   *      relative path and hls.js fetches them with no query string, so a
   *      signed playlist URL would leave the segment GETs unsigned and
   *      MinIO 403s them. The content bucket is public-read (minio-init),
   *      so playlist + segments + stills all share the same anonymous path.
   *      s3Endpoint can be undefined; fall back to cdnUrl so we never emit
   *      `undefined/...`.
   *   2. CloudFront signing on: serve via CloudFront with a signed URL.
   *   3. Plain CDN: public CDN, no signing — concatenate cdnUrl + key.
   */
  private async resolveContentUrl(key: string): Promise<string> {
    if (this.configService.disableCdn) {
      const endpoint = this.configService.s3Endpoint ?? this.configService.cdnUrl;
      return `${endpoint}/${this.configService.s3ContentBucket}/${key}`;
    }
    if (this.configService.isCloudFrontSigningEnabled) {
      return await this.s3Service.getCloudFrontSignedUrlGET({ key });
    }
    return `${this.configService.cdnUrl}/${key}`;
  }

  /**
   * Resolves a signed URL to the exercise's thumbnail — the still frame
   * MediaConvert extracts from the video. Returns null until the video
   * pipeline produces it (i.e. for any status < `assets_done`); the UI
   * surfaces that as "still processing".
   *
   * There is intentionally no fallback to an uploaded image — the
   * image-only exercise path was retired in migration 1774401800000.
   */
  private async getThumbnailUrl(exercise: Exercise): Promise<string | null> {
    if (exercise.status !== ExerciseStatus.ASSETS_DONE) return null;

    const s3Paths = s3Keys.content.exercise({ userId: exercise.user_id, exerciseId: exercise.id });

    // Same three-mode pick as buildMediaAssets — local dev relies on the
    // content bucket being public-read (see minio-init service) so we
    // emit a plain endpoint URL. That way thumbnails and HLS segments
    // share the same URL scheme; signing is reserved for the upload
    // bucket which stays private.
    if (this.configService.disableCdn) {
      const endpoint = this.configService.s3Endpoint ?? this.configService.cdnUrl;
      return `${endpoint}/${this.configService.s3ContentBucket}/${s3Paths.thumbnail}`;
    }
    if (this.configService.isCloudFrontSigningEnabled) {
      return await this.s3Service.getCloudFrontSignedUrlGET({ key: s3Paths.thumbnail });
    }
    return `${this.configService.cdnUrl}/${s3Paths.thumbnail}`;
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

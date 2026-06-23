import {
  BadRequestException,
  ForbiddenException,
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
  ExerciseVoiceoverMode,
  OrganisationRole,
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
import { TranslationsService } from 'src/modules/translations/translations.service';
import { VimeoService, type VimeoProgressiveRendition } from 'src/modules/vimeo/vimeo.service';
import { toTitleCase } from 'src/lib/util/title-case';
import { CategoryRepository } from 'src/repositories/category.repository';
import { EquipmentRepository } from 'src/repositories/equipment.repository';
import { ExerciseRepository } from 'src/repositories/exercise.repository';
import { MovementPatternRepository } from 'src/repositories/movement-pattern.repository';
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
  CategoryRefDTO,
  EquipmentDTO,
  ExerciseChainMemberDTO,
  ExerciseChainResponse,
  ExerciseDTO,
  ExerciseImageDTO,
  ExerciseListResponse,
  ExerciseResponse,
  ExerciseTranslationDTO,
  ExerciseUploadUrlResponse,
  MediaAssetDTO,
  MovementPatternRefDTO,
  MuscleGroupDTO,
} from './response.dto';

@Injectable()
export class ExercisesApiService {
  constructor(
    private readonly exerciseRepo: ExerciseRepository,
    private readonly equipmentRepo: EquipmentRepository,
    private readonly muscleGroupRepo: MuscleGroupRepository,
    private readonly categoryRepo: CategoryRepository,
    private readonly movementPatternRepo: MovementPatternRepository,
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
    // Content-translation reads — published voice-over / intro
    // translations are embedded in the single-exercise GET so the
    // player can pick captions / translated narration by locale.
    private readonly translationsService: TranslationsService,
  ) {}

  private readonly importLogger = new Logger('VimeoImporter');

  async list(req: AuthedRequest, query: ListExercisesQuery): Promise<ExerciseListResponse> {
    const organisationId = assertActiveOrg(req);
    const { q, offset = 0, limit = 20, visibility, sort, equipmentIds, categoryId } = query;

    const filter = {
      visibility,
      search: q,
      equipmentIds,
      categoryId,
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
    // No role check — any member of the org can read the exercises
    // their org owns (or public exercises from other orgs).
    // loadReadable enforces the org-or-public tenancy boundary.
    const organisationId = assertActiveOrg(req);
    const exercise = await this.loadReadable(id, organisationId);
    return { data: await this.mapExerciseToDTO(exercise, { includeTranslations: true }) };
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
    this.requireWriteRole(req);
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
      movement_pattern_id: body.movementPatternId ?? null,
      level: body.level ?? null,
      visibility: body.visibility ?? ExerciseVisibility.PRIVATE,
      user_id: req.user.id,
      video_s3_bucket: this.s3Service.uploadBucket,
      video_s3_key: videoS3Key,
      video_mime_type: body.videoMimeType,
      status: ExerciseStatus.UPLOAD_PENDING,
    });

    // Link categories
    if (body.categoryIds && body.categoryIds.length > 0) {
      for (const categoryId of body.categoryIds) {
        await this.categoryRepo.linkToExercise(exercise.id, categoryId);
      }
    }

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
    this.requireWriteRole(req);
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
    this.requireWriteRole(req);
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
    this.requireWriteRole(req);
    const organisationId = assertActiveOrg(req);
    const existing = await this.loadEditable(id, organisationId);

    const update: Record<string, any> = {};
    if (body.name !== undefined) update.name = body.name;
    if (body.description !== undefined) update.description = body.description;
    if (body.movementPatternId !== undefined) update.movement_pattern_id = body.movementPatternId;
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
    if (body.executionStartSeconds !== undefined) {
      // Intentionally NOT constrained against intro_end_seconds — execution
      // starting before the intro ends IS the overlap this feature enables.
      update.execution_start_seconds = body.executionStartSeconds;
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

    // Voice-over config. Flipping mode to 'recorded' without an
    // already-uploaded file would violate the
    // exercises_voiceover_recorded_chk CHECK constraint — guard
    // here so the user gets a friendly error rather than a Postgres
    // 23514. The upload-URL endpoint is the only happy path that
    // populates the S3 pointer + flips the mode in one step.
    if (body.voiceoverMode !== undefined) {
      if (body.voiceoverMode === ExerciseVoiceoverMode.RECORDED) {
        if (!existing.voiceover_s3_bucket || !existing.voiceover_s3_key) {
          throw new BadRequestException(
            "Can't set voiceoverMode to 'recorded' without uploading an audio file first " +
              '(call POST /exercises/:id/voiceover/upload-url).',
          );
        }
      } else if (body.voiceoverMode === ExerciseVoiceoverMode.OFF) {
        // Flipping back to 'off' clears the recording pointer too so
        // we don't keep a stale S3 reference + can re-upload cleanly.
        update.voiceover_s3_bucket = null;
        update.voiceover_s3_key = null;
        update.voiceover_mime_type = null;
      }
      update.voiceover_mode = body.voiceoverMode;
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

    // Update category links if provided (replace entirely)
    if (body.categoryIds !== undefined) {
      await this.categoryRepo.deleteByExerciseId(id);
      for (const categoryId of body.categoryIds) {
        await this.categoryRepo.linkToExercise(id, categoryId);
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
    this.requireWriteRole(req);
    const organisationId = assertActiveOrg(req);
    await this.loadEditable(id, organisationId);
    // exercise_instances.exercise_id is ON DELETE RESTRICT, so deleting an
    // exercise that's used in any workout would throw a raw FK error. Pre-check
    // and surface a clear, actionable message instead.
    const usageCount = await this.exerciseRepo.countInstances(id);
    if (usageCount > 0) {
      throw new UnprocessableEntityException(
        "This exercise is used in one or more workouts and can't be deleted. Remove it from those workouts first.",
      );
    }
    await this.exerciseRepo.deleteById(id);
  }

  async getUploadUrl(req: AuthedRequest, params: ExerciseIdParam): Promise<ExerciseUploadUrlResponse> {
    this.requireWriteRole(req);
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

  /**
   * Issue a presigned PUT URL for the per-exercise voice-over audio
   * file (spec voice-over v1). Atomically stamps the S3 pointer +
   * flips voiceover_mode to 'recorded' so the next read of this
   * exercise surfaces the URL — the client uploads to the URL and
   * the row is already pointed at the (about-to-exist) object.
   *
   * If the client never PUTs, we have a row pointing at a missing
   * key. Acceptable: the next attempt overwrites the same row and
   * the player tolerates a 404 on the audio fetch (it just plays no
   * VO). A future cleanup task could reconcile.
   */
  async getVoiceoverUploadUrl(
    req: AuthedRequest,
    params: ExerciseIdParam,
    body: { mimeType: string },
  ): Promise<{ data: { audio: string } }> {
    this.requireWriteRole(req);
    const organisationId = assertActiveOrg(req);
    const existing = await this.loadEditable(params.id, organisationId);

    // Whitelist a small set of common audio mime types. We don't
    // process the audio server-side (no transcode pipeline for VO)
    // so the browser <audio> element has to decode whatever the
    // client uploads — restricting to widely-supported codecs avoids
    // "I uploaded an .ogg and Safari can't play it" surprises.
    const ACCEPTED_MIMES = new Set([
      'audio/mpeg', // .mp3
      'audio/mp4', // .m4a, .aac
      'audio/aac',
      'audio/webm', // common from MediaRecorder on Chrome
      'audio/wav',
    ]);
    if (!ACCEPTED_MIMES.has(body.mimeType)) {
      throw new BadRequestException(
        `Unsupported voice-over mime type. Accepted: ${[...ACCEPTED_MIMES].join(', ')}`,
      );
    }

    const ext = this.getExtensionFromMimeType(body.mimeType);
    const filename = `${uuidv4()}.${ext}`;
    const s3Key = s3Keys.upload.exerciseVoiceover({
      visitorId: existing.user_id,
      exerciseId: existing.id,
      filename,
    }).audio;

    // Stamp the pointer + flip mode in one shot. CHECK constraint is
    // satisfied because bucket + key + mime are all set together.
    await this.exerciseRepo.updateById(existing.id, {
      voiceover_s3_bucket: this.s3Service.uploadBucket,
      voiceover_s3_key: s3Key,
      voiceover_mime_type: body.mimeType,
      voiceover_mode: ExerciseVoiceoverMode.RECORDED,
    });

    const uploadUrl = await this.s3Service.getSignedUrlPUT({
      bucket: this.s3Service.uploadBucket,
      key: s3Key,
      contentType: body.mimeType,
    });

    return { data: { audio: uploadUrl } };
  }

  async markUploadComplete(req: AuthedRequest, params: ExerciseIdParam): Promise<ExerciseResponse> {
    this.requireWriteRole(req);
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
    this.requireWriteRole(req);
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

    // Local-dev path (env split): ffmpeg stands in for MediaConvert. Just
    // mark the row as needing local transcode and let the cron pick it up,
    // mirroring how the AWS path returns immediately while a job runs out of
    // band. Durable across restarts because the pending flag lives on the row.
    if (this.localTranscodeService.enabled) {
      await this.exerciseRepo.updateById(exercise.id, {
        status: ExerciseStatus.ASSETS_PENDING,
        local_transcode_pending: true,
        local_transcode_started_at: null,
        media_convert_job_id: null,
        rekognition_job_id: null,
      });
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
    // Read — any org member can see the chain a readable exercise
    // belongs to. loadReadable handles tenancy.
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
    this.requireWriteRole(req);
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
    this.requireWriteRole(req);

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

  /**
   * Org-level write gate. Mutation methods (create, update, delete,
   * upload-completion, reprocess, chain edit) used to require
   * UserRole.ADMIN — platform support only. Coaches and org-admins
   * couldn't curate their own org's exercise library at all. We widen
   * to anyone in [OWNER, ADMIN, COACH] of the active org, OR a
   * platform admin dropping in via the ActiveOrgGuard bypass
   * (req.activeOrg.role is synthesised to OrganisationRole.ADMIN for
   * them, so the role check already passes).
   *
   * Athletes are still locked out — exercise library curation is
   * coach-and-up.
   *
   * Tenancy is enforced separately by loadEditable() against
   * organisation_id, so this only filters by role.
   */
  private requireWriteRole(req: AuthedRequest): void {
    const role = req.activeOrg?.role;
    if (
      role !== OrganisationRole.OWNER &&
      role !== OrganisationRole.ADMIN &&
      role !== OrganisationRole.COACH
    ) {
      throw new ForbiddenException(
        'You need to be coach, admin or owner to manage exercises in this organisation',
      );
    }
  }

  private async mapExerciseToDTO(
    exercise: Exercise,
    opts: { includeTranslations?: boolean } = {},
  ): Promise<ExerciseDTO> {
    const [assets, picture, equipmentList, primaryMuscles, secondaryMuscles, exerciseImages, categoryList, movementPattern] =
      await Promise.all([
        this.buildMediaAssets(exercise),
        this.getThumbnailUrl(exercise),
        this.equipmentRepo.findByExerciseId(exercise.id),
        this.muscleGroupRepo.findPrimaryByExerciseId(exercise.id),
        this.muscleGroupRepo.findSecondaryByExerciseId(exercise.id),
        this.exerciseImageRepo.findByExerciseId(exercise.id),
        this.categoryRepo.findByExerciseId(exercise.id),
        exercise.movement_pattern_id
          ? this.movementPatternRepo.findById(exercise.movement_pattern_id)
          : Promise.resolve(undefined),
      ]);

    // Equipment names are free-typed; normalise to Title Case for display.
    const equipment: EquipmentDTO[] = equipmentList.map((e) => ({ id: e.id, name: toTitleCase(e.name) }));
    const categories: CategoryRefDTO[] = categoryList.map((c) => ({ id: c.id, name: c.name }));
    const movementPatternDTO: MovementPatternRefDTO | null = movementPattern
      ? { id: movementPattern.id, name: movementPattern.name }
      : null;
    const primaryMusclesDTOs: MuscleGroupDTO[] = primaryMuscles.map((m) => ({ id: m.id, name: m.name }));
    const secondaryMusclesDTOs: MuscleGroupDTO[] = secondaryMuscles.map((m) => ({ id: m.id, name: m.name }));
    const images: ExerciseImageDTO[] = await Promise.all(exerciseImages.map((img) => this.mapExerciseImageToDTO(img)));

    // Voice-over URL: only meaningful in 'recorded' mode. We sign the
    // S3 GET when the pointer trio is present. Off mode → null.
    let voiceoverUrl: string | null = null;
    if (
      exercise.voiceover_mode === ExerciseVoiceoverMode.RECORDED &&
      exercise.voiceover_s3_bucket &&
      exercise.voiceover_s3_key
    ) {
      voiceoverUrl = await this.getImageUrl(
        exercise.voiceover_s3_bucket,
        exercise.voiceover_s3_key,
      ).catch(() => null);
    }

    const translations = opts.includeTranslations
      ? await this.buildPublishedTranslations(exercise.id)
      : undefined;

    return {
      id: exercise.id,
      name: exercise.name,
      description: exercise.description,
      categories,
      movementPattern: movementPatternDTO,
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
      executionStartSeconds: exercise.execution_start_seconds ?? null,
      vimeoVideoId: exercise.vimeo_video_id ?? null,
      voiceoverMode: exercise.voiceover_mode,
      voiceoverUrl,
      voiceoverMimeType: exercise.voiceover_mime_type ?? null,
      translations,
      createdAt: new Date(exercise.created_at as unknown as string).toISOString(),
      updatedAt: new Date(exercise.updated_at as unknown as string).toISOString(),
    };
  }

  /**
   * Published voice-over + intro translations for an exercise, mapped to
   * DTOs with signed caption / dubbed-audio URLs. Only 'published' rows
   * — drafts and in-review translations never reach an athlete.
   */
  private async buildPublishedTranslations(exerciseId: string): Promise<ExerciseTranslationDTO[]> {
    const rows = [
      ...(await this.translationsService.listForTarget('exercise_voiceover', exerciseId)),
      ...(await this.translationsService.listForTarget('exercise_intro', exerciseId)),
    ].filter((r) => r.review_status === 'published');
    return Promise.all(
      rows.map(async (r) => ({
        targetType: r.target_type,
        locale: r.locale,
        translatedText: r.translated_text,
        captionVttUrl:
          r.caption_vtt_s3_bucket && r.caption_vtt_s3_key
            ? await this.getImageUrl(r.caption_vtt_s3_bucket, r.caption_vtt_s3_key).catch(() => null)
            : null,
        dubbedAudioUrl:
          r.dubbed_audio_s3_bucket && r.dubbed_audio_s3_key
            ? await this.getImageUrl(r.dubbed_audio_s3_bucket, r.dubbed_audio_s3_key).catch(() => null)
            : null,
      })),
    );
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
    if (!this.configService.disableCdn && this.configService.isCloudFrontSigningEnabled) {
      return await this.s3Service.getCloudFrontSignedUrlGET({ key });
    }
    // disableCdn: path-style MinIO. CDN without signing: trust the
    // CloudFront origin to route bucket→key. publicContentUrl picks
    // the right shape for each.
    return this.configService.publicContentUrl(key);
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

    // Prefer the 1:1 square middle-frame thumbnail — same shape the
    // tile surfaces (workout-detail rows, prep list, NextPreviewTile)
    // expect. Falls back to the 9:16 first-frame variant if the
    // square hasn't been produced yet (exercises transcoded before
    // the square pipeline shipped). Same three-mode URL pick as
    // buildMediaAssets — local dev relies on the content bucket being
    // public-read (see minio-init service) so we emit a plain endpoint
    // URL via publicContentUrl. CDN signing applies in prod with
    // CloudFront.
    const key = s3Paths.thumbnailSquare;
    if (!this.configService.disableCdn && this.configService.isCloudFrontSigningEnabled) {
      return await this.s3Service.getCloudFrontSignedUrlGET({ key });
    }
    return this.configService.publicContentUrl(key);
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

import { plainToInstance } from 'class-transformer';
import { IsNumber, IsOptional, IsString, Matches, Max, Min, validateSync } from 'class-validator';

export class BoostrapEnv {
  // Enable features

  @IsString()
  @IsOptional()
  @Matches('^Y|N$', 'i')
  API_V1_MODULE_ENABLED?: string;

  @IsNumber()
  @IsOptional()
  API_V1_PORT?: number;

  @IsString()
  @IsOptional()
  CRON_MODULE_ENABLED?: string;

  static validate(config: Record<string, unknown>) {
    const validatedConfig = plainToInstance(BoostrapEnv, config, { enableImplicitConversion: true });
    const errors = validateSync(validatedConfig, { skipMissingProperties: false });
    if (errors.length > 0) {
      throw new Error(errors.toString());
    }
    return validatedConfig;
  }
}

export class Env extends BoostrapEnv {
  // API URL

  @IsString()
  API_V1_URL: string;

  // Auth

  @IsString()
  JWT_ACCESS_TOKEN_SECRET: string;

  @IsString()
  JWT_ACCESS_TOKEN_EXPIRY: string;

  @IsString()
  JWT_REFRESH_TOKEN_SECRET: string;

  @IsString()
  JWT_REFRESH_TOKEN_EXPIRY: string;

  // Database

  @IsString()
  DB_HOST: string;

  @IsNumber()
  @Min(0)
  @Max(65535)
  DB_PORT: number;

  @IsString()
  DB_USER: string;

  @IsString()
  DB_PASSWORD: string;

  @IsString()
  DB_NAME: string;

  @IsString()
  @Matches('^Y|N$', 'i')
  DB_SSL: string;

  // AWS — optional. When set (local MinIO / explicit-key deploys) the
  // SDK clients use them; on ECS/Fargate they're unset and the SDK
  // falls back to the task role (see s3 / mediaconvert services).

  @IsString()
  @IsOptional()
  AWS_ACCESS_KEY?: string;

  @IsString()
  @IsOptional()
  AWS_SECRET_KEY?: string;

  // S3

  @IsString()
  @IsOptional()
  S3_ENDPOINT?: string;

  @IsString()
  S3_REGION: string;

  @IsString()
  S3_UPLOAD_BUCKET: string;

  @IsString()
  S3_CONTENT_BUCKET: string;

  // Vimeo (optional — only required for the import-from-Vimeo flow)

  @IsString()
  @IsOptional()
  VIMEO_ACCESS_TOKEN?: string;

  // Stripe Connect (optional — only required for the billing surface)

  @IsString()
  @IsOptional()
  STRIPE_SECRET_KEY?: string;

  @IsString()
  @IsOptional()
  STRIPE_WEBHOOK_SECRET?: string;

  @IsString()
  @IsOptional()
  STRIPE_RETURN_URL_BASE?: string;

  @IsString()
  @IsOptional()
  CLIENT_URL?: string;

  // Swagger — optional. Basic-auth docs only mount when BOTH are set
  // (see api-v1.app.module); unset = docs route disabled.

  @IsString()
  @IsOptional()
  SWAGGER_USERNAME?: string;

  @IsString()
  @IsOptional()
  SWAGGER_PASSWORD?: string;

  // CDN

  @IsString()
  CDN_URL: string;

  @IsString()
  @Matches('^Y|N$', 'i')
  DISABLE_CDN: string;

  // CloudFront — optional. Only used for CloudFront signed-URL GETs
  // (getCloudFrontSignedUrlGET), which short-circuit to '' when unset.
  // Our CDN uses public/OAC access, so these stay empty.

  @IsString()
  @IsOptional()
  CLOUDFRONT_KEY_PAIR_ID?: string;

  @IsString()
  @IsOptional()
  CLOUDFRONT_PRIVATE_KEY?: string;

  // Firebase — optional so a deploy without push configured still
  // boots (FirebaseService is graceful; see its onModuleInit). When
  // all three are set, push + Firebase auth activate.

  @IsString()
  @IsOptional()
  FIREBASE_PROJECT_ID?: string;

  @IsString()
  @IsOptional()
  FIREBASE_CLIENT_EMAIL?: string;

  @IsString()
  @IsOptional()
  FIREBASE_PRIVATE_KEY?: string;

  // MediaConvert

  @IsString()
  MEDIA_CONVERT_REGION: string;

  @IsString()
  MEDIA_CONVERT_ROLE: string;

  @IsString()
  MEDIA_CONVERT_QUEUE: string;

  @IsString()
  @Matches('^Y|N$', 'i')
  DISABLE_MEDIA_CONVERT: string;

  // Smart crop (Rekognition body-detect) — optional, defaults off.
  @IsString()
  @Matches('^Y|N$', 'i')
  @IsOptional()
  ENABLE_SMART_CROP?: string;

  // Local ffmpeg transcode (MediaConvert stand-in for local dev) — optional,
  // defaults off. When Y, exercise uploads are transcoded locally instead of
  // via MediaConvert. Requires ffmpeg on PATH + a reachable object store.
  @IsString()
  @Matches('^Y|N$', 'i')
  @IsOptional()
  ENABLE_LOCAL_TRANSCODE?: string;

  // How the local transcode fills the 16:9 frame: 'pad' (letterbox, default)
  // or 'crop' (centre-crop). No effect unless ENABLE_LOCAL_TRANSCODE=Y.
  @IsString()
  @Matches('^pad|crop$', 'i')
  @IsOptional()
  LOCAL_TRANSCODE_WIDE_MODE?: string;

  // Content translation pipeline (voice-over + intro translation).
  // AWS Translate (machine translation) + Transcribe (speech-to-text)
  // are opt-in; off by default so the feature ships dark until an org
  // turns it on. ElevenLabs key is for the later cloned-voice dub.
  @IsString()
  @Matches('^Y|N$', 'i')
  @IsOptional()
  ENABLE_AWS_TRANSLATE?: string;

  @IsString()
  @Matches('^Y|N$', 'i')
  @IsOptional()
  ENABLE_AWS_TRANSCRIBE?: string;

  @IsString()
  @IsOptional()
  ELEVENLABS_API_KEY?: string;

  // Which speech-to-text backend to use for the translation pipeline.
  // Optional override; when unset the provider is inferred (ElevenLabs
  // when ELEVENLABS_API_KEY is present, else AWS when ENABLE_AWS_TRANSCRIBE=Y).
  @IsString()
  @Matches('^aws|elevenlabs$', 'i')
  @IsOptional()
  TRANSCRIBE_PROVIDER?: string;

  // ElevenLabs Scribe STT model id. Defaults to 'scribe_v1'.
  @IsString()
  @IsOptional()
  ELEVENLABS_STT_MODEL?: string;

  // Garmin Integration

  @IsString()
  @IsOptional()
  GARMIN_CONSUMER_KEY?: string;

  @IsString()
  @IsOptional()
  GARMIN_CONSUMER_SECRET?: string;

  @IsString()
  @IsOptional()
  GARMIN_REDIRECT_URI?: string;

  // CORS

  @IsString()
  @IsOptional()
  CORS_ORIGINS?: string;

  // OpenWearables

  @IsString()
  @IsOptional()
  OPENWEARABLES_API_URL?: string;

  @IsString()
  @IsOptional()
  OPENWEARABLES_API_KEY?: string;

  // RunSignUp API (Race Calendar)

  @IsString()
  @IsOptional()
  RUNSIGNUP_API_KEY?: string;

  // ACTIVE Network API

  @IsString()
  @IsOptional()
  ACTIVE_API_KEY?: string;

  // TrainingPeaks Integration

  @IsString()
  @IsOptional()
  TRAININGPEAKS_CLIENT_ID?: string;

  @IsString()
  @IsOptional()
  TRAININGPEAKS_CLIENT_SECRET?: string;

  @IsString()
  @IsOptional()
  TRAININGPEAKS_REDIRECT_URI?: string;

  // World Triathlon API

  @IsString()
  @IsOptional()
  WORLD_TRIATHLON_API_KEY?: string;

  // OpenTrack API

  @IsString()
  @IsOptional()
  OPENTRACK_API_KEY?: string;

  // OpenWeather API (Race Weather Forecasts)

  @IsString()
  @IsOptional()
  OPENWEATHER_API_KEY?: string;

  static validate(config: Record<string, unknown>) {
    const validatedConfig = plainToInstance(Env, config, {
      enableImplicitConversion: true,
    });
    const errors = validateSync(validatedConfig, {
      skipMissingProperties: false,
    });
    if (errors.length > 0) {
      throw new Error(errors.toString());
    }

    // The JWT secrets default to their own variable name in .env.example, which
    // means any env that forgot to override them would boot with forgeable
    // tokens. Also bail if they're trivially short. Skip the check when the
    // extract-openapi script or similar helper sets OPENAPI_EXTRACT=true —
    // those only need the Env object to type-check.
    if (process.env.OPENAPI_EXTRACT !== 'true') {
      assertJwtSecretStrong('JWT_ACCESS_TOKEN_SECRET', validatedConfig.JWT_ACCESS_TOKEN_SECRET);
      assertJwtSecretStrong('JWT_REFRESH_TOKEN_SECRET', validatedConfig.JWT_REFRESH_TOKEN_SECRET);
    }

    return validatedConfig;
  }
}

function assertJwtSecretStrong(name: string, value: string): void {
  if (value === name) {
    throw new Error(
      `${name} is set to the placeholder value "${name}". Generate a real secret: openssl rand -base64 32 | tr -d /=+ | cut -c -32`,
    );
  }
  if (value.length < 32) {
    throw new Error(
      `${name} is only ${value.length} chars; must be at least 32. Generate one with: openssl rand -base64 32 | tr -d /=+ | cut -c -32`,
    );
  }
}

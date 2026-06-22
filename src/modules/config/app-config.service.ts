import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Env } from 'src/env';

@Injectable()
export class AppConfigService {
  constructor(private readonly configService: ConfigService<Env>) {}

  // API URL

  get apiV1URL(): string {
    return this.configService.get('API_V1_URL')!;
  }

  // Auth

  get jwtAccessTokenSecret(): string {
    return this.configService.get('JWT_ACCESS_TOKEN_SECRET')!;
  }

  get jwtAccessTokenExpiry(): string {
    return this.configService.get('JWT_ACCESS_TOKEN_EXPIRY')!;
  }

  get jwtRefreshTokenSecret(): string {
    return this.configService.get('JWT_REFRESH_TOKEN_SECRET')!;
  }

  get jwtRefreshTokenExpiry(): string | undefined {
    return this.configService.get('JWT_REFRESH_TOKEN_EXPIRY');
  }

  // Database

  get dbHost(): string {
    return this.configService.get('DB_HOST')!;
  }

  get dbPort(): number {
    return this.configService.get('DB_PORT')!;
  }

  get dbUser(): string {
    return this.configService.get('DB_USER')!;
  }

  get dbPassword(): string {
    return this.configService.get('DB_PASSWORD')!;
  }

  get dbName(): string {
    return this.configService.get('DB_NAME')!;
  }

  get dbSSL(): boolean {
    return this.configService.get('DB_SSL') === 'Y';
  }

  get rlsEnabled(): boolean {
    return this.configService.get('RLS_ENABLED') === 'Y';
  }

  // AWS

  get awsAccessKey(): string {
    return this.configService.get('AWS_ACCESS_KEY')!;
  }

  get awsSecretKey(): string {
    return this.configService.get('AWS_SECRET_KEY')!;
  }

  // S3

  get s3Endpoint(): string | undefined {
    return this.configService.get('S3_ENDPOINT');
  }

  get s3Region(): string {
    return this.configService.get('S3_REGION')!;
  }

  get s3UploadBucket(): string {
    return this.configService.get('S3_UPLOAD_BUCKET')!;
  }

  get s3ContentBucket(): string {
    return this.configService.get('S3_CONTENT_BUCKET')!;
  }

  // Vimeo

  get vimeoAccessToken(): string | undefined {
    return this.configService.get('VIMEO_ACCESS_TOKEN');
  }

  // Stripe — Phase 9 (Connect Express + subscriptions)

  /** Platform-level secret API key (sk_test_… or sk_live_…). Required to issue any Stripe call. */
  get stripeSecretKey(): string | undefined {
    return this.configService.get('STRIPE_SECRET_KEY');
  }

  /** Endpoint signing secret (whsec_…) for the Connect webhook. */
  get stripeWebhookSecret(): string | undefined {
    return this.configService.get('STRIPE_WEBHOOK_SECRET');
  }

  /**
   * Base URL the platform's own pages live at. Used for the Connect onboarding
   * `return_url` / `refresh_url`. Falls back to apiV1URL if unset.
   */
  get stripeReturnUrlBase(): string {
    return (
      this.configService.get<string>('STRIPE_RETURN_URL_BASE') ??
      this.configService.get<string>('CLIENT_URL') ??
      this.apiV1URL
    );
  }

  // Swagger

  get swaggerUsername(): string | undefined {
    return this.configService.get('SWAGGER_USERNAME');
  }

  get swaggerPassword(): string | undefined {
    return this.configService.get('SWAGGER_PASSWORD');
  }

  // CDN

  get cdnUrl(): string {
    return this.configService.get('CDN_URL')!;
  }

  get disableCdn(): boolean {
    return this.configService.get('DISABLE_CDN') === 'Y';
  }

  /**
   * Build a public-readable URL for a content-bucket key.
   *
   * Two deployment shapes:
   *
   *  - **Production CloudFront** — `cdnUrl` is the CloudFront
   *    distribution that maps directly to the content bucket as its
   *    origin, so the URL is `{cdnUrl}/{key}` (no bucket name in the
   *    path; CloudFront resolves it origin-side).
   *
   *  - **Local MinIO** (`DISABLE_CDN=Y`) — `cdnUrl` is the MinIO
   *    endpoint root (e.g. `http://localhost:9002`), and MinIO serves
   *    objects with path-style URLs `{host}/{bucket}/{key}`. We need
   *    to prepend the content bucket name explicitly so the URL
   *    resolves.
   *
   * Centralising the choice here means every caller that wants a
   * public asset URL gets the right shape automatically — historically
   * the inline `${cdnUrl}/${key}` interpolation was correct for prod
   * but 404'd in dev because the bucket prefix was missing.
   */
  publicContentUrl(key: string): string {
    if (this.disableCdn) {
      return `${this.cdnUrl}/${this.s3ContentBucket}/${key}`;
    }
    return `${this.cdnUrl}/${key}`;
  }

  // CloudFront

  get cloudFrontKeyPairId(): string | undefined {
    return this.configService.get('CLOUDFRONT_KEY_PAIR_ID');
  }

  get cloudFrontPrivateKey(): string | undefined {
    return this.configService.get('CLOUDFRONT_PRIVATE_KEY');
  }

  get isCloudFrontSigningEnabled(): boolean {
    return !!(this.cloudFrontKeyPairId && this.cloudFrontPrivateKey);
  }

  // Firebase

  get firebaseProjectId(): string {
    return this.configService.get('FIREBASE_PROJECT_ID')!;
  }

  get firebaseClientEmail(): string {
    return this.configService.get('FIREBASE_CLIENT_EMAIL')!;
  }

  get firebasePrivateKey(): string {
    return this.configService.get('FIREBASE_PRIVATE_KEY')!;
  }

  // SendGrid email

  get sendgridApiKey(): string | undefined {
    return this.configService.get('SENDGRID_API_KEY');
  }

  get emailFrom(): string | undefined {
    return this.configService.get('EMAIL_FROM');
  }

  get emailFromName(): string | undefined {
    return this.configService.get('EMAIL_FROM_NAME');
  }

  // MediaConvert

  get mediaConvertRegion(): string {
    return this.configService.get('MEDIA_CONVERT_REGION') ?? this.s3Region;
  }

  get mediaConvertRole(): string {
    return this.configService.get('MEDIA_CONVERT_ROLE') ?? '';
  }

  get mediaConvertQueue(): string {
    return this.configService.get('MEDIA_CONVERT_QUEUE') ?? '';
  }

  get disableMediaConvert(): boolean {
    return this.configService.get('DISABLE_MEDIA_CONVERT') === 'Y';
  }

  /**
   * Opt-in Rekognition body-detect smart crop for cross-orientation
   * renditions. Off by default — when disabled the encoder letterboxes.
   */
  get enableSmartCrop(): boolean {
    return this.configService.get('ENABLE_SMART_CROP') === 'Y';
  }

  /**
   * Local ffmpeg transcode in place of MediaConvert (local-dev stand-in).
   * Off by default.
   */
  get enableLocalTranscode(): boolean {
    return this.configService.get('ENABLE_LOCAL_TRANSCODE') === 'Y';
  }

  // Content translation pipeline

  /**
   * AWS Translate opt-in (machine translation of voice-over scripts +
   * transcripts). Off by default — when off, the translate endpoints
   * return 503. Uses the same AWS credentials as S3/MediaConvert.
   */
  get enableAwsTranslate(): boolean {
    return this.configService.get('ENABLE_AWS_TRANSLATE') === 'Y';
  }

  /**
   * ElevenLabs API key for the Scribe speech-to-text model (Layer 1) AND
   * the cloned-voice dub (Layer 2). Speech-to-text is enabled whenever
   * this is present; absent until the org provisions it.
   */
  get elevenLabsApiKey(): string | undefined {
    return this.configService.get('ELEVENLABS_API_KEY');
  }

  /** ElevenLabs Scribe STT model id. */
  get elevenLabsSttModel(): string {
    return this.configService.get('ELEVENLABS_STT_MODEL') || 'scribe_v1';
  }

  /** ElevenLabs TTS model for the dub — multilingual so it speaks any target language. */
  get elevenLabsTtsModel(): string {
    return this.configService.get('ELEVENLABS_TTS_MODEL') || 'eleven_multilingual_v2';
  }

  /** Fallback dub voice when a coach hasn't enrolled their own cloned voice. */
  get elevenLabsDefaultVoiceId(): string | undefined {
    return this.configService.get('ELEVENLABS_DEFAULT_VOICE_ID');
  }

  /** How the local transcode fills the 16:9 frame: 'crop' or 'pad' (default). */
  get localTranscodeWideMode(): 'pad' | 'crop' {
    return this.configService.get('LOCAL_TRANSCODE_WIDE_MODE') === 'crop' ? 'crop' : 'pad';
  }

  // Generic getter for optional config

  get<K extends keyof Env>(key: K): Env[K] | undefined {
    return this.configService.get(key);
  }

  // Garmin

  get garminConsumerKey(): string | undefined {
    return this.configService.get('GARMIN_CONSUMER_KEY');
  }

  get garminConsumerSecret(): string | undefined {
    return this.configService.get('GARMIN_CONSUMER_SECRET');
  }

  get garminRedirectUri(): string | undefined {
    return this.configService.get('GARMIN_REDIRECT_URI');
  }

  // CORS

  get corsOrigins(): string[] {
    const origins = this.configService.get('CORS_ORIGINS');
    if (!origins) {
      // Default to restrictive policy in production
      return [];
    }
    return origins.split(',').map((origin: string) => origin.trim());
  }

  // OpenWearables

  get openwearablesApiUrl(): string {
    return this.configService.get('OPENWEARABLES_API_URL') || 'http://localhost:8000/api/v1';
  }

  get openwearablesApiKey(): string | undefined {
    return this.configService.get('OPENWEARABLES_API_KEY');
  }

}

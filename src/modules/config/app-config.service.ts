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

  // RunSignUp API (Race Calendar)

  get runsignupApiKey(): string | undefined {
    return this.configService.get('RUNSIGNUP_API_KEY');
  }

  // ACTIVE Network API

  get activeApiKey(): string | undefined {
    return this.configService.get('ACTIVE_API_KEY');
  }

  // World Triathlon API

  get worldTriathlonApiKey(): string | undefined {
    return this.configService.get('WORLD_TRIATHLON_API_KEY');
  }

  // OpenTrack API

  get opentrackApiKey(): string | undefined {
    return this.configService.get('OPENTRACK_API_KEY');
  }
}

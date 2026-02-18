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

  // AWS

  @IsString()
  AWS_ACCESS_KEY: string;

  @IsString()
  AWS_SECRET_KEY: string;

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

  // Swagger

  @IsString()
  SWAGGER_USERNAME: string;

  @IsString()
  SWAGGER_PASSWORD: string;

  // CDN

  @IsString()
  CDN_URL: string;

  @IsString()
  @Matches('^Y|N$', 'i')
  DISABLE_CDN: string;

  // CloudFront

  @IsString()
  CLOUDFRONT_KEY_PAIR_ID: string;

  @IsString()
  CLOUDFRONT_PRIVATE_KEY: string;

  // Firebase

  @IsString()
  FIREBASE_PROJECT_ID: string;

  @IsString()
  FIREBASE_CLIENT_EMAIL: string;

  @IsString()
  FIREBASE_PRIVATE_KEY: string;

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

  // Strava Integration

  @IsString()
  STRAVA_CLIENT_ID: string;

  @IsString()
  STRAVA_CLIENT_SECRET: string;

  @IsString()
  STRAVA_REDIRECT_URI: string;

  @IsString()
  STRAVA_WEBHOOK_VERIFY_TOKEN: string;

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

  // Google Maps

  @IsString()
  GOOGLE_MAPS_API_KEY: string;

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
    return validatedConfig;
  }
}

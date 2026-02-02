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
}

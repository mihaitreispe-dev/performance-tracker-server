import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsInt, IsObject, IsOptional, IsString, IsUUID, ValidateNested } from 'class-validator';
import { IntegrationProvider } from 'src/database/interfaces';
import { ItemResponse } from 'src/lib/http/dto/item-response.dto';
import { PageResponse } from 'src/lib/http/dto/page-response.dto';
import { IsEnumString } from 'src/lib/validators/is-enum-string';

export class OAuthUrlResponse {
  @ApiProperty({ description: 'URL to redirect user to for OAuth authorization' })
  @IsString()
  authUrl: string;
}

export class UserIntegrationDTO {
  @ApiProperty()
  @IsUUID()
  id: string;

  @ApiProperty()
  @IsUUID()
  userId: string;

  @ApiProperty({ enum: IntegrationProvider })
  @IsEnumString(IntegrationProvider)
  provider: IntegrationProvider;

  @ApiPropertyOptional({ type: String })
  @IsString()
  @IsOptional()
  externalUserId?: string | null;

  @ApiProperty()
  @IsBoolean()
  isActive: boolean;

  @ApiPropertyOptional({ type: String })
  @IsString()
  @IsOptional()
  lastSyncAt?: string | null;

  @ApiProperty()
  @IsString()
  createdAt: string;

  @ApiProperty()
  @IsString()
  updatedAt: string;
}

export class UserIntegrationResponse extends ItemResponse<UserIntegrationDTO> {
  @ApiProperty()
  @IsObject({ always: true })
  @ValidateNested()
  declare data: UserIntegrationDTO;
}

export class UserIntegrationListResponse extends PageResponse<UserIntegrationDTO> {
  @ApiProperty({ type: [UserIntegrationDTO] })
  @IsArray({ always: true })
  @ValidateNested()
  declare data: UserIntegrationDTO[];
}

export class StravaWebhookVerifyResponse {
  @ApiProperty({ description: 'Hub challenge echoed back' })
  'hub.challenge': string;
}

export class WebhookAckResponse {
  @ApiProperty()
  @IsString()
  status: string;
}

export class StravaSyncResultDTO {
  @ApiProperty({ description: 'Total number of activities found in Strava' })
  @IsInt()
  totalActivities: number;

  @ApiProperty({ description: 'Number of activities successfully synced' })
  @IsInt()
  syncedCount: number;

  @ApiProperty({ description: 'Number of activities skipped (already synced)' })
  @IsInt()
  skippedCount: number;

  @ApiProperty({ description: 'Number of activities that failed to sync' })
  @IsInt()
  failedCount: number;

  @ApiProperty({
    description: 'Overall sync status',
    enum: ['completed', 'error'],
  })
  @IsString()
  status: 'completed' | 'error';
}

export class StravaSyncResponse extends ItemResponse<StravaSyncResultDTO> {
  @ApiProperty({ type: StravaSyncResultDTO })
  @IsObject({ always: true })
  @ValidateNested()
  declare data: StravaSyncResultDTO;
}

export class PushToStravaResultDTO {
  @ApiProperty({ description: 'Whether the push was successful' })
  success: boolean;

  @ApiProperty({ description: 'The Strava activity ID if successful' })
  @IsOptional()
  stravaActivityId?: number;

  @ApiPropertyOptional({ description: 'Error message if failed' })
  @IsString()
  @IsOptional()
  error?: string;
}

export class PushToStravaResponse extends ItemResponse<PushToStravaResultDTO> {
  @ApiProperty({ type: PushToStravaResultDTO })
  @IsObject({ always: true })
  @ValidateNested()
  declare data: PushToStravaResultDTO;
}

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { WearableDataCategory, WearableProvider } from 'src/database/interfaces';

export class WearableProviderInfoDto {
  @ApiProperty({ enum: WearableProvider })
  provider: WearableProvider;

  @ApiProperty({ type: [String], enum: WearableDataCategory })
  capabilities: WearableDataCategory[];

  @ApiProperty()
  displayName: string;
}

export class AvailableProvidersResponse {
  @ApiProperty({ type: [WearableProviderInfoDto] })
  providers: WearableProviderInfoDto[];
}

export class WearableConnectionDto {
  @ApiProperty()
  id: string;

  @ApiProperty({ enum: WearableProvider })
  provider: WearableProvider;

  @ApiProperty()
  isActive: boolean;

  @ApiProperty({ type: [String], enum: WearableDataCategory })
  supportedCategories: WearableDataCategory[];

  @ApiPropertyOptional()
  connectedAt?: Date;

  @ApiPropertyOptional()
  lastSyncAt?: Date;

  @ApiPropertyOptional()
  lastSyncStatus?: string;

  @ApiPropertyOptional()
  lastSyncError?: string;
}

export class UserConnectionsResponse {
  @ApiProperty({ type: [WearableConnectionDto] })
  connections: WearableConnectionDto[];
}

export class ConnectProviderResponse {
  @ApiProperty({ description: 'OAuth URL to redirect user to' })
  authUrl: string;
}

export class WearableCallbackResponse {
  @ApiProperty()
  success: boolean;

  @ApiPropertyOptional({ enum: WearableProvider })
  provider?: WearableProvider;

  @ApiPropertyOptional()
  error?: string;
}

export class ProviderPriorityDto {
  @ApiProperty({ enum: WearableProvider })
  provider: WearableProvider;

  @ApiProperty()
  priority: number;
}

export class CategoryPrioritiesDto {
  @ApiProperty({ enum: WearableDataCategory })
  category: WearableDataCategory;

  @ApiProperty({ type: [ProviderPriorityDto] })
  priorities: ProviderPriorityDto[];
}

export class UserPrioritiesResponse {
  @ApiProperty({ type: [CategoryPrioritiesDto] })
  categories: CategoryPrioritiesDto[];
}

export class SetPrioritiesResponse {
  @ApiProperty()
  success: boolean;
}

export class SyncResultDto {
  @ApiProperty()
  synced: number;

  @ApiProperty()
  errors: number;
}

export class TriggerSyncResponse {
  @ApiProperty()
  success: boolean;

  @ApiProperty({ type: SyncResultDto })
  workouts: SyncResultDto;

  @ApiProperty({ type: SyncResultDto })
  sleep: SyncResultDto;

  @ApiProperty({ type: SyncResultDto })
  healthMetrics: SyncResultDto;

  @ApiProperty({ type: SyncResultDto })
  activity: SyncResultDto;
}

export class WearableSyncStatusDto {
  @ApiProperty({ enum: WearableProvider })
  provider: WearableProvider;

  @ApiPropertyOptional()
  lastSyncAt?: Date;

  @ApiPropertyOptional()
  lastSyncStatus?: string;

  @ApiPropertyOptional()
  lastSyncError?: string;
}

export class SyncStatusResponse {
  @ApiProperty({ type: [WearableSyncStatusDto] })
  providers: WearableSyncStatusDto[];
}

export class DailyActivityDto {
  @ApiProperty()
  date: string;

  @ApiPropertyOptional()
  steps?: number;

  @ApiPropertyOptional()
  activeCalories?: number;

  @ApiPropertyOptional()
  distance?: number;

  @ApiPropertyOptional({ enum: WearableProvider })
  provider?: WearableProvider;
}

export class ActivityMetricsResponse {
  @ApiProperty({ type: [DailyActivityDto] })
  data: DailyActivityDto[];
}

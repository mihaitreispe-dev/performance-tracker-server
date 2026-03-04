import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsEnum, IsInt, IsOptional, IsString, Min, ValidateNested } from 'class-validator';
import { WearableDataCategory, WearableProvider } from 'src/database/interfaces';

export class ConnectProviderQuery {
  @ApiProperty({ enum: WearableProvider, description: 'Wearable provider to connect' })
  @IsEnum(WearableProvider)
  provider: WearableProvider;
}

export class WearableCallbackQuery {
  @ApiProperty({ description: 'OAuth state parameter' })
  @IsString()
  state: string;

  @ApiPropertyOptional({ description: 'OAuth authorization code' })
  @IsOptional()
  @IsString()
  code?: string;

  @ApiPropertyOptional({ description: 'OAuth error' })
  @IsOptional()
  @IsString()
  error?: string;
}

export class SetPriorityItemDto {
  @ApiProperty({ enum: WearableProvider })
  @IsEnum(WearableProvider)
  provider: WearableProvider;

  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  priority: number;
}

export class SetPrioritiesBody {
  @ApiProperty({ enum: WearableDataCategory })
  @IsEnum(WearableDataCategory)
  category: WearableDataCategory;

  @ApiProperty({ type: [SetPriorityItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SetPriorityItemDto)
  priorities: SetPriorityItemDto[];
}

export class TriggerSyncBody {
  @ApiPropertyOptional({ enum: WearableProvider, description: 'Specific provider to sync (optional)' })
  @IsOptional()
  @IsEnum(WearableProvider)
  provider?: WearableProvider;

  @ApiPropertyOptional({ description: 'Number of days to sync back', default: 7 })
  @IsOptional()
  @IsInt()
  @Min(1)
  daysBack?: number;
}

export class DisconnectProviderParams {
  @ApiProperty({ enum: WearableProvider })
  @IsEnum(WearableProvider)
  provider: WearableProvider;
}

export class GetActivityMetricsQuery {
  @ApiPropertyOptional({ description: 'Start date (YYYY-MM-DD)' })
  @IsOptional()
  @IsString()
  dateFrom?: string;

  @ApiPropertyOptional({ description: 'End date (YYYY-MM-DD)' })
  @IsOptional()
  @IsString()
  dateTo?: string;
}

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsNumber, IsOptional, IsString, Max, Min, ValidateNested } from 'class-validator';
import { IsEnumString } from 'src/lib/validators/is-enum-string';

import { GrantType } from './types';

export class CreateTokensQuery {
  @ApiProperty({
    enum: GrantType,
    example: GrantType.firebase,
  })
  @IsEnumString(GrantType)
  grantType: GrantType;
}

export class CreateTokensBody {
  @ApiPropertyOptional({ type: String, description: 'Firebase idToken when grantType = firebase' })
  @IsString()
  @IsOptional()
  idToken?: string;

  @ApiPropertyOptional({ type: String, description: 'Firebase FCM device token when grantType = firebase' })
  @IsString()
  @IsOptional()
  fcmToken?: string;

  @ApiPropertyOptional({ type: String, description: 'refreshToken when grantType = refreshToken' })
  @IsString()
  @IsOptional()
  refreshToken?: string;

  @ApiPropertyOptional({ type: String, description: 'Firebase display name' })
  @IsString()
  @IsOptional()
  displayName?: string;

  @ApiPropertyOptional({ type: String, description: 'Jury creator code for assessment client registration' })
  @IsString()
  @IsOptional()
  juryCreatorCode?: string;
}

export class UpdateUserBody {
  @ApiPropertyOptional({ type: String, description: 'First name' })
  @IsString()
  @IsOptional()
  firstName?: string;

  @ApiPropertyOptional({ type: String, description: 'Last name' })
  @IsString()
  @IsOptional()
  lastName?: string;

  @ApiPropertyOptional({ type: String, description: 'S3 key for uploaded profile picture' })
  @IsString()
  @IsOptional()
  pictureS3Key?: string;
}

export class RevokeTokensBody {
  @ApiProperty({ description: 'refreshToken' })
  @IsString()
  refreshToken: string;

  @ApiPropertyOptional({ type: String, description: 'Firebase FCM device token to unregister on logout' })
  @IsString()
  @IsOptional()
  fcmToken?: string;
}

// HR Zones Configuration

export class HRZoneConfigInput {
  @ApiProperty({ description: 'Zone number (1-5)' })
  @IsNumber()
  @Min(1)
  @Max(5)
  zone: number;

  @ApiProperty({ description: 'Zone name (e.g., Recovery, Aerobic)' })
  @IsString()
  name: string;

  @ApiProperty({ description: 'Minimum percentage of max HR' })
  @IsNumber()
  @Min(0)
  @Max(100)
  minPct: number;

  @ApiProperty({ description: 'Maximum percentage of max HR' })
  @IsNumber()
  @Min(0)
  @Max(100)
  maxPct: number;
}

export class HRZonesSettingsInput {
  @ApiProperty({ description: 'Maximum heart rate' })
  @IsNumber()
  @Min(100)
  @Max(250)
  maxHr: number;

  @ApiProperty({ type: [HRZoneConfigInput], description: 'Heart rate zone configurations' })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => HRZoneConfigInput)
  zones: HRZoneConfigInput[];
}

export class UpdateUserSettingsBody {
  @ApiPropertyOptional({ type: HRZonesSettingsInput, description: 'Heart rate zones configuration' })
  @ValidateNested()
  @Type(() => HRZonesSettingsInput)
  @IsOptional()
  hrZones?: HRZonesSettingsInput | null;
}

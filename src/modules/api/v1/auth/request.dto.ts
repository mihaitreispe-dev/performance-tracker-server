import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsNumber, IsOptional, IsString, Max, Min, ValidateNested } from 'class-validator';
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
  @ApiProperty({ description: 'Zone number (1-7)' })
  @IsNumber()
  @Min(1)
  @Max(7)
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

// Training Zone (used by Power, Pace, RPE)

export class TrainingZoneInput {
  @ApiProperty({ description: 'Zone number (1-7)' })
  @IsNumber()
  @Min(1)
  @Max(7)
  zone: number;

  @ApiProperty({ description: 'Zone name (e.g., Recovery, Tempo)' })
  @IsString()
  name: string;

  @ApiProperty({ description: 'Minimum value (absolute units)' })
  @IsNumber()
  @Min(0)
  minValue: number;

  @ApiProperty({ description: 'Maximum value (absolute units)' })
  @IsNumber()
  @Min(0)
  maxValue: number;

  @ApiPropertyOptional({ type: String, description: 'Optional custom color' })
  @IsString()
  @IsOptional()
  color?: string;
}

// Power Zones Configuration

export class PowerZonesSettingsInput {
  @ApiProperty({ description: 'Functional Threshold Power (FTP) in watts' })
  @IsNumber()
  @Min(50)
  @Max(1000)
  ftp: number;

  @ApiProperty({ type: [TrainingZoneInput], description: 'Power zone configurations (values as % of FTP)' })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TrainingZoneInput)
  zones: TrainingZoneInput[];
}

// Pace Zones Configuration

export class PaceZonesSettingsInput {
  @ApiProperty({ description: 'Threshold pace in seconds per km' })
  @IsNumber()
  @Min(60)
  @Max(1200)
  thresholdPace: number;

  @ApiProperty({ type: [TrainingZoneInput], description: 'Pace zone configurations (values as % of threshold)' })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TrainingZoneInput)
  zones: TrainingZoneInput[];
}

// RPE Zones Configuration

export class RPEZonesSettingsInput {
  @ApiProperty({ type: [TrainingZoneInput], description: 'RPE zone configurations (values are direct 1-10 scale)' })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TrainingZoneInput)
  zones: TrainingZoneInput[];
}

export class UpdateUserSettingsBody {
  @ApiPropertyOptional({ type: HRZonesSettingsInput, description: 'Heart rate zones configuration' })
  @ValidateNested()
  @Type(() => HRZonesSettingsInput)
  @IsOptional()
  hrZones?: HRZonesSettingsInput | null;

  @ApiPropertyOptional({ type: PowerZonesSettingsInput, description: 'Power zones configuration' })
  @ValidateNested()
  @Type(() => PowerZonesSettingsInput)
  @IsOptional()
  powerZones?: PowerZonesSettingsInput | null;

  @ApiPropertyOptional({ type: PaceZonesSettingsInput, description: 'Pace zones configuration' })
  @ValidateNested()
  @Type(() => PaceZonesSettingsInput)
  @IsOptional()
  paceZones?: PaceZonesSettingsInput | null;

  @ApiPropertyOptional({ type: RPEZonesSettingsInput, description: 'RPE zones configuration' })
  @ValidateNested()
  @Type(() => RPEZonesSettingsInput)
  @IsOptional()
  rpeZones?: RPEZonesSettingsInput | null;

  /**
   * E5 social opt-in. Defaults FALSE — every social surface stays
   * hidden until the user explicitly opts in.
   */
  @ApiPropertyOptional({ type: Boolean, description: 'Opt in to leaderboards / cohorts / streak compares' })
  @IsBoolean()
  @IsOptional()
  leaderboardOptIn?: boolean;
}

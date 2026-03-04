import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsNumber, IsObject, IsOptional, IsString, IsUrl, IsUUID, ValidateNested } from 'class-validator';
import { UserRole } from 'src/database/interfaces';
import { ItemResponse } from 'src/lib/http/dto/item-response.dto';
import { IsEnumString } from 'src/lib/validators/is-enum-string';
import { TokenType } from 'src/modules/auth/types/token-type';

class AuthUserDTO {
  @ApiProperty()
  @IsUUID()
  id: string;

  @ApiProperty()
  @IsString()
  displayName: string;

  @ApiPropertyOptional({ type: String })
  @IsString()
  @IsOptional()
  firstName?: string | null;

  @ApiPropertyOptional({ type: String })
  @IsString()
  @IsOptional()
  lastName?: string | null;

  @ApiPropertyOptional({ type: String })
  @IsUrl()
  @IsOptional()
  picture?: string | null;

  @ApiProperty({ type: [String], enum: UserRole })
  @IsArray()
  @IsString({ each: true })
  roles: UserRole[];
}

class AuthSessionDTO {
  @ApiProperty()
  @IsString()
  accessToken: string;

  @ApiPropertyOptional({ type: Number })
  @IsString()
  @IsOptional()
  accessTokenExpiresIn?: number;

  @ApiProperty()
  @IsString()
  refreshToken: string;

  @ApiPropertyOptional({ type: Number })
  @IsString()
  @IsOptional()
  refreshTokenExpiresIn?: number | null;

  @ApiProperty({ enum: TokenType, example: TokenType.bearer })
  @IsEnumString(TokenType)
  tokenType: TokenType;

  @ApiProperty()
  @IsObject({ always: true })
  @ValidateNested()
  user: AuthUserDTO;
}
export class AuthSessionResponse extends ItemResponse<AuthSessionDTO> {
  @ApiProperty()
  @IsObject({ always: true })
  @ValidateNested()
  declare data: AuthSessionDTO;
}

export class AuthUserResponse extends ItemResponse<AuthUserDTO> {
  @ApiProperty()
  @IsObject({ always: true })
  @ValidateNested()
  declare data: AuthUserDTO;
}

class PictureUploadUrlDTO {
  @ApiProperty()
  @IsString()
  uploadUrl: string;

  @ApiProperty()
  @IsString()
  key: string;

  @ApiProperty()
  @IsString()
  bucket: string;
}

export class PictureUploadUrlResponse extends ItemResponse<PictureUploadUrlDTO> {
  @ApiProperty()
  @IsObject({ always: true })
  @ValidateNested()
  declare data: PictureUploadUrlDTO;
}

// User Settings DTOs

class HRZoneConfigDTO {
  @ApiProperty()
  @IsNumber()
  zone: number;

  @ApiProperty()
  @IsString()
  name: string;

  @ApiProperty()
  @IsNumber()
  minPct: number;

  @ApiProperty()
  @IsNumber()
  maxPct: number;
}

class HRZonesSettingsDTO {
  @ApiProperty()
  @IsNumber()
  maxHr: number;

  @ApiProperty({ type: [HRZoneConfigDTO] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => HRZoneConfigDTO)
  zones: HRZoneConfigDTO[];
}

// Training Zone DTO (used by Power, Pace, RPE)

class TrainingZoneDTO {
  @ApiProperty()
  @IsNumber()
  zone: number;

  @ApiProperty()
  @IsString()
  name: string;

  @ApiProperty()
  @IsNumber()
  minValue: number;

  @ApiProperty()
  @IsNumber()
  maxValue: number;

  @ApiPropertyOptional({ type: String })
  @IsString()
  @IsOptional()
  color?: string;
}

class PowerZonesSettingsDTO {
  @ApiProperty()
  @IsNumber()
  ftp: number;

  @ApiProperty({ type: [TrainingZoneDTO] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TrainingZoneDTO)
  zones: TrainingZoneDTO[];
}

class PaceZonesSettingsDTO {
  @ApiProperty()
  @IsNumber()
  thresholdPace: number;

  @ApiProperty({ type: [TrainingZoneDTO] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TrainingZoneDTO)
  zones: TrainingZoneDTO[];
}

class RPEZonesSettingsDTO {
  @ApiProperty({ type: [TrainingZoneDTO] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TrainingZoneDTO)
  zones: TrainingZoneDTO[];
}

class UserSettingsDTO {
  @ApiPropertyOptional({ type: HRZonesSettingsDTO, nullable: true })
  @IsObject()
  @ValidateNested()
  @Type(() => HRZonesSettingsDTO)
  @IsOptional()
  hrZones?: HRZonesSettingsDTO | null;

  @ApiPropertyOptional({ type: PowerZonesSettingsDTO, nullable: true })
  @IsObject()
  @ValidateNested()
  @Type(() => PowerZonesSettingsDTO)
  @IsOptional()
  powerZones?: PowerZonesSettingsDTO | null;

  @ApiPropertyOptional({ type: PaceZonesSettingsDTO, nullable: true })
  @IsObject()
  @ValidateNested()
  @Type(() => PaceZonesSettingsDTO)
  @IsOptional()
  paceZones?: PaceZonesSettingsDTO | null;

  @ApiPropertyOptional({ type: RPEZonesSettingsDTO, nullable: true })
  @IsObject()
  @ValidateNested()
  @Type(() => RPEZonesSettingsDTO)
  @IsOptional()
  rpeZones?: RPEZonesSettingsDTO | null;
}

export class UserSettingsResponse extends ItemResponse<UserSettingsDTO> {
  @ApiProperty()
  @IsObject({ always: true })
  @ValidateNested()
  declare data: UserSettingsDTO;
}

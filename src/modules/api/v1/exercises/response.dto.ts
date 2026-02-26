import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { ExerciseLevel, ExerciseStatus, ExerciseVisibility } from 'src/database/interfaces';
import { ItemResponse } from 'src/lib/http/dto/item-response.dto';
import { PageResponse } from 'src/lib/http/dto/page-response.dto';
import { IsEnumString } from 'src/lib/validators/is-enum-string';

export class MediaAssetDTO {
  @ApiProperty()
  @IsUrl()
  url: string;

  @ApiPropertyOptional({ type: String })
  @IsUrl()
  @IsOptional()
  poster?: string;

  @ApiPropertyOptional({ type: String })
  @IsUrl()
  @IsOptional()
  thumbnail?: string;

  @ApiProperty()
  @IsString()
  mimeType: string;
}

export class EquipmentDTO {
  @ApiProperty()
  @IsUUID()
  id: string;

  @ApiProperty()
  @IsString()
  name: string;
}

export class MuscleGroupDTO {
  @ApiProperty()
  @IsUUID()
  id: string;

  @ApiProperty()
  @IsString()
  name: string;

  @ApiPropertyOptional()
  @IsBoolean()
  @IsOptional()
  isPrimary?: boolean;
}

export class ExerciseImageDTO {
  @ApiProperty()
  @IsUUID()
  id: string;

  @ApiProperty()
  @IsUrl()
  url: string;

  @ApiProperty()
  position: number;
}

export class ExerciseDTO {
  @ApiProperty()
  @IsUUID()
  id: string;

  @ApiProperty()
  @IsString()
  name: string;

  @ApiPropertyOptional({ type: String })
  @IsString()
  @IsOptional()
  description?: string | null;

  @ApiProperty({ type: [String] })
  @IsArray()
  @IsString({ each: true })
  cues: string[];

  @ApiPropertyOptional({ type: String })
  @IsString()
  @IsOptional()
  category?: string | null;

  @ApiPropertyOptional({ enum: ExerciseLevel })
  @IsEnumString(ExerciseLevel)
  @IsOptional()
  level?: ExerciseLevel | null;

  @ApiProperty({ enum: ExerciseVisibility })
  @IsEnumString(ExerciseVisibility)
  visibility: ExerciseVisibility;

  @ApiProperty({ enum: ExerciseStatus })
  @IsEnumString(ExerciseStatus)
  status: ExerciseStatus;

  @ApiProperty()
  @IsUUID()
  userId: string;

  @ApiPropertyOptional({ type: String })
  @IsUrl()
  @IsOptional()
  picture?: string | null;

  @ApiProperty({ type: [ExerciseImageDTO] })
  @IsArray()
  @ValidateNested({ each: true })
  images: ExerciseImageDTO[];

  @ApiProperty({ type: [MediaAssetDTO] })
  @IsArray()
  @ValidateNested({ each: true })
  assets: MediaAssetDTO[];

  @ApiProperty({ type: [EquipmentDTO] })
  @IsArray()
  @ValidateNested({ each: true })
  equipment: EquipmentDTO[];

  @ApiProperty({ type: [MuscleGroupDTO] })
  @IsArray()
  @ValidateNested({ each: true })
  primaryMuscles: MuscleGroupDTO[];

  @ApiProperty({ type: [MuscleGroupDTO] })
  @IsArray()
  @ValidateNested({ each: true })
  secondaryMuscles: MuscleGroupDTO[];

  @ApiProperty()
  @IsString()
  createdAt: string;

  @ApiProperty()
  @IsString()
  updatedAt: string;
}

export class ExerciseResponse extends ItemResponse<ExerciseDTO> {
  @ApiProperty()
  @IsObject({ always: true })
  @ValidateNested()
  declare data: ExerciseDTO;
}

export class ExerciseListResponse extends PageResponse<ExerciseDTO> {
  @ApiProperty({ type: [ExerciseDTO] })
  @IsArray({ always: true })
  @ValidateNested()
  declare data: ExerciseDTO[];
}

class ExerciseUploadUrlDTO {
  @ApiProperty()
  @IsUrl()
  video: string;
}

export class ExerciseUploadUrlResponse extends ItemResponse<ExerciseUploadUrlDTO> {
  @ApiProperty()
  @IsObject({ always: true })
  @ValidateNested()
  declare data: ExerciseUploadUrlDTO;
}

export class ExerciseChainMemberDTO {
  @ApiProperty()
  @IsUUID()
  id: string;

  @ApiProperty()
  @IsString()
  name: string;

  @ApiPropertyOptional({ type: String })
  @IsString()
  @IsOptional()
  picture?: string | null;

  @ApiPropertyOptional({ enum: ExerciseLevel })
  @IsEnumString(ExerciseLevel)
  @IsOptional()
  level?: ExerciseLevel | null;

  @ApiProperty()
  @IsNumber()
  position: number;
}

export class ExerciseChainDTO {
  @ApiProperty()
  @IsUUID()
  chainId: string;

  @ApiProperty({ type: [ExerciseChainMemberDTO] })
  @IsArray()
  @ValidateNested({ each: true })
  members: ExerciseChainMemberDTO[];
}

export class ExerciseChainResponse extends ItemResponse<ExerciseChainDTO> {
  @ApiProperty()
  @IsObject({ always: true })
  @ValidateNested()
  declare data: ExerciseChainDTO;
}

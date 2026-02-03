import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsObject, IsOptional, IsString, IsUrl, IsUUID, ValidateNested } from 'class-validator';
import { ItemResponse } from 'src/lib/http/dto/item-response.dto';
import { PageResponse } from 'src/lib/http/dto/page-response.dto';
import { IsEnumString } from 'src/lib/validators/is-enum-string';
import { ExerciseStatus, ExerciseVisibility } from 'src/database/interfaces';

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

  @ApiProperty({ type: [MediaAssetDTO] })
  @IsArray()
  @ValidateNested({ each: true })
  assets: MediaAssetDTO[];

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

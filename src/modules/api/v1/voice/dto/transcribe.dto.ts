import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsObject, IsOptional, IsString, ValidateNested } from 'class-validator';
import { ItemResponse } from 'src/lib/http/dto/item-response.dto';

// Request DTO - audio is sent as multipart/form-data, this is for validation reference
export class TranscribeQuery {
  @ApiPropertyOptional({ description: 'Language hint for transcription (e.g., "en", "es")' })
  @IsString()
  @IsOptional()
  language?: string;
}

// Response DTOs
export class TranscriptionDTO {
  @ApiProperty({ description: 'Transcribed text from audio' })
  @IsString()
  text: string;

  @ApiPropertyOptional({ description: 'Detected language code' })
  @IsString()
  @IsOptional()
  detectedLanguage?: string;

  @ApiPropertyOptional({ description: 'Confidence score (0.0-1.0)' })
  @IsOptional()
  confidence?: number;
}

export class TranscribeResponse extends ItemResponse<TranscriptionDTO> {
  @ApiProperty()
  @IsObject({ always: true })
  @ValidateNested()
  declare data: TranscriptionDTO;
}

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsObject, IsOptional, IsString, ValidateNested } from 'class-validator';
import { ItemResponse } from 'src/lib/http/dto/item-response.dto';

import { VoiceIntentType } from './parse-intent.dto';

// Request DTOs
export class GenerateResponseBody {
  @ApiProperty({ description: 'The intent that was executed', enum: VoiceIntentType })
  @IsString()
  intent: VoiceIntentType;

  @ApiProperty({ description: 'The API response data to convert to natural language' })
  @IsObject()
  apiResponse: Record<string, unknown>;

  @ApiPropertyOptional({ description: 'Original user query for context' })
  @IsString()
  @IsOptional()
  originalQuery?: string;

  @ApiPropertyOptional({ description: 'Whether the action was successful' })
  @IsOptional()
  success?: boolean;

  @ApiPropertyOptional({ description: 'Error message if action failed' })
  @IsString()
  @IsOptional()
  errorMessage?: string;
}

// Response DTOs
export class GeneratedResponseDTO {
  @ApiProperty({ description: 'Natural language response to display to the user' })
  @IsString()
  message: string;

  @ApiPropertyOptional({ description: 'Suggested follow-up actions' })
  @IsOptional()
  suggestions?: string[];

  @ApiPropertyOptional({ description: 'Structured data for UI display (charts, cards, etc.)' })
  @IsOptional()
  displayData?: Record<string, unknown>;
}

export class GenerateResponseResponse extends ItemResponse<GeneratedResponseDTO> {
  @ApiProperty()
  @IsObject({ always: true })
  @ValidateNested()
  declare data: GeneratedResponseDTO;
}

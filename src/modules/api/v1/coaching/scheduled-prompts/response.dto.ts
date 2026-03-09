import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { ScheduledPromptType, ScheduleFrequency } from 'src/database/interfaces';
import { ItemResponse } from 'src/lib/http/dto/item-response.dto';

import { UserBasicDTO } from '../response.dto';

export class ScheduledPromptDTO {
  @ApiProperty()
  @IsUUID()
  id: string;

  @ApiProperty()
  @IsUUID()
  coachId: string;

  @ApiPropertyOptional({ type: String })
  @IsUUID()
  @IsOptional()
  athleteId?: string | null;

  @ApiPropertyOptional({ description: 'Target athlete details (if targeting specific athlete)' })
  @IsObject()
  @ValidateNested()
  @IsOptional()
  athlete?: UserBasicDTO | null;

  @ApiProperty({ enum: Object.values(ScheduledPromptType) })
  @IsIn(Object.values(ScheduledPromptType))
  promptType: ScheduledPromptType;

  @ApiProperty()
  @IsString()
  title: string;

  @ApiPropertyOptional({ type: String })
  @IsString()
  @IsOptional()
  message?: string | null;

  @ApiProperty({ enum: Object.values(ScheduleFrequency) })
  @IsIn(Object.values(ScheduleFrequency))
  frequency: ScheduleFrequency;

  @ApiPropertyOptional({ type: [Number] })
  @IsArray()
  @IsNumber({}, { each: true })
  @IsOptional()
  daysOfWeek?: number[] | null;

  @ApiProperty({ description: 'Time to send (HH:MM)' })
  @IsString()
  scheduledTime: string;

  @ApiProperty({ description: 'IANA timezone' })
  @IsString()
  timezone: string;

  @ApiProperty({ description: 'Start date (YYYY-MM-DD)' })
  @IsString()
  startDate: string;

  @ApiPropertyOptional({ description: 'End date (YYYY-MM-DD)', type: String })
  @IsString()
  @IsOptional()
  endDate?: string | null;

  @ApiProperty({ description: 'Next scheduled run time (ISO string)' })
  @IsString()
  nextRunAt: string;

  @ApiPropertyOptional({ description: 'Last sent time (ISO string)', type: String })
  @IsString()
  @IsOptional()
  lastSentAt?: string | null;

  @ApiProperty()
  @IsBoolean()
  enabled: boolean;

  @ApiProperty()
  @IsString()
  createdAt: string;

  @ApiProperty()
  @IsString()
  updatedAt: string;
}

export class ScheduledPromptResponse extends ItemResponse<ScheduledPromptDTO> {
  @ApiProperty()
  @IsObject({ always: true })
  @ValidateNested()
  declare data: ScheduledPromptDTO;
}

export class ScheduledPromptListResponse {
  @ApiProperty({ type: [ScheduledPromptDTO] })
  @IsArray()
  @ValidateNested({ each: true })
  data: ScheduledPromptDTO[];

  @ApiProperty()
  @IsNumber()
  total: number;
}

export class SendNowResultDTO {
  @ApiProperty({ description: 'Number of notifications sent' })
  @IsNumber()
  notificationsSent: number;

  @ApiProperty({ description: 'List of athlete IDs that received notifications' })
  @IsArray()
  @IsUUID('4', { each: true })
  athleteIds: string[];
}

export class SendNowResponse extends ItemResponse<SendNowResultDTO> {
  @ApiProperty()
  @IsObject({ always: true })
  @ValidateNested()
  declare data: SendNowResultDTO;
}

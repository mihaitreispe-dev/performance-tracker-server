import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsNumber, IsObject, IsOptional, IsString, IsUUID, ValidateNested } from 'class-validator';
import { ItemResponse } from 'src/lib/http/dto/item-response.dto';

export class NotificationDataDTO {
  @ApiPropertyOptional()
  @IsUUID()
  @IsOptional()
  athleteId?: string;

  @ApiPropertyOptional()
  @IsUUID()
  @IsOptional()
  coachId?: string;

  @ApiPropertyOptional()
  @IsUUID()
  @IsOptional()
  messageId?: string;

  @ApiPropertyOptional()
  @IsUUID()
  @IsOptional()
  workoutId?: string;

  @ApiPropertyOptional()
  @IsUUID()
  @IsOptional()
  workoutScheduleId?: string;

  @ApiPropertyOptional()
  @IsUUID()
  @IsOptional()
  relationshipId?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  workoutName?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  senderName?: string;
}

export class NotificationDTO {
  @ApiProperty()
  @IsUUID()
  id: string;

  @ApiProperty()
  @IsString()
  type: string;

  @ApiProperty()
  @IsString()
  title: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  body?: string | null;

  @ApiPropertyOptional()
  @IsObject()
  @IsOptional()
  data?: NotificationDataDTO | null;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  readAt?: string | null;

  @ApiProperty()
  @IsString()
  createdAt: string;
}

export class NotificationResponse extends ItemResponse<NotificationDTO> {
  @ApiProperty()
  @IsObject({ always: true })
  @ValidateNested()
  declare data: NotificationDTO;
}

export class NotificationsListResponse {
  @ApiProperty({ type: [NotificationDTO] })
  @IsArray()
  @ValidateNested({ each: true })
  data: NotificationDTO[];

  @ApiProperty()
  @IsNumber()
  unreadCount: number;

  @ApiProperty()
  @IsNumber()
  totalCount: number;
}

export class UnreadCountResponse {
  @ApiProperty()
  @IsNumber()
  unreadCount: number;
}

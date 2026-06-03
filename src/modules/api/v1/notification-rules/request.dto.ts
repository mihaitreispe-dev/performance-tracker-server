import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';

import { NotificationRuleTriggerType } from 'src/database/interfaces';

/**
 * Wire-shape for the audience filter JSONB blob. Validated loosely
 * (just `type` checked here) — the deeper shape lives in the
 * NotificationAudienceFilter union and the service treats unknown
 * shapes defensively.
 */
class AudienceFilterDto {
  @ApiProperty({
    enum: ['all_athletes', 'general_pop', 'one_to_one', 'specific', 'coach'],
  })
  @IsString()
  type: 'all_athletes' | 'general_pop' | 'one_to_one' | 'specific' | 'coach';

  @ApiPropertyOptional({ type: [String], description: 'Required when type=specific.' })
  @IsOptional()
  @IsArray()
  @IsUUID('all', { each: true })
  userIds?: string[];

  @ApiPropertyOptional({ description: 'Required when type=coach — the coach user id.' })
  @IsOptional()
  @IsUUID()
  coachId?: string;
}

export class CreateNotificationRuleBody {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @ApiProperty({ enum: NotificationRuleTriggerType })
  @IsEnum(NotificationRuleTriggerType)
  triggerType: NotificationRuleTriggerType;

  @ApiPropertyOptional({
    description: 'Standard 5-field cron expression. Required for recurring + daily-schedule.',
  })
  @ValidateIf((o: CreateNotificationRuleBody) =>
    o.triggerType === NotificationRuleTriggerType.RECURRING ||
    o.triggerType === NotificationRuleTriggerType.ON_DAILY_SCHEDULE,
  )
  @IsString()
  cronExpression?: string;

  @ApiPropertyOptional({ description: 'Event-filter JSON (action-completion trigger).' })
  @IsOptional()
  @IsObject()
  eventFilter?: Record<string, unknown>;

  @ApiPropertyOptional({ description: 'Condition params JSON (plan-adherence trigger).' })
  @IsOptional()
  @IsObject()
  conditionParams?: Record<string, unknown>;

  @ApiProperty({ type: AudienceFilterDto })
  @IsObject()
  audienceFilter: AudienceFilterDto;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  title: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  body: string;

  @ApiPropertyOptional({ description: 'Optional deep-link to open on tap (e.g. /library).' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  clickAction?: string;
}

export class UpdateNotificationRuleBody {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  cronExpression?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  eventFilter?: Record<string, unknown>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  conditionParams?: Record<string, unknown>;

  @ApiPropertyOptional({ type: AudienceFilterDto })
  @IsOptional()
  @IsObject()
  audienceFilter?: AudienceFilterDto;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  body?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  clickAction?: string;
}

export class NotificationRuleIdParam {
  @IsUUID()
  id: string;
}

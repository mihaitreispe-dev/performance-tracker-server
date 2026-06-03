import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { NotificationRuleTriggerType } from 'src/database/interfaces';

export class NotificationRuleDTO {
  @ApiProperty()
  id: string;

  @ApiProperty()
  organisationId: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  enabled: boolean;

  @ApiProperty({ enum: NotificationRuleTriggerType })
  triggerType: NotificationRuleTriggerType;

  @ApiPropertyOptional({ nullable: true })
  cronExpression: string | null;

  @ApiProperty({ type: 'object', additionalProperties: true })
  eventFilter: Record<string, unknown>;

  @ApiProperty({ type: 'object', additionalProperties: true })
  conditionParams: Record<string, unknown>;

  @ApiProperty({ type: 'object', additionalProperties: true })
  audienceFilter: Record<string, unknown>;

  @ApiProperty()
  title: string;

  @ApiProperty()
  body: string;

  @ApiPropertyOptional({ nullable: true })
  clickAction: string | null;

  @ApiProperty()
  createdAt: string;

  @ApiProperty()
  updatedAt: string;
}

export class NotificationRuleResponse {
  @ApiProperty({ type: NotificationRuleDTO })
  data: NotificationRuleDTO;
}

export class NotificationRuleListResponse {
  @ApiProperty({ type: [NotificationRuleDTO] })
  data: NotificationRuleDTO[];
}

export class NotificationDispatchResultDTO {
  @ApiProperty()
  delivered: number;

  @ApiProperty()
  deduped: number;

  @ApiProperty()
  failed: number;
}

export class NotificationDispatchResultResponse {
  @ApiProperty({ type: NotificationDispatchResultDTO })
  data: NotificationDispatchResultDTO;
}

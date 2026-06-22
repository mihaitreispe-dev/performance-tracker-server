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

  @ApiProperty({ enum: ['push', 'email'], isArray: true })
  channels: ('push' | 'email')[];

  @ApiProperty()
  title: string;

  @ApiProperty()
  body: string;

  @ApiPropertyOptional({ nullable: true })
  clickAction: string | null;

  @ApiPropertyOptional({ nullable: true })
  emailSubject: string | null;

  @ApiPropertyOptional({ nullable: true })
  emailBody: string | null;

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

/**
 * One row of the per-rule delivery audit log. The UI surfaces these
 * in a drawer so admins can verify a rule actually fired, see who it
 * reached, and inspect any per-recipient errors (FCM token expired,
 * external-app webhook 5xx, etc.).
 */
export class NotificationRuleDeliveryDTO {
  @ApiProperty()
  id: string;

  @ApiProperty()
  ruleId: string;

  @ApiProperty()
  userId: string;

  @ApiProperty()
  userDisplayName: string;

  @ApiProperty()
  userEmail: string;

  @ApiProperty()
  sentAt: string;

  @ApiProperty({ enum: ['fcm', 'external_app', 'email'] })
  route: 'fcm' | 'external_app' | 'email';

  @ApiProperty()
  ok: boolean;

  @ApiPropertyOptional({ nullable: true })
  error: string | null;
}

export class NotificationRuleDeliveriesResponse {
  @ApiProperty({ type: [NotificationRuleDeliveryDTO] })
  data: NotificationRuleDeliveryDTO[];
}

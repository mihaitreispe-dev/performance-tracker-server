import { ColumnType, Generated, Insertable, Selectable, Updateable } from 'kysely';

import { Timestamp } from './timestamp';

/**
 * Trigger taxonomy — what fires a notification rule. The engine
 * branches on this string to decide which evaluation path to walk
 * (cron tick, event listener, schedule-miss sweep, daily-digest).
 */
export enum NotificationRuleTriggerType {
  RECURRING = 'recurring',
  ON_ACTION_COMPLETION = 'on_action_completion',
  ON_PLAN_ADHERENCE = 'on_plan_adherence',
  ON_DAILY_SCHEDULE = 'on_daily_schedule',
}

/**
 * Audience-filter shape that lives in the `audience_filter` JSONB
 * column. Discriminated by `type`; the engine resolves each shape to
 * a concrete user-id list at fire time.
 */
export type NotificationAudienceFilter =
  | { type: 'all_athletes' }
  | { type: 'general_pop' }
  | { type: 'one_to_one' }
  | { type: 'specific'; userIds: string[] }
  | { type: 'coach'; coachId: string };

/**
 * Delivery channels a rule can fire on. `push` is the existing FCM /
 * external-app path (uses `title`/`body`); `email` sends via SendGrid (uses
 * `email_subject`/`email_body`). A rule may carry both.
 */
export type NotificationChannel = 'push' | 'email';

export interface NotificationRulesTable {
  id: Generated<string>;
  organisation_id: string;
  created_by_user_id: string;
  name: string;
  enabled: Generated<boolean>;
  trigger_type: NotificationRuleTriggerType;
  /** Required when trigger_type is 'recurring' or 'on_daily_schedule'. */
  cron_expression: string | null;
  event_filter: ColumnType<Record<string, unknown>, Record<string, unknown> | undefined, Record<string, unknown> | undefined>;
  condition_params: ColumnType<Record<string, unknown>, Record<string, unknown> | undefined, Record<string, unknown> | undefined>;
  audience_filter: ColumnType<NotificationAudienceFilter, NotificationAudienceFilter, NotificationAudienceFilter>;
  /** Channels this rule fires on. DB default ARRAY['push']. */
  channels: Generated<NotificationChannel[]>;
  /** Push notification text. */
  title: string;
  body: string;
  /** Optional deep-link (`/library`, `/workouts/uuid`) the client opens on tap. */
  click_action: string | null;
  /** Email content — required (NOT NULL enforced by CHECK) when 'email' is in channels. */
  email_subject: string | null;
  email_body: string | null;
  created_at: Generated<Timestamp>;
  updated_at: Generated<Timestamp>;
}

export type NotificationRule = Selectable<NotificationRulesTable>;
export type NewNotificationRule = Insertable<NotificationRulesTable>;
export type NotificationRuleUpdate = Updateable<NotificationRulesTable>;

// --- deliveries (append-only log) ----------------------------------

export type NotificationDeliveryRoute = 'fcm' | 'external_app' | 'email';

export interface NotificationRuleDeliveriesTable {
  id: Generated<string>;
  rule_id: string;
  user_id: string;
  organisation_id: string;
  sent_at: Generated<Timestamp>;
  route: NotificationDeliveryRoute;
  ok: boolean;
  error: string | null;
}

export type NotificationRuleDelivery = Selectable<NotificationRuleDeliveriesTable>;
export type NewNotificationRuleDelivery = Insertable<NotificationRuleDeliveriesTable>;

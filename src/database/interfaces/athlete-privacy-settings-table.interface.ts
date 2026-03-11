import { Generated, Insertable, Selectable, Updateable } from 'kysely';

export interface AthletePrivacySettingsTable {
  id: Generated<string>;
  user_id: string;
  share_workouts: Generated<boolean>;
  share_executions: Generated<boolean>;
  share_analytics: Generated<boolean>;
  share_calendar: Generated<boolean>;
  share_personal_records: Generated<boolean>;
  share_sleep_data: Generated<boolean>;
  share_training_load: Generated<boolean>;
  share_wellness_checkins: Generated<boolean>;
}

export type AthletePrivacySettings = Selectable<AthletePrivacySettingsTable>;
export type NewAthletePrivacySettings = Insertable<AthletePrivacySettingsTable>;
export type AthletePrivacySettingsUpdate = Updateable<AthletePrivacySettingsTable>;

import { ColumnType, Generated, Insertable, Selectable, Updateable } from 'kysely';

import { Timestamp } from './timestamp';

export enum UserRole {
  ADMIN = 'admin',
  USER = 'user',
  COACH = 'coach',
}

export interface UsersTable {
  id: Generated<string>;
  firebase_uid: string;
  email: string;
  display_name: string;
  first_name: string | null;
  last_name: string | null;
  picture_s3_bucket: string | null;
  picture_s3_key: string | null;
  provider: string;
  roles: ColumnType<UserRole[], UserRole[] | undefined, UserRole[]>;
  fcm_tokens: ColumnType<string[], string[] | undefined, string[]>;
  created_at: Generated<Timestamp>;
  updated_at: Generated<Timestamp>;
  last_sign_in_at: Timestamp | null;
  // Cloned-voice dub (translation feature). Consent is an explicit,
  // timestamped opt-in — the dub step won't clone a coach's voice
  // without it. `elevenlabs_voice_id` is the cloned-voice handle.
  voice_clone_consent_at: Timestamp | null;
  elevenlabs_voice_id: string | null;
}

export type User = Selectable<UsersTable>;
export type NewUser = Insertable<UsersTable>;
export type UserUpdate = Updateable<UsersTable>;

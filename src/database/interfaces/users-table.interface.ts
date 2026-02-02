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
}

export type User = Selectable<UsersTable>;
export type NewUser = Insertable<UsersTable>;
export type UserUpdate = Updateable<UsersTable>;

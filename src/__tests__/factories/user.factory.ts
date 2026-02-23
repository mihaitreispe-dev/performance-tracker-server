import { User, UserRole } from '../../database/interfaces';

let userCounter = 0;

export interface UserFactoryOptions {
  id?: string;
  firebaseUid?: string;
  email?: string;
  displayName?: string;
  firstName?: string | null;
  lastName?: string | null;
  roles?: UserRole[];
}

export function createUser(options: UserFactoryOptions = {}): User {
  userCounter++;
  const now = new Date().toISOString();

  return {
    id: options.id ?? `user-${userCounter}`,
    firebase_uid: options.firebaseUid ?? `firebase-uid-${userCounter}`,
    email: options.email ?? `user${userCounter}@test.com`,
    display_name: options.displayName ?? `Test User ${userCounter}`,
    first_name: options.firstName ?? 'Test',
    last_name: options.lastName ?? `User ${userCounter}`,
    picture_s3_bucket: null,
    picture_s3_key: null,
    provider: 'google',
    roles: options.roles ?? [UserRole.USER],
    fcm_tokens: [],
    created_at: now,
    updated_at: now,
    last_sign_in_at: now,
  };
}

export function createAdminUser(options: UserFactoryOptions = {}): User {
  return createUser({
    ...options,
    roles: [UserRole.ADMIN, UserRole.USER],
  });
}

export function createCoachUser(options: UserFactoryOptions = {}): User {
  return createUser({
    ...options,
    roles: [UserRole.COACH, UserRole.USER],
  });
}

export function resetUserCounter(): void {
  userCounter = 0;
}

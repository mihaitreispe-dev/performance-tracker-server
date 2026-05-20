/**
 * Catalogue of permissions a key can hold. Keep granular so a key issued to a
 * read-only consumer can't accidentally create athletes. New phases add to this
 * list; the admin UI surfaces them as a checkbox group when minting a key.
 */
export const API_KEY_SCOPES = [
  // Phase 1 — read consumption surface
  'workouts:read',
  'courses:read',
  'movement_snacks:read',
  'exercises:read',
  // Phase 2 — client onboarding
  'clients:read',
  'clients:create',
  // Phase 3 — questionnaires & generation
  'questionnaires:read',
  'questionnaires:write',
  'responses:write',
  'workouts:generate',
  // Phase 4 — hosted auth code grant
  'auth:exchange',
  // Phase 5 — athlete consumption + tracking
  'schedules:read',
  'executions:read',
  'executions:write',
  // Phase 6 — wellness + recovery logging
  'wellness:read',
  'wellness:write',
] as const;

export type ApiKeyScope = (typeof API_KEY_SCOPES)[number];

export function isApiKeyScope(value: string): value is ApiKeyScope {
  return (API_KEY_SCOPES as readonly string[]).includes(value);
}

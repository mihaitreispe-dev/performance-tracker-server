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
  // Phase 7 — cardio routes + GPS metric streams + weather
  'cardio:read',
  'cardio:write',
  // Phase 9 — billing / subscriptions for the org's clients
  'billing:read',
  'billing:write',
  // Phase 11 — rehabit white-label parity
  // plans:read     — read workout-plans (the WeekDay × WorkoutItem structures
  //                  athlete subscribes to). Previously JWT-only.
  // me:read        — read the currently-authed end-user's profile + org +
  //                  membership context. Lets a third-party app avoid round-
  //                  tripping through `/public/clients/:id` for every call.
  // entitlements:read — aggregate roll-up of "what products does this user own
  //                     and what resourceIds does that unlock". Avoids the
  //                     client having to walk the per-resource `lock` field
  //                     server returns on list endpoints to build an upsell
  //                     screen.
  // featured:read  — list resources currently inside their featured window
  //                  across workouts / snacks / courses / plans.
  // notifications:write — register / unregister an FCM device token from a
  //                       third-party client app boot.
  'plans:read',
  'me:read',
  'entitlements:read',
  'featured:read',
  'notifications:write',
] as const;

export type ApiKeyScope = (typeof API_KEY_SCOPES)[number];

export function isApiKeyScope(value: string): value is ApiKeyScope {
  return (API_KEY_SCOPES as readonly string[]).includes(value);
}

/**
 * Coach / back-office authoring scopes. These let a key create clients, author
 * questionnaires, or generate workouts — power that belongs to the org's admin
 * surface, never to a key shipped inside a public end-user app. Kept as the
 * exclusion list (rather than an allow-list) so any future consumption scope is
 * granted to client apps by default, while a new *authoring* scope has to be
 * added here deliberately.
 */
const BACK_OFFICE_SCOPES: readonly ApiKeyScope[] = [
  'clients:read',
  'clients:create',
  'questionnaires:write',
  'workouts:generate',
];

/**
 * The scope bundle a white-label end-user client app (SPA / mobile) needs: the
 * full read/consumption + self-tracking surface plus `auth:exchange` for
 * branded sign-in, minus the back-office authoring scopes above. This is the
 * "public-client" onboarding preset — it removes the foot-gun of hand-picking
 * scopes (and forgetting auth:exchange / is_public_client) when provisioning a
 * white-label org's app key.
 */
export const PUBLIC_CLIENT_DEFAULT_SCOPES: ApiKeyScope[] = API_KEY_SCOPES.filter(
  (s) => !BACK_OFFICE_SCOPES.includes(s),
);

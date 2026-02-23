import { Generated, Insertable, Selectable, Updateable } from 'kysely';

import { Timestamp } from './timestamp';

export interface OAuthStatesTable {
  id: Generated<string>;
  state_token: string;
  user_id: string;
  provider: string;
  expires_at: Timestamp;
  created_at: Generated<Timestamp>;
}

export type OAuthState = Selectable<OAuthStatesTable>;
export type NewOAuthState = Insertable<OAuthStatesTable>;
export type OAuthStateUpdate = Updateable<OAuthStatesTable>;

import { Injectable } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { Kysely } from 'kysely';
import { InjectKysely } from 'nestjs-kysely';
import { Database, NewOAuthState, OAuthState } from 'src/database/interfaces/index';

@Injectable()
export class OAuthStateRepository {
  constructor(@InjectKysely() protected readonly db: Kysely<Database>) {}

  /**
   * Generate a cryptographically secure random state token
   */
  generateStateToken(): string {
    return randomBytes(32).toString('hex');
  }

  /**
   * Create a new OAuth state with expiry (default 10 minutes)
   */
  async create(data: Omit<NewOAuthState, 'state_token' | 'expires_at'> & { expiresInMinutes?: number }): Promise<OAuthState> {
    const stateToken = this.generateStateToken();
    const expiresInMinutes = data.expiresInMinutes ?? 10;
    const expiresAt = new Date(Date.now() + expiresInMinutes * 60 * 1000);

    return this.db
      .insertInto('oauth_states')
      .values({
        state_token: stateToken,
        user_id: data.user_id,
        provider: data.provider,
        expires_at: expiresAt,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  /**
   * Find and validate a state token, returning the associated user ID if valid
   */
  async findAndValidate(stateToken: string, provider: string): Promise<OAuthState | undefined> {
    const state = await this.db
      .selectFrom('oauth_states')
      .selectAll()
      .where('state_token', '=', stateToken)
      .where('provider', '=', provider)
      .where('expires_at', '>', new Date())
      .executeTakeFirst();

    return state;
  }

  /**
   * Delete a state token after use (one-time use)
   */
  async deleteByToken(stateToken: string): Promise<void> {
    await this.db.deleteFrom('oauth_states').where('state_token', '=', stateToken).execute();
  }

  /**
   * Delete expired states (cleanup)
   */
  async deleteExpired(): Promise<number> {
    const result = await this.db.deleteFrom('oauth_states').where('expires_at', '<', new Date()).executeTakeFirst();

    return Number(result.numDeletedRows ?? 0);
  }

  /**
   * Delete all states for a user (useful when user disconnects)
   */
  async deleteByUserId(userId: string): Promise<void> {
    await this.db.deleteFrom('oauth_states').where('user_id', '=', userId).execute();
  }
}

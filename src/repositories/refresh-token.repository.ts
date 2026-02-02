import { Injectable } from '@nestjs/common';
import { Kysely } from 'kysely';
import { InjectKysely } from 'nestjs-kysely';
import { Database, NewRefreshToken, RefreshToken } from 'src/database/interfaces';

@Injectable()
export class RefreshTokenRepository {
  constructor(@InjectKysely() protected readonly db: Kysely<Database>) {}

  async create(token: NewRefreshToken): Promise<RefreshToken> {
    return this.db.insertInto('refresh_tokens').values(token).returningAll().executeTakeFirstOrThrow();
  }

  async findManyByUserId(userId: string): Promise<Array<RefreshToken>> {
    return this.db.selectFrom('refresh_tokens').where('user_id', '=', userId).selectAll().execute();
  }

  async deleteById(id: string) {
    return this.db.deleteFrom('refresh_tokens').where('id', '=', id).executeTakeFirst();
  }
}

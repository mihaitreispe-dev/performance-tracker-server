import { Injectable } from '@nestjs/common';
import { Kysely, sql } from 'kysely';
import { InjectKysely } from 'nestjs-kysely';
import { Database, NewUser, User, UserRole, UserUpdate } from 'src/database/interfaces/index';
import parseSQLArray from 'src/lib/util/parse-sql-array';

@Injectable()
export class UserRepository {
  constructor(@InjectKysely() protected readonly db: Kysely<Database>) {}

  async findByFirebaseUid(firebaseUid: string): Promise<User | undefined> {
    return this.db.selectFrom('users').selectAll().where('firebase_uid', '=', firebaseUid).executeTakeFirst();
  }

  async findById(id: string): Promise<User | undefined> {
    const result = await this.db.selectFrom('users').where('id', '=', id).selectAll().executeTakeFirst();
    if (!result) {
      return result;
    }
    return { ...result, roles: parseSQLArray(result.roles) };
  }

  async findByEmail(email: string): Promise<User | undefined> {
    const result = await this.db.selectFrom('users').where('email', '=', email).selectAll().executeTakeFirst();
    if (!result) {
      return result;
    }
    return { ...result, roles: parseSQLArray(result.roles) };
  }

  async create(data: NewUser): Promise<User> {
    return this.db.insertInto('users').values(data).returningAll().executeTakeFirstOrThrow();
  }

  async updateById(id: string, user: UserUpdate): Promise<User> {
    const result = await this.db
      .updateTable('users')
      .set(user)
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();
    return { ...result, roles: parseSQLArray(result.roles) };
  }

  async addFcmToken(userId: string, fcmToken: string): Promise<void> {
    await this.db
      .updateTable('users')
      .set({
        fcm_tokens: sql`CASE WHEN NOT (${fcmToken} = ANY(fcm_tokens)) THEN array_append(fcm_tokens, ${fcmToken}) ELSE fcm_tokens END`,
      } as any)
      .where('id', '=', userId)
      .execute();
  }

  async removeFcmToken(userId: string, fcmToken: string): Promise<void> {
    await this.db
      .updateTable('users')
      .set({
        fcm_tokens: sql`array_remove(fcm_tokens, ${fcmToken})`,
      } as any)
      .where('id', '=', userId)
      .execute();
  }

  async findRolesByUserId(userId: string): Promise<Array<UserRole>> {
    const result = await this.db.selectFrom('users').where('id', '=', userId).select(['roles']).executeTakeFirst();
    if (!result) {
      return [];
    }
    return parseSQLArray(result.roles);
  }
}

import { Injectable } from '@nestjs/common';
import { Kysely } from 'kysely';
import { InjectKysely } from 'nestjs-kysely';
import {
  Database,
  IntegrationProvider,
  NewUserIntegration,
  UserIntegration,
  UserIntegrationUpdate,
} from 'src/database/interfaces';

export interface UserIntegrationFilter {
  userId?: string;
  provider?: IntegrationProvider;
  isActive?: boolean;
}

@Injectable()
export class UserIntegrationRepository {
  constructor(@InjectKysely() private readonly db: Kysely<Database>) {}

  async findById(id: string): Promise<UserIntegration | undefined> {
    return this.db.selectFrom('user_integrations').where('id', '=', id).selectAll().executeTakeFirst();
  }

  async findByUserAndProvider(userId: string, provider: IntegrationProvider): Promise<UserIntegration | undefined> {
    return this.db
      .selectFrom('user_integrations')
      .where('user_id', '=', userId)
      .where('provider', '=', provider)
      .selectAll()
      .executeTakeFirst();
  }

  async findByProviderExternalId(
    provider: IntegrationProvider,
    externalUserId: string,
  ): Promise<UserIntegration | undefined> {
    return this.db
      .selectFrom('user_integrations')
      .where('provider', '=', provider)
      .where('external_user_id', '=', externalUserId)
      .selectAll()
      .executeTakeFirst();
  }

  async findMany(filter?: UserIntegrationFilter): Promise<UserIntegration[]> {
    let query = this.db.selectFrom('user_integrations').selectAll();

    if (filter?.userId) {
      query = query.where('user_id', '=', filter.userId);
    }
    if (filter?.provider) {
      query = query.where('provider', '=', filter.provider);
    }
    if (filter?.isActive !== undefined) {
      query = query.where('is_active', '=', filter.isActive);
    }

    return query.orderBy('created_at', 'desc').execute();
  }

  async create(data: NewUserIntegration): Promise<UserIntegration> {
    return this.db.insertInto('user_integrations').values(data).returningAll().executeTakeFirstOrThrow();
  }

  async updateById(id: string, data: UserIntegrationUpdate): Promise<UserIntegration> {
    return this.db
      .updateTable('user_integrations')
      .set({ ...data, updated_at: new Date() } as any)
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  async deleteById(id: string): Promise<void> {
    await this.db.deleteFrom('user_integrations').where('id', '=', id).execute();
  }

  async deleteByUserAndProvider(userId: string, provider: IntegrationProvider): Promise<void> {
    await this.db
      .deleteFrom('user_integrations')
      .where('user_id', '=', userId)
      .where('provider', '=', provider)
      .execute();
  }
}

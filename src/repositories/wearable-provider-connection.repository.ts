import { Injectable } from '@nestjs/common';
import { Kysely } from 'kysely';
import { InjectKysely } from 'nestjs-kysely';
import {
  Database,
  NewWearableProviderConnection,
  WearableDataCategory,
  WearableProvider,
  WearableProviderConnection,
  WearableProviderConnectionUpdate,
} from 'src/database/interfaces';

export interface WearableConnectionFilter {
  userId?: string;
  provider?: WearableProvider;
  openwearablesUserId?: string;
  isActive?: boolean;
  supportsCategory?: WearableDataCategory;
}

@Injectable()
export class WearableProviderConnectionRepository {
  constructor(@InjectKysely() private readonly db: Kysely<Database>) {}

  async findById(id: string): Promise<WearableProviderConnection | undefined> {
    return this.db.selectFrom('wearable_provider_connections').where('id', '=', id).selectAll().executeTakeFirst();
  }

  async findByUserAndProvider(
    userId: string,
    provider: WearableProvider,
  ): Promise<WearableProviderConnection | undefined> {
    return this.db
      .selectFrom('wearable_provider_connections')
      .where('user_id', '=', userId)
      .where('provider', '=', provider)
      .selectAll()
      .executeTakeFirst();
  }

  async findByOpenwearablesUserId(owUserId: string): Promise<WearableProviderConnection[]> {
    return this.db
      .selectFrom('wearable_provider_connections')
      .where('openwearables_user_id', '=', owUserId)
      .selectAll()
      .execute();
  }

  async findMany(filter?: WearableConnectionFilter): Promise<WearableProviderConnection[]> {
    let query = this.db.selectFrom('wearable_provider_connections').selectAll();

    if (filter?.userId) {
      query = query.where('user_id', '=', filter.userId);
    }
    if (filter?.provider) {
      query = query.where('provider', '=', filter.provider);
    }
    if (filter?.openwearablesUserId) {
      query = query.where('openwearables_user_id', '=', filter.openwearablesUserId);
    }
    if (filter?.isActive !== undefined) {
      query = query.where('is_active', '=', filter.isActive);
    }

    return query.orderBy('connected_at', 'desc').execute();
  }

  async findActiveByUserForCategory(
    userId: string,
    category: WearableDataCategory,
  ): Promise<WearableProviderConnection[]> {
    // Fetch all active connections and filter in memory for array contains
    const connections = await this.db
      .selectFrom('wearable_provider_connections')
      .where('user_id', '=', userId)
      .where('is_active', '=', true)
      .selectAll()
      .execute();

    return connections.filter((c) => c.supported_categories.includes(category));
  }

  async create(data: NewWearableProviderConnection): Promise<WearableProviderConnection> {
    return this.db.insertInto('wearable_provider_connections').values(data).returningAll().executeTakeFirstOrThrow();
  }

  async upsert(data: NewWearableProviderConnection): Promise<WearableProviderConnection> {
    return this.db
      .insertInto('wearable_provider_connections')
      .values(data)
      .onConflict((oc) =>
        oc.columns(['user_id', 'provider']).doUpdateSet({
          openwearables_user_id: data.openwearables_user_id,
          external_user_id: data.external_user_id,
          is_active: true,
          supported_categories: data.supported_categories,
          connected_at: new Date(),
          updated_at: new Date(),
        }),
      )
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  async updateById(id: string, data: WearableProviderConnectionUpdate): Promise<WearableProviderConnection> {
    return this.db
      .updateTable('wearable_provider_connections')
      .set({ ...data, updated_at: new Date() } as any)
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  async updateSyncStatus(id: string, status: string, error?: string): Promise<void> {
    await this.db
      .updateTable('wearable_provider_connections')
      .set({
        last_sync_at: new Date(),
        last_sync_status: status,
        last_sync_error: error ?? null,
        updated_at: new Date(),
      } as any)
      .where('id', '=', id)
      .execute();
  }

  async deleteById(id: string): Promise<void> {
    await this.db.deleteFrom('wearable_provider_connections').where('id', '=', id).execute();
  }

  async deleteByUserAndProvider(userId: string, provider: WearableProvider): Promise<void> {
    await this.db
      .deleteFrom('wearable_provider_connections')
      .where('user_id', '=', userId)
      .where('provider', '=', provider)
      .execute();
  }
}

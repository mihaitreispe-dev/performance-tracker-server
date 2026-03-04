import { Injectable } from '@nestjs/common';
import { Kysely, sql } from 'kysely';
import { InjectKysely } from 'nestjs-kysely';
import {
  Database,
  NewWearableProviderPriority,
  WearableDataCategory,
  WearableProvider,
  WearableProviderPriority,
} from 'src/database/interfaces';

@Injectable()
export class WearableProviderPriorityRepository {
  constructor(@InjectKysely() private readonly db: Kysely<Database>) {}

  async findByUserAndCategory(userId: string, category: WearableDataCategory): Promise<WearableProviderPriority[]> {
    return this.db
      .selectFrom('wearable_provider_priorities')
      .where('user_id', '=', userId)
      .where('category', '=', category)
      .selectAll()
      .orderBy('priority', 'asc')
      .execute();
  }

  async findByUser(userId: string): Promise<WearableProviderPriority[]> {
    return this.db
      .selectFrom('wearable_provider_priorities')
      .where('user_id', '=', userId)
      .selectAll()
      .orderBy('category', 'asc')
      .orderBy('priority', 'asc')
      .execute();
  }

  async getHighestPriorityProvider(
    userId: string,
    category: WearableDataCategory,
  ): Promise<WearableProvider | undefined> {
    const result = await this.db
      .selectFrom('wearable_provider_priorities')
      .where('user_id', '=', userId)
      .where('category', '=', category)
      .select('provider')
      .orderBy('priority', 'asc')
      .limit(1)
      .executeTakeFirst();

    return result?.provider;
  }

  async upsertPriority(
    userId: string,
    category: WearableDataCategory,
    provider: WearableProvider,
    priority: number,
  ): Promise<WearableProviderPriority> {
    return this.db
      .insertInto('wearable_provider_priorities')
      .values({
        user_id: userId,
        category,
        provider,
        priority,
      })
      .onConflict((oc) =>
        oc.columns(['user_id', 'category', 'provider']).doUpdateSet({
          priority,
          updated_at: new Date(),
        } as any),
      )
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  async bulkUpsert(priorities: NewWearableProviderPriority[]): Promise<void> {
    if (priorities.length === 0) return;

    for (const priority of priorities) {
      await this.upsertPriority(priority.user_id, priority.category, priority.provider, priority.priority);
    }
  }

  async setProviderAsHighestPriority(
    userId: string,
    category: WearableDataCategory,
    provider: WearableProvider,
  ): Promise<void> {
    // Shift all existing priorities down by 1
    await this.db
      .updateTable('wearable_provider_priorities')
      .set({
        priority: sql`priority + 1`,
        updated_at: new Date(),
      } as any)
      .where('user_id', '=', userId)
      .where('category', '=', category)
      .execute();

    // Set new provider as priority 1
    await this.upsertPriority(userId, category, provider, 1);
  }

  async deleteByUserCategoryAndProvider(
    userId: string,
    category: WearableDataCategory,
    provider: WearableProvider,
  ): Promise<void> {
    await this.db
      .deleteFrom('wearable_provider_priorities')
      .where('user_id', '=', userId)
      .where('category', '=', category)
      .where('provider', '=', provider)
      .execute();
  }

  async deleteByUserAndProvider(userId: string, provider: WearableProvider): Promise<void> {
    await this.db
      .deleteFrom('wearable_provider_priorities')
      .where('user_id', '=', userId)
      .where('provider', '=', provider)
      .execute();
  }
}

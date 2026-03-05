import { Injectable } from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import type { Kysely } from 'kysely';
import type {
  Database,
  Notification,
  NewNotification,
  NotificationUpdate,
  NotificationType,
} from 'src/database/interfaces';

export interface NotificationFilter {
  userId?: string;
  type?: NotificationType | NotificationType[];
  unreadOnly?: boolean;
}

export interface NotificationFindManyOptions {
  limit?: number;
  offset?: number;
}

@Injectable()
export class NotificationRepository {
  constructor(@InjectKysely() private readonly db: Kysely<Database>) {}

  async findById(id: string): Promise<Notification | undefined> {
    return this.db.selectFrom('notifications').where('id', '=', id).selectAll().executeTakeFirst();
  }

  async findMany(filter: NotificationFilter = {}, options: NotificationFindManyOptions = {}): Promise<Notification[]> {
    let query = this.db.selectFrom('notifications').selectAll();

    if (filter.userId) {
      query = query.where('user_id', '=', filter.userId);
    }

    if (filter.type) {
      if (Array.isArray(filter.type)) {
        query = query.where('type', 'in', filter.type);
      } else {
        query = query.where('type', '=', filter.type);
      }
    }

    if (filter.unreadOnly) {
      query = query.where('read_at', 'is', null);
    }

    query = query.orderBy('created_at', 'desc');

    if (options.limit) {
      query = query.limit(options.limit);
    }

    if (options.offset) {
      query = query.offset(options.offset);
    }

    return query.execute();
  }

  async countUnread(userId: string): Promise<number> {
    const result = await this.db
      .selectFrom('notifications')
      .select((eb) => eb.fn.countAll<string>().as('count'))
      .where('user_id', '=', userId)
      .where('read_at', 'is', null)
      .executeTakeFirst();

    return result ? parseInt(result.count, 10) : 0;
  }

  async create(data: NewNotification): Promise<Notification> {
    return this.db.insertInto('notifications').values(data).returningAll().executeTakeFirstOrThrow();
  }

  async createMany(data: NewNotification[]): Promise<Notification[]> {
    if (data.length === 0) return [];
    return this.db.insertInto('notifications').values(data).returningAll().execute();
  }

  async updateById(id: string, data: NotificationUpdate): Promise<Notification | undefined> {
    return this.db
      .updateTable('notifications')
      .set(data)
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirst();
  }

  async markAsRead(id: string): Promise<Notification | undefined> {
    return this.db
      .updateTable('notifications')
      .set({ read_at: new Date() } as any)
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirst();
  }

  async markAllAsRead(userId: string): Promise<number> {
    const result = await this.db
      .updateTable('notifications')
      .set({ read_at: new Date() } as any)
      .where('user_id', '=', userId)
      .where('read_at', 'is', null)
      .executeTakeFirst();

    return Number(result.numUpdatedRows);
  }

  async deleteById(id: string): Promise<void> {
    await this.db.deleteFrom('notifications').where('id', '=', id).execute();
  }

  async deleteOlderThan(date: Date): Promise<number> {
    const result = await this.db
      .deleteFrom('notifications')
      .where('created_at', '<', date as any)
      .executeTakeFirst();

    return Number(result.numDeletedRows);
  }
}

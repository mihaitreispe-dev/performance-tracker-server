import { Injectable } from '@nestjs/common';
import type { Kysely } from 'kysely';
import { InjectKysely } from 'nestjs-kysely';
import type { CoachingMessage, CoachingMessageUpdate, Database, NewCoachingMessage } from 'src/database/interfaces';

export interface CoachingMessageFilter {
  relationshipId?: string;
  senderId?: string;
  workoutScheduleId?: string;
  isWorkoutNote?: boolean;
  unreadOnly?: boolean;
}

export interface CoachingMessageFindManyOptions {
  limit?: number;
  offset?: number;
  beforeId?: string; // For pagination - get messages before this ID
}

@Injectable()
export class CoachingMessageRepository {
  constructor(@InjectKysely() private readonly db: Kysely<Database>) {}

  async findById(id: string): Promise<CoachingMessage | undefined> {
    return this.db.selectFrom('coaching_messages').where('id', '=', id).selectAll().executeTakeFirst();
  }

  async findMany(
    filter: CoachingMessageFilter = {},
    options: CoachingMessageFindManyOptions = {},
  ): Promise<CoachingMessage[]> {
    let query = this.db.selectFrom('coaching_messages').selectAll();

    if (filter.relationshipId) {
      query = query.where('relationship_id', '=', filter.relationshipId);
    }

    if (filter.senderId) {
      query = query.where('sender_id', '=', filter.senderId);
    }

    if (filter.workoutScheduleId) {
      query = query.where('workout_schedule_id', '=', filter.workoutScheduleId);
    }

    if (filter.isWorkoutNote !== undefined) {
      query = query.where('is_workout_note', '=', filter.isWorkoutNote);
    }

    if (filter.unreadOnly) {
      query = query.where('read_at', 'is', null);
    }

    if (options.beforeId) {
      // Get the created_at of the reference message
      const refMessage = await this.db
        .selectFrom('coaching_messages')
        .select('created_at')
        .where('id', '=', options.beforeId)
        .executeTakeFirst();

      if (refMessage) {
        query = query.where('created_at', '<', refMessage.created_at);
      }
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

  async findWorkoutNotes(workoutScheduleId: string): Promise<CoachingMessage[]> {
    return this.db
      .selectFrom('coaching_messages')
      .where('workout_schedule_id', '=', workoutScheduleId)
      .where('is_workout_note', '=', true)
      .orderBy('created_at', 'asc')
      .selectAll()
      .execute();
  }

  async countUnread(relationshipId: string, userId: string): Promise<number> {
    const result = await this.db
      .selectFrom('coaching_messages')
      .select((eb) => eb.fn.countAll<string>().as('count'))
      .where('relationship_id', '=', relationshipId)
      .where('sender_id', '!=', userId) // Messages not sent by this user
      .where('read_at', 'is', null)
      .executeTakeFirst();

    return result ? Number.parseInt(result.count, 10) : 0;
  }

  async create(data: NewCoachingMessage): Promise<CoachingMessage> {
    return this.db.insertInto('coaching_messages').values(data).returningAll().executeTakeFirstOrThrow();
  }

  async updateById(id: string, data: CoachingMessageUpdate): Promise<CoachingMessage | undefined> {
    return this.db
      .updateTable('coaching_messages')
      .set({ ...data, updated_at: new Date() } as any)
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirst();
  }

  async markAsRead(id: string): Promise<CoachingMessage | undefined> {
    return this.db
      .updateTable('coaching_messages')
      .set({ read_at: new Date() } as any)
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirst();
  }

  async markConversationAsRead(relationshipId: string, recipientId: string): Promise<number> {
    const result = await this.db
      .updateTable('coaching_messages')
      .set({ read_at: new Date() } as any)
      .where('relationship_id', '=', relationshipId)
      .where('sender_id', '!=', recipientId) // Mark messages sent by the other person
      .where('read_at', 'is', null)
      .executeTakeFirst();

    return Number(result.numUpdatedRows);
  }

  async deleteById(id: string): Promise<void> {
    await this.db.deleteFrom('coaching_messages').where('id', '=', id).execute();
  }

  async findByAttachedWorkoutInRelationship(
    workoutId: string,
    relationshipId: string,
  ): Promise<CoachingMessage | undefined> {
    return this.db
      .selectFrom('coaching_messages')
      .where('attached_workout_id', '=', workoutId)
      .where('relationship_id', '=', relationshipId)
      .selectAll()
      .executeTakeFirst();
  }

  async findByAttachedPlanInRelationship(planId: string, relationshipId: string): Promise<CoachingMessage | undefined> {
    return this.db
      .selectFrom('coaching_messages')
      .where('attached_plan_id', '=', planId)
      .where('relationship_id', '=', relationshipId)
      .selectAll()
      .executeTakeFirst();
  }
}

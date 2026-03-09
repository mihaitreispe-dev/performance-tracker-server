import { Injectable } from '@nestjs/common';
import type { Kysely } from 'kysely';
import { sql } from 'kysely';
import { InjectKysely } from 'nestjs-kysely';
import type {
  CoachScheduledPrompt,
  CoachScheduledPromptUpdate,
  Database,
  NewCoachScheduledPrompt,
  ScheduledPromptType,
  ScheduleFrequency,
} from 'src/database/interfaces';

export interface CoachScheduledPromptFilter {
  coachId?: string;
  athleteId?: string | null;
  promptType?: ScheduledPromptType | ScheduledPromptType[];
  frequency?: ScheduleFrequency | ScheduleFrequency[];
  enabled?: boolean;
}

export interface CoachScheduledPromptFindManyOptions {
  limit?: number;
  offset?: number;
}

@Injectable()
export class CoachScheduledPromptRepository {
  constructor(@InjectKysely() private readonly db: Kysely<Database>) {}

  async findById(id: string): Promise<CoachScheduledPrompt | undefined> {
    return this.db.selectFrom('coach_scheduled_prompts').where('id', '=', id).selectAll().executeTakeFirst();
  }

  async findMany(
    filter: CoachScheduledPromptFilter = {},
    options: CoachScheduledPromptFindManyOptions = {},
  ): Promise<CoachScheduledPrompt[]> {
    let query = this.db.selectFrom('coach_scheduled_prompts').selectAll();

    if (filter.coachId) {
      query = query.where('coach_id', '=', filter.coachId);
    }

    if (filter.athleteId !== undefined) {
      if (filter.athleteId === null) {
        query = query.where('athlete_id', 'is', null);
      } else {
        query = query.where('athlete_id', '=', filter.athleteId);
      }
    }

    if (filter.promptType) {
      if (Array.isArray(filter.promptType)) {
        query = query.where('prompt_type', 'in', filter.promptType);
      } else {
        query = query.where('prompt_type', '=', filter.promptType);
      }
    }

    if (filter.frequency) {
      if (Array.isArray(filter.frequency)) {
        query = query.where('frequency', 'in', filter.frequency);
      } else {
        query = query.where('frequency', '=', filter.frequency);
      }
    }

    if (filter.enabled !== undefined) {
      query = query.where('enabled', '=', filter.enabled);
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

  async findByCoachId(
    coachId: string,
    filter: Omit<CoachScheduledPromptFilter, 'coachId'> = {},
    options: CoachScheduledPromptFindManyOptions = {},
  ): Promise<CoachScheduledPrompt[]> {
    return this.findMany({ ...filter, coachId }, options);
  }

  async findDuePrompts(now: Date): Promise<CoachScheduledPrompt[]> {
    return this.db
      .selectFrom('coach_scheduled_prompts')
      .where('enabled', '=', true)
      .where('next_run_at', '<=', now)
      .selectAll()
      .execute();
  }

  async create(data: NewCoachScheduledPrompt): Promise<CoachScheduledPrompt> {
    return this.db.insertInto('coach_scheduled_prompts').values(data).returningAll().executeTakeFirstOrThrow();
  }

  async updateById(id: string, data: CoachScheduledPromptUpdate): Promise<CoachScheduledPrompt | undefined> {
    return this.db
      .updateTable('coach_scheduled_prompts')
      .set({ ...data, updated_at: sql`now()` })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirst();
  }

  async updateNextRunAt(id: string, nextRunAt: Date, lastSentAt: Date): Promise<CoachScheduledPrompt | undefined> {
    return this.db
      .updateTable('coach_scheduled_prompts')
      .set({
        next_run_at: nextRunAt,
        last_sent_at: lastSentAt,
        updated_at: sql`now()`,
      })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirst();
  }

  async disable(id: string): Promise<CoachScheduledPrompt | undefined> {
    return this.db
      .updateTable('coach_scheduled_prompts')
      .set({
        enabled: false,
        updated_at: sql`now()`,
      })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirst();
  }

  async enable(id: string): Promise<CoachScheduledPrompt | undefined> {
    return this.db
      .updateTable('coach_scheduled_prompts')
      .set({
        enabled: true,
        updated_at: sql`now()`,
      })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirst();
  }

  async deleteById(id: string): Promise<void> {
    await this.db.deleteFrom('coach_scheduled_prompts').where('id', '=', id).execute();
  }

  async countByCoachId(coachId: string, filter: Omit<CoachScheduledPromptFilter, 'coachId'> = {}): Promise<number> {
    let query = this.db
      .selectFrom('coach_scheduled_prompts')
      .select((eb) => eb.fn.countAll<string>().as('count'))
      .where('coach_id', '=', coachId);

    if (filter.enabled !== undefined) {
      query = query.where('enabled', '=', filter.enabled);
    }

    const result = await query.executeTakeFirst();
    return result ? Number.parseInt(result.count, 10) : 0;
  }
}

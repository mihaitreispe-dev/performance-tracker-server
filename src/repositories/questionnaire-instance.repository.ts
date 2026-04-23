import { Injectable } from '@nestjs/common';
import type { Kysely } from 'kysely';
import { InjectKysely } from 'nestjs-kysely';
import type {
  Database,
  NewQuestionnaireInstance,
  QuestionnaireInstance,
  QuestionnaireInstanceUpdate,
  QuestionnaireStatus,
} from 'src/database/interfaces';

export interface QuestionnaireInstanceFilter {
  coachId?: string;
  athleteId?: string;
  relationshipId?: string;
  templateId?: string;
  status?: QuestionnaireStatus | QuestionnaireStatus[];
  messageId?: string;
}

export interface QuestionnaireInstanceFindManyOptions {
  limit?: number;
  offset?: number;
}

@Injectable()
export class QuestionnaireInstanceRepository {
  constructor(@InjectKysely() private readonly db: Kysely<Database>) {}

  async findById(id: string): Promise<QuestionnaireInstance | undefined> {
    return this.db.selectFrom('questionnaire_instances').where('id', '=', id).selectAll().executeTakeFirst();
  }

  async findMany(
    filter: QuestionnaireInstanceFilter = {},
    options: QuestionnaireInstanceFindManyOptions = {},
  ): Promise<QuestionnaireInstance[]> {
    let query = this.db.selectFrom('questionnaire_instances').selectAll();

    if (filter.coachId) {
      query = query.where('coach_id', '=', filter.coachId);
    }

    if (filter.athleteId) {
      query = query.where('athlete_id', '=', filter.athleteId);
    }

    if (filter.relationshipId) {
      query = query.where('relationship_id', '=', filter.relationshipId);
    }

    if (filter.templateId) {
      query = query.where('template_id', '=', filter.templateId);
    }

    if (filter.status) {
      if (Array.isArray(filter.status)) {
        query = query.where('status', 'in', filter.status);
      } else {
        query = query.where('status', '=', filter.status);
      }
    }

    if (filter.messageId) {
      query = query.where('message_id', '=', filter.messageId);
    }

    query = query.orderBy('sent_at', 'desc');

    if (options.limit) {
      query = query.limit(options.limit);
    }

    if (options.offset) {
      query = query.offset(options.offset);
    }

    return query.execute();
  }

  async count(filter: QuestionnaireInstanceFilter = {}): Promise<number> {
    let query = this.db.selectFrom('questionnaire_instances').select((eb) => eb.fn.countAll<string>().as('count'));

    if (filter.coachId) {
      query = query.where('coach_id', '=', filter.coachId);
    }

    if (filter.athleteId) {
      query = query.where('athlete_id', '=', filter.athleteId);
    }

    if (filter.relationshipId) {
      query = query.where('relationship_id', '=', filter.relationshipId);
    }

    if (filter.templateId) {
      query = query.where('template_id', '=', filter.templateId);
    }

    if (filter.status) {
      if (Array.isArray(filter.status)) {
        query = query.where('status', 'in', filter.status);
      } else {
        query = query.where('status', '=', filter.status);
      }
    }

    const result = await query.executeTakeFirst();
    return result ? Number.parseInt(result.count, 10) : 0;
  }

  async findByTemplateAndAthlete(templateId: string, athleteId: string): Promise<QuestionnaireInstance[]> {
    return this.db
      .selectFrom('questionnaire_instances')
      .where('template_id', '=', templateId)
      .where('athlete_id', '=', athleteId)
      .orderBy('sent_at', 'desc')
      .selectAll()
      .execute();
  }

  async create(data: NewQuestionnaireInstance): Promise<QuestionnaireInstance> {
    return this.db.insertInto('questionnaire_instances').values(data).returningAll().executeTakeFirstOrThrow();
  }

  async createMany(data: NewQuestionnaireInstance[]): Promise<QuestionnaireInstance[]> {
    if (data.length === 0) return [];
    return this.db.insertInto('questionnaire_instances').values(data).returningAll().execute();
  }

  async updateById(id: string, data: QuestionnaireInstanceUpdate): Promise<QuestionnaireInstance | undefined> {
    return this.db
      .updateTable('questionnaire_instances')
      .set({ ...data, updated_at: new Date() } as any)
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirst();
  }

  async markAsStarted(id: string): Promise<QuestionnaireInstance | undefined> {
    return this.db
      .updateTable('questionnaire_instances')
      .set({
        status: 'in_progress',
        started_at: new Date(),
        updated_at: new Date(),
      } as any)
      .where('id', '=', id)
      .where('status', '=', 'pending')
      .returningAll()
      .executeTakeFirst();
  }

  async markAsCompleted(id: string): Promise<QuestionnaireInstance | undefined> {
    return this.db
      .updateTable('questionnaire_instances')
      .set({
        status: 'completed',
        completed_at: new Date(),
        updated_at: new Date(),
      } as any)
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirst();
  }

  async markAsExpired(id: string): Promise<QuestionnaireInstance | undefined> {
    return this.db
      .updateTable('questionnaire_instances')
      .set({
        status: 'expired',
        updated_at: new Date(),
      } as any)
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirst();
  }

  async findExpiredInstances(): Promise<QuestionnaireInstance[]> {
    return this.db
      .selectFrom('questionnaire_instances')
      .where('status', 'in', ['pending', 'in_progress'])
      .where('expires_at', '<', new Date())
      .selectAll()
      .execute();
  }

  async deleteById(id: string): Promise<void> {
    await this.db.deleteFrom('questionnaire_instances').where('id', '=', id).execute();
  }
}

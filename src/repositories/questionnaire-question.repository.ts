import { Injectable } from '@nestjs/common';
import type { Kysely } from 'kysely';
import { InjectKysely } from 'nestjs-kysely';
import type {
  Database,
  NewQuestionnaireQuestion,
  QuestionnaireQuestion,
  QuestionnaireQuestionUpdate,
} from 'src/database/interfaces';

@Injectable()
export class QuestionnaireQuestionRepository {
  constructor(@InjectKysely() private readonly db: Kysely<Database>) {}

  async findById(id: string): Promise<QuestionnaireQuestion | undefined> {
    return this.db.selectFrom('questionnaire_questions').where('id', '=', id).selectAll().executeTakeFirst();
  }

  async findByTemplateId(templateId: string): Promise<QuestionnaireQuestion[]> {
    return this.db
      .selectFrom('questionnaire_questions')
      .where('template_id', '=', templateId)
      .orderBy('order_index', 'asc')
      .selectAll()
      .execute();
  }

  async getMaxOrderIndex(templateId: string): Promise<number> {
    const result = await this.db
      .selectFrom('questionnaire_questions')
      .select((eb) => eb.fn.max('order_index').as('max_index'))
      .where('template_id', '=', templateId)
      .executeTakeFirst();

    return result?.max_index ?? -1;
  }

  async create(data: NewQuestionnaireQuestion): Promise<QuestionnaireQuestion> {
    return this.db.insertInto('questionnaire_questions').values(data).returningAll().executeTakeFirstOrThrow();
  }

  async createMany(data: NewQuestionnaireQuestion[]): Promise<QuestionnaireQuestion[]> {
    if (data.length === 0) return [];
    return this.db.insertInto('questionnaire_questions').values(data).returningAll().execute();
  }

  async updateById(id: string, data: QuestionnaireQuestionUpdate): Promise<QuestionnaireQuestion | undefined> {
    return this.db
      .updateTable('questionnaire_questions')
      .set({ ...data, updated_at: new Date() } as any)
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirst();
  }

  async updateOrderIndexes(updates: { id: string; orderIndex: number }[]): Promise<void> {
    await this.db.transaction().execute(async (trx) => {
      for (const update of updates) {
        await trx
          .updateTable('questionnaire_questions')
          .set({ order_index: update.orderIndex, updated_at: new Date() } as any)
          .where('id', '=', update.id)
          .execute();
      }
    });
  }

  async deleteById(id: string): Promise<void> {
    await this.db.deleteFrom('questionnaire_questions').where('id', '=', id).execute();
  }

  async deleteByTemplateId(templateId: string): Promise<void> {
    await this.db.deleteFrom('questionnaire_questions').where('template_id', '=', templateId).execute();
  }
}

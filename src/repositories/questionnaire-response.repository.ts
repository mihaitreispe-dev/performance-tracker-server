import { Injectable } from '@nestjs/common';
import type { Kysely } from 'kysely';
import { InjectKysely } from 'nestjs-kysely';
import type {
  Database,
  NewQuestionnaireResponse,
  QuestionnaireResponse,
  QuestionnaireResponseUpdate,
} from 'src/database/interfaces';

@Injectable()
export class QuestionnaireResponseRepository {
  constructor(@InjectKysely() private readonly db: Kysely<Database>) {}

  async findById(id: string): Promise<QuestionnaireResponse | undefined> {
    return this.db.selectFrom('questionnaire_responses').where('id', '=', id).selectAll().executeTakeFirst();
  }

  async findByInstanceId(instanceId: string): Promise<QuestionnaireResponse[]> {
    return this.db
      .selectFrom('questionnaire_responses')
      .where('instance_id', '=', instanceId)
      .selectAll()
      .execute();
  }

  async findByInstanceAndQuestion(instanceId: string, questionId: string): Promise<QuestionnaireResponse | undefined> {
    return this.db
      .selectFrom('questionnaire_responses')
      .where('instance_id', '=', instanceId)
      .where('question_id', '=', questionId)
      .selectAll()
      .executeTakeFirst();
  }

  async create(data: NewQuestionnaireResponse): Promise<QuestionnaireResponse> {
    return this.db.insertInto('questionnaire_responses').values(data).returningAll().executeTakeFirstOrThrow();
  }

  async createMany(data: NewQuestionnaireResponse[]): Promise<QuestionnaireResponse[]> {
    if (data.length === 0) return [];
    return this.db.insertInto('questionnaire_responses').values(data).returningAll().execute();
  }

  async upsert(data: NewQuestionnaireResponse): Promise<QuestionnaireResponse> {
    const existing = await this.findByInstanceAndQuestion(data.instance_id, data.question_id);
    if (existing) {
      const updated = await this.updateById(existing.id, {
        response_value: data.response_value,
        question_snapshot: data.question_snapshot,
      });
      return updated!;
    }
    return this.create(data);
  }

  async upsertMany(data: NewQuestionnaireResponse[]): Promise<QuestionnaireResponse[]> {
    const results: QuestionnaireResponse[] = [];
    for (const item of data) {
      const result = await this.upsert(item);
      results.push(result);
    }
    return results;
  }

  async updateById(id: string, data: QuestionnaireResponseUpdate): Promise<QuestionnaireResponse | undefined> {
    return this.db
      .updateTable('questionnaire_responses')
      .set({ ...data, updated_at: new Date() } as any)
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirst();
  }

  async deleteById(id: string): Promise<void> {
    await this.db.deleteFrom('questionnaire_responses').where('id', '=', id).execute();
  }

  async deleteByInstanceId(instanceId: string): Promise<void> {
    await this.db.deleteFrom('questionnaire_responses').where('instance_id', '=', instanceId).execute();
  }
}

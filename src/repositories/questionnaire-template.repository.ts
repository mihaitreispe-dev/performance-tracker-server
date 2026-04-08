import { Injectable } from '@nestjs/common';
import type { Kysely } from 'kysely';
import { InjectKysely } from 'nestjs-kysely';
import type {
  Database,
  NewQuestionnaireTemplate,
  QuestionnaireCategory,
  QuestionnaireTemplate,
  QuestionnaireTemplateUpdate,
} from 'src/database/interfaces';

export interface QuestionnaireTemplateFilter {
  coachId?: string;
  category?: QuestionnaireCategory | QuestionnaireCategory[];
  isArchived?: boolean;
  search?: string;
}

export interface QuestionnaireTemplateFindManyOptions {
  limit?: number;
  offset?: number;
}

@Injectable()
export class QuestionnaireTemplateRepository {
  constructor(@InjectKysely() private readonly db: Kysely<Database>) {}

  async findById(id: string): Promise<QuestionnaireTemplate | undefined> {
    return this.db.selectFrom('questionnaire_templates').where('id', '=', id).selectAll().executeTakeFirst();
  }

  async findMany(
    filter: QuestionnaireTemplateFilter = {},
    options: QuestionnaireTemplateFindManyOptions = {},
  ): Promise<QuestionnaireTemplate[]> {
    let query = this.db.selectFrom('questionnaire_templates').selectAll();

    if (filter.coachId) {
      query = query.where('coach_id', '=', filter.coachId);
    }

    if (filter.category) {
      if (Array.isArray(filter.category)) {
        query = query.where('category', 'in', filter.category);
      } else {
        query = query.where('category', '=', filter.category);
      }
    }

    if (filter.isArchived !== undefined) {
      query = query.where('is_archived', '=', filter.isArchived);
    }

    if (filter.search) {
      query = query.where((eb) =>
        eb.or([
          eb('name', 'ilike', `%${filter.search}%`),
          eb('description', 'ilike', `%${filter.search}%`),
        ]),
      );
    }

    query = query.orderBy('updated_at', 'desc');

    if (options.limit) {
      query = query.limit(options.limit);
    }

    if (options.offset) {
      query = query.offset(options.offset);
    }

    return query.execute();
  }

  async count(filter: QuestionnaireTemplateFilter = {}): Promise<number> {
    let query = this.db
      .selectFrom('questionnaire_templates')
      .select((eb) => eb.fn.countAll<string>().as('count'));

    if (filter.coachId) {
      query = query.where('coach_id', '=', filter.coachId);
    }

    if (filter.category) {
      if (Array.isArray(filter.category)) {
        query = query.where('category', 'in', filter.category);
      } else {
        query = query.where('category', '=', filter.category);
      }
    }

    if (filter.isArchived !== undefined) {
      query = query.where('is_archived', '=', filter.isArchived);
    }

    if (filter.search) {
      query = query.where((eb) =>
        eb.or([
          eb('name', 'ilike', `%${filter.search}%`),
          eb('description', 'ilike', `%${filter.search}%`),
        ]),
      );
    }

    const result = await query.executeTakeFirst();
    return result ? Number.parseInt(result.count, 10) : 0;
  }

  async create(data: NewQuestionnaireTemplate): Promise<QuestionnaireTemplate> {
    return this.db.insertInto('questionnaire_templates').values(data).returningAll().executeTakeFirstOrThrow();
  }

  async updateById(id: string, data: QuestionnaireTemplateUpdate): Promise<QuestionnaireTemplate | undefined> {
    return this.db
      .updateTable('questionnaire_templates')
      .set({ ...data, updated_at: new Date() } as any)
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirst();
  }

  async archive(id: string): Promise<QuestionnaireTemplate | undefined> {
    return this.db
      .updateTable('questionnaire_templates')
      .set({ is_archived: true, updated_at: new Date() } as any)
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirst();
  }

  async unarchive(id: string): Promise<QuestionnaireTemplate | undefined> {
    return this.db
      .updateTable('questionnaire_templates')
      .set({ is_archived: false, updated_at: new Date() } as any)
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirst();
  }

  async deleteById(id: string): Promise<void> {
    await this.db.deleteFrom('questionnaire_templates').where('id', '=', id).execute();
  }
}

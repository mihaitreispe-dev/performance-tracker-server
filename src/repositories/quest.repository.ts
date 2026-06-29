import { Injectable } from '@nestjs/common';
import { Kysely, sql } from 'kysely';
import { InjectKysely } from 'nestjs-kysely';
import { Database, NewQuest, Quest, QuestStatus, QuestUpdate } from 'src/database/interfaces';

/** Coach-authored quest definitions. See migration 1774405100000. */
@Injectable()
export class QuestRepository {
  constructor(@InjectKysely() private readonly db: Kysely<Database>) {}

  async create(data: NewQuest): Promise<Quest> {
    return this.db.insertInto('quests').values(data).returningAll().executeTakeFirstOrThrow();
  }

  async findByIdInOrg(id: string, organisationId: string): Promise<Quest | undefined> {
    return this.db
      .selectFrom('quests')
      .where('id', '=', id)
      .where('organisation_id', '=', organisationId)
      .selectAll()
      .executeTakeFirst();
  }

  async listForCoach(
    organisationId: string,
    coachId: string,
    opts?: { includeArchived?: boolean },
  ): Promise<Quest[]> {
    let q = this.db
      .selectFrom('quests')
      .where('organisation_id', '=', organisationId)
      .where('coach_id', '=', coachId);
    if (!opts?.includeArchived) q = q.where('status', '=', QuestStatus.ACTIVE);
    return q.selectAll().orderBy('created_at', 'desc').execute();
  }

  async updateForCoach(
    id: string,
    coachId: string,
    organisationId: string,
    patch: QuestUpdate,
  ): Promise<Quest | undefined> {
    return this.db
      .updateTable('quests')
      .set({ ...patch, updated_at: sql`now()` })
      .where('id', '=', id)
      .where('coach_id', '=', coachId)
      .where('organisation_id', '=', organisationId)
      .returningAll()
      .executeTakeFirst();
  }
}

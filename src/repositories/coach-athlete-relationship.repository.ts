import { Injectable } from '@nestjs/common';
import { Kysely, sql } from 'kysely';
import { InjectKysely } from 'nestjs-kysely';
import {
  CoachAthleteRelationship,
  CoachAthleteRelationshipUpdate,
  CoachAthleteStatus,
  Database,
  NewCoachAthleteRelationship,
} from 'src/database/interfaces';

export interface CoachAthleteRelationshipFilter {
  /**
   * Active organisation id. Required for list-style queries to enforce tenant boundary.
   * A coach in org A and the same coach via a separate membership in org B have distinct rosters.
   */
  organisationId: string;
  coachId?: string;
  athleteId?: string;
  status?: CoachAthleteStatus | CoachAthleteStatus[];
}

@Injectable()
export class CoachAthleteRelationshipRepository {
  constructor(@InjectKysely() private readonly db: Kysely<Database>) {}

  async findById(id: string): Promise<CoachAthleteRelationship | undefined> {
    return this.db.selectFrom('coach_athlete_relationships').where('id', '=', id).selectAll().executeTakeFirst();
  }

  async findActiveByAthleteId(athleteId: string): Promise<CoachAthleteRelationship | undefined> {
    return this.db
      .selectFrom('coach_athlete_relationships')
      .where('athlete_id', '=', athleteId)
      .where('status', '=', CoachAthleteStatus.ACTIVE)
      .selectAll()
      .executeTakeFirst();
  }

  async findActiveByCoachAndAthlete(coachId: string, athleteId: string): Promise<CoachAthleteRelationship | undefined> {
    return this.db
      .selectFrom('coach_athlete_relationships')
      .where('coach_id', '=', coachId)
      .where('athlete_id', '=', athleteId)
      .where('status', '=', CoachAthleteStatus.ACTIVE)
      .selectAll()
      .executeTakeFirst();
  }

  async findPendingByAthleteId(athleteId: string): Promise<CoachAthleteRelationship[]> {
    return this.db
      .selectFrom('coach_athlete_relationships')
      .where('athlete_id', '=', athleteId)
      .where('status', '=', CoachAthleteStatus.PENDING)
      .selectAll()
      .orderBy('invited_at', 'desc')
      .execute();
  }

  async findMany(filter: CoachAthleteRelationshipFilter): Promise<CoachAthleteRelationship[]> {
    let query = this.db
      .selectFrom('coach_athlete_relationships')
      .where('organisation_id', '=', filter.organisationId)
      .selectAll();

    if (filter.coachId) {
      query = query.where('coach_id', '=', filter.coachId);
    }
    if (filter.athleteId) {
      query = query.where('athlete_id', '=', filter.athleteId);
    }
    if (filter.status) {
      if (Array.isArray(filter.status)) {
        query = query.where('status', 'in', filter.status);
      } else {
        query = query.where('status', '=', filter.status);
      }
    }

    return query.orderBy('invited_at', 'desc').execute();
  }

  async countAthletesByCoach(
    organisationId: string,
    coachId: string,
    status?: CoachAthleteStatus,
  ): Promise<number> {
    let query = this.db
      .selectFrom('coach_athlete_relationships')
      .select((eb) => eb.fn.countAll<number>().as('count'))
      .where('organisation_id', '=', organisationId)
      .where('coach_id', '=', coachId);

    if (status) {
      query = query.where('status', '=', status);
    }

    const result = await query.executeTakeFirstOrThrow();
    return Number(result.count);
  }

  /**
   * System / cron path: query across all tenants. Do NOT use from request paths.
   * Cron jobs that fan out per coach (e.g. coach alerts) call this because they don't
   * have a single active org context.
   */
  async findManyAcrossOrgs(filter: Omit<CoachAthleteRelationshipFilter, 'organisationId'>): Promise<CoachAthleteRelationship[]> {
    let query = this.db.selectFrom('coach_athlete_relationships').selectAll();

    if (filter.coachId) {
      query = query.where('coach_id', '=', filter.coachId);
    }
    if (filter.athleteId) {
      query = query.where('athlete_id', '=', filter.athleteId);
    }
    if (filter.status) {
      if (Array.isArray(filter.status)) {
        query = query.where('status', 'in', filter.status);
      } else {
        query = query.where('status', '=', filter.status);
      }
    }

    return query.orderBy('invited_at', 'desc').execute();
  }

  async create(data: NewCoachAthleteRelationship): Promise<CoachAthleteRelationship> {
    return this.db.insertInto('coach_athlete_relationships').values(data).returningAll().executeTakeFirstOrThrow();
  }

  async updateById(id: string, data: CoachAthleteRelationshipUpdate): Promise<CoachAthleteRelationship> {
    return this.db
      .updateTable('coach_athlete_relationships')
      .set(data)
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  async respond(
    id: string,
    status: CoachAthleteStatus.ACTIVE | CoachAthleteStatus.DECLINED,
  ): Promise<CoachAthleteRelationship> {
    return this.db
      .updateTable('coach_athlete_relationships')
      .set({ status, responded_at: sql`now()` })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  async deleteById(id: string): Promise<void> {
    await this.db.deleteFrom('coach_athlete_relationships').where('id', '=', id).execute();
  }

  async findByCoachIdAndAthleteEmail(
    coachId: string,
    athleteEmail: string,
  ): Promise<CoachAthleteRelationship | undefined> {
    return this.db
      .selectFrom('coach_athlete_relationships')
      .innerJoin('users', 'users.id', 'coach_athlete_relationships.athlete_id')
      .where('coach_athlete_relationships.coach_id', '=', coachId)
      .where('users.email', '=', athleteEmail)
      .where('coach_athlete_relationships.status', 'in', [CoachAthleteStatus.PENDING, CoachAthleteStatus.ACTIVE])
      .selectAll('coach_athlete_relationships')
      .executeTakeFirst();
  }
}

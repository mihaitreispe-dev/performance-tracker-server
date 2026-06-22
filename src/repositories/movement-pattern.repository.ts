import { Injectable } from '@nestjs/common';
import { Kysely } from 'kysely';
import { InjectKysely } from 'nestjs-kysely';
import { Database, MovementPattern, NewMovementPattern } from 'src/database/interfaces';

/**
 * Global movement-pattern reference list. An exercise references at most one via
 * exercises.movement_pattern_id (set directly on the exercise row — no join
 * table), so this repo is just the reference lookup.
 */
@Injectable()
export class MovementPatternRepository {
  constructor(@InjectKysely() protected readonly db: Kysely<Database>) {}

  async findById(id: string): Promise<MovementPattern | undefined> {
    return this.db.selectFrom('movement_patterns').where('id', '=', id).selectAll().executeTakeFirst();
  }

  async findByName(name: string): Promise<MovementPattern | undefined> {
    return this.db.selectFrom('movement_patterns').where('name', '=', name).selectAll().executeTakeFirst();
  }

  async findAll(): Promise<MovementPattern[]> {
    return this.db.selectFrom('movement_patterns').selectAll().orderBy('name', 'asc').execute();
  }

  async create(data: NewMovementPattern): Promise<MovementPattern> {
    return this.db.insertInto('movement_patterns').values(data).returningAll().executeTakeFirstOrThrow();
  }
}

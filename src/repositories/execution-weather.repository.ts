import { Injectable } from '@nestjs/common';
import { Kysely } from 'kysely';
import { InjectKysely } from 'nestjs-kysely';
import {
  Database,
  ExecutionWeather,
  ExecutionWeatherUpdate,
  NewExecutionWeather,
} from 'src/database/interfaces';

@Injectable()
export class ExecutionWeatherRepository {
  constructor(@InjectKysely() private readonly db: Kysely<Database>) {}

  async findById(id: string): Promise<ExecutionWeather | undefined> {
    return this.db.selectFrom('execution_weather').where('id', '=', id).selectAll().executeTakeFirst();
  }

  async findByExecutionId(workoutExecutionId: string): Promise<ExecutionWeather | undefined> {
    return this.db
      .selectFrom('execution_weather')
      .where('workout_execution_id', '=', workoutExecutionId)
      .selectAll()
      .executeTakeFirst();
  }

  async create(data: NewExecutionWeather): Promise<ExecutionWeather> {
    return this.db.insertInto('execution_weather').values(data).returningAll().executeTakeFirstOrThrow();
  }

  async updateById(id: string, data: ExecutionWeatherUpdate): Promise<ExecutionWeather> {
    return this.db
      .updateTable('execution_weather')
      .set(data)
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  async deleteById(id: string): Promise<void> {
    await this.db.deleteFrom('execution_weather').where('id', '=', id).execute();
  }

  async deleteByExecutionId(workoutExecutionId: string): Promise<void> {
    await this.db.deleteFrom('execution_weather').where('workout_execution_id', '=', workoutExecutionId).execute();
  }
}

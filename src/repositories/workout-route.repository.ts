import { Injectable } from '@nestjs/common';
import { Kysely } from 'kysely';
import { InjectKysely } from 'nestjs-kysely';
import {
  Database,
  NewRouteMarker,
  NewWorkoutRoute,
  RouteMarker,
  WorkoutRoute,
  WorkoutRouteUpdate,
} from 'src/database/interfaces';

export interface RouteMarkerFilter {
  workoutRouteId?: string;
  markerType?: string;
}

@Injectable()
export class WorkoutRouteRepository {
  constructor(@InjectKysely() private readonly db: Kysely<Database>) {}

  async findById(id: string): Promise<WorkoutRoute | undefined> {
    return this.db.selectFrom('workout_routes').where('id', '=', id).selectAll().executeTakeFirst();
  }

  async findByExecutionId(workoutExecutionId: string): Promise<WorkoutRoute | undefined> {
    return this.db
      .selectFrom('workout_routes')
      .where('workout_execution_id', '=', workoutExecutionId)
      .selectAll()
      .executeTakeFirst();
  }

  /**
   * Bulk fetch workout routes by execution IDs - more efficient than multiple findByExecutionId calls
   */
  async findByExecutionIds(executionIds: string[]): Promise<Map<string, WorkoutRoute>> {
    if (executionIds.length === 0) return new Map();

    const results = await this.db
      .selectFrom('workout_routes')
      .where('workout_execution_id', 'in', executionIds)
      .selectAll()
      .execute();

    const map = new Map<string, WorkoutRoute>();
    for (const route of results) {
      map.set(route.workout_execution_id, route);
    }
    return map;
  }

  async create(data: NewWorkoutRoute): Promise<WorkoutRoute> {
    return this.db.insertInto('workout_routes').values(data).returningAll().executeTakeFirstOrThrow();
  }

  async updateById(id: string, data: WorkoutRouteUpdate): Promise<WorkoutRoute> {
    return this.db
      .updateTable('workout_routes')
      .set(data)
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  async deleteById(id: string): Promise<void> {
    await this.db.deleteFrom('workout_routes').where('id', '=', id).execute();
  }

  async deleteByExecutionId(workoutExecutionId: string): Promise<void> {
    await this.db.deleteFrom('workout_routes').where('workout_execution_id', '=', workoutExecutionId).execute();
  }

  // Route markers

  async findMarkersByRouteId(workoutRouteId: string, markerType?: string): Promise<RouteMarker[]> {
    let query = this.db
      .selectFrom('route_markers')
      .where('workout_route_id', '=', workoutRouteId)
      .selectAll()
      .orderBy('marker_number', 'asc');

    if (markerType) {
      query = query.where('marker_type', '=', markerType);
    }

    return query.execute();
  }

  async createMarker(data: NewRouteMarker): Promise<RouteMarker> {
    return this.db.insertInto('route_markers').values(data).returningAll().executeTakeFirstOrThrow();
  }

  async createMarkers(data: NewRouteMarker[]): Promise<RouteMarker[]> {
    if (data.length === 0) return [];
    return this.db.insertInto('route_markers').values(data).returningAll().execute();
  }

  async deleteMarkersByRouteId(workoutRouteId: string): Promise<void> {
    await this.db.deleteFrom('route_markers').where('workout_route_id', '=', workoutRouteId).execute();
  }
}

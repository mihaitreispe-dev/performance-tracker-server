import { Generated, Insertable, Selectable, Updateable } from 'kysely';

import { Timestamp } from './timestamp';

export interface GeoJSONLineString {
  type: 'LineString';
  coordinates: [number, number][] | [number, number, number][];
}

export interface WorkoutRoutesTable {
  id: Generated<string>;
  workout_execution_id: string;
  route_geojson: GeoJSONLineString;
  total_distance_meters: string;
  elevation_gain_meters: string | null;
  elevation_loss_meters: string | null;
  created_at: Generated<Timestamp>;
}

export type WorkoutRoute = Selectable<WorkoutRoutesTable>;
export type NewWorkoutRoute = Insertable<WorkoutRoutesTable>;
export type WorkoutRouteUpdate = Updateable<WorkoutRoutesTable>;

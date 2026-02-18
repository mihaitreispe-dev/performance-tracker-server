import { Generated, Insertable, Selectable, Updateable } from 'kysely';

import { Timestamp } from './timestamp';

export enum RouteMarkerType {
  KM = 'km',
  MILE = 'mile',
}

export interface RouteMarkersTable {
  id: Generated<string>;
  workout_route_id: string;
  marker_type: string;
  marker_number: number;
  latitude: string;
  longitude: string;
  elevation_meters: string | null;
  recorded_at: Timestamp;
  split_time_seconds: number;
  cumulative_time_seconds: number;
  avg_heart_rate: number | null;
  avg_pace_seconds_per_km: number | null;
  created_at: Generated<Timestamp>;
}

export type RouteMarker = Selectable<RouteMarkersTable>;
export type NewRouteMarker = Insertable<RouteMarkersTable>;
export type RouteMarkerUpdate = Updateable<RouteMarkersTable>;

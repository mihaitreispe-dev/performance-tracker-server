import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import type { GeoJSONLineString } from 'src/database/interfaces';

export class PublicRouteMarkerDTO {
  @ApiProperty() id: string;
  @ApiProperty() markerType: string;
  @ApiProperty() markerNumber: number;
  @ApiProperty() latitude: number;
  @ApiProperty() longitude: number;
  @ApiPropertyOptional({ nullable: true }) elevationMeters: number | null;
  @ApiProperty() recordedAt: string;
  @ApiProperty() splitTimeSeconds: number;
  @ApiProperty() cumulativeTimeSeconds: number;
  @ApiPropertyOptional({ nullable: true }) avgHeartRate: number | null;
  @ApiPropertyOptional({ nullable: true }) avgPaceSecondsPerKm: number | null;
}

export class PublicWorkoutRouteDTO {
  @ApiProperty() id: string;
  @ApiProperty() workoutExecutionId: string;
  @ApiProperty({
    type: 'object',
    additionalProperties: true,
    description: 'GeoJSON LineString — { type: "LineString", coordinates: [[lon, lat, elev?]...] }',
  })
  route: GeoJSONLineString;
  @ApiProperty() totalDistanceMeters: number;
  @ApiPropertyOptional({ nullable: true }) elevationGainMeters: number | null;
  @ApiPropertyOptional({ nullable: true }) elevationLossMeters: number | null;
  @ApiProperty() createdAt: string;
  @ApiProperty({ type: [PublicRouteMarkerDTO] }) markers: PublicRouteMarkerDTO[];
}

export class PublicWorkoutRouteResponse {
  @ApiProperty({ type: PublicWorkoutRouteDTO }) data: PublicWorkoutRouteDTO;
}

export class PublicCardioMetricDTO {
  @ApiProperty() id: string;
  @ApiProperty() workoutExecutionId: string;
  @ApiProperty() metricType: string;
  @ApiProperty() recordedAt: string;
  @ApiProperty() value: number;
  @ApiProperty() unit: string;
}

export class PublicCardioMetricListResponse {
  @ApiProperty({ type: [PublicCardioMetricDTO] }) data: PublicCardioMetricDTO[];
}

export class PublicCardioBatchSummaryDTO {
  @ApiProperty({ description: 'Number of samples persisted.' }) count: number;
}

export class PublicCardioMetricsBatchResponse {
  @ApiProperty({ type: PublicCardioBatchSummaryDTO }) data: PublicCardioBatchSummaryDTO;
}

export class PublicExecutionWeatherDTO {
  @ApiProperty() id: string;
  @ApiProperty() workoutExecutionId: string;
  @ApiProperty() latitude: number;
  @ApiProperty() longitude: number;
  @ApiProperty() recordedAt: string;
  @ApiPropertyOptional({ nullable: true }) temperatureCelsius: number | null;
  @ApiPropertyOptional({ nullable: true }) feelsLikeCelsius: number | null;
  @ApiPropertyOptional({ nullable: true }) humidityPercent: number | null;
  @ApiPropertyOptional({ nullable: true }) windSpeedKmh: number | null;
  @ApiPropertyOptional({ nullable: true }) windDirectionDegrees: number | null;
  @ApiPropertyOptional({ nullable: true }) windGustsKmh: number | null;
  @ApiPropertyOptional({ nullable: true }) precipitationMm: number | null;
  @ApiPropertyOptional({ nullable: true }) weatherCode: number | null;
  @ApiPropertyOptional({ nullable: true }) weatherDescription: string | null;
  @ApiPropertyOptional({ nullable: true }) cloudCoverPercent: number | null;
  @ApiPropertyOptional({ nullable: true }) pressureHpa: number | null;
  @ApiPropertyOptional({ nullable: true }) visibilityMeters: number | null;
  @ApiPropertyOptional({ nullable: true }) uvIndex: number | null;
}

export class PublicExecutionWeatherResponse {
  @ApiProperty({ type: PublicExecutionWeatherDTO }) data: PublicExecutionWeatherDTO;
}

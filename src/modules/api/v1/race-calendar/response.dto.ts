import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import type { CourseMetrics, PeriodizationPhase } from './types';

export class RaceEventDTO {
  @ApiProperty()
  id: string;

  @ApiPropertyOptional()
  external_id: string | null;

  @ApiProperty({ enum: ['active', 'runsignup', 'worldtriathlon', 'opentrack', 'manual'] })
  source: 'active' | 'runsignup' | 'worldtriathlon' | 'opentrack' | 'manual';

  @ApiProperty()
  name: string;

  @ApiPropertyOptional()
  description: string | null;

  @ApiProperty({ enum: ['run', 'cycle', 'triathlon', 'swim'] })
  event_type: 'run' | 'cycle' | 'triathlon' | 'swim';

  @ApiProperty()
  date: string;

  @ApiPropertyOptional()
  location_city: string | null;

  @ApiPropertyOptional()
  location_country: string | null;

  @ApiPropertyOptional()
  latitude: number | null;

  @ApiPropertyOptional()
  longitude: number | null;

  @ApiPropertyOptional()
  distance_meters: number | null;

  @ApiPropertyOptional()
  elevation_gain_meters: number | null;

  @ApiPropertyOptional()
  url: string | null;

  @ApiProperty()
  cached_at: string;
}

export class AthleteRaceDTO {
  @ApiProperty()
  id: string;

  @ApiProperty()
  user_id: string;

  @ApiPropertyOptional()
  race_event_id: string | null;

  @ApiPropertyOptional({ type: RaceEventDTO })
  race_event: RaceEventDTO | null;

  @ApiPropertyOptional()
  manual_name: string | null;

  @ApiPropertyOptional()
  manual_date: string | null;

  @ApiPropertyOptional({ enum: ['run', 'cycle', 'triathlon', 'swim'] })
  manual_event_type: 'run' | 'cycle' | 'triathlon' | 'swim' | null;

  @ApiPropertyOptional()
  manual_distance_meters: number | null;

  @ApiPropertyOptional()
  goal_time_seconds: number | null;

  @ApiPropertyOptional({ enum: ['A', 'B', 'C'] })
  priority: 'A' | 'B' | 'C' | null;

  @ApiPropertyOptional()
  course_file_path: string | null;

  @ApiPropertyOptional()
  notes: string | null;

  @ApiProperty()
  created_at: string;

  @ApiProperty()
  updated_at: string;
}

export class PeriodizationPlanDTO {
  @ApiProperty()
  id: string;

  @ApiProperty()
  athlete_race_id: string;

  @ApiProperty({ enum: ['suggested', 'accepted', 'custom'] })
  status: 'suggested' | 'accepted' | 'custom';

  @ApiProperty({ type: 'array' })
  phases: PeriodizationPhase[];

  @ApiProperty({ enum: ['system', 'coach', 'athlete'] })
  created_by: 'system' | 'coach' | 'athlete';

  @ApiProperty()
  created_at: string;

  @ApiProperty()
  modified_at: string;
}

export class CourseUploadResponseDTO {
  @ApiProperty()
  file_path: string;

  @ApiProperty({ enum: ['gpx', 'fit'] })
  file_type: 'gpx' | 'fit';

  @ApiProperty()
  metrics: CourseMetrics;
}

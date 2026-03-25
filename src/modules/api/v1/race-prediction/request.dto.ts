import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type, Transform } from 'class-transformer';
import {
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
  IsBoolean,
  IsIn,
  Min,
  Max,
} from 'class-validator';

export class GeneratePredictionBody {
  @ApiPropertyOptional({ description: 'Override sport type' })
  @IsString()
  @IsOptional()
  sport?: string;

  @ApiPropertyOptional({ description: 'Override distance in meters' })
  @IsNumber()
  @IsOptional()
  @Min(0)
  distance_meters?: number;

  @ApiPropertyOptional({ description: 'Course elevation gain in meters' })
  @IsNumber()
  @IsOptional()
  @Min(0)
  elevation_gain_meters?: number;

  @ApiPropertyOptional({ description: 'Course elevation loss in meters' })
  @IsNumber()
  @IsOptional()
  @Min(0)
  elevation_loss_meters?: number;
}

export class QuickPredictionBody {
  @ApiProperty({ enum: ['run', 'bike', 'swim', 'triathlon'], description: 'Sport type' })
  @IsString()
  sport: string;

  @ApiProperty({ description: 'Distance in meters' })
  @IsNumber()
  @Min(100)
  distance_meters: number;

  @ApiPropertyOptional({ description: 'Target race date for TSB projection' })
  @IsDateString()
  @IsOptional()
  race_date?: string;

  @ApiPropertyOptional({ description: 'Course elevation gain in meters' })
  @IsNumber()
  @IsOptional()
  @Min(0)
  elevation_gain_meters?: number;

  @ApiPropertyOptional({ description: 'Course elevation loss in meters' })
  @IsNumber()
  @IsOptional()
  @Min(0)
  elevation_loss_meters?: number;
}

export class RecordRaceResultBody {
  @ApiProperty({ description: 'Finish time in seconds' })
  @IsNumber()
  @Min(0)
  finish_time_seconds: number;

  @ApiPropertyOptional({ description: 'Race name (if different from registered race)' })
  @IsString()
  @IsOptional()
  race_name?: string;

  @ApiPropertyOptional({ description: 'Whether this is an official result' })
  @IsOptional()
  official_result?: boolean;

  @ApiPropertyOptional({ description: 'Temperature in Celsius' })
  @IsNumber()
  @IsOptional()
  temperature_celsius?: number;

  @ApiPropertyOptional({ description: 'Humidity percentage' })
  @IsNumber()
  @IsOptional()
  humidity_percent?: number;

  @ApiPropertyOptional({ description: 'Total course elevation in meters' })
  @IsNumber()
  @IsOptional()
  course_elevation_meters?: number;
}

export class UpdateProfileMetricsBody {
  @ApiPropertyOptional({ description: 'Birth date (YYYY-MM-DD)' })
  @IsDateString()
  @IsOptional()
  birth_date?: string;

  @ApiPropertyOptional({ enum: ['male', 'female', 'other'], description: 'Gender' })
  @IsString()
  @IsOptional()
  gender?: string;

  @ApiPropertyOptional({ description: 'Weight in kg' })
  @IsNumber()
  @IsOptional()
  @Min(20)
  weight_kg?: number;

  @ApiPropertyOptional({ description: 'Height in cm' })
  @IsNumber()
  @IsOptional()
  @Min(100)
  height_cm?: number;

  @ApiPropertyOptional({ description: 'Years of training experience' })
  @IsNumber()
  @IsOptional()
  @Min(0)
  years_training?: number;

  @ApiPropertyOptional({ description: 'Average weekly training volume in hours' })
  @IsNumber()
  @IsOptional()
  @Min(0)
  weekly_volume_hours?: number;
}

export class PredictionHistoryQuery {
  @ApiPropertyOptional({ enum: ['run', 'bike', 'swim', 'triathlon'], description: 'Filter by sport' })
  @IsString()
  @IsOptional()
  sport?: string;

  @ApiPropertyOptional({ description: 'Limit number of results' })
  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  @Min(1)
  limit?: number;
}

export class TaperPlanQuery {
  @ApiPropertyOptional({ description: 'Target TSB for race day (default: 15)' })
  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  target_tsb?: number;
}

export class CourseBasedPredictionBody {
  @ApiProperty({ enum: ['run'], description: 'Sport type (currently only running supported)' })
  @IsString()
  @IsIn(['run'])
  sport: 'run';

  @ApiPropertyOptional({ description: 'Override total distance in meters (if different from GPX)' })
  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  @Min(100)
  distance_meters?: number;

  @ApiPropertyOptional({
    description: 'Segment distance in meters for split calculation (default: 1000)',
    default: 1000,
  })
  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  @Min(100)
  @Max(10000)
  segment_distance_meters?: number;

  @ApiPropertyOptional({
    description: 'Apply fade factor for longer races (default: false)',
    default: false,
  })
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  @IsOptional()
  apply_fade_factor?: boolean;

  @ApiPropertyOptional({
    description: 'Maximum downhill speed in m/s (default: 4.17 = ~4:00/km pace)',
  })
  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  @Min(3)
  @Max(7)
  downhill_speed_cap_mps?: number;

  @ApiPropertyOptional({
    description: 'Elevation smoothing window in meters (default: 100)',
    default: 100,
  })
  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  @Min(10)
  @Max(500)
  smoothing_window_meters?: number;

  @ApiPropertyOptional({ description: 'Target race date for TSB projection' })
  @IsDateString()
  @IsOptional()
  race_date?: string;
}

export class GenerateRacePlanBody {
  @ApiPropertyOptional({
    enum: ['even', 'negative_split', 'conservative', 'progressive'],
    description: 'Pacing strategy to apply',
    default: 'even',
  })
  @IsString()
  @IsOptional()
  @IsIn(['even', 'negative_split', 'conservative', 'progressive'])
  pacing_strategy?: 'even' | 'negative_split' | 'conservative' | 'progressive';

  @ApiPropertyOptional({
    description: 'Force refresh weather forecast even if cached',
    default: false,
  })
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  @IsOptional()
  force_refresh?: boolean;
}

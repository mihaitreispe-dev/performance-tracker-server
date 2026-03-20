import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsNumber, IsOptional, IsString, IsUUID, Min } from 'class-validator';

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
  @IsNumber()
  @IsOptional()
  @Min(1)
  limit?: number;
}

export class TaperPlanQuery {
  @ApiPropertyOptional({ description: 'Target TSB for race day (default: 15)' })
  @IsNumber()
  @IsOptional()
  target_tsb?: number;
}

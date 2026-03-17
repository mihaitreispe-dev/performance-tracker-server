import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

// Search Races
export class SearchRacesQuery {
  @ApiPropertyOptional({ enum: ['run', 'cycle', 'triathlon', 'swim'] })
  @IsOptional()
  @IsEnum(['run', 'cycle', 'triathlon', 'swim'])
  event_type?: 'run' | 'cycle' | 'triathlon' | 'swim';

  @ApiPropertyOptional({ description: 'Location to search near' })
  @IsOptional()
  @IsString()
  location?: string;

  @ApiPropertyOptional({ description: 'Latitude for geo-search' })
  @IsOptional()
  @Transform(({ value }) => Number.parseFloat(value))
  @IsNumber()
  latitude?: number;

  @ApiPropertyOptional({ description: 'Longitude for geo-search' })
  @IsOptional()
  @Transform(({ value }) => Number.parseFloat(value))
  @IsNumber()
  longitude?: number;

  @ApiPropertyOptional({ description: 'Search radius in km', default: 50 })
  @IsOptional()
  @Transform(({ value }) => Number.parseInt(value, 10))
  @IsInt()
  @Min(1)
  @Max(500)
  radius_km?: number = 50;

  @ApiPropertyOptional({ description: 'Start date (YYYY-MM-DD)' })
  @IsOptional()
  @IsDateString()
  start_date?: string;

  @ApiPropertyOptional({ description: 'End date (YYYY-MM-DD)' })
  @IsOptional()
  @IsDateString()
  end_date?: string;

  @ApiPropertyOptional({ description: 'Page number', default: 1 })
  @IsOptional()
  @Transform(({ value }) => Number.parseInt(value, 10))
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ description: 'Results per page', default: 20 })
  @IsOptional()
  @Transform(({ value }) => Number.parseInt(value, 10))
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}

// Create Athlete Race
export class CreateAthleteRaceBody {
  @ApiPropertyOptional({ description: 'External race event ID' })
  @IsOptional()
  @IsString()
  race_event_id?: string;

  @ApiPropertyOptional({ description: 'Manual race name' })
  @IsOptional()
  @IsString()
  manual_name?: string;

  @ApiPropertyOptional({ description: 'Manual race date (YYYY-MM-DD)' })
  @IsOptional()
  @IsDateString()
  manual_date?: string;

  @ApiPropertyOptional({ enum: ['run', 'cycle', 'triathlon', 'swim'] })
  @IsOptional()
  @IsEnum(['run', 'cycle', 'triathlon', 'swim'])
  manual_event_type?: 'run' | 'cycle' | 'triathlon' | 'swim';

  @ApiPropertyOptional({ description: 'Manual distance in meters' })
  @IsOptional()
  @IsInt()
  @Min(0)
  manual_distance_meters?: number;

  @ApiPropertyOptional({ description: 'Goal time in seconds' })
  @IsOptional()
  @IsInt()
  @Min(0)
  goal_time_seconds?: number;

  @ApiPropertyOptional({ enum: ['A', 'B', 'C'] })
  @IsOptional()
  @IsEnum(['A', 'B', 'C'])
  priority?: 'A' | 'B' | 'C';

  @ApiPropertyOptional({ description: 'Notes about the race' })
  @IsOptional()
  @IsString()
  notes?: string;
}

// Update Athlete Race
export class UpdateAthleteRaceBody {
  @ApiPropertyOptional({ description: 'Goal time in seconds' })
  @IsOptional()
  @IsInt()
  @Min(0)
  goal_time_seconds?: number;

  @ApiPropertyOptional({ enum: ['A', 'B', 'C'] })
  @IsOptional()
  @IsEnum(['A', 'B', 'C'])
  priority?: 'A' | 'B' | 'C';

  @ApiPropertyOptional({ description: 'Notes about the race' })
  @IsOptional()
  @IsString()
  notes?: string;
}

// Generate Periodization
export class GeneratePeriodizationQuery {
  @ApiPropertyOptional({ description: 'Generate new plan if none exists' })
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  generate?: boolean;

  @ApiPropertyOptional({ description: 'Race type for generation' })
  @IsOptional()
  @IsString()
  race_type?: string;

  @ApiPropertyOptional({ enum: ['beginner', 'intermediate', 'advanced'] })
  @IsOptional()
  @IsEnum(['beginner', 'intermediate', 'advanced'])
  athlete_level?: 'beginner' | 'intermediate' | 'advanced';
}

// Update Periodization
export class PeriodizationPhaseDTO {
  @ApiProperty()
  @IsString()
  name: string;

  @ApiProperty()
  @IsDateString()
  start_date: string;

  @ApiProperty()
  @IsDateString()
  end_date: string;

  @ApiProperty()
  @IsInt()
  @Min(1)
  weeks: number;

  @ApiProperty()
  @IsString()
  focus: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string | null;

  @ApiProperty()
  @IsNumber()
  @Min(0)
  @Max(100)
  volume_percentage: number;

  @ApiProperty()
  @IsNumber()
  @Min(0)
  @Max(100)
  intensity_percentage: number;
}

export class UpdatePeriodizationBody {
  @ApiPropertyOptional({ type: [PeriodizationPhaseDTO] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PeriodizationPhaseDTO)
  phases?: PeriodizationPhaseDTO[];

  @ApiPropertyOptional({ enum: ['suggested', 'accepted', 'custom'] })
  @IsOptional()
  @IsEnum(['suggested', 'accepted', 'custom'])
  status?: 'suggested' | 'accepted' | 'custom';
}

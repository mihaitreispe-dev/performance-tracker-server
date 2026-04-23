import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsEnum, IsNumber, IsOptional, IsString, IsUUID, Max, Min, ValidateNested } from 'class-validator';
import { WorkoutFileFormat } from 'src/database/interfaces';
import { IsEnumString } from 'src/lib/validators/is-enum-string';

export class RequestUploadBody {
  @ApiProperty({ description: 'Original file name' })
  @IsString()
  fileName: string;

  @ApiProperty({ description: 'File format', enum: WorkoutFileFormat })
  @IsEnumString(WorkoutFileFormat)
  fileFormat: WorkoutFileFormat;

  @ApiProperty({ description: 'File size in bytes' })
  @IsNumber()
  @Min(1)
  @Max(50 * 1024 * 1024) // 50MB max
  fileSizeBytes: number;

  @ApiPropertyOptional({ description: 'Optional workout schedule ID to link import to' })
  @IsOptional()
  @IsUUID()
  workoutScheduleId?: string;
}

export class WorkoutFileImportIdParam {
  @ApiProperty()
  @IsUUID()
  id: string;
}

/** Workout type for imported activities - matches WorkoutType enum */
export enum ImportSportType {
  RUN = 'run',
  CYCLING = 'cycling',
  SWIMMING = 'swimming',
  STRENGTH = 'strength',
  CARDIO = 'cardio',
  FLEXIBILITY = 'flexibility',
  HIIT = 'hiit',
  CIRCUIT = 'circuit',
  WALKING = 'walking',
  CUSTOM = 'custom',
}

/** Intensity level for lap/step */
export enum LapIntensity {
  ACTIVE = 'active',
  REST = 'rest',
  WARMUP = 'warmup',
  COOLDOWN = 'cooldown',
}

/** Parsed lap/step data for preview */
export class ParsedLapDTO {
  @ApiProperty()
  @IsNumber()
  lapNumber: number;

  @ApiProperty({ description: 'Total duration including pauses' })
  @IsNumber()
  durationSeconds: number;

  @ApiPropertyOptional({ description: 'Elapsed time excluding pauses (moving time)' })
  @IsOptional()
  @IsNumber()
  elapsedTimeSeconds?: number;

  @ApiProperty()
  @IsNumber()
  distanceMeters: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  avgHeartRate?: number;

  @ApiPropertyOptional({ description: 'Average pace calculated from elapsed time' })
  @IsOptional()
  @IsNumber()
  avgPaceSecondsPerKm?: number;

  @ApiPropertyOptional({ description: 'Detected step name (e.g., "Warm Up", "Interval", "Recovery")' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ description: 'Intensity level', enum: LapIntensity })
  @IsOptional()
  @IsEnum(LapIntensity)
  intensity?: LapIntensity;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}

/** Request body for confirming an import with (possibly modified) workout data */
export class ConfirmImportBody {
  @ApiProperty({ description: 'Workout name' })
  @IsString()
  workoutName: string;

  @ApiPropertyOptional({ description: 'Workout description' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ description: 'Sport type', enum: ImportSportType })
  @IsEnum(ImportSportType)
  sportType: ImportSportType;

  @ApiProperty({ description: 'Laps/steps for the workout', type: [ParsedLapDTO] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ParsedLapDTO)
  laps: ParsedLapDTO[];

  @ApiPropertyOptional({ description: 'Optional workout schedule ID to link import to' })
  @IsOptional()
  @IsUUID()
  workoutScheduleId?: string;
}

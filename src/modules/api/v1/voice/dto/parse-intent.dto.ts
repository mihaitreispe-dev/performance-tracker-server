import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsObject, IsOptional, IsString, ValidateNested } from 'class-validator';
import { ItemResponse } from 'src/lib/http/dto/item-response.dto';

// Intent types
export enum VoiceIntentType {
  // Queries (Read Operations)
  GET_FITNESS_FATIGUE = 'get_fitness_fatigue',
  GET_VO2MAX_HISTORY = 'get_vo2max_history',
  GET_SLEEP_LOG = 'get_sleep_log',
  GET_TRAINING_LOAD = 'get_training_load',
  GET_PERSONAL_RECORDS = 'get_personal_records',
  GET_PERIOD_SUMMARY = 'get_period_summary',

  // Commands (Write Operations)
  CREATE_WORKOUT = 'create_workout',
  CREATE_WORKOUT_PLAN = 'create_workout_plan',
  SCHEDULE_WORKOUT = 'schedule_workout',
  LOG_SLEEP = 'log_sleep',

  // Special
  UNKNOWN = 'unknown',
  BLOCKED = 'blocked',
  CLARIFICATION_NEEDED = 'clarification_needed',
}

// Request DTOs
export class ParseIntentBody {
  @ApiProperty({ description: 'Text to parse for intent (from transcription or direct text input)' })
  @IsString()
  text: string;

  @ApiPropertyOptional({ description: 'Conversation context for follow-up questions' })
  @IsArray()
  @IsOptional()
  conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>;
}

// Response DTOs
export class ExerciseMatchDTO {
  @ApiProperty({ description: 'Original exercise name from user input' })
  @IsString()
  originalName: string;

  @ApiProperty({ description: 'Possible matching exercises from the database' })
  @IsArray()
  matches: Array<{
    id: string;
    name: string;
    similarity: number;
  }>;
}

export class IntentParametersDTO {
  @ApiPropertyOptional({ description: 'Number of days for historical queries' })
  @IsOptional()
  days?: number;

  @ApiPropertyOptional({ description: 'Specific date for queries (ISO string)' })
  @IsString()
  @IsOptional()
  date?: string;

  @ApiPropertyOptional({ description: 'Start date for date range queries (ISO string)' })
  @IsString()
  @IsOptional()
  startDate?: string;

  @ApiPropertyOptional({ description: 'End date for date range queries (ISO string)' })
  @IsString()
  @IsOptional()
  endDate?: string;

  @ApiPropertyOptional({ description: 'Exercise names for workout creation' })
  @IsArray()
  @IsOptional()
  exercises?: string[];

  @ApiPropertyOptional({ description: 'Workout name' })
  @IsString()
  @IsOptional()
  workoutName?: string;

  @ApiPropertyOptional({ description: 'Workout ID for scheduling' })
  @IsString()
  @IsOptional()
  workoutId?: string;

  @ApiPropertyOptional({ description: 'Schedule date (ISO string)' })
  @IsString()
  @IsOptional()
  scheduleDate?: string;

  @ApiPropertyOptional({ description: 'Sleep duration in hours' })
  @IsOptional()
  sleepHours?: number;

  @ApiPropertyOptional({ description: 'Sleep quality (1-5)' })
  @IsOptional()
  sleepQuality?: number;

  @ApiPropertyOptional({ description: 'Plan details for workout plan creation' })
  @IsOptional()
  planDetails?: Array<{
    day: string;
    workoutType: string;
  }>;
}

export class ParsedIntentDTO {
  @ApiProperty({ description: 'Detected intent type', enum: VoiceIntentType })
  @IsString()
  intent: VoiceIntentType;

  @ApiProperty({ description: 'Parsed parameters for the intent' })
  @IsObject()
  @ValidateNested()
  @Type(() => IntentParametersDTO)
  parameters: IntentParametersDTO;

  @ApiProperty({ description: 'Whether this action requires user confirmation' })
  @IsBoolean()
  requiresConfirmation: boolean;

  @ApiPropertyOptional({ description: 'Human-readable description of what will be done' })
  @IsString()
  @IsOptional()
  actionDescription?: string;

  @ApiPropertyOptional({ description: 'Reason if intent is blocked or unknown' })
  @IsString()
  @IsOptional()
  blockedReason?: string;

  @ApiPropertyOptional({ description: 'Exercise matches needing clarification' })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ExerciseMatchDTO)
  @IsOptional()
  exerciseMatches?: ExerciseMatchDTO[];

  @ApiPropertyOptional({ description: 'Clarification question to ask the user' })
  @IsString()
  @IsOptional()
  clarificationQuestion?: string;

  @ApiProperty({ description: 'Confidence score for intent detection (0.0-1.0)' })
  confidence: number;
}

export class ParseIntentResponse extends ItemResponse<ParsedIntentDTO> {
  @ApiProperty()
  @IsObject({ always: true })
  @ValidateNested()
  declare data: ParsedIntentDTO;
}

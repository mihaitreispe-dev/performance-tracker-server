import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDateString, IsInt, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';

export class RecoveryJournalEntryBody {
  @ApiPropertyOptional({ description: 'Sleep quality rating (1-5)', minimum: 1, maximum: 5 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  sleepQualityRating?: number;

  @ApiPropertyOptional({ description: 'Time to fall asleep in minutes' })
  @IsOptional()
  @IsInt()
  @Min(0)
  sleepLatencyMinutes?: number;

  @ApiPropertyOptional({ description: 'Number of sleep disturbances' })
  @IsOptional()
  @IsInt()
  @Min(0)
  sleepDisturbances?: number;

  @ApiPropertyOptional({ description: 'Perceived recovery (1-10)', minimum: 1, maximum: 10 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  perceivedRecovery?: number;

  @ApiPropertyOptional({ description: 'Muscle soreness level (1-10)', minimum: 1, maximum: 10 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  muscleSoreness?: number;

  @ApiPropertyOptional({ description: 'Energy level (1-10)', minimum: 1, maximum: 10 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  energyLevel?: number;

  @ApiPropertyOptional({ description: 'Mood rating (1-10)', minimum: 1, maximum: 10 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  mood?: number;

  @ApiPropertyOptional({ description: 'Stress level (1-10)', minimum: 1, maximum: 10 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  stressLevel?: number;

  @ApiPropertyOptional({ description: 'Motivation level (1-10)', minimum: 1, maximum: 10 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  motivationLevel?: number;

  @ApiPropertyOptional({ description: 'Caffeine intake in mg' })
  @IsOptional()
  @IsInt()
  @Min(0)
  caffeineMg?: number;

  @ApiPropertyOptional({ description: 'Caffeine cutoff time (HH:MM format)', example: '14:00' })
  @IsOptional()
  @IsString()
  caffeineCutoffTime?: string;

  @ApiPropertyOptional({ description: 'Alcohol units consumed' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  alcoholUnits?: number;

  @ApiPropertyOptional({ description: 'Water intake in liters' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  hydrationLiters?: number;

  @ApiPropertyOptional({ description: 'Meal quality rating (1-5)', minimum: 1, maximum: 5 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  mealQuality?: number;

  @ApiPropertyOptional({ description: 'Injury concerns or notes' })
  @IsOptional()
  @IsString()
  injuryConcerns?: string;

  @ApiPropertyOptional({ description: 'Additional notes' })
  @IsOptional()
  @IsString()
  notes?: string;
}

export class CreateRecoveryJournalEntryBody extends RecoveryJournalEntryBody {
  @ApiProperty({ description: 'Entry date (YYYY-MM-DD)', example: '2024-01-15' })
  @IsDateString()
  entryDate!: string;
}

export class UpdateRecoveryJournalEntryBody extends RecoveryJournalEntryBody {}

export class RecoveryJournalDateParam {
  @ApiProperty({ description: 'Date (YYYY-MM-DD)', example: '2024-01-15' })
  @IsDateString()
  date!: string;
}

export class RecoveryJournalIdParam {
  @ApiProperty({ description: 'Recovery journal entry ID' })
  @IsString()
  id!: string;
}

export class RecoveryJournalHistoryQuery {
  @ApiPropertyOptional({ description: 'Number of days to look back', default: 30 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  days?: number;
}

export class RecoveryJournalCorrelationQuery {
  @ApiPropertyOptional({ description: 'Number of days to analyze', default: 30 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(7)
  @Max(365)
  days?: number;
}

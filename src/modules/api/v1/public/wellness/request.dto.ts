import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

import { BodyPart, BodyView, InjuryType, PainTrend } from 'src/database/interfaces';

export class ClientIdParam {
  @IsUUID()
  id: string;
}

export class ExecutionIdParam {
  @IsUUID()
  id: string;
}

export class ListDateRangeQuery {
  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number = 0;

  @ApiPropertyOptional({ default: 50, maximum: 200 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number = 50;

  @ApiPropertyOptional({ description: 'ISO date. Inclusive lower bound.' })
  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @ApiPropertyOptional({ description: 'ISO date. Inclusive upper bound.' })
  @IsOptional()
  @IsDateString()
  dateTo?: string;
}

// ---- Profile metrics ----

export class UpdateProfileMetricsBody {
  @ApiPropertyOptional({ description: 'ISO date.' })
  @IsOptional()
  @IsDateString()
  birthDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  gender?: string;

  @ApiPropertyOptional({ description: 'Kilograms.' })
  @IsOptional()
  @IsNumber()
  weightKg?: number;

  @ApiPropertyOptional({ description: 'Centimetres.' })
  @IsOptional()
  @IsNumber()
  heightCm?: number;
}

// ---- Sleep ----

export class SleepLogBody {
  @ApiProperty({ description: 'ISO date.' })
  @IsDateString()
  logDate: string;

  @ApiPropertyOptional({ description: 'ISO datetime.' })
  @IsOptional()
  @IsDateString()
  startTime?: string;

  @ApiPropertyOptional({ description: 'ISO datetime.' })
  @IsOptional()
  @IsDateString()
  endTime?: string;

  @ApiProperty()
  @IsInt()
  @Min(0)
  totalDurationSeconds: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(20)
  @Max(220)
  avgRestingHr?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(300)
  avgHrv?: number;
}

// ---- Pain ----

export class PainLogBody {
  @ApiProperty({ enum: BodyPart })
  @IsEnum(BodyPart)
  bodyPart: BodyPart;

  @ApiProperty({ enum: BodyView })
  @IsEnum(BodyView)
  bodyView: BodyView;

  @ApiProperty({ description: '1–10' })
  @IsInt()
  @Min(1)
  @Max(10)
  painLevel: number;

  @ApiProperty({ description: 'Percentage of workout (0–100) when pain started.' })
  @IsInt()
  @Min(0)
  @Max(100)
  painDurationStart: number;

  @ApiProperty({ description: 'Percentage of workout (0–100) when pain ended (or 100 if ongoing).' })
  @IsInt()
  @Min(0)
  @Max(100)
  painDurationEnd: number;

  @ApiProperty({ enum: PainTrend })
  @IsEnum(PainTrend)
  painTrend: PainTrend;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isInjury?: boolean;

  @ApiPropertyOptional({ enum: InjuryType })
  @IsOptional()
  @IsEnum(InjuryType)
  injuryType?: InjuryType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  expectedRecoveryDays?: number;
}

// ---- Recovery journal ----

export class RecoveryJournalBody {
  @ApiProperty({ description: 'ISO date.' })
  @IsDateString()
  entryDate: string;

  @ApiPropertyOptional({ description: '1–5' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  sleepQualityRating?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  sleepLatencyMinutes?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  sleepDisturbances?: number;

  @ApiPropertyOptional({ description: '1–10' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  perceivedRecovery?: number;

  @ApiPropertyOptional({ description: '1–10' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  muscleSoreness?: number;

  @ApiPropertyOptional({ description: '1–10' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  energyLevel?: number;

  @ApiPropertyOptional({ description: '1–10' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  mood?: number;

  @ApiPropertyOptional({ description: '1–10' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  stressLevel?: number;

  @ApiPropertyOptional({ description: '1–10' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  motivationLevel?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  caffeineMg?: number;

  @ApiPropertyOptional({ description: 'HH:MM format.' })
  @IsOptional()
  @IsString()
  caffeineCutoffTime?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  alcoholUnits?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  hydrationLiters?: number;

  @ApiPropertyOptional({ description: '1–5' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  mealQuality?: number;
}

// ---- Wellness check-ins ----

export class WellnessCheckinBody {
  @ApiProperty({ description: 'ISO date.' })
  @IsDateString()
  checkinDate: string;

  @ApiPropertyOptional({ description: '1–5' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  sleepQuality?: number;

  @ApiPropertyOptional({ description: '1–5' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  energyLevel?: number;

  @ApiPropertyOptional({ description: '1–5 (5 = no soreness)' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  muscleSoreness?: number;

  @ApiPropertyOptional({ description: '1–5 (5 = no stress)' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  stressLevel?: number;

  @ApiPropertyOptional({ description: '1–5' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  trainingReadiness?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  completionSeconds?: number;
}

// ---- Nutrition ----

export class UpsertNutritionSummaryBody {
  @ApiProperty({ description: 'ISO date.' })
  @IsDateString()
  date: string;

  @ApiPropertyOptional() @IsOptional() @IsNumber() totalCalories?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() totalProtein?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() totalCarbs?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() totalFat?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() totalFiber?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() totalSugar?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() totalSodium?: number;
}

export class UpsertNutritionGoalsBody {
  @ApiPropertyOptional() @IsOptional() @IsNumber() dailyCalories?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() proteinG?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() carbsG?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() fatG?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() fiberG?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() proteinPercent?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() carbsPercent?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() fatPercent?: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() autoCalculateFromWeight?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsNumber() caloriesPerKg?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() proteinGPerKg?: number;
}

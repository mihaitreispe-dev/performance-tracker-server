import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { PublicListMeta } from '../response.dto';

export class PublicProfileMetricsDTO {
  @ApiProperty() userId: string;
  @ApiPropertyOptional({ nullable: true }) weightKg: number | null;
  @ApiPropertyOptional({ nullable: true }) heightCm: number | null;
  @ApiPropertyOptional({ nullable: true }) birthDate: string | null;
  @ApiPropertyOptional({ nullable: true }) gender: string | null;
  @ApiPropertyOptional({ nullable: true }) yearsTraining: number | null;
  @ApiPropertyOptional({ nullable: true }) weeklyVolumeHours: number | null;
}

export class PublicProfileMetricsResponse {
  @ApiProperty({ type: PublicProfileMetricsDTO }) data: PublicProfileMetricsDTO;
}

export class PublicSleepLogDTO {
  @ApiProperty() id: string;
  @ApiProperty() userId: string;
  @ApiProperty() logDate: string;
  @ApiPropertyOptional({ nullable: true }) startTime: string | null;
  @ApiPropertyOptional({ nullable: true }) endTime: string | null;
  @ApiProperty() totalDurationSeconds: number;
  @ApiPropertyOptional({ nullable: true }) avgRestingHr: number | null;
  @ApiPropertyOptional({ nullable: true }) avgHrv: number | null;
  @ApiProperty() source: string;
}
export class PublicSleepLogResponse { @ApiProperty({ type: PublicSleepLogDTO }) data: PublicSleepLogDTO; }
export class PublicSleepLogListResponse {
  @ApiProperty({ type: [PublicSleepLogDTO] }) data: PublicSleepLogDTO[];
  @ApiProperty({ type: PublicListMeta }) meta: PublicListMeta;
}

export class PublicPainLogDTO {
  @ApiProperty() id: string;
  @ApiProperty() userId: string;
  @ApiProperty() workoutExecutionId: string;
  @ApiProperty() bodyPart: string;
  @ApiProperty() bodyView: string;
  @ApiProperty() painLevel: number;
  @ApiProperty() painDurationStart: number;
  @ApiProperty() painDurationEnd: number;
  @ApiProperty() painTrend: string;
  @ApiPropertyOptional({ nullable: true }) notes: string | null;
  @ApiProperty() isInjury: boolean;
  @ApiPropertyOptional({ nullable: true }) injuryType: string | null;
  @ApiPropertyOptional({ nullable: true }) expectedRecoveryDays: number | null;
  @ApiProperty() createdAt: string;
}
export class PublicPainLogResponse { @ApiProperty({ type: PublicPainLogDTO }) data: PublicPainLogDTO; }
export class PublicPainLogListResponse {
  @ApiProperty({ type: [PublicPainLogDTO] }) data: PublicPainLogDTO[];
  @ApiProperty({ type: PublicListMeta }) meta: PublicListMeta;
}

export class PublicRecoveryEntryDTO {
  @ApiProperty() id: string;
  @ApiProperty() userId: string;
  @ApiProperty() entryDate: string;
  @ApiPropertyOptional({ nullable: true }) sleepQualityRating: number | null;
  @ApiPropertyOptional({ nullable: true }) sleepLatencyMinutes: number | null;
  @ApiPropertyOptional({ nullable: true }) sleepDisturbances: number | null;
  @ApiPropertyOptional({ nullable: true }) perceivedRecovery: number | null;
  @ApiPropertyOptional({ nullable: true }) muscleSoreness: number | null;
  @ApiPropertyOptional({ nullable: true }) energyLevel: number | null;
  @ApiPropertyOptional({ nullable: true }) mood: number | null;
  @ApiPropertyOptional({ nullable: true }) stressLevel: number | null;
  @ApiPropertyOptional({ nullable: true }) motivationLevel: number | null;
  @ApiPropertyOptional({ nullable: true }) caffeineMg: number | null;
  @ApiPropertyOptional({ nullable: true }) caffeineCutoffTime: string | null;
  @ApiPropertyOptional({ nullable: true }) alcoholUnits: number | null;
  @ApiPropertyOptional({ nullable: true }) hydrationLiters: number | null;
  @ApiPropertyOptional({ nullable: true }) mealQuality: number | null;
}
export class PublicRecoveryEntryResponse { @ApiProperty({ type: PublicRecoveryEntryDTO }) data: PublicRecoveryEntryDTO; }
export class PublicRecoveryEntryListResponse {
  @ApiProperty({ type: [PublicRecoveryEntryDTO] }) data: PublicRecoveryEntryDTO[];
  @ApiProperty({ type: PublicListMeta }) meta: PublicListMeta;
}

export class PublicWellnessCheckinDTO {
  @ApiProperty() id: string;
  @ApiProperty() userId: string;
  @ApiProperty() checkinDate: string;
  @ApiPropertyOptional({ nullable: true }) sleepQuality: number | null;
  @ApiPropertyOptional({ nullable: true }) energyLevel: number | null;
  @ApiPropertyOptional({ nullable: true }) muscleSoreness: number | null;
  @ApiPropertyOptional({ nullable: true }) stressLevel: number | null;
  @ApiPropertyOptional({ nullable: true }) trainingReadiness: number | null;
  @ApiPropertyOptional({ nullable: true }) completionSeconds: number | null;
  @ApiProperty() source: string;
}
export class PublicWellnessCheckinResponse { @ApiProperty({ type: PublicWellnessCheckinDTO }) data: PublicWellnessCheckinDTO; }
export class PublicWellnessCheckinListResponse {
  @ApiProperty({ type: [PublicWellnessCheckinDTO] }) data: PublicWellnessCheckinDTO[];
  @ApiProperty({ type: PublicListMeta }) meta: PublicListMeta;
}

export class PublicNutritionSummaryDTO {
  @ApiProperty() id: string;
  @ApiProperty() userId: string;
  @ApiProperty() date: string;
  @ApiProperty() totalCalories: number;
  @ApiProperty() totalProtein: number;
  @ApiProperty() totalCarbs: number;
  @ApiProperty() totalFat: number;
  @ApiProperty() totalFiber: number;
  @ApiProperty() totalSugar: number;
  @ApiProperty() totalSodium: number;
}
export class PublicNutritionSummaryResponse { @ApiProperty({ type: PublicNutritionSummaryDTO }) data: PublicNutritionSummaryDTO; }
export class PublicNutritionSummaryListResponse {
  @ApiProperty({ type: [PublicNutritionSummaryDTO] }) data: PublicNutritionSummaryDTO[];
  @ApiProperty({ type: PublicListMeta }) meta: PublicListMeta;
}

export class PublicNutritionGoalsDTO {
  @ApiProperty() userId: string;
  @ApiPropertyOptional({ nullable: true }) dailyCalories: number | null;
  @ApiPropertyOptional({ nullable: true }) proteinG: number | null;
  @ApiPropertyOptional({ nullable: true }) carbsG: number | null;
  @ApiPropertyOptional({ nullable: true }) fatG: number | null;
  @ApiPropertyOptional({ nullable: true }) fiberG: number | null;
  @ApiPropertyOptional({ nullable: true }) proteinPercent: number | null;
  @ApiPropertyOptional({ nullable: true }) carbsPercent: number | null;
  @ApiPropertyOptional({ nullable: true }) fatPercent: number | null;
  @ApiProperty() autoCalculateFromWeight: boolean;
  @ApiPropertyOptional({ nullable: true }) caloriesPerKg: number | null;
  @ApiPropertyOptional({ nullable: true }) proteinGPerKg: number | null;
}
export class PublicNutritionGoalsResponse { @ApiProperty({ type: PublicNutritionGoalsDTO }) data: PublicNutritionGoalsDTO; }

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsNumber, IsObject, IsOptional, IsString, IsUUID, ValidateNested } from 'class-validator';
import { PersonalRecordType, WorkoutType } from 'src/database/interfaces';
import { ItemResponse } from 'src/lib/http/dto/item-response.dto';
import { IsEnumString } from 'src/lib/validators/is-enum-string';

// Base PR DTO
export class PersonalRecordDTO {
  @ApiProperty()
  @IsUUID()
  id: string;

  @ApiProperty({ enum: PersonalRecordType })
  @IsEnumString(PersonalRecordType)
  recordType: PersonalRecordType;

  @ApiPropertyOptional({ type: String })
  @IsUUID()
  @IsOptional()
  exerciseId?: string | null;

  @ApiPropertyOptional({ type: String })
  @IsString()
  @IsOptional()
  exerciseName?: string | null;

  @ApiPropertyOptional({ enum: WorkoutType, description: 'Sport type for cardio PRs (run, cycling, swimming)' })
  @IsEnumString(WorkoutType)
  @IsOptional()
  workoutType?: WorkoutType | null;

  @ApiProperty()
  @IsNumber()
  value: number;

  @ApiProperty()
  @IsString()
  unit: string;

  @ApiProperty({ description: 'Formatted value for display (e.g., "120 kg", "23:45", "10.5 km")' })
  @IsString()
  formattedValue: string;

  @ApiProperty()
  @IsUUID()
  workoutExecutionId: string;

  @ApiProperty()
  @IsString()
  achievedAt: string;

  @ApiProperty()
  @IsString()
  createdAt: string;

  @ApiProperty()
  @IsString()
  updatedAt: string;
}

// List PRs response
export class PersonalRecordListDTO {
  @ApiProperty({ type: [PersonalRecordDTO] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PersonalRecordDTO)
  records: PersonalRecordDTO[];
}

export class PersonalRecordListResponse extends ItemResponse<PersonalRecordListDTO> {
  @ApiProperty()
  @IsObject({ always: true })
  @ValidateNested()
  declare data: PersonalRecordListDTO;
}

// Exercise PRs response
export class ExercisePRsDTO {
  @ApiProperty()
  @IsUUID()
  exerciseId: string;

  @ApiProperty()
  @IsString()
  exerciseName: string;

  @ApiPropertyOptional({ type: PersonalRecordDTO })
  @ValidateNested()
  @Type(() => PersonalRecordDTO)
  @IsOptional()
  maxWeight?: PersonalRecordDTO | null;

  @ApiPropertyOptional({ type: PersonalRecordDTO })
  @ValidateNested()
  @Type(() => PersonalRecordDTO)
  @IsOptional()
  maxReps?: PersonalRecordDTO | null;

  @ApiPropertyOptional({ type: PersonalRecordDTO })
  @ValidateNested()
  @Type(() => PersonalRecordDTO)
  @IsOptional()
  maxVolumeSet?: PersonalRecordDTO | null;
}

export class ExercisePRsResponse extends ItemResponse<ExercisePRsDTO> {
  @ApiProperty()
  @IsObject({ always: true })
  @ValidateNested()
  declare data: ExercisePRsDTO;
}

// Evolution point
export class PREvolutionPointDTO {
  @ApiProperty()
  @IsNumber()
  value: number;

  @ApiProperty()
  @IsString()
  formattedValue: string;

  @ApiProperty()
  @IsString()
  achievedAt: string;

  @ApiProperty()
  @IsUUID()
  workoutExecutionId: string;
}

export class PREvolutionDTO {
  @ApiProperty({ enum: PersonalRecordType })
  @IsEnumString(PersonalRecordType)
  recordType: PersonalRecordType;

  @ApiPropertyOptional({ type: String })
  @IsUUID()
  @IsOptional()
  exerciseId?: string | null;

  @ApiPropertyOptional({ type: String })
  @IsString()
  @IsOptional()
  exerciseName?: string | null;

  @ApiProperty()
  @IsString()
  unit: string;

  @ApiProperty({ type: [PREvolutionPointDTO] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PREvolutionPointDTO)
  history: PREvolutionPointDTO[];

  @ApiPropertyOptional({ type: PersonalRecordDTO })
  @ValidateNested()
  @Type(() => PersonalRecordDTO)
  @IsOptional()
  currentBest?: PersonalRecordDTO | null;
}

export class PREvolutionResponse extends ItemResponse<PREvolutionDTO> {
  @ApiProperty()
  @IsObject({ always: true })
  @ValidateNested()
  declare data: PREvolutionDTO;
}

// Period comparison
export class PeriodPRSummaryDTO {
  @ApiProperty()
  @IsString()
  periodStart: string;

  @ApiProperty()
  @IsString()
  periodEnd: string;

  @ApiProperty()
  @IsNumber()
  prCount: number;

  @ApiProperty({ type: [PersonalRecordDTO] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PersonalRecordDTO)
  prs: PersonalRecordDTO[];
}

export class PeriodComparisonDTO {
  @ApiProperty({ type: PeriodPRSummaryDTO })
  @ValidateNested()
  @Type(() => PeriodPRSummaryDTO)
  period1: PeriodPRSummaryDTO;

  @ApiProperty({ type: PeriodPRSummaryDTO })
  @ValidateNested()
  @Type(() => PeriodPRSummaryDTO)
  period2: PeriodPRSummaryDTO;

  @ApiProperty({ description: 'Percentage change from period 2 to period 1' })
  @IsNumber()
  changePercentage: number;
}

export class PeriodComparisonResponse extends ItemResponse<PeriodComparisonDTO> {
  @ApiProperty()
  @IsObject({ always: true })
  @ValidateNested()
  declare data: PeriodComparisonDTO;
}

// Recent PRs
export class RecentPRDTO {
  @ApiProperty()
  @IsUUID()
  id: string;

  @ApiProperty({ enum: PersonalRecordType })
  @IsEnumString(PersonalRecordType)
  recordType: PersonalRecordType;

  @ApiPropertyOptional({ type: String })
  @IsUUID()
  @IsOptional()
  exerciseId?: string | null;

  @ApiPropertyOptional({ type: String })
  @IsString()
  @IsOptional()
  exerciseName?: string | null;

  @ApiPropertyOptional({ enum: WorkoutType, description: 'Sport type for cardio PRs' })
  @IsEnumString(WorkoutType)
  @IsOptional()
  workoutType?: WorkoutType | null;

  @ApiProperty()
  @IsNumber()
  value: number;

  @ApiProperty()
  @IsString()
  unit: string;

  @ApiProperty()
  @IsString()
  formattedValue: string;

  @ApiProperty()
  @IsString()
  achievedAt: string;

  @ApiPropertyOptional({ type: Number, description: 'Improvement over previous PR' })
  @IsNumber()
  @IsOptional()
  improvement?: number | null;

  @ApiPropertyOptional({ type: Number, description: 'Improvement percentage' })
  @IsNumber()
  @IsOptional()
  improvementPercentage?: number | null;
}

export class RecentPRsDTO {
  @ApiProperty({ type: [RecentPRDTO] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RecentPRDTO)
  recentPRs: RecentPRDTO[];

  @ApiProperty()
  @IsNumber()
  totalCount: number;
}

export class RecentPRsResponse extends ItemResponse<RecentPRsDTO> {
  @ApiProperty()
  @IsObject({ always: true })
  @ValidateNested()
  declare data: RecentPRsDTO;
}

// PR History (all records for a specific type, sorted by value)
export class PRHistoryRecordDTO {
  @ApiProperty()
  @IsUUID()
  id: string;

  @ApiProperty({ enum: PersonalRecordType })
  @IsEnumString(PersonalRecordType)
  recordType: PersonalRecordType;

  @ApiPropertyOptional({ type: String })
  @IsUUID()
  @IsOptional()
  exerciseId?: string | null;

  @ApiPropertyOptional({ type: String })
  @IsString()
  @IsOptional()
  exerciseName?: string | null;

  @ApiPropertyOptional({ enum: WorkoutType })
  @IsEnumString(WorkoutType)
  @IsOptional()
  workoutType?: WorkoutType | null;

  @ApiProperty()
  @IsNumber()
  value: number;

  @ApiProperty()
  @IsString()
  unit: string;

  @ApiProperty()
  @IsString()
  formattedValue: string;

  @ApiProperty()
  @IsUUID()
  workoutExecutionId: string;

  @ApiProperty()
  @IsString()
  achievedAt: string;

  @ApiProperty({ description: 'Whether this is the current best' })
  @IsBoolean()
  isCurrent: boolean;

  @ApiProperty({ description: 'Rank in history (1 = best)' })
  @IsNumber()
  rank: number;
}

export class PRHistoryDTO {
  @ApiProperty({ enum: PersonalRecordType })
  @IsEnumString(PersonalRecordType)
  recordType: PersonalRecordType;

  @ApiPropertyOptional({ type: String })
  @IsUUID()
  @IsOptional()
  exerciseId?: string | null;

  @ApiPropertyOptional({ type: String })
  @IsString()
  @IsOptional()
  exerciseName?: string | null;

  @ApiProperty()
  @IsString()
  unit: string;

  @ApiProperty({ type: [PRHistoryRecordDTO], description: 'All historical records sorted by value (best first)' })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PRHistoryRecordDTO)
  records: PRHistoryRecordDTO[];

  @ApiProperty()
  @IsNumber()
  totalCount: number;
}

export class PRHistoryResponse extends ItemResponse<PRHistoryDTO> {
  @ApiProperty()
  @IsObject({ always: true })
  @ValidateNested()
  declare data: PRHistoryDTO;
}

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsNumber, IsObject, IsOptional, IsString, ValidateNested } from 'class-validator';
import { FitnessMetricType, TrainingRecommendation } from 'src/database/interfaces';
import { ItemResponse } from 'src/lib/http/dto/item-response.dto';
import { IsEnumString } from 'src/lib/validators/is-enum-string';

// VO2 Max

export class Vo2MaxDTO {
  @ApiPropertyOptional({ type: Number, description: 'VO2 max value in ml/kg/min' })
  @IsNumber()
  @IsOptional()
  value?: number | null;

  @ApiProperty({ description: 'Confidence score (0.0-1.0)' })
  @IsNumber()
  confidence: number;

  @ApiProperty({ description: 'Number of data points used for calculation' })
  @IsNumber()
  dataPointsUsed: number;

  @ApiProperty({ description: 'Algorithm used for calculation' })
  @IsString()
  algorithm: string;

  @ApiPropertyOptional({ type: String, description: 'Reason if calculation failed' })
  @IsString()
  @IsOptional()
  reason?: string | null;

  @ApiPropertyOptional({ type: String, description: 'Fitness category based on VO2 max' })
  @IsString()
  @IsOptional()
  fitnessCategory?: string | null;

  @ApiPropertyOptional({ type: Number, description: 'Percentile rank for age/gender' })
  @IsNumber()
  @IsOptional()
  percentileRank?: number | null;
}

export class Vo2MaxResponse extends ItemResponse<Vo2MaxDTO> {
  @ApiProperty()
  @IsObject({ always: true })
  @ValidateNested()
  declare data: Vo2MaxDTO;
}

export class Vo2MaxHistoryPointDTO {
  @ApiProperty({ type: String, format: 'date-time' })
  @IsString()
  calculatedAt: string;

  @ApiProperty({ description: 'VO2 max value in ml/kg/min' })
  @IsNumber()
  value: number;

  @ApiProperty({ description: 'Confidence score (0.0-1.0)' })
  @IsNumber()
  confidence: number;
}

export class Vo2MaxHistoryDTO {
  @ApiProperty({ type: [Vo2MaxHistoryPointDTO] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => Vo2MaxHistoryPointDTO)
  history: Vo2MaxHistoryPointDTO[];

  @ApiPropertyOptional({ type: Number, description: 'Change from first to last value' })
  @IsNumber()
  @IsOptional()
  changeFromStart?: number | null;

  @ApiPropertyOptional({ type: Number, description: 'Change from 30 days ago' })
  @IsNumber()
  @IsOptional()
  changeFrom30Days?: number | null;
}

export class Vo2MaxHistoryResponse extends ItemResponse<Vo2MaxHistoryDTO> {
  @ApiProperty()
  @IsObject({ always: true })
  @ValidateNested()
  declare data: Vo2MaxHistoryDTO;
}

// Fitness/Fatigue (PMC)

export class FitnessFatiguePointDTO {
  @ApiProperty({ type: String, format: 'date' })
  @IsString()
  date: string;

  @ApiProperty({ description: 'Chronic Training Load (Fitness)' })
  @IsNumber()
  ctl: number;

  @ApiProperty({ description: 'Acute Training Load (Fatigue)' })
  @IsNumber()
  atl: number;

  @ApiProperty({ description: 'Training Stress Balance (Form)' })
  @IsNumber()
  tsb: number;

  @ApiProperty({ description: 'Total TSS for the day' })
  @IsNumber()
  dailyTss: number;

  @ApiPropertyOptional({ type: Number, description: 'Weekly CTL change rate' })
  @IsNumber()
  @IsOptional()
  rampRate?: number | null;

  @ApiProperty({ enum: TrainingRecommendation })
  @IsEnumString(TrainingRecommendation)
  recommendation: TrainingRecommendation;
}

export class CurrentFormDTO {
  @ApiProperty({ description: 'Current CTL (Fitness)' })
  @IsNumber()
  ctl: number;

  @ApiProperty({ description: 'Current ATL (Fatigue)' })
  @IsNumber()
  atl: number;

  @ApiProperty({ description: 'Current TSB (Form)' })
  @IsNumber()
  tsb: number;

  @ApiProperty({ enum: TrainingRecommendation })
  @IsEnumString(TrainingRecommendation)
  recommendation: TrainingRecommendation;

  @ApiProperty({ description: 'Human-readable recommendation text' })
  @IsString()
  recommendationText: string;
}

export class FitnessFatigueDTO {
  @ApiProperty({ type: [FitnessFatiguePointDTO] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FitnessFatiguePointDTO)
  data: FitnessFatiguePointDTO[];

  @ApiProperty({ type: CurrentFormDTO })
  @IsObject()
  @ValidateNested()
  @Type(() => CurrentFormDTO)
  currentForm: CurrentFormDTO;
}

export class FitnessFatigueResponse extends ItemResponse<FitnessFatigueDTO> {
  @ApiProperty()
  @IsObject({ always: true })
  @ValidateNested()
  declare data: FitnessFatigueDTO;
}

// Training Stress

export class TrainingStressDTO {
  @ApiPropertyOptional({ type: Number, description: 'Training Stress Score' })
  @IsNumber()
  @IsOptional()
  tss?: number | null;

  @ApiPropertyOptional({ type: Number, description: 'Training Impulse (TRIMP)' })
  @IsNumber()
  @IsOptional()
  trimp?: number | null;

  @ApiPropertyOptional({ type: Number, description: 'Aerobic Training Effect (0.0-5.0)' })
  @IsNumber()
  @IsOptional()
  aerobicTE?: number | null;

  @ApiPropertyOptional({ type: Number, description: 'Anaerobic Training Effect (0.0-5.0)' })
  @IsNumber()
  @IsOptional()
  anaerobicTE?: number | null;

  @ApiPropertyOptional({ type: Number, description: 'Estimated recovery time in hours' })
  @IsNumber()
  @IsOptional()
  estimatedRecoveryHours?: number | null;

  @ApiPropertyOptional({ type: Number, description: 'Intensity Factor' })
  @IsNumber()
  @IsOptional()
  intensityFactor?: number | null;

  @ApiPropertyOptional({ type: Number, description: 'Heart Rate Stress Score' })
  @IsNumber()
  @IsOptional()
  hrss?: number | null;

  @ApiPropertyOptional({ type: Number, description: 'Normalized Pace (min/km)' })
  @IsNumber()
  @IsOptional()
  normalizedPace?: number | null;

  @ApiPropertyOptional({ type: Number, description: 'Normalized Power (watts)' })
  @IsNumber()
  @IsOptional()
  normalizedPower?: number | null;
}

export class TrainingStressResponse extends ItemResponse<TrainingStressDTO> {
  @ApiProperty()
  @IsObject({ always: true })
  @ValidateNested()
  declare data: TrainingStressDTO;
}

// Thresholds

export class ThresholdDTO {
  @ApiProperty({ enum: FitnessMetricType })
  @IsEnumString(FitnessMetricType)
  metricType: FitnessMetricType;

  @ApiProperty({ description: 'Threshold value' })
  @IsNumber()
  value: number;

  @ApiProperty({ description: 'Confidence score (0.0-1.0)' })
  @IsNumber()
  confidence: number;

  @ApiProperty({ type: String, format: 'date-time' })
  @IsString()
  calculatedAt: string;

  @ApiProperty({ description: 'Source of the value (calculated, manual, imported)' })
  @IsString()
  source: string;
}

export class ThresholdsDTO {
  @ApiProperty({ type: [ThresholdDTO] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ThresholdDTO)
  thresholds: ThresholdDTO[];
}

export class ThresholdsResponse extends ItemResponse<ThresholdsDTO> {
  @ApiProperty()
  @IsObject({ always: true })
  @ValidateNested()
  declare data: ThresholdsDTO;
}

export class ThresholdOverrideDTO {
  @ApiProperty({ enum: FitnessMetricType })
  @IsEnumString(FitnessMetricType)
  metricType: FitnessMetricType;

  @ApiProperty({ description: 'Threshold value' })
  @IsNumber()
  value: number;

  @ApiProperty({ type: String, format: 'date-time' })
  @IsString()
  updatedAt: string;
}

export class ThresholdOverrideResponse extends ItemResponse<ThresholdOverrideDTO> {
  @ApiProperty()
  @IsObject({ always: true })
  @ValidateNested()
  declare data: ThresholdOverrideDTO;
}

// Prediction

export class FitnessFatiguePredictionDTO {
  @ApiProperty({ type: [FitnessFatiguePointDTO] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FitnessFatiguePointDTO)
  predictions: FitnessFatiguePointDTO[];
}

export class FitnessFatiguePredictionResponse extends ItemResponse<FitnessFatiguePredictionDTO> {
  @ApiProperty()
  @IsObject({ always: true })
  @ValidateNested()
  declare data: FitnessFatiguePredictionDTO;
}

// Multi-Stream Load

export class StreamLoadDTO {
  @ApiProperty({ description: 'Chronic Training Load' })
  @IsNumber()
  ctl: number;

  @ApiProperty({ description: 'Acute Training Load' })
  @IsNumber()
  atl: number;

  @ApiProperty({ description: 'Training Stress Balance' })
  @IsNumber()
  tsb: number;

  @ApiProperty({ description: 'Daily load contribution' })
  @IsNumber()
  dailyLoad: number;
}

export class MultiStreamLoadDTO {
  @ApiProperty({ type: String, format: 'date' })
  @IsString()
  date: string;

  @ApiProperty({ type: StreamLoadDTO })
  @IsObject()
  @ValidateNested()
  @Type(() => StreamLoadDTO)
  aerobic: StreamLoadDTO;

  @ApiProperty({ type: StreamLoadDTO })
  @IsObject()
  @ValidateNested()
  @Type(() => StreamLoadDTO)
  msk: StreamLoadDTO;

  @ApiProperty({ type: StreamLoadDTO })
  @IsObject()
  @ValidateNested()
  @Type(() => StreamLoadDTO)
  neural: StreamLoadDTO;

  @ApiPropertyOptional({ type: Number, description: 'Composite readiness score (0-100)' })
  @IsNumber()
  @IsOptional()
  readinessScore?: number | null;

  @ApiPropertyOptional({ type: String, description: 'Reason for readiness override' })
  @IsString()
  @IsOptional()
  readinessOverrideReason?: string | null;
}

export class MultiStreamLoadResponse extends ItemResponse<MultiStreamLoadDTO> {
  @ApiProperty()
  @IsObject({ always: true })
  @ValidateNested()
  declare data: MultiStreamLoadDTO;
}

export class MultiStreamLoadHistoryDTO {
  @ApiProperty({ type: [MultiStreamLoadDTO] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MultiStreamLoadDTO)
  data: MultiStreamLoadDTO[];
}

export class MultiStreamLoadHistoryResponse extends ItemResponse<MultiStreamLoadHistoryDTO> {
  @ApiProperty()
  @IsObject({ always: true })
  @ValidateNested()
  declare data: MultiStreamLoadHistoryDTO;
}

// HRV Baseline

export class HrvBaselineDTO {
  @ApiProperty({ type: String, format: 'date' })
  @IsString()
  date: string;

  @ApiPropertyOptional({ type: Number })
  @IsNumber()
  @IsOptional()
  hrvValue?: number | null;

  @ApiPropertyOptional({ type: Number })
  @IsNumber()
  @IsOptional()
  restingHr?: number | null;

  @ApiPropertyOptional({ type: Number })
  @IsNumber()
  @IsOptional()
  hrv7DayAvg?: number | null;

  @ApiPropertyOptional({ type: Number })
  @IsNumber()
  @IsOptional()
  hrv7DayStd?: number | null;

  @ApiPropertyOptional({ type: Number })
  @IsNumber()
  @IsOptional()
  hrvZscore?: number | null;

  @ApiProperty({ description: 'Whether HRV is suppressed' })
  @IsOptional()
  isSuppressed?: boolean;

  @ApiPropertyOptional({ type: String, enum: ['mild', 'moderate', 'severe'] })
  @IsString()
  @IsOptional()
  suppressionSeverity?: string | null;
}

export class HrvBaselineResponse extends ItemResponse<HrvBaselineDTO> {
  @ApiProperty()
  @IsObject({ always: true })
  @ValidateNested()
  declare data: HrvBaselineDTO;
}

export class HrvBaselineHistoryDTO {
  @ApiProperty({ type: [HrvBaselineDTO] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => HrvBaselineDTO)
  data: HrvBaselineDTO[];
}

export class HrvBaselineHistoryResponse extends ItemResponse<HrvBaselineHistoryDTO> {
  @ApiProperty()
  @IsObject({ always: true })
  @ValidateNested()
  declare data: HrvBaselineHistoryDTO;
}

// Readiness

export class DailyReadinessDTO {
  @ApiProperty({ type: String, format: 'date' })
  @IsString()
  date: string;

  @ApiProperty({ description: 'Composite readiness score (0-100)' })
  @IsNumber()
  readinessScore: number;

  @ApiPropertyOptional({ type: Number })
  @IsNumber()
  @IsOptional()
  hrvZscore?: number | null;

  @ApiProperty({ description: 'Aerobic TSB' })
  @IsNumber()
  aerobicTsb: number;

  @ApiProperty({ description: 'Musculoskeletal TSB' })
  @IsNumber()
  mskTsb: number;

  @ApiProperty({ description: 'Neural TSB' })
  @IsNumber()
  neuralTsb: number;

  @ApiPropertyOptional({ type: String, enum: ['aerobic', 'msk', 'neural', 'hrv'] })
  @IsString()
  @IsOptional()
  limitingFactor?: string | null;

  @ApiProperty({ description: 'Whether HRV override was applied' })
  @IsOptional()
  hrvOverride?: boolean;

  @ApiPropertyOptional({ type: Number })
  @IsNumber()
  @IsOptional()
  journalContribution?: number | null;
}

export class DailyReadinessResponse extends ItemResponse<DailyReadinessDTO> {
  @ApiProperty()
  @IsObject({ always: true })
  @ValidateNested()
  declare data: DailyReadinessDTO;
}

export class ReadinessHistoryDTO {
  @ApiProperty({ type: [DailyReadinessDTO] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DailyReadinessDTO)
  data: DailyReadinessDTO[];
}

export class ReadinessHistoryResponse extends ItemResponse<ReadinessHistoryDTO> {
  @ApiProperty()
  @IsObject({ always: true })
  @ValidateNested()
  declare data: ReadinessHistoryDTO;
}

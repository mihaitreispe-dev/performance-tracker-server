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

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

// RPE-TSS Correlation

export class RpeTssDataPointDTO {
  @ApiProperty({ type: String, format: 'date' })
  @IsString()
  date: string;

  @ApiPropertyOptional({ type: String })
  @IsString()
  @IsOptional()
  workoutName?: string | null;

  @ApiProperty({ description: 'Session RPE (1-10)' })
  @IsNumber()
  sessionRpe: number;

  @ApiProperty({ description: 'sRPE-TSS (session RPE × duration)' })
  @IsNumber()
  srpeTss: number;

  @ApiPropertyOptional({ type: Number, description: 'Calculated TSS from power/pace/HR' })
  @IsNumber()
  @IsOptional()
  calculatedTss?: number | null;

  @ApiPropertyOptional({ type: Number, description: 'Ratio of sRPE-TSS to calculated TSS' })
  @IsNumber()
  @IsOptional()
  rpeTssRatio?: number | null;
}

export class RpeTssCorrelationDTO {
  @ApiProperty({ type: [RpeTssDataPointDTO] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RpeTssDataPointDTO)
  dataPoints: RpeTssDataPointDTO[];

  @ApiPropertyOptional({ type: Number, description: 'Average RPE:TSS ratio (target ~1.0)' })
  @IsNumber()
  @IsOptional()
  averageRatio?: number | null;

  @ApiProperty({ enum: ['increasing', 'stable', 'decreasing'], description: 'Trend direction of ratio' })
  @IsString()
  ratioTrend: 'increasing' | 'stable' | 'decreasing';

  @ApiProperty({ description: 'True if avg ratio > 1.3 over 7+ days' })
  accumulatedFatigueWarning: boolean;
}

export class RpeTssCorrelationResponse extends ItemResponse<RpeTssCorrelationDTO> {
  @ApiProperty()
  @IsObject({ always: true })
  @ValidateNested()
  declare data: RpeTssCorrelationDTO;
}

// Wellness-Performance Correlation

export class WellnessCorrelationDTO {
  @ApiProperty({ enum: ['sleep', 'stress', 'soreness', 'energy'] })
  @IsString()
  factor: 'sleep' | 'stress' | 'soreness' | 'energy';

  @ApiProperty({ description: 'Pearson correlation coefficient with performance (-1 to 1)' })
  @IsNumber()
  correlationWithPerformance: number;

  @ApiPropertyOptional({ type: Number, description: 'Statistical p-value' })
  @IsNumber()
  @IsOptional()
  pValue?: number | null;
}

export class WellnessPerformanceCorrelationDTO {
  @ApiProperty({ type: [WellnessCorrelationDTO] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WellnessCorrelationDTO)
  correlations: WellnessCorrelationDTO[];

  @ApiProperty({ description: 'Overtraining risk score (0-100)' })
  @IsNumber()
  overtrainingRiskScore: number;

  @ApiProperty({ type: [String], description: 'Contributing risk factors' })
  @IsArray()
  @IsString({ each: true })
  riskFactors: string[];
}

export class WellnessPerformanceCorrelationResponse extends ItemResponse<WellnessPerformanceCorrelationDTO> {
  @ApiProperty()
  @IsObject({ always: true })
  @ValidateNested()
  declare data: WellnessPerformanceCorrelationDTO;
}

// Readiness Trends

export type SimpleRecommendation = 'push' | 'maintain' | 'recover';

export type DivergenceType = 'load_up_hrv_down' | 'load_up_recovery_down' | 'none';

export class DivergenceAnalysisDTO {
  @ApiProperty({ description: 'Whether a divergence pattern is detected' })
  hasDivergence: boolean;

  @ApiProperty({ enum: ['load_up_hrv_down', 'load_up_recovery_down', 'none'] })
  @IsString()
  divergenceType: DivergenceType;

  @ApiPropertyOptional({ enum: ['warning', 'alert'], description: 'Severity of divergence' })
  @IsString()
  @IsOptional()
  severity: 'warning' | 'alert' | null;

  @ApiProperty({ enum: ['rising', 'stable', 'falling'] })
  @IsString()
  loadTrend: 'rising' | 'stable' | 'falling';

  @ApiProperty({ enum: ['rising', 'stable', 'falling', 'insufficient_data'] })
  @IsString()
  hrvTrend: 'rising' | 'stable' | 'falling' | 'insufficient_data';

  @ApiPropertyOptional({ type: Number, description: 'Days since divergence started' })
  @IsNumber()
  @IsOptional()
  daysSinceDivergence: number | null;

  @ApiPropertyOptional({ type: String, description: 'Human-readable divergence message' })
  @IsString()
  @IsOptional()
  message: string | null;
}

export class ReadinessTrendPointDTO {
  @ApiProperty({ type: String, format: 'date' })
  @IsString()
  date: string;

  @ApiProperty({ description: 'Combined ATL normalized 0-100' })
  @IsNumber()
  compositeLoad: number;

  @ApiPropertyOptional({ type: Number, description: 'HRV z-score' })
  @IsNumber()
  @IsOptional()
  hrvZscore: number | null;

  @ApiProperty({ description: 'Readiness score (0-100)' })
  @IsNumber()
  readinessScore: number;

  @ApiProperty({ enum: ['push', 'maintain', 'recover'] })
  @IsString()
  simpleRecommendation: SimpleRecommendation;
}

export class ReadinessTrendsPeriodDTO {
  @ApiProperty({ type: String, format: 'date' })
  @IsString()
  startDate: string;

  @ApiProperty({ type: String, format: 'date' })
  @IsString()
  endDate: string;

  @ApiProperty({ description: 'Number of days with data' })
  @IsNumber()
  daysWithData: number;
}

export class ReadinessTrendsDTO {
  @ApiProperty({ type: [ReadinessTrendPointDTO] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReadinessTrendPointDTO)
  data: ReadinessTrendPointDTO[];

  @ApiProperty({ type: DivergenceAnalysisDTO })
  @IsObject()
  @ValidateNested()
  @Type(() => DivergenceAnalysisDTO)
  divergence: DivergenceAnalysisDTO;

  @ApiProperty({ type: ReadinessTrendsPeriodDTO })
  @IsObject()
  @ValidateNested()
  @Type(() => ReadinessTrendsPeriodDTO)
  period: ReadinessTrendsPeriodDTO;
}

export class ReadinessTrendsResponse extends ItemResponse<ReadinessTrendsDTO> {
  @ApiProperty()
  @IsObject({ always: true })
  @ValidateNested()
  declare data: ReadinessTrendsDTO;
}

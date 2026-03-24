import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsNumber, IsObject, IsOptional, IsString, ValidateNested } from 'class-validator';
import {
  ACWRRiskLevel,
  FitnessMetricType,
  OvertrainingRiskLevel,
  TrainingRecommendation,
} from 'src/database/interfaces';
import { ItemResponse } from 'src/lib/http/dto/item-response.dto';
import { IsEnumString } from 'src/lib/validators/is-enum-string';

// VO2 Max

export type Vo2MaxAlgorithm = 'firstbeat_style' | 'hr_ratio' | 'cycling_power' | 'cooper_test' | 'manual';
export type Vo2MaxSport = 'running' | 'cycling' | 'general';

export class Vo2MaxConfidenceIntervalDTO {
  @ApiProperty({ description: 'Lower bound of 95% confidence interval' })
  @IsNumber()
  lower: number;

  @ApiProperty({ description: 'Upper bound of 95% confidence interval' })
  @IsNumber()
  upper: number;
}

export class Vo2MaxMetadataDTO {
  @ApiPropertyOptional({ type: Number, description: 'R-squared value from regression' })
  @IsNumber()
  @IsOptional()
  rSquared?: number;

  @ApiPropertyOptional({ type: Number, description: 'Number of steady-state segments used' })
  @IsNumber()
  @IsOptional()
  segmentsUsed?: number;

  @ApiPropertyOptional({ type: Number, description: 'Lookback period in days' })
  @IsNumber()
  @IsOptional()
  lookbackDays?: number;

  @ApiPropertyOptional({ description: 'Whether EWMA smoothing was applied' })
  @IsOptional()
  ewmaApplied?: boolean;
}

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

  @ApiProperty({
    enum: ['firstbeat_style', 'hr_ratio', 'cycling_power', 'cooper_test', 'manual'],
    description: 'Algorithm used for calculation',
  })
  @IsString()
  algorithm: Vo2MaxAlgorithm;

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

  @ApiPropertyOptional({ enum: ['running', 'cycling', 'general'], description: 'Sport this estimate applies to' })
  @IsString()
  @IsOptional()
  sport?: Vo2MaxSport | null;

  @ApiPropertyOptional({ type: Vo2MaxConfidenceIntervalDTO, description: '95% confidence interval' })
  @IsObject()
  @IsOptional()
  @ValidateNested()
  @Type(() => Vo2MaxConfidenceIntervalDTO)
  confidenceInterval?: Vo2MaxConfidenceIntervalDTO | null;

  @ApiPropertyOptional({ type: Vo2MaxMetadataDTO, description: 'Additional calculation metadata' })
  @IsObject()
  @IsOptional()
  @ValidateNested()
  @Type(() => Vo2MaxMetadataDTO)
  metadata?: Vo2MaxMetadataDTO;
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

  @ApiPropertyOptional({ type: Number, description: 'Acute:Chronic Workload Ratio for injury risk assessment' })
  @IsNumber()
  @IsOptional()
  acwr?: number | null;

  @ApiPropertyOptional({
    enum: ACWRRiskLevel,
    description: 'ACWR risk level: undertraining (<0.8), optimal (0.8-1.3), elevated (1.3-1.5), high (>1.5)',
  })
  @IsString()
  @IsOptional()
  acwrRiskLevel?: ACWRRiskLevel | null;

  @ApiPropertyOptional({ type: Number, description: 'Training monotony (7-day avg load / std dev)' })
  @IsNumber()
  @IsOptional()
  monotony?: number | null;

  @ApiPropertyOptional({ type: Number, description: 'Training strain (weekly load × monotony)' })
  @IsNumber()
  @IsOptional()
  strain?: number | null;

  @ApiPropertyOptional({ enum: OvertrainingRiskLevel, description: 'Overtraining risk based on monotony/strain' })
  @IsString()
  @IsOptional()
  overtrainingRisk?: OvertrainingRiskLevel | null;
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

// Enhanced Readiness (v2)

export class RecoveryBlockScoresDTO {
  @ApiProperty({ description: 'Sleep score (0-100)' })
  @IsNumber()
  sleepScore: number;

  @ApiProperty({ description: 'Nocturnal HRV score (0-100)' })
  @IsNumber()
  nocturnalHrvScore: number;

  @ApiProperty({ description: 'RHR delta score (0-100)' })
  @IsNumber()
  rhrDeltaScore: number;

  @ApiProperty({ description: 'HR nadir score (0-100)' })
  @IsNumber()
  hrNadirScore: number;

  @ApiProperty({ description: 'Combined block score (0-100)' })
  @IsNumber()
  blockScore: number;

  @ApiProperty({ description: 'Weight applied to this block (0-1)' })
  @IsNumber()
  weight: number;
}

export class LoadBlockScoresDTO {
  @ApiProperty({ description: 'Aerobic TSB score (0-100)' })
  @IsNumber()
  aerobicTsbScore: number;

  @ApiProperty({ description: 'MSK TSB score (0-100)' })
  @IsNumber()
  mskTsbScore: number;

  @ApiProperty({ description: 'Neural TSB score (0-100)' })
  @IsNumber()
  neuralTsbScore: number;

  @ApiProperty({ description: 'Monotony penalty (0-15 points)' })
  @IsNumber()
  monotonyPenalty: number;

  @ApiProperty({ description: 'Strain penalty (0-15 points)' })
  @IsNumber()
  strainPenalty: number;

  @ApiProperty({ description: 'Combined block score (0-100)' })
  @IsNumber()
  blockScore: number;

  @ApiProperty({ description: 'Weight applied to this block (0-1)' })
  @IsNumber()
  weight: number;
}

export class SubjectiveBlockScoresDTO {
  @ApiProperty({ description: 'Quick wellness score (0-100)' })
  @IsNumber()
  quickWellnessScore: number;

  @ApiProperty({ description: 'Journal score (0-100)' })
  @IsNumber()
  journalScore: number;

  @ApiProperty({ description: 'Combined block score (0-100)' })
  @IsNumber()
  blockScore: number;

  @ApiProperty({ description: 'Weight applied to this block (0-1)' })
  @IsNumber()
  weight: number;
}

export class IllnessBlockScoresDTO {
  @ApiProperty({ description: 'Alcohol penalty (0-25 points)' })
  @IsNumber()
  alcoholPenalty: number;

  @ApiProperty({ description: 'Whether illness override is active' })
  illnessOverride: boolean;

  @ApiPropertyOptional({ type: Number, description: 'Illness severity (1-10)' })
  @IsNumber()
  @IsOptional()
  illnessSeverity: number | null;

  @ApiProperty({ description: 'Combined block score (0-100)' })
  @IsNumber()
  blockScore: number;

  @ApiProperty({ description: 'Weight applied to this block (0-1)' })
  @IsNumber()
  weight: number;
}

export class ReadinessComponentScoresDTO {
  @ApiProperty({ type: RecoveryBlockScoresDTO })
  @IsObject()
  @ValidateNested()
  @Type(() => RecoveryBlockScoresDTO)
  recovery: RecoveryBlockScoresDTO;

  @ApiProperty({ type: LoadBlockScoresDTO })
  @IsObject()
  @ValidateNested()
  @Type(() => LoadBlockScoresDTO)
  load: LoadBlockScoresDTO;

  @ApiProperty({ type: SubjectiveBlockScoresDTO })
  @IsObject()
  @ValidateNested()
  @Type(() => SubjectiveBlockScoresDTO)
  subjective: SubjectiveBlockScoresDTO;

  @ApiProperty({ type: IllnessBlockScoresDTO })
  @IsObject()
  @ValidateNested()
  @Type(() => IllnessBlockScoresDTO)
  illness: IllnessBlockScoresDTO;
}

export class ReadinessConfidenceDTO {
  @ApiProperty({ description: 'Overall confidence (0-1)' })
  @IsNumber()
  overall: number;

  @ApiProperty({ description: 'Data completeness (0-1)' })
  @IsNumber()
  dataCompleteness: number;

  @ApiProperty({ description: 'Baseline quality (0-1)' })
  @IsNumber()
  baselineQuality: number;
}

export type DataQualityLevel = 'excellent' | 'good' | 'fair' | 'poor' | 'minimal';

export class ReadinessComponentsDTO {
  @ApiProperty({ description: 'Aerobic contribution (0-100)' })
  @IsNumber()
  aerobicContribution: number;

  @ApiProperty({ description: 'MSK contribution (0-100)' })
  @IsNumber()
  mskContribution: number;

  @ApiProperty({ description: 'Neural contribution (0-100)' })
  @IsNumber()
  neuralContribution: number;

  @ApiProperty({ description: 'HRV contribution (0-100)' })
  @IsNumber()
  hrvContribution: number;

  @ApiProperty({ description: 'Journal contribution (0-100)' })
  @IsNumber()
  journalContribution: number;

  @ApiProperty({ description: 'Quick wellness contribution (0-100)' })
  @IsNumber()
  quickWellnessContribution: number;

  @ApiProperty({ description: 'Sleep contribution (0-100)' })
  @IsNumber()
  sleepContribution: number;
}

export type ReadinessRecommendation =
  | 'peak_ready'
  | 'ready_for_hard'
  | 'moderate_load'
  | 'easy_day'
  | 'rest_recommended'
  | 'rest_required';

export class EnhancedDailyReadinessDTO {
  @ApiProperty({ type: String, format: 'date' })
  @IsString()
  date: string;

  @ApiProperty({ description: 'Composite readiness score (0-100)' })
  @IsNumber()
  readinessScore: number;

  @ApiProperty({ description: 'Limiting factor description' })
  @IsString()
  limitingFactor: string;

  @ApiPropertyOptional({ type: String, enum: ['aerobic', 'msk', 'neural'] })
  @IsString()
  @IsOptional()
  limitingStream: string | null;

  @ApiProperty({ description: 'Whether HRV is suppressed' })
  isHrvSuppressed: boolean;

  @ApiPropertyOptional({ type: String, description: 'Override reason if applied' })
  @IsString()
  @IsOptional()
  overrideReason: string | null;

  @ApiProperty({ type: ReadinessComponentsDTO })
  @IsObject()
  @ValidateNested()
  @Type(() => ReadinessComponentsDTO)
  components: ReadinessComponentsDTO;

  @ApiProperty({
    enum: ['peak_ready', 'ready_for_hard', 'moderate_load', 'easy_day', 'rest_recommended', 'rest_required'],
  })
  @IsString()
  recommendation: ReadinessRecommendation;

  @ApiProperty({ type: ReadinessConfidenceDTO })
  @IsObject()
  @ValidateNested()
  @Type(() => ReadinessConfidenceDTO)
  confidence: ReadinessConfidenceDTO;

  @ApiProperty({ type: ReadinessComponentScoresDTO })
  @IsObject()
  @ValidateNested()
  @Type(() => ReadinessComponentScoresDTO)
  componentScores: ReadinessComponentScoresDTO;

  @ApiProperty({ enum: ['excellent', 'good', 'fair', 'poor', 'minimal'] })
  @IsString()
  dataQuality: DataQualityLevel;

  @ApiProperty({ description: 'Version of the readiness algorithm' })
  @IsNumber()
  version: number;
}

export class EnhancedDailyReadinessResponse extends ItemResponse<EnhancedDailyReadinessDTO> {
  @ApiProperty()
  @IsObject({ always: true })
  @ValidateNested()
  declare data: EnhancedDailyReadinessDTO;
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

// Bayesian Diagnostics

export type ConvergenceStatus = 'converging' | 'stable' | 'diverging' | 'insufficient_data';

export class ParameterDriftDTO {
  @ApiProperty({ description: 'Parameter name' })
  @IsString()
  param: string;

  @ApiProperty({ description: 'Current parameter value' })
  @IsNumber()
  current: number;

  @ApiProperty({ description: 'Default parameter value' })
  @IsNumber()
  default: number;

  @ApiProperty({ description: 'Percent change from default' })
  @IsNumber()
  percentChange: number;
}

export class BayesianDiagnosticsDTO {
  @ApiProperty({ description: 'Model confidence (0.0-1.0)' })
  @IsNumber()
  confidence: number;

  @ApiProperty({ description: 'Number of data points used for learning' })
  @IsNumber()
  dataPointsUsed: number;

  @ApiPropertyOptional({ type: Number, description: 'Mean Absolute Error over last 7 days' })
  @IsNumber()
  @IsOptional()
  mae7day?: number | null;

  @ApiPropertyOptional({ type: Number, description: 'Mean Absolute Error over last 30 days' })
  @IsNumber()
  @IsOptional()
  mae30day?: number | null;

  @ApiProperty({
    enum: ['converging', 'stable', 'diverging', 'insufficient_data'],
    description: 'Model convergence status',
  })
  @IsString()
  convergenceStatus: ConvergenceStatus;

  @ApiProperty({ type: [ParameterDriftDTO], description: 'Parameters that have drifted from defaults' })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ParameterDriftDTO)
  parameterDrifts: ParameterDriftDTO[];

  @ApiProperty({ description: 'Number of recent parameter rollbacks' })
  @IsNumber()
  recentRollbacks: number;

  @ApiPropertyOptional({ type: String, format: 'date', description: 'Next scheduled parameter update date' })
  @IsString()
  @IsOptional()
  nextUpdateDate?: string | null;

  @ApiPropertyOptional({ type: String, format: 'date-time', description: 'Last parameter update date' })
  @IsString()
  @IsOptional()
  lastUpdateDate?: string | null;
}

export class BayesianDiagnosticsResponse extends ItemResponse<BayesianDiagnosticsDTO> {
  @ApiProperty()
  @IsObject({ always: true })
  @ValidateNested()
  declare data: BayesianDiagnosticsDTO;
}

// LTHR (Lactate Threshold Heart Rate)

export type LthrMethod = 'peak_rolling' | 'hrmc' | 'tt_segment' | 'race_effort' | 'manual';
export type LthrSport = 'running' | 'cycling' | 'general';

export class LthrMetadataDTO {
  @ApiProperty({ description: 'Number of data points used for calculation' })
  @IsNumber()
  dataPointsUsed: number;

  @ApiProperty({ description: 'Number of workouts analyzed' })
  @IsNumber()
  workoutsAnalyzed: number;

  @ApiProperty({ description: 'Lookback period in days' })
  @IsNumber()
  lookbackDays: number;

  @ApiPropertyOptional({ type: Number, description: 'Peak 20-minute HR' })
  @IsNumber()
  @IsOptional()
  peak20?: number | null;

  @ApiPropertyOptional({ type: Number, description: 'Peak 60-minute HR' })
  @IsNumber()
  @IsOptional()
  peak60?: number | null;

  @ApiPropertyOptional({ type: Number, description: 'HRMC (maximal constant HR) value' })
  @IsNumber()
  @IsOptional()
  hrmcValue?: number | null;

  @ApiPropertyOptional({ type: Number, description: 'HRMC window duration in minutes' })
  @IsNumber()
  @IsOptional()
  hrmcWindowMinutes?: number | null;
}

export class LthrEstimateDTO {
  @ApiProperty({ description: 'LTHR value in bpm' })
  @IsNumber()
  value: number;

  @ApiProperty({ description: 'Confidence score (0.0-1.0)' })
  @IsNumber()
  confidence: number;

  @ApiProperty({
    enum: ['peak_rolling', 'hrmc', 'tt_segment', 'race_effort', 'manual'],
    description: 'Estimation method used',
  })
  @IsString()
  method: LthrMethod;

  @ApiProperty({ enum: ['running', 'cycling', 'general'], description: 'Sport this LTHR applies to' })
  @IsString()
  sport: LthrSport;

  @ApiProperty({ type: String, format: 'date-time', description: 'When this estimate was calculated' })
  @IsString()
  calculatedAt: string;

  @ApiPropertyOptional({ type: Number, description: 'LTHR as percentage of max HR (if max HR is known)' })
  @IsNumber()
  @IsOptional()
  percentOfMaxHR?: number | null;

  @ApiProperty({ type: LthrMetadataDTO, description: 'Calculation metadata' })
  @IsObject()
  @ValidateNested()
  @Type(() => LthrMetadataDTO)
  metadata: LthrMetadataDTO;
}

export class LthrResponse extends ItemResponse<LthrEstimateDTO> {
  @ApiProperty()
  @IsObject({ always: true })
  @ValidateNested()
  declare data: LthrEstimateDTO;
}

export class LthrHistoryPointDTO {
  @ApiProperty({ description: 'LTHR value in bpm' })
  @IsNumber()
  value: number;

  @ApiProperty({ description: 'Confidence score (0.0-1.0)' })
  @IsNumber()
  confidence: number;

  @ApiProperty({
    enum: ['peak_rolling', 'hrmc', 'tt_segment', 'race_effort', 'manual'],
    description: 'Estimation method used',
  })
  @IsString()
  method: LthrMethod;

  @ApiProperty({ enum: ['running', 'cycling', 'general'], description: 'Sport this LTHR applies to' })
  @IsString()
  sport: LthrSport;

  @ApiProperty({ type: String, format: 'date-time' })
  @IsString()
  calculatedAt: string;
}

export class LthrHistoryDTO {
  @ApiProperty({ type: [LthrHistoryPointDTO] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LthrHistoryPointDTO)
  history: LthrHistoryPointDTO[];

  @ApiPropertyOptional({ type: Number, description: 'Change from first to last value' })
  @IsNumber()
  @IsOptional()
  changeFromStart?: number | null;
}

export class LthrHistoryResponse extends ItemResponse<LthrHistoryDTO> {
  @ApiProperty()
  @IsObject({ always: true })
  @ValidateNested()
  declare data: LthrHistoryDTO;
}

export class LthrZoneDTO {
  @ApiProperty({ description: 'Zone number (1-6)' })
  @IsNumber()
  zone: number;

  @ApiProperty({ description: 'Zone name' })
  @IsString()
  name: string;

  @ApiProperty({ description: 'Minimum HR for this zone' })
  @IsNumber()
  minHR: number;

  @ApiProperty({ description: 'Maximum HR for this zone' })
  @IsNumber()
  maxHR: number;

  @ApiProperty({ description: 'Minimum % of LTHR' })
  @IsNumber()
  minPctLthr: number;

  @ApiProperty({ description: 'Maximum % of LTHR' })
  @IsNumber()
  maxPctLthr: number;
}

export class LthrZonesDTO {
  @ApiProperty({ description: 'LTHR value these zones are based on' })
  @IsNumber()
  lthr: number;

  @ApiProperty({ type: [LthrZoneDTO] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LthrZoneDTO)
  zones: LthrZoneDTO[];
}

export class LthrZonesResponse extends ItemResponse<LthrZonesDTO> {
  @ApiProperty()
  @IsObject({ always: true })
  @ValidateNested()
  declare data: LthrZonesDTO;
}

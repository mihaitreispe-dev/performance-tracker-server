import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { CoachAthleteStatus } from 'src/database/interfaces';
import { ItemResponse } from 'src/lib/http/dto/item-response.dto';
import { IsEnumString } from 'src/lib/validators/is-enum-string';

export class UserBasicDTO {
  @ApiProperty()
  @IsUUID()
  id: string;

  @ApiProperty()
  @IsString()
  email: string;

  @ApiProperty()
  @IsString()
  displayName: string;

  @ApiPropertyOptional({ type: String })
  @IsString()
  @IsOptional()
  firstName?: string | null;

  @ApiPropertyOptional({ type: String })
  @IsString()
  @IsOptional()
  lastName?: string | null;

  @ApiPropertyOptional({ type: String })
  @IsString()
  @IsOptional()
  picture?: string | null;
}

export class InvitationDTO {
  @ApiProperty()
  @IsUUID()
  id: string;

  @ApiProperty()
  @IsObject()
  @ValidateNested()
  coach: UserBasicDTO;

  @ApiProperty({ enum: CoachAthleteStatus })
  @IsEnumString(CoachAthleteStatus)
  status: CoachAthleteStatus;

  @ApiPropertyOptional({ type: String })
  @IsString()
  @IsOptional()
  message?: string | null;

  @ApiProperty()
  @IsString()
  invitedAt: string;
}

export class AthleteDTO {
  @ApiProperty()
  @IsUUID()
  id: string;

  @ApiProperty()
  @IsObject()
  @ValidateNested()
  user: UserBasicDTO;

  @ApiProperty({ enum: CoachAthleteStatus })
  @IsEnumString(CoachAthleteStatus)
  status: CoachAthleteStatus;

  @ApiProperty()
  @IsString()
  invitedAt: string;

  @ApiPropertyOptional({ type: String })
  @IsString()
  @IsOptional()
  respondedAt?: string | null;
}

export class CoachDTO {
  @ApiProperty()
  @IsUUID()
  id: string;

  @ApiProperty()
  @IsObject()
  @ValidateNested()
  user: UserBasicDTO;

  @ApiProperty()
  @IsString()
  since: string;
}

export class PrivacySettingsDTO {
  @ApiProperty()
  @IsBoolean()
  shareWorkouts: boolean;

  @ApiProperty()
  @IsBoolean()
  shareExecutions: boolean;

  @ApiProperty()
  @IsBoolean()
  shareAnalytics: boolean;

  @ApiProperty()
  @IsBoolean()
  shareCalendar: boolean;

  @ApiProperty()
  @IsBoolean()
  sharePersonalRecords: boolean;

  @ApiProperty()
  @IsBoolean()
  shareSleepData: boolean;

  @ApiProperty()
  @IsBoolean()
  shareTrainingLoad: boolean;

  @ApiProperty()
  @IsBoolean()
  shareWellnessCheckins: boolean;
}

export class AssignedWorkoutDTO {
  @ApiProperty()
  @IsUUID()
  id: string;

  @ApiProperty()
  @IsUUID()
  workoutId: string;

  @ApiProperty()
  @IsString()
  workoutName: string;

  @ApiPropertyOptional({ type: String })
  @IsString()
  @IsOptional()
  notes?: string | null;

  @ApiProperty()
  @IsString()
  assignedAt: string;
}

// Response types
export class InvitationResponse extends ItemResponse<InvitationDTO> {
  @ApiProperty()
  @IsObject({ always: true })
  @ValidateNested()
  declare data: InvitationDTO;
}

export class InvitationListResponse {
  @ApiProperty({ type: [InvitationDTO] })
  @IsArray({ always: true })
  @ValidateNested()
  data: InvitationDTO[];
}

export class AthleteResponse extends ItemResponse<AthleteDTO> {
  @ApiProperty()
  @IsObject({ always: true })
  @ValidateNested()
  declare data: AthleteDTO;
}

export class AthleteListResponse {
  @ApiProperty({ type: [AthleteDTO] })
  @IsArray({ always: true })
  @ValidateNested()
  data: AthleteDTO[];
}

export class CoachResponse extends ItemResponse<CoachDTO | null> {
  @ApiPropertyOptional({ type: CoachDTO })
  @IsObject({ always: true })
  @ValidateNested()
  @IsOptional()
  declare data: CoachDTO | null;
}

export class PrivacySettingsResponse extends ItemResponse<PrivacySettingsDTO> {
  @ApiProperty()
  @IsObject({ always: true })
  @ValidateNested()
  declare data: PrivacySettingsDTO;
}

export class AssignedWorkoutResponse extends ItemResponse<AssignedWorkoutDTO> {
  @ApiProperty()
  @IsObject({ always: true })
  @ValidateNested()
  declare data: AssignedWorkoutDTO;
}

export class AssignedWorkoutListResponse {
  @ApiProperty({ type: [AssignedWorkoutDTO] })
  @IsArray({ always: true })
  @ValidateNested()
  data: AssignedWorkoutDTO[];
}

export class BecomeCoachResponse {
  @ApiProperty()
  @IsBoolean()
  success: boolean;
}

// Schedule DTOs for coach viewing athlete calendars
export class WorkoutInfoDTO {
  @ApiProperty()
  @IsUUID()
  id: string;

  @ApiProperty()
  @IsString()
  name: string;

  @ApiPropertyOptional({ type: String })
  @IsString()
  @IsOptional()
  description?: string | null;

  @ApiPropertyOptional({ type: String })
  @IsString()
  @IsOptional()
  difficulty?: string | null;

  @ApiPropertyOptional({ type: String })
  @IsString()
  @IsOptional()
  type?: string | null;
}

export class ExecutionSummaryDTO {
  @ApiProperty()
  @IsUUID()
  id: string;

  @ApiPropertyOptional({ type: Number })
  @IsNumber()
  @IsOptional()
  durationSeconds?: number | null;

  @ApiPropertyOptional({ type: Number })
  @IsNumber()
  @IsOptional()
  distanceMeters?: number | null;

  @ApiPropertyOptional({ type: Number })
  @IsNumber()
  @IsOptional()
  paceSecondsPerKm?: number | null;

  @ApiPropertyOptional({ type: String })
  @IsString()
  @IsOptional()
  startedAt?: string | null;
}

export class AthleteScheduleDTO {
  @ApiProperty()
  @IsUUID()
  id: string;

  @ApiProperty()
  @IsUUID()
  athleteId: string;

  @ApiProperty()
  @IsObject()
  @ValidateNested()
  workout: WorkoutInfoDTO;

  @ApiProperty()
  @IsString()
  scheduledDate: string;

  @ApiPropertyOptional({ type: String })
  @IsString()
  @IsOptional()
  completedAt?: string | null;

  @ApiPropertyOptional({ type: String })
  @IsString()
  @IsOptional()
  coachNotes?: string | null;

  @ApiPropertyOptional()
  @IsObject()
  @IsOptional()
  execution?: ExecutionSummaryDTO;

  @ApiProperty()
  @IsString()
  createdAt: string;

  @ApiProperty()
  @IsString()
  updatedAt: string;
}

export class AthleteScheduleResponse extends ItemResponse<AthleteScheduleDTO> {
  @ApiProperty()
  @IsObject({ always: true })
  @ValidateNested()
  declare data: AthleteScheduleDTO;
}

export class AthleteScheduleListResponse {
  @ApiProperty({ type: [AthleteScheduleDTO] })
  @IsArray({ always: true })
  @ValidateNested()
  data: AthleteScheduleDTO[];
}

// Compliance DTOs
export class AthleteComplianceDTO {
  @ApiProperty()
  @IsUUID()
  athleteId: string;

  @ApiProperty()
  @IsObject()
  @ValidateNested()
  user: UserBasicDTO;

  @ApiProperty()
  @IsNumber()
  totalScheduled: number;

  @ApiProperty()
  @IsNumber()
  totalCompleted: number;

  @ApiProperty()
  @IsNumber()
  totalPartial: number;

  @ApiProperty()
  @IsNumber()
  totalSkipped: number;

  @ApiProperty()
  @IsNumber()
  compliancePercentage: number;
}

export class ComplianceOverviewResponse {
  @ApiProperty({ type: [AthleteComplianceDTO] })
  @IsArray({ always: true })
  @ValidateNested()
  data: AthleteComplianceDTO[];

  @ApiProperty()
  @IsNumber()
  overallCompliancePercentage: number;

  @ApiProperty()
  @IsNumber()
  totalAthletes: number;

  @ApiProperty()
  @IsString()
  dateFrom: string;

  @ApiProperty()
  @IsString()
  dateTo: string;
}

export class AthleteComplianceResponse extends ItemResponse<AthleteComplianceDTO> {
  @ApiProperty()
  @IsObject({ always: true })
  @ValidateNested()
  declare data: AthleteComplianceDTO;
}

// Athlete Label DTOs
export class AthleteLabelDTO {
  @ApiProperty()
  @IsString()
  id: string;

  @ApiProperty()
  @IsString()
  athleteId: string;

  @ApiProperty()
  @IsString()
  coachId: string;

  @ApiProperty()
  @IsString()
  label: string;

  @ApiProperty()
  @IsString()
  color: string;

  @ApiProperty()
  @IsString()
  startDate: string;

  @ApiProperty()
  @IsString()
  endDate: string;

  @ApiProperty()
  @IsString()
  createdAt: string;
}

export class AthleteLabelResponse extends ItemResponse<AthleteLabelDTO> {
  @ApiProperty()
  @IsObject({ always: true })
  @ValidateNested()
  declare data: AthleteLabelDTO;
}

export class AthleteLabelsResponse {
  @ApiProperty({ type: [AthleteLabelDTO] })
  @IsArray()
  @ValidateNested({ each: true })
  data: AthleteLabelDTO[];
}

// Deploy Plan DTOs
export class DeployPlanResultDTO {
  @ApiProperty({ description: 'Number of workout schedules created' })
  @IsNumber()
  schedulesCreated: number;

  @ApiProperty({ description: 'Name of the deployed plan' })
  @IsString()
  planName: string;

  @ApiProperty({ description: 'Start date of the deployed plan' })
  @IsString()
  startDate: string;

  @ApiProperty({ description: 'End date of the deployed plan' })
  @IsString()
  endDate: string;
}

export class DeployPlanResponse extends ItemResponse<DeployPlanResultDTO> {
  @ApiProperty()
  @IsObject({ always: true })
  @ValidateNested()
  declare data: DeployPlanResultDTO;
}

// Messaging DTOs
export class MessageSenderDTO {
  @ApiProperty()
  @IsUUID()
  id: string;

  @ApiProperty()
  @IsString()
  displayName: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  picture?: string | null;
}

export class AttachedWorkoutDTO {
  @ApiProperty()
  @IsUUID()
  id: string;

  @ApiProperty()
  @IsString()
  name: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  description?: string | null;

  @ApiProperty()
  @IsString()
  type: string;

  @ApiProperty()
  @IsString()
  difficulty: string;
}

export class AttachedPlanDTO {
  @ApiProperty()
  @IsUUID()
  id: string;

  @ApiProperty()
  @IsString()
  name: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  description?: string | null;

  @ApiProperty()
  @IsNumber()
  durationWeeks: number;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  goal?: string | null;
}

export class MessageDTO {
  @ApiProperty()
  @IsUUID()
  id: string;

  @ApiProperty()
  @IsUUID()
  relationshipId: string;

  @ApiProperty()
  @IsObject()
  @ValidateNested()
  sender: MessageSenderDTO;

  @ApiProperty()
  @IsString()
  content: string;

  @ApiPropertyOptional()
  @IsUUID()
  @IsOptional()
  workoutScheduleId?: string | null;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  workoutName?: string | null;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  workoutScheduledDate?: string | null;

  @ApiProperty()
  @IsBoolean()
  isWorkoutNote: boolean;

  @ApiPropertyOptional()
  @IsObject()
  @ValidateNested()
  @IsOptional()
  attachedWorkout?: AttachedWorkoutDTO | null;

  @ApiPropertyOptional()
  @IsObject()
  @ValidateNested()
  @IsOptional()
  attachedPlan?: AttachedPlanDTO | null;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  readAt?: string | null;

  @ApiProperty()
  @IsString()
  createdAt: string;
}

export class MessageResponse extends ItemResponse<MessageDTO> {
  @ApiProperty()
  @IsObject({ always: true })
  @ValidateNested()
  declare data: MessageDTO;
}

export class MessagesListResponse {
  @ApiProperty({ type: [MessageDTO] })
  @IsArray()
  @ValidateNested({ each: true })
  data: MessageDTO[];

  @ApiProperty()
  @IsBoolean()
  hasMore: boolean;
}

export class UnreadCountResponse {
  @ApiProperty()
  @IsNumber()
  unreadCount: number;
}

// Notification DTOs
export class NotificationDataDTO {
  @ApiPropertyOptional()
  @IsUUID()
  @IsOptional()
  athleteId?: string;

  @ApiPropertyOptional()
  @IsUUID()
  @IsOptional()
  coachId?: string;

  @ApiPropertyOptional()
  @IsUUID()
  @IsOptional()
  messageId?: string;

  @ApiPropertyOptional()
  @IsUUID()
  @IsOptional()
  workoutId?: string;

  @ApiPropertyOptional()
  @IsUUID()
  @IsOptional()
  workoutScheduleId?: string;

  @ApiPropertyOptional()
  @IsUUID()
  @IsOptional()
  relationshipId?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  workoutName?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  senderName?: string;
}

export class NotificationDTO {
  @ApiProperty()
  @IsUUID()
  id: string;

  @ApiProperty()
  @IsString()
  type: string;

  @ApiProperty()
  @IsString()
  title: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  body?: string | null;

  @ApiPropertyOptional()
  @IsObject()
  @IsOptional()
  data?: NotificationDataDTO | null;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  readAt?: string | null;

  @ApiProperty()
  @IsString()
  createdAt: string;
}

export class NotificationResponse extends ItemResponse<NotificationDTO> {
  @ApiProperty()
  @IsObject({ always: true })
  @ValidateNested()
  declare data: NotificationDTO;
}

export class NotificationsListResponse {
  @ApiProperty({ type: [NotificationDTO] })
  @IsArray()
  @ValidateNested({ each: true })
  data: NotificationDTO[];

  @ApiProperty()
  @IsNumber()
  unreadCount: number;

  @ApiProperty()
  @IsNumber()
  totalCount: number;
}

// Athlete Intake DTOs
export class AthleteIntakeDTO {
  @ApiProperty()
  @IsUUID()
  id: string;

  @ApiProperty()
  @IsUUID()
  userId: string;

  @ApiProperty()
  @IsUUID()
  coachId: string;

  @ApiProperty({ type: [String] })
  @IsArray()
  @IsString({ each: true })
  primaryGoals: string[];

  @ApiPropertyOptional()
  @IsNumber()
  @IsOptional()
  trainingDaysPerWeek?: number | null;

  @ApiPropertyOptional()
  @IsNumber()
  @IsOptional()
  preferredSessionDuration?: number | null;

  @ApiPropertyOptional({ type: [String] })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  availableDays?: string[] | null;

  @ApiPropertyOptional({ enum: ['beginner', 'intermediate', 'advanced'] })
  @IsString()
  @IsIn(['beginner', 'intermediate', 'advanced'])
  @IsOptional()
  experienceLevel?: 'beginner' | 'intermediate' | 'advanced' | null;

  @ApiPropertyOptional({ enum: ['sedentary', 'lightly_active', 'moderately_active', 'very_active'] })
  @IsString()
  @IsIn(['sedentary', 'lightly_active', 'moderately_active', 'very_active'])
  @IsOptional()
  currentActivityLevel?: 'sedentary' | 'lightly_active' | 'moderately_active' | 'very_active' | null;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  injuriesLimitations?: string | null;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  medicalConditions?: string | null;

  @ApiPropertyOptional({ type: [String] })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  equipmentAccess?: string[] | null;

  @ApiPropertyOptional({ enum: ['home', 'gym', 'outdoor', 'mixed'] })
  @IsString()
  @IsIn(['home', 'gym', 'outdoor', 'mixed'])
  @IsOptional()
  trainingLocation?: 'home' | 'gym' | 'outdoor' | 'mixed' | null;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  primarySport?: string | null;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  competitiveEvents?: string | null;

  @ApiPropertyOptional({ enum: ['running', 'cycling', 'swimming', 'triathlon', 'other'] })
  @IsString()
  @IsIn(['running', 'cycling', 'swimming', 'triathlon', 'other'])
  @IsOptional()
  enduranceSport?: 'running' | 'cycling' | 'swimming' | 'triathlon' | 'other' | null;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  enduranceSportOther?: string | null;

  @ApiPropertyOptional({ type: [String] })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  targetEvents?: string[] | null;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  targetEventOther?: string | null;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  additionalNotes?: string | null;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  completedAt?: string | null;

  @ApiProperty()
  @IsString()
  createdAt: string;

  @ApiProperty()
  @IsString()
  updatedAt: string;
}

export class AthleteIntakeResponse extends ItemResponse<AthleteIntakeDTO> {
  @ApiProperty()
  @IsObject({ always: true })
  @ValidateNested()
  declare data: AthleteIntakeDTO;
}

// Coach Wellness Dashboard DTOs

export class TeamWellnessAveragesDTO {
  @ApiProperty({ description: 'Average sleep quality (1-5)' })
  @IsNumber()
  sleepQuality: number;

  @ApiProperty({ description: 'Average energy level (1-5)' })
  @IsNumber()
  energyLevel: number;

  @ApiProperty({ description: 'Average soreness level (1-5)' })
  @IsNumber()
  soreness: number;

  @ApiProperty({ description: 'Average stress level (1-5)' })
  @IsNumber()
  stress: number;

  @ApiProperty({ description: 'Average readiness (1-5)' })
  @IsNumber()
  readiness: number;

  @ApiProperty({ description: 'Percentage of athletes with check-in today' })
  @IsNumber()
  checkinCompliance: number;
}

export class AtRiskAthleteDTO {
  @ApiProperty()
  @IsString()
  athleteId: string;

  @ApiProperty()
  @IsString()
  athleteName: string;

  @ApiProperty({ enum: ['high_fatigue', 'low_recovery', 'declining_trend', 'active_injury', 'active_illness'] })
  @IsString()
  riskType: 'high_fatigue' | 'low_recovery' | 'declining_trend' | 'active_injury' | 'active_illness';

  @ApiProperty({ description: 'Risk score (0-100)' })
  @IsNumber()
  riskScore: number;

  @ApiProperty()
  @IsString()
  details: string;
}

export class ActiveConcernDTO {
  @ApiProperty()
  @IsString()
  athleteId: string;

  @ApiProperty()
  @IsString()
  athleteName: string;

  @ApiProperty({ enum: ['injury', 'illness'] })
  @IsString()
  concernType: 'injury' | 'illness';

  @ApiProperty()
  @IsString()
  description: string;

  @ApiProperty()
  @IsNumber()
  daysSinceStart: number;
}

export class TeamWellnessOverviewDTO {
  @ApiProperty()
  @IsObject()
  @ValidateNested()
  teamAverages: TeamWellnessAveragesDTO;

  @ApiProperty({ type: [AtRiskAthleteDTO] })
  @IsArray()
  @ValidateNested({ each: true })
  atRiskAthletes: AtRiskAthleteDTO[];

  @ApiProperty({ type: [ActiveConcernDTO] })
  @IsArray()
  @ValidateNested({ each: true })
  activeConcerns: ActiveConcernDTO[];
}

export class TeamWellnessOverviewResponse extends ItemResponse<TeamWellnessOverviewDTO> {
  @ApiProperty()
  @IsObject({ always: true })
  @ValidateNested()
  declare data: TeamWellnessOverviewDTO;
}

export class AthleteWellnessTrendPointDTO {
  @ApiProperty()
  @IsString()
  date: string;

  @ApiPropertyOptional({ type: Number, nullable: true })
  @IsNumber()
  @IsOptional()
  sleepQuality?: number | null;

  @ApiPropertyOptional({ type: Number, nullable: true })
  @IsNumber()
  @IsOptional()
  energyLevel?: number | null;

  @ApiPropertyOptional({ type: Number, nullable: true })
  @IsNumber()
  @IsOptional()
  muscleSoreness?: number | null;

  @ApiPropertyOptional({ type: Number, nullable: true })
  @IsNumber()
  @IsOptional()
  stressLevel?: number | null;

  @ApiPropertyOptional({ type: Number, nullable: true })
  @IsNumber()
  @IsOptional()
  trainingReadiness?: number | null;

  @ApiProperty({ description: 'Composite wellness score (0-100)' })
  @IsNumber()
  wellnessScore: number;
}

export class AthleteWellnessTrendsDTO {
  @ApiProperty()
  @IsString()
  athleteId: string;

  @ApiProperty()
  @IsString()
  athleteName: string;

  @ApiProperty({ type: [AthleteWellnessTrendPointDTO] })
  @IsArray()
  @ValidateNested({ each: true })
  trends: AthleteWellnessTrendPointDTO[];

  @ApiProperty({ description: 'Overall trend direction' })
  @IsString()
  trendDirection: 'improving' | 'stable' | 'declining';
}

export class AthleteWellnessTrendsResponse extends ItemResponse<AthleteWellnessTrendsDTO> {
  @ApiProperty()
  @IsObject({ always: true })
  @ValidateNested()
  declare data: AthleteWellnessTrendsDTO;
}

// ==========================================
// Coach Correlation Dashboard DTOs
// ==========================================

export const AlertLevel = {
  OK: 'ok',
  WATCH: 'watch',
  ACTION_NEEDED: 'action_needed',
} as const;

export const ReadinessTrend = {
  IMPROVING: 'improving',
  STABLE: 'stable',
  DECLINING: 'declining',
} as const;

export const RpeTssTrend = {
  INCREASING: 'increasing',
  STABLE: 'stable',
  DECREASING: 'decreasing',
} as const;

export const DominantWellnessFactor = {
  SLEEP: 'sleep',
  STRESS: 'stress',
  SORENESS: 'soreness',
  ENERGY: 'energy',
} as const;

export class AthleteCorrelationSummaryDTO {
  @ApiProperty()
  @IsString()
  athleteId: string;

  @ApiProperty()
  @IsString()
  athleteName: string;

  @ApiProperty({ enum: ['ok', 'watch', 'action_needed'] })
  @IsString()
  alertLevel: 'ok' | 'watch' | 'action_needed';

  // RPE-TSS
  @ApiPropertyOptional({ type: Number, description: 'RPE:TSS ratio (target ~1.0, >1.3 = warning)' })
  @IsNumber()
  @IsOptional()
  rpeTssRatio?: number | null;

  @ApiProperty({ enum: ['increasing', 'stable', 'decreasing'] })
  @IsString()
  rpeTssRatioTrend: 'increasing' | 'stable' | 'decreasing';

  @ApiProperty({ description: 'True if avg ratio > 1.3 over 7+ days' })
  @IsBoolean()
  accumulatedFatigueWarning: boolean;

  // Wellness-Performance
  @ApiProperty({ description: 'Overtraining risk score (0-100)' })
  @IsNumber()
  overtrainingRiskScore: number;

  @ApiProperty({ type: [String], description: 'Contributing risk factors' })
  @IsArray()
  @IsString({ each: true })
  primaryRiskFactors: string[];

  @ApiPropertyOptional({ enum: ['sleep', 'stress', 'soreness', 'energy'], description: 'Most impactful wellness factor' })
  @IsString()
  @IsOptional()
  dominantWellnessFactor?: 'sleep' | 'stress' | 'soreness' | 'energy' | null;

  // Current state
  @ApiPropertyOptional({ type: Number, description: 'Current readiness score (0-100)' })
  @IsNumber()
  @IsOptional()
  currentReadinessScore?: number | null;

  @ApiProperty({ enum: ['improving', 'stable', 'declining'] })
  @IsString()
  readinessTrend: 'improving' | 'stable' | 'declining';

  @ApiProperty({ description: 'Whether this athlete has privacy restrictions' })
  @IsBoolean()
  privacyRestricted: boolean;

  @ApiProperty({ description: 'Whether there is insufficient data for correlation analysis' })
  @IsBoolean()
  insufficientData: boolean;
}

export class AthleteCorrelationSummaryResponse extends ItemResponse<AthleteCorrelationSummaryDTO> {
  @ApiProperty()
  @IsObject({ always: true })
  @ValidateNested()
  declare data: AthleteCorrelationSummaryDTO;
}

export class AlertLevelCountsDTO {
  @ApiProperty()
  @IsNumber()
  ok: number;

  @ApiProperty()
  @IsNumber()
  watch: number;

  @ApiProperty()
  @IsNumber()
  action_needed: number;
}

export class TeamCorrelationOverviewDTO {
  @ApiProperty({ type: AlertLevelCountsDTO })
  @IsObject()
  @ValidateNested()
  athletesByAlertLevel: AlertLevelCountsDTO;

  @ApiProperty({ type: [AthleteCorrelationSummaryDTO], description: 'Athletes sorted by urgency' })
  @IsArray()
  @ValidateNested({ each: true })
  athletesNeedingAttention: AthleteCorrelationSummaryDTO[];

  @ApiPropertyOptional({ type: Number, description: 'Team average RPE:TSS ratio' })
  @IsNumber()
  @IsOptional()
  teamAverageRpeTssRatio?: number | null;

  @ApiProperty({ description: 'Team average overtraining risk (0-100)' })
  @IsNumber()
  teamAverageOvertrainingRisk: number;
}

export class TeamCorrelationOverviewResponse extends ItemResponse<TeamCorrelationOverviewDTO> {
  @ApiProperty()
  @IsObject({ always: true })
  @ValidateNested()
  declare data: TeamCorrelationOverviewDTO;
}

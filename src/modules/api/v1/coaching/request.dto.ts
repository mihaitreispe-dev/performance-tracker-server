import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEmail,
  IsEnum,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import { CoachAthleteStatus } from 'src/database/interfaces';

/**
 * Filter for GET /coaching/athletes. Defaults to active + pending
 * server-side when omitted — that's the historical "roster" view.
 * Pass a specific status to surface the declined / removed cohorts
 * separately in the org-app team tabs.
 */
export class ListAthletesQuery {
  @ApiPropertyOptional({
    enum: CoachAthleteStatus,
    description:
      'Filter by relationship status. Omit for the default active+pending roster view; ' +
      'pass `declined` or `removed` to see historical cohorts.',
  })
  @IsOptional()
  @IsEnum(CoachAthleteStatus)
  status?: CoachAthleteStatus;
}

export class InviteAthleteBody {
  @ApiProperty({ description: 'Email of the athlete to invite' })
  @IsEmail()
  email: string;

  @ApiPropertyOptional({ description: 'Optional message to include with invitation' })
  @IsString()
  @IsOptional()
  message?: string;
}

export class InvitationIdParam {
  @ApiProperty({ description: 'Invitation ID' })
  @IsUUID()
  id: string;
}

export class AthleteIdParam {
  @ApiProperty({ description: 'Athlete ID' })
  @IsUUID()
  athleteId: string;
}

export class AthleteRaceIdParam {
  @ApiProperty({ description: 'Athlete ID' })
  @IsUUID()
  athleteId: string;

  @ApiProperty({ description: 'Race ID' })
  @IsUUID()
  raceId: string;
}

export class AssignWorkoutBody {
  @ApiProperty({ description: 'Workout ID to assign' })
  @IsUUID()
  workoutId: string;

  @ApiPropertyOptional({ description: 'Notes for the athlete about this workout' })
  @IsString()
  @IsOptional()
  notes?: string;
}

export class AssignedWorkoutIdParam {
  @ApiProperty({ description: 'Athlete ID' })
  @IsUUID()
  athleteId: string;

  @ApiProperty({ description: 'Assigned workout ID' })
  @IsUUID()
  id: string;
}

export class ListAthleteSchedulesQuery {
  @ApiPropertyOptional({ description: 'Start date (YYYY-MM-DD)' })
  @IsDateString()
  @IsOptional()
  dateFrom?: string;

  @ApiPropertyOptional({ description: 'End date (YYYY-MM-DD)' })
  @IsDateString()
  @IsOptional()
  dateTo?: string;

  @ApiPropertyOptional({ description: 'Include execution data' })
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  @IsOptional()
  includeExecution?: boolean;
}

export class CreateAthleteScheduleBody {
  @ApiProperty({ description: 'Workout ID to schedule' })
  @IsUUID()
  workoutId: string;

  @ApiProperty({ description: 'Scheduled date (YYYY-MM-DD)' })
  @IsDateString()
  scheduledDate: string;

  @ApiPropertyOptional({ description: 'Notes for the athlete' })
  @IsString()
  @IsOptional()
  notes?: string;
}

export class ScheduleIdParam {
  @ApiProperty({ description: 'Athlete ID' })
  @IsUUID()
  athleteId: string;

  @ApiProperty({ description: 'Schedule ID' })
  @IsUUID()
  scheduleId: string;
}

export class ComplianceQuery {
  @ApiPropertyOptional({ description: 'Start date (YYYY-MM-DD)' })
  @IsDateString()
  @IsOptional()
  dateFrom?: string;

  @ApiPropertyOptional({ description: 'End date (YYYY-MM-DD)' })
  @IsDateString()
  @IsOptional()
  dateTo?: string;
}

export class UpdatePrivacySettingsBody {
  @ApiPropertyOptional({ description: 'Share workouts with coach' })
  @IsBoolean()
  @IsOptional()
  shareWorkouts?: boolean;

  @ApiPropertyOptional({ description: 'Share workout executions with coach' })
  @IsBoolean()
  @IsOptional()
  shareExecutions?: boolean;

  @ApiPropertyOptional({ description: 'Share analytics with coach' })
  @IsBoolean()
  @IsOptional()
  shareAnalytics?: boolean;

  @ApiPropertyOptional({ description: 'Share calendar/schedules with coach' })
  @IsBoolean()
  @IsOptional()
  shareCalendar?: boolean;

  @ApiPropertyOptional({ description: 'Share personal records with coach' })
  @IsBoolean()
  @IsOptional()
  sharePersonalRecords?: boolean;

  @ApiPropertyOptional({ description: 'Share sleep data with coach' })
  @IsBoolean()
  @IsOptional()
  shareSleepData?: boolean;

  @ApiPropertyOptional({ description: 'Share training load data with coach' })
  @IsBoolean()
  @IsOptional()
  shareTrainingLoad?: boolean;

  @ApiPropertyOptional({ description: 'Share wellness check-ins with coach' })
  @IsBoolean()
  @IsOptional()
  shareWellnessCheckins?: boolean;
}

export class CreateAthleteLabelBody {
  @ApiProperty({ description: 'Label text' })
  @IsString()
  label: string;

  @ApiProperty({ description: 'Label color (hex code)' })
  @IsString()
  color: string;

  @ApiProperty({ description: 'Start date (YYYY-MM-DD)' })
  @IsDateString()
  startDate: string;

  @ApiProperty({ description: 'End date (YYYY-MM-DD)' })
  @IsDateString()
  endDate: string;
}

export class UpdateAthleteLabelBody {
  @ApiPropertyOptional({ description: 'Label text' })
  @IsString()
  @IsOptional()
  label?: string;

  @ApiPropertyOptional({ description: 'Label color (hex code)' })
  @IsString()
  @IsOptional()
  color?: string;

  @ApiPropertyOptional({ description: 'Start date (YYYY-MM-DD)' })
  @IsDateString()
  @IsOptional()
  startDate?: string;

  @ApiPropertyOptional({ description: 'End date (YYYY-MM-DD)' })
  @IsDateString()
  @IsOptional()
  endDate?: string;
}

export class LabelIdParam {
  @ApiProperty({ description: 'Athlete ID' })
  @IsUUID()
  athleteId: string;

  @ApiProperty({ description: 'Label ID' })
  @IsUUID()
  labelId: string;
}

export class ListAthleteLabelsQuery {
  @ApiPropertyOptional({ description: 'Start date (YYYY-MM-DD)' })
  @IsDateString()
  @IsOptional()
  dateFrom?: string;

  @ApiPropertyOptional({ description: 'End date (YYYY-MM-DD)' })
  @IsDateString()
  @IsOptional()
  dateTo?: string;
}

export class DeployPlanBody {
  @ApiProperty({ description: 'Workout plan ID to deploy' })
  @IsUUID()
  planId: string;

  @ApiProperty({ description: 'Start date for the plan (YYYY-MM-DD)', type: String, format: 'date' })
  @IsDateString()
  startDate: string;

  @ApiPropertyOptional({ description: 'Optional notes for the athlete about this plan deployment' })
  @IsString()
  @IsOptional()
  notes?: string;
}

// Messaging DTOs
export class SendMessageBody {
  @ApiProperty({ description: 'Message content' })
  @IsString()
  content: string;

  @ApiPropertyOptional({ description: 'Workout schedule ID if this is a workout note' })
  @IsUUID()
  @IsOptional()
  workoutScheduleId?: string;

  @ApiPropertyOptional({ description: 'Mark as workout note instead of general message' })
  @IsBoolean()
  @IsOptional()
  isWorkoutNote?: boolean;

  @ApiPropertyOptional({ description: 'Attach a workout to the message' })
  @IsUUID()
  @IsOptional()
  attachedWorkoutId?: string;

  @ApiPropertyOptional({ description: 'Attach a workout plan to the message' })
  @IsUUID()
  @IsOptional()
  attachedPlanId?: string;
}

export class ListMessagesQuery {
  @ApiPropertyOptional({ description: 'Limit number of messages' })
  @Transform(({ value }) => Number.parseInt(value, 10))
  @IsInt()
  @Min(1)
  @IsOptional()
  limit?: number;

  @ApiPropertyOptional({ description: 'Get messages before this message ID (for pagination)' })
  @IsUUID()
  @IsOptional()
  beforeId?: string;

  @ApiPropertyOptional({ description: 'Filter to workout notes only' })
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  @IsOptional()
  workoutNotesOnly?: boolean;

  @ApiPropertyOptional({ description: 'Filter by specific workout schedule' })
  @IsUUID()
  @IsOptional()
  workoutScheduleId?: string;
}

export class MessageIdParam {
  @ApiProperty({ description: 'Athlete ID' })
  @IsUUID()
  athleteId: string;

  @ApiProperty({ description: 'Message ID' })
  @IsUUID()
  messageId: string;
}

// Notification DTOs
export class ListNotificationsQuery {
  @ApiPropertyOptional({ description: 'Limit number of notifications' })
  @Transform(({ value }) => Number.parseInt(value, 10))
  @IsInt()
  @Min(1)
  @IsOptional()
  limit?: number;

  @ApiPropertyOptional({ description: 'Offset for pagination' })
  @Transform(({ value }) => Number.parseInt(value, 10))
  @IsInt()
  @Min(0)
  @IsOptional()
  offset?: number;

  @ApiPropertyOptional({ description: 'Filter to unread only' })
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  @IsOptional()
  unreadOnly?: boolean;
}

export class NotificationIdParam {
  @ApiProperty({ description: 'Notification ID' })
  @IsUUID()
  id: string;
}

export class SharedWorkoutIdParam {
  @ApiProperty({ description: 'Workout ID' })
  @IsUUID()
  workoutId: string;
}

export class SharedPlanIdParam {
  @ApiProperty({ description: 'Plan ID' })
  @IsUUID()
  planId: string;
}

// Fitness/Fatigue (PMC) Query
export class FitnessFatigueQuery {
  @ApiPropertyOptional({ description: 'Number of days to fetch (default: 90)' })
  @Transform(({ value }) => Number.parseInt(value, 10))
  @IsInt()
  @Min(7)
  @Max(365)
  @IsOptional()
  days?: number;
}

// Fitness/Fatigue Prediction Body
export class FitnessFatiguePredictionBody {
  @ApiProperty({
    description: 'Array of planned daily TSS values for prediction',
    type: [Number],
    example: [50, 75, 100, 0, 60, 80, 0],
  })
  @IsArray()
  @IsNumber({}, { each: true })
  plannedDailyTSS: number[];
}

// Athlete Intake DTOs
// Wellness Dashboard Query DTOs
export class WellnessTrendsQuery {
  @ApiPropertyOptional({ description: 'Number of days to fetch (default: 30)' })
  @Transform(({ value }) => Number.parseInt(value, 10))
  @IsInt()
  @Min(7)
  @Max(90)
  @IsOptional()
  days?: number;
}

// Correlation Query DTOs
export class CorrelationQuery {
  @ApiPropertyOptional({ description: 'Number of days to analyze (default: 30)' })
  @Transform(({ value }) => Number.parseInt(value, 10))
  @IsInt()
  @Min(7)
  @Max(90)
  @IsOptional()
  days?: number;
}

export class UpdateAthleteIntakeBody {
  @ApiPropertyOptional({
    description: 'Primary fitness goals (from WorkoutPlanGoal enum values)',
    type: [String],
    example: ['build_muscle', 'improve_endurance'],
  })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  primaryGoals?: string[];

  @ApiPropertyOptional({ description: 'Number of training days per week (1-7)', example: 4 })
  @IsInt()
  @Min(1)
  @Max(7)
  @IsOptional()
  trainingDaysPerWeek?: number;

  @ApiPropertyOptional({ description: 'Preferred session duration in minutes', example: 60 })
  @IsInt()
  @Min(15)
  @Max(240)
  @IsOptional()
  preferredSessionDuration?: number;

  @ApiPropertyOptional({
    description: 'Available training days',
    type: [String],
    example: ['monday', 'wednesday', 'friday'],
  })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  availableDays?: string[];

  @ApiPropertyOptional({
    description: 'Experience level',
    enum: ['beginner', 'intermediate', 'advanced'],
  })
  @IsString()
  @IsIn(['beginner', 'intermediate', 'advanced'])
  @IsOptional()
  experienceLevel?: 'beginner' | 'intermediate' | 'advanced';

  @ApiPropertyOptional({
    description: 'Current activity level',
    enum: ['sedentary', 'lightly_active', 'moderately_active', 'very_active'],
  })
  @IsString()
  @IsIn(['sedentary', 'lightly_active', 'moderately_active', 'very_active'])
  @IsOptional()
  currentActivityLevel?: 'sedentary' | 'lightly_active' | 'moderately_active' | 'very_active';

  @ApiPropertyOptional({ description: 'Current injuries or physical limitations' })
  @IsString()
  @IsOptional()
  injuriesLimitations?: string;

  @ApiPropertyOptional({ description: 'Relevant medical conditions' })
  @IsString()
  @IsOptional()
  medicalConditions?: string;

  @ApiPropertyOptional({
    description: 'Available equipment',
    type: [String],
    example: ['dumbbells', 'barbell', 'machines'],
  })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  equipmentAccess?: string[];

  @ApiPropertyOptional({
    description: 'Primary training location',
    enum: ['home', 'gym', 'outdoor', 'mixed'],
  })
  @IsString()
  @IsIn(['home', 'gym', 'outdoor', 'mixed'])
  @IsOptional()
  trainingLocation?: 'home' | 'gym' | 'outdoor' | 'mixed';

  @ApiPropertyOptional({ description: 'Primary sport or activity (legacy field)', example: 'Running' })
  @IsString()
  @IsOptional()
  primarySport?: string;

  @ApiPropertyOptional({ description: 'Upcoming competitive events or races (legacy field)' })
  @IsString()
  @IsOptional()
  competitiveEvents?: string;

  @ApiPropertyOptional({
    description: 'Primary endurance sport',
    enum: ['running', 'cycling', 'swimming', 'triathlon', 'other'],
  })
  @IsString()
  @IsIn(['running', 'cycling', 'swimming', 'triathlon', 'other'])
  @IsOptional()
  enduranceSport?: 'running' | 'cycling' | 'swimming' | 'triathlon' | 'other';

  @ApiPropertyOptional({ description: 'Custom sport name when enduranceSport is "other"' })
  @IsString()
  @IsOptional()
  enduranceSportOther?: string;

  @ApiPropertyOptional({
    description: 'Target events/distances for the selected sport',
    type: [String],
    example: ['marathon', 'half_marathon'],
  })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  targetEvents?: string[];

  @ApiPropertyOptional({ description: 'Custom event description when "other" is selected' })
  @IsString()
  @IsOptional()
  targetEventOther?: string;

  @ApiPropertyOptional({ description: 'Additional notes or context for the coach' })
  @IsString()
  @IsOptional()
  additionalNotes?: string;
}

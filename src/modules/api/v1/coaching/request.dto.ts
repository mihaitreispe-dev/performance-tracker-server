import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsDateString, IsEmail, IsInt, IsOptional, IsString, IsUUID, Min } from 'class-validator';

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
  @Transform(({ value }) => parseInt(value, 10))
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
  @Transform(({ value }) => parseInt(value, 10))
  @IsInt()
  @Min(1)
  @IsOptional()
  limit?: number;

  @ApiPropertyOptional({ description: 'Offset for pagination' })
  @Transform(({ value }) => parseInt(value, 10))
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

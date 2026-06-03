import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { PublicListMeta } from '../response.dto';

export class PublicScheduledWorkoutDTO {
  @ApiProperty() id: string;
  @ApiProperty() workoutId: string;
  @ApiPropertyOptional({ nullable: true }) workoutName: string | null;
  @ApiPropertyOptional({ nullable: true }) workoutType: string | null;
  @ApiPropertyOptional({ nullable: true }) difficulty: string | null;
  @ApiProperty({ description: 'ISO date (date-only).' }) scheduledDate: string;
  @ApiPropertyOptional({ nullable: true }) completedAt: string | null;
}

export class PublicScheduledWorkoutListResponse {
  @ApiProperty({ type: [PublicScheduledWorkoutDTO] }) data: PublicScheduledWorkoutDTO[];
  @ApiProperty({ type: PublicListMeta }) meta: PublicListMeta;
}

export class PublicWorkoutExecutionDTO {
  @ApiProperty() id: string;
  @ApiProperty() userId: string;
  @ApiPropertyOptional({ nullable: true }) workoutScheduleId: string | null;
  @ApiProperty() startedAt: string;
  @ApiPropertyOptional({ nullable: true }) completedAt: string | null;
  @ApiPropertyOptional({ nullable: true }) durationSeconds: number | null;
  @ApiProperty() source: string;
  @ApiPropertyOptional({ nullable: true }) notes: string | null;
  @ApiPropertyOptional({ nullable: true }) sessionRpe: number | null;
}

export class PublicWorkoutExecutionResponse {
  @ApiProperty({ type: PublicWorkoutExecutionDTO }) data: PublicWorkoutExecutionDTO;
}

export class PublicExecutionHistoryResponse {
  @ApiProperty({ type: [PublicWorkoutExecutionDTO] }) data: PublicWorkoutExecutionDTO[];
  @ApiProperty({ type: PublicListMeta }) meta: PublicListMeta;
}

export class PublicSetCompletionDTO {
  @ApiProperty() id: string;
  @ApiProperty() workoutExecutionId: string;
  @ApiProperty() exerciseInstanceId: string;
  @ApiProperty() setNumber: number;
  @ApiPropertyOptional({ nullable: true }) actualReps: number | null;
  @ApiPropertyOptional({ nullable: true }) actualLoad: number | null;
  @ApiPropertyOptional({ nullable: true }) actualTimeSeconds: number | null;
  @ApiPropertyOptional({ nullable: true }) rpe: number | null;
  @ApiProperty() skipped: boolean;
  @ApiPropertyOptional({ nullable: true }) notes: string | null;
  @ApiProperty() completedAt: string;
}

export class PublicSetCompletionResponse {
  @ApiProperty({ type: PublicSetCompletionDTO }) data: PublicSetCompletionDTO;
}

export class PublicPersonalRecordDTO {
  @ApiProperty() id: string;
  @ApiProperty() userId: string;
  @ApiProperty() recordType: string;
  @ApiPropertyOptional({ nullable: true }) exerciseId: string | null;
  @ApiPropertyOptional({ nullable: true }) workoutType: string | null;
  @ApiProperty() value: number;
  @ApiProperty() unit: string;
  @ApiProperty() workoutExecutionId: string;
  @ApiProperty() achievedAt: string;
}

export class PublicPersonalRecordListResponse {
  @ApiProperty({ type: [PublicPersonalRecordDTO] }) data: PublicPersonalRecordDTO[];
}

/**
 * Reuses the existing internal WorkoutExecutionSummary shape so integrators can
 * read both schedule + completion + summary against a single mental model. We
 * proxy through the existing WorkoutExecutionsApiService.getSummary() — same data,
 * different auth band.
 */
export class PublicExecutionSummaryDTO {
  @ApiProperty() executionId: string;
  @ApiPropertyOptional({ nullable: true }) workoutId: string | null;
  @ApiPropertyOptional({ nullable: true }) workoutName: string | null;
  @ApiProperty() startedAt: string;
  @ApiPropertyOptional({ nullable: true }) completedAt: string | null;
  @ApiProperty() totalDurationSeconds: number;
  @ApiProperty() exercisesPlanned: number;
  @ApiProperty() exercisesCompleted: number;
  @ApiProperty() setsPlanned: number;
  @ApiProperty() setsCompleted: number;
  @ApiProperty() setsSkipped: number;
  @ApiProperty() completionRatio: number;
  @ApiPropertyOptional({ nullable: true }) sessionRpe: number | null;
  @ApiPropertyOptional({ nullable: true }) avgRpe: number | null;
  @ApiPropertyOptional({ nullable: true }) totalVolume: number | null;
  @ApiProperty({ type: 'array', items: { type: 'object' } }) perExercise: unknown[];
}

export class PublicExecutionSummaryResponse {
  @ApiProperty({ type: PublicExecutionSummaryDTO }) data: PublicExecutionSummaryDTO;
}

// --- Pending notifications (integrator poll for external-app deliveries) ----

export class PublicPendingNotificationDTO {
  @ApiProperty() id: string;
  @ApiProperty() ruleId: string;
  @ApiProperty({ description: 'Server-rendered title for the push notification.' })
  title: string;
  @ApiProperty({ description: 'Server-rendered body.' })
  body: string;
  @ApiPropertyOptional({
    nullable: true,
    description: 'Optional in-app deep link the integrator should open on tap.',
  })
  clickAction: string | null;
  @ApiProperty({ description: 'ISO timestamp the rule queued this delivery.' })
  sentAt: string;
}

export class PublicPendingNotificationsResponse {
  @ApiProperty({ type: [PublicPendingNotificationDTO] })
  data: PublicPendingNotificationDTO[];
}

import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Request } from 'express';
import {
  CoachAthleteLabelRow,
  CoachAthleteRelationship,
  CoachAthleteStatus,
  CoachingMessage,
  NotificationType,
  User,
  UserRole,
  Workout,
  WorkoutSchedule,
} from 'src/database/interfaces';
import { formatDateToYMD } from 'src/lib/util';
import { AuthUser } from 'src/modules/auth/types/authenticated-user';
import { AthletePrivacySettingsRepository } from 'src/repositories/athlete-privacy-settings.repository';
import { CoachAssignedWorkoutRepository } from 'src/repositories/coach-assigned-workout.repository';
import { CoachAthleteLabelRepository } from 'src/repositories/coach-athlete-label.repository';
import { CoachAthleteRelationshipRepository } from 'src/repositories/coach-athlete-relationship.repository';
import { CoachingMessageRepository } from 'src/repositories/coaching-message.repository';
import { UserRepository } from 'src/repositories/user.repository';
import { WorkoutRepository } from 'src/repositories/workout.repository';
import { WorkoutExecutionRepository } from 'src/repositories/workout-execution.repository';
import { WorkoutPlanRepository } from 'src/repositories/workout-plan.repository';
import { WorkoutPlanItemRepository } from 'src/repositories/workout-plan-item.repository';
import { WorkoutRouteRepository } from 'src/repositories/workout-route.repository';
import { WorkoutScheduleRepository } from 'src/repositories/workout-schedule.repository';
import { NotificationsApiService } from '../notifications/notifications-api.service';
import { WorkoutsApiService } from '../workouts/workouts-api.service';
import { WorkoutPlansApiService } from '../workout-plans/workout-plans-api.service';
import { WorkoutResponse } from '../workouts/response.dto';
import { WorkoutPlanWithItemsResponse } from '../workout-plans/response.dto';

import {
  AssignWorkoutBody,
  ComplianceQuery,
  CreateAthleteLabelBody,
  CreateAthleteScheduleBody,
  DeployPlanBody,
  InviteAthleteBody,
  ListAthleteLabelsQuery,
  ListAthleteSchedulesQuery,
  ListMessagesQuery,
  SendMessageBody,
  UpdateAthleteLabelBody,
  UpdatePrivacySettingsBody,
} from './request.dto';
import {
  AssignedWorkoutDTO,
  AssignedWorkoutListResponse,
  AssignedWorkoutResponse,
  AthleteComplianceDTO,
  AthleteComplianceResponse,
  AthleteDTO,
  AthleteLabelDTO,
  AthleteLabelResponse,
  AthleteLabelsResponse,
  AthleteListResponse,
  AthleteResponse,
  AthleteScheduleDTO,
  AthleteScheduleListResponse,
  AthleteScheduleResponse,
  AttachedPlanDTO,
  AttachedWorkoutDTO,
  BecomeCoachResponse,
  CoachResponse,
  ComplianceOverviewResponse,
  DeployPlanResponse,
  ExecutionSummaryDTO,
  InvitationDTO,
  InvitationListResponse,
  InvitationResponse,
  MessageDTO,
  MessageResponse,
  MessagesListResponse,
  PrivacySettingsResponse,
  UnreadCountResponse,
  UserBasicDTO,
  WorkoutInfoDTO,
} from './response.dto';

@Injectable()
export class CoachingApiService {
  constructor(
    private readonly userRepo: UserRepository,
    private readonly relationshipRepo: CoachAthleteRelationshipRepository,
    private readonly privacySettingsRepo: AthletePrivacySettingsRepository,
    private readonly assignedWorkoutRepo: CoachAssignedWorkoutRepository,
    private readonly labelRepo: CoachAthleteLabelRepository,
    private readonly workoutRepo: WorkoutRepository,
    private readonly scheduleRepo: WorkoutScheduleRepository,
    private readonly executionRepo: WorkoutExecutionRepository,
    private readonly routeRepo: WorkoutRouteRepository,
    private readonly workoutPlanRepo: WorkoutPlanRepository,
    private readonly workoutPlanItemRepo: WorkoutPlanItemRepository,
    private readonly messageRepo: CoachingMessageRepository,
    private readonly notificationsService: NotificationsApiService,
    private readonly workoutsService: WorkoutsApiService,
    private readonly workoutPlansService: WorkoutPlansApiService,
  ) {}

  // Become Coach
  async becomeCoach(req: Request & { user: AuthUser }): Promise<BecomeCoachResponse> {
    const user = await this.userRepo.findById(req.user.id);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (user.roles.includes(UserRole.COACH)) {
      return { success: true }; // Already a coach
    }

    const newRoles = [...user.roles, UserRole.COACH];
    await this.userRepo.updateById(req.user.id, { roles: newRoles });

    return { success: true };
  }

  // Invitations
  async inviteAthlete(req: Request & { user: AuthUser }, body: InviteAthleteBody): Promise<InvitationResponse> {
    const coach = await this.userRepo.findById(req.user.id);
    if (!coach || !coach.roles.includes(UserRole.COACH)) {
      throw new ForbiddenException('Only coaches can invite athletes');
    }

    const athlete = await this.userRepo.findByEmail(body.email);
    if (!athlete) {
      throw new NotFoundException(
        'No user found with this email. They need to create an account first before you can invite them.',
      );
    }

    if (athlete.id === req.user.id) {
      throw new BadRequestException('You cannot invite yourself');
    }

    // Check for existing relationship
    const existingRelationship = await this.relationshipRepo.findByCoachIdAndAthleteEmail(req.user.id, body.email);
    if (existingRelationship) {
      if (existingRelationship.status === CoachAthleteStatus.ACTIVE) {
        throw new BadRequestException('This athlete is already in your roster');
      }
      if (existingRelationship.status === CoachAthleteStatus.PENDING) {
        throw new BadRequestException('An invitation is already pending for this athlete');
      }
    }

    // Check if athlete already has an active coach
    const activeCoach = await this.relationshipRepo.findActiveByAthleteId(athlete.id);
    if (activeCoach) {
      throw new BadRequestException('This athlete already has an active coach');
    }

    const relationship = await this.relationshipRepo.create({
      coach_id: req.user.id,
      athlete_id: athlete.id,
      status: CoachAthleteStatus.PENDING,
      invitation_message: body.message ?? null,
    });

    return {
      data: this.mapToInvitationDTO(relationship, coach),
    };
  }

  async getPendingInvitations(req: Request & { user: AuthUser }): Promise<InvitationListResponse> {
    const invitations = await this.relationshipRepo.findPendingByAthleteId(req.user.id);

    const data: InvitationDTO[] = [];
    for (const inv of invitations) {
      const coach = await this.userRepo.findById(inv.coach_id);
      if (coach) {
        data.push(this.mapToInvitationDTO(inv, coach));
      }
    }

    return { data };
  }

  async acceptInvitation(req: Request & { user: AuthUser }, id: string): Promise<InvitationResponse> {
    const invitation = await this.relationshipRepo.findById(id);
    if (!invitation || invitation.athlete_id !== req.user.id) {
      throw new NotFoundException('Invitation not found');
    }

    if (invitation.status !== CoachAthleteStatus.PENDING) {
      throw new BadRequestException('This invitation is no longer pending');
    }

    // Check if user already has an active coach
    const activeCoach = await this.relationshipRepo.findActiveByAthleteId(req.user.id);
    if (activeCoach) {
      throw new BadRequestException('You already have an active coach. Leave your current coach first.');
    }

    const updated = await this.relationshipRepo.respond(id, CoachAthleteStatus.ACTIVE);
    const coach = await this.userRepo.findById(updated.coach_id);

    // Initialize privacy settings for the athlete
    await this.privacySettingsRepo.getOrCreateDefault(req.user.id);

    return {
      data: this.mapToInvitationDTO(updated, coach!),
    };
  }

  async declineInvitation(req: Request & { user: AuthUser }, id: string): Promise<InvitationResponse> {
    const invitation = await this.relationshipRepo.findById(id);
    if (!invitation || invitation.athlete_id !== req.user.id) {
      throw new NotFoundException('Invitation not found');
    }

    if (invitation.status !== CoachAthleteStatus.PENDING) {
      throw new BadRequestException('This invitation is no longer pending');
    }

    const updated = await this.relationshipRepo.respond(id, CoachAthleteStatus.DECLINED);
    const coach = await this.userRepo.findById(updated.coach_id);

    return {
      data: this.mapToInvitationDTO(updated, coach!),
    };
  }

  // Coach's Athletes
  async getAthletes(req: Request & { user: AuthUser }): Promise<AthleteListResponse> {
    const relationships = await this.relationshipRepo.findMany({
      coachId: req.user.id,
      status: [CoachAthleteStatus.ACTIVE, CoachAthleteStatus.PENDING],
    });

    const data: AthleteDTO[] = [];
    for (const rel of relationships) {
      const user = await this.userRepo.findById(rel.athlete_id);
      if (user) {
        data.push(this.mapToAthleteDTO(rel, user));
      }
    }

    return { data };
  }

  async getAthleteById(req: Request & { user: AuthUser }, athleteId: string): Promise<AthleteResponse> {
    const relationship = await this.relationshipRepo.findActiveByCoachAndAthlete(req.user.id, athleteId);
    if (!relationship) {
      throw new NotFoundException('Athlete not found in your roster');
    }

    const user = await this.userRepo.findById(athleteId);
    if (!user) {
      throw new NotFoundException('Athlete not found');
    }

    return {
      data: this.mapToAthleteDTO(relationship, user),
    };
  }

  async removeAthlete(req: Request & { user: AuthUser }, athleteId: string): Promise<void> {
    const relationship = await this.relationshipRepo.findActiveByCoachAndAthlete(req.user.id, athleteId);
    if (!relationship) {
      throw new NotFoundException('Athlete not found in your roster');
    }

    await this.relationshipRepo.updateById(relationship.id, { status: CoachAthleteStatus.REMOVED });
    await this.assignedWorkoutRepo.deleteByAthleteId(athleteId);
  }

  // Athlete's Coach
  async getMyCoach(req: Request & { user: AuthUser }): Promise<CoachResponse> {
    const relationship = await this.relationshipRepo.findActiveByAthleteId(req.user.id);
    if (!relationship) {
      return { data: null };
    }

    const coach = await this.userRepo.findById(relationship.coach_id);
    if (!coach) {
      return { data: null };
    }

    return {
      data: {
        id: relationship.id,
        user: this.mapToUserBasicDTO(coach),
        since: new Date(relationship.responded_at as unknown as string).toISOString(),
      },
    };
  }

  async leaveCoach(req: Request & { user: AuthUser }): Promise<void> {
    const relationship = await this.relationshipRepo.findActiveByAthleteId(req.user.id);
    if (!relationship) {
      throw new NotFoundException('You do not have an active coach');
    }

    await this.relationshipRepo.updateById(relationship.id, { status: CoachAthleteStatus.REMOVED });
    await this.assignedWorkoutRepo.deleteByAthleteId(req.user.id);
  }

  // Workout Assignment
  async assignWorkout(
    req: Request & { user: AuthUser },
    athleteId: string,
    body: AssignWorkoutBody,
  ): Promise<AssignedWorkoutResponse> {
    // Relationship is verified by guard

    // Verify workout exists and belongs to coach
    const workout = await this.workoutRepo.findById(body.workoutId);
    if (!workout || workout.user_id !== req.user.id) {
      throw new NotFoundException('Workout not found');
    }

    const assignment = await this.assignedWorkoutRepo.create({
      coach_id: req.user.id,
      athlete_id: athleteId,
      workout_id: body.workoutId,
      notes: body.notes ?? null,
    });

    return {
      data: this.mapToAssignedWorkoutDTO(assignment, workout),
    };
  }

  async getAssignedWorkouts(
    req: Request & { user: AuthUser },
    athleteId: string,
  ): Promise<AssignedWorkoutListResponse> {
    const assignments = await this.assignedWorkoutRepo.findMany({
      coachId: req.user.id,
      athleteId,
    });

    const data: AssignedWorkoutDTO[] = [];
    for (const assignment of assignments) {
      const workout = await this.workoutRepo.findById(assignment.workout_id);
      if (workout) {
        data.push(this.mapToAssignedWorkoutDTO(assignment, workout));
      }
    }

    return { data };
  }

  async removeAssignedWorkout(
    req: Request & { user: AuthUser },
    athleteId: string,
    assignmentId: string,
  ): Promise<void> {
    const assignment = await this.assignedWorkoutRepo.findById(assignmentId);
    if (!assignment || assignment.coach_id !== req.user.id || assignment.athlete_id !== athleteId) {
      throw new NotFoundException('Assignment not found');
    }

    await this.assignedWorkoutRepo.deleteById(assignmentId);
  }

  // Privacy Settings
  async getPrivacySettings(req: Request & { user: AuthUser }): Promise<PrivacySettingsResponse> {
    const settings = await this.privacySettingsRepo.getOrCreateDefault(req.user.id);

    return {
      data: {
        shareWorkouts: settings.share_workouts,
        shareExecutions: settings.share_executions,
        shareAnalytics: settings.share_analytics,
        shareCalendar: settings.share_calendar,
        sharePersonalRecords: settings.share_personal_records,
        shareSleepData: settings.share_sleep_data,
        shareTrainingLoad: settings.share_training_load,
      },
    };
  }

  async updatePrivacySettings(
    req: Request & { user: AuthUser },
    body: UpdatePrivacySettingsBody,
  ): Promise<PrivacySettingsResponse> {
    const update: Record<string, boolean> = {};

    if (body.shareWorkouts !== undefined) update.share_workouts = body.shareWorkouts;
    if (body.shareExecutions !== undefined) update.share_executions = body.shareExecutions;
    if (body.shareAnalytics !== undefined) update.share_analytics = body.shareAnalytics;
    if (body.shareCalendar !== undefined) update.share_calendar = body.shareCalendar;
    if (body.sharePersonalRecords !== undefined) update.share_personal_records = body.sharePersonalRecords;
    if (body.shareSleepData !== undefined) update.share_sleep_data = body.shareSleepData;
    if (body.shareTrainingLoad !== undefined) update.share_training_load = body.shareTrainingLoad;

    const settings = await this.privacySettingsRepo.upsert(req.user.id, update);

    return {
      data: {
        shareWorkouts: settings.share_workouts,
        shareExecutions: settings.share_executions,
        shareAnalytics: settings.share_analytics,
        shareCalendar: settings.share_calendar,
        sharePersonalRecords: settings.share_personal_records,
        shareSleepData: settings.share_sleep_data,
        shareTrainingLoad: settings.share_training_load,
      },
    };
  }

  // Athlete Schedules (coach viewing/managing athlete calendars)
  async getAthleteSchedules(
    _req: Request & { user: AuthUser },
    athleteId: string,
    query: ListAthleteSchedulesQuery,
  ): Promise<AthleteScheduleListResponse> {
    // Verify privacy settings allow calendar access
    const privacySettings = await this.privacySettingsRepo.findByUserId(athleteId);
    if (privacySettings && !privacySettings.share_calendar) {
      throw new ForbiddenException('Athlete has not shared their calendar with you');
    }

    const dateFrom = query.dateFrom ? new Date(query.dateFrom) : undefined;
    const dateTo = query.dateTo ? new Date(query.dateTo) : undefined;

    const schedules = await this.scheduleRepo.findMany({
      filter: {
        userId: athleteId,
        dateFrom,
        dateTo,
      },
      sort: [{ field: 'scheduled_date', direction: 'asc' }],
    });

    // Fetch all workouts for the schedules
    const workoutIds = [...new Set(schedules.map((s) => s.workout_id))];
    const workouts = await Promise.all(workoutIds.map((id) => this.workoutRepo.findById(id)));
    const workoutMap = new Map<string, Workout>();
    for (const workout of workouts) {
      if (workout) {
        workoutMap.set(workout.id, workout);
      }
    }

    // Fetch execution data if requested
    let executionMap = new Map<string, ExecutionSummaryDTO>();
    if (query.includeExecution) {
      executionMap = await this.getExecutionSummaries(schedules.map((s) => s.id));
    }

    const data: AthleteScheduleDTO[] = schedules.map((schedule) =>
      this.mapToAthleteScheduleDTO(
        schedule,
        athleteId,
        workoutMap.get(schedule.workout_id)!,
        query.includeExecution ? executionMap.get(schedule.id) : undefined,
      ),
    );

    return { data };
  }

  async createAthleteSchedule(
    req: Request & { user: AuthUser },
    athleteId: string,
    body: CreateAthleteScheduleBody,
  ): Promise<AthleteScheduleResponse> {
    // Verify workout exists - coach can assign their own workouts or athlete's workouts
    const workout = await this.workoutRepo.findById(body.workoutId);
    if (!workout) {
      throw new NotFoundException('Workout not found');
    }

    // Only allow coach's own workouts or workouts that belong to the athlete
    if (workout.user_id !== req.user.id && workout.user_id !== athleteId) {
      throw new ForbiddenException('You can only schedule your own workouts or athlete workouts');
    }

    const schedule = await this.scheduleRepo.create({
      user_id: athleteId,
      workout_id: body.workoutId,
      scheduled_date: new Date(body.scheduledDate),
      coach_notes: body.notes ?? null,
      created_by_coach_id: req.user.id,
    });

    return {
      data: this.mapToAthleteScheduleDTO(schedule, athleteId, workout),
    };
  }

  async deleteAthleteSchedule(req: Request & { user: AuthUser }, athleteId: string, scheduleId: string): Promise<void> {
    const schedule = await this.scheduleRepo.findById(scheduleId);
    if (!schedule) {
      throw new NotFoundException('Schedule not found');
    }

    if (schedule.user_id !== athleteId) {
      throw new NotFoundException('Schedule not found for this athlete');
    }

    // Only allow deletion of schedules created by this coach
    if (schedule.created_by_coach_id !== req.user.id) {
      throw new ForbiddenException('You can only delete schedules you created');
    }

    await this.scheduleRepo.deleteById(scheduleId);
  }

  // Compliance
  async getComplianceOverview(
    req: Request & { user: AuthUser },
    query: ComplianceQuery,
  ): Promise<ComplianceOverviewResponse> {
    // Get all active athletes for this coach
    const relationships = await this.relationshipRepo.findMany({
      coachId: req.user.id,
      status: [CoachAthleteStatus.ACTIVE],
    });

    // Default date range: last 30 days
    const dateTo = query.dateTo ? new Date(query.dateTo) : new Date();
    const dateFrom = query.dateFrom ? new Date(query.dateFrom) : new Date(dateTo.getTime() - 30 * 24 * 60 * 60 * 1000);

    const athleteCompliances: AthleteComplianceDTO[] = [];
    let totalScheduled = 0;
    let totalCompleted = 0;

    for (const rel of relationships) {
      const user = await this.userRepo.findById(rel.athlete_id);
      if (!user) continue;

      // Check privacy settings
      const privacySettings = await this.privacySettingsRepo.findByUserId(rel.athlete_id);
      if (privacySettings && !privacySettings.share_calendar) {
        // Skip athletes who haven't shared their calendar
        continue;
      }

      const compliance = await this.calculateAthleteCompliance(rel.athlete_id, dateFrom, dateTo);
      athleteCompliances.push({
        athleteId: rel.athlete_id,
        user: this.mapToUserBasicDTO(user),
        ...compliance,
      });

      totalScheduled += compliance.totalScheduled;
      totalCompleted += compliance.totalCompleted;
    }

    const overallCompliancePercentage = totalScheduled > 0 ? Math.round((totalCompleted / totalScheduled) * 100) : 0;

    return {
      data: athleteCompliances,
      overallCompliancePercentage,
      totalAthletes: athleteCompliances.length,
      dateFrom: formatDateToYMD(dateFrom),
      dateTo: formatDateToYMD(dateTo),
    };
  }

  async getAthleteCompliance(
    _req: Request & { user: AuthUser },
    athleteId: string,
    query: ComplianceQuery,
  ): Promise<AthleteComplianceResponse> {
    // Check privacy settings
    const privacySettings = await this.privacySettingsRepo.findByUserId(athleteId);
    if (privacySettings && !privacySettings.share_calendar) {
      throw new ForbiddenException('Athlete has not shared their calendar with you');
    }

    const user = await this.userRepo.findById(athleteId);
    if (!user) {
      throw new NotFoundException('Athlete not found');
    }

    // Default date range: last 30 days
    const dateTo = query.dateTo ? new Date(query.dateTo) : new Date();
    const dateFrom = query.dateFrom ? new Date(query.dateFrom) : new Date(dateTo.getTime() - 30 * 24 * 60 * 60 * 1000);

    const compliance = await this.calculateAthleteCompliance(athleteId, dateFrom, dateTo);

    return {
      data: {
        athleteId,
        user: this.mapToUserBasicDTO(user),
        ...compliance,
      },
    };
  }

  private async calculateAthleteCompliance(
    athleteId: string,
    dateFrom: Date,
    dateTo: Date,
  ): Promise<{
    totalScheduled: number;
    totalCompleted: number;
    totalPartial: number;
    totalSkipped: number;
    compliancePercentage: number;
  }> {
    const schedules = await this.scheduleRepo.findMany({
      filter: {
        userId: athleteId,
        dateFrom,
        dateTo,
      },
    });

    const totalScheduled = schedules.length;
    let totalCompleted = 0;
    let totalPartial = 0;
    let totalSkipped = 0;

    const now = new Date();

    for (const schedule of schedules) {
      const scheduledDate = new Date(schedule.scheduled_date as unknown as string);

      if (schedule.completed_at) {
        // Check if there's an execution linked to this schedule
        const executions = await this.executionRepo.findMany({
          filter: { workoutScheduleId: schedule.id },
          limit: 1,
        });

        if (executions.length > 0) {
          // For now, treat any execution as completed
          // Could add logic to check if all sets were completed for "partial"
          totalCompleted++;
        } else {
          // Marked as complete but no execution data - still count as completed
          totalCompleted++;
        }
      } else if (scheduledDate < now) {
        // Past date, not completed - check if there's an execution anyway
        const executions = await this.executionRepo.findMany({
          filter: { workoutScheduleId: schedule.id },
          limit: 1,
        });

        if (executions.length > 0) {
          // Has execution but not marked complete - partial
          totalPartial++;
        } else {
          // No completion, no execution, past date - skipped
          totalSkipped++;
        }
      }
      // Future dates with no completion are not counted as skipped
    }

    const compliancePercentage = totalScheduled > 0 ? Math.round((totalCompleted / totalScheduled) * 100) : 0;

    return {
      totalScheduled,
      totalCompleted,
      totalPartial,
      totalSkipped,
      compliancePercentage,
    };
  }

  private async getExecutionSummaries(scheduleIds: string[]): Promise<Map<string, ExecutionSummaryDTO>> {
    const result = new Map<string, ExecutionSummaryDTO>();
    if (scheduleIds.length === 0) return result;

    // Fetch executions for all schedule IDs
    const executions = await Promise.all(
      scheduleIds.map((id) =>
        this.executionRepo.findMany({
          filter: { workoutScheduleId: id },
          limit: 1,
          sort: [{ field: 'started_at', direction: 'desc' }],
        }),
      ),
    );

    // Flatten and get route data
    const executionList: Array<{
      id: string;
      workout_schedule_id: string | null;
      duration_seconds: number | null;
      started_at: unknown;
    }> = [];
    for (const execs of executions) {
      if (execs.length > 0) {
        executionList.push(execs[0]);
      }
    }

    // Fetch routes for all executions
    const routes = await Promise.all(executionList.map((e) => this.routeRepo.findByExecutionId(e.id)));

    // Build the map
    for (let i = 0; i < executionList.length; i++) {
      const execution = executionList[i];
      const route = routes[i];

      if (!execution.workout_schedule_id) continue;

      const distanceMeters = route ? Number.parseFloat(route.total_distance_meters) : null;
      const durationSeconds = execution.duration_seconds ?? null;

      let paceSecondsPerKm: number | null = null;
      if (distanceMeters && durationSeconds && distanceMeters > 0) {
        paceSecondsPerKm = Math.round((durationSeconds / distanceMeters) * 1000);
      }

      const startedAt =
        execution.started_at instanceof Date ? execution.started_at.toISOString() : String(execution.started_at);

      result.set(execution.workout_schedule_id, {
        id: execution.id,
        durationSeconds,
        distanceMeters,
        paceSecondsPerKm,
        startedAt,
      });
    }

    return result;
  }

  private mapToAthleteScheduleDTO(
    schedule: WorkoutSchedule,
    athleteId: string,
    workout: Workout,
    execution?: ExecutionSummaryDTO,
  ): AthleteScheduleDTO {
    const workoutInfo: WorkoutInfoDTO = {
      id: workout.id,
      name: workout.name,
      description: workout.description,
      difficulty: workout.difficulty,
      type: workout.type,
    };

    const scheduledDate =
      schedule.scheduled_date instanceof Date
        ? formatDateToYMD(schedule.scheduled_date)
        : String(schedule.scheduled_date);

    const completedAt = schedule.completed_at
      ? schedule.completed_at instanceof Date
        ? schedule.completed_at.toISOString()
        : String(schedule.completed_at)
      : null;

    const createdAt =
      schedule.created_at instanceof Date ? schedule.created_at.toISOString() : String(schedule.created_at);

    const updatedAt =
      schedule.updated_at instanceof Date ? schedule.updated_at.toISOString() : String(schedule.updated_at);

    return {
      id: schedule.id,
      athleteId,
      workout: workoutInfo,
      scheduledDate,
      completedAt,
      coachNotes: schedule.coach_notes ?? null,
      execution,
      createdAt,
      updatedAt,
    };
  }

  // Helper methods
  private mapToUserBasicDTO(user: User): UserBasicDTO {
    return {
      id: user.id,
      email: user.email,
      displayName: user.display_name,
      firstName: user.first_name,
      lastName: user.last_name,
      picture: null, // TODO: Add picture URL when S3 service is available
    };
  }

  private mapToInvitationDTO(relationship: CoachAthleteRelationship, coach: User): InvitationDTO {
    return {
      id: relationship.id,
      coach: this.mapToUserBasicDTO(coach),
      status: relationship.status,
      message: relationship.invitation_message,
      invitedAt: new Date(relationship.invited_at as unknown as string).toISOString(),
    };
  }

  private mapToAthleteDTO(relationship: CoachAthleteRelationship, user: User): AthleteDTO {
    return {
      id: relationship.id,
      user: this.mapToUserBasicDTO(user),
      status: relationship.status,
      invitedAt: new Date(relationship.invited_at as unknown as string).toISOString(),
      respondedAt: relationship.responded_at
        ? new Date(relationship.responded_at as unknown as string).toISOString()
        : null,
    };
  }

  private mapToAssignedWorkoutDTO(
    assignment: { id: string; workout_id: string; notes: string | null; assigned_at: any },
    workout: Workout,
  ): AssignedWorkoutDTO {
    return {
      id: assignment.id,
      workoutId: assignment.workout_id,
      workoutName: workout.name,
      notes: assignment.notes,
      assignedAt: new Date(assignment.assigned_at as unknown as string).toISOString(),
    };
  }

  // ===== ATHLETE LABELS =====

  async getAthleteLabels(
    athleteId: string,
    query: ListAthleteLabelsQuery,
    _req: Request & { user: AuthUser },
  ): Promise<AthleteLabelsResponse> {
    const labels = await this.labelRepo.findMany({
      athleteId,
      dateFrom: query.dateFrom,
      dateTo: query.dateTo,
    });

    return {
      data: labels.map((label) => this.mapToAthleteLabelDTO(label)),
    };
  }

  async createAthleteLabel(
    athleteId: string,
    body: CreateAthleteLabelBody,
    req: Request & { user: AuthUser },
  ): Promise<AthleteLabelResponse> {
    // Verify active relationship exists (guard should handle this, but double-check)
    const relationship = await this.relationshipRepo.findActiveByCoachAndAthlete(req.user.id, athleteId);
    if (!relationship || relationship.status !== CoachAthleteStatus.ACTIVE) {
      throw new ForbiddenException('No active coaching relationship with this athlete');
    }

    const label = await this.labelRepo.create({
      coach_id: req.user.id,
      athlete_id: athleteId,
      label: body.label,
      color: body.color,
      start_date: body.startDate,
      end_date: body.endDate,
    });

    return {
      data: this.mapToAthleteLabelDTO(label),
    };
  }

  async updateAthleteLabel(
    athleteId: string,
    labelId: string,
    body: UpdateAthleteLabelBody,
    req: Request & { user: AuthUser },
  ): Promise<AthleteLabelResponse> {
    const existingLabel = await this.labelRepo.findById(labelId);
    if (!existingLabel) {
      throw new NotFoundException('Label not found');
    }

    // Verify the coach owns this label
    if (existingLabel.coach_id !== req.user.id) {
      throw new ForbiddenException('You can only update labels you created');
    }

    // Verify the label belongs to the specified athlete
    if (existingLabel.athlete_id !== athleteId) {
      throw new BadRequestException('Label does not belong to this athlete');
    }

    const updatedLabel = await this.labelRepo.updateById(labelId, {
      label: body.label,
      color: body.color,
      start_date: body.startDate,
      end_date: body.endDate,
    });

    return {
      data: this.mapToAthleteLabelDTO(updatedLabel),
    };
  }

  async deleteAthleteLabel(athleteId: string, labelId: string, req: Request & { user: AuthUser }): Promise<void> {
    const existingLabel = await this.labelRepo.findById(labelId);
    if (!existingLabel) {
      throw new NotFoundException('Label not found');
    }

    // Verify the coach owns this label
    if (existingLabel.coach_id !== req.user.id) {
      throw new ForbiddenException('You can only delete labels you created');
    }

    // Verify the label belongs to the specified athlete
    if (existingLabel.athlete_id !== athleteId) {
      throw new BadRequestException('Label does not belong to this athlete');
    }

    await this.labelRepo.deleteById(labelId);
  }

  // Get labels for the current user (as an athlete) - includes coach-created labels
  async getMyLabels(query: ListAthleteLabelsQuery, req: Request & { user: AuthUser }): Promise<AthleteLabelsResponse> {
    const labels = await this.labelRepo.findMany({
      athleteId: req.user.id,
      dateFrom: query.dateFrom,
      dateTo: query.dateTo,
    });

    return {
      data: labels.map((label) => this.mapToAthleteLabelDTO(label)),
    };
  }

  private mapToAthleteLabelDTO(label: CoachAthleteLabelRow): AthleteLabelDTO {
    return {
      id: label.id,
      athleteId: label.athlete_id,
      coachId: label.coach_id,
      label: label.label,
      color: label.color,
      startDate: label.start_date,
      endDate: label.end_date,
      createdAt: new Date(label.created_at as unknown as string).toISOString(),
    };
  }

  // Deploy a workout plan to an athlete's calendar
  async deployPlan(
    athleteId: string,
    body: DeployPlanBody,
    req: Request & { user: AuthUser },
  ): Promise<DeployPlanResponse> {
    // Verify active relationship exists
    const relationship = await this.relationshipRepo.findActiveByCoachAndAthlete(req.user.id, athleteId);
    if (!relationship || relationship.status !== CoachAthleteStatus.ACTIVE) {
      throw new ForbiddenException('No active coaching relationship with this athlete');
    }

    // Check privacy settings - must have calendar sharing enabled
    const settings = await this.privacySettingsRepo.findByUserId(athleteId);
    if (!settings?.share_calendar) {
      throw new ForbiddenException('Athlete has not shared their calendar with you');
    }

    // Fetch the plan - must belong to the coach
    const plan = await this.workoutPlanRepo.findById(body.planId);
    if (!plan) {
      throw new NotFoundException('Workout plan not found');
    }
    if (plan.user_id !== req.user.id) {
      throw new ForbiddenException('You can only deploy plans you own');
    }

    // Fetch plan items
    const items = await this.workoutPlanItemRepo.findMany({
      filter: { workoutPlanId: body.planId },
    });

    if (items.length === 0) {
      throw new BadRequestException('Cannot deploy an empty plan');
    }

    const startDate = new Date(body.startDate + 'T00:00:00');

    // Create schedules for the athlete
    const schedules = items.map((item) => {
      const date = new Date(startDate);
      // Calculate offset: (weekNumber - 1) * 7 days + (dayOfWeek - 1) days
      // dayOfWeek: 1=Monday, so we add (dayOfWeek - 1) to get to the correct day
      // startDate is assumed to be a Monday (Week 1, Day 1)
      const daysOffset = (item.week_number - 1) * 7 + (item.day_of_week - 1);
      date.setDate(startDate.getDate() + daysOffset);

      return {
        user_id: athleteId,
        workout_id: item.workout_id,
        scheduled_date: date,
        workout_plan_id: body.planId,
        created_by_coach_id: req.user.id,
        coach_notes: body.notes || null,
      };
    });

    await this.scheduleRepo.createMany(schedules);

    // Calculate end date
    const maxDaysOffset = Math.max(...items.map((item) => (item.week_number - 1) * 7 + (item.day_of_week - 1)));
    const endDate = new Date(startDate);
    endDate.setDate(startDate.getDate() + maxDaysOffset);

    return {
      data: {
        schedulesCreated: schedules.length,
        planName: plan.name,
        startDate: formatDateToYMD(startDate),
        endDate: formatDateToYMD(endDate),
      },
    };
  }

  // ==================== MESSAGING ====================

  async sendMessage(
    req: Request & { user: AuthUser },
    athleteId: string,
    body: SendMessageBody,
  ): Promise<MessageResponse> {
    const userId = req.user.id;

    // Find the relationship
    const relationship = await this.relationshipRepo.findActiveByCoachAndAthlete(userId, athleteId)
      || await this.relationshipRepo.findActiveByCoachAndAthlete(athleteId, userId);

    if (!relationship || relationship.status !== CoachAthleteStatus.ACTIVE) {
      throw new ForbiddenException('No active coaching relationship found');
    }

    // Determine if user is coach or athlete
    const isCoach = relationship.coach_id === userId;
    const recipientId = isCoach ? relationship.athlete_id : relationship.coach_id;

    // Verify workout schedule if provided
    let workoutInfo: { name: string; scheduledDate: string } | null = null;
    if (body.workoutScheduleId) {
      const schedule = await this.scheduleRepo.findById(body.workoutScheduleId);
      if (!schedule || schedule.user_id !== athleteId) {
        throw new NotFoundException('Workout schedule not found');
      }
      const workout = await this.workoutRepo.findById(schedule.workout_id);
      const scheduledDate = schedule.scheduled_date instanceof Date
        ? formatDateToYMD(schedule.scheduled_date)
        : String(schedule.scheduled_date);
      workoutInfo = {
        name: workout?.name || 'Unknown',
        scheduledDate,
      };
    }

    // Validate attached workout if provided
    let attachedWorkout: AttachedWorkoutDTO | null = null;
    if (body.attachedWorkoutId) {
      const workout = await this.workoutRepo.findById(body.attachedWorkoutId);
      if (!workout) {
        throw new NotFoundException('Attached workout not found');
      }
      // Coach can only attach their own workouts
      if (workout.user_id !== userId) {
        throw new ForbiddenException('You can only attach your own workouts');
      }
      attachedWorkout = {
        id: workout.id,
        name: workout.name,
        description: workout.description,
        type: workout.type,
        difficulty: workout.difficulty,
      };
    }

    // Validate attached plan if provided
    let attachedPlan: AttachedPlanDTO | null = null;
    if (body.attachedPlanId) {
      const plan = await this.workoutPlanRepo.findById(body.attachedPlanId);
      if (!plan) {
        throw new NotFoundException('Attached plan not found');
      }
      // Coach can only attach their own plans
      if (plan.user_id !== userId) {
        throw new ForbiddenException('You can only attach your own plans');
      }
      attachedPlan = {
        id: plan.id,
        name: plan.name,
        description: plan.description,
        durationWeeks: plan.duration_weeks,
        goal: plan.goal,
      };
    }

    // Create message
    const message = await this.messageRepo.create({
      relationship_id: relationship.id,
      sender_id: userId,
      content: body.content,
      workout_schedule_id: body.workoutScheduleId || null,
      is_workout_note: body.isWorkoutNote || false,
      attached_workout_id: body.attachedWorkoutId || null,
      attached_plan_id: body.attachedPlanId || null,
    });

    // Get sender info for response and notification
    const sender = await this.userRepo.findById(userId);
    const senderName = sender?.display_name || sender?.email || 'Someone';

    // Create notification for recipient
    const notificationType = body.isWorkoutNote ? NotificationType.WORKOUT_NOTE : NotificationType.MESSAGE;
    const title = body.isWorkoutNote
      ? `New workout note from ${senderName}`
      : `New message from ${senderName}`;
    const notificationBody = body.content.length > 100
      ? body.content.substring(0, 100) + '...'
      : body.content;

    await this.notificationsService.createNotification(
      recipientId,
      notificationType,
      title,
      notificationBody,
      {
        messageId: message.id,
        relationshipId: relationship.id,
        senderName,
        workoutScheduleId: body.workoutScheduleId,
        workoutName: workoutInfo?.name || undefined,
        athleteId,
        coachId: relationship.coach_id,
      },
    );

    return {
      data: this.mapToMessageDTO(message, sender!, workoutInfo, attachedWorkout, attachedPlan),
    };
  }

  async listMessages(
    req: Request & { user: AuthUser },
    athleteId: string,
    query: ListMessagesQuery,
  ): Promise<MessagesListResponse> {
    const userId = req.user.id;

    // Find the relationship
    const relationship = await this.relationshipRepo.findActiveByCoachAndAthlete(userId, athleteId)
      || await this.relationshipRepo.findActiveByCoachAndAthlete(athleteId, userId);

    if (!relationship || relationship.status !== CoachAthleteStatus.ACTIVE) {
      throw new ForbiddenException('No active coaching relationship found');
    }

    const limit = query.limit || 50;

    const messages = await this.messageRepo.findMany(
      {
        relationshipId: relationship.id,
        workoutScheduleId: query.workoutScheduleId,
        isWorkoutNote: query.workoutNotesOnly || undefined,
      },
      {
        limit: limit + 1, // Fetch one extra to determine hasMore
        beforeId: query.beforeId,
      },
    );

    const hasMore = messages.length > limit;
    const resultMessages = hasMore ? messages.slice(0, limit) : messages;

    // Get sender info and workout info
    const senderIds = [...new Set(resultMessages.map((m) => m.sender_id))];
    const senders = await Promise.all(senderIds.map((id) => this.userRepo.findById(id)));
    const senderMap = new Map(senders.filter(Boolean).map((s) => [s!.id, s!]));

    const scheduleIds = [...new Set(resultMessages.filter((m) => m.workout_schedule_id).map((m) => m.workout_schedule_id!))];
    const workoutInfoMap = new Map<string, { name: string; scheduledDate: string }>();
    for (const scheduleId of scheduleIds) {
      const schedule = await this.scheduleRepo.findById(scheduleId);
      if (schedule) {
        const workout = await this.workoutRepo.findById(schedule.workout_id);
        if (workout) {
          const scheduledDate = schedule.scheduled_date instanceof Date
            ? formatDateToYMD(schedule.scheduled_date)
            : String(schedule.scheduled_date);
          workoutInfoMap.set(scheduleId, { name: workout.name, scheduledDate });
        }
      }
    }

    // Fetch attached workouts
    const attachedWorkoutIds = [...new Set(resultMessages.filter((m) => m.attached_workout_id).map((m) => m.attached_workout_id!))];
    const attachedWorkoutsMap = new Map<string, AttachedWorkoutDTO>();
    for (const workoutId of attachedWorkoutIds) {
      const workout = await this.workoutRepo.findById(workoutId);
      if (workout) {
        attachedWorkoutsMap.set(workout.id, {
          id: workout.id,
          name: workout.name,
          description: workout.description,
          type: workout.type,
          difficulty: workout.difficulty,
        });
      }
    }

    // Fetch attached plans
    const attachedPlanIds = [...new Set(resultMessages.filter((m) => m.attached_plan_id).map((m) => m.attached_plan_id!))];
    const attachedPlansMap = new Map<string, AttachedPlanDTO>();
    for (const planId of attachedPlanIds) {
      const plan = await this.workoutPlanRepo.findById(planId);
      if (plan) {
        attachedPlansMap.set(plan.id, {
          id: plan.id,
          name: plan.name,
          description: plan.description,
          durationWeeks: plan.duration_weeks,
          goal: plan.goal,
        });
      }
    }

    // Mark messages as read (messages not from current user)
    await this.messageRepo.markConversationAsRead(relationship.id, userId);

    return {
      data: resultMessages.map((m) =>
        this.mapToMessageDTO(
          m,
          senderMap.get(m.sender_id)!,
          workoutInfoMap.get(m.workout_schedule_id || '') || null,
          m.attached_workout_id ? attachedWorkoutsMap.get(m.attached_workout_id) || null : null,
          m.attached_plan_id ? attachedPlansMap.get(m.attached_plan_id) || null : null,
        ),
      ),
      hasMore,
    };
  }

  async getWorkoutNotes(
    req: Request & { user: AuthUser },
    athleteId: string,
    workoutScheduleId: string,
  ): Promise<MessagesListResponse> {
    const userId = req.user.id;

    // Find the relationship
    const relationship = await this.relationshipRepo.findActiveByCoachAndAthlete(userId, athleteId)
      || await this.relationshipRepo.findActiveByCoachAndAthlete(athleteId, userId);

    if (!relationship || relationship.status !== CoachAthleteStatus.ACTIVE) {
      throw new ForbiddenException('No active coaching relationship found');
    }

    // Verify workout schedule belongs to athlete
    const schedule = await this.scheduleRepo.findById(workoutScheduleId);
    if (!schedule || schedule.user_id !== athleteId) {
      throw new NotFoundException('Workout schedule not found');
    }

    const workout = await this.workoutRepo.findById(schedule.workout_id);
    const scheduledDate = schedule.scheduled_date instanceof Date
      ? formatDateToYMD(schedule.scheduled_date)
      : String(schedule.scheduled_date);
    const workoutInfo = workout
      ? { name: workout.name, scheduledDate }
      : null;

    const messages = await this.messageRepo.findWorkoutNotes(workoutScheduleId);

    // Get sender info
    const senderIds = [...new Set(messages.map((m) => m.sender_id))];
    const senders = await Promise.all(senderIds.map((id) => this.userRepo.findById(id)));
    const senderMap = new Map(senders.filter(Boolean).map((s) => [s!.id, s!]));

    // Fetch attached workouts
    const attachedWorkoutIds = [...new Set(messages.filter((m) => m.attached_workout_id).map((m) => m.attached_workout_id!))];
    const attachedWorkoutsMap = new Map<string, AttachedWorkoutDTO>();
    for (const wId of attachedWorkoutIds) {
      const w = await this.workoutRepo.findById(wId);
      if (w) {
        attachedWorkoutsMap.set(w.id, {
          id: w.id,
          name: w.name,
          description: w.description,
          type: w.type,
          difficulty: w.difficulty,
        });
      }
    }

    // Fetch attached plans
    const attachedPlanIds = [...new Set(messages.filter((m) => m.attached_plan_id).map((m) => m.attached_plan_id!))];
    const attachedPlansMap = new Map<string, AttachedPlanDTO>();
    for (const pId of attachedPlanIds) {
      const p = await this.workoutPlanRepo.findById(pId);
      if (p) {
        attachedPlansMap.set(p.id, {
          id: p.id,
          name: p.name,
          description: p.description,
          durationWeeks: p.duration_weeks,
          goal: p.goal,
        });
      }
    }

    return {
      data: messages.map((m) =>
        this.mapToMessageDTO(
          m,
          senderMap.get(m.sender_id)!,
          workoutInfo,
          m.attached_workout_id ? attachedWorkoutsMap.get(m.attached_workout_id) || null : null,
          m.attached_plan_id ? attachedPlansMap.get(m.attached_plan_id) || null : null,
        ),
      ),
      hasMore: false,
    };
  }

  async getUnreadMessageCount(
    req: Request & { user: AuthUser },
    athleteId: string,
  ): Promise<UnreadCountResponse> {
    const userId = req.user.id;

    // Find the relationship
    const relationship = await this.relationshipRepo.findActiveByCoachAndAthlete(userId, athleteId)
      || await this.relationshipRepo.findActiveByCoachAndAthlete(athleteId, userId);

    if (!relationship || relationship.status !== CoachAthleteStatus.ACTIVE) {
      throw new ForbiddenException('No active coaching relationship found');
    }

    const unreadCount = await this.messageRepo.countUnread(relationship.id, userId);

    return { unreadCount };
  }

  // ==================== ATHLETE MESSAGING TO COACH ====================

  async sendMessageToCoach(
    req: Request & { user: AuthUser },
    body: SendMessageBody,
  ): Promise<MessageResponse> {
    const userId = req.user.id;

    // Find relationship where current user is athlete
    const relationship = await this.relationshipRepo.findActiveByAthleteId(userId);

    if (!relationship || relationship.status !== CoachAthleteStatus.ACTIVE) {
      throw new NotFoundException('No active coaching relationship found');
    }

    // Verify workout schedule if provided (must belong to current user/athlete)
    let workoutInfo: { name: string; scheduledDate: string } | null = null;
    if (body.workoutScheduleId) {
      const schedule = await this.scheduleRepo.findById(body.workoutScheduleId);
      if (!schedule || schedule.user_id !== userId) {
        throw new NotFoundException('Workout schedule not found');
      }
      const workout = await this.workoutRepo.findById(schedule.workout_id);
      const scheduledDate = schedule.scheduled_date instanceof Date
        ? formatDateToYMD(schedule.scheduled_date)
        : String(schedule.scheduled_date);
      workoutInfo = {
        name: workout?.name || 'Unknown',
        scheduledDate,
      };
    }

    // Validate attached workout if provided
    let attachedWorkout: AttachedWorkoutDTO | null = null;
    if (body.attachedWorkoutId) {
      const workout = await this.workoutRepo.findById(body.attachedWorkoutId);
      if (!workout) {
        throw new NotFoundException('Attached workout not found');
      }
      // Athletes can only attach their own workouts
      if (workout.user_id !== userId) {
        throw new ForbiddenException('You can only attach your own workouts');
      }
      attachedWorkout = {
        id: workout.id,
        name: workout.name,
        description: workout.description,
        type: workout.type,
        difficulty: workout.difficulty,
      };
    }

    // Validate attached plan if provided
    let attachedPlan: AttachedPlanDTO | null = null;
    if (body.attachedPlanId) {
      const plan = await this.workoutPlanRepo.findById(body.attachedPlanId);
      if (!plan) {
        throw new NotFoundException('Attached plan not found');
      }
      // Athletes can only attach their own plans
      if (plan.user_id !== userId) {
        throw new ForbiddenException('You can only attach your own plans');
      }
      attachedPlan = {
        id: plan.id,
        name: plan.name,
        description: plan.description,
        durationWeeks: plan.duration_weeks,
        goal: plan.goal,
      };
    }

    // Create message
    const message = await this.messageRepo.create({
      relationship_id: relationship.id,
      sender_id: userId,
      content: body.content,
      workout_schedule_id: body.workoutScheduleId || null,
      is_workout_note: body.isWorkoutNote || false,
      attached_workout_id: body.attachedWorkoutId || null,
      attached_plan_id: body.attachedPlanId || null,
    });

    // Get sender info for response and notification
    const sender = await this.userRepo.findById(userId);
    const senderName = sender?.display_name || sender?.email || 'Someone';

    // Create notification for coach
    const notificationType = body.isWorkoutNote ? NotificationType.WORKOUT_NOTE : NotificationType.MESSAGE;
    const title = body.isWorkoutNote
      ? `New workout note from ${senderName}`
      : `New message from ${senderName}`;
    const notificationBody = body.content.length > 100
      ? body.content.substring(0, 100) + '...'
      : body.content;

    await this.notificationsService.createNotification(
      relationship.coach_id,
      notificationType,
      title,
      notificationBody,
      {
        messageId: message.id,
        relationshipId: relationship.id,
        senderName,
        workoutScheduleId: body.workoutScheduleId,
        workoutName: workoutInfo?.name || undefined,
        athleteId: userId,
        coachId: relationship.coach_id,
      },
    );

    return {
      data: this.mapToMessageDTO(message, sender!, workoutInfo, attachedWorkout, attachedPlan),
    };
  }

  async listMessagesWithCoach(
    req: Request & { user: AuthUser },
    query: ListMessagesQuery,
  ): Promise<MessagesListResponse> {
    const userId = req.user.id;

    // Find relationship where current user is athlete
    const relationship = await this.relationshipRepo.findActiveByAthleteId(userId);

    if (!relationship || relationship.status !== CoachAthleteStatus.ACTIVE) {
      throw new NotFoundException('No active coaching relationship found');
    }

    const limit = query.limit || 50;

    const messages = await this.messageRepo.findMany(
      {
        relationshipId: relationship.id,
        workoutScheduleId: query.workoutScheduleId,
        isWorkoutNote: query.workoutNotesOnly || undefined,
      },
      {
        limit: limit + 1,
        beforeId: query.beforeId,
      },
    );

    const hasMore = messages.length > limit;
    const resultMessages = hasMore ? messages.slice(0, limit) : messages;

    // Get sender info and workout info
    const senderIds = [...new Set(resultMessages.map((m) => m.sender_id))];
    const senders = await Promise.all(senderIds.map((id) => this.userRepo.findById(id)));
    const senderMap = new Map(senders.filter(Boolean).map((s) => [s!.id, s!]));

    const scheduleIds = [...new Set(resultMessages.filter((m) => m.workout_schedule_id).map((m) => m.workout_schedule_id!))];
    const workoutInfoMap = new Map<string, { name: string; scheduledDate: string }>();
    for (const scheduleId of scheduleIds) {
      const schedule = await this.scheduleRepo.findById(scheduleId);
      if (schedule) {
        const workout = await this.workoutRepo.findById(schedule.workout_id);
        if (workout) {
          const scheduledDate = schedule.scheduled_date instanceof Date
            ? formatDateToYMD(schedule.scheduled_date)
            : String(schedule.scheduled_date);
          workoutInfoMap.set(scheduleId, { name: workout.name, scheduledDate });
        }
      }
    }

    // Fetch attached workouts
    const attachedWorkoutIds = [...new Set(resultMessages.filter((m) => m.attached_workout_id).map((m) => m.attached_workout_id!))];
    const attachedWorkoutsMap = new Map<string, AttachedWorkoutDTO>();
    for (const workoutId of attachedWorkoutIds) {
      const workout = await this.workoutRepo.findById(workoutId);
      if (workout) {
        attachedWorkoutsMap.set(workout.id, {
          id: workout.id,
          name: workout.name,
          description: workout.description,
          type: workout.type,
          difficulty: workout.difficulty,
        });
      }
    }

    // Fetch attached plans
    const attachedPlanIds = [...new Set(resultMessages.filter((m) => m.attached_plan_id).map((m) => m.attached_plan_id!))];
    const attachedPlansMap = new Map<string, AttachedPlanDTO>();
    for (const planId of attachedPlanIds) {
      const plan = await this.workoutPlanRepo.findById(planId);
      if (plan) {
        attachedPlansMap.set(plan.id, {
          id: plan.id,
          name: plan.name,
          description: plan.description,
          durationWeeks: plan.duration_weeks,
          goal: plan.goal,
        });
      }
    }

    // Mark messages as read
    await this.messageRepo.markConversationAsRead(relationship.id, userId);

    return {
      data: resultMessages.map((m) =>
        this.mapToMessageDTO(
          m,
          senderMap.get(m.sender_id)!,
          workoutInfoMap.get(m.workout_schedule_id || '') || null,
          m.attached_workout_id ? attachedWorkoutsMap.get(m.attached_workout_id) || null : null,
          m.attached_plan_id ? attachedPlansMap.get(m.attached_plan_id) || null : null,
        ),
      ),
      hasMore,
    };
  }

  async getUnreadMessageCountFromCoach(
    req: Request & { user: AuthUser },
  ): Promise<UnreadCountResponse> {
    const userId = req.user.id;

    // Find relationship where current user is athlete
    const relationship = await this.relationshipRepo.findActiveByAthleteId(userId);

    if (!relationship || relationship.status !== CoachAthleteStatus.ACTIVE) {
      throw new NotFoundException('No active coaching relationship found');
    }

    const unreadCount = await this.messageRepo.countUnread(relationship.id, userId);

    return { unreadCount };
  }

  // ==================== SHARED RESOURCE ACCESS ====================

  async getSharedWorkout(
    req: Request & { user: AuthUser },
    workoutId: string,
  ): Promise<WorkoutResponse> {
    const userId = req.user.id;

    // First check if user owns the workout
    const workout = await this.workoutRepo.findById(workoutId);
    if (!workout) {
      throw new NotFoundException('Workout not found');
    }

    if (workout.user_id === userId) {
      // User owns the workout, return it
      return this.workoutsService.getWorkoutByIdInternal(workoutId);
    }

    // Check if user has a coach relationship
    const relationship = await this.relationshipRepo.findActiveByAthleteId(userId);
    if (!relationship) {
      throw new NotFoundException('Workout not found or not shared with you');
    }

    // Check if the workout belongs to the coach
    if (workout.user_id !== relationship.coach_id) {
      throw new NotFoundException('Workout not found or not shared with you');
    }

    // Verify the workout was actually shared in a message in this relationship
    const sharedMessage = await this.messageRepo.findByAttachedWorkoutInRelationship(
      workoutId,
      relationship.id,
    );

    if (!sharedMessage) {
      throw new NotFoundException('Workout not found or not shared with you');
    }

    return this.workoutsService.getWorkoutByIdInternal(workoutId);
  }

  async getSharedPlan(
    req: Request & { user: AuthUser },
    planId: string,
  ): Promise<WorkoutPlanWithItemsResponse> {
    const userId = req.user.id;

    // First check if user owns the plan
    const plan = await this.workoutPlanRepo.findById(planId);
    if (!plan) {
      throw new NotFoundException('Plan not found');
    }

    if (plan.user_id === userId) {
      // User owns the plan, return it
      return this.workoutPlansService.getByIdInternal(planId);
    }

    // Check if user has a coach relationship
    const relationship = await this.relationshipRepo.findActiveByAthleteId(userId);
    if (!relationship) {
      throw new NotFoundException('Plan not found or not shared with you');
    }

    // Check if the plan belongs to the coach
    if (plan.user_id !== relationship.coach_id) {
      throw new NotFoundException('Plan not found or not shared with you');
    }

    // Verify the plan was actually shared in a message in this relationship
    const sharedMessage = await this.messageRepo.findByAttachedPlanInRelationship(
      planId,
      relationship.id,
    );

    if (!sharedMessage) {
      throw new NotFoundException('Plan not found or not shared with you');
    }

    return this.workoutPlansService.getByIdInternal(planId);
  }

  async copySharedWorkoutToLibrary(
    req: Request & { user: AuthUser },
    workoutId: string,
  ): Promise<WorkoutResponse> {
    const userId = req.user.id;

    // First check if user owns the workout (no need to copy)
    const workout = await this.workoutRepo.findById(workoutId);
    if (!workout) {
      throw new NotFoundException('Workout not found');
    }

    if (workout.user_id === userId) {
      // User already owns this workout
      return this.workoutsService.getWorkoutByIdInternal(workoutId);
    }

    // Check if user has a coach relationship
    const relationship = await this.relationshipRepo.findActiveByAthleteId(userId);
    if (!relationship) {
      throw new NotFoundException('Workout not found or not shared with you');
    }

    // Check if the workout belongs to the coach
    if (workout.user_id !== relationship.coach_id) {
      throw new NotFoundException('Workout not found or not shared with you');
    }

    // Verify the workout was actually shared in a message in this relationship
    const sharedMessage = await this.messageRepo.findByAttachedWorkoutInRelationship(
      workoutId,
      relationship.id,
    );

    if (!sharedMessage) {
      throw new NotFoundException('Workout not found or not shared with you');
    }

    // Copy the workout to the user's library
    return this.workoutsService.copyWorkoutToUser(workoutId, userId);
  }

  async copySharedPlanToLibrary(
    req: Request & { user: AuthUser },
    planId: string,
  ): Promise<WorkoutPlanWithItemsResponse> {
    const userId = req.user.id;

    // First check if user owns the plan (no need to copy)
    const plan = await this.workoutPlanRepo.findById(planId);
    if (!plan) {
      throw new NotFoundException('Plan not found');
    }

    if (plan.user_id === userId) {
      // User already owns this plan
      return this.workoutPlansService.getByIdInternal(planId);
    }

    // Check if user has a coach relationship
    const relationship = await this.relationshipRepo.findActiveByAthleteId(userId);
    if (!relationship) {
      throw new NotFoundException('Plan not found or not shared with you');
    }

    // Check if the plan belongs to the coach
    if (plan.user_id !== relationship.coach_id) {
      throw new NotFoundException('Plan not found or not shared with you');
    }

    // Verify the plan was actually shared in a message in this relationship
    const sharedMessage = await this.messageRepo.findByAttachedPlanInRelationship(
      planId,
      relationship.id,
    );

    if (!sharedMessage) {
      throw new NotFoundException('Plan not found or not shared with you');
    }

    // Copy the plan and all its workouts to the user's library
    return this.workoutPlansService.copyPlanToUser(planId, userId);
  }

  private mapToMessageDTO(
    message: CoachingMessage,
    sender: User,
    workoutInfo: { name: string; scheduledDate: string } | null,
    attachedWorkout?: AttachedWorkoutDTO | null,
    attachedPlan?: AttachedPlanDTO | null,
  ): MessageDTO {
    return {
      id: message.id,
      relationshipId: message.relationship_id,
      sender: {
        id: sender.id,
        displayName: sender.display_name || sender.email,
        picture: null, // TODO: Add picture URL when S3 service is available
      },
      content: message.content,
      workoutScheduleId: message.workout_schedule_id,
      workoutName: workoutInfo?.name || null,
      workoutScheduledDate: workoutInfo?.scheduledDate || null,
      isWorkoutNote: message.is_workout_note,
      attachedWorkout: attachedWorkout || null,
      attachedPlan: attachedPlan || null,
      readAt: message.read_at instanceof Date ? message.read_at.toISOString() : message.read_at,
      createdAt: message.created_at instanceof Date ? message.created_at.toISOString() : String(message.created_at),
    };
  }
}

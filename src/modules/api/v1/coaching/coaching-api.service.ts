import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Request } from 'express';
import {
  AthleteIntake,
  CoachAthleteLabelRow,
  CoachAthleteRelationship,
  CoachAthleteStatus,
  CoachingMessage,
  NotificationType,
  Quest,
  QuestPeriod,
  QuestStatus,
  QuestUpdate,
  User,
  UserRole,
  Workout,
  WorkoutSchedule,
} from 'src/database/interfaces';
import { formatDateToYMD } from 'src/lib/util';
import { assertActiveOrg } from 'src/lib/util/active-org';
import { AuthUser } from 'src/modules/auth/types/authenticated-user';
import { AuthedRequest } from 'src/modules/auth/types/request-with-active-org';
import { AthleteIntakeRepository } from 'src/repositories/athlete-intake.repository';
import { AthletePrivacySettingsRepository } from 'src/repositories/athlete-privacy-settings.repository';
import { CoachAssignedWorkoutRepository } from 'src/repositories/coach-assigned-workout.repository';
import { CoachAthleteLabelRepository } from 'src/repositories/coach-athlete-label.repository';
import { QuestRepository } from 'src/repositories/quest.repository';
import { QuestAssignmentRepository } from 'src/repositories/quest-assignment.repository';
import { toDayString } from '../progression/progression.math';
import { currentWeekWindow, todayString } from '../progression/quest-window';
import {
  AssignQuestBody,
  AssignQuestResultResponse,
  CoachQuestDTO,
  CoachQuestListResponse,
  CoachQuestResponse,
  CreateQuestBody,
  QuestAssignmentListResponse,
  UpdateQuestBody,
} from './quest.dto';
import { CoachAthleteRelationshipRepository } from 'src/repositories/coach-athlete-relationship.repository';
import { CoachingMessageRepository } from 'src/repositories/coaching-message.repository';
import { IllnessLogRepository } from 'src/repositories/illness-log.repository';
import { PainLogRepository } from 'src/repositories/pain-log.repository';
import { QuickWellnessCheckinRepository } from 'src/repositories/quick-wellness-checkin.repository';
import { UserRepository } from 'src/repositories/user.repository';
import { WorkoutRepository } from 'src/repositories/workout.repository';
import { WorkoutExecutionRepository } from 'src/repositories/workout-execution.repository';
import { WorkoutPlanRepository } from 'src/repositories/workout-plan.repository';
import { WorkoutPlanItemRepository } from 'src/repositories/workout-plan-item.repository';
import { WorkoutRouteRepository } from 'src/repositories/workout-route.repository';
import { WorkoutScheduleRepository } from 'src/repositories/workout-schedule.repository';

import { AdvancedMetricsApiService } from '../advanced-metrics/advanced-metrics-api.service';
import {
  FitnessFatiguePredictionResponse,
  FitnessFatigueResponse,
  RpeTssCorrelationResponse,
  Vo2MaxHistoryResponse,
  Vo2MaxResponse,
  WellnessPerformanceCorrelationResponse,
} from '../advanced-metrics/response.dto';
import { AnalyticsApiService } from '../analytics/analytics-api.service';
import { StrengthProgressionQuery, TrainingLoadHistoryQuery } from '../analytics/request.dto';
import {
  CurrentTrainingLoadResponse,
  RacePredictionsResponse,
  StrengthProgressionResponse,
  TrackedExercisesResponse,
  TrainingLoadHistoryResponse,
} from '../analytics/response.dto';
import { NotificationsApiService } from '../notifications/notifications-api.service';
import { RaceCalendarApiService } from '../race-calendar/race-calendar-api.service';
import { UploadCourseBody } from '../race-calendar/request.dto';
import { AthleteRaceDTO, CourseBasedPredictionDTO, CourseUploadResponseDTO } from '../race-calendar/response.dto';
import { WorkoutPlanWithItemsResponse } from '../workout-plans/response.dto';
import { WorkoutPlansApiService } from '../workout-plans/workout-plans-api.service';
import { WorkoutResponse } from '../workouts/response.dto';
import { WorkoutsApiService } from '../workouts/workouts-api.service';
import {
  AssignWorkoutBody,
  ComplianceQuery,
  CorrelationQuery,
  CreateAthleteLabelBody,
  CreateAthleteScheduleBody,
  DeployPlanBody,
  FitnessFatiguePredictionBody,
  FitnessFatigueQuery,
  InviteAthleteBody,
  ListAthleteLabelsQuery,
  ListAthleteSchedulesQuery,
  ListAthletesQuery,
  ListMessagesQuery,
  SendMessageBody,
  UpdateAthleteIntakeBody,
  UpdateAthleteLabelBody,
  UpdatePrivacySettingsBody,
  WellnessTrendsQuery,
} from './request.dto';
import {
  ActiveConcernDTO,
  AssignedWorkoutDTO,
  AssignedWorkoutListResponse,
  AssignedWorkoutResponse,
  AthleteComplianceDTO,
  AthleteComplianceResponse,
  AthleteCorrelationSummaryDTO,
  AthleteCorrelationSummaryResponse,
  AthleteDTO,
  AthleteIntakeDTO,
  AthleteIntakeResponse,
  AthleteLabelDTO,
  AthleteLabelResponse,
  AthleteLabelsResponse,
  AthleteListResponse,
  AthleteResponse,
  AthleteScheduleDTO,
  AthleteScheduleListResponse,
  AthleteScheduleResponse,
  AthleteWellnessTrendPointDTO,
  AthleteWellnessTrendsDTO,
  AthleteWellnessTrendsResponse,
  AtRiskAthleteDTO,
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
  TeamCorrelationOverviewDTO,
  TeamCorrelationOverviewResponse,
  TeamWellnessAveragesDTO,
  TeamWellnessOverviewDTO,
  TeamWellnessOverviewResponse,
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
    private readonly intakeRepo: AthleteIntakeRepository,
    private readonly assignedWorkoutRepo: CoachAssignedWorkoutRepository,
    private readonly labelRepo: CoachAthleteLabelRepository,
    private readonly workoutRepo: WorkoutRepository,
    private readonly scheduleRepo: WorkoutScheduleRepository,
    private readonly executionRepo: WorkoutExecutionRepository,
    private readonly routeRepo: WorkoutRouteRepository,
    private readonly workoutPlanRepo: WorkoutPlanRepository,
    private readonly workoutPlanItemRepo: WorkoutPlanItemRepository,
    private readonly messageRepo: CoachingMessageRepository,
    private readonly quickWellnessCheckinRepo: QuickWellnessCheckinRepository,
    private readonly illnessLogRepo: IllnessLogRepository,
    private readonly painLogRepo: PainLogRepository,
    private readonly notificationsService: NotificationsApiService,
    private readonly workoutsService: WorkoutsApiService,
    private readonly workoutPlansService: WorkoutPlansApiService,
    private readonly analyticsService: AnalyticsApiService,
    private readonly advancedMetricsService: AdvancedMetricsApiService,
    private readonly raceCalendarService: RaceCalendarApiService,
    private readonly questRepo: QuestRepository,
    private readonly questAssignmentRepo: QuestAssignmentRepository,
  ) {}

  // ---- Quests (coach-authored) -------------------------------------------

  async createQuest(req: AuthedRequest, body: CreateQuestBody): Promise<CoachQuestResponse> {
    const organisationId = assertActiveOrg(req);
    const quest = await this.questRepo.create({
      organisation_id: organisationId,
      coach_id: req.user.id,
      title: body.title,
      description: body.description ?? null,
      objective_type: body.objectiveType,
      target_value: body.targetValue,
      period: body.period ?? QuestPeriod.ONE_OFF,
      reward_xp: body.rewardXp ?? 0,
      due_date: body.dueDate ?? null,
    });
    return new CoachQuestResponse({ data: this.mapQuest(quest) });
  }

  async listQuests(req: AuthedRequest): Promise<CoachQuestListResponse> {
    const organisationId = assertActiveOrg(req);
    const quests = await this.questRepo.listForCoach(organisationId, req.user.id);
    return new CoachQuestListResponse({ data: quests.map((q) => this.mapQuest(q)) });
  }

  async updateQuest(req: AuthedRequest, questId: string, body: UpdateQuestBody): Promise<CoachQuestResponse> {
    const organisationId = assertActiveOrg(req);
    const patch: QuestUpdate = {};
    if (body.title !== undefined) patch.title = body.title;
    if (body.description !== undefined) patch.description = body.description || null;
    if (body.targetValue !== undefined) patch.target_value = body.targetValue;
    if (body.rewardXp !== undefined) patch.reward_xp = body.rewardXp;
    if (body.status !== undefined) patch.status = body.status;
    const quest = await this.questRepo.updateForCoach(questId, req.user.id, organisationId, patch);
    if (!quest) throw new NotFoundException('Quest not found.');
    return new CoachQuestResponse({ data: this.mapQuest(quest) });
  }

  async archiveQuest(req: AuthedRequest, questId: string): Promise<void> {
    const organisationId = assertActiveOrg(req);
    const quest = await this.questRepo.updateForCoach(questId, req.user.id, organisationId, {
      status: QuestStatus.ARCHIVED,
    });
    if (!quest) throw new NotFoundException('Quest not found.');
  }

  async assignQuestToAthlete(
    req: AuthedRequest,
    athleteId: string,
    body: AssignQuestBody,
  ): Promise<AssignQuestResultResponse> {
    const quest = await this.requireOwnedActiveQuest(req, body.questId);
    const created = (await this.assignQuestRow(quest, athleteId, req.user.id)) ? 1 : 0;
    return new AssignQuestResultResponse({ data: { assignmentsCreated: created } });
  }

  async assignQuestToAll(req: AuthedRequest, questId: string): Promise<AssignQuestResultResponse> {
    const organisationId = assertActiveOrg(req);
    const quest = await this.requireOwnedActiveQuest(req, questId);
    const relationships = await this.relationshipRepo.findMany({
      organisationId,
      coachId: req.user.id,
      status: [CoachAthleteStatus.ACTIVE],
    });
    let created = 0;
    for (const rel of relationships) {
      if (await this.assignQuestRow(quest, rel.athlete_id, req.user.id)) created += 1;
    }
    return new AssignQuestResultResponse({ data: { assignmentsCreated: created } });
  }

  async getAthleteQuests(req: AuthedRequest, athleteId: string): Promise<QuestAssignmentListResponse> {
    const organisationId = assertActiveOrg(req);
    const rows = await this.questAssignmentRepo.listForAthleteWithQuest(athleteId, organisationId);
    return new QuestAssignmentListResponse({
      data: rows.map((r) => ({
        id: r.id,
        questId: r.questId,
        title: r.title,
        objectiveType: r.objectiveType,
        targetValue: r.targetValue,
        progressValue: r.progressValue,
        rewardXp: r.rewardXp,
        period: r.period,
        status: r.status,
        windowEnd: toDayString(r.windowEnd),
      })),
    });
  }

  private async requireOwnedActiveQuest(req: AuthedRequest, questId: string): Promise<Quest> {
    const organisationId = assertActiveOrg(req);
    const quest = await this.questRepo.findByIdInOrg(questId, organisationId);
    if (!quest || quest.coach_id !== req.user.id || quest.status !== QuestStatus.ACTIVE) {
      throw new NotFoundException('Quest not found.');
    }
    return quest;
  }

  /** Insert an assignment for the current window; returns false if one already exists. */
  private async assignQuestRow(quest: Quest, athleteId: string, coachId: string): Promise<boolean> {
    const window =
      quest.period === QuestPeriod.WEEKLY
        ? currentWeekWindow()
        : { start: todayString(), end: toDayString(quest.due_date) };
    const row = await this.questAssignmentRepo.assign({
      quest_id: quest.id,
      organisation_id: quest.organisation_id,
      user_id: athleteId,
      assigned_by_coach_id: coachId,
      objective_type: quest.objective_type,
      target_value: quest.target_value,
      reward_xp: quest.reward_xp,
      period: quest.period,
      window_start: window.start,
      window_end: window.end,
    });
    return !!row;
  }

  private mapQuest(q: Quest): CoachQuestDTO {
    return {
      id: q.id,
      title: q.title,
      description: q.description,
      objectiveType: q.objective_type,
      targetValue: q.target_value,
      period: q.period,
      rewardXp: q.reward_xp,
      dueDate: toDayString(q.due_date),
      status: q.status,
      createdAt: new Date(q.created_at as unknown as string).toISOString(),
    };
  }

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
  async inviteAthlete(req: AuthedRequest, body: InviteAthleteBody): Promise<InvitationResponse> {
    const organisationId = assertActiveOrg(req);
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
      organisation_id: organisationId,
      coach_id: req.user.id,
      athlete_id: athlete.id,
      status: CoachAthleteStatus.PENDING,
      invitation_message: body.message ?? null,
    });

    // Notify the athlete that a coach invited them. Fire-and-forget
    // through the same path used by messages / workout-assignments —
    // the SSE channel pushes to any live athlete-app session, and
    // /notifications/list picks it up on next mount. Errors must NOT
    // roll the invite back; we swallow so a notification hiccup
    // doesn't strand a usable relationship row.
    const coachName = coach.display_name || coach.email || 'Your new coach';
    await this.notificationsService
      .createNotification(
        athlete.id,
        NotificationType.INVITATION_RECEIVED,
        `${coachName} invited you to coach you`,
        body.message?.trim() || undefined,
        { coachId: coach.id, relationshipId: relationship.id, senderName: coachName },
      )
      .catch(() => undefined);

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

    // Create intake record for the athlete to fill out
    await this.intakeRepo.create({
      user_id: req.user.id,
      coach_id: updated.coach_id,
    });

    // Notify the coach that their invitation was accepted. Same
    // fire-and-forget shape as the invite path — the accept must
    // succeed for the athlete regardless of notification status.
    const athlete = await this.userRepo.findById(req.user.id);
    if (athlete) {
      const athleteName = athlete.display_name || athlete.email || 'Your new athlete';
      await this.notificationsService
        .createNotification(
          updated.coach_id,
          NotificationType.INVITATION_ACCEPTED,
          `${athleteName} accepted your invitation`,
          undefined,
          {
            athleteId: athlete.id,
            relationshipId: updated.id,
            athleteName,
          },
        )
        .catch(() => undefined);
    }

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

    // Tell the coach the invitation was declined so they don't sit
    // refreshing the team page waiting. Same fire-and-forget shape.
    const athlete = await this.userRepo.findById(req.user.id);
    if (athlete) {
      const athleteName = athlete.display_name || athlete.email || 'The athlete';
      await this.notificationsService
        .createNotification(
          updated.coach_id,
          NotificationType.INVITATION_DECLINED,
          `${athleteName} declined your invitation`,
          undefined,
          {
            athleteId: athlete.id,
            relationshipId: updated.id,
            athleteName,
          },
        )
        .catch(() => undefined);
    }

    return {
      data: this.mapToInvitationDTO(updated, coach!),
    };
  }

  // Coach's Athletes
  async getAthletes(req: AuthedRequest, query?: ListAthletesQuery): Promise<AthleteListResponse> {
    const organisationId = assertActiveOrg(req);
    // The org-app team page tabs hit this endpoint with the
    // status param explicitly set (active / pending / declined /
    // removed). Calls without a status default to the historical
    // "roster" view (active + pending) so existing consumers
    // (athlete detail, scheduling flows) don't change.
    const status: CoachAthleteStatus[] = query?.status
      ? [query.status]
      : [CoachAthleteStatus.ACTIVE, CoachAthleteStatus.PENDING];
    const relationships = await this.relationshipRepo.findMany({
      organisationId,
      coachId: req.user.id,
      status,
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
    // Scope the cleanup to the relationship's org — this athlete may be coached
    // in another org too, and that roster must stay intact.
    await this.assignedWorkoutRepo.deleteByAthleteInOrg(athleteId, relationship.organisation_id);
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
    await this.assignedWorkoutRepo.deleteByAthleteInOrg(req.user.id, relationship.organisation_id);
  }

  // Workout Assignment
  async assignWorkout(
    req: AuthedRequest,
    athleteId: string,
    body: AssignWorkoutBody,
  ): Promise<AssignedWorkoutResponse> {
    const organisationId = assertActiveOrg(req);
    // Relationship is verified by guard

    // Verify the workout exists, belongs to the coach, AND lives in the active
    // org — so a coach with memberships in several orgs can't pull one org's
    // workout into another org's roster.
    const workout = await this.workoutRepo.findById(body.workoutId);
    if (!workout || workout.user_id !== req.user.id || workout.organisation_id !== organisationId) {
      throw new NotFoundException('Workout not found');
    }

    const assignment = await this.assignedWorkoutRepo.create({
      organisation_id: organisationId,
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
    req: AuthedRequest,
    athleteId: string,
  ): Promise<AssignedWorkoutListResponse> {
    const organisationId = assertActiveOrg(req);
    const assignments = await this.assignedWorkoutRepo.findMany({
      organisationId,
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
    const organisationId = assertActiveOrg(req);
    const assignment = await this.assignedWorkoutRepo.findById(assignmentId);
    if (
      !assignment ||
      assignment.coach_id !== req.user.id ||
      assignment.athlete_id !== athleteId ||
      assignment.organisation_id !== organisationId
    ) {
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
        shareWellnessCheckins: settings.share_wellness_checkins,
      },
    };
  }

  async getAthletePrivacySettings(
    _req: Request & { user: AuthUser },
    athleteId: string,
  ): Promise<PrivacySettingsResponse> {
    // Relationship is verified by guard
    const settings = await this.privacySettingsRepo.getOrCreateDefault(athleteId);

    return {
      data: {
        shareWorkouts: settings.share_workouts,
        shareExecutions: settings.share_executions,
        shareAnalytics: settings.share_analytics,
        shareCalendar: settings.share_calendar,
        sharePersonalRecords: settings.share_personal_records,
        shareSleepData: settings.share_sleep_data,
        shareTrainingLoad: settings.share_training_load,
        shareWellnessCheckins: settings.share_wellness_checkins,
      },
    };
  }

  // ==================== ATHLETE RACES (Coach viewing) ====================

  async getAthleteRaces(athleteId: string): Promise<AthleteRaceDTO[]> {
    const settings = await this.privacySettingsRepo.findByUserId(athleteId);
    if (!settings?.share_calendar) {
      throw new ForbiddenException('Athlete has not shared their calendar with you');
    }
    // Create a mock request object to call the race calendar service
    const mockReq = { user: { id: athleteId } } as Request & { user: AuthUser };
    return this.raceCalendarService.listAthleteRaces(mockReq);
  }

  async getAthleteCoursePrediction(athleteId: string, raceId: string): Promise<CourseBasedPredictionDTO> {
    const settings = await this.privacySettingsRepo.findByUserId(athleteId);
    if (!settings?.share_calendar) {
      throw new ForbiddenException('Athlete has not shared their calendar with you');
    }
    const mockReq = { user: { id: athleteId } } as Request & { user: AuthUser };
    return this.raceCalendarService.getCoursePrediction(mockReq, raceId);
  }

  async uploadAthleteCourseFilee(
    athleteId: string,
    raceId: string,
    file: Express.Multer.File,
    body: UploadCourseBody,
  ): Promise<CourseUploadResponseDTO> {
    const settings = await this.privacySettingsRepo.findByUserId(athleteId);
    if (!settings?.share_calendar) {
      throw new ForbiddenException('Athlete has not shared their calendar with you');
    }
    const mockReq = { user: { id: athleteId } } as Request & { user: AuthUser };
    return this.raceCalendarService.uploadCourseFile(mockReq, raceId, file, body);
  }

  async deleteAthleteCourseFilee(athleteId: string, raceId: string): Promise<void> {
    const settings = await this.privacySettingsRepo.findByUserId(athleteId);
    if (!settings?.share_calendar) {
      throw new ForbiddenException('Athlete has not shared their calendar with you');
    }
    const mockReq = { user: { id: athleteId } } as Request & { user: AuthUser };
    return this.raceCalendarService.deleteCourseFile(mockReq, raceId);
  }

  // ==================== ATHLETE ANALYTICS (Coach viewing) ====================

  async getAthleteRacePredictions(athleteId: string): Promise<RacePredictionsResponse> {
    const settings = await this.privacySettingsRepo.findByUserId(athleteId);
    if (!settings?.share_analytics) {
      throw new ForbiddenException('Athlete has not shared analytics with you');
    }
    return this.analyticsService.getRacePredictionsForUser(athleteId);
  }

  async getAthleteTrackedExercises(athleteId: string): Promise<TrackedExercisesResponse> {
    const settings = await this.privacySettingsRepo.findByUserId(athleteId);
    if (!settings?.share_analytics) {
      throw new ForbiddenException('Athlete has not shared analytics with you');
    }
    return this.analyticsService.getTrackedExercisesForUser(athleteId);
  }

  async getAthleteStrengthProgression(
    athleteId: string,
    exerciseId: string,
    query: StrengthProgressionQuery,
  ): Promise<StrengthProgressionResponse> {
    const settings = await this.privacySettingsRepo.findByUserId(athleteId);
    if (!settings?.share_analytics) {
      throw new ForbiddenException('Athlete has not shared analytics with you');
    }
    return this.analyticsService.getStrengthProgressionForUser(athleteId, exerciseId, query);
  }

  async getAthleteTrainingLoad(athleteId: string): Promise<CurrentTrainingLoadResponse> {
    const settings = await this.privacySettingsRepo.findByUserId(athleteId);
    if (!settings?.share_training_load) {
      throw new ForbiddenException('Athlete has not shared training load with you');
    }
    return this.analyticsService.getCurrentTrainingLoadForUser(athleteId);
  }

  async getAthleteTrainingLoadHistory(
    athleteId: string,
    query: TrainingLoadHistoryQuery,
  ): Promise<TrainingLoadHistoryResponse> {
    const settings = await this.privacySettingsRepo.findByUserId(athleteId);
    if (!settings?.share_training_load) {
      throw new ForbiddenException('Athlete has not shared training load with you');
    }
    return this.analyticsService.getTrainingLoadHistoryForUser(athleteId, query);
  }

  // ==================== ATHLETE FITNESS-FATIGUE / PMC (Coach viewing) ====================

  async getAthleteFitnessFatigue(athleteId: string, query: FitnessFatigueQuery): Promise<FitnessFatigueResponse> {
    const settings = await this.privacySettingsRepo.findByUserId(athleteId);
    if (!settings?.share_training_load) {
      throw new ForbiddenException('Athlete has not shared training load with you');
    }
    return this.advancedMetricsService.getFitnessFatigueForUser(athleteId, query.days ?? 90);
  }

  async predictAthleteFitnessFatigue(
    athleteId: string,
    body: FitnessFatiguePredictionBody,
  ): Promise<FitnessFatiguePredictionResponse> {
    const settings = await this.privacySettingsRepo.findByUserId(athleteId);
    if (!settings?.share_training_load) {
      throw new ForbiddenException('Athlete has not shared training load with you');
    }
    return this.advancedMetricsService.predictFitnessFatigueForUser(athleteId, body);
  }

  async getAthleteVo2Max(athleteId: string): Promise<Vo2MaxResponse> {
    const settings = await this.privacySettingsRepo.findByUserId(athleteId);
    if (!settings?.share_training_load) {
      throw new ForbiddenException('Athlete has not shared training load with you');
    }
    return this.advancedMetricsService.getVo2MaxForUser(athleteId);
  }

  async getAthleteVo2MaxHistory(athleteId: string, query: FitnessFatigueQuery): Promise<Vo2MaxHistoryResponse> {
    const settings = await this.privacySettingsRepo.findByUserId(athleteId);
    if (!settings?.share_training_load) {
      throw new ForbiddenException('Athlete has not shared training load with you');
    }
    return this.advancedMetricsService.getVo2MaxHistoryForUser(athleteId, query.days ?? 90);
  }

  // ==================== ATHLETE MULTI-STREAM LOAD (Coach viewing) ====================

  async getAthleteMultiStreamLoadHistory(
    athleteId: string,
    query: FitnessFatigueQuery,
  ): Promise<import('../advanced-metrics/response.dto').MultiStreamLoadHistoryResponse> {
    const settings = await this.privacySettingsRepo.findByUserId(athleteId);
    if (!settings?.share_training_load) {
      throw new ForbiddenException('Athlete has not shared training load with you');
    }
    return this.advancedMetricsService.getMultiStreamLoadHistoryForUser(athleteId, query.days ?? 30);
  }

  // ==================== ATHLETE READINESS (Coach viewing) ====================

  async getAthleteReadiness(
    athleteId: string,
    date?: string,
  ): Promise<import('../advanced-metrics/response.dto').DailyReadinessResponse> {
    const settings = await this.privacySettingsRepo.findByUserId(athleteId);
    if (!settings?.share_training_load) {
      throw new ForbiddenException('Athlete has not shared training load with you');
    }
    return this.advancedMetricsService.getDailyReadinessForUser(athleteId, date);
  }

  async getAthleteReadinessHistory(
    athleteId: string,
    query: FitnessFatigueQuery,
  ): Promise<import('../advanced-metrics/response.dto').ReadinessHistoryResponse> {
    const settings = await this.privacySettingsRepo.findByUserId(athleteId);
    if (!settings?.share_training_load) {
      throw new ForbiddenException('Athlete has not shared training load with you');
    }
    return this.advancedMetricsService.getReadinessHistoryForUser(athleteId, query.days ?? 30);
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
    if (body.shareWellnessCheckins !== undefined) update.share_wellness_checkins = body.shareWellnessCheckins;

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
        shareWellnessCheckins: settings.share_wellness_checkins,
      },
    };
  }

  // ==================== ATHLETE INTAKE ====================

  // Get own intake form (athlete view)
  async getMyIntake(req: Request & { user: AuthUser }): Promise<AthleteIntakeResponse> {
    // Find active coach relationship
    const relationship = await this.relationshipRepo.findActiveByAthleteId(req.user.id);
    if (!relationship) {
      throw new NotFoundException('You do not have an active coach');
    }

    let intake = await this.intakeRepo.findByUserAndCoach(req.user.id, relationship.coach_id);

    // Auto-create intake form if it doesn't exist (for relationships created before intake feature)
    if (!intake) {
      intake = await this.intakeRepo.create({
        user_id: req.user.id,
        coach_id: relationship.coach_id,
      });
    }

    return {
      data: this.mapToAthleteIntakeDTO(intake),
    };
  }

  // Update own intake form (athlete)
  async updateMyIntake(
    req: Request & { user: AuthUser },
    body: UpdateAthleteIntakeBody,
  ): Promise<AthleteIntakeResponse> {
    // Find active coach relationship
    const relationship = await this.relationshipRepo.findActiveByAthleteId(req.user.id);
    if (!relationship) {
      throw new NotFoundException('You do not have an active coach');
    }

    const existing = await this.intakeRepo.findByUserAndCoach(req.user.id, relationship.coach_id);
    if (!existing) {
      throw new NotFoundException('Intake form not found');
    }

    // Build update object
    const updateData: Record<string, unknown> = {};
    if (body.primaryGoals !== undefined) updateData.primary_goals = body.primaryGoals;
    if (body.trainingDaysPerWeek !== undefined) updateData.training_days_per_week = body.trainingDaysPerWeek;
    if (body.preferredSessionDuration !== undefined) {
      updateData.preferred_session_duration = body.preferredSessionDuration;
    }
    if (body.availableDays !== undefined) updateData.available_days = body.availableDays;
    if (body.experienceLevel !== undefined) updateData.experience_level = body.experienceLevel;
    if (body.currentActivityLevel !== undefined) updateData.current_activity_level = body.currentActivityLevel;
    if (body.injuriesLimitations !== undefined) updateData.injuries_limitations = body.injuriesLimitations;
    if (body.medicalConditions !== undefined) updateData.medical_conditions = body.medicalConditions;
    if (body.equipmentAccess !== undefined) updateData.equipment_access = body.equipmentAccess;
    if (body.trainingLocation !== undefined) updateData.training_location = body.trainingLocation;
    if (body.primarySport !== undefined) updateData.primary_sport = body.primarySport;
    if (body.competitiveEvents !== undefined) updateData.competitive_events = body.competitiveEvents;
    if (body.enduranceSport !== undefined) updateData.endurance_sport = body.enduranceSport;
    if (body.enduranceSportOther !== undefined) updateData.endurance_sport_other = body.enduranceSportOther;
    if (body.targetEvents !== undefined) updateData.target_events = body.targetEvents;
    if (body.targetEventOther !== undefined) updateData.target_event_other = body.targetEventOther;
    if (body.additionalNotes !== undefined) updateData.additional_notes = body.additionalNotes;

    const updated = await this.intakeRepo.updateById(existing.id, updateData);

    return {
      data: this.mapToAthleteIntakeDTO(updated),
    };
  }

  // Complete intake form (athlete)
  async completeMyIntake(req: Request & { user: AuthUser }): Promise<AthleteIntakeResponse> {
    // Find active coach relationship
    const relationship = await this.relationshipRepo.findActiveByAthleteId(req.user.id);
    if (!relationship) {
      throw new NotFoundException('You do not have an active coach');
    }

    const existing = await this.intakeRepo.findByUserAndCoach(req.user.id, relationship.coach_id);
    if (!existing) {
      throw new NotFoundException('Intake form not found');
    }

    if (existing.completed_at) {
      throw new BadRequestException('Intake form has already been completed');
    }

    const completed = await this.intakeRepo.markCompleted(existing.id);

    // Notify coach that athlete completed intake
    const athlete = await this.userRepo.findById(req.user.id);
    const athleteName = athlete?.display_name || athlete?.email || 'Your athlete';
    await this.notificationsService.createNotification(
      relationship.coach_id,
      NotificationType.MESSAGE,
      `${athleteName} completed their intake form`,
      'Review their goals, availability, and training preferences.',
      {
        athleteId: req.user.id,
        coachId: relationship.coach_id,
        relationshipId: relationship.id,
      },
    );

    return {
      data: this.mapToAthleteIntakeDTO(completed),
    };
  }

  // Get athlete's intake (coach view)
  async getAthleteIntake(
    _req: Request & { user: AuthUser },
    athleteId: string,
    coachId: string,
  ): Promise<AthleteIntakeResponse> {
    // Relationship is verified by guard

    const intake = await this.intakeRepo.findByUserAndCoach(athleteId, coachId);
    if (!intake) {
      throw new NotFoundException('Intake form not found for this athlete');
    }

    return {
      data: this.mapToAthleteIntakeDTO(intake),
    };
  }

  private mapToAthleteIntakeDTO(intake: AthleteIntake): AthleteIntakeDTO {
    const completedAt = intake.completed_at
      ? intake.completed_at instanceof Date
        ? intake.completed_at.toISOString()
        : String(intake.completed_at)
      : null;

    const createdAt = intake.created_at instanceof Date ? intake.created_at.toISOString() : String(intake.created_at);

    const updatedAt = intake.updated_at instanceof Date ? intake.updated_at.toISOString() : String(intake.updated_at);

    return {
      id: intake.id,
      userId: intake.user_id,
      coachId: intake.coach_id,
      primaryGoals: intake.primary_goals,
      trainingDaysPerWeek: intake.training_days_per_week,
      preferredSessionDuration: intake.preferred_session_duration,
      availableDays: intake.available_days,
      experienceLevel: intake.experience_level as 'beginner' | 'intermediate' | 'advanced' | null,
      currentActivityLevel: intake.current_activity_level as
        | 'sedentary'
        | 'lightly_active'
        | 'moderately_active'
        | 'very_active'
        | null,
      injuriesLimitations: intake.injuries_limitations,
      medicalConditions: intake.medical_conditions,
      equipmentAccess: intake.equipment_access,
      trainingLocation: intake.training_location as 'home' | 'gym' | 'outdoor' | 'mixed' | null,
      primarySport: intake.primary_sport,
      competitiveEvents: intake.competitive_events,
      enduranceSport: intake.endurance_sport as 'running' | 'cycling' | 'swimming' | 'triathlon' | 'other' | null,
      enduranceSportOther: intake.endurance_sport_other,
      targetEvents: intake.target_events,
      targetEventOther: intake.target_event_other,
      additionalNotes: intake.additional_notes,
      completedAt,
      createdAt,
      updatedAt,
    };
  }

  // Athlete Schedules (coach viewing/managing athlete calendars)
  async getAthleteSchedules(
    req: AuthedRequest,
    athleteId: string,
    query: ListAthleteSchedulesQuery,
  ): Promise<AthleteScheduleListResponse> {
    const organisationId = assertActiveOrg(req);
    // Verify privacy settings allow calendar access
    const privacySettings = await this.privacySettingsRepo.findByUserId(athleteId);
    if (privacySettings && !privacySettings.share_calendar) {
      throw new ForbiddenException('Athlete has not shared their calendar with you');
    }

    const dateFrom = query.dateFrom ? new Date(query.dateFrom) : undefined;
    const dateTo = query.dateTo ? new Date(query.dateTo) : undefined;

    const schedules = await this.scheduleRepo.findMany({
      organisationId,
      filter: {
        userId: athleteId,
        dateFrom,
        dateTo,
      },
      sort: [{ field: 'scheduled_date', direction: 'asc' }],
    });

    // Fetch all workouts for the schedules - batch fetch instead of N+1 queries
    const workoutIds = [...new Set(schedules.map((s) => s.workout_id))];
    const workouts = await this.workoutRepo.findByIds(workoutIds);
    const workoutMap = new Map<string, Workout>(workouts.map((w) => [w.id, w]));

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
    req: AuthedRequest,
    athleteId: string,
    body: CreateAthleteScheduleBody,
  ): Promise<AthleteScheduleResponse> {
    const organisationId = assertActiveOrg(req);
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
      organisation_id: organisationId,
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
    req: AuthedRequest,
    query: ComplianceQuery,
  ): Promise<ComplianceOverviewResponse> {
    const organisationId = assertActiveOrg(req);
    // Get all active athletes for this coach
    const relationships = await this.relationshipRepo.findMany({
      organisationId,
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

      const compliance = await this.calculateAthleteCompliance(organisationId, rel.athlete_id, dateFrom, dateTo);
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
    req: AuthedRequest,
    athleteId: string,
    query: ComplianceQuery,
  ): Promise<AthleteComplianceResponse> {
    const organisationId = assertActiveOrg(req);
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

    const compliance = await this.calculateAthleteCompliance(organisationId, athleteId, dateFrom, dateTo);

    return {
      data: {
        athleteId,
        user: this.mapToUserBasicDTO(user),
        ...compliance,
      },
    };
  }

  private async calculateAthleteCompliance(
    organisationId: string,
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
      organisationId,
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
    req: AuthedRequest,
  ): Promise<DeployPlanResponse> {
    const organisationId = assertActiveOrg(req);
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
        organisation_id: organisationId,
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
    const relationship =
      (await this.relationshipRepo.findActiveByCoachAndAthlete(userId, athleteId)) ||
      (await this.relationshipRepo.findActiveByCoachAndAthlete(athleteId, userId));

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
      const scheduledDate =
        schedule.scheduled_date instanceof Date
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
    const title = body.isWorkoutNote ? `New workout note from ${senderName}` : `New message from ${senderName}`;
    const notificationBody = body.content.length > 100 ? body.content.substring(0, 100) + '...' : body.content;

    await this.notificationsService.createNotification(recipientId, notificationType, title, notificationBody, {
      messageId: message.id,
      relationshipId: relationship.id,
      senderName,
      workoutScheduleId: body.workoutScheduleId,
      workoutName: workoutInfo?.name || undefined,
      athleteId,
      coachId: relationship.coach_id,
    });

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
    const relationship =
      (await this.relationshipRepo.findActiveByCoachAndAthlete(userId, athleteId)) ||
      (await this.relationshipRepo.findActiveByCoachAndAthlete(athleteId, userId));

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

    // Build maps using helper method
    const { senderMap, workoutInfoMap, attachedWorkoutsMap, attachedPlansMap } =
      await this.buildMessageLookupMaps(resultMessages);

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
    const relationship =
      (await this.relationshipRepo.findActiveByCoachAndAthlete(userId, athleteId)) ||
      (await this.relationshipRepo.findActiveByCoachAndAthlete(athleteId, userId));

    if (!relationship || relationship.status !== CoachAthleteStatus.ACTIVE) {
      throw new ForbiddenException('No active coaching relationship found');
    }

    // Verify workout schedule belongs to athlete
    const schedule = await this.scheduleRepo.findById(workoutScheduleId);
    if (!schedule || schedule.user_id !== athleteId) {
      throw new NotFoundException('Workout schedule not found');
    }

    const workout = await this.workoutRepo.findById(schedule.workout_id);
    const scheduledDate =
      schedule.scheduled_date instanceof Date
        ? formatDateToYMD(schedule.scheduled_date)
        : String(schedule.scheduled_date);
    const workoutInfo = workout ? { name: workout.name, scheduledDate } : null;

    const messages = await this.messageRepo.findWorkoutNotes(workoutScheduleId);

    // Build maps using helper method
    const { senderMap, attachedWorkoutsMap, attachedPlansMap } = await this.buildMessageLookupMaps(messages);

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

  async getUnreadMessageCount(req: Request & { user: AuthUser }, athleteId: string): Promise<UnreadCountResponse> {
    const userId = req.user.id;

    // Find the relationship
    const relationship =
      (await this.relationshipRepo.findActiveByCoachAndAthlete(userId, athleteId)) ||
      (await this.relationshipRepo.findActiveByCoachAndAthlete(athleteId, userId));

    if (!relationship || relationship.status !== CoachAthleteStatus.ACTIVE) {
      throw new ForbiddenException('No active coaching relationship found');
    }

    const unreadCount = await this.messageRepo.countUnread(relationship.id, userId);

    return { unreadCount };
  }

  // ==================== ATHLETE MESSAGING TO COACH ====================

  async sendMessageToCoach(req: Request & { user: AuthUser }, body: SendMessageBody): Promise<MessageResponse> {
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
      const scheduledDate =
        schedule.scheduled_date instanceof Date
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
    const title = body.isWorkoutNote ? `New workout note from ${senderName}` : `New message from ${senderName}`;
    const notificationBody = body.content.length > 100 ? body.content.substring(0, 100) + '...' : body.content;

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

    // Build maps using helper method
    const { senderMap, workoutInfoMap, attachedWorkoutsMap, attachedPlansMap } =
      await this.buildMessageLookupMaps(resultMessages);

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

  async getUnreadMessageCountFromCoach(req: Request & { user: AuthUser }): Promise<UnreadCountResponse> {
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

  async getSharedWorkout(req: Request & { user: AuthUser }, workoutId: string): Promise<WorkoutResponse> {
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
    const sharedMessage = await this.messageRepo.findByAttachedWorkoutInRelationship(workoutId, relationship.id);

    if (!sharedMessage) {
      throw new NotFoundException('Workout not found or not shared with you');
    }

    return this.workoutsService.getWorkoutByIdInternal(workoutId);
  }

  async getSharedPlan(req: Request & { user: AuthUser }, planId: string): Promise<WorkoutPlanWithItemsResponse> {
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
    const sharedMessage = await this.messageRepo.findByAttachedPlanInRelationship(planId, relationship.id);

    if (!sharedMessage) {
      throw new NotFoundException('Plan not found or not shared with you');
    }

    return this.workoutPlansService.getByIdInternal(planId);
  }

  async copySharedWorkoutToLibrary(req: Request & { user: AuthUser }, workoutId: string): Promise<WorkoutResponse> {
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
    const sharedMessage = await this.messageRepo.findByAttachedWorkoutInRelationship(workoutId, relationship.id);

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
    const sharedMessage = await this.messageRepo.findByAttachedPlanInRelationship(planId, relationship.id);

    if (!sharedMessage) {
      throw new NotFoundException('Plan not found or not shared with you');
    }

    // Copy the plan and all its workouts to the user's library
    return this.workoutPlansService.copyPlanToUser(planId, userId);
  }

  // ==================== COACH WELLNESS DASHBOARD ====================

  async getTeamWellnessOverview(req: AuthedRequest): Promise<TeamWellnessOverviewResponse> {
    const organisationId = assertActiveOrg(req);
    const coachId = req.user.id;

    // Get all active athletes for this coach
    const relationships = await this.relationshipRepo.findMany({
      organisationId,
      coachId,
      status: [CoachAthleteStatus.ACTIVE],
    });

    const today = new Date();
    const todayStr = formatDateToYMD(today);

    // Collect wellness data from athletes who have enabled sharing
    const athleteWellnessData: Array<{
      athleteId: string;
      athleteName: string;
      sleepQuality: number | null;
      energyLevel: number | null;
      soreness: number | null;
      stress: number | null;
      readiness: number | null;
      hasCheckinToday: boolean;
    }> = [];

    const atRiskAthletes: AtRiskAthleteDTO[] = [];
    const activeConcerns: ActiveConcernDTO[] = [];

    for (const rel of relationships) {
      const user = await this.userRepo.findById(rel.athlete_id);
      if (!user) continue;

      // Check privacy settings
      const privacySettings = await this.privacySettingsRepo.findByUserId(rel.athlete_id);
      if (!privacySettings?.share_wellness_checkins) {
        continue; // Skip athletes who haven't enabled wellness sharing
      }

      const athleteName = user.display_name || user.email || 'Unknown';

      // Get today's check-in if exists
      const todayCheckin = await this.quickWellnessCheckinRepo.findByUserAndDate(rel.athlete_id, today);

      // Get 7-day average for trends
      const avgScores = await this.quickWellnessCheckinRepo.getAverageScores(rel.athlete_id, 7);

      athleteWellnessData.push({
        athleteId: rel.athlete_id,
        athleteName,
        sleepQuality: todayCheckin?.sleep_quality ?? avgScores.sleepQuality,
        energyLevel: todayCheckin?.energy_level ?? avgScores.energyLevel,
        soreness: todayCheckin?.muscle_soreness ?? avgScores.muscleSoreness,
        stress: todayCheckin?.stress_level ?? avgScores.stressLevel,
        readiness: todayCheckin?.training_readiness ?? avgScores.trainingReadiness,
        hasCheckinToday: !!todayCheckin,
      });

      // Check for at-risk conditions
      // Low recovery: avg readiness < 2.5 over 7 days
      if (avgScores.trainingReadiness && avgScores.trainingReadiness < 2.5) {
        atRiskAthletes.push({
          athleteId: rel.athlete_id,
          athleteName,
          riskType: 'low_recovery',
          riskScore: Math.round((2.5 - avgScores.trainingReadiness) * 40), // Scale to 0-100
          details: `Average readiness ${avgScores.trainingReadiness.toFixed(1)}/5 over past 7 days`,
        });
      }

      // High fatigue: avg energy < 2 over 7 days
      if (avgScores.energyLevel && avgScores.energyLevel < 2) {
        atRiskAthletes.push({
          athleteId: rel.athlete_id,
          athleteName,
          riskType: 'high_fatigue',
          riskScore: Math.round((2 - avgScores.energyLevel) * 50),
          details: `Average energy ${avgScores.energyLevel.toFixed(1)}/5 over past 7 days`,
        });
      }

      // Check for active injuries (pain logs marked as injury with high pain level)
      const recentPainLogs = await this.painLogRepo.findMany({
        filter: { userId: rel.athlete_id, minPainLevel: 5 },
        limit: 5,
      });

      for (const painLog of recentPainLogs) {
        if (painLog.is_injury) {
          const daysSinceStart = Math.floor(
            (today.getTime() - new Date(painLog.created_at as any).getTime()) / (1000 * 60 * 60 * 24),
          );

          if (daysSinceStart <= 14) {
            // Only show injuries from last 2 weeks
            atRiskAthletes.push({
              athleteId: rel.athlete_id,
              athleteName,
              riskType: 'active_injury',
              riskScore: painLog.pain_level * 10,
              details: `${painLog.body_part} injury (pain level ${painLog.pain_level}/10)`,
            });

            activeConcerns.push({
              athleteId: rel.athlete_id,
              athleteName,
              concernType: 'injury',
              description: `${painLog.body_part} - ${painLog.injury_type || 'unspecified'} injury`,
              daysSinceStart,
            });
          }
        }
      }

      // Check for active illnesses
      const activeIllnesses = await this.illnessLogRepo.getActiveForUser(rel.athlete_id);
      for (const illness of activeIllnesses) {
        const daysSinceStart = Math.floor(
          (today.getTime() - new Date(illness.start_date as any).getTime()) / (1000 * 60 * 60 * 24),
        );

        atRiskAthletes.push({
          athleteId: rel.athlete_id,
          athleteName,
          riskType: 'active_illness',
          riskScore: illness.severity * 10,
          details: `${illness.illness_type} (severity ${illness.severity}/10, day ${daysSinceStart + 1})`,
        });

        activeConcerns.push({
          athleteId: rel.athlete_id,
          athleteName,
          concernType: 'illness',
          description: `${illness.illness_type} - severity ${illness.severity}/10`,
          daysSinceStart,
        });
      }
    }

    // Calculate team averages
    const athletesWithData = athleteWellnessData.filter(
      (a) => a.sleepQuality || a.energyLevel || a.soreness || a.stress || a.readiness,
    );

    const calculateAverage = (values: (number | null)[]): number => {
      const valid = values.filter((v): v is number => v !== null);
      if (valid.length === 0) return 0;
      return valid.reduce((sum, v) => sum + v, 0) / valid.length;
    };

    const teamAverages: TeamWellnessAveragesDTO = {
      sleepQuality: Math.round(calculateAverage(athletesWithData.map((a) => a.sleepQuality)) * 10) / 10,
      energyLevel: Math.round(calculateAverage(athletesWithData.map((a) => a.energyLevel)) * 10) / 10,
      soreness: Math.round(calculateAverage(athletesWithData.map((a) => a.soreness)) * 10) / 10,
      stress: Math.round(calculateAverage(athletesWithData.map((a) => a.stress)) * 10) / 10,
      readiness: Math.round(calculateAverage(athletesWithData.map((a) => a.readiness)) * 10) / 10,
      checkinCompliance:
        athleteWellnessData.length > 0
          ? Math.round((athleteWellnessData.filter((a) => a.hasCheckinToday).length / athleteWellnessData.length) * 100)
          : 0,
    };

    // Sort at-risk athletes by risk score descending
    atRiskAthletes.sort((a, b) => b.riskScore - a.riskScore);

    // Remove duplicates (same athlete can appear multiple times for different risk types)
    const uniqueAtRiskAthletes = atRiskAthletes.filter(
      (athlete, index, self) =>
        index === self.findIndex((a) => a.athleteId === athlete.athleteId && a.riskType === athlete.riskType),
    );

    const overviewData: TeamWellnessOverviewDTO = {
      teamAverages,
      atRiskAthletes: uniqueAtRiskAthletes,
      activeConcerns,
    };

    return { data: overviewData };
  }

  async getAthleteWellnessTrends(
    req: Request & { user: AuthUser },
    athleteId: string,
    query: WellnessTrendsQuery,
  ): Promise<AthleteWellnessTrendsResponse> {
    // Verify relationship exists
    const relationship = await this.relationshipRepo.findActiveByCoachAndAthlete(req.user.id, athleteId);
    if (!relationship) {
      throw new NotFoundException('Athlete not found in your roster');
    }

    // Check privacy settings
    const privacySettings = await this.privacySettingsRepo.findByUserId(athleteId);
    if (!privacySettings?.share_wellness_checkins) {
      throw new ForbiddenException('Athlete has not shared wellness check-ins with you');
    }

    const user = await this.userRepo.findById(athleteId);
    if (!user) {
      throw new NotFoundException('Athlete not found');
    }

    const days = query.days ?? 30;
    const checkins = await this.quickWellnessCheckinRepo.getDateRange(athleteId, days);

    const athleteName = user.display_name || user.email || 'Unknown';

    // Map check-ins to trend points
    const trends: AthleteWellnessTrendPointDTO[] = checkins.map((checkin) => {
      // Calculate composite wellness score (0-100)
      const scores = [
        checkin.sleep_quality,
        checkin.energy_level,
        checkin.muscle_soreness,
        checkin.stress_level,
        checkin.training_readiness,
      ].filter((s): s is number => s !== null);

      const avgScore = scores.length > 0 ? scores.reduce((sum, s) => sum + s, 0) / scores.length : 0;
      const wellnessScore = Math.round(((avgScore - 1) / 4) * 100); // Scale 1-5 to 0-100

      return {
        date:
          checkin.checkin_date instanceof Date ? formatDateToYMD(checkin.checkin_date) : String(checkin.checkin_date),
        sleepQuality: checkin.sleep_quality ?? null,
        energyLevel: checkin.energy_level ?? null,
        muscleSoreness: checkin.muscle_soreness ?? null,
        stressLevel: checkin.stress_level ?? null,
        trainingReadiness: checkin.training_readiness ?? null,
        wellnessScore,
      };
    });

    // Calculate trend direction based on first and last week averages
    let trendDirection: 'improving' | 'stable' | 'declining' = 'stable';
    if (trends.length >= 7) {
      const firstWeek = trends.slice(0, 7);
      const lastWeek = trends.slice(-7);

      const firstWeekAvg = firstWeek.reduce((sum, t) => sum + t.wellnessScore, 0) / firstWeek.length;
      const lastWeekAvg = lastWeek.reduce((sum, t) => sum + t.wellnessScore, 0) / lastWeek.length;

      const diff = lastWeekAvg - firstWeekAvg;
      if (diff > 5) {
        trendDirection = 'improving';
      } else if (diff < -5) {
        trendDirection = 'declining';
      }
    }

    const trendsData: AthleteWellnessTrendsDTO = {
      athleteId,
      athleteName,
      trends,
      trendDirection,
    };

    return { data: trendsData };
  }

  /**
   * Helper method to batch fetch all lookup data for messages (senders, schedules, workouts, plans)
   * This replaces multiple N+1 query patterns with efficient batch fetches
   */
  private async buildMessageLookupMaps(messages: CoachingMessage[]): Promise<{
    senderMap: Map<string, User>;
    workoutInfoMap: Map<string, { name: string; scheduledDate: string }>;
    attachedWorkoutsMap: Map<string, AttachedWorkoutDTO>;
    attachedPlansMap: Map<string, AttachedPlanDTO>;
  }> {
    // Batch fetch senders
    const senderIds = [...new Set(messages.map((m) => m.sender_id))];
    const senders = await this.userRepo.findByIds(senderIds);
    const senderMap = new Map(senders.map((s) => [s.id, s]));

    // Batch fetch schedules and their workouts
    const scheduleIds = [...new Set(messages.filter((m) => m.workout_schedule_id).map((m) => m.workout_schedule_id!))];
    const schedules = await this.scheduleRepo.findByIds(scheduleIds);
    const scheduleMap = new Map(schedules.map((s) => [s.id, s]));

    const scheduleWorkoutIds = [...new Set(schedules.map((s) => s.workout_id))];
    const scheduleWorkouts = await this.workoutRepo.findByIds(scheduleWorkoutIds);
    const scheduleWorkoutMap = new Map(scheduleWorkouts.map((w) => [w.id, w]));

    const workoutInfoMap = new Map<string, { name: string; scheduledDate: string }>();
    for (const schedule of schedules) {
      const workout = scheduleWorkoutMap.get(schedule.workout_id);
      if (workout) {
        const scheduledDate =
          schedule.scheduled_date instanceof Date
            ? formatDateToYMD(schedule.scheduled_date)
            : String(schedule.scheduled_date);
        workoutInfoMap.set(schedule.id, { name: workout.name, scheduledDate });
      }
    }

    // Batch fetch attached workouts
    const attachedWorkoutIds = [
      ...new Set(messages.filter((m) => m.attached_workout_id).map((m) => m.attached_workout_id!)),
    ];
    const attachedWorkouts = await this.workoutRepo.findByIds(attachedWorkoutIds);
    const attachedWorkoutsMap = new Map<string, AttachedWorkoutDTO>();
    for (const workout of attachedWorkouts) {
      attachedWorkoutsMap.set(workout.id, {
        id: workout.id,
        name: workout.name,
        description: workout.description,
        type: workout.type,
        difficulty: workout.difficulty,
      });
    }

    // Batch fetch attached plans
    const attachedPlanIds = [...new Set(messages.filter((m) => m.attached_plan_id).map((m) => m.attached_plan_id!))];
    const attachedPlans = await this.workoutPlanRepo.findByIds(attachedPlanIds);
    const attachedPlansMap = new Map<string, AttachedPlanDTO>();
    for (const plan of attachedPlans) {
      attachedPlansMap.set(plan.id, {
        id: plan.id,
        name: plan.name,
        description: plan.description,
        durationWeeks: plan.duration_weeks,
        goal: plan.goal,
      });
    }

    return { senderMap, workoutInfoMap, attachedWorkoutsMap, attachedPlansMap };
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

  // ==================== CORRELATION DASHBOARD (Coach viewing) ====================

  /**
   * Get team correlation overview with athletes by alert level and those needing attention
   */
  async getTeamCorrelationOverview(
    req: AuthedRequest,
    query: CorrelationQuery,
  ): Promise<TeamCorrelationOverviewResponse> {
    const organisationId = assertActiveOrg(req);
    const days = query.days ?? 30;

    // Get all active athletes for this coach
    const relationships = await this.relationshipRepo.findMany({
      organisationId,
      coachId: req.user.id,
      status: CoachAthleteStatus.ACTIVE,
    });

    const alertLevelCounts = { ok: 0, watch: 0, action_needed: 0 };
    const athletesNeedingAttention: AthleteCorrelationSummaryDTO[] = [];
    const allRpeTssRatios: number[] = [];
    const allOvertrainingRisks: number[] = [];

    for (const relationship of relationships) {
      const athleteId = relationship.athlete_id;

      // Get athlete info
      const user = await this.userRepo.findById(athleteId);
      if (!user) continue;

      // Build correlation summary for this athlete
      const summary = await this.buildAthleteCorrelationSummary(athleteId, user, days);

      // Count by alert level
      alertLevelCounts[summary.alertLevel]++;

      // Collect ratios and risks for averages (only if data available)
      if (summary.rpeTssRatio != null) {
        allRpeTssRatios.push(summary.rpeTssRatio);
      }
      allOvertrainingRisks.push(summary.overtrainingRiskScore);

      // Add to attention list if watch or action_needed
      if (summary.alertLevel !== 'ok') {
        athletesNeedingAttention.push(summary);
      }
    }

    // Sort athletes needing attention by severity (action_needed first, then watch)
    athletesNeedingAttention.sort((a, b) => {
      const levelOrder = { action_needed: 0, watch: 1, ok: 2 };
      const levelDiff = levelOrder[a.alertLevel] - levelOrder[b.alertLevel];
      if (levelDiff !== 0) return levelDiff;
      // Within same level, sort by overtraining risk descending
      return b.overtrainingRiskScore - a.overtrainingRiskScore;
    });

    // Calculate team averages
    const teamAverageRpeTssRatio =
      allRpeTssRatios.length > 0
        ? Math.round((allRpeTssRatios.reduce((s, r) => s + r, 0) / allRpeTssRatios.length) * 100) / 100
        : null;

    const teamAverageOvertrainingRisk =
      allOvertrainingRisks.length > 0
        ? Math.round(allOvertrainingRisks.reduce((s, r) => s + r, 0) / allOvertrainingRisks.length)
        : 0;

    return {
      data: {
        athletesByAlertLevel: alertLevelCounts,
        athletesNeedingAttention,
        teamAverageRpeTssRatio,
        teamAverageOvertrainingRisk,
      },
    };
  }

  /**
   * Get athlete's RPE-TSS correlation (coach access)
   */
  async getAthleteRpeTssCorrelation(athleteId: string, query: CorrelationQuery): Promise<RpeTssCorrelationResponse> {
    const settings = await this.privacySettingsRepo.findByUserId(athleteId);

    // Requires both training load and wellness check-ins
    if (!settings?.share_training_load || !settings?.share_wellness_checkins) {
      throw new ForbiddenException('Athlete has not shared the required data (training load and wellness check-ins)');
    }

    return this.advancedMetricsService.getRpeTssCorrelationForUser(athleteId, query.days ?? 30);
  }

  /**
   * Get athlete's wellness-performance correlation (coach access)
   */
  async getAthleteWellnessPerformanceCorrelation(
    athleteId: string,
    query: CorrelationQuery,
  ): Promise<WellnessPerformanceCorrelationResponse> {
    const settings = await this.privacySettingsRepo.findByUserId(athleteId);

    // Requires analytics and wellness check-ins
    if (!settings?.share_analytics || !settings?.share_wellness_checkins) {
      throw new ForbiddenException('Athlete has not shared the required data (analytics and wellness check-ins)');
    }

    return this.advancedMetricsService.getWellnessPerformanceCorrelationForUser(athleteId, query.days ?? 30);
  }

  /**
   * Get athlete's correlation summary (compact version for cards)
   */
  async getAthleteCorrelationSummary(
    athleteId: string,
    query: CorrelationQuery,
  ): Promise<AthleteCorrelationSummaryResponse> {
    const days = query.days ?? 30;

    const user = await this.userRepo.findById(athleteId);
    if (!user) {
      throw new NotFoundException('Athlete not found');
    }

    const summary = await this.buildAthleteCorrelationSummary(athleteId, user, days);

    return { data: summary };
  }

  /**
   * Build correlation summary for an athlete (internal helper)
   */
  private async buildAthleteCorrelationSummary(
    athleteId: string,
    user: User,
    days: number,
  ): Promise<AthleteCorrelationSummaryDTO> {
    const settings = await this.privacySettingsRepo.findByUserId(athleteId);

    // Check privacy - need both training load and wellness for correlations
    const hasRequiredPrivacy =
      settings?.share_training_load && settings?.share_wellness_checkins && settings?.share_analytics;

    // Default values for when data is unavailable
    let rpeTssRatio: number | null = null;
    let rpeTssRatioTrend: 'increasing' | 'stable' | 'decreasing' = 'stable';
    let accumulatedFatigueWarning = false;
    let overtrainingRiskScore = 0;
    let primaryRiskFactors: string[] = [];
    let dominantWellnessFactor: 'sleep' | 'stress' | 'soreness' | 'energy' | null = null;
    let currentReadinessScore: number | null = null;
    let readinessTrend: 'improving' | 'stable' | 'declining' = 'stable';
    let insufficientData = true;

    if (hasRequiredPrivacy) {
      try {
        // Get RPE-TSS correlation
        const rpeTssCorrelation = await this.advancedMetricsService.getRpeTssCorrelationForUser(athleteId, days);
        rpeTssRatio = rpeTssCorrelation.data.averageRatio ?? null;
        rpeTssRatioTrend = rpeTssCorrelation.data.ratioTrend;
        accumulatedFatigueWarning = rpeTssCorrelation.data.accumulatedFatigueWarning;

        if (rpeTssCorrelation.data.dataPoints.length >= 3) {
          insufficientData = false;
        }
      } catch {
        // Continue with defaults if RPE-TSS data unavailable
      }

      try {
        // Get wellness-performance correlation
        const wellnessCorrelation = await this.advancedMetricsService.getWellnessPerformanceCorrelationForUser(
          athleteId,
          days,
        );
        overtrainingRiskScore = wellnessCorrelation.data.overtrainingRiskScore;
        primaryRiskFactors = wellnessCorrelation.data.riskFactors;

        // Find dominant wellness factor (highest correlation magnitude)
        if (wellnessCorrelation.data.correlations.length > 0) {
          const sorted = [...wellnessCorrelation.data.correlations].sort(
            (a, b) => Math.abs(b.correlationWithPerformance) - Math.abs(a.correlationWithPerformance),
          );
          dominantWellnessFactor = sorted[0].factor;
          insufficientData = false;
        }
      } catch {
        // Continue with defaults if wellness data unavailable
      }

      try {
        // Get readiness history for trend
        const readinessHistory = await this.advancedMetricsService.getReadinessHistoryForUser(athleteId, days);
        if (readinessHistory.data.data.length > 0) {
          currentReadinessScore = readinessHistory.data.data[0].readinessScore;

          // Calculate trend by comparing first and last week
          if (readinessHistory.data.data.length >= 7) {
            const lastWeek = readinessHistory.data.data.slice(0, 7);
            const firstWeek = readinessHistory.data.data.slice(-7);

            const lastWeekAvg = lastWeek.reduce((s, d) => s + d.readinessScore, 0) / lastWeek.length;
            const firstWeekAvg = firstWeek.reduce((s, d) => s + d.readinessScore, 0) / firstWeek.length;

            const diff = lastWeekAvg - firstWeekAvg;
            if (diff > 5) {
              readinessTrend = 'improving';
            } else if (diff < -5) {
              readinessTrend = 'declining';
            }
          }
          insufficientData = false;
        }
      } catch {
        // Continue with defaults if readiness data unavailable
      }
    }

    // Determine alert level based on the rules:
    // action_needed: overtrainingRisk >= 60 OR rpeTssRatio > 1.4 OR 3+ days declining readiness
    // watch: overtrainingRisk >= 35 OR rpeTssRatio > 1.2 OR declining trend
    // ok: everything else
    let alertLevel: 'ok' | 'watch' | 'action_needed' = 'ok';

    if (
      overtrainingRiskScore >= 60 ||
      (rpeTssRatio !== null && rpeTssRatio > 1.4) ||
      (readinessTrend === 'declining' && overtrainingRiskScore >= 35)
    ) {
      alertLevel = 'action_needed';
    } else if (
      overtrainingRiskScore >= 35 ||
      (rpeTssRatio !== null && rpeTssRatio > 1.2) ||
      readinessTrend === 'declining'
    ) {
      alertLevel = 'watch';
    }

    return {
      athleteId,
      athleteName: user.display_name || user.email,
      alertLevel,
      rpeTssRatio,
      rpeTssRatioTrend,
      accumulatedFatigueWarning,
      overtrainingRiskScore,
      primaryRiskFactors,
      dominantWellnessFactor,
      currentReadinessScore,
      readinessTrend,
      privacyRestricted: !hasRequiredPrivacy,
      insufficientData,
    };
  }
}

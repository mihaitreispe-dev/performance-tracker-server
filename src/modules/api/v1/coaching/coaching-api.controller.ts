import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  Version,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { type Request } from 'express';
import { UserRole } from 'src/database/interfaces';
import { ErrorResponse } from 'src/lib/http/dto/error-response.dto';
import { Roles } from 'src/modules/auth/decorators/roles.decorator';
import { AuthUser } from 'src/modules/auth/types/authenticated-user';

import { DateQuery } from '../advanced-metrics/request.dto';
import {
  DailyReadinessResponse,
  FitnessFatiguePredictionResponse,
  FitnessFatigueResponse,
  MultiStreamLoadHistoryResponse,
  ReadinessHistoryResponse,
  RpeTssCorrelationResponse,
  Vo2MaxHistoryResponse,
  Vo2MaxResponse,
  WellnessPerformanceCorrelationResponse,
} from '../advanced-metrics/response.dto';
import { StrengthProgressionQuery, TrainingLoadHistoryQuery } from '../analytics/request.dto';
import {
  CurrentTrainingLoadResponse,
  RacePredictionsResponse,
  StrengthProgressionResponse,
  TrackedExercisesResponse,
  TrainingLoadHistoryResponse,
} from '../analytics/response.dto';
import { UploadCourseBody } from '../race-calendar/request.dto';
import { AthleteRaceDTO, CourseBasedPredictionDTO, CourseUploadResponseDTO } from '../race-calendar/response.dto';
import { WorkoutPlanWithItemsResponse } from '../workout-plans/response.dto';
import { WorkoutResponse } from '../workouts/response.dto';
import { CoachingApiService } from './coaching-api.service';
import { CoachAthleteRelationshipGuard } from './guards/coach-athlete-relationship.guard';
import {
  AssignedWorkoutIdParam,
  AssignWorkoutBody,
  AthleteIdParam,
  AthleteRaceIdParam,
  ComplianceQuery,
  CorrelationQuery,
  CreateAthleteLabelBody,
  CreateAthleteScheduleBody,
  DeployPlanBody,
  FitnessFatiguePredictionBody,
  FitnessFatigueQuery,
  InvitationIdParam,
  InviteAthleteBody,
  LabelIdParam,
  ListAthleteLabelsQuery,
  ListAthleteSchedulesQuery,
  ListAthletesQuery,
  ListMessagesQuery,
  ScheduleIdParam,
  SendMessageBody,
  SharedPlanIdParam,
  SharedWorkoutIdParam,
  UpdateAthleteIntakeBody,
  UpdateAthleteLabelBody,
  UpdatePrivacySettingsBody,
  WellnessTrendsQuery,
} from './request.dto';
import {
  AssignedWorkoutListResponse,
  AssignedWorkoutResponse,
  AthleteComplianceResponse,
  AthleteCorrelationSummaryResponse,
  AthleteIntakeResponse,
  AthleteLabelResponse,
  AthleteLabelsResponse,
  AthleteListResponse,
  AthleteResponse,
  AthleteScheduleListResponse,
  AthleteScheduleResponse,
  AthleteWellnessTrendsResponse,
  BecomeCoachResponse,
  CoachResponse,
  ComplianceOverviewResponse,
  DeployPlanResponse,
  InvitationListResponse,
  InvitationResponse,
  MessageResponse,
  MessagesListResponse,
  PrivacySettingsResponse,
  TeamCorrelationOverviewResponse,
  TeamWellnessOverviewResponse,
  UnreadCountResponse,
} from './response.dto';

@ApiTags('coaching')
@ApiBearerAuth('JWT')
@Controller('coaching')
export class CoachingApiController {
  constructor(private readonly service: CoachingApiService) {}

  // Become Coach
  @Version('1')
  @ApiOperation({ summary: 'Request coach role' })
  @ApiResponse({ status: HttpStatus.OK, type: BecomeCoachResponse })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @Post('become-coach')
  async becomeCoach(@Req() req: Request & { user: AuthUser }): Promise<BecomeCoachResponse> {
    return this.service.becomeCoach(req);
  }

  // Invitations
  @Version('1')
  @ApiOperation({ summary: 'Invite athlete by email (COACH only)' })
  @ApiResponse({ status: HttpStatus.CREATED, type: InvitationResponse })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, type: ErrorResponse, description: 'Not a coach' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, type: ErrorResponse, description: 'User not found' })
  @Roles(UserRole.COACH)
  @Post('invitations')
  async inviteAthlete(
    @Req() req: Request & { user: AuthUser },
    @Body() body: InviteAthleteBody,
  ): Promise<InvitationResponse> {
    return this.service.inviteAthlete(req, body);
  }

  @Version('1')
  @ApiOperation({ summary: 'Get pending invitations for current user' })
  @ApiResponse({ status: HttpStatus.OK, type: InvitationListResponse })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @Get('invitations/pending')
  async getPendingInvitations(@Req() req: Request & { user: AuthUser }): Promise<InvitationListResponse> {
    return this.service.getPendingInvitations(req);
  }

  @Version('1')
  @ApiOperation({ summary: 'Accept invitation' })
  @ApiResponse({ status: HttpStatus.OK, type: InvitationResponse })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, type: ErrorResponse, description: 'Invitation not found' })
  @Post('invitations/:id/accept')
  async acceptInvitation(
    @Req() req: Request & { user: AuthUser },
    @Param() params: InvitationIdParam,
  ): Promise<InvitationResponse> {
    return this.service.acceptInvitation(req, params.id);
  }

  @Version('1')
  @ApiOperation({ summary: 'Decline invitation' })
  @ApiResponse({ status: HttpStatus.OK, type: InvitationResponse })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, type: ErrorResponse, description: 'Invitation not found' })
  @Post('invitations/:id/decline')
  async declineInvitation(
    @Req() req: Request & { user: AuthUser },
    @Param() params: InvitationIdParam,
  ): Promise<InvitationResponse> {
    return this.service.declineInvitation(req, params.id);
  }

  // Coach's Athletes
  @Version('1')
  @ApiOperation({ summary: "List coach's athletes (COACH only)" })
  @ApiResponse({ status: HttpStatus.OK, type: AthleteListResponse })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, type: ErrorResponse, description: 'Not a coach' })
  @Roles(UserRole.COACH)
  @Get('athletes')
  async getAthletes(
    @Req() req: Request & { user: AuthUser },
    @Query() query: ListAthletesQuery,
  ): Promise<AthleteListResponse> {
    return this.service.getAthletes(req, query);
  }

  @Version('1')
  @ApiOperation({ summary: 'Get athlete detail (COACH only)' })
  @ApiResponse({ status: HttpStatus.OK, type: AthleteResponse })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, type: ErrorResponse, description: 'Not a coach' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, type: ErrorResponse, description: 'Athlete not found' })
  @Roles(UserRole.COACH)
  @Get('athletes/:athleteId')
  async getAthleteById(
    @Req() req: Request & { user: AuthUser },
    @Param() params: AthleteIdParam,
  ): Promise<AthleteResponse> {
    return this.service.getAthleteById(req, params.athleteId);
  }

  @Version('1')
  @ApiOperation({ summary: 'Remove athlete (COACH only)' })
  @ApiResponse({ status: HttpStatus.NO_CONTENT })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, type: ErrorResponse, description: 'Not a coach' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, type: ErrorResponse, description: 'Athlete not found' })
  @Roles(UserRole.COACH)
  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete('athletes/:athleteId')
  async removeAthlete(@Req() req: Request & { user: AuthUser }, @Param() params: AthleteIdParam): Promise<void> {
    return this.service.removeAthlete(req, params.athleteId);
  }

  @Version('1')
  @ApiOperation({ summary: "Get athlete's intake form (COACH only)" })
  @ApiResponse({ status: HttpStatus.OK, type: AthleteIntakeResponse })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, type: ErrorResponse, description: 'Not authorized' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, type: ErrorResponse, description: 'Intake not found' })
  @Roles(UserRole.COACH)
  @UseGuards(CoachAthleteRelationshipGuard)
  @Get('athletes/:athleteId/intake')
  async getAthleteIntake(
    @Req() req: Request & { user: AuthUser },
    @Param() params: AthleteIdParam,
  ): Promise<AthleteIntakeResponse> {
    return this.service.getAthleteIntake(req, params.athleteId, req.user.id);
  }

  // Athlete's Coach
  @Version('1')
  @ApiOperation({ summary: "Get current user's coach" })
  @ApiResponse({ status: HttpStatus.OK, type: CoachResponse })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @Get('my-coach')
  async getMyCoach(@Req() req: Request & { user: AuthUser }): Promise<CoachResponse> {
    return this.service.getMyCoach(req);
  }

  @Version('1')
  @ApiOperation({ summary: 'Leave current coach' })
  @ApiResponse({ status: HttpStatus.NO_CONTENT })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, type: ErrorResponse, description: 'No active coach' })
  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete('my-coach')
  async leaveCoach(@Req() req: Request & { user: AuthUser }): Promise<void> {
    return this.service.leaveCoach(req);
  }

  // Athlete Intake (for athletes)
  @Version('1')
  @ApiOperation({ summary: 'Get own intake form (athlete)' })
  @ApiResponse({ status: HttpStatus.OK, type: AthleteIntakeResponse })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    type: ErrorResponse,
    description: 'No active coach or intake not found',
  })
  @Get('my-coach/intake')
  async getMyIntake(@Req() req: Request & { user: AuthUser }): Promise<AthleteIntakeResponse> {
    return this.service.getMyIntake(req);
  }

  @Version('1')
  @ApiOperation({ summary: 'Update own intake form (athlete)' })
  @ApiResponse({ status: HttpStatus.OK, type: AthleteIntakeResponse })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    type: ErrorResponse,
    description: 'No active coach or intake not found',
  })
  @Patch('my-coach/intake')
  async updateMyIntake(
    @Req() req: Request & { user: AuthUser },
    @Body() body: UpdateAthleteIntakeBody,
  ): Promise<AthleteIntakeResponse> {
    return this.service.updateMyIntake(req, body);
  }

  @Version('1')
  @ApiOperation({ summary: 'Complete/submit intake form (athlete)' })
  @ApiResponse({ status: HttpStatus.OK, type: AthleteIntakeResponse })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    type: ErrorResponse,
    description: 'No active coach or intake not found',
  })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, type: ErrorResponse, description: 'Already completed' })
  @Post('my-coach/intake/complete')
  async completeMyIntake(@Req() req: Request & { user: AuthUser }): Promise<AthleteIntakeResponse> {
    return this.service.completeMyIntake(req);
  }

  // Workout Assignment
  @Version('1')
  @ApiOperation({ summary: 'Assign workout to athlete (COACH only)' })
  @ApiResponse({ status: HttpStatus.CREATED, type: AssignedWorkoutResponse })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, type: ErrorResponse, description: 'Not authorized' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, type: ErrorResponse, description: 'Workout not found' })
  @Roles(UserRole.COACH)
  @UseGuards(CoachAthleteRelationshipGuard)
  @Post('athletes/:athleteId/assign-workout')
  async assignWorkout(
    @Req() req: Request & { user: AuthUser },
    @Param() params: AthleteIdParam,
    @Body() body: AssignWorkoutBody,
  ): Promise<AssignedWorkoutResponse> {
    return this.service.assignWorkout(req, params.athleteId, body);
  }

  @Version('1')
  @ApiOperation({ summary: 'List assigned workouts for athlete (COACH only)' })
  @ApiResponse({ status: HttpStatus.OK, type: AssignedWorkoutListResponse })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, type: ErrorResponse, description: 'Not authorized' })
  @Roles(UserRole.COACH)
  @UseGuards(CoachAthleteRelationshipGuard)
  @Get('athletes/:athleteId/assigned-workouts')
  async getAssignedWorkouts(
    @Req() req: Request & { user: AuthUser },
    @Param() params: AthleteIdParam,
  ): Promise<AssignedWorkoutListResponse> {
    return this.service.getAssignedWorkouts(req, params.athleteId);
  }

  @Version('1')
  @ApiOperation({ summary: 'Remove assigned workout (COACH only)' })
  @ApiResponse({ status: HttpStatus.NO_CONTENT })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, type: ErrorResponse, description: 'Not authorized' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, type: ErrorResponse, description: 'Assignment not found' })
  @Roles(UserRole.COACH)
  @UseGuards(CoachAthleteRelationshipGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete('athletes/:athleteId/assigned-workouts/:id')
  async removeAssignedWorkout(
    @Req() req: Request & { user: AuthUser },
    @Param() params: AssignedWorkoutIdParam,
  ): Promise<void> {
    return this.service.removeAssignedWorkout(req, params.athleteId, params.id);
  }

  // Privacy Settings
  @Version('1')
  @ApiOperation({ summary: "Get current user's privacy settings" })
  @ApiResponse({ status: HttpStatus.OK, type: PrivacySettingsResponse })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @Get('privacy-settings')
  async getPrivacySettings(@Req() req: Request & { user: AuthUser }): Promise<PrivacySettingsResponse> {
    return this.service.getPrivacySettings(req);
  }

  @Version('1')
  @ApiOperation({ summary: "Get athlete's privacy settings (COACH only)" })
  @ApiResponse({ status: HttpStatus.OK, type: PrivacySettingsResponse })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, type: ErrorResponse, description: 'Not authorized' })
  @Roles(UserRole.COACH)
  @UseGuards(CoachAthleteRelationshipGuard)
  @Get('athletes/:athleteId/privacy-settings')
  async getAthletePrivacySettings(
    @Req() req: Request & { user: AuthUser },
    @Param() params: AthleteIdParam,
  ): Promise<PrivacySettingsResponse> {
    return this.service.getAthletePrivacySettings(req, params.athleteId);
  }

  // ==================== ATHLETE RACES (Coach viewing) ====================

  @Version('1')
  @ApiOperation({ summary: "Get athlete's scheduled races (COACH only)" })
  @ApiResponse({ status: HttpStatus.OK, type: [AthleteRaceDTO] })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    type: ErrorResponse,
    description: 'Not authorized or privacy restricted',
  })
  @Roles(UserRole.COACH)
  @UseGuards(CoachAthleteRelationshipGuard)
  @Get('athletes/:athleteId/races')
  async getAthleteRaces(@Param() params: AthleteIdParam): Promise<AthleteRaceDTO[]> {
    return this.service.getAthleteRaces(params.athleteId);
  }

  @Version('1')
  @ApiOperation({ summary: "Get athlete's course-based prediction (COACH only)" })
  @ApiResponse({ status: HttpStatus.OK, type: CourseBasedPredictionDTO })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    type: ErrorResponse,
    description: 'Not authorized or privacy restricted',
  })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, type: ErrorResponse, description: 'No course prediction found' })
  @Roles(UserRole.COACH)
  @UseGuards(CoachAthleteRelationshipGuard)
  @Get('athletes/:athleteId/races/:raceId/course-prediction')
  async getAthleteCoursePrediction(@Param() params: AthleteRaceIdParam): Promise<CourseBasedPredictionDTO> {
    return this.service.getAthleteCoursePrediction(params.athleteId, params.raceId);
  }

  @Version('1')
  @ApiOperation({ summary: "Upload course file for athlete's race (COACH only)" })
  @ApiResponse({ status: HttpStatus.CREATED, type: CourseUploadResponseDTO })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    type: ErrorResponse,
    description: 'Not authorized or privacy restricted',
  })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, type: ErrorResponse, description: 'Race not found' })
  @Roles(UserRole.COACH)
  @UseGuards(CoachAthleteRelationshipGuard)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }))
  @ApiConsumes('multipart/form-data')
  @Post('athletes/:athleteId/races/:raceId/course')
  async uploadAthleteCourseFilee(
    @Param() params: AthleteRaceIdParam,
    @UploadedFile() file: Express.Multer.File,
    @Body() body: UploadCourseBody,
  ): Promise<CourseUploadResponseDTO> {
    return this.service.uploadAthleteCourseFilee(params.athleteId, params.raceId, file, body);
  }

  @Version('1')
  @ApiOperation({ summary: "Delete course file from athlete's race (COACH only)" })
  @ApiResponse({ status: HttpStatus.NO_CONTENT })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    type: ErrorResponse,
    description: 'Not authorized or privacy restricted',
  })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, type: ErrorResponse, description: 'Race or course not found' })
  @Roles(UserRole.COACH)
  @UseGuards(CoachAthleteRelationshipGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete('athletes/:athleteId/races/:raceId/course')
  async deleteAthleteCourseFilee(@Param() params: AthleteRaceIdParam): Promise<void> {
    return this.service.deleteAthleteCourseFilee(params.athleteId, params.raceId);
  }

  // ==================== ATHLETE ANALYTICS (Coach viewing) ====================

  @Version('1')
  @ApiOperation({ summary: "Get athlete's race predictions (COACH only)" })
  @ApiResponse({ status: HttpStatus.OK, type: RacePredictionsResponse })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    type: ErrorResponse,
    description: 'Not authorized or privacy restricted',
  })
  @Roles(UserRole.COACH)
  @UseGuards(CoachAthleteRelationshipGuard)
  @Get('athletes/:athleteId/analytics/race-predictions')
  async getAthleteRacePredictions(@Param() params: AthleteIdParam): Promise<RacePredictionsResponse> {
    return this.service.getAthleteRacePredictions(params.athleteId);
  }

  @Version('1')
  @ApiOperation({ summary: "Get athlete's tracked exercises (COACH only)" })
  @ApiResponse({ status: HttpStatus.OK, type: TrackedExercisesResponse })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    type: ErrorResponse,
    description: 'Not authorized or privacy restricted',
  })
  @Roles(UserRole.COACH)
  @UseGuards(CoachAthleteRelationshipGuard)
  @Get('athletes/:athleteId/analytics/strength/exercises')
  async getAthleteTrackedExercises(@Param() params: AthleteIdParam): Promise<TrackedExercisesResponse> {
    return this.service.getAthleteTrackedExercises(params.athleteId);
  }

  @Version('1')
  @ApiOperation({ summary: "Get athlete's strength progression for an exercise (COACH only)" })
  @ApiResponse({ status: HttpStatus.OK, type: StrengthProgressionResponse })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    type: ErrorResponse,
    description: 'Not authorized or privacy restricted',
  })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, type: ErrorResponse, description: 'Exercise not found' })
  @Roles(UserRole.COACH)
  @UseGuards(CoachAthleteRelationshipGuard)
  @Get('athletes/:athleteId/analytics/strength/:exerciseId')
  async getAthleteStrengthProgression(
    @Param('athleteId') athleteId: string,
    @Param('exerciseId') exerciseId: string,
    @Query() query: StrengthProgressionQuery,
  ): Promise<StrengthProgressionResponse> {
    return this.service.getAthleteStrengthProgression(athleteId, exerciseId, query);
  }

  @Version('1')
  @ApiOperation({ summary: "Get athlete's current training load (COACH only)" })
  @ApiResponse({ status: HttpStatus.OK, type: CurrentTrainingLoadResponse })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    type: ErrorResponse,
    description: 'Not authorized or privacy restricted',
  })
  @Roles(UserRole.COACH)
  @UseGuards(CoachAthleteRelationshipGuard)
  @Get('athletes/:athleteId/analytics/training-load')
  async getAthleteTrainingLoad(@Param() params: AthleteIdParam): Promise<CurrentTrainingLoadResponse> {
    return this.service.getAthleteTrainingLoad(params.athleteId);
  }

  @Version('1')
  @ApiOperation({ summary: "Get athlete's training load history (COACH only)" })
  @ApiResponse({ status: HttpStatus.OK, type: TrainingLoadHistoryResponse })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    type: ErrorResponse,
    description: 'Not authorized or privacy restricted',
  })
  @Roles(UserRole.COACH)
  @UseGuards(CoachAthleteRelationshipGuard)
  @Get('athletes/:athleteId/analytics/training-load/history')
  async getAthleteTrainingLoadHistory(
    @Param() params: AthleteIdParam,
    @Query() query: TrainingLoadHistoryQuery,
  ): Promise<TrainingLoadHistoryResponse> {
    return this.service.getAthleteTrainingLoadHistory(params.athleteId, query);
  }

  // ==================== ATHLETE FITNESS-FATIGUE / PMC (Coach viewing) ====================

  @Version('1')
  @ApiOperation({ summary: "Get athlete's fitness-fatigue (PMC) chart data (COACH only)" })
  @ApiResponse({ status: HttpStatus.OK, type: FitnessFatigueResponse })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    type: ErrorResponse,
    description: 'Not authorized or privacy restricted',
  })
  @Roles(UserRole.COACH)
  @UseGuards(CoachAthleteRelationshipGuard)
  @Get('athletes/:athleteId/fitness-fatigue')
  async getAthleteFitnessFatigue(
    @Param() params: AthleteIdParam,
    @Query() query: FitnessFatigueQuery,
  ): Promise<FitnessFatigueResponse> {
    return this.service.getAthleteFitnessFatigue(params.athleteId, query);
  }

  @Version('1')
  @ApiOperation({ summary: "Predict athlete's future fitness-fatigue based on planned training (COACH only)" })
  @ApiResponse({ status: HttpStatus.OK, type: FitnessFatiguePredictionResponse })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    type: ErrorResponse,
    description: 'Not authorized or privacy restricted',
  })
  @Roles(UserRole.COACH)
  @UseGuards(CoachAthleteRelationshipGuard)
  @Post('athletes/:athleteId/fitness-fatigue/predict')
  async predictAthleteFitnessFatigue(
    @Param() params: AthleteIdParam,
    @Body() body: FitnessFatiguePredictionBody,
  ): Promise<FitnessFatiguePredictionResponse> {
    return this.service.predictAthleteFitnessFatigue(params.athleteId, body);
  }

  @Version('1')
  @ApiOperation({ summary: "Get athlete's current VO2 max (COACH only)" })
  @ApiResponse({ status: HttpStatus.OK, type: Vo2MaxResponse })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    type: ErrorResponse,
    description: 'Not authorized or privacy restricted',
  })
  @Roles(UserRole.COACH)
  @UseGuards(CoachAthleteRelationshipGuard)
  @Get('athletes/:athleteId/vo2max')
  async getAthleteVo2Max(@Param() params: AthleteIdParam): Promise<Vo2MaxResponse> {
    return this.service.getAthleteVo2Max(params.athleteId);
  }

  @Version('1')
  @ApiOperation({ summary: "Get athlete's VO2 max history (COACH only)" })
  @ApiResponse({ status: HttpStatus.OK, type: Vo2MaxHistoryResponse })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    type: ErrorResponse,
    description: 'Not authorized or privacy restricted',
  })
  @Roles(UserRole.COACH)
  @UseGuards(CoachAthleteRelationshipGuard)
  @Get('athletes/:athleteId/vo2max/history')
  async getAthleteVo2MaxHistory(
    @Param() params: AthleteIdParam,
    @Query() query: FitnessFatigueQuery,
  ): Promise<Vo2MaxHistoryResponse> {
    return this.service.getAthleteVo2MaxHistory(params.athleteId, query);
  }

  // ==================== ATHLETE MULTI-STREAM LOAD (Coach viewing) ====================

  @Version('1')
  @ApiOperation({ summary: "Get athlete's multi-stream load history (COACH only)" })
  @ApiResponse({ status: HttpStatus.OK, type: MultiStreamLoadHistoryResponse })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    type: ErrorResponse,
    description: 'Not authorized or privacy restricted',
  })
  @Roles(UserRole.COACH)
  @UseGuards(CoachAthleteRelationshipGuard)
  @Get('athletes/:athleteId/multi-stream-load/history')
  async getAthleteMultiStreamLoadHistory(
    @Param() params: AthleteIdParam,
    @Query() query: FitnessFatigueQuery,
  ): Promise<MultiStreamLoadHistoryResponse> {
    return this.service.getAthleteMultiStreamLoadHistory(params.athleteId, query);
  }

  // ==================== ATHLETE READINESS (Coach viewing) ====================

  @Version('1')
  @ApiOperation({ summary: "Get athlete's daily readiness (COACH only)" })
  @ApiResponse({ status: HttpStatus.OK, type: DailyReadinessResponse })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    type: ErrorResponse,
    description: 'Not authorized or privacy restricted',
  })
  @Roles(UserRole.COACH)
  @UseGuards(CoachAthleteRelationshipGuard)
  @Get('athletes/:athleteId/readiness')
  async getAthleteReadiness(
    @Param() params: AthleteIdParam,
    @Query() query: DateQuery,
  ): Promise<DailyReadinessResponse> {
    return this.service.getAthleteReadiness(params.athleteId, query.date);
  }

  @Version('1')
  @ApiOperation({ summary: "Get athlete's readiness history (COACH only)" })
  @ApiResponse({ status: HttpStatus.OK, type: ReadinessHistoryResponse })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    type: ErrorResponse,
    description: 'Not authorized or privacy restricted',
  })
  @Roles(UserRole.COACH)
  @UseGuards(CoachAthleteRelationshipGuard)
  @Get('athletes/:athleteId/readiness/history')
  async getAthleteReadinessHistory(
    @Param() params: AthleteIdParam,
    @Query() query: FitnessFatigueQuery,
  ): Promise<ReadinessHistoryResponse> {
    return this.service.getAthleteReadinessHistory(params.athleteId, query);
  }

  @Version('1')
  @ApiOperation({ summary: 'Update privacy settings' })
  @ApiResponse({ status: HttpStatus.OK, type: PrivacySettingsResponse })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @Patch('privacy-settings')
  async updatePrivacySettings(
    @Req() req: Request & { user: AuthUser },
    @Body() body: UpdatePrivacySettingsBody,
  ): Promise<PrivacySettingsResponse> {
    return this.service.updatePrivacySettings(req, body);
  }

  // Athlete Schedules (Calendar view for coaches)
  @Version('1')
  @ApiOperation({ summary: "Get athlete's workout schedules (COACH only, requires calendar privacy)" })
  @ApiResponse({ status: HttpStatus.OK, type: AthleteScheduleListResponse })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    type: ErrorResponse,
    description: 'Not authorized or privacy restricted',
  })
  @Roles(UserRole.COACH)
  @UseGuards(CoachAthleteRelationshipGuard)
  @Get('athletes/:athleteId/schedules')
  async getAthleteSchedules(
    @Req() req: Request & { user: AuthUser },
    @Param() params: AthleteIdParam,
    @Query() query: ListAthleteSchedulesQuery,
  ): Promise<AthleteScheduleListResponse> {
    return this.service.getAthleteSchedules(req, params.athleteId, query);
  }

  @Version('1')
  @ApiOperation({ summary: 'Schedule a workout for athlete (COACH only)' })
  @ApiResponse({ status: HttpStatus.CREATED, type: AthleteScheduleResponse })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, type: ErrorResponse, description: 'Not authorized' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, type: ErrorResponse, description: 'Workout not found' })
  @Roles(UserRole.COACH)
  @UseGuards(CoachAthleteRelationshipGuard)
  @Post('athletes/:athleteId/schedules')
  async createAthleteSchedule(
    @Req() req: Request & { user: AuthUser },
    @Param() params: AthleteIdParam,
    @Body() body: CreateAthleteScheduleBody,
  ): Promise<AthleteScheduleResponse> {
    return this.service.createAthleteSchedule(req, params.athleteId, body);
  }

  @Version('1')
  @ApiOperation({ summary: 'Delete a scheduled workout for athlete (COACH only)' })
  @ApiResponse({ status: HttpStatus.NO_CONTENT })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, type: ErrorResponse, description: 'Not authorized' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, type: ErrorResponse, description: 'Schedule not found' })
  @Roles(UserRole.COACH)
  @UseGuards(CoachAthleteRelationshipGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete('athletes/:athleteId/schedules/:scheduleId')
  async deleteAthleteSchedule(
    @Req() req: Request & { user: AuthUser },
    @Param() params: ScheduleIdParam,
  ): Promise<void> {
    return this.service.deleteAthleteSchedule(req, params.athleteId, params.scheduleId);
  }

  // Compliance
  @Version('1')
  @ApiOperation({ summary: 'Get compliance overview for all athletes (COACH only)' })
  @ApiResponse({ status: HttpStatus.OK, type: ComplianceOverviewResponse })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, type: ErrorResponse, description: 'Not a coach' })
  @Roles(UserRole.COACH)
  @Get('compliance')
  async getComplianceOverview(
    @Req() req: Request & { user: AuthUser },
    @Query() query: ComplianceQuery,
  ): Promise<ComplianceOverviewResponse> {
    return this.service.getComplianceOverview(req, query);
  }

  @Version('1')
  @ApiOperation({ summary: 'Get compliance for specific athlete (COACH only)' })
  @ApiResponse({ status: HttpStatus.OK, type: AthleteComplianceResponse })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, type: ErrorResponse, description: 'Not authorized' })
  @Roles(UserRole.COACH)
  @UseGuards(CoachAthleteRelationshipGuard)
  @Get('athletes/:athleteId/compliance')
  async getAthleteCompliance(
    @Req() req: Request & { user: AuthUser },
    @Param() params: AthleteIdParam,
    @Query() query: ComplianceQuery,
  ): Promise<AthleteComplianceResponse> {
    return this.service.getAthleteCompliance(req, params.athleteId, query);
  }

  // ===== WELLNESS DASHBOARD =====

  @Version('1')
  @ApiOperation({ summary: 'Get team wellness overview (COACH only)' })
  @ApiResponse({ status: HttpStatus.OK, type: TeamWellnessOverviewResponse })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, type: ErrorResponse, description: 'Not a coach' })
  @Roles(UserRole.COACH)
  @Get('wellness/overview')
  async getTeamWellnessOverview(@Req() req: Request & { user: AuthUser }): Promise<TeamWellnessOverviewResponse> {
    return this.service.getTeamWellnessOverview(req);
  }

  @Version('1')
  @ApiOperation({ summary: "Get athlete's wellness trends (COACH only)" })
  @ApiResponse({ status: HttpStatus.OK, type: AthleteWellnessTrendsResponse })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    type: ErrorResponse,
    description: 'Not authorized or privacy restricted',
  })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, type: ErrorResponse, description: 'Athlete not found' })
  @Roles(UserRole.COACH)
  @UseGuards(CoachAthleteRelationshipGuard)
  @Get('athletes/:athleteId/wellness/trends')
  async getAthleteWellnessTrends(
    @Req() req: Request & { user: AuthUser },
    @Param() params: AthleteIdParam,
    @Query() query: WellnessTrendsQuery,
  ): Promise<AthleteWellnessTrendsResponse> {
    return this.service.getAthleteWellnessTrends(req, params.athleteId, query);
  }

  // ===== CORRELATION DASHBOARD =====

  @Version('1')
  @ApiOperation({
    summary: 'Get team correlation overview with alert levels and athletes needing attention (COACH only)',
  })
  @ApiResponse({ status: HttpStatus.OK, type: TeamCorrelationOverviewResponse })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, type: ErrorResponse, description: 'Not a coach' })
  @Roles(UserRole.COACH)
  @Get('correlation/overview')
  async getTeamCorrelationOverview(
    @Req() req: Request & { user: AuthUser },
    @Query() query: CorrelationQuery,
  ): Promise<TeamCorrelationOverviewResponse> {
    return this.service.getTeamCorrelationOverview(req, query);
  }

  @Version('1')
  @ApiOperation({ summary: "Get athlete's RPE-TSS correlation (COACH only)" })
  @ApiResponse({ status: HttpStatus.OK, type: RpeTssCorrelationResponse })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    type: ErrorResponse,
    description: 'Not authorized or athlete has not shared required data',
  })
  @Roles(UserRole.COACH)
  @UseGuards(CoachAthleteRelationshipGuard)
  @Get('athletes/:athleteId/correlation/rpe-tss')
  async getAthleteRpeTssCorrelation(
    @Param() params: AthleteIdParam,
    @Query() query: CorrelationQuery,
  ): Promise<RpeTssCorrelationResponse> {
    return this.service.getAthleteRpeTssCorrelation(params.athleteId, query);
  }

  @Version('1')
  @ApiOperation({ summary: "Get athlete's wellness-performance correlation (COACH only)" })
  @ApiResponse({ status: HttpStatus.OK, type: WellnessPerformanceCorrelationResponse })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    type: ErrorResponse,
    description: 'Not authorized or athlete has not shared required data',
  })
  @Roles(UserRole.COACH)
  @UseGuards(CoachAthleteRelationshipGuard)
  @Get('athletes/:athleteId/correlation/wellness-performance')
  async getAthleteWellnessPerformanceCorrelation(
    @Param() params: AthleteIdParam,
    @Query() query: CorrelationQuery,
  ): Promise<WellnessPerformanceCorrelationResponse> {
    return this.service.getAthleteWellnessPerformanceCorrelation(params.athleteId, query);
  }

  @Version('1')
  @ApiOperation({ summary: "Get athlete's correlation summary (compact version for cards) (COACH only)" })
  @ApiResponse({ status: HttpStatus.OK, type: AthleteCorrelationSummaryResponse })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, type: ErrorResponse, description: 'Not authorized' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, type: ErrorResponse, description: 'Athlete not found' })
  @Roles(UserRole.COACH)
  @UseGuards(CoachAthleteRelationshipGuard)
  @Get('athletes/:athleteId/correlation/summary')
  async getAthleteCorrelationSummary(
    @Param() params: AthleteIdParam,
    @Query() query: CorrelationQuery,
  ): Promise<AthleteCorrelationSummaryResponse> {
    return this.service.getAthleteCorrelationSummary(params.athleteId, query);
  }

  // ===== ATHLETE LABELS =====

  @Version('1')
  @ApiOperation({ summary: "Get athlete's labels (COACH only)" })
  @ApiResponse({ status: HttpStatus.OK, type: AthleteLabelsResponse })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, type: ErrorResponse, description: 'Not authorized' })
  @Roles(UserRole.COACH)
  @UseGuards(CoachAthleteRelationshipGuard)
  @Get('athletes/:athleteId/labels')
  async getAthleteLabels(
    @Req() req: Request & { user: AuthUser },
    @Param() params: AthleteIdParam,
    @Query() query: ListAthleteLabelsQuery,
  ): Promise<AthleteLabelsResponse> {
    return this.service.getAthleteLabels(params.athleteId, query, req);
  }

  @Version('1')
  @ApiOperation({ summary: 'Create a label for athlete (COACH only)' })
  @ApiResponse({ status: HttpStatus.CREATED, type: AthleteLabelResponse })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, type: ErrorResponse, description: 'Not authorized' })
  @Roles(UserRole.COACH)
  @UseGuards(CoachAthleteRelationshipGuard)
  @Post('athletes/:athleteId/labels')
  async createAthleteLabel(
    @Req() req: Request & { user: AuthUser },
    @Param() params: AthleteIdParam,
    @Body() body: CreateAthleteLabelBody,
  ): Promise<AthleteLabelResponse> {
    return this.service.createAthleteLabel(params.athleteId, body, req);
  }

  @Version('1')
  @ApiOperation({ summary: 'Update a label for athlete (COACH only)' })
  @ApiResponse({ status: HttpStatus.OK, type: AthleteLabelResponse })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, type: ErrorResponse, description: 'Not authorized' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, type: ErrorResponse, description: 'Label not found' })
  @Roles(UserRole.COACH)
  @UseGuards(CoachAthleteRelationshipGuard)
  @Patch('athletes/:athleteId/labels/:labelId')
  async updateAthleteLabel(
    @Req() req: Request & { user: AuthUser },
    @Param() params: LabelIdParam,
    @Body() body: UpdateAthleteLabelBody,
  ): Promise<AthleteLabelResponse> {
    return this.service.updateAthleteLabel(params.athleteId, params.labelId, body, req);
  }

  @Version('1')
  @ApiOperation({ summary: 'Delete a label for athlete (COACH only)' })
  @ApiResponse({ status: HttpStatus.NO_CONTENT })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, type: ErrorResponse, description: 'Not authorized' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, type: ErrorResponse, description: 'Label not found' })
  @Roles(UserRole.COACH)
  @UseGuards(CoachAthleteRelationshipGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete('athletes/:athleteId/labels/:labelId')
  async deleteAthleteLabel(@Req() req: Request & { user: AuthUser }, @Param() params: LabelIdParam): Promise<void> {
    return this.service.deleteAthleteLabel(params.athleteId, params.labelId, req);
  }

  // Deploy Workout Plan to Athlete
  @Version('1')
  @ApiOperation({ summary: "Deploy a workout plan to an athlete's calendar" })
  @ApiResponse({ status: HttpStatus.CREATED, type: DeployPlanResponse })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    type: ErrorResponse,
    description: 'Not authorized or athlete has not shared calendar',
  })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, type: ErrorResponse, description: 'Plan not found' })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, type: ErrorResponse, description: 'Plan is empty' })
  @Roles(UserRole.COACH)
  @UseGuards(CoachAthleteRelationshipGuard)
  @Post('athletes/:athleteId/deploy-plan')
  async deployPlan(
    @Req() req: Request & { user: AuthUser },
    @Param() params: AthleteIdParam,
    @Body() body: DeployPlanBody,
  ): Promise<DeployPlanResponse> {
    return this.service.deployPlan(params.athleteId, body, req);
  }

  @Version('1')
  @ApiOperation({ summary: "Get current user's labels from coach" })
  @ApiResponse({ status: HttpStatus.OK, type: AthleteLabelsResponse })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @Get('my-labels')
  async getMyLabels(
    @Req() req: Request & { user: AuthUser },
    @Query() query: ListAthleteLabelsQuery,
  ): Promise<AthleteLabelsResponse> {
    return this.service.getMyLabels(query, req);
  }

  // ==================== MESSAGING ====================

  @Version('1')
  @ApiOperation({ summary: 'Send a message to athlete or coach' })
  @ApiResponse({ status: HttpStatus.CREATED, type: MessageResponse })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, type: ErrorResponse, description: 'No active relationship' })
  @UseGuards(CoachAthleteRelationshipGuard)
  @Post('athletes/:athleteId/messages')
  async sendMessage(
    @Req() req: Request & { user: AuthUser },
    @Param() params: AthleteIdParam,
    @Body() body: SendMessageBody,
  ): Promise<MessageResponse> {
    return this.service.sendMessage(req, params.athleteId, body);
  }

  @Version('1')
  @ApiOperation({ summary: 'List messages in conversation with athlete' })
  @ApiResponse({ status: HttpStatus.OK, type: MessagesListResponse })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, type: ErrorResponse, description: 'No active relationship' })
  @UseGuards(CoachAthleteRelationshipGuard)
  @Get('athletes/:athleteId/messages')
  async listMessages(
    @Req() req: Request & { user: AuthUser },
    @Param() params: AthleteIdParam,
    @Query() query: ListMessagesQuery,
  ): Promise<MessagesListResponse> {
    return this.service.listMessages(req, params.athleteId, query);
  }

  @Version('1')
  @ApiOperation({ summary: 'Get workout notes for a specific workout schedule' })
  @ApiResponse({ status: HttpStatus.OK, type: MessagesListResponse })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, type: ErrorResponse, description: 'No active relationship' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, type: ErrorResponse, description: 'Workout schedule not found' })
  @UseGuards(CoachAthleteRelationshipGuard)
  @Get('athletes/:athleteId/schedules/:scheduleId/notes')
  async getWorkoutNotes(
    @Req() req: Request & { user: AuthUser },
    @Param() params: ScheduleIdParam,
  ): Promise<MessagesListResponse> {
    return this.service.getWorkoutNotes(req, params.athleteId, params.scheduleId);
  }

  @Version('1')
  @ApiOperation({ summary: 'Get unread message count for conversation' })
  @ApiResponse({ status: HttpStatus.OK, type: UnreadCountResponse })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, type: ErrorResponse, description: 'No active relationship' })
  @UseGuards(CoachAthleteRelationshipGuard)
  @Get('athletes/:athleteId/messages/unread-count')
  async getUnreadMessageCount(
    @Req() req: Request & { user: AuthUser },
    @Param() params: AthleteIdParam,
  ): Promise<UnreadCountResponse> {
    return this.service.getUnreadMessageCount(req, params.athleteId);
  }

  // ==================== ATHLETE MESSAGING TO COACH ====================

  @Version('1')
  @ApiOperation({ summary: 'Send a message to my coach (athlete)' })
  @ApiResponse({ status: HttpStatus.CREATED, type: MessageResponse })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, type: ErrorResponse, description: 'No coach found' })
  @Post('my-coach/messages')
  async sendMessageToCoach(
    @Req() req: Request & { user: AuthUser },
    @Body() body: SendMessageBody,
  ): Promise<MessageResponse> {
    return this.service.sendMessageToCoach(req, body);
  }

  @Version('1')
  @ApiOperation({ summary: 'List messages with my coach (athlete)' })
  @ApiResponse({ status: HttpStatus.OK, type: MessagesListResponse })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, type: ErrorResponse, description: 'No coach found' })
  @Get('my-coach/messages')
  async listMessagesWithCoach(
    @Req() req: Request & { user: AuthUser },
    @Query() query: ListMessagesQuery,
  ): Promise<MessagesListResponse> {
    return this.service.listMessagesWithCoach(req, query);
  }

  @Version('1')
  @ApiOperation({ summary: 'Get unread message count from coach' })
  @ApiResponse({ status: HttpStatus.OK, type: UnreadCountResponse })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, type: ErrorResponse, description: 'No coach found' })
  @Get('my-coach/messages/unread-count')
  async getUnreadMessageCountFromCoach(@Req() req: Request & { user: AuthUser }): Promise<UnreadCountResponse> {
    return this.service.getUnreadMessageCountFromCoach(req);
  }

  // ==================== SHARED RESOURCE ACCESS ====================

  @Version('1')
  @ApiOperation({ summary: 'Get a workout shared by coach in messages' })
  @ApiResponse({ status: HttpStatus.OK, type: WorkoutResponse })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    type: ErrorResponse,
    description: 'Workout not found or not shared with you',
  })
  @Get('my-coach/shared-workout/:workoutId')
  async getSharedWorkout(
    @Req() req: Request & { user: AuthUser },
    @Param() params: SharedWorkoutIdParam,
  ): Promise<WorkoutResponse> {
    return this.service.getSharedWorkout(req, params.workoutId);
  }

  @Version('1')
  @ApiOperation({ summary: 'Get a workout plan shared by coach in messages' })
  @ApiResponse({ status: HttpStatus.OK, type: WorkoutPlanWithItemsResponse })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    type: ErrorResponse,
    description: 'Plan not found or not shared with you',
  })
  @Get('my-coach/shared-plan/:planId')
  async getSharedPlan(
    @Req() req: Request & { user: AuthUser },
    @Param() params: SharedPlanIdParam,
  ): Promise<WorkoutPlanWithItemsResponse> {
    return this.service.getSharedPlan(req, params.planId);
  }

  @Version('1')
  @ApiOperation({ summary: 'Copy a shared workout to my library' })
  @ApiResponse({ status: HttpStatus.CREATED, type: WorkoutResponse })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    type: ErrorResponse,
    description: 'Workout not found or not shared with you',
  })
  @Post('my-coach/shared-workout/:workoutId/copy')
  async copySharedWorkoutToLibrary(
    @Req() req: Request & { user: AuthUser },
    @Param() params: SharedWorkoutIdParam,
  ): Promise<WorkoutResponse> {
    return this.service.copySharedWorkoutToLibrary(req, params.workoutId);
  }

  @Version('1')
  @ApiOperation({ summary: 'Copy a shared plan to my library' })
  @ApiResponse({ status: HttpStatus.CREATED, type: WorkoutPlanWithItemsResponse })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    type: ErrorResponse,
    description: 'Plan not found or not shared with you',
  })
  @Post('my-coach/shared-plan/:planId/copy')
  async copySharedPlanToLibrary(
    @Req() req: Request & { user: AuthUser },
    @Param() params: SharedPlanIdParam,
  ): Promise<WorkoutPlanWithItemsResponse> {
    return this.service.copySharedPlanToLibrary(req, params.planId);
  }
}

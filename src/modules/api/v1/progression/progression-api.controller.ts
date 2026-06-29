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
  Version,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

import { ErrorResponse } from 'src/lib/http/dto/error-response.dto';
import type { AuthedRequest } from 'src/modules/auth/types/request-with-active-org';

import { ProgressionApiService } from './progression-api.service';
import { CreateGoalBody, GoalIdParam, RecapQuery, UpdateAvatarBody, UpdateGoalBody } from './request.dto';
import {
  GoalListResponse,
  GoalResponse,
  JourneySummaryResponse,
  LeaderboardResponse,
  QuestListResponse,
  RecapResponse,
  SeasonResponse,
} from './response.dto';

@ApiTags('progression')
@ApiBearerAuth('JWT')
@Controller('progression')
export class ProgressionApiController {
  constructor(private readonly service: ProgressionApiService) {}

  @Version('1')
  @ApiOperation({ summary: "The user's Journey summary — XP/level, streak, goals." })
  @ApiResponse({ status: HttpStatus.OK, type: JourneySummaryResponse })
  @Get('journey')
  async journey(@Req() req: AuthedRequest): Promise<JourneySummaryResponse> {
    return this.service.getJourney(req);
  }

  @Version('1')
  @ApiOperation({ summary: "List the user's goals (active + completed)." })
  @ApiResponse({ status: HttpStatus.OK, type: GoalListResponse })
  @Get('goals')
  async listGoals(@Req() req: AuthedRequest): Promise<GoalListResponse> {
    return this.service.listGoals(req);
  }

  @Version('1')
  @ApiOperation({ summary: "The user's active quests (coach-assigned) + progress." })
  @ApiResponse({ status: HttpStatus.OK, type: QuestListResponse })
  @Get('quests')
  async quests(@Req() req: AuthedRequest): Promise<QuestListResponse> {
    return this.service.listMyQuests(req);
  }

  @Version('1')
  @ApiOperation({ summary: 'Activity recap aggregated over a rolling window (week|month).' })
  @ApiResponse({ status: HttpStatus.OK, type: RecapResponse })
  @Get('recap')
  async recap(@Req() req: AuthedRequest, @Query() query: RecapQuery): Promise<RecapResponse> {
    return this.service.getRecap(req, query);
  }

  @Version('1')
  @ApiOperation({ summary: "The active season + the user's points and reward ladder (null if none)." })
  @ApiResponse({ status: HttpStatus.OK, type: SeasonResponse })
  @Get('season')
  async season(@Req() req: AuthedRequest): Promise<SeasonResponse> {
    return this.service.getSeason(req);
  }

  @Version('1')
  @ApiOperation({ summary: 'Cohort (coach-group) leaderboard, effort-based, reciprocal opt-in.' })
  @ApiResponse({ status: HttpStatus.OK, type: LeaderboardResponse })
  @Get('leaderboard')
  async leaderboard(@Req() req: AuthedRequest): Promise<LeaderboardResponse> {
    return this.service.getLeaderboard(req);
  }

  @Version('1')
  @ApiOperation({ summary: 'Equip avatar cosmetics (each must be unlocked at the user\'s level).' })
  @ApiResponse({ status: HttpStatus.OK, type: JourneySummaryResponse })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, type: ErrorResponse })
  @Patch('avatar')
  async updateAvatar(@Req() req: AuthedRequest, @Body() body: UpdateAvatarBody): Promise<JourneySummaryResponse> {
    return this.service.updateAvatar(req, body);
  }

  @Version('1')
  @ApiOperation({ summary: 'Create a self-selected goal.' })
  @ApiResponse({ status: HttpStatus.CREATED, type: GoalResponse })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, type: ErrorResponse })
  @Post('goals')
  async createGoal(@Req() req: AuthedRequest, @Body() body: CreateGoalBody): Promise<GoalResponse> {
    return this.service.createGoal(req, body);
  }

  @Version('1')
  @ApiOperation({ summary: 'Update a goal (target/title/status; current_value only for custom).' })
  @ApiResponse({ status: HttpStatus.OK, type: GoalResponse })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, type: ErrorResponse })
  @Patch('goals/:id')
  async updateGoal(
    @Req() req: AuthedRequest,
    @Param() params: GoalIdParam,
    @Body() body: UpdateGoalBody,
  ): Promise<GoalResponse> {
    return this.service.updateGoal(req, params.id, body);
  }

  @Version('1')
  @ApiOperation({ summary: 'Archive a goal.' })
  @ApiResponse({ status: HttpStatus.NO_CONTENT })
  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete('goals/:id')
  async deleteGoal(@Req() req: AuthedRequest, @Param() params: GoalIdParam): Promise<void> {
    return this.service.deleteGoal(req, params.id);
  }
}

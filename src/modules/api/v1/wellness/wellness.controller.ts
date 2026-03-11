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
import { type Request } from 'express';
import { ErrorResponse } from 'src/lib/http/dto/error-response.dto';
import { AuthUser } from 'src/modules/auth/types/authenticated-user';

import {
  CreateQuickWellnessCheckinBody,
  IllnessLogBody,
  IllnessLogIdParam,
  ListIllnessLogsQuery,
  UpdateIllnessLogBody,
  UpdateQuickWellnessCheckinBody,
  WellnessCheckinDateParam,
  WellnessCheckinHistoryQuery,
  WellnessCheckinIdParam,
} from './request.dto';
import {
  IllnessLogListResponse,
  IllnessLogResponse,
  QuickWellnessCheckinListResponse,
  QuickWellnessCheckinResponse,
  WellnessAveragesResponse,
  WellnessTrendResponse,
} from './response.dto';
import { WellnessService } from './wellness.service';

@ApiTags('wellness')
@ApiBearerAuth('JWT')
@Controller('wellness')
export class WellnessController {
  constructor(private readonly service: WellnessService) {}

  // Quick Check-ins

  @Version('1')
  @ApiOperation({ summary: 'Create or update a quick wellness check-in' })
  @ApiResponse({ status: HttpStatus.CREATED, type: QuickWellnessCheckinResponse })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @Post('quick-checkins')
  async createCheckin(
    @Req() req: Request & { user: AuthUser },
    @Body() body: CreateQuickWellnessCheckinBody,
  ): Promise<QuickWellnessCheckinResponse> {
    return this.service.createCheckin(req, body);
  }

  @Version('1')
  @ApiOperation({ summary: "Get today's check-in" })
  @ApiResponse({ status: HttpStatus.OK, type: QuickWellnessCheckinResponse })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, type: ErrorResponse, description: 'No check-in for today' })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @Get('quick-checkins/today')
  async getToday(@Req() req: Request & { user: AuthUser }): Promise<QuickWellnessCheckinResponse> {
    return this.service.getToday(req);
  }

  @Version('1')
  @ApiOperation({ summary: 'Get check-in history' })
  @ApiResponse({ status: HttpStatus.OK, type: QuickWellnessCheckinListResponse })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @Get('quick-checkins/history')
  async getHistory(
    @Req() req: Request & { user: AuthUser },
    @Query() query: WellnessCheckinHistoryQuery,
  ): Promise<QuickWellnessCheckinListResponse> {
    return this.service.getHistory(req, query);
  }

  @Version('1')
  @ApiOperation({ summary: 'Get average wellness scores' })
  @ApiResponse({ status: HttpStatus.OK, type: WellnessAveragesResponse })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @Get('quick-checkins/averages')
  async getAverages(
    @Req() req: Request & { user: AuthUser },
    @Query() query: WellnessCheckinHistoryQuery,
  ): Promise<WellnessAveragesResponse> {
    return this.service.getAverages(req, query);
  }

  @Version('1')
  @ApiOperation({ summary: 'Get wellness trend' })
  @ApiResponse({ status: HttpStatus.OK, type: WellnessTrendResponse })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @Get('quick-checkins/trend')
  async getTrend(
    @Req() req: Request & { user: AuthUser },
    @Query() query: WellnessCheckinHistoryQuery,
  ): Promise<WellnessTrendResponse> {
    return this.service.getTrend(req, query);
  }

  @Version('1')
  @ApiOperation({ summary: 'Get check-in by date' })
  @ApiResponse({ status: HttpStatus.OK, type: QuickWellnessCheckinResponse })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, type: ErrorResponse, description: 'No check-in for this date' })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @Get('quick-checkins/date/:date')
  async getByDate(
    @Req() req: Request & { user: AuthUser },
    @Param() params: WellnessCheckinDateParam,
  ): Promise<QuickWellnessCheckinResponse> {
    return this.service.getByDate(req, params.date);
  }

  @Version('1')
  @ApiOperation({ summary: 'Update a check-in' })
  @ApiResponse({ status: HttpStatus.OK, type: QuickWellnessCheckinResponse })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, type: ErrorResponse, description: 'Check-in not found' })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @Patch('quick-checkins/:id')
  async updateCheckin(
    @Req() req: Request & { user: AuthUser },
    @Param() params: WellnessCheckinIdParam,
    @Body() body: UpdateQuickWellnessCheckinBody,
  ): Promise<QuickWellnessCheckinResponse> {
    return this.service.updateCheckin(req, params.id, body);
  }

  @Version('1')
  @ApiOperation({ summary: 'Delete a check-in' })
  @ApiResponse({ status: HttpStatus.NO_CONTENT })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, type: ErrorResponse, description: 'Check-in not found' })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete('quick-checkins/:id')
  async deleteCheckin(
    @Req() req: Request & { user: AuthUser },
    @Param() params: WellnessCheckinIdParam,
  ): Promise<void> {
    return this.service.deleteCheckin(req, params.id);
  }

  // Illness Logs

  @Version('1')
  @ApiOperation({ summary: 'Create a new illness log' })
  @ApiResponse({ status: HttpStatus.CREATED, type: IllnessLogResponse })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @Post('illness-logs')
  async createIllnessLog(
    @Req() req: Request & { user: AuthUser },
    @Body() body: IllnessLogBody,
  ): Promise<IllnessLogResponse> {
    return this.service.createIllnessLog(req, body);
  }

  @Version('1')
  @ApiOperation({ summary: 'Get active illness logs' })
  @ApiResponse({ status: HttpStatus.OK, type: IllnessLogListResponse })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @Get('illness-logs/active')
  async getActiveIllnessLogs(@Req() req: Request & { user: AuthUser }): Promise<IllnessLogListResponse> {
    return this.service.getActiveIllnessLogs(req);
  }

  @Version('1')
  @ApiOperation({ summary: 'List illness logs' })
  @ApiResponse({ status: HttpStatus.OK, type: IllnessLogListResponse })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @Get('illness-logs')
  async listIllnessLogs(
    @Req() req: Request & { user: AuthUser },
    @Query() query: ListIllnessLogsQuery,
  ): Promise<IllnessLogListResponse> {
    return this.service.listIllnessLogs(req, query);
  }

  @Version('1')
  @ApiOperation({ summary: 'Get illness log by ID' })
  @ApiResponse({ status: HttpStatus.OK, type: IllnessLogResponse })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, type: ErrorResponse, description: 'Illness log not found' })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @Get('illness-logs/:id')
  async getIllnessLogById(
    @Req() req: Request & { user: AuthUser },
    @Param() params: IllnessLogIdParam,
  ): Promise<IllnessLogResponse> {
    return this.service.getIllnessLogById(req, params.id);
  }

  @Version('1')
  @ApiOperation({ summary: 'Update an illness log' })
  @ApiResponse({ status: HttpStatus.OK, type: IllnessLogResponse })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, type: ErrorResponse, description: 'Illness log not found' })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @Patch('illness-logs/:id')
  async updateIllnessLog(
    @Req() req: Request & { user: AuthUser },
    @Param() params: IllnessLogIdParam,
    @Body() body: UpdateIllnessLogBody,
  ): Promise<IllnessLogResponse> {
    return this.service.updateIllnessLog(req, params.id, body);
  }

  @Version('1')
  @ApiOperation({ summary: 'Resolve an illness (set end date to today)' })
  @ApiResponse({ status: HttpStatus.OK, type: IllnessLogResponse })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, type: ErrorResponse, description: 'Illness log not found' })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @Post('illness-logs/:id/resolve')
  async resolveIllnessLog(
    @Req() req: Request & { user: AuthUser },
    @Param() params: IllnessLogIdParam,
  ): Promise<IllnessLogResponse> {
    return this.service.resolveIllnessLog(req, params.id);
  }

  @Version('1')
  @ApiOperation({ summary: 'Delete an illness log' })
  @ApiResponse({ status: HttpStatus.NO_CONTENT })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, type: ErrorResponse, description: 'Illness log not found' })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete('illness-logs/:id')
  async deleteIllnessLog(
    @Req() req: Request & { user: AuthUser },
    @Param() params: IllnessLogIdParam,
  ): Promise<void> {
    return this.service.deleteIllnessLog(req, params.id);
  }
}

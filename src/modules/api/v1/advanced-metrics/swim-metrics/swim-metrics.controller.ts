import { Controller, Get, HttpStatus, Param, Query, Req, UseGuards, Version } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { type Request } from 'express';
import { UserRole } from 'src/database/interfaces';
import { ErrorResponse } from 'src/lib/http/dto/error-response.dto';
import { Roles } from 'src/modules/auth/decorators/roles.decorator';
import { AuthUser } from 'src/modules/auth/types/authenticated-user';
import { CoachAthleteRelationshipGuard } from '../../coaching/guards/coach-athlete-relationship.guard';

import {
  CriticalSwimSpeedResponse,
  StrokeBreakdownResponse,
  StrokeRateAnalysisResponse,
  SwimMetricsQuery,
  SwimSummaryResponse,
  SwolfAnalysisResponse,
} from './swim-metrics.dto';
import { SwimMetricsService } from './swim-metrics.service';

@ApiTags('advanced-metrics')
@ApiBearerAuth('JWT')
@Controller('advanced-metrics')
export class SwimMetricsController {
  constructor(private readonly service: SwimMetricsService) {}

  // ==========================================
  // User endpoints
  // ==========================================

  @Version('1')
  @ApiOperation({ summary: 'Get swim metrics summary' })
  @ApiResponse({ status: HttpStatus.OK, type: SwimSummaryResponse })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @Get('swim')
  async getSwimSummary(
    @Req() req: Request & { user: AuthUser },
    @Query() query: SwimMetricsQuery,
  ): Promise<SwimSummaryResponse> {
    const userId = req.user.id;
    const days = query.days ?? 30;

    const result = await this.service.getSwimSummary(userId, days, query.poolOnly, query.openWaterOnly);

    return new SwimSummaryResponse({ data: result });
  }

  @Version('1')
  @ApiOperation({ summary: 'Get SWOLF analysis and trend' })
  @ApiResponse({ status: HttpStatus.OK, type: SwolfAnalysisResponse })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @Get('swim/swolf')
  async getSwolfAnalysis(
    @Req() req: Request & { user: AuthUser },
    @Query() query: SwimMetricsQuery,
  ): Promise<SwolfAnalysisResponse> {
    const userId = req.user.id;
    const days = query.days ?? 30;

    const result = await this.service.getSwolfAnalysis(userId, days);

    return new SwolfAnalysisResponse({ data: result });
  }

  @Version('1')
  @ApiOperation({ summary: 'Get stroke rate analysis and trends' })
  @ApiResponse({ status: HttpStatus.OK, type: StrokeRateAnalysisResponse })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @Get('swim/stroke-rate')
  async getStrokeRateAnalysis(
    @Req() req: Request & { user: AuthUser },
    @Query() query: SwimMetricsQuery,
  ): Promise<StrokeRateAnalysisResponse> {
    const userId = req.user.id;
    const days = query.days ?? 30;

    const result = await this.service.getStrokeRateAnalysis(userId, days);

    return new StrokeRateAnalysisResponse({ data: result });
  }

  @Version('1')
  @ApiOperation({ summary: 'Get Critical Swim Speed (CSS) with pace zones' })
  @ApiResponse({ status: HttpStatus.OK, type: CriticalSwimSpeedResponse })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @Get('swim/css')
  async getCriticalSwimSpeed(
    @Req() req: Request & { user: AuthUser },
    @Query() query: SwimMetricsQuery,
  ): Promise<CriticalSwimSpeedResponse> {
    const userId = req.user.id;
    const days = query.days ?? 90;

    const result = await this.service.getCriticalSwimSpeed(userId, days);

    return new CriticalSwimSpeedResponse({ data: result });
  }

  @Version('1')
  @ApiOperation({ summary: 'Get stroke type breakdown analysis' })
  @ApiResponse({ status: HttpStatus.OK, type: StrokeBreakdownResponse })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @Get('swim/stroke-breakdown')
  async getStrokeBreakdown(
    @Req() req: Request & { user: AuthUser },
    @Query() query: SwimMetricsQuery,
  ): Promise<StrokeBreakdownResponse> {
    const userId = req.user.id;
    const days = query.days ?? 30;

    const result = await this.service.getStrokeBreakdown(userId, days);

    return new StrokeBreakdownResponse({ data: result });
  }
}

// ==========================================
// Coach endpoints
// ==========================================

@ApiTags('coaching')
@ApiBearerAuth('JWT')
@Controller('coaching/athletes')
export class SwimMetricsCoachController {
  constructor(private readonly service: SwimMetricsService) {}

  @Version('1')
  @ApiOperation({ summary: "Get athlete's swim metrics summary (COACH only)" })
  @ApiResponse({ status: HttpStatus.OK, type: SwimSummaryResponse })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, type: ErrorResponse, description: 'Not authorized' })
  @Roles(UserRole.COACH)
  @UseGuards(CoachAthleteRelationshipGuard)
  @Get(':athleteId/swim')
  async getAthleteSwimSummary(
    @Param('athleteId') athleteId: string,
    @Query() query: SwimMetricsQuery,
  ): Promise<SwimSummaryResponse> {
    const days = query.days ?? 30;
    const result = await this.service.getSwimSummary(athleteId, days, query.poolOnly, query.openWaterOnly);

    return new SwimSummaryResponse({ data: result });
  }

  @Version('1')
  @ApiOperation({ summary: "Get athlete's SWOLF analysis (COACH only)" })
  @ApiResponse({ status: HttpStatus.OK, type: SwolfAnalysisResponse })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, type: ErrorResponse, description: 'Not authorized' })
  @Roles(UserRole.COACH)
  @UseGuards(CoachAthleteRelationshipGuard)
  @Get(':athleteId/swim/swolf')
  async getAthleteSwolfAnalysis(
    @Param('athleteId') athleteId: string,
    @Query() query: SwimMetricsQuery,
  ): Promise<SwolfAnalysisResponse> {
    const days = query.days ?? 30;
    const result = await this.service.getSwolfAnalysis(athleteId, days);

    return new SwolfAnalysisResponse({ data: result });
  }

  @Version('1')
  @ApiOperation({ summary: "Get athlete's stroke rate analysis (COACH only)" })
  @ApiResponse({ status: HttpStatus.OK, type: StrokeRateAnalysisResponse })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, type: ErrorResponse, description: 'Not authorized' })
  @Roles(UserRole.COACH)
  @UseGuards(CoachAthleteRelationshipGuard)
  @Get(':athleteId/swim/stroke-rate')
  async getAthleteStrokeRateAnalysis(
    @Param('athleteId') athleteId: string,
    @Query() query: SwimMetricsQuery,
  ): Promise<StrokeRateAnalysisResponse> {
    const days = query.days ?? 30;
    const result = await this.service.getStrokeRateAnalysis(athleteId, days);

    return new StrokeRateAnalysisResponse({ data: result });
  }

  @Version('1')
  @ApiOperation({ summary: "Get athlete's Critical Swim Speed (COACH only)" })
  @ApiResponse({ status: HttpStatus.OK, type: CriticalSwimSpeedResponse })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, type: ErrorResponse, description: 'Not authorized' })
  @Roles(UserRole.COACH)
  @UseGuards(CoachAthleteRelationshipGuard)
  @Get(':athleteId/swim/css')
  async getAthleteCriticalSwimSpeed(
    @Param('athleteId') athleteId: string,
    @Query() query: SwimMetricsQuery,
  ): Promise<CriticalSwimSpeedResponse> {
    const days = query.days ?? 90;
    const result = await this.service.getCriticalSwimSpeed(athleteId, days);

    return new CriticalSwimSpeedResponse({ data: result });
  }

  @Version('1')
  @ApiOperation({ summary: "Get athlete's stroke type breakdown (COACH only)" })
  @ApiResponse({ status: HttpStatus.OK, type: StrokeBreakdownResponse })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, type: ErrorResponse, description: 'Not authorized' })
  @Roles(UserRole.COACH)
  @UseGuards(CoachAthleteRelationshipGuard)
  @Get(':athleteId/swim/stroke-breakdown')
  async getAthleteStrokeBreakdown(
    @Param('athleteId') athleteId: string,
    @Query() query: SwimMetricsQuery,
  ): Promise<StrokeBreakdownResponse> {
    const days = query.days ?? 30;
    const result = await this.service.getStrokeBreakdown(athleteId, days);

    return new StrokeBreakdownResponse({ data: result });
  }
}

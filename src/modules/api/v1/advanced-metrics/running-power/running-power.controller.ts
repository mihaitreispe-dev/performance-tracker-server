import { Controller, Get, HttpStatus, Param, Query, Req, UseGuards, Version } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { type Request } from 'express';
import { UserRole } from 'src/database/interfaces';
import { ErrorResponse } from 'src/lib/http/dto/error-response.dto';
import { Roles } from 'src/modules/auth/decorators/roles.decorator';
import { AuthUser } from 'src/modules/auth/types/authenticated-user';

import { CoachAthleteRelationshipGuard } from '../../coaching/guards/coach-athlete-relationship.guard';
import {
  PowerPaceCorrelationResponse,
  RunningEffectivenessResponse,
  RunningPowerQuery,
  RunningPowerSummaryResponse,
  RunningPowerZonesResponse,
} from './running-power.dto';
import { RunningPowerService } from './running-power.service';

@ApiTags('advanced-metrics')
@ApiBearerAuth('JWT')
@Controller('advanced-metrics')
export class RunningPowerController {
  constructor(private readonly service: RunningPowerService) {}

  // ==========================================
  // User endpoints
  // ==========================================

  @Version('1')
  @ApiOperation({ summary: 'Get running power summary statistics' })
  @ApiResponse({ status: HttpStatus.OK, type: RunningPowerSummaryResponse })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @Get('running-power')
  async getRunningPowerSummary(
    @Req() req: Request & { user: AuthUser },
    @Query() query: RunningPowerQuery,
  ): Promise<RunningPowerSummaryResponse> {
    const userId = req.user.id;
    const days = query.days ?? 30;

    const result = await this.service.getRunningPowerSummary(userId, days);

    return new RunningPowerSummaryResponse({ data: result });
  }

  @Version('1')
  @ApiOperation({ summary: 'Get running effectiveness trend over time' })
  @ApiResponse({ status: HttpStatus.OK, type: RunningEffectivenessResponse })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @Get('running-power/effectiveness')
  async getRunningEffectiveness(
    @Req() req: Request & { user: AuthUser },
    @Query() query: RunningPowerQuery,
  ): Promise<RunningEffectivenessResponse> {
    const userId = req.user.id;
    const days = query.days ?? 30;

    const result = await this.service.getRunningEffectiveness(userId, days);

    return new RunningEffectivenessResponse({ data: result });
  }

  @Version('1')
  @ApiOperation({ summary: 'Get running power zone distribution' })
  @ApiResponse({ status: HttpStatus.OK, type: RunningPowerZonesResponse })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @Get('running-power/zones')
  async getRunningPowerZones(
    @Req() req: Request & { user: AuthUser },
    @Query() query: RunningPowerQuery,
  ): Promise<RunningPowerZonesResponse> {
    const userId = req.user.id;
    const days = query.days ?? 30;

    const result = await this.service.getRunningPowerZones(userId, days);

    return new RunningPowerZonesResponse({ data: result });
  }

  @Version('1')
  @ApiOperation({ summary: 'Get power vs pace correlation analysis' })
  @ApiResponse({ status: HttpStatus.OK, type: PowerPaceCorrelationResponse })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @Get('running-power/correlation')
  async getPowerPaceCorrelation(
    @Req() req: Request & { user: AuthUser },
    @Query() query: RunningPowerQuery,
  ): Promise<PowerPaceCorrelationResponse> {
    const userId = req.user.id;
    const days = query.days ?? 30;

    const result = await this.service.getPowerPaceCorrelation(userId, days);

    return new PowerPaceCorrelationResponse({ data: result });
  }
}

// ==========================================
// Coach endpoints
// ==========================================

@ApiTags('coaching')
@ApiBearerAuth('JWT')
@Controller('coaching/athletes')
export class RunningPowerCoachController {
  constructor(private readonly service: RunningPowerService) {}

  @Version('1')
  @ApiOperation({ summary: "Get athlete's running power summary (COACH only)" })
  @ApiResponse({ status: HttpStatus.OK, type: RunningPowerSummaryResponse })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, type: ErrorResponse, description: 'Not authorized' })
  @Roles(UserRole.COACH)
  @UseGuards(CoachAthleteRelationshipGuard)
  @Get(':athleteId/running-power')
  async getAthleteRunningPowerSummary(
    @Param('athleteId') athleteId: string,
    @Query() query: RunningPowerQuery,
  ): Promise<RunningPowerSummaryResponse> {
    const days = query.days ?? 30;
    const result = await this.service.getRunningPowerSummary(athleteId, days);

    return new RunningPowerSummaryResponse({ data: result });
  }

  @Version('1')
  @ApiOperation({ summary: "Get athlete's running effectiveness trend (COACH only)" })
  @ApiResponse({ status: HttpStatus.OK, type: RunningEffectivenessResponse })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, type: ErrorResponse, description: 'Not authorized' })
  @Roles(UserRole.COACH)
  @UseGuards(CoachAthleteRelationshipGuard)
  @Get(':athleteId/running-power/effectiveness')
  async getAthleteRunningEffectiveness(
    @Param('athleteId') athleteId: string,
    @Query() query: RunningPowerQuery,
  ): Promise<RunningEffectivenessResponse> {
    const days = query.days ?? 30;
    const result = await this.service.getRunningEffectiveness(athleteId, days);

    return new RunningEffectivenessResponse({ data: result });
  }

  @Version('1')
  @ApiOperation({ summary: "Get athlete's running power zone distribution (COACH only)" })
  @ApiResponse({ status: HttpStatus.OK, type: RunningPowerZonesResponse })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, type: ErrorResponse, description: 'Not authorized' })
  @Roles(UserRole.COACH)
  @UseGuards(CoachAthleteRelationshipGuard)
  @Get(':athleteId/running-power/zones')
  async getAthleteRunningPowerZones(
    @Param('athleteId') athleteId: string,
    @Query() query: RunningPowerQuery,
  ): Promise<RunningPowerZonesResponse> {
    const days = query.days ?? 30;
    const result = await this.service.getRunningPowerZones(athleteId, days);

    return new RunningPowerZonesResponse({ data: result });
  }

  @Version('1')
  @ApiOperation({ summary: "Get athlete's power vs pace correlation (COACH only)" })
  @ApiResponse({ status: HttpStatus.OK, type: PowerPaceCorrelationResponse })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, type: ErrorResponse, description: 'Not authorized' })
  @Roles(UserRole.COACH)
  @UseGuards(CoachAthleteRelationshipGuard)
  @Get(':athleteId/running-power/correlation')
  async getAthletePowerPaceCorrelation(
    @Param('athleteId') athleteId: string,
    @Query() query: RunningPowerQuery,
  ): Promise<PowerPaceCorrelationResponse> {
    const days = query.days ?? 30;
    const result = await this.service.getPowerPaceCorrelation(athleteId, days);

    return new PowerPaceCorrelationResponse({ data: result });
  }
}

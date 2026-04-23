import { Controller, Get, HttpStatus, Param, Query, Req, UseGuards, Version } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { type Request } from 'express';
import { UserRole } from 'src/database/interfaces';
import { ErrorResponse } from 'src/lib/http/dto/error-response.dto';
import { Roles } from 'src/modules/auth/decorators/roles.decorator';
import { AuthUser } from 'src/modules/auth/types/authenticated-user';

import { CoachAthleteRelationshipGuard } from '../../coaching/guards/coach-athlete-relationship.guard';
import {
  CPModelType,
  CriticalPowerQuery,
  CriticalPowerResponse,
  PowerCurveCompareQuery,
  PowerCurveCompareResponse,
  PowerCurveQuery,
  PowerCurveResponse,
} from './power-curve.dto';
import { PowerCurveService } from './power-curve.service';

@ApiTags('advanced-metrics')
@ApiBearerAuth('JWT')
@Controller('advanced-metrics')
export class PowerCurveController {
  constructor(private readonly service: PowerCurveService) {}

  // ==========================================
  // User endpoints
  // ==========================================

  @Version('1')
  @ApiOperation({ summary: 'Get power duration curve for cycling workouts' })
  @ApiResponse({ status: HttpStatus.OK, type: PowerCurveResponse })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @Get('power-curve')
  async getPowerCurve(
    @Req() req: Request & { user: AuthUser },
    @Query() query: PowerCurveQuery,
  ): Promise<PowerCurveResponse> {
    const userId = req.user.id;
    const days = query.days ?? 90;

    const result = await this.service.getPowerCurve(userId, days);

    return new PowerCurveResponse({ data: result });
  }

  @Version('1')
  @ApiOperation({ summary: 'Get Critical Power analysis (eFTP, Morton 3-param, or Monod-Scherrer model)' })
  @ApiResponse({ status: HttpStatus.OK, type: CriticalPowerResponse })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @Get('critical-power')
  async getCriticalPower(
    @Req() req: Request & { user: AuthUser },
    @Query() query: CriticalPowerQuery,
  ): Promise<CriticalPowerResponse> {
    const userId = req.user.id;
    const days = query.days ?? 90;
    const modelType = query.modelType ?? CPModelType.MORTON_3P;

    const result = await this.service.getCriticalPower(userId, days, modelType);

    return new CriticalPowerResponse({ data: result });
  }

  @Version('1')
  @ApiOperation({ summary: 'Compare power curves across different date ranges (season comparison)' })
  @ApiResponse({ status: HttpStatus.OK, type: PowerCurveCompareResponse })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @Get('power-curve/compare')
  async comparePowerCurves(
    @Req() req: Request & { user: AuthUser },
    @Query() query: PowerCurveCompareQuery,
  ): Promise<PowerCurveCompareResponse> {
    const userId = req.user.id;
    const result = await this.service.comparePowerCurves(userId, query.ranges);

    return new PowerCurveCompareResponse({ data: result });
  }
}

// ==========================================
// Coach endpoints (separate controller for clarity)
// ==========================================

@ApiTags('coaching')
@ApiBearerAuth('JWT')
@Controller('coaching/athletes')
export class PowerCurveCoachController {
  constructor(private readonly service: PowerCurveService) {}

  @Version('1')
  @ApiOperation({ summary: "Get athlete's power duration curve (COACH only)" })
  @ApiResponse({ status: HttpStatus.OK, type: PowerCurveResponse })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, type: ErrorResponse, description: 'Not authorized' })
  @Roles(UserRole.COACH)
  @UseGuards(CoachAthleteRelationshipGuard)
  @Get(':athleteId/power-curve')
  async getAthletePowerCurve(
    @Param('athleteId') athleteId: string,
    @Query() query: PowerCurveQuery,
  ): Promise<PowerCurveResponse> {
    const days = query.days ?? 90;
    const result = await this.service.getPowerCurve(athleteId, days);

    return new PowerCurveResponse({ data: result });
  }

  @Version('1')
  @ApiOperation({ summary: "Get athlete's Critical Power analysis (COACH only)" })
  @ApiResponse({ status: HttpStatus.OK, type: CriticalPowerResponse })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, type: ErrorResponse, description: 'Not authorized' })
  @Roles(UserRole.COACH)
  @UseGuards(CoachAthleteRelationshipGuard)
  @Get(':athleteId/critical-power')
  async getAthleteCriticalPower(
    @Param('athleteId') athleteId: string,
    @Query() query: CriticalPowerQuery,
  ): Promise<CriticalPowerResponse> {
    const days = query.days ?? 90;
    const modelType = query.modelType ?? CPModelType.MORTON_3P;
    const result = await this.service.getCriticalPower(athleteId, days, modelType);

    return new CriticalPowerResponse({ data: result });
  }

  @Version('1')
  @ApiOperation({ summary: "Compare athlete's power curves across different date ranges (COACH only)" })
  @ApiResponse({ status: HttpStatus.OK, type: PowerCurveCompareResponse })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, type: ErrorResponse, description: 'Not authorized' })
  @Roles(UserRole.COACH)
  @UseGuards(CoachAthleteRelationshipGuard)
  @Get(':athleteId/power-curve/compare')
  async compareAthletePowerCurves(
    @Param('athleteId') athleteId: string,
    @Query() query: PowerCurveCompareQuery,
  ): Promise<PowerCurveCompareResponse> {
    const result = await this.service.comparePowerCurves(athleteId, query.ranges);

    return new PowerCurveCompareResponse({ data: result });
  }
}

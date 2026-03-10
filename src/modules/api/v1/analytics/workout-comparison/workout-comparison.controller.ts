import { Body, Controller, Get, HttpStatus, Param, Post, Query, Req, Version } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { type Request } from 'express';
import { ErrorResponse } from 'src/lib/http/dto/error-response.dto';
import { AuthUser } from 'src/modules/auth/types/authenticated-user';

import {
  CompareAthletesBody,
  CompareWorkoutsBody,
  SimilarExecutionsParam,
  SimilarExecutionsQuery,
} from './request.dto';
import {
  CoachAthleteComparisonResponse,
  SimilarExecutionsResponse,
  WorkoutComparisonResponse,
} from './response.dto';
import { WorkoutComparisonService } from './workout-comparison.service';

@ApiTags('analytics')
@ApiBearerAuth('JWT')
@Controller('analytics')
export class WorkoutComparisonController {
  constructor(private readonly service: WorkoutComparisonService) {}

  @Version('1')
  @ApiOperation({ summary: 'Get similar workout executions for comparison' })
  @ApiResponse({ status: HttpStatus.OK, type: SimilarExecutionsResponse })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, type: ErrorResponse, description: 'Execution not found' })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, type: ErrorResponse, description: 'Access denied' })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @Get('workout/:executionId/similar')
  async getSimilarExecutions(
    @Req() req: Request & { user: AuthUser },
    @Param() params: SimilarExecutionsParam,
    @Query() query: SimilarExecutionsQuery,
  ): Promise<SimilarExecutionsResponse> {
    return this.service.getSimilarExecutions(req, params.executionId, query);
  }

  @Version('1')
  @ApiOperation({ summary: 'Compare multiple workout executions' })
  @ApiResponse({ status: HttpStatus.OK, type: WorkoutComparisonResponse })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, type: ErrorResponse, description: 'Execution not found' })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, type: ErrorResponse, description: 'Access denied' })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @Post('compare')
  async compareWorkouts(
    @Req() req: Request & { user: AuthUser },
    @Body() body: CompareWorkoutsBody,
  ): Promise<WorkoutComparisonResponse> {
    return this.service.compareWorkouts(req, body);
  }
}

@ApiTags('coaching')
@ApiBearerAuth('JWT')
@Controller('coaching')
export class CoachComparisonController {
  constructor(private readonly service: WorkoutComparisonService) {}

  @Version('1')
  @ApiOperation({ summary: 'Compare workout executions across athletes (coach only)' })
  @ApiResponse({ status: HttpStatus.OK, type: CoachAthleteComparisonResponse })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, type: ErrorResponse, description: 'Workout not found' })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, type: ErrorResponse, description: 'Access denied' })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @Post('compare-athletes')
  async compareAthletes(
    @Req() req: Request & { user: AuthUser },
    @Body() body: CompareAthletesBody,
  ): Promise<CoachAthleteComparisonResponse> {
    return this.service.compareAthletes(req, body);
  }
}

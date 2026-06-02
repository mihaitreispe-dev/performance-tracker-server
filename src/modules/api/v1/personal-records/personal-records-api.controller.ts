import { Body, Controller, Get, HttpStatus, Param, Post, Query, Req, Version } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { type Request } from 'express';
import { ErrorResponse } from 'src/lib/http/dto/error-response.dto';
import { AuthUser } from 'src/modules/auth/types/authenticated-user';
import { SkipActiveOrg } from 'src/modules/auth/guards/active-org.guard';

import { PersonalRecordsApiService } from './personal-records-api.service';
import {
  BulkStrengthPRsBody,
  ExercisePRsParam,
  ListPersonalRecordsQuery,
  PeriodComparisonQuery,
  PREvolutionQuery,
  PRHistoryQuery,
  RecentPRsQuery,
} from './request.dto';
import {
  BulkStrengthPRsResponse,
  ExercisePRsResponse,
  PeriodComparisonResponse,
  PersonalRecordListResponse,
  PREvolutionResponse,
  PRHistoryResponse,
  RecentPRsResponse,
} from './response.dto';

@ApiTags('personal-records')
@ApiBearerAuth('JWT')
@Controller('personal-records')
@SkipActiveOrg()
export class PersonalRecordsApiController {
  constructor(private readonly service: PersonalRecordsApiService) {}

  @Version('1')
  @ApiOperation({ summary: 'List current personal records' })
  @ApiResponse({ status: HttpStatus.OK, type: PersonalRecordListResponse })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @Get()
  async list(
    @Req() req: Request & { user: AuthUser },
    @Query() query: ListPersonalRecordsQuery,
  ): Promise<PersonalRecordListResponse> {
    return this.service.list(req, query);
  }

  @Version('1')
  @ApiOperation({ summary: 'Get strength PRs for a specific exercise' })
  @ApiResponse({ status: HttpStatus.OK, type: ExercisePRsResponse })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, type: ErrorResponse, description: 'Exercise not found' })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @Get('strength/:exerciseId')
  async getStrengthPRs(
    @Req() req: Request & { user: AuthUser },
    @Param() params: ExercisePRsParam,
  ): Promise<ExercisePRsResponse> {
    return this.service.getStrengthPRsForExercise(req, params.exerciseId);
  }

  /**
   * Bulk strength-PR lookup for the in-player exercise card (spec E1).
   * POST (not GET) because the exercise-id list can be ~20-64 UUIDs —
   * past the practical query-string length and harder to cache anyway
   * (each user has different PRs). The body shape mirrors the bulk
   * /workout-executions/last-actuals endpoint for consistency.
   */
  @Version('1')
  @ApiOperation({ summary: 'Bulk strength PR lookup for a list of exercises' })
  @ApiResponse({ status: HttpStatus.OK, type: BulkStrengthPRsResponse })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @Post('strength/bulk')
  async getBulkStrengthPRs(
    @Req() req: Request & { user: AuthUser },
    @Body() body: BulkStrengthPRsBody,
  ): Promise<BulkStrengthPRsResponse> {
    return this.service.getBulkStrengthPRsForExercises(req, body.exerciseIds);
  }

  @Version('1')
  @ApiOperation({ summary: 'Get PR evolution over time' })
  @ApiResponse({ status: HttpStatus.OK, type: PREvolutionResponse })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @Get('evolution')
  async getEvolution(
    @Req() req: Request & { user: AuthUser },
    @Query() query: PREvolutionQuery,
  ): Promise<PREvolutionResponse> {
    return this.service.getEvolution(req, query);
  }

  @Version('1')
  @ApiOperation({ summary: 'Compare PRs between two periods' })
  @ApiResponse({ status: HttpStatus.OK, type: PeriodComparisonResponse })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @Get('period-comparison')
  async getPeriodComparison(
    @Req() req: Request & { user: AuthUser },
    @Query() query: PeriodComparisonQuery,
  ): Promise<PeriodComparisonResponse> {
    return this.service.getPeriodComparison(req, query);
  }

  @Version('1')
  @ApiOperation({ summary: 'Get recently achieved PRs' })
  @ApiResponse({ status: HttpStatus.OK, type: RecentPRsResponse })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @Get('recent')
  async getRecentPRs(
    @Req() req: Request & { user: AuthUser },
    @Query() query: RecentPRsQuery,
  ): Promise<RecentPRsResponse> {
    return this.service.getRecentPRs(req, query);
  }

  @Version('1')
  @ApiOperation({ summary: 'Get PR history for a specific record type, sorted by value (best first)' })
  @ApiResponse({ status: HttpStatus.OK, type: PRHistoryResponse })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @Get('history')
  async getHistory(
    @Req() req: Request & { user: AuthUser },
    @Query() query: PRHistoryQuery,
  ): Promise<PRHistoryResponse> {
    return this.service.getHistory(req, query);
  }
}

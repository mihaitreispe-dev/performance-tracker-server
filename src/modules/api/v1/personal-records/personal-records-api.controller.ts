import { Controller, Get, HttpStatus, Param, Query, Req, Version } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { type Request } from 'express';
import { ErrorResponse } from 'src/lib/http/dto/error-response.dto';
import { AuthUser } from 'src/modules/auth/types/authenticated-user';

import { PersonalRecordsApiService } from './personal-records-api.service';
import {
  ExercisePRsParam,
  ListPersonalRecordsQuery,
  PeriodComparisonQuery,
  PREvolutionQuery,
  RecentPRsQuery,
} from './request.dto';
import {
  ExercisePRsResponse,
  PeriodComparisonResponse,
  PersonalRecordListResponse,
  PREvolutionResponse,
  RecentPRsResponse,
} from './response.dto';

@ApiTags('personal-records')
@ApiBearerAuth('JWT')
@Controller('personal-records')
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
}

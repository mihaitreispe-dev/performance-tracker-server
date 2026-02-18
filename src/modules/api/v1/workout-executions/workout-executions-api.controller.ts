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
  BatchUploadMetricsBody,
  CompleteSetBody,
  ListMetricsQuery,
  ListSetCompletionsQuery,
  ListWorkoutExecutionsQuery,
  StartWorkoutExecutionBody,
  UpdateWorkoutExecutionBody,
  UploadRouteBody,
  WorkoutExecutionIdParam,
} from './request.dto';
import {
  BatchUploadMetricsResponse,
  CardioMetricListResponse,
  SetCompletionListResponse,
  SetCompletionResponse,
  WorkoutExecutionListResponse,
  WorkoutExecutionResponse,
  WorkoutRouteResponse,
} from './response.dto';
import { WorkoutExecutionsApiService } from './workout-executions-api.service';

@ApiTags('workout-executions')
@ApiBearerAuth('JWT')
@Controller('workout-executions')
export class WorkoutExecutionsApiController {
  constructor(private readonly service: WorkoutExecutionsApiService) {}

  // Workout Executions

  @Version('1')
  @ApiOperation({ summary: 'List workout executions for authenticated user' })
  @ApiResponse({ status: HttpStatus.OK, type: WorkoutExecutionListResponse })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @Get()
  async list(
    @Req() req: Request & { user: AuthUser },
    @Query() query: ListWorkoutExecutionsQuery,
  ): Promise<WorkoutExecutionListResponse> {
    return this.service.list(req, query);
  }

  @Version('1')
  @ApiOperation({ summary: 'Get workout execution by ID' })
  @ApiResponse({ status: HttpStatus.OK, type: WorkoutExecutionResponse })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, type: ErrorResponse, description: 'Not found' })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @Get(':id')
  async getById(
    @Req() req: Request & { user: AuthUser },
    @Param() params: WorkoutExecutionIdParam,
  ): Promise<WorkoutExecutionResponse> {
    return this.service.getById(req, params.id);
  }

  @Version('1')
  @ApiOperation({ summary: 'Start a workout execution' })
  @ApiResponse({ status: HttpStatus.CREATED, type: WorkoutExecutionResponse })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, type: ErrorResponse, description: 'Workout schedule not found' })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @Post()
  async start(
    @Req() req: Request & { user: AuthUser },
    @Body() body: StartWorkoutExecutionBody,
  ): Promise<WorkoutExecutionResponse> {
    return this.service.start(req, body);
  }

  @Version('1')
  @ApiOperation({ summary: 'Update workout execution (complete, add notes, etc.)' })
  @ApiResponse({ status: HttpStatus.OK, type: WorkoutExecutionResponse })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, type: ErrorResponse, description: 'Not found' })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @Patch(':id')
  async update(
    @Req() req: Request & { user: AuthUser },
    @Param() params: WorkoutExecutionIdParam,
    @Body() body: UpdateWorkoutExecutionBody,
  ): Promise<WorkoutExecutionResponse> {
    return this.service.update(req, params.id, body);
  }

  @Version('1')
  @ApiOperation({ summary: 'Delete/cancel a workout execution' })
  @ApiResponse({ status: HttpStatus.NO_CONTENT })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, type: ErrorResponse, description: 'Not found' })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete(':id')
  async delete(@Req() req: Request & { user: AuthUser }, @Param() params: WorkoutExecutionIdParam): Promise<void> {
    return this.service.delete(req, params.id);
  }

  // Set Completions

  @Version('1')
  @ApiOperation({ summary: 'Complete a set during workout execution' })
  @ApiResponse({ status: HttpStatus.CREATED, type: SetCompletionResponse })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, type: ErrorResponse, description: 'Execution not found' })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @Post(':id/sets')
  async completeSet(
    @Req() req: Request & { user: AuthUser },
    @Param() params: WorkoutExecutionIdParam,
    @Body() body: CompleteSetBody,
  ): Promise<SetCompletionResponse> {
    return this.service.completeSet(req, params.id, body);
  }

  @Version('1')
  @ApiOperation({ summary: 'Get all set completions for a workout execution' })
  @ApiResponse({ status: HttpStatus.OK, type: SetCompletionListResponse })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, type: ErrorResponse, description: 'Execution not found' })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @Get(':id/sets')
  async listSetCompletions(
    @Req() req: Request & { user: AuthUser },
    @Param() params: WorkoutExecutionIdParam,
    @Query() query: ListSetCompletionsQuery,
  ): Promise<SetCompletionListResponse> {
    return this.service.listSetCompletions(req, params.id, query);
  }

  // Cardio Metrics

  @Version('1')
  @ApiOperation({ summary: 'Batch upload cardio metrics' })
  @ApiResponse({ status: HttpStatus.CREATED, type: BatchUploadMetricsResponse })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, type: ErrorResponse, description: 'Execution not found' })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @Post(':id/metrics')
  async uploadMetrics(
    @Req() req: Request & { user: AuthUser },
    @Param() params: WorkoutExecutionIdParam,
    @Body() body: BatchUploadMetricsBody,
  ): Promise<BatchUploadMetricsResponse> {
    return this.service.uploadMetrics(req, params.id, body);
  }

  @Version('1')
  @ApiOperation({ summary: 'Get cardio metrics for a workout execution' })
  @ApiResponse({ status: HttpStatus.OK, type: CardioMetricListResponse })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, type: ErrorResponse, description: 'Execution not found' })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @Get(':id/metrics')
  async listMetrics(
    @Req() req: Request & { user: AuthUser },
    @Param() params: WorkoutExecutionIdParam,
    @Query() query: ListMetricsQuery,
  ): Promise<CardioMetricListResponse> {
    return this.service.listMetrics(req, params.id, query);
  }

  // Route

  @Version('1')
  @ApiOperation({ summary: 'Upload route data for a workout execution' })
  @ApiResponse({ status: HttpStatus.CREATED, type: WorkoutRouteResponse })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, type: ErrorResponse, description: 'Execution not found' })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, type: ErrorResponse, description: 'Route already exists' })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @Post(':id/route')
  async uploadRoute(
    @Req() req: Request & { user: AuthUser },
    @Param() params: WorkoutExecutionIdParam,
    @Body() body: UploadRouteBody,
  ): Promise<WorkoutRouteResponse> {
    return this.service.uploadRoute(req, params.id, body);
  }

  @Version('1')
  @ApiOperation({ summary: 'Get route data for a workout execution' })
  @ApiResponse({ status: HttpStatus.OK, type: WorkoutRouteResponse })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, type: ErrorResponse, description: 'Execution or route not found' })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @Get(':id/route')
  async getRoute(
    @Req() req: Request & { user: AuthUser },
    @Param() params: WorkoutExecutionIdParam,
  ): Promise<WorkoutRouteResponse> {
    return this.service.getRoute(req, params.id);
  }
}

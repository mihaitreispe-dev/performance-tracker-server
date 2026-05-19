import { Controller, Get, Param, Query, Req } from '@nestjs/common';
import { ApiOperation, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';

import type { ApiKeyContext } from 'src/modules/auth/api-key/api-key.guard';
import { PublicApiRoute } from 'src/modules/auth/api-key/public-api-route.decorator';

import { PublicApiService } from './public-api.service';
import { PublicSearchQuery, ResourceIdParam } from './request.dto';
import {
  PublicCourseListResponse,
  PublicCourseResponse,
  PublicExerciseListResponse,
  PublicExerciseResponse,
  PublicMovementSnackListResponse,
  PublicMovementSnackResponse,
  PublicWorkoutListResponse,
  PublicWorkoutResponse,
} from './response.dto';

type PublicRequest = Request & { apiKey: ApiKeyContext };

@ApiTags('Public')
@ApiSecurity('apiKey')
@Controller('public')
export class PublicApiController {
  constructor(private readonly service: PublicApiService) {}

  // --- Workouts ---

  @Get('workouts')
  @PublicApiRoute('workouts:read')
  @ApiOperation({ summary: 'List the organisation\'s workouts.' })
  async listWorkouts(
    @Req() req: PublicRequest,
    @Query() query: PublicSearchQuery,
  ): Promise<PublicWorkoutListResponse> {
    return this.service.listWorkouts(req.apiKey.organisationId, normalize(query));
  }

  @Get('workouts/:id')
  @PublicApiRoute('workouts:read')
  @ApiOperation({ summary: 'Fetch a single workout.' })
  async getWorkout(
    @Req() req: PublicRequest,
    @Param() params: ResourceIdParam,
  ): Promise<PublicWorkoutResponse> {
    return this.service.getWorkout(req.apiKey.organisationId, params.id);
  }

  // --- Courses ---

  @Get('courses')
  @PublicApiRoute('courses:read')
  @ApiOperation({ summary: 'List the organisation\'s published courses.' })
  async listCourses(
    @Req() req: PublicRequest,
    @Query() query: PublicSearchQuery,
  ): Promise<PublicCourseListResponse> {
    return this.service.listCourses(req.apiKey.organisationId, normalize(query));
  }

  @Get('courses/:id')
  @PublicApiRoute('courses:read')
  @ApiOperation({ summary: 'Fetch a single published course.' })
  async getCourse(
    @Req() req: PublicRequest,
    @Param() params: ResourceIdParam,
  ): Promise<PublicCourseResponse> {
    return this.service.getCourse(req.apiKey.organisationId, params.id);
  }

  // --- Movement snacks ---

  @Get('movement-snacks')
  @PublicApiRoute('movement_snacks:read')
  @ApiOperation({ summary: 'List the organisation\'s movement snacks.' })
  async listMovementSnacks(
    @Req() req: PublicRequest,
    @Query() query: PublicSearchQuery,
  ): Promise<PublicMovementSnackListResponse> {
    return this.service.listMovementSnacks(req.apiKey.organisationId, normalize(query));
  }

  @Get('movement-snacks/:id')
  @PublicApiRoute('movement_snacks:read')
  @ApiOperation({ summary: 'Fetch a single movement snack.' })
  async getMovementSnack(
    @Req() req: PublicRequest,
    @Param() params: ResourceIdParam,
  ): Promise<PublicMovementSnackResponse> {
    return this.service.getMovementSnack(req.apiKey.organisationId, params.id);
  }

  // --- Exercises ---

  @Get('exercises')
  @PublicApiRoute('exercises:read')
  @ApiOperation({ summary: 'List exercises available to this organisation.' })
  async listExercises(
    @Req() req: PublicRequest,
    @Query() query: PublicSearchQuery,
  ): Promise<PublicExerciseListResponse> {
    return this.service.listExercises(req.apiKey.organisationId, normalize(query));
  }

  @Get('exercises/:id')
  @PublicApiRoute('exercises:read')
  @ApiOperation({ summary: 'Fetch a single exercise.' })
  async getExercise(
    @Req() req: PublicRequest,
    @Param() params: ResourceIdParam,
  ): Promise<PublicExerciseResponse> {
    return this.service.getExercise(req.apiKey.organisationId, params.id);
  }
}

function normalize(q: PublicSearchQuery): {
  offset: number;
  limit: number;
  search?: string;
  tag?: string;
} {
  return {
    offset: q.offset ?? 0,
    limit: q.limit ?? 50,
    search: q.search,
    tag: q.tag,
  };
}

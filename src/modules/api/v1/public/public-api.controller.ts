import { Controller, Get, Param, Query, Req } from '@nestjs/common';
import { ApiOperation, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';

import type { ApiKeyContext } from 'src/modules/auth/api-key/api-key.guard';
import { PublicApiRoute } from 'src/modules/auth/api-key/public-api-route.decorator';

import { PublicApiService } from './public-api.service';
import { PublicClientContextQuery, PublicSearchQuery, ResourceIdParam } from './request.dto';
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
  @ApiOperation({ summary: "List the organisation's workouts. Pass `clientId` to have the response's `lock` reflect that specific client's access." })
  async listWorkouts(
    @Req() req: PublicRequest,
    @Query() query: PublicSearchQuery,
  ): Promise<PublicWorkoutListResponse> {
    return this.service.listWorkouts(req.apiKey.organisationId, normalize(query), query.clientId ?? null);
  }

  @Get('workouts/:id')
  @PublicApiRoute('workouts:read')
  @ApiOperation({
    summary:
      'Fetch a single workout. Pass `clientId` to enforce access — locked resources respond HTTP 402 with a tier payload instead of the workout body.',
  })
  async getWorkout(
    @Req() req: PublicRequest,
    @Param() params: ResourceIdParam,
    @Query() query: PublicClientContextQuery,
  ): Promise<PublicWorkoutResponse> {
    return this.service.getWorkout(req.apiKey.organisationId, params.id, query.clientId ?? null);
  }

  // --- Courses ---

  @Get('courses')
  @PublicApiRoute('courses:read')
  @ApiOperation({ summary: "List the organisation's published courses. Pass `clientId` for client-specific lock state." })
  async listCourses(
    @Req() req: PublicRequest,
    @Query() query: PublicSearchQuery,
  ): Promise<PublicCourseListResponse> {
    return this.service.listCourses(req.apiKey.organisationId, normalize(query), query.clientId ?? null);
  }

  @Get('courses/:id')
  @PublicApiRoute('courses:read')
  @ApiOperation({ summary: 'Fetch a single published course. Pass `clientId` to enforce access (HTTP 402 if locked).' })
  async getCourse(
    @Req() req: PublicRequest,
    @Param() params: ResourceIdParam,
    @Query() query: PublicClientContextQuery,
  ): Promise<PublicCourseResponse> {
    return this.service.getCourse(req.apiKey.organisationId, params.id, query.clientId ?? null);
  }

  // --- Movement snacks ---

  @Get('movement-snacks')
  @PublicApiRoute('movement_snacks:read')
  @ApiOperation({ summary: "List the organisation's movement snacks. Pass `clientId` for client-specific lock state." })
  async listMovementSnacks(
    @Req() req: PublicRequest,
    @Query() query: PublicSearchQuery,
  ): Promise<PublicMovementSnackListResponse> {
    return this.service.listMovementSnacks(req.apiKey.organisationId, normalize(query), query.clientId ?? null);
  }

  @Get('movement-snacks/:id')
  @PublicApiRoute('movement_snacks:read')
  @ApiOperation({
    summary: 'Fetch a single movement snack. Pass `clientId` to enforce access (HTTP 402 if locked).',
  })
  async getMovementSnack(
    @Req() req: PublicRequest,
    @Param() params: ResourceIdParam,
    @Query() query: PublicClientContextQuery,
  ): Promise<PublicMovementSnackResponse> {
    return this.service.getMovementSnack(req.apiKey.organisationId, params.id, query.clientId ?? null);
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

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

import { CreateWorkoutBody, ListWorkoutsQuery, UpdateWorkoutBody, WorkoutIdParam } from './request.dto';
import { WorkoutListResponse, WorkoutResponse } from './response.dto';
import { WorkoutsApiService } from './workouts-api.service';

@ApiTags('workouts')
@ApiBearerAuth('JWT')
@Controller('workouts')
export class WorkoutsApiController {
  constructor(private readonly service: WorkoutsApiService) {}

  @Version('1')
  @ApiOperation({ summary: 'List workouts for authenticated user' })
  @ApiResponse({ status: HttpStatus.OK, type: WorkoutListResponse })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @Get()
  async list(
    @Req() req: Request & { user: AuthUser },
    @Query() query: ListWorkoutsQuery,
  ): Promise<WorkoutListResponse> {
    return this.service.list(req, query);
  }

  @Version('1')
  @ApiOperation({ summary: 'Get workout by ID' })
  @ApiResponse({ status: HttpStatus.OK, type: WorkoutResponse })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, type: ErrorResponse, description: 'Not found' })
  @Get(':id')
  async getById(@Req() req: Request & { user: AuthUser }, @Param() params: WorkoutIdParam): Promise<WorkoutResponse> {
    return this.service.getById(req, params.id);
  }

  @Version('1')
  @ApiOperation({ summary: 'Create workout' })
  @ApiResponse({ status: HttpStatus.CREATED, type: WorkoutResponse })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @Post()
  async create(@Req() req: Request & { user: AuthUser }, @Body() body: CreateWorkoutBody): Promise<WorkoutResponse> {
    return this.service.create(req, body);
  }

  @Version('1')
  @ApiOperation({ summary: 'Update workout' })
  @ApiResponse({ status: HttpStatus.OK, type: WorkoutResponse })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, type: ErrorResponse, description: 'Not found' })
  @Patch(':id')
  async update(
    @Req() req: Request & { user: AuthUser },
    @Param() params: WorkoutIdParam,
    @Body() body: UpdateWorkoutBody,
  ): Promise<WorkoutResponse> {
    return this.service.update(req, params.id, body);
  }

  @Version('1')
  @ApiOperation({ summary: 'Delete workout' })
  @ApiResponse({ status: HttpStatus.NO_CONTENT })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, type: ErrorResponse, description: 'Not found' })
  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete(':id')
  async delete(@Req() req: Request & { user: AuthUser }, @Param() params: WorkoutIdParam): Promise<void> {
    return this.service.delete(req, params.id);
  }
}

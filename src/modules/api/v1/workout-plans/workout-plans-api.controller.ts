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
  ActivatePlanBody,
  AddWorkoutPlanItemBody,
  CreateWorkoutPlanBody,
  ListWorkoutPlansQuery,
  UpdateWorkoutPlanBody,
  WorkoutPlanIdParam,
  WorkoutPlanItemIdParam,
} from './request.dto';
import {
  ActivatePlanResponse,
  WorkoutPlanItemResponse,
  WorkoutPlanListResponse,
  WorkoutPlanResponse,
  WorkoutPlanWithItemsResponse,
} from './response.dto';
import { WorkoutPlansApiService } from './workout-plans-api.service';

@ApiTags('workout-plans')
@ApiBearerAuth('JWT')
@Controller('workout-plans')
export class WorkoutPlansApiController {
  constructor(private readonly service: WorkoutPlansApiService) {}

  @Version('1')
  @ApiOperation({ summary: 'List workout plans for authenticated user' })
  @ApiResponse({ status: HttpStatus.OK, type: WorkoutPlanListResponse })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @Get()
  async list(
    @Req() req: Request & { user: AuthUser },
    @Query() query: ListWorkoutPlansQuery,
  ): Promise<WorkoutPlanListResponse> {
    return this.service.list(req, query);
  }

  @Version('1')
  @ApiOperation({ summary: 'Get workout plan by ID with items' })
  @ApiResponse({ status: HttpStatus.OK, type: WorkoutPlanWithItemsResponse })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, type: ErrorResponse, description: 'Not found' })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @Get(':id')
  async getById(
    @Req() req: Request & { user: AuthUser },
    @Param() params: WorkoutPlanIdParam,
  ): Promise<WorkoutPlanWithItemsResponse> {
    return this.service.getById(req, params.id);
  }

  @Version('1')
  @ApiOperation({ summary: 'Create a new workout plan' })
  @ApiResponse({ status: HttpStatus.CREATED, type: WorkoutPlanResponse })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @Post()
  async create(
    @Req() req: Request & { user: AuthUser },
    @Body() body: CreateWorkoutPlanBody,
  ): Promise<WorkoutPlanResponse> {
    return this.service.create(req, body);
  }

  @Version('1')
  @ApiOperation({ summary: 'Update workout plan' })
  @ApiResponse({ status: HttpStatus.OK, type: WorkoutPlanResponse })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, type: ErrorResponse, description: 'Not found' })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @Patch(':id')
  async update(
    @Req() req: Request & { user: AuthUser },
    @Param() params: WorkoutPlanIdParam,
    @Body() body: UpdateWorkoutPlanBody,
  ): Promise<WorkoutPlanResponse> {
    return this.service.update(req, params.id, body);
  }

  @Version('1')
  @ApiOperation({ summary: 'Delete workout plan' })
  @ApiResponse({ status: HttpStatus.NO_CONTENT })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, type: ErrorResponse, description: 'Not found' })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete(':id')
  async delete(@Req() req: Request & { user: AuthUser }, @Param() params: WorkoutPlanIdParam): Promise<void> {
    return this.service.delete(req, params.id);
  }

  @Version('1')
  @ApiOperation({ summary: 'Add workout to plan at specific week/day position' })
  @ApiResponse({ status: HttpStatus.CREATED, type: WorkoutPlanItemResponse })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, type: ErrorResponse, description: 'Plan or workout not found' })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    type: ErrorResponse,
    description: 'Invalid week number or duplicate position',
  })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @Post(':id/items')
  async addItem(
    @Req() req: Request & { user: AuthUser },
    @Param() params: WorkoutPlanIdParam,
    @Body() body: AddWorkoutPlanItemBody,
  ): Promise<WorkoutPlanItemResponse> {
    return this.service.addItem(req, params.id, body);
  }

  @Version('1')
  @ApiOperation({ summary: 'Remove workout from plan' })
  @ApiResponse({ status: HttpStatus.NO_CONTENT })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, type: ErrorResponse, description: 'Plan or item not found' })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete(':id/items/:itemId')
  async removeItem(@Req() req: Request & { user: AuthUser }, @Param() params: WorkoutPlanItemIdParam): Promise<void> {
    return this.service.removeItem(req, params.id, params.itemId);
  }

  @Version('1')
  @ApiOperation({ summary: 'Activate plan by creating workout schedules starting from a date' })
  @ApiResponse({ status: HttpStatus.CREATED, type: ActivatePlanResponse })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, type: ErrorResponse, description: 'Plan not found' })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, type: ErrorResponse, description: 'Empty plan' })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @Post(':id/activate')
  async activate(
    @Req() req: Request & { user: AuthUser },
    @Param() params: WorkoutPlanIdParam,
    @Body() body: ActivatePlanBody,
  ): Promise<ActivatePlanResponse> {
    return this.service.activate(req, params.id, body);
  }
}

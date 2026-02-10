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
  CreateWorkoutScheduleBody,
  ListWorkoutSchedulesQuery,
  UpdateWorkoutScheduleBody,
  WorkoutScheduleIdParam,
} from './request.dto';
import {
  WorkoutScheduleListResponse,
  WorkoutScheduleResponse,
} from './response.dto';
import { WorkoutSchedulesApiService } from './workout-schedules-api.service';

@ApiTags('workout-schedules')
@ApiBearerAuth('JWT')
@Controller('workout-schedules')
export class WorkoutSchedulesApiController {
  constructor(private readonly service: WorkoutSchedulesApiService) {}

  @Version('1')
  @ApiOperation({ summary: 'List workout schedules for authenticated user' })
  @ApiResponse({ status: HttpStatus.OK, type: WorkoutScheduleListResponse })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @Get()
  async list(
    @Req() req: Request & { user: AuthUser },
    @Query() query: ListWorkoutSchedulesQuery,
  ): Promise<WorkoutScheduleListResponse> {
    return this.service.list(req, query);
  }

  @Version('1')
  @ApiOperation({ summary: 'Get workout schedule by ID' })
  @ApiResponse({ status: HttpStatus.OK, type: WorkoutScheduleResponse })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, type: ErrorResponse, description: 'Not found' })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @Get(':id')
  async getById(
    @Req() req: Request & { user: AuthUser },
    @Param() params: WorkoutScheduleIdParam,
  ): Promise<WorkoutScheduleResponse> {
    return this.service.getById(req, params.id);
  }

  @Version('1')
  @ApiOperation({ summary: 'Schedule a workout' })
  @ApiResponse({ status: HttpStatus.CREATED, type: WorkoutScheduleResponse })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, type: ErrorResponse, description: 'Workout not found' })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @Post()
  async create(
    @Req() req: Request & { user: AuthUser },
    @Body() body: CreateWorkoutScheduleBody,
  ): Promise<WorkoutScheduleResponse> {
    return this.service.create(req, body);
  }

  @Version('1')
  @ApiOperation({ summary: 'Update workout schedule (change date or mark complete)' })
  @ApiResponse({ status: HttpStatus.OK, type: WorkoutScheduleResponse })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, type: ErrorResponse, description: 'Not found' })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @Patch(':id')
  async update(
    @Req() req: Request & { user: AuthUser },
    @Param() params: WorkoutScheduleIdParam,
    @Body() body: UpdateWorkoutScheduleBody,
  ): Promise<WorkoutScheduleResponse> {
    return this.service.update(req, params.id, body);
  }

  @Version('1')
  @ApiOperation({ summary: 'Delete workout schedule' })
  @ApiResponse({ status: HttpStatus.NO_CONTENT })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, type: ErrorResponse, description: 'Not found' })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete(':id')
  async delete(
    @Req() req: Request & { user: AuthUser },
    @Param() params: WorkoutScheduleIdParam,
  ): Promise<void> {
    return this.service.delete(req, params.id);
  }
}

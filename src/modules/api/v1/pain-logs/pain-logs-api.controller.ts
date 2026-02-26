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
  Put,
  Query,
  Req,
  Version,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { type Request } from 'express';
import { ErrorResponse } from 'src/lib/http/dto/error-response.dto';
import { AuthUser } from 'src/modules/auth/types/authenticated-user';

import { PainLogsApiService } from './pain-logs-api.service';
import {
  BatchCreatePainLogsBody,
  CreatePainLogBody,
  ListPainLogsQuery,
  PainLogIdParam,
  UpdatePainLogBody,
  WorkoutExecutionIdParam,
} from './request.dto';
import { PainLogListResponse, PainLogResponse } from './response.dto';

@ApiTags('pain-logs')
@ApiBearerAuth('JWT')
@Controller('pain-logs')
export class PainLogsApiController {
  constructor(private readonly service: PainLogsApiService) {}

  @Version('1')
  @ApiOperation({ summary: 'List pain logs for authenticated user' })
  @ApiResponse({ status: HttpStatus.OK, type: PainLogListResponse })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @Get()
  async list(
    @Req() req: Request & { user: AuthUser },
    @Query() query: ListPainLogsQuery,
  ): Promise<PainLogListResponse> {
    return this.service.list(req, query);
  }

  @Version('1')
  @ApiOperation({ summary: 'Get pain logs for a specific workout execution' })
  @ApiResponse({ status: HttpStatus.OK, type: PainLogListResponse })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, type: ErrorResponse, description: 'Workout execution not found' })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @Get('execution/:workoutExecutionId')
  async getByWorkoutExecution(
    @Req() req: Request & { user: AuthUser },
    @Param() params: WorkoutExecutionIdParam,
  ): Promise<PainLogListResponse> {
    return this.service.getByWorkoutExecution(req, params.workoutExecutionId);
  }

  @Version('1')
  @ApiOperation({ summary: 'Get pain log by ID' })
  @ApiResponse({ status: HttpStatus.OK, type: PainLogResponse })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, type: ErrorResponse, description: 'Not found' })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @Get(':id')
  async getById(@Req() req: Request & { user: AuthUser }, @Param() params: PainLogIdParam): Promise<PainLogResponse> {
    return this.service.getById(req, params.id);
  }

  @Version('1')
  @ApiOperation({ summary: 'Create a pain log' })
  @ApiResponse({ status: HttpStatus.CREATED, type: PainLogResponse })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, type: ErrorResponse, description: 'Workout execution not found' })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @Post()
  async create(@Req() req: Request & { user: AuthUser }, @Body() body: CreatePainLogBody): Promise<PainLogResponse> {
    return this.service.create(req, body);
  }

  @Version('1')
  @ApiOperation({ summary: 'Batch create/replace pain logs for a workout execution' })
  @ApiResponse({ status: HttpStatus.OK, type: PainLogListResponse })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, type: ErrorResponse, description: 'Workout execution not found' })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @Put('execution')
  async batchCreate(
    @Req() req: Request & { user: AuthUser },
    @Body() body: BatchCreatePainLogsBody,
  ): Promise<PainLogListResponse> {
    return this.service.batchCreate(req, body);
  }

  @Version('1')
  @ApiOperation({ summary: 'Update a pain log' })
  @ApiResponse({ status: HttpStatus.OK, type: PainLogResponse })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, type: ErrorResponse, description: 'Not found' })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, type: ErrorResponse, description: 'Access denied' })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @Patch(':id')
  async update(
    @Req() req: Request & { user: AuthUser },
    @Param() params: PainLogIdParam,
    @Body() body: UpdatePainLogBody,
  ): Promise<PainLogResponse> {
    return this.service.update(req, params.id, body);
  }

  @Version('1')
  @ApiOperation({ summary: 'Delete a pain log' })
  @ApiResponse({ status: HttpStatus.NO_CONTENT })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, type: ErrorResponse, description: 'Not found' })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, type: ErrorResponse, description: 'Access denied' })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete(':id')
  async delete(@Req() req: Request & { user: AuthUser }, @Param() params: PainLogIdParam): Promise<void> {
    return this.service.delete(req, params.id);
  }
}

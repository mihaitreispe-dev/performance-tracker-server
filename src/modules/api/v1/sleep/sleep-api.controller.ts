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
  CreateSleepLogBody,
  ListSleepLogsQuery,
  SetPrimarySleepSourceBody,
  SleepLogDateParam,
  SleepLogIdParam,
  UpdateSleepLogBody,
} from './request.dto';
import { DailySleepSummaryResponse, SleepLogListResponse, SleepLogResponse } from './response.dto';
import { SleepApiService } from './sleep-api.service';

@ApiTags('sleep-logs')
@ApiBearerAuth('JWT')
@Controller('sleep-logs')
export class SleepApiController {
  constructor(private readonly service: SleepApiService) {}

  @Version('1')
  @ApiOperation({ summary: 'List sleep logs for authenticated user' })
  @ApiResponse({ status: HttpStatus.OK, type: SleepLogListResponse })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @Get()
  async list(
    @Req() req: Request & { user: AuthUser },
    @Query() query: ListSleepLogsQuery,
  ): Promise<SleepLogListResponse> {
    return this.service.list(req, query);
  }

  @Version('1')
  @ApiOperation({ summary: 'Get sleep logs for a specific date' })
  @ApiResponse({ status: HttpStatus.OK, type: SleepLogListResponse })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @Get('date/:date')
  async getByDate(
    @Req() req: Request & { user: AuthUser },
    @Param() params: SleepLogDateParam,
  ): Promise<SleepLogListResponse> {
    return this.service.getByDate(req, params.date);
  }

  @Version('1')
  @ApiOperation({ summary: 'Get daily sleep summary with all sources' })
  @ApiResponse({ status: HttpStatus.OK, type: DailySleepSummaryResponse })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @Get('daily/:date')
  async getDailySummary(
    @Req() req: Request & { user: AuthUser },
    @Param() params: SleepLogDateParam,
  ): Promise<DailySleepSummaryResponse> {
    return this.service.getDailySummary(req, params.date);
  }

  @Version('1')
  @ApiOperation({ summary: 'Set primary sleep data source' })
  @ApiResponse({ status: HttpStatus.NO_CONTENT })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, type: ErrorResponse, description: 'Unknown provider' })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('primary-source')
  async setPrimarySleepSource(
    @Req() req: Request & { user: AuthUser },
    @Body() body: SetPrimarySleepSourceBody,
  ): Promise<void> {
    return this.service.setPrimarySleepSource(req, body.provider);
  }

  @Version('1')
  @ApiOperation({ summary: 'Get sleep log by ID' })
  @ApiResponse({ status: HttpStatus.OK, type: SleepLogResponse })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, type: ErrorResponse, description: 'Not found' })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @Get(':id')
  async getById(@Req() req: Request & { user: AuthUser }, @Param() params: SleepLogIdParam): Promise<SleepLogResponse> {
    return this.service.getById(req, params.id);
  }

  @Version('1')
  @ApiOperation({ summary: 'Create a manual sleep log' })
  @ApiResponse({ status: HttpStatus.CREATED, type: SleepLogResponse })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @Post()
  async create(@Req() req: Request & { user: AuthUser }, @Body() body: CreateSleepLogBody): Promise<SleepLogResponse> {
    return this.service.create(req, body);
  }

  @Version('1')
  @ApiOperation({ summary: 'Update a manual sleep log' })
  @ApiResponse({ status: HttpStatus.OK, type: SleepLogResponse })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, type: ErrorResponse, description: 'Not found' })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, type: ErrorResponse, description: 'Cannot edit non-manual logs' })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @Patch(':id')
  async update(
    @Req() req: Request & { user: AuthUser },
    @Param() params: SleepLogIdParam,
    @Body() body: UpdateSleepLogBody,
  ): Promise<SleepLogResponse> {
    return this.service.update(req, params.id, body);
  }

  @Version('1')
  @ApiOperation({ summary: 'Delete a manual sleep log' })
  @ApiResponse({ status: HttpStatus.NO_CONTENT })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, type: ErrorResponse, description: 'Not found' })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, type: ErrorResponse, description: 'Cannot delete non-manual logs' })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete(':id')
  async delete(@Req() req: Request & { user: AuthUser }, @Param() params: SleepLogIdParam): Promise<void> {
    return this.service.delete(req, params.id);
  }
}

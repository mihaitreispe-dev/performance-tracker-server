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
import { UserRole } from 'src/database/interfaces';
import { ErrorResponse } from 'src/lib/http/dto/error-response.dto';
import { Roles } from 'src/modules/auth/decorators/roles.decorator';
import { AuthUser } from 'src/modules/auth/types/authenticated-user';

import {
  CreateScheduledPromptBody,
  ListScheduledPromptsQuery,
  ScheduledPromptIdParam,
  UpdateScheduledPromptBody,
} from './request.dto';
import { ScheduledPromptListResponse, ScheduledPromptResponse, SendNowResponse } from './response.dto';
import { ScheduledPromptsService } from './scheduled-prompts.service';

@ApiTags('coaching/scheduled-prompts')
@ApiBearerAuth('JWT')
@Controller('coaching/scheduled-prompts')
export class ScheduledPromptsController {
  constructor(private readonly service: ScheduledPromptsService) {}

  @Version('1')
  @ApiOperation({ summary: 'Create a scheduled prompt (COACH only)' })
  @ApiResponse({ status: HttpStatus.CREATED, type: ScheduledPromptResponse })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, type: ErrorResponse, description: 'Not a coach' })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, type: ErrorResponse, description: 'Invalid request' })
  @Roles(UserRole.COACH)
  @Post()
  async create(
    @Req() req: Request & { user: AuthUser },
    @Body() body: CreateScheduledPromptBody,
  ): Promise<ScheduledPromptResponse> {
    return this.service.create(req, body);
  }

  @Version('1')
  @ApiOperation({ summary: 'List scheduled prompts (COACH only)' })
  @ApiResponse({ status: HttpStatus.OK, type: ScheduledPromptListResponse })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, type: ErrorResponse, description: 'Not a coach' })
  @Roles(UserRole.COACH)
  @Get()
  async list(
    @Req() req: Request & { user: AuthUser },
    @Query() query: ListScheduledPromptsQuery,
  ): Promise<ScheduledPromptListResponse> {
    return this.service.list(req, query);
  }

  @Version('1')
  @ApiOperation({ summary: 'Get a scheduled prompt by ID (COACH only)' })
  @ApiResponse({ status: HttpStatus.OK, type: ScheduledPromptResponse })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, type: ErrorResponse, description: 'Not a coach or not owner' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, type: ErrorResponse, description: 'Not found' })
  @Roles(UserRole.COACH)
  @Get(':id')
  async getById(
    @Req() req: Request & { user: AuthUser },
    @Param() params: ScheduledPromptIdParam,
  ): Promise<ScheduledPromptResponse> {
    return this.service.getById(req, params.id);
  }

  @Version('1')
  @ApiOperation({ summary: 'Update a scheduled prompt (COACH only)' })
  @ApiResponse({ status: HttpStatus.OK, type: ScheduledPromptResponse })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, type: ErrorResponse, description: 'Not a coach or not owner' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, type: ErrorResponse, description: 'Not found' })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, type: ErrorResponse, description: 'Invalid request' })
  @Roles(UserRole.COACH)
  @Patch(':id')
  async update(
    @Req() req: Request & { user: AuthUser },
    @Param() params: ScheduledPromptIdParam,
    @Body() body: UpdateScheduledPromptBody,
  ): Promise<ScheduledPromptResponse> {
    return this.service.update(req, params.id, body);
  }

  @Version('1')
  @ApiOperation({ summary: 'Delete a scheduled prompt (COACH only)' })
  @ApiResponse({ status: HttpStatus.NO_CONTENT })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, type: ErrorResponse, description: 'Not a coach or not owner' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, type: ErrorResponse, description: 'Not found' })
  @Roles(UserRole.COACH)
  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete(':id')
  async delete(@Req() req: Request & { user: AuthUser }, @Param() params: ScheduledPromptIdParam): Promise<void> {
    return this.service.delete(req, params.id);
  }

  @Version('1')
  @ApiOperation({ summary: 'Enable a scheduled prompt (COACH only)' })
  @ApiResponse({ status: HttpStatus.OK, type: ScheduledPromptResponse })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, type: ErrorResponse, description: 'Not a coach or not owner' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, type: ErrorResponse, description: 'Not found' })
  @Roles(UserRole.COACH)
  @Post(':id/enable')
  async enable(
    @Req() req: Request & { user: AuthUser },
    @Param() params: ScheduledPromptIdParam,
  ): Promise<ScheduledPromptResponse> {
    return this.service.enable(req, params.id);
  }

  @Version('1')
  @ApiOperation({ summary: 'Disable a scheduled prompt (COACH only)' })
  @ApiResponse({ status: HttpStatus.OK, type: ScheduledPromptResponse })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, type: ErrorResponse, description: 'Not a coach or not owner' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, type: ErrorResponse, description: 'Not found' })
  @Roles(UserRole.COACH)
  @Post(':id/disable')
  async disable(
    @Req() req: Request & { user: AuthUser },
    @Param() params: ScheduledPromptIdParam,
  ): Promise<ScheduledPromptResponse> {
    return this.service.disable(req, params.id);
  }

  @Version('1')
  @ApiOperation({ summary: 'Send a scheduled prompt immediately (COACH only)' })
  @ApiResponse({ status: HttpStatus.OK, type: SendNowResponse })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, type: ErrorResponse, description: 'Not a coach or not owner' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, type: ErrorResponse, description: 'Not found' })
  @Roles(UserRole.COACH)
  @Post(':id/send-now')
  async sendNow(
    @Req() req: Request & { user: AuthUser },
    @Param() params: ScheduledPromptIdParam,
  ): Promise<SendNowResponse> {
    return this.service.sendNow(req, params.id);
  }
}

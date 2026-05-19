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
import { UserRole } from 'src/database/interfaces';
import { ErrorResponse } from 'src/lib/http/dto/error-response.dto';
import { Roles } from 'src/modules/auth/decorators/roles.decorator';
import { AuthUser } from 'src/modules/auth/types/authenticated-user';

import { ExercisesApiService } from './exercises-api.service';
import {
  CreateExerciseBody,
  ImportExerciseFromVimeoBody,
  ExerciseIdParam,
  ListExercisesQuery,
  UpdateExerciseBody,
  UpdateExerciseChainBody,
} from './request.dto';
import {
  ExerciseChainResponse,
  ExerciseListResponse,
  ExerciseResponse,
  ExerciseUploadUrlResponse,
} from './response.dto';

@ApiTags('exercises')
@ApiBearerAuth('JWT')
@Controller('exercises')
export class ExercisesApiController {
  constructor(private readonly service: ExercisesApiService) {}

  @Version('1')
  @ApiOperation({ summary: 'List exercises (available to all authenticated users)' })
  @ApiResponse({ status: HttpStatus.OK, type: ExerciseListResponse })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @Get()
  async list(
    @Req() req: Request & { user: AuthUser },
    @Query() query: ListExercisesQuery,
  ): Promise<ExerciseListResponse> {
    return this.service.list(req, query);
  }

  @Version('1')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Get exercise by ID (admin only)' })
  @ApiResponse({ status: HttpStatus.OK, type: ExerciseResponse })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, type: ErrorResponse, description: 'Forbidden' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, type: ErrorResponse, description: 'Not found' })
  @Get(':id')
  async getById(@Req() req: Request & { user: AuthUser }, @Param() params: ExerciseIdParam): Promise<ExerciseResponse> {
    return this.service.getById(req, params.id);
  }

  @Version('1')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Create exercise (admin only)' })
  @ApiResponse({ status: HttpStatus.CREATED, type: ExerciseResponse })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, type: ErrorResponse, description: 'Forbidden' })
  @Post()
  async create(@Req() req: Request & { user: AuthUser }, @Body() body: CreateExerciseBody): Promise<ExerciseResponse> {
    return this.service.create(req, body);
  }

  @Version('1')
  @Roles(UserRole.ADMIN)
  @ApiOperation({
    summary: 'Create exercise from a Vimeo source (admin only). Returns immediately; status moves through UPLOAD_PENDING → UPLOAD_DONE asynchronously.',
  })
  @ApiResponse({ status: HttpStatus.CREATED, type: ExerciseResponse })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, type: ErrorResponse, description: 'Forbidden' })
  @ApiResponse({ status: HttpStatus.UNPROCESSABLE_ENTITY, type: ErrorResponse, description: 'Vimeo error (bad URL, no access, no progressive renditions)' })
  @Post('from-vimeo')
  async importFromVimeo(
    @Req() req: Request & { user: AuthUser },
    @Body() body: ImportExerciseFromVimeoBody,
  ): Promise<ExerciseResponse> {
    return this.service.importFromVimeo(req, body);
  }

  @Version('1')
  @Roles(UserRole.ADMIN)
  @ApiOperation({
    summary: 'Retry a previously-failed Vimeo import (admin only). Re-fetches rendition links and restarts the background streaming task.',
  })
  @ApiResponse({ status: HttpStatus.OK, type: ExerciseResponse })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, type: ErrorResponse, description: 'Forbidden' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, type: ErrorResponse, description: 'Not found' })
  @ApiResponse({
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    type: ErrorResponse,
    description: 'Exercise was not imported from Vimeo or Vimeo fetch failed',
  })
  @Post(':id/retry-vimeo')
  async retryVimeoImport(
    @Req() req: Request & { user: AuthUser },
    @Param() params: ExerciseIdParam,
  ): Promise<ExerciseResponse> {
    return this.service.retryVimeoImport(req, params.id);
  }

  @Version('1')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Update exercise (admin only)' })
  @ApiResponse({ status: HttpStatus.OK, type: ExerciseResponse })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, type: ErrorResponse, description: 'Forbidden' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, type: ErrorResponse, description: 'Not found' })
  @Patch(':id')
  async update(
    @Req() req: Request & { user: AuthUser },
    @Param() params: ExerciseIdParam,
    @Body() body: UpdateExerciseBody,
  ): Promise<ExerciseResponse> {
    return this.service.update(req, params.id, body);
  }

  @Version('1')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Get exercise video upload URL (admin only)' })
  @ApiResponse({ status: HttpStatus.OK, type: ExerciseUploadUrlResponse })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, type: ErrorResponse, description: 'Forbidden' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, type: ErrorResponse, description: 'Not found' })
  @Get(':id/upload-url')
  async getUploadUrl(
    @Req() req: Request & { user: AuthUser },
    @Param() params: ExerciseIdParam,
  ): Promise<ExerciseUploadUrlResponse> {
    return this.service.getUploadUrl(req, params);
  }

  @Version('1')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Mark exercise video upload as complete (admin only)' })
  @ApiResponse({ status: HttpStatus.OK, type: ExerciseResponse })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, type: ErrorResponse, description: 'Forbidden' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, type: ErrorResponse, description: 'Not found' })
  @Post(':id/upload-completion')
  async markUploadComplete(
    @Req() req: Request & { user: AuthUser },
    @Param() params: ExerciseIdParam,
  ): Promise<ExerciseResponse> {
    return this.service.markUploadComplete(req, params);
  }

  @Version('1')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Delete exercise (admin only)' })
  @ApiResponse({ status: HttpStatus.NO_CONTENT })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, type: ErrorResponse, description: 'Forbidden' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, type: ErrorResponse, description: 'Not found' })
  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete(':id')
  async delete(@Req() req: Request & { user: AuthUser }, @Param() params: ExerciseIdParam): Promise<void> {
    return this.service.delete(req, params.id);
  }

  @Version('1')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Get exercise progression chain (admin only)' })
  @ApiResponse({ status: HttpStatus.OK, type: ExerciseChainResponse })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, type: ErrorResponse, description: 'Forbidden' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, type: ErrorResponse, description: 'Not found' })
  @Get(':id/chain')
  async getChain(
    @Req() req: Request & { user: AuthUser },
    @Param() params: ExerciseIdParam,
  ): Promise<ExerciseChainResponse | null> {
    return this.service.getExerciseChain(req, params.id);
  }

  @Version('1')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Update exercise progression chain (admin only)' })
  @ApiResponse({ status: HttpStatus.OK, type: ExerciseChainResponse })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, type: ErrorResponse, description: 'Forbidden' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, type: ErrorResponse, description: 'Not found' })
  @Put(':id/chain')
  async updateChain(
    @Req() req: Request & { user: AuthUser },
    @Param() params: ExerciseIdParam,
    @Body() body: UpdateExerciseChainBody,
  ): Promise<ExerciseChainResponse> {
    return this.service.updateExerciseChain(req, params.id, body);
  }

  @Version('1')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Remove exercise from its chain (admin only)' })
  @ApiResponse({ status: HttpStatus.NO_CONTENT })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, type: ErrorResponse, description: 'Forbidden' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, type: ErrorResponse, description: 'Not found' })
  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete(':id/chain')
  async removeFromChain(@Req() req: Request & { user: AuthUser }, @Param() params: ExerciseIdParam): Promise<void> {
    return this.service.removeFromChain(req, params.id);
  }
}

import { Body, Controller, Get, HttpStatus, Param, Post, Req, Version } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { type Request } from 'express';
import { ErrorResponse } from 'src/lib/http/dto/error-response.dto';
import { AuthUser } from 'src/modules/auth/types/authenticated-user';

import { RequestUploadBody, WorkoutFileImportIdParam } from './request.dto';
import { WorkoutFileUploadResultResponse, WorkoutFileUploadUrlResponse } from './response.dto';
import { WorkoutFileImportsApiService } from './workout-file-imports-api.service';

@ApiTags('workout-executions')
@ApiBearerAuth('JWT')
@Controller('workout-executions/import')
export class WorkoutFileImportsApiController {
  constructor(private readonly service: WorkoutFileImportsApiService) {}

  @Version('1')
  @ApiOperation({ summary: 'Request a presigned URL for uploading a workout file' })
  @ApiResponse({ status: HttpStatus.CREATED, type: WorkoutFileUploadUrlResponse })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @Post('request-upload')
  async requestUpload(
    @Req() req: Request & { user: AuthUser },
    @Body() body: RequestUploadBody,
  ): Promise<WorkoutFileUploadUrlResponse> {
    return this.service.requestUpload(req, body);
  }

  @Version('1')
  @ApiOperation({ summary: 'Notify that a workout file upload to S3 is complete' })
  @ApiResponse({ status: HttpStatus.OK, type: WorkoutFileUploadResultResponse })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, type: ErrorResponse, description: 'Import not found' })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @Post(':id/complete')
  async notifyUploadComplete(
    @Req() req: Request & { user: AuthUser },
    @Param() params: WorkoutFileImportIdParam,
  ): Promise<WorkoutFileUploadResultResponse> {
    return this.service.notifyUploadComplete(req, params.id);
  }

  @Version('1')
  @ApiOperation({ summary: 'Get the status of a workout file import' })
  @ApiResponse({ status: HttpStatus.OK, type: WorkoutFileUploadResultResponse })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, type: ErrorResponse, description: 'Import not found' })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @Get(':id/status')
  async getUploadStatus(
    @Req() req: Request & { user: AuthUser },
    @Param() params: WorkoutFileImportIdParam,
  ): Promise<WorkoutFileUploadResultResponse> {
    return this.service.getUploadStatus(req, params.id);
  }
}

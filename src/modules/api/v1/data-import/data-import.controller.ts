import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, Req, Version } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { type Request } from 'express';
import { ErrorResponse } from 'src/lib/http/dto/error-response.dto';
import { AuthUser } from 'src/modules/auth/types/authenticated-user';

import { DataImportService } from './data-import.service';
import { ConfirmUploadBody, RequestUploadUrlBody, StartProcessingBody } from './request.dto';
import { DataImportJobListResponse, DataImportJobResponse, RequestUploadUrlResponse } from './response.dto';

@ApiTags('data-import')
@Controller('data-import')
export class DataImportController {
  constructor(private readonly service: DataImportService) {}

  @Version('1')
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Request a presigned URL to upload an archive' })
  @ApiResponse({ status: HttpStatus.OK, type: RequestUploadUrlResponse })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, type: ErrorResponse, description: 'Rate limit exceeded' })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @Post('request-upload')
  async requestUploadUrl(
    @Req() req: Request & { user: AuthUser },
    @Body() body: RequestUploadUrlBody,
  ): Promise<RequestUploadUrlResponse> {
    return this.service.requestUploadUrl(req, body);
  }

  @Version('1')
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Confirm that archive upload is complete' })
  @ApiResponse({ status: HttpStatus.OK, type: DataImportJobResponse })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, type: ErrorResponse, description: 'Job not found' })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, type: ErrorResponse, description: 'File not found or invalid state' })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @Post('confirm-upload')
  async confirmUpload(
    @Req() req: Request & { user: AuthUser },
    @Body() body: ConfirmUploadBody,
  ): Promise<DataImportJobResponse> {
    return this.service.confirmUpload(req, body);
  }

  @Version('1')
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Start processing the uploaded archive' })
  @ApiResponse({ status: HttpStatus.OK, type: DataImportJobResponse })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, type: ErrorResponse, description: 'Job not found' })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, type: ErrorResponse, description: 'Invalid state' })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @Post('start-processing')
  async startProcessing(
    @Req() req: Request & { user: AuthUser },
    @Body() body: StartProcessingBody,
  ): Promise<DataImportJobResponse> {
    return this.service.startProcessing(req, body);
  }

  @Version('1')
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Get import job status' })
  @ApiResponse({ status: HttpStatus.OK, type: DataImportJobResponse })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, type: ErrorResponse, description: 'Job not found' })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @Get('jobs/:jobId')
  async getJob(
    @Req() req: Request & { user: AuthUser },
    @Param('jobId') jobId: string,
  ): Promise<DataImportJobResponse> {
    return this.service.getJob(req, jobId);
  }

  @Version('1')
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'List all import jobs for the user' })
  @ApiResponse({ status: HttpStatus.OK, type: DataImportJobListResponse })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @Get('jobs')
  async listJobs(@Req() req: Request & { user: AuthUser }): Promise<DataImportJobListResponse> {
    return this.service.listJobs(req);
  }

  @Version('1')
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Cancel an import job' })
  @ApiResponse({ status: HttpStatus.NO_CONTENT })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, type: ErrorResponse, description: 'Job not found' })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, type: ErrorResponse, description: 'Cannot cancel' })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete('jobs/:jobId')
  async cancelJob(@Req() req: Request & { user: AuthUser }, @Param('jobId') jobId: string): Promise<void> {
    return this.service.cancelJob(req, jobId);
  }
}

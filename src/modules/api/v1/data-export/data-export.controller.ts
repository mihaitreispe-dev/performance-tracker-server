import { Body, Controller, Get, HttpStatus, Param, Post, Req, UseGuards, Version } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { type Request } from 'express';
import { RateLimit, RateLimitGuard, RateLimitPresets } from 'src/lib/guards/rate-limit.guard';
import { ErrorResponse } from 'src/lib/http/dto/error-response.dto';
import { AuthUser } from 'src/modules/auth/types/authenticated-user';

import { DataExportService } from './data-export.service';
import { RequestExportBody } from './request.dto';
import { DataExportJobListResponse, DataExportJobResponse, DownloadUrlResponse } from './response.dto';

@ApiTags('data-export')
@Controller('data-export')
export class DataExportController {
  constructor(private readonly service: DataExportService) {}

  @Version('1')
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Request a data export' })
  @ApiResponse({ status: HttpStatus.OK, type: DataExportJobResponse })
  @ApiResponse({ status: HttpStatus.TOO_MANY_REQUESTS, type: ErrorResponse, description: 'Rate limit exceeded' })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @UseGuards(RateLimitGuard)
  @RateLimit(RateLimitPresets.EXPORT)
  @Post('request')
  async requestExport(
    @Req() req: Request & { user: AuthUser },
    @Body() body: RequestExportBody,
  ): Promise<DataExportJobResponse> {
    return this.service.requestExport(req, body);
  }

  @Version('1')
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Get export job status' })
  @ApiResponse({ status: HttpStatus.OK, type: DataExportJobResponse })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, type: ErrorResponse, description: 'Job not found' })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @Get('jobs/:jobId')
  async getJob(
    @Req() req: Request & { user: AuthUser },
    @Param('jobId') jobId: string,
  ): Promise<DataExportJobResponse> {
    return this.service.getJob(req, jobId);
  }

  @Version('1')
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'List all export jobs for the user' })
  @ApiResponse({ status: HttpStatus.OK, type: DataExportJobListResponse })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @Get('jobs')
  async listJobs(@Req() req: Request & { user: AuthUser }): Promise<DataExportJobListResponse> {
    return this.service.listJobs(req);
  }

  @Version('1')
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Get download URL for completed export' })
  @ApiResponse({ status: HttpStatus.OK, type: DownloadUrlResponse })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, type: ErrorResponse, description: 'Job not found' })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, type: ErrorResponse, description: 'Export not ready or expired' })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @Get('jobs/:jobId/download')
  async getDownloadUrl(
    @Req() req: Request & { user: AuthUser },
    @Param('jobId') jobId: string,
  ): Promise<DownloadUrlResponse> {
    return this.service.getDownloadUrl(req, jobId);
  }
}

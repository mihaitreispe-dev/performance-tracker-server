import { Body, Controller, Get, HttpStatus, Param, Patch, Post, Query, Req, Version } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

import { ErrorResponse } from 'src/lib/http/dto/error-response.dto';
import type { AuthedRequest } from 'src/modules/auth/types/request-with-active-org';

import {
  EditTranslationBody,
  RequestTranslationBody,
  SetReviewStatusBody,
  TranslationIdParam,
  TranslationTargetQuery,
} from './request.dto';
import { TranslationListResponse, TranslationResponse } from './response.dto';
import { TranslationsApiService } from './translations-api.service';

@ApiTags('translations')
@ApiBearerAuth('JWT')
@Controller('translations')
export class TranslationsApiController {
  constructor(private readonly service: TranslationsApiService) {}

  @Version('1')
  @ApiOperation({ summary: 'Request machine translation of a voice-over / intro into one or more languages' })
  @ApiResponse({ status: HttpStatus.CREATED, type: TranslationListResponse })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, type: ErrorResponse })
  @ApiResponse({ status: HttpStatus.SERVICE_UNAVAILABLE, type: ErrorResponse, description: 'Translation disabled' })
  @Post()
  async request(@Req() req: AuthedRequest, @Body() body: RequestTranslationBody): Promise<TranslationListResponse> {
    return this.service.request(req, body);
  }

  @Version('1')
  @ApiOperation({ summary: 'List translations for a target (exercise voice-over / intro / content item)' })
  @ApiResponse({ status: HttpStatus.OK, type: TranslationListResponse })
  @Get()
  async list(@Req() req: AuthedRequest, @Query() query: TranslationTargetQuery): Promise<TranslationListResponse> {
    return this.service.list(req, query.targetType, query.targetId);
  }

  @Version('1')
  @ApiOperation({ summary: 'Edit the reviewed translated text (moves it to in_review)' })
  @ApiResponse({ status: HttpStatus.OK, type: TranslationResponse })
  @Patch(':id')
  async edit(
    @Req() req: AuthedRequest,
    @Param() params: TranslationIdParam,
    @Body() body: EditTranslationBody,
  ): Promise<TranslationResponse> {
    return this.service.edit(req, params.id, body);
  }

  @Version('1')
  @ApiOperation({ summary: 'Set review status (in_review / approved / published). Publishing renders the caption track.' })
  @ApiResponse({ status: HttpStatus.OK, type: TranslationResponse })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, type: ErrorResponse })
  @Post(':id/status')
  async setStatus(
    @Req() req: AuthedRequest,
    @Param() params: TranslationIdParam,
    @Body() body: SetReviewStatusBody,
  ): Promise<TranslationResponse> {
    return this.service.setStatus(req, params.id, body);
  }
}

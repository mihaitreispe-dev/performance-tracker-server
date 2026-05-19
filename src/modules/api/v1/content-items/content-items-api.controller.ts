import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiNoContentResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/modules/auth/guards/jwt-auth.guard';
import type { AuthedRequest } from 'src/modules/auth/types/request-with-active-org';

import { ContentItemsApiService } from './content-items-api.service';
import {
  ContentItemIdParam,
  CreateContentItemDto,
  ListContentItemsQuery,
  UpdateContentItemDto,
} from './request.dto';
import {
  ContentItemResponse,
  ContentItemsListResponse,
  CreateContentItemResponse,
} from './response.dto';

@ApiTags('Content Items')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('content-items')
export class ContentItemsApiController {
  constructor(private readonly contentItemsService: ContentItemsApiService) {}

  @Get()
  @ApiOperation({ summary: 'List content items in the active organisation' })
  @ApiOkResponse({ type: ContentItemsListResponse })
  async list(
    @Req() req: AuthedRequest,
    @Query() query: ListContentItemsQuery,
  ): Promise<ContentItemsListResponse> {
    return this.contentItemsService.list(req, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Fetch a single content item' })
  @ApiOkResponse({ type: ContentItemResponse })
  async getById(
    @Req() req: AuthedRequest,
    @Param() params: ContentItemIdParam,
  ): Promise<ContentItemResponse> {
    return this.contentItemsService.getById(req, params.id);
  }

  @Post()
  @ApiOperation({
    summary: 'Create a content item. If videoMimeType is supplied, the response includes a presigned PUT upload URL.',
  })
  @ApiOkResponse({ type: CreateContentItemResponse })
  async create(
    @Req() req: AuthedRequest,
    @Body() dto: CreateContentItemDto,
  ): Promise<CreateContentItemResponse> {
    return this.contentItemsService.create(req, dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a content item' })
  @ApiOkResponse({ type: ContentItemResponse })
  async update(
    @Req() req: AuthedRequest,
    @Param() params: ContentItemIdParam,
    @Body() dto: UpdateContentItemDto,
  ): Promise<ContentItemResponse> {
    return this.contentItemsService.update(req, params.id, dto);
  }

  @Post(':id/upload-complete')
  @ApiOperation({
    summary: 'Mark the video upload as complete (verifies the S3 object exists, flips status to READY)',
  })
  @ApiOkResponse({ type: ContentItemResponse })
  async markUploadComplete(
    @Req() req: AuthedRequest,
    @Param() params: ContentItemIdParam,
  ): Promise<ContentItemResponse> {
    return this.contentItemsService.markUploadComplete(req, params.id);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a content item (and its uploaded video, best effort)' })
  @ApiNoContentResponse()
  async delete(@Req() req: AuthedRequest, @Param() params: ContentItemIdParam): Promise<void> {
    return this.contentItemsService.delete(req, params.id);
  }
}

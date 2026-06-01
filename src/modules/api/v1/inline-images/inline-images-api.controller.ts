import {
  Body,
  Controller,
  Get,
  HttpStatus,
  Param,
  Post,
  Req,
  Res,
  UseGuards,
  Version,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { DisableJwtAuthGuard, JwtAuthGuard } from 'src/modules/auth/guards/jwt-auth.guard';
import type { AuthedRequest } from 'src/modules/auth/types/request-with-active-org';

import { InlineImagesApiService } from './inline-images-api.service';
import { RequestInlineImageUploadDto } from './request.dto';
import { RequestInlineImageUploadResponse } from './response.dto';

@ApiTags('inline-images')
@Controller('inline-images')
@UseGuards(JwtAuthGuard)
export class InlineImagesApiController {
  constructor(private readonly service: InlineImagesApiService) {}

  @Version('1')
  @Post('request-upload')
  @ApiOperation({
    summary: 'Mint an upload slot for an inline image embedded in a rich-text description.',
  })
  @ApiResponse({ status: HttpStatus.OK, type: RequestInlineImageUploadResponse })
  async requestUpload(
    @Req() req: AuthedRequest,
    @Body() dto: RequestInlineImageUploadDto,
  ): Promise<RequestInlineImageUploadResponse> {
    return this.service.requestUpload(req, dto);
  }

  @Version('1')
  @Get(':id/view')
  @ApiOperation({
    summary:
      'Stable image proxy. Resolves a stored inline-image id to a freshly-signed S3 URL and ' +
      '302-redirects, so HTML with `<img src="${API}/v1/inline-images/${id}/view">` keeps ' +
      'working past S3 signature expiry. Unauthenticated by design — the URL is the capability.',
  })
  @DisableJwtAuthGuard()
  async view(@Param('id') id: string, @Res() res: Response): Promise<void> {
    const url = await this.service.resolveViewUrl(id);
    // Browser-side image caches will treat each redirect target as a
    // separate resource (different query string each time), so cache
    // hints on the 302 itself don't help. Keep the redirect short-lived
    // so a leaked URL stops working quickly if the row is deleted.
    res.setHeader('Cache-Control', 'no-store');
    res.redirect(302, url);
  }
}

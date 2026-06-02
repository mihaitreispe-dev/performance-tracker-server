import { Body, Controller, HttpCode, HttpStatus, Post, Req, Version } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { type Request } from 'express';
import { ErrorResponse } from 'src/lib/http/dto/error-response.dto';
import { AuthUser } from 'src/modules/auth/types/authenticated-user';
import { SkipActiveOrg } from 'src/modules/auth/guards/active-org.guard';

import { PlayerTelemetryApiService } from './player-telemetry-api.service';
import { IngestPlayerTelemetryDto } from './request.dto';

/**
 * Bulk ingest for player telemetry (spec F2). The endpoint is
 * `SkipActiveOrg` because some events fire before the active org is
 * picked (e.g. cast attempt from the org-switcher screen). When an
 * org IS present the service stamps it on the row; otherwise we
 * leave organisation_id null.
 *
 * 204 No Content because the client is fire-and-forget — no body to
 * return.
 */
@ApiTags('player-telemetry')
@ApiBearerAuth('JWT')
@Controller('player-telemetry')
@SkipActiveOrg()
export class PlayerTelemetryApiController {
  constructor(private readonly service: PlayerTelemetryApiService) {}

  @Version('1')
  @ApiOperation({ summary: 'Bulk-ingest player QoE / funnel / logging events' })
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Events accepted' })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @Post('events')
  @HttpCode(HttpStatus.NO_CONTENT)
  async ingest(
    @Req() req: Request & { user: AuthUser },
    @Body() body: IngestPlayerTelemetryDto,
  ): Promise<void> {
    await this.service.ingest(req, body);
  }
}

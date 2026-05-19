import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
  Req,
  Version,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { type Request } from 'express';
import { WearableProvider } from 'src/database/interfaces';
import { ErrorResponse } from 'src/lib/http/dto/error-response.dto';
import { DisableJwtAuthGuard } from 'src/modules/auth/guards/jwt-auth.guard';
import { SkipActiveOrg } from 'src/modules/auth/guards/active-org.guard';
import { AuthUser } from 'src/modules/auth/types/authenticated-user';

import {
  ConnectProviderQuery,
  GetActivityMetricsQuery,
  SetPrioritiesBody,
  TriggerSyncBody,
  WearableCallbackQuery,
} from './request.dto';
import {
  ActivityMetricsResponse,
  AvailableProvidersResponse,
  ConnectProviderResponse,
  SetPrioritiesResponse,
  SyncStatusResponse,
  TriggerSyncResponse,
  UserConnectionsResponse,
  UserPrioritiesResponse,
  WearableCallbackResponse,
} from './response.dto';
import { WearablesApiService } from './wearables-api.service';

@ApiTags('wearables')
@Controller('wearables')
@SkipActiveOrg()
export class WearablesApiController {
  constructor(private readonly service: WearablesApiService) {}

  @Version('1')
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'List available wearable providers' })
  @ApiResponse({ status: HttpStatus.OK, type: AvailableProvidersResponse })
  @Get('providers')
  async getAvailableProviders(): Promise<AvailableProvidersResponse> {
    return this.service.getAvailableProviders();
  }

  @Version('1')
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Get user wearable connections' })
  @ApiResponse({ status: HttpStatus.OK, type: UserConnectionsResponse })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse })
  @Get('connections')
  async getUserConnections(@Req() req: Request & { user: AuthUser }): Promise<UserConnectionsResponse> {
    return this.service.getUserConnections(req);
  }

  @Version('1')
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Connect a wearable provider' })
  @ApiResponse({ status: HttpStatus.OK, type: ConnectProviderResponse })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, type: ErrorResponse })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse })
  @Get('connect')
  async connectProvider(
    @Req() req: Request & { user: AuthUser },
    @Query() query: ConnectProviderQuery,
  ): Promise<ConnectProviderResponse> {
    return this.service.connectProvider(req, query);
  }

  @Version('1')
  @DisableJwtAuthGuard()
  @ApiOperation({ summary: 'OAuth callback from OpenWearables' })
  @ApiResponse({ status: HttpStatus.OK, type: WearableCallbackResponse })
  @Get('callback')
  async handleCallback(@Query() query: WearableCallbackQuery): Promise<WearableCallbackResponse> {
    return this.service.handleCallback(query);
  }

  @Version('1')
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Disconnect a wearable provider' })
  @ApiResponse({ status: HttpStatus.NO_CONTENT })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, type: ErrorResponse })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse })
  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete('connections/:provider')
  async disconnectProvider(
    @Req() req: Request & { user: AuthUser },
    @Param('provider') provider: WearableProvider,
  ): Promise<void> {
    return this.service.disconnectProvider(req, provider);
  }

  @Version('1')
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Get user provider priorities' })
  @ApiResponse({ status: HttpStatus.OK, type: UserPrioritiesResponse })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse })
  @Get('priorities')
  async getUserPriorities(@Req() req: Request & { user: AuthUser }): Promise<UserPrioritiesResponse> {
    return this.service.getUserPriorities(req);
  }

  @Version('1')
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Set provider priorities for a category' })
  @ApiResponse({ status: HttpStatus.OK, type: SetPrioritiesResponse })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, type: ErrorResponse })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse })
  @Put('priorities')
  async setPriorities(
    @Req() req: Request & { user: AuthUser },
    @Body() body: SetPrioritiesBody,
  ): Promise<SetPrioritiesResponse> {
    return this.service.setPriorities(req, body);
  }

  @Version('1')
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Trigger manual sync' })
  @ApiResponse({ status: HttpStatus.OK, type: TriggerSyncResponse })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, type: ErrorResponse })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse })
  @Post('sync')
  async triggerSync(
    @Req() req: Request & { user: AuthUser },
    @Body() body: TriggerSyncBody,
  ): Promise<TriggerSyncResponse> {
    return this.service.triggerSync(req, body);
  }

  @Version('1')
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Get sync status for all connected providers' })
  @ApiResponse({ status: HttpStatus.OK, type: SyncStatusResponse })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse })
  @Get('sync/status')
  async getSyncStatus(@Req() req: Request & { user: AuthUser }): Promise<SyncStatusResponse> {
    return this.service.getSyncStatus(req);
  }

  @Version('1')
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Get activity metrics (steps, calories, distance)' })
  @ApiResponse({ status: HttpStatus.OK, type: ActivityMetricsResponse })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse })
  @Get('activity')
  async getActivityMetrics(
    @Req() req: Request & { user: AuthUser },
    @Query() query: GetActivityMetricsQuery,
  ): Promise<ActivityMetricsResponse> {
    return this.service.getActivityMetrics(req, query);
  }
}

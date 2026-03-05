import {
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Req,
  Sse,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { Observable, filter, map } from 'rxjs';
import { JwtAuthGuard } from 'src/modules/auth/guards/jwt-auth.guard';
import { AuthUser } from 'src/modules/auth/types/authenticated-user';

import { NotificationsApiService, NotificationEvent } from './notifications-api.service';
import { ListNotificationsQuery, NotificationIdParam } from './request.dto';
import {
  NotificationResponse,
  NotificationsListResponse,
  UnreadCountResponse,
} from './response.dto';

@ApiTags('Notifications')
@ApiBearerAuth()
@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsApiController {
  constructor(private readonly notificationsService: NotificationsApiService) {}

  @Get()
  @ApiOperation({ summary: 'List notifications for current user' })
  async listNotifications(
    @Req() req: Request & { user: AuthUser },
    @Query() query: ListNotificationsQuery,
  ): Promise<NotificationsListResponse> {
    return this.notificationsService.listNotifications(req, query);
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'Get unread notification count' })
  async getUnreadCount(@Req() req: Request & { user: AuthUser }): Promise<UnreadCountResponse> {
    return this.notificationsService.getUnreadCount(req);
  }

  @Sse('stream')
  @ApiOperation({ summary: 'SSE stream for real-time notifications' })
  streamNotifications(
    @Req() req: Request & { user: AuthUser },
  ): Observable<MessageEvent> {
    const userId = req.user.id;

    return this.notificationsService.notificationStream.pipe(
      // Only send notifications for this user
      filter((event: NotificationEvent) => event.userId === userId),
      // Transform to SSE message format
      map((event: NotificationEvent) => ({
        data: JSON.stringify(event.notification),
      } as MessageEvent)),
    );
  }

  @Post(':id/read')
  @ApiOperation({ summary: 'Mark notification as read' })
  async markAsRead(
    @Req() req: Request & { user: AuthUser },
    @Param() params: NotificationIdParam,
  ): Promise<NotificationResponse> {
    return this.notificationsService.markAsRead(req, params.id);
  }

  @Post('read-all')
  @ApiOperation({ summary: 'Mark all notifications as read' })
  async markAllAsRead(@Req() req: Request & { user: AuthUser }): Promise<UnreadCountResponse> {
    return this.notificationsService.markAllAsRead(req);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a notification' })
  async deleteNotification(
    @Req() req: Request & { user: AuthUser },
    @Param() params: NotificationIdParam,
  ): Promise<void> {
    return this.notificationsService.deleteNotification(req, params.id);
  }
}

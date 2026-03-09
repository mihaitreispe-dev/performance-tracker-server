import { Injectable } from '@nestjs/common';
import { Request } from 'express';
import { Subject } from 'rxjs';
import { Notification, NotificationData, NotificationType } from 'src/database/interfaces';
import { AuthUser } from 'src/modules/auth/types/authenticated-user';
import { NotificationRepository } from 'src/repositories/notification.repository';
import { UserRepository } from 'src/repositories/user.repository';

import { ListNotificationsQuery } from './request.dto';
import { NotificationDTO, NotificationResponse, NotificationsListResponse, UnreadCountResponse } from './response.dto';

// SSE event emitter for real-time notifications
export interface NotificationEvent {
  userId: string;
  notification: NotificationDTO;
}

@Injectable()
export class NotificationsApiService {
  // Subject for SSE events
  private notificationSubject = new Subject<NotificationEvent>();

  constructor(
    private readonly notificationRepo: NotificationRepository,
    private readonly userRepo: UserRepository,
  ) {}

  // Observable for SSE subscribers
  get notificationStream() {
    return this.notificationSubject.asObservable();
  }

  async listNotifications(
    req: Request & { user: AuthUser },
    query: ListNotificationsQuery,
  ): Promise<NotificationsListResponse> {
    const userId = req.user.id;
    const limit = query.limit || 50;
    const offset = query.offset || 0;

    const [notifications, unreadCount] = await Promise.all([
      this.notificationRepo.findMany({ userId, unreadOnly: query.unreadOnly }, { limit, offset }),
      this.notificationRepo.countUnread(userId),
    ]);

    return {
      data: notifications.map((n) => this.mapToDTO(n)),
      unreadCount,
      totalCount: notifications.length,
    };
  }

  async getUnreadCount(req: Request & { user: AuthUser }): Promise<UnreadCountResponse> {
    const count = await this.notificationRepo.countUnread(req.user.id);
    return { unreadCount: count };
  }

  async markAsRead(req: Request & { user: AuthUser }, notificationId: string): Promise<NotificationResponse> {
    const notification = await this.notificationRepo.findById(notificationId);
    if (!notification || notification.user_id !== req.user.id) {
      throw new Error('Notification not found');
    }

    const updated = await this.notificationRepo.markAsRead(notificationId);
    return { data: this.mapToDTO(updated!) };
  }

  async markAllAsRead(req: Request & { user: AuthUser }): Promise<UnreadCountResponse> {
    await this.notificationRepo.markAllAsRead(req.user.id);
    return { unreadCount: 0 };
  }

  async deleteNotification(req: Request & { user: AuthUser }, notificationId: string): Promise<void> {
    const notification = await this.notificationRepo.findById(notificationId);
    if (!notification || notification.user_id !== req.user.id) {
      throw new Error('Notification not found');
    }
    await this.notificationRepo.deleteById(notificationId);
  }

  // Create a notification and emit SSE event
  async createNotification(
    userId: string,
    type: NotificationType,
    title: string,
    body?: string,
    data?: NotificationData,
  ): Promise<Notification> {
    const notification = await this.notificationRepo.create({
      user_id: userId,
      type,
      title,
      body: body || null,
      data: data || null,
    });

    // Emit SSE event
    this.notificationSubject.next({
      userId,
      notification: this.mapToDTO(notification),
    });

    return notification;
  }

  // Batch create notifications for multiple users
  async createNotifications(
    notifications: Array<{
      userId: string;
      type: NotificationType;
      title: string;
      body?: string;
      data?: NotificationData;
    }>,
  ): Promise<Notification[]> {
    const newNotifications = notifications.map((n) => ({
      user_id: n.userId,
      type: n.type,
      title: n.title,
      body: n.body || null,
      data: n.data || null,
    }));

    const created = await this.notificationRepo.createMany(newNotifications);

    // Emit SSE events for each notification
    for (const notification of created) {
      this.notificationSubject.next({
        userId: notification.user_id,
        notification: this.mapToDTO(notification),
      });
    }

    return created;
  }

  private mapToDTO(notification: Notification): NotificationDTO {
    return {
      id: notification.id,
      type: notification.type,
      title: notification.title,
      body: notification.body,
      data: notification.data,
      readAt: notification.read_at instanceof Date ? notification.read_at.toISOString() : notification.read_at,
      createdAt:
        notification.created_at instanceof Date
          ? notification.created_at.toISOString()
          : String(notification.created_at),
    };
  }
}

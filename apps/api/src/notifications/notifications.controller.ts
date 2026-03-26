import {
  Controller,
  ForbiddenException,
  Get,
  Param,
  Post,
  Req,
} from '@nestjs/common';
import { Request } from 'express';
import { KioskAllowed } from '../common/decorators/kiosk-allowed.decorator';
import { NotificationsService } from './notifications.service';

type RequestWithUser = Request & {
  user?: {
    sub: string;
    workerId?: string;
    type: 'user' | 'worker' | 'kiosk-user';
  };
};

@Controller('notifications')
export class NotificationsController {
  constructor(
    private readonly notificationsService: NotificationsService,
  ) {}

  @Get()
  @KioskAllowed()
  list(@Req() request: RequestWithUser) {
    if (request.user?.type === 'worker') {
      const workerId = request.user.workerId ?? request.user.sub;
      return this.notificationsService.listForWorker(workerId);
    }
    return this.notificationsService.listForUser(request.user!.sub);
  }

  @Get('unread-count')
  @KioskAllowed()
  async unreadCount(@Req() request: RequestWithUser) {
    if (request.user?.type === 'worker') {
      const workerId = request.user.workerId ?? request.user.sub;
      const count = await this.notificationsService.countUnread('worker', workerId);
      return { count };
    }
    const count = await this.notificationsService.countUnread('user', request.user!.sub);
    return { count };
  }

  @Post(':id/read')
  @KioskAllowed()
  async markRead(@Param('id') id: string, @Req() request: RequestWithUser) {
    await this.assertOwnership(request, id);
    return this.notificationsService.markRead(id);
  }

  @Post('read-all')
  @KioskAllowed()
  markAllRead(@Req() request: RequestWithUser) {
    if (request.user?.type === 'worker') {
      const workerId = request.user.workerId ?? request.user.sub;
      return this.notificationsService.markAllRead('worker', workerId);
    }
    return this.notificationsService.markAllRead('user', request.user!.sub);
  }

  private async assertOwnership(request: RequestWithUser, notificationId: string) {
    const notification = await this.notificationsService.getById(notificationId);
    if (!notification) {
      throw new ForbiddenException('Benachrichtigung nicht gefunden.');
    }
    if (request.user?.type === 'worker') {
      const workerId = request.user.workerId ?? request.user.sub;
      if (notification.recipientWorkerId !== workerId) {
        throw new ForbiddenException('Zugriff auf fremde Benachrichtigungen nicht erlaubt.');
      }
    } else {
      if (notification.recipientUserId !== request.user?.sub) {
        throw new ForbiddenException('Zugriff auf fremde Benachrichtigungen nicht erlaubt.');
      }
    }
  }
}

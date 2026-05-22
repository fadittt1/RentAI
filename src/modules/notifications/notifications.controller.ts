import {
  Controller,
  Get,
  Param,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { NotificationsService } from './notifications.service';

@ApiTags('notifications')
@ApiBearerAuth()
@Controller('api/notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  @ApiOperation({ summary: 'List notifications for the current user' })
  list(
    @Request() req: any,
    @Query('unread') unread?: string,
    @Query('limit') limit?: string,
  ) {
    return this.notifications.list(req.user.sub, {
      unreadOnly: unread === '1' || unread === 'true',
      limit: limit ? Math.max(1, Math.min(100, Number(limit))) : undefined,
    });
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'Count of unread notifications' })
  async unreadCount(@Request() req: any) {
    const count = await this.notifications.unreadCount(req.user.sub);
    return { count };
  }

  @Post(':id/read')
  @ApiOperation({ summary: 'Mark a single notification as read' })
  markRead(@Request() req: any, @Param('id') id: string) {
    return this.notifications.markRead(req.user.sub, id);
  }

  @Post('read-all')
  @ApiOperation({ summary: 'Mark every unread notification as read' })
  markAllRead(@Request() req: any) {
    return this.notifications.markAllRead(req.user.sub);
  }
}

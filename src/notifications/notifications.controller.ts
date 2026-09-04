import { Controller, Get, Param, Patch, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../common/types/jwt-payload.type';
import { ListNotificationsQueryDto } from './dto/list-notifications-query.dto';
import { NotificationResponseDto } from './dto/notification-response.dto';
import { NotificationsService } from './notifications.service';

@ApiTags('notifications')
@ApiBearerAuth()
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  @ApiOperation({ summary: 'Мои уведомления' })
  @ApiResponse({ status: 200, type: [NotificationResponseDto] })
  findAll(
    @Query() query: ListNotificationsQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<NotificationResponseDto[]> {
    return this.notificationsService.findAll(query, user);
  }

  @Patch('read-all')
  @ApiOperation({ summary: 'Отметить все мои уведомления прочитанными' })
  @ApiResponse({ status: 200, schema: { properties: { updatedCount: { type: 'number' } } } })
  markAllRead(@CurrentUser() user: AuthenticatedUser): Promise<{ updatedCount: number }> {
    return this.notificationsService.markAllRead(user);
  }

  @Patch(':id/read')
  @ApiOperation({ summary: 'Отметить уведомление прочитанным' })
  @ApiResponse({ status: 200, type: NotificationResponseDto })
  markRead(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<NotificationResponseDto> {
    return this.notificationsService.markRead(id, user);
  }
}

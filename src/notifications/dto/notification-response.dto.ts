import { ApiProperty } from '@nestjs/swagger';
import { Notification, NotificationType } from '@prisma/client';

export class NotificationResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty({ enum: NotificationType })
  type: NotificationType;

  @ApiProperty({ nullable: true, required: false })
  payload: unknown;

  @ApiProperty()
  isRead: boolean;

  @ApiProperty()
  createdAt: Date;

  static fromEntity(notification: Notification): NotificationResponseDto {
    const dto = new NotificationResponseDto();
    dto.id = notification.id;
    dto.type = notification.type;
    dto.payload = notification.payload;
    dto.isRead = notification.isRead;
    dto.createdAt = notification.createdAt;
    return dto;
  }
}

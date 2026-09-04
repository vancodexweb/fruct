import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';

export class ListNotificationsQueryDto {
  @ApiPropertyOptional({ description: 'true — только непрочитанные' })
  @IsOptional()
  @IsBoolean()
  unreadOnly?: boolean;
}

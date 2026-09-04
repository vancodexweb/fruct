import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';

export class ApprovePayoutDto {
  @ApiPropertyOptional({
    default: false,
    description: 'Отправить менеджеру короткое письмо-уведомление об изменении статуса выплаты',
  })
  @IsOptional()
  @IsBoolean()
  notifyManager?: boolean;
}

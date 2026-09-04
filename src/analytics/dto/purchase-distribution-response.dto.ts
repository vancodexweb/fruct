import { ApiProperty } from '@nestjs/swagger';

export class PurchaseDistributionResponseDto {
  @ApiProperty({ type: [Number], description: 'Число закрытых сделок по часу дня, индекс 0-23' })
  byHour: number[];

  @ApiProperty({
    type: [Number],
    description:
      'Число закрытых сделок по дню недели, индекс 0=воскресенье..6=суббота (как Postgres EXTRACT(DOW))',
  })
  byDayOfWeek: number[];
}

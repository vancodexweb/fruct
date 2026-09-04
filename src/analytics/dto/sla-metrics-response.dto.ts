import { ApiProperty } from '@nestjs/swagger';

export class SlaMetricsResponseDto {
  @ApiProperty()
  totalLeads: number;

  @ApiProperty({ description: 'Лиды, получившие первый ответ' })
  respondedCount: number;

  @ApiProperty({ nullable: true, required: false })
  avgResponseMinutes: number | null;

  @ApiProperty({ nullable: true, required: false })
  medianResponseMinutes: number | null;

  @ApiProperty({
    description:
      'Лиды без ответа в пределах tenant.slaMinutes: ответившие позже срока + всё ещё открытые дольше срока',
  })
  slaBreachCount: number;

  @ApiProperty()
  slaMinutes: number;
}

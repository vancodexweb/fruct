import { ApiProperty } from '@nestjs/swagger';

export class ManagerComparisonDto {
  @ApiProperty()
  managerId: string;

  @ApiProperty()
  managerFullName: string;

  @ApiProperty({ description: 'Строка с десятичным значением' })
  revenue: string;

  @ApiProperty()
  dealsCount: number;

  @ApiProperty()
  leadsAssigned: number;

  @ApiProperty()
  leadsWon: number;

  @ApiProperty({ description: 'Доля выигранных лидов от назначенных, %' })
  conversionRatePercent: string;

  @ApiProperty({
    nullable: true,
    required: false,
    description: 'Среднее время первого ответа, минуты',
  })
  avgResponseMinutes: number | null;
}

import { ApiProperty } from '@nestjs/swagger';

class PayoutPreviewDealDto {
  @ApiProperty()
  dealId: string;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty({ description: 'Строка с десятичным значением' })
  totalAmount: string;

  @ApiProperty({ description: 'Строка с десятичным значением' })
  commissionAmount: string;
}

/** Not persisted — see PayoutsService.preview(). */
export class PayoutPreviewDto {
  @ApiProperty()
  managerId: string;

  @ApiProperty()
  managerFullName: string;

  @ApiProperty({ description: 'Строка с десятичным значением' })
  baseSalary: string;

  @ApiProperty({ description: 'Строка с десятичным значением' })
  totalCommission: string;

  @ApiProperty({ description: 'Строка с десятичным значением' })
  totalPayout: string;

  @ApiProperty({ type: [PayoutPreviewDealDto] })
  deals: PayoutPreviewDealDto[];
}

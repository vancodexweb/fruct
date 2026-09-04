import { ApiProperty } from '@nestjs/swagger';
import { Payout, PayoutStatus } from '@prisma/client';

export class PayoutResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  managerId: string;

  @ApiProperty()
  periodStart: Date;

  @ApiProperty()
  periodEnd: Date;

  @ApiProperty({ description: 'Строка с десятичным значением' })
  baseSalary: string;

  @ApiProperty({ description: 'Строка с десятичным значением' })
  totalCommission: string;

  @ApiProperty({ description: 'Строка с десятичным значением' })
  totalPayout: string;

  @ApiProperty({ enum: PayoutStatus })
  status: PayoutStatus;

  @ApiProperty({ nullable: true, required: false })
  emailSentAt: Date | null;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty({ nullable: true, required: false })
  approvedAt: Date | null;

  static fromEntity(payout: Payout): PayoutResponseDto {
    const dto = new PayoutResponseDto();
    dto.id = payout.id;
    dto.managerId = payout.managerId;
    dto.periodStart = payout.periodStart;
    dto.periodEnd = payout.periodEnd;
    dto.baseSalary = payout.baseSalary.toString();
    dto.totalCommission = payout.totalCommission.toString();
    dto.totalPayout = payout.totalPayout.toString();
    dto.status = payout.status;
    dto.emailSentAt = payout.emailSentAt;
    dto.createdAt = payout.createdAt;
    dto.approvedAt = payout.approvedAt;
    return dto;
  }
}

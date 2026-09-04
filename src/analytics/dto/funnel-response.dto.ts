import { ApiProperty } from '@nestjs/swagger';
import { LeadStatus } from '@prisma/client';

class FunnelStageDto {
  @ApiProperty({ enum: LeadStatus })
  status: LeadStatus;

  @ApiProperty()
  count: number;
}

export class FunnelResponseDto {
  @ApiProperty({ type: [FunnelStageDto] })
  stages: FunnelStageDto[];

  @ApiProperty()
  totalLeads: number;

  @ApiProperty({ description: 'Доля лидов со статусом WON от общего числа, %' })
  conversionRatePercent: string;
}

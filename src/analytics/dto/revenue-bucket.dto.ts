import { ApiProperty } from '@nestjs/swagger';

export class RevenueBucketDto {
  @ApiProperty()
  periodStart: Date;

  @ApiProperty({ description: 'Строка с десятичным значением' })
  revenue: string;

  @ApiProperty()
  dealsCount: number;
}

import { ApiProperty } from '@nestjs/swagger';
import { IsDateString } from 'class-validator';

export class PeriodQueryDto {
  @ApiProperty({ example: '2026-09-01' })
  @IsDateString()
  periodStart: string;

  @ApiProperty({ example: '2026-09-30' })
  @IsDateString()
  periodEnd: string;
}

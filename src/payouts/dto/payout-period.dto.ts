import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsString } from 'class-validator';

export class PayoutPeriodDto {
  @ApiProperty({ example: '2026-09-01' })
  @IsDateString()
  periodStart: string;

  @ApiProperty({ example: '2026-09-30' })
  @IsDateString()
  periodEnd: string;

  @ApiPropertyOptional({ description: 'Ограничить одним менеджером' })
  @IsOptional()
  @IsString()
  managerId?: string;
}

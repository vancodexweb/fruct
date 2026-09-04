import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsNumber, IsOptional, Min } from 'class-validator';

/** Manual correction before approval — only while the payout is still DRAFT. */
export class UpdatePayoutDto {
  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  baseSalary?: number;

  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  totalCommission?: number;

  @ApiPropertyOptional({
    minimum: 0,
    description: 'Если не указано, пересчитывается как baseSalary + totalCommission.',
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  totalPayout?: number;
}

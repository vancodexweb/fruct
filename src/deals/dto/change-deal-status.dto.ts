import { ApiProperty } from '@nestjs/swagger';
import { DealStatus } from '@prisma/client';
import { IsEnum } from 'class-validator';

export class ChangeDealStatusDto {
  @ApiProperty({ enum: DealStatus })
  @IsEnum(DealStatus)
  status: DealStatus;
}

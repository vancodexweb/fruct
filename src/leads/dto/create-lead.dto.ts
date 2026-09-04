import { ApiPropertyOptional } from '@nestjs/swagger';
import { BuyerType, LeadSource } from '@prisma/client';
import { IsDateString, IsEnum, IsOptional, IsString } from 'class-validator';

export class CreateLeadDto {
  @ApiPropertyOptional({ example: 'Иванов Иван' })
  @IsOptional()
  @IsString()
  fullName?: string;

  @ApiPropertyOptional({ example: '+79991234567' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({ example: 'Самара' })
  @IsOptional()
  @IsString()
  city?: string;

  @ApiPropertyOptional({ enum: LeadSource, default: LeadSource.AVITO })
  @IsOptional()
  @IsEnum(LeadSource)
  source?: LeadSource;

  @ApiPropertyOptional({ description: 'Ссылка на объявление/переписку' })
  @IsOptional()
  @IsString()
  sourceLink?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({ enum: BuyerType, default: BuyerType.INDIVIDUAL })
  @IsOptional()
  @IsEnum(BuyerType)
  buyerType?: BuyerType;

  @ApiPropertyOptional({ example: 'ООО "Ромашка"' })
  @IsOptional()
  @IsString()
  companyName?: string;

  @ApiPropertyOptional({ example: '7701234567' })
  @IsOptional()
  @IsString()
  inn?: string;

  @ApiPropertyOptional({ description: 'Когда связаться повторно' })
  @IsOptional()
  @IsDateString()
  nextFollowUpAt?: string;
}

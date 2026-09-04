import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, Min } from 'class-validator';

/**
 * For when a manager already knows the real courier price (phoned it in,
 * read it off a carrier's site) and wants to record it instead of taking an
 * AI estimate — this is what DeliveryQuoteSource.MANUAL is for. Bypasses
 * both DeepSeek and the Redis cache: a human-provided number is authoritative
 * for this one shipment, not a reusable estimate for the route in general.
 */
export class CreateManualDeliveryQuoteDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  warehouseId: string;

  @ApiProperty({ example: 'Москва' })
  @IsString()
  @IsNotEmpty()
  destinationCity: string;

  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  weightKg?: number;

  @ApiProperty({ minimum: 0 })
  @IsNumber()
  @Min(0)
  cost: number;

  @ApiProperty({ minimum: 0 })
  @IsInt()
  @Min(0)
  etaDaysMin: number;

  @ApiProperty({ minimum: 0 })
  @IsInt()
  @Min(0)
  etaDaysMax: number;
}

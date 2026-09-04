import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsString } from 'class-validator';

/**
 * Values for the fixed placeholder set the spec calls out: {{name}},
 * {{price}}, {{city}}, {{deliveryDays}}. Any placeholder in a template
 * without a matching field here is left untouched in the rendered output —
 * see render-script-template.ts — so a manager visibly sees what they
 * forgot to fill in rather than silently getting a blank.
 */
export class RenderScriptDto {
  @ApiPropertyOptional({ example: 'Иван' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ example: 24990 })
  @IsOptional()
  @IsNumber()
  price?: number;

  @ApiPropertyOptional({ example: 'Самара' })
  @IsOptional()
  @IsString()
  city?: string;

  @ApiPropertyOptional({ example: 3 })
  @IsOptional()
  @IsNumber()
  deliveryDays?: number;
}

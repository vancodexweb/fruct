import { ApiPropertyOptional } from '@nestjs/swagger';
import { ScriptCategory } from '@prisma/client';
import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class UpdateScriptDto {
  @ApiPropertyOptional({ enum: ScriptCategory })
  @IsOptional()
  @IsEnum(ScriptCategory)
  category?: ScriptCategory;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  content?: string;
}

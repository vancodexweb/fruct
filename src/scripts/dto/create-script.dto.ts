import { ApiProperty } from '@nestjs/swagger';
import { ScriptCategory } from '@prisma/client';
import { IsEnum, IsNotEmpty, IsString } from 'class-validator';

export class CreateScriptDto {
  @ApiProperty({ enum: ScriptCategory, example: ScriptCategory.OBJECTION })
  @IsEnum(ScriptCategory)
  category: ScriptCategory;

  @ApiProperty({ example: 'Возражение "дорого"' })
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiProperty({
    example:
      'Здравствуйте, {{name}}! Понимаю, {{price}} может показаться высокой ценой, но кресло рассчитано на нагрузку до 150 кг и доставим за {{deliveryDays}} дней в {{city}}.',
    description: 'Текст с плейсхолдерами {{name}}, {{price}}, {{city}}, {{deliveryDays}}',
  })
  @IsString()
  @IsNotEmpty()
  content: string;
}

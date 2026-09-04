import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class CreateCategoryDto {
  @ApiProperty({ example: 'Игровые кресла' })
  @IsString()
  @IsNotEmpty()
  name: string;
}

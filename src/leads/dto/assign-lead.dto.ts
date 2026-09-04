import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty } from 'class-validator';

export class AssignLeadDto {
  @ApiProperty({ description: 'ID менеджера, которому назначается лид' })
  @IsString()
  @IsNotEmpty()
  managerId: string;
}

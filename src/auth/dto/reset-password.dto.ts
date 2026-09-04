import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, MinLength } from 'class-validator';

export class ResetPasswordDto {
  @ApiProperty({ description: 'Токен из письма для сброса пароля.' })
  @IsString()
  @IsNotEmpty()
  token: string;

  @ApiProperty({ example: 'newStrongP@ssw0rd', minLength: 8 })
  @IsString()
  @MinLength(8, { message: 'Пароль должен содержать не менее 8 символов.' })
  newPassword: string;
}

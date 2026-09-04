import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty } from 'class-validator';

export class RefreshTokenDto {
  @ApiProperty({ description: 'Refresh-токен, выданный при входе или предыдущем обновлении.' })
  @IsString()
  @IsNotEmpty()
  refreshToken: string;
}

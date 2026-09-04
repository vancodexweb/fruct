import { ApiProperty } from '@nestjs/swagger';
import { Role, User } from '@prisma/client';

/** Never includes passwordHash — this is what every users endpoint returns. */
export class UserResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  email: string;

  @ApiProperty()
  fullName: string;

  @ApiProperty({ enum: Role })
  role: Role;

  @ApiProperty()
  isActive: boolean;

  @ApiProperty()
  mustChangePassword: boolean;

  @ApiProperty({ description: 'Строка с десятичным значением, например "12.50"' })
  commissionPercent: string;

  @ApiProperty({ description: 'Строка с десятичным значением, например "50000.00"' })
  baseSalary: string;

  @ApiProperty({ description: 'Строка с десятичным значением, например "15.00"' })
  maxDiscountPercent: string;

  @ApiProperty({ nullable: true, required: false })
  telegramChatId: string | null;

  @ApiProperty()
  createdAt: Date;

  static fromEntity(user: User): UserResponseDto {
    const dto = new UserResponseDto();
    dto.id = user.id;
    dto.email = user.email;
    dto.fullName = user.fullName;
    dto.role = user.role;
    dto.isActive = user.isActive;
    dto.mustChangePassword = user.mustChangePassword;
    dto.commissionPercent = user.commissionPercent.toString();
    dto.baseSalary = user.baseSalary.toString();
    dto.maxDiscountPercent = user.maxDiscountPercent.toString();
    dto.telegramChatId = user.telegramChatId;
    dto.createdAt = user.createdAt;
    return dto;
  }
}

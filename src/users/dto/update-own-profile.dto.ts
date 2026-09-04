import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

/**
 * What a user (OWNER or MANAGER) may change about themselves via PATCH
 * /users/me. Deliberately excludes commissionPercent/baseSalary/
 * maxDiscountPercent/role — those are OWNER-only, set through PATCH
 * /users/:id, never self-service even for the OWNER's own account.
 */
export class UpdateOwnProfileDto {
  @ApiPropertyOptional({ example: 'Иванов Иван Иванович' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  fullName?: string;
}

import { ApiProperty } from '@nestjs/swagger';
import { ScriptCategory, ScriptTemplate } from '@prisma/client';

export class ScriptResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty({ enum: ScriptCategory })
  category: ScriptCategory;

  @ApiProperty()
  title: string;

  @ApiProperty()
  content: string;

  @ApiProperty()
  isActive: boolean;

  @ApiProperty({ nullable: true, required: false })
  createdById: string | null;

  @ApiProperty()
  createdAt: Date;

  static fromEntity(script: ScriptTemplate): ScriptResponseDto {
    const dto = new ScriptResponseDto();
    dto.id = script.id;
    dto.category = script.category;
    dto.title = script.title;
    dto.content = script.content;
    dto.isActive = script.isActive;
    dto.createdById = script.createdById;
    dto.createdAt = script.createdAt;
    return dto;
  }
}

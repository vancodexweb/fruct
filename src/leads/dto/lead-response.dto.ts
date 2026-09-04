import { ApiProperty } from '@nestjs/swagger';
import { BuyerType, Lead, LeadSource, LeadStatus } from '@prisma/client';

export class LeadResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty({ nullable: true, required: false })
  assignedManagerId: string | null;

  @ApiProperty({ nullable: true, required: false })
  fullName: string | null;

  @ApiProperty({ nullable: true, required: false })
  phone: string | null;

  @ApiProperty({ nullable: true, required: false })
  city: string | null;

  @ApiProperty({ enum: LeadSource })
  source: LeadSource;

  @ApiProperty({ nullable: true, required: false })
  sourceLink: string | null;

  @ApiProperty({ enum: LeadStatus })
  status: LeadStatus;

  @ApiProperty({ nullable: true, required: false })
  notes: string | null;

  @ApiProperty({ enum: BuyerType })
  buyerType: BuyerType;

  @ApiProperty({ nullable: true, required: false })
  companyName: string | null;

  @ApiProperty({ nullable: true, required: false })
  inn: string | null;

  @ApiProperty({ nullable: true, required: false })
  firstResponseAt: Date | null;

  @ApiProperty({ nullable: true, required: false })
  lastContactAt: Date | null;

  @ApiProperty({ nullable: true, required: false })
  nextFollowUpAt: Date | null;

  @ApiProperty()
  createdAt: Date;

  static fromEntity(lead: Lead): LeadResponseDto {
    const dto = new LeadResponseDto();
    dto.id = lead.id;
    dto.assignedManagerId = lead.assignedManagerId;
    dto.fullName = lead.fullName;
    dto.phone = lead.phone;
    dto.city = lead.city;
    dto.source = lead.source;
    dto.sourceLink = lead.sourceLink;
    dto.status = lead.status;
    dto.notes = lead.notes;
    dto.buyerType = lead.buyerType;
    dto.companyName = lead.companyName;
    dto.inn = lead.inn;
    dto.firstResponseAt = lead.firstResponseAt;
    dto.lastContactAt = lead.lastContactAt;
    dto.nextFollowUpAt = lead.nextFollowUpAt;
    dto.createdAt = lead.createdAt;
    return dto;
  }
}

import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { LeadStatus, Prisma, Role } from '@prisma/client';
import { TenantPrismaClient } from '../common/prisma/create-tenant-prisma-client';
import { CurrentTenantService } from '../common/prisma/current-tenant.service';
import { TENANT_PRISMA } from '../common/prisma/prisma.constants';
import { AuthenticatedUser } from '../common/types/jwt-payload.type';
import { AssignLeadDto } from './dto/assign-lead.dto';
import { ChangeLeadStatusDto } from './dto/change-lead-status.dto';
import { CreateLeadDto } from './dto/create-lead.dto';
import { LeadResponseDto } from './dto/lead-response.dto';
import { ListLeadsQueryDto } from './dto/list-leads-query.dto';
import { UpdateLeadDto } from './dto/update-lead.dto';

/**
 * Visibility rule (spec): a MANAGER only ever sees leads assigned to them —
 * including leads with no manager at all, which stay OWNER-only until
 * explicitly assigned via PATCH /leads/:id/assign. Every read/write method
 * below enforces this the same way: getAccessibleLead re-checks ownership,
 * list queries force assignedManagerId to the caller's own id for a MANAGER.
 * getAccessibleLead is public — DealsService reuses it so "create a deal
 * from this lead" enforces the exact same visibility rule as reading it.
 */
@Injectable()
export class LeadsService {
  constructor(
    @Inject(TENANT_PRISMA) private readonly prisma: TenantPrismaClient,
    private readonly currentTenant: CurrentTenantService,
  ) {}

  async create(dto: CreateLeadDto, currentUser: AuthenticatedUser): Promise<LeadResponseDto> {
    const lead = await this.prisma.lead.create({
      data: {
        tenantId: this.currentTenant.tenantId,
        // A manager creating a lead is necessarily the one handling it (e.g.
        // logging an inbound Avito message themselves); an OWNER-created
        // lead stays unassigned until explicitly routed to someone.
        assignedManagerId: currentUser.role === Role.MANAGER ? currentUser.id : undefined,
        fullName: dto.fullName,
        phone: dto.phone,
        city: dto.city,
        source: dto.source,
        sourceLink: dto.sourceLink,
        notes: dto.notes,
        buyerType: dto.buyerType,
        companyName: dto.companyName,
        inn: dto.inn,
        nextFollowUpAt: dto.nextFollowUpAt ? new Date(dto.nextFollowUpAt) : undefined,
      },
    });
    return LeadResponseDto.fromEntity(lead);
  }

  async findAll(
    query: ListLeadsQueryDto,
    currentUser: AuthenticatedUser,
  ): Promise<LeadResponseDto[]> {
    const assignedManagerId =
      currentUser.role === Role.MANAGER ? currentUser.id : query.assignedManagerId;

    const leads = await this.prisma.lead.findMany({
      where: {
        status: query.status,
        source: query.source,
        assignedManagerId,
        ...(query.search
          ? {
              OR: [
                { fullName: { contains: query.search, mode: 'insensitive' } },
                { phone: { contains: query.search, mode: 'insensitive' } },
                { companyName: { contains: query.search, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: query.limit ?? 50,
      skip: query.offset ?? 0,
    });
    return leads.map(LeadResponseDto.fromEntity);
  }

  async findOne(id: string, currentUser: AuthenticatedUser): Promise<LeadResponseDto> {
    const lead = await this.getAccessibleLead(id, currentUser);
    return LeadResponseDto.fromEntity(lead);
  }

  async update(
    id: string,
    dto: UpdateLeadDto,
    currentUser: AuthenticatedUser,
  ): Promise<LeadResponseDto> {
    await this.getAccessibleLead(id, currentUser);
    const updated = await this.prisma.lead.update({
      where: { id },
      data: {
        fullName: dto.fullName,
        phone: dto.phone,
        city: dto.city,
        sourceLink: dto.sourceLink,
        notes: dto.notes,
        buyerType: dto.buyerType,
        companyName: dto.companyName,
        inn: dto.inn,
        nextFollowUpAt: dto.nextFollowUpAt ? new Date(dto.nextFollowUpAt) : undefined,
      },
    });
    return LeadResponseDto.fromEntity(updated);
  }

  /** First transition away from NEW stamps firstResponseAt exactly once; every transition refreshes lastContactAt. */
  async changeStatus(
    id: string,
    dto: ChangeLeadStatusDto,
    currentUser: AuthenticatedUser,
  ): Promise<LeadResponseDto> {
    const lead = await this.getAccessibleLead(id, currentUser);

    const data: Prisma.LeadUpdateInput = { status: dto.status, lastContactAt: new Date() };
    if (lead.status === LeadStatus.NEW && dto.status !== LeadStatus.NEW && !lead.firstResponseAt) {
      data.firstResponseAt = new Date();
    }

    const updated = await this.prisma.lead.update({ where: { id }, data });
    return LeadResponseDto.fromEntity(updated);
  }

  /** OWNER-only (enforced by @Roles on the controller) — operates tenant-wide, no MANAGER visibility scoping needed. */
  async assign(id: string, dto: AssignLeadDto): Promise<LeadResponseDto> {
    const lead = await this.prisma.lead.findUnique({ where: { id } });
    if (!lead) {
      throw new NotFoundException('Лид не найден.');
    }

    const manager = await this.prisma.user.findUnique({ where: { id: dto.managerId } });
    if (!manager || manager.role !== Role.MANAGER) {
      throw new NotFoundException('Менеджер не найден.');
    }
    if (!manager.isActive) {
      throw new ConflictException('Менеджер заблокирован и не может быть назначен на новые лиды.');
    }

    const updated = await this.prisma.lead.update({
      where: { id },
      data: { assignedManagerId: dto.managerId },
    });
    return LeadResponseDto.fromEntity(updated);
  }

  async remove(id: string, currentUser: AuthenticatedUser): Promise<void> {
    await this.getAccessibleLead(id, currentUser);
    // Deal.leadId is required with no explicit onDelete → defaults to RESTRICT:
    // a lead with any deal against it fails with a 409 here, which is correct —
    // real transaction history must never be able to vanish this way.
    await this.prisma.lead.delete({ where: { id } });
  }

  async getAccessibleLead(id: string, currentUser: AuthenticatedUser) {
    const lead = await this.prisma.lead.findUnique({ where: { id } });
    if (!lead || (currentUser.role === Role.MANAGER && lead.assignedManagerId !== currentUser.id)) {
      throw new NotFoundException('Лид не найден.');
    }
    return lead;
  }
}

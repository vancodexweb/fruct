import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { ScriptCategory } from '@prisma/client';
import { TenantPrismaClient } from '../common/prisma/create-tenant-prisma-client';
import { CurrentTenantService } from '../common/prisma/current-tenant.service';
import { TENANT_PRISMA } from '../common/prisma/prisma.constants';
import { CreateScriptDto } from './dto/create-script.dto';
import { RenderScriptDto } from './dto/render-script.dto';
import { ScriptResponseDto } from './dto/script-response.dto';
import { UpdateScriptDto } from './dto/update-script.dto';
import { renderScriptTemplate } from './render-script-template';

@Injectable()
export class ScriptsService {
  constructor(
    @Inject(TENANT_PRISMA) private readonly prisma: TenantPrismaClient,
    private readonly currentTenant: CurrentTenantService,
  ) {}

  async create(dto: CreateScriptDto, createdById: string): Promise<ScriptResponseDto> {
    const script = await this.prisma.scriptTemplate.create({
      data: {
        tenantId: this.currentTenant.tenantId,
        category: dto.category,
        title: dto.title,
        content: dto.content,
        createdById,
      },
    });
    return ScriptResponseDto.fromEntity(script);
  }

  async findAll(category?: ScriptCategory, includeInactive = false): Promise<ScriptResponseDto[]> {
    const scripts = await this.prisma.scriptTemplate.findMany({
      where: { category, isActive: includeInactive ? undefined : true },
      orderBy: [{ category: 'asc' }, { title: 'asc' }],
    });
    return scripts.map(ScriptResponseDto.fromEntity);
  }

  async update(id: string, dto: UpdateScriptDto): Promise<ScriptResponseDto> {
    await this.findOrThrow(id);
    const updated = await this.prisma.scriptTemplate.update({
      where: { id },
      data: { category: dto.category, title: dto.title, content: dto.content },
    });
    return ScriptResponseDto.fromEntity(updated);
  }

  async deactivate(id: string): Promise<ScriptResponseDto> {
    await this.findOrThrow(id);
    const updated = await this.prisma.scriptTemplate.update({
      where: { id },
      data: { isActive: false },
    });
    return ScriptResponseDto.fromEntity(updated);
  }

  async reactivate(id: string): Promise<ScriptResponseDto> {
    await this.findOrThrow(id);
    const updated = await this.prisma.scriptTemplate.update({
      where: { id },
      data: { isActive: true },
    });
    return ScriptResponseDto.fromEntity(updated);
  }

  async render(id: string, dto: RenderScriptDto): Promise<{ rendered: string }> {
    const script = await this.findOrThrow(id);
    return { rendered: renderScriptTemplate(script.content, { ...dto }) };
  }

  private async findOrThrow(id: string) {
    const script = await this.prisma.scriptTemplate.findUnique({ where: { id } });
    if (!script) {
      throw new NotFoundException('Шаблон скрипта не найден.');
    }
    return script;
  }
}

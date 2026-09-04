import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ScriptCategory } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../common/types/jwt-payload.type';
import { CreateScriptDto } from './dto/create-script.dto';
import { RenderScriptDto } from './dto/render-script.dto';
import { ScriptResponseDto } from './dto/script-response.dto';
import { UpdateScriptDto } from './dto/update-script.dto';
import { ScriptsService } from './scripts.service';

/**
 * No @Roles() restriction anywhere here on purpose: this is a shared
 * knowledge base (closing scripts, objection handling), not sensitive data —
 * unlike catalog/users, the spec never scopes it to OWNER, so both roles get
 * full read/write access.
 */
@ApiTags('scripts')
@ApiBearerAuth()
@Controller('scripts')
export class ScriptsController {
  constructor(private readonly scriptsService: ScriptsService) {}

  @Get()
  @ApiQuery({ name: 'category', required: false, enum: ScriptCategory })
  @ApiQuery({ name: 'includeInactive', required: false, type: Boolean })
  @ApiOperation({ summary: 'Список шаблонов скриптов' })
  @ApiResponse({ status: 200, type: [ScriptResponseDto] })
  findAll(
    @Query('category') category?: ScriptCategory,
    @Query('includeInactive') includeInactive?: string,
  ): Promise<ScriptResponseDto[]> {
    return this.scriptsService.findAll(category, includeInactive === 'true');
  }

  @Post()
  @ApiOperation({ summary: 'Создать шаблон скрипта' })
  @ApiResponse({ status: 201, type: ScriptResponseDto })
  create(
    @Body() dto: CreateScriptDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ScriptResponseDto> {
    return this.scriptsService.create(dto, user.id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Изменить шаблон скрипта' })
  @ApiResponse({ status: 200, type: ScriptResponseDto })
  update(@Param('id') id: string, @Body() dto: UpdateScriptDto): Promise<ScriptResponseDto> {
    return this.scriptsService.update(id, dto);
  }

  @Patch(':id/deactivate')
  @ApiOperation({ summary: 'Деактивировать шаблон скрипта' })
  @ApiResponse({ status: 200, type: ScriptResponseDto })
  deactivate(@Param('id') id: string): Promise<ScriptResponseDto> {
    return this.scriptsService.deactivate(id);
  }

  @Patch(':id/reactivate')
  @ApiOperation({ summary: 'Реактивировать шаблон скрипта' })
  @ApiResponse({ status: 200, type: ScriptResponseDto })
  reactivate(@Param('id') id: string): Promise<ScriptResponseDto> {
    return this.scriptsService.reactivate(id);
  }

  @Post(':id/render')
  @ApiOperation({ summary: 'Отрендерить шаблон с подстановкой плейсхолдеров' })
  @ApiResponse({ status: 200, schema: { properties: { rendered: { type: 'string' } } } })
  render(@Param('id') id: string, @Body() dto: RenderScriptDto): Promise<{ rendered: string }> {
    return this.scriptsService.render(id, dto);
  }
}

import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { AuthenticatedUser } from '../common/types/jwt-payload.type';
import { AssignLeadDto } from './dto/assign-lead.dto';
import { ChangeLeadStatusDto } from './dto/change-lead-status.dto';
import { CreateLeadDto } from './dto/create-lead.dto';
import { LeadResponseDto } from './dto/lead-response.dto';
import { ListLeadsQueryDto } from './dto/list-leads-query.dto';
import { UpdateLeadDto } from './dto/update-lead.dto';
import { LeadsService } from './leads.service';

@ApiTags('leads')
@ApiBearerAuth()
@Controller('leads')
export class LeadsController {
  constructor(private readonly leadsService: LeadsService) {}

  @Get()
  @ApiOperation({ summary: 'Список лидов (MANAGER видит только свои назначенные)' })
  @ApiResponse({ status: 200, type: [LeadResponseDto] })
  findAll(
    @Query() query: ListLeadsQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<LeadResponseDto[]> {
    return this.leadsService.findAll(query, user);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Карточка лида' })
  @ApiResponse({ status: 200, type: LeadResponseDto })
  findOne(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<LeadResponseDto> {
    return this.leadsService.findOne(id, user);
  }

  @Post()
  @ApiOperation({ summary: 'Создать лид' })
  @ApiResponse({ status: 201, type: LeadResponseDto })
  create(
    @Body() dto: CreateLeadDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<LeadResponseDto> {
    return this.leadsService.create(dto, user);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Изменить данные лида' })
  @ApiResponse({ status: 200, type: LeadResponseDto })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateLeadDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<LeadResponseDto> {
    return this.leadsService.update(id, dto, user);
  }

  @Patch(':id/status')
  @ApiOperation({
    summary: 'Сменить статус лида (при первом уходе с NEW фиксирует firstResponseAt)',
  })
  @ApiResponse({ status: 200, type: LeadResponseDto })
  changeStatus(
    @Param('id') id: string,
    @Body() dto: ChangeLeadStatusDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<LeadResponseDto> {
    return this.leadsService.changeStatus(id, dto, user);
  }

  @Patch(':id/assign')
  @Roles(Role.OWNER)
  @ApiOperation({ summary: '[Только OWNER] Назначить/переназначить менеджера на лид' })
  @ApiResponse({ status: 200, type: LeadResponseDto })
  @ApiResponse({ status: 409, description: 'Менеджер заблокирован.' })
  assign(@Param('id') id: string, @Body() dto: AssignLeadDto): Promise<LeadResponseDto> {
    return this.leadsService.assign(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Удалить лид (если по нему есть сделки — 409)' })
  @ApiResponse({ status: 204 })
  @ApiResponse({ status: 409, description: 'По лиду есть сделки.' })
  remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser): Promise<void> {
    return this.leadsService.remove(id, user);
  }
}

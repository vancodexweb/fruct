import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Roles } from '../../common/decorators/roles.decorator';
import { CreateWarehouseDto } from './dto/create-warehouse.dto';
import { UpdateWarehouseDto } from './dto/update-warehouse.dto';
import { WarehouseResponseDto } from './dto/warehouse-response.dto';
import { WarehousesService } from './warehouses.service';

@ApiTags('catalog/warehouses')
@ApiBearerAuth()
@Controller('warehouses')
export class WarehousesController {
  constructor(private readonly warehousesService: WarehousesService) {}

  @Get()
  @ApiQuery({ name: 'includeInactive', required: false, type: Boolean })
  @ApiOperation({ summary: 'Список складов' })
  @ApiResponse({ status: 200, type: [WarehouseResponseDto] })
  findAll(@Query('includeInactive') includeInactive?: string): Promise<WarehouseResponseDto[]> {
    return this.warehousesService.findAll(includeInactive === 'true');
  }

  @Post()
  @Roles(Role.OWNER)
  @ApiOperation({ summary: '[Только OWNER] Создать склад' })
  @ApiResponse({ status: 201, type: WarehouseResponseDto })
  create(@Body() dto: CreateWarehouseDto): Promise<WarehouseResponseDto> {
    return this.warehousesService.create(dto);
  }

  @Patch(':id')
  @Roles(Role.OWNER)
  @ApiOperation({ summary: '[Только OWNER] Изменить данные склада' })
  @ApiResponse({ status: 200, type: WarehouseResponseDto })
  update(@Param('id') id: string, @Body() dto: UpdateWarehouseDto): Promise<WarehouseResponseDto> {
    return this.warehousesService.update(id, dto);
  }

  @Patch(':id/deactivate')
  @Roles(Role.OWNER)
  @ApiOperation({ summary: '[Только OWNER] Деактивировать склад' })
  @ApiResponse({ status: 200, type: WarehouseResponseDto })
  deactivate(@Param('id') id: string): Promise<WarehouseResponseDto> {
    return this.warehousesService.deactivate(id);
  }

  @Patch(':id/reactivate')
  @Roles(Role.OWNER)
  @ApiOperation({ summary: '[Только OWNER] Реактивировать склад' })
  @ApiResponse({ status: 200, type: WarehouseResponseDto })
  reactivate(@Param('id') id: string): Promise<WarehouseResponseDto> {
    return this.warehousesService.reactivate(id);
  }
}

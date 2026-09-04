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
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Roles } from '../../common/decorators/roles.decorator';
import { CreateDeliveryOptionDto } from './dto/create-delivery-option.dto';
import { DeliveryOptionResponseDto } from './dto/delivery-option-response.dto';
import { UpdateDeliveryOptionDto } from './dto/update-delivery-option.dto';
import { DeliveryOptionsService } from './delivery-options.service';

@ApiTags('catalog/delivery-options')
@ApiBearerAuth()
@Controller('delivery-options')
export class DeliveryOptionsController {
  constructor(private readonly deliveryOptionsService: DeliveryOptionsService) {}

  @Get()
  @ApiOperation({ summary: 'Список условий доставки' })
  @ApiResponse({ status: 200, type: [DeliveryOptionResponseDto] })
  findAll(): Promise<DeliveryOptionResponseDto[]> {
    return this.deliveryOptionsService.findAll();
  }

  @Post()
  @Roles(Role.OWNER)
  @ApiOperation({ summary: '[Только OWNER] Создать условие доставки' })
  @ApiResponse({ status: 201, type: DeliveryOptionResponseDto })
  create(@Body() dto: CreateDeliveryOptionDto): Promise<DeliveryOptionResponseDto> {
    return this.deliveryOptionsService.create(dto);
  }

  @Patch(':id')
  @Roles(Role.OWNER)
  @ApiOperation({ summary: '[Только OWNER] Изменить условие доставки' })
  @ApiResponse({ status: 200, type: DeliveryOptionResponseDto })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateDeliveryOptionDto,
  ): Promise<DeliveryOptionResponseDto> {
    return this.deliveryOptionsService.update(id, dto);
  }

  @Delete(':id')
  @Roles(Role.OWNER)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary:
      '[Только OWNER] Удалить условие доставки (сделки, где оно указано, просто теряют ссылку)',
  })
  @ApiResponse({ status: 204 })
  remove(@Param('id') id: string): Promise<void> {
    return this.deliveryOptionsService.remove(id);
  }
}

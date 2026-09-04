import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../common/types/jwt-payload.type';
import { ChangeDealStatusDto } from './dto/change-deal-status.dto';
import { CreateDealDto } from './dto/create-deal.dto';
import { DealResponseDto } from './dto/deal-response.dto';
import { ListDealsQueryDto } from './dto/list-deals-query.dto';
import { DealsService } from './deals.service';

@ApiTags('deals')
@ApiBearerAuth()
@Controller('deals')
export class DealsController {
  constructor(private readonly dealsService: DealsService) {}

  @Get()
  @ApiOperation({ summary: 'Список сделок (MANAGER видит только свои)' })
  @ApiResponse({ status: 200, type: [DealResponseDto] })
  findAll(
    @Query() query: ListDealsQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<DealResponseDto[]> {
    return this.dealsService.findAll(query, user);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Карточка сделки' })
  @ApiResponse({ status: 200, type: DealResponseDto })
  findOne(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<DealResponseDto> {
    return this.dealsService.findOne(id, user);
  }

  @Post()
  @ApiOperation({
    summary: 'Создать сделку из лида (резервирует остатки на складе, фиксирует комиссию)',
  })
  @ApiResponse({ status: 201, type: DealResponseDto })
  @ApiResponse({ status: 409, description: 'Недостаточно товара на складе.' })
  create(
    @Body() dto: CreateDealDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<DealResponseDto> {
    return this.dealsService.create(dto, user);
  }

  @Patch(':id/status')
  @ApiOperation({
    summary: 'Сменить статус сделки (CANCELLED/REFUNDED возвращают остатки на склад)',
  })
  @ApiResponse({ status: 200, type: DealResponseDto })
  @ApiResponse({ status: 400, description: 'Недопустимый переход статуса.' })
  changeStatus(
    @Param('id') id: string,
    @Body() dto: ChangeDealStatusDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<DealResponseDto> {
    return this.dealsService.changeStatus(id, dto, user);
  }
}

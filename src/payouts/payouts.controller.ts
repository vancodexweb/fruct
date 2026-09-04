import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { AuthenticatedUser } from '../common/types/jwt-payload.type';
import { ApprovePayoutDto } from './dto/approve-payout.dto';
import { ListPayoutsQueryDto } from './dto/list-payouts-query.dto';
import { PayoutPeriodDto } from './dto/payout-period.dto';
import { PayoutPreviewDto } from './dto/payout-preview.dto';
import { PayoutResponseDto } from './dto/payout-response.dto';
import { UpdatePayoutDto } from './dto/update-payout.dto';
import { PayoutsService } from './payouts.service';

@ApiTags('payouts')
@ApiBearerAuth()
@Controller('payouts')
export class PayoutsController {
  constructor(private readonly payoutsService: PayoutsService) {}

  // "preview"/"generate"/"send-bulk" registered before ":id" routes below —
  // Express/Nest match path patterns in declaration order, and these literal
  // segments must win over the ":id" wildcard for the same HTTP method.

  @Get('preview')
  @Roles(Role.OWNER)
  @ApiOperation({
    summary: '[Только OWNER] Предпросмотр расчёта зарплаты за период (без записи в БД)',
  })
  @ApiResponse({ status: 200, type: [PayoutPreviewDto] })
  preview(@Query() dto: PayoutPeriodDto): Promise<PayoutPreviewDto[]> {
    return this.payoutsService.preview(dto);
  }

  @Post('generate')
  @Roles(Role.OWNER)
  @ApiOperation({ summary: '[Только OWNER] Создать выплаты в статусе DRAFT за период' })
  @ApiResponse({ status: 201, type: [PayoutResponseDto] })
  generate(@Body() dto: PayoutPeriodDto): Promise<PayoutResponseDto[]> {
    return this.payoutsService.generate(dto);
  }

  @Post('send-bulk')
  @Roles(Role.OWNER)
  @ApiOperation({ summary: '[Только OWNER] Разослать расчётные листы всем менеджерам за период' })
  @ApiResponse({ status: 200, schema: { properties: { queuedCount: { type: 'number' } } } })
  sendBulk(@Query() dto: PayoutPeriodDto): Promise<{ queuedCount: number }> {
    return this.payoutsService.sendBulk(dto);
  }

  @Get()
  @ApiOperation({ summary: 'Список выплат (MANAGER видит только свои)' })
  @ApiResponse({ status: 200, type: [PayoutResponseDto] })
  findAll(
    @Query() query: ListPayoutsQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<PayoutResponseDto[]> {
    return this.payoutsService.findAll(query, user);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Карточка выплаты' })
  @ApiResponse({ status: 200, type: PayoutResponseDto })
  findOne(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<PayoutResponseDto> {
    return this.payoutsService.findOne(id, user);
  }

  @Patch(':id')
  @Roles(Role.OWNER)
  @ApiOperation({ summary: '[Только OWNER] Ручная корректировка выплаты (только пока DRAFT)' })
  @ApiResponse({ status: 200, type: PayoutResponseDto })
  @ApiResponse({ status: 409, description: 'Выплата уже не в статусе DRAFT.' })
  update(@Param('id') id: string, @Body() dto: UpdatePayoutDto): Promise<PayoutResponseDto> {
    return this.payoutsService.update(id, dto);
  }

  @Patch(':id/approve')
  @Roles(Role.OWNER)
  @ApiOperation({ summary: '[Только OWNER] Утвердить выплату: DRAFT → APPROVED' })
  @ApiResponse({ status: 200, type: PayoutResponseDto })
  approve(@Param('id') id: string, @Body() dto: ApprovePayoutDto): Promise<PayoutResponseDto> {
    return this.payoutsService.approve(id, dto);
  }

  @Patch(':id/pay')
  @Roles(Role.OWNER)
  @ApiOperation({ summary: '[Только OWNER] Отметить выплаченной: APPROVED → PAID' })
  @ApiResponse({ status: 200, type: PayoutResponseDto })
  markPaid(@Param('id') id: string, @Body() dto: ApprovePayoutDto): Promise<PayoutResponseDto> {
    return this.payoutsService.markPaid(id, dto);
  }

  @Post(':id/send-email')
  @Roles(Role.OWNER)
  @ApiOperation({ summary: '[Только OWNER] Отправить расчётный лист конкретному менеджеру' })
  @ApiResponse({ status: 200 })
  sendEmail(@Param('id') id: string): Promise<void> {
    return this.payoutsService.sendEmail(id);
  }
}

import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { AnalyticsService } from './analytics.service';
import { FunnelResponseDto } from './dto/funnel-response.dto';
import { ManagerComparisonDto } from './dto/manager-comparison.dto';
import { PeriodQueryDto } from './dto/period-query.dto';
import { PurchaseDistributionResponseDto } from './dto/purchase-distribution-response.dto';
import { RevenueBucketDto } from './dto/revenue-bucket.dto';
import { RevenueQueryDto } from './dto/revenue-query.dto';
import { SlaMetricsResponseDto } from './dto/sla-metrics-response.dto';
import { TopProductDto } from './dto/top-product.dto';
import { TopProductsQueryDto } from './dto/top-products-query.dto';

/** Every endpoint here is OWNER-only — see AnalyticsService's class doc comment for why. */
@ApiTags('analytics')
@ApiBearerAuth()
@Controller('analytics')
@Roles(Role.OWNER)
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('funnel')
  @ApiOperation({ summary: '[Только OWNER] Воронка лидов по статусам за период' })
  @ApiResponse({ status: 200, type: FunnelResponseDto })
  funnel(@Query() dto: PeriodQueryDto): Promise<FunnelResponseDto> {
    return this.analyticsService.funnel(dto);
  }

  @Get('sla')
  @ApiOperation({ summary: '[Только OWNER] Метрики SLA: время ответа, число просрочек' })
  @ApiResponse({ status: 200, type: SlaMetricsResponseDto })
  sla(@Query() dto: PeriodQueryDto): Promise<SlaMetricsResponseDto> {
    return this.analyticsService.slaMetrics(dto);
  }

  @Get('revenue')
  @ApiOperation({ summary: '[Только OWNER] Выручка по периодам (день/неделя/месяц)' })
  @ApiResponse({ status: 200, type: [RevenueBucketDto] })
  revenue(@Query() dto: RevenueQueryDto): Promise<RevenueBucketDto[]> {
    return this.analyticsService.revenue(dto);
  }

  @Get('top-products')
  @ApiOperation({ summary: '[Только OWNER] Топ товаров по выручке за период' })
  @ApiResponse({ status: 200, type: [TopProductDto] })
  topProducts(@Query() dto: TopProductsQueryDto): Promise<TopProductDto[]> {
    return this.analyticsService.topProducts(dto);
  }

  @Get('managers-comparison')
  @ApiOperation({
    summary: '[Только OWNER] Сравнение менеджеров: выручка, конверсия, время ответа',
  })
  @ApiResponse({ status: 200, type: [ManagerComparisonDto] })
  managersComparison(@Query() dto: PeriodQueryDto): Promise<ManagerComparisonDto[]> {
    return this.analyticsService.managersComparison(dto);
  }

  @Get('purchase-distribution')
  @ApiOperation({
    summary: '[Только OWNER] Распределение закрытых сделок по часу дня и дню недели',
  })
  @ApiResponse({ status: 200, type: PurchaseDistributionResponseDto })
  purchaseDistribution(@Query() dto: PeriodQueryDto): Promise<PurchaseDistributionResponseDto> {
    return this.analyticsService.purchaseDistribution(dto);
  }
}

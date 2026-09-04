import { Inject, Injectable } from '@nestjs/common';
import { LeadStatus, Prisma, Role } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { TenantPrismaClient } from '../common/prisma/create-tenant-prisma-client';
import { CurrentTenantService } from '../common/prisma/current-tenant.service';
import { TENANT_PRISMA } from '../common/prisma/prisma.constants';
import { COMMISSIONABLE_DEAL_STATUSES } from '../deals/deal-status-transitions';
import { FunnelResponseDto } from './dto/funnel-response.dto';
import { ManagerComparisonDto } from './dto/manager-comparison.dto';
import { PeriodQueryDto } from './dto/period-query.dto';
import { PurchaseDistributionResponseDto } from './dto/purchase-distribution-response.dto';
import { RevenueBucketDto } from './dto/revenue-bucket.dto';
import { RevenueQueryDto } from './dto/revenue-query.dto';
import { SlaMetricsResponseDto } from './dto/sla-metrics-response.dto';
import { TopProductDto } from './dto/top-product.dto';
import { TopProductsQueryDto } from './dto/top-products-query.dto';

const FUNNEL_STAGES: LeadStatus[] = [
  LeadStatus.NEW,
  LeadStatus.CONTACTED,
  LeadStatus.IN_DIALOGUE,
  LeadStatus.PROPOSAL_SENT,
  LeadStatus.WAITING_DECISION,
  LeadStatus.WON,
  LeadStatus.LOST,
];

const COMMISSIONABLE_STATUS_LIST = [...COMMISSIONABLE_DEAL_STATUSES];

/**
 * Read-only, OWNER-only (comparing managers against each other is exactly
 * the kind of sensitive data a MANAGER shouldn't see about their peers — a
 * manager's own numbers are already visible through GET /deals and
 * GET /leads scoped to themselves).
 *
 * revenue/topProducts/purchaseDistribution use $queryRaw for date bucketing
 * Prisma's query builder can't express (date_trunc, EXTRACT) — same
 * documented exception as ProductsService's specs search: tenantId is
 * filtered by hand in the raw SQL since the tenant-scoping extension only
 * intercepts model queries.
 *
 * `status::text IN (...)`, not bare `status IN (...)`: Deal.status is a
 * native Postgres enum column, and $queryRaw's bound parameters arrive as
 * `text` — Postgres has no `"DealStatus" = text` operator, so the
 * comparison fails at the SQL level (42883) without the cast. Confirmed by
 * actually running these queries, not assumed.
 */
@Injectable()
export class AnalyticsService {
  constructor(
    @Inject(TENANT_PRISMA) private readonly prisma: TenantPrismaClient,
    private readonly currentTenant: CurrentTenantService,
  ) {}

  async funnel(dto: PeriodQueryDto): Promise<FunnelResponseDto> {
    const { start, end } = this.parseRange(dto);
    const grouped = await this.prisma.lead.groupBy({
      by: ['status'],
      where: { createdAt: { gte: start, lte: end } },
      _count: { _all: true },
    });
    const countByStatus = new Map(grouped.map((row) => [row.status, row._count._all]));
    const stages = FUNNEL_STAGES.map((status) => ({
      status,
      count: countByStatus.get(status) ?? 0,
    }));
    const totalLeads = stages.reduce((sum, stage) => sum + stage.count, 0);
    const won = countByStatus.get(LeadStatus.WON) ?? 0;
    const conversionRatePercent = totalLeads > 0 ? ((won / totalLeads) * 100).toFixed(2) : '0.00';

    return { stages, totalLeads, conversionRatePercent };
  }

  async slaMetrics(dto: PeriodQueryDto): Promise<SlaMetricsResponseDto> {
    const { start, end } = this.parseRange(dto);
    const tenant = await this.prisma.tenant.findUniqueOrThrow({
      where: { id: this.currentTenant.tenantId },
    });
    const leads = await this.prisma.lead.findMany({
      where: { createdAt: { gte: start, lte: end } },
      select: { createdAt: true, firstResponseAt: true },
    });

    const responseTimesMinutes: number[] = [];
    let slaBreachCount = 0;
    const now = new Date();

    for (const lead of leads) {
      if (lead.firstResponseAt) {
        const minutes = (lead.firstResponseAt.getTime() - lead.createdAt.getTime()) / 60_000;
        responseTimesMinutes.push(minutes);
        if (minutes > tenant.slaMinutes) {
          slaBreachCount += 1;
        }
      } else {
        const ageMinutes = (now.getTime() - lead.createdAt.getTime()) / 60_000;
        if (ageMinutes > tenant.slaMinutes) {
          slaBreachCount += 1;
        }
      }
    }

    responseTimesMinutes.sort((a, b) => a - b);
    const avgResponseMinutes = responseTimesMinutes.length
      ? responseTimesMinutes.reduce((sum, value) => sum + value, 0) / responseTimesMinutes.length
      : null;
    const medianResponseMinutes = responseTimesMinutes.length
      ? responseTimesMinutes[Math.floor(responseTimesMinutes.length / 2)]
      : null;

    return {
      totalLeads: leads.length,
      respondedCount: responseTimesMinutes.length,
      avgResponseMinutes,
      medianResponseMinutes,
      slaBreachCount,
      slaMinutes: tenant.slaMinutes,
    };
  }

  async revenue(dto: RevenueQueryDto): Promise<RevenueBucketDto[]> {
    const { start, end } = this.parseRange(dto);
    const unit = dto.groupBy ?? 'day';
    const tenantId = this.currentTenant.tenantId;

    const rows = await this.prisma.$queryRaw<
      { bucket: Date; revenue: Decimal; dealsCount: bigint }[]
    >(
      Prisma.sql`
        SELECT date_trunc(${unit}, "createdAt") AS bucket,
               COALESCE(SUM("totalAmount"), 0) AS revenue,
               COUNT(*) AS "dealsCount"
        FROM "deals"
        WHERE "tenantId" = ${tenantId}
          AND status::text IN (${Prisma.join(COMMISSIONABLE_STATUS_LIST)})
          AND "createdAt" >= ${start}
          AND "createdAt" <= ${end}
        GROUP BY bucket
        ORDER BY bucket ASC
      `,
    );

    return rows.map((row) => ({
      periodStart: row.bucket,
      revenue: row.revenue.toString(),
      dealsCount: Number(row.dealsCount),
    }));
  }

  async topProducts(dto: TopProductsQueryDto): Promise<TopProductDto[]> {
    const { start, end } = this.parseRange(dto);
    const tenantId = this.currentTenant.tenantId;
    const limit = dto.limit ?? 10;

    const rows = await this.prisma.$queryRaw<
      { productId: string; productName: string; totalQuantity: bigint; totalRevenue: Decimal }[]
    >(
      Prisma.sql`
        SELECT di."productId",
               p."name" AS "productName",
               SUM(di."quantity") AS "totalQuantity",
               COALESCE(SUM(di."subtotal"), 0) AS "totalRevenue"
        FROM "deal_items" di
        JOIN "deals" d ON d."id" = di."dealId"
        JOIN "products" p ON p."id" = di."productId"
        WHERE d."tenantId" = ${tenantId}
          AND d.status::text IN (${Prisma.join(COMMISSIONABLE_STATUS_LIST)})
          AND d."createdAt" >= ${start}
          AND d."createdAt" <= ${end}
        GROUP BY di."productId", p."name"
        ORDER BY "totalRevenue" DESC
        LIMIT ${limit}
      `,
    );

    return rows.map((row) => ({
      productId: row.productId,
      productName: row.productName,
      totalQuantity: Number(row.totalQuantity),
      totalRevenue: row.totalRevenue.toString(),
    }));
  }

  async managersComparison(dto: PeriodQueryDto): Promise<ManagerComparisonDto[]> {
    const { start, end } = this.parseRange(dto);
    const managers = await this.prisma.user.findMany({ where: { role: Role.MANAGER } });

    const results: ManagerComparisonDto[] = [];
    for (const manager of managers) {
      const deals = await this.prisma.deal.findMany({
        where: {
          managerId: manager.id,
          status: { in: COMMISSIONABLE_STATUS_LIST },
          createdAt: { gte: start, lte: end },
        },
        select: { totalAmount: true },
      });
      const revenue = deals.reduce((sum, deal) => sum.plus(deal.totalAmount), new Decimal(0));

      const leadsAssigned = await this.prisma.lead.count({
        where: { assignedManagerId: manager.id, createdAt: { gte: start, lte: end } },
      });
      const leadsWon = await this.prisma.lead.count({
        where: {
          assignedManagerId: manager.id,
          status: LeadStatus.WON,
          createdAt: { gte: start, lte: end },
        },
      });
      const conversionRatePercent =
        leadsAssigned > 0 ? ((leadsWon / leadsAssigned) * 100).toFixed(2) : '0.00';

      const respondedLeads = await this.prisma.lead.findMany({
        where: {
          assignedManagerId: manager.id,
          createdAt: { gte: start, lte: end },
          firstResponseAt: { not: null },
        },
        select: { createdAt: true, firstResponseAt: true },
      });
      const avgResponseMinutes = respondedLeads.length
        ? respondedLeads.reduce(
            (sum, lead) =>
              sum + (lead.firstResponseAt!.getTime() - lead.createdAt.getTime()) / 60_000,
            0,
          ) / respondedLeads.length
        : null;

      results.push({
        managerId: manager.id,
        managerFullName: manager.fullName,
        revenue: revenue.toString(),
        dealsCount: deals.length,
        leadsAssigned,
        leadsWon,
        conversionRatePercent,
        avgResponseMinutes,
      });
    }

    results.sort((a, b) => Number(b.revenue) - Number(a.revenue));
    return results;
  }

  async purchaseDistribution(dto: PeriodQueryDto): Promise<PurchaseDistributionResponseDto> {
    const { start, end } = this.parseRange(dto);
    const tenantId = this.currentTenant.tenantId;

    const rows = await this.prisma.$queryRaw<{ hour: number; dow: number; count: bigint }[]>(
      Prisma.sql`
        SELECT EXTRACT(HOUR FROM "createdAt")::int AS hour,
               EXTRACT(DOW FROM "createdAt")::int AS dow,
               COUNT(*) AS count
        FROM "deals"
        WHERE "tenantId" = ${tenantId}
          AND status::text IN (${Prisma.join(COMMISSIONABLE_STATUS_LIST)})
          AND "createdAt" >= ${start}
          AND "createdAt" <= ${end}
        GROUP BY hour, dow
      `,
    );

    const byHour = new Array<number>(24).fill(0);
    const byDayOfWeek = new Array<number>(7).fill(0);
    for (const row of rows) {
      byHour[row.hour] += Number(row.count);
      byDayOfWeek[row.dow] += Number(row.count);
    }

    return { byHour, byDayOfWeek };
  }

  private parseRange(dto: PeriodQueryDto): { start: Date; end: Date } {
    return { start: new Date(dto.periodStart), end: new Date(dto.periodEnd) };
  }
}

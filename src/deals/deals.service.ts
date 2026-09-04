import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { BuyerType, Role } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { TenantPrismaClient } from '../common/prisma/create-tenant-prisma-client';
import { CurrentTenantService } from '../common/prisma/current-tenant.service';
import { TENANT_PRISMA } from '../common/prisma/prisma.constants';
import { AuthenticatedUser } from '../common/types/jwt-payload.type';
import { LeadsService } from '../leads/leads.service';
import { ChangeDealStatusDto } from './dto/change-deal-status.dto';
import { CreateDealDto } from './dto/create-deal.dto';
import { DealResponseDto } from './dto/deal-response.dto';
import { ListDealsQueryDto } from './dto/list-deals-query.dto';
import {
  DEAL_STATUS_TRANSITIONS,
  STOCK_RESTORING_STATUSES,
  TERMINAL_DEAL_STATUSES,
} from './deal-status-transitions';

interface ResolvedDelivery {
  deliveryCost: Decimal;
  deliveryOptionId?: string;
  deliveryQuoteId?: string;
}

/**
 * RESOLVED SPEC TENSION — read before touching commission logic:
 *
 * The spec's prose says commissionPercentSnap/commissionAmount get fixed
 * "при переходе в PAID/COMPLETED" (on transition to PAID/COMPLETED), which
 * reads as: create the deal first, snapshot commission later. But the
 * schema makes both fields non-nullable with no @default — Deal.create()
 * cannot omit them, Prisma rejects it. The two can't both be taken
 * literally, and the schema is the one of the two I was told not to alter.
 *
 * Resolution: commissionPercentSnap/commissionAmount are snapshotted at
 * CREATION time (the manager's commissionPercent right now × this deal's
 * totalAmount right now), and — this is what actually satisfies "не
 * пересчитывается задним числом" — nothing anywhere in this service ever
 * recomputes them afterward. There is no endpoint that edits a deal's
 * items/discount/delivery/totalAmount once created; changeStatus() only
 * ever touches `status`/`closedAt`/Stock. So the values are exactly as
 * fixed as the spec demands, just fixed from the start rather than
 * deferred — the schema leaves no other option.
 */
@Injectable()
export class DealsService {
  constructor(
    @Inject(TENANT_PRISMA) private readonly prisma: TenantPrismaClient,
    private readonly currentTenant: CurrentTenantService,
    private readonly leadsService: LeadsService,
  ) {}

  async create(dto: CreateDealDto, currentUser: AuthenticatedUser): Promise<DealResponseDto> {
    const tenantId = this.currentTenant.tenantId;

    // MANAGER can only sell against their own leads — reuses the exact same
    // visibility rule as GET /leads/:id, not a re-derived copy of it.
    const lead = await this.leadsService.getAccessibleLead(dto.leadId, currentUser);

    const warehouse = await this.prisma.warehouse.findUnique({ where: { id: dto.warehouseId } });
    if (!warehouse || !warehouse.isActive) {
      throw new NotFoundException('Склад не найден или неактивен.');
    }

    const productIds = dto.items.map((item) => item.productId);
    if (new Set(productIds).size !== productIds.length) {
      throw new BadRequestException(
        'Товар в сделке указан более одного раза — объедините количество в одной позиции.',
      );
    }
    const products = await this.prisma.product.findMany({ where: { id: { in: productIds } } });
    if (products.length !== productIds.length) {
      throw new NotFoundException('Один или несколько товаров не найдены.');
    }
    const productById = new Map(products.map((product) => [product.id, product]));

    let subtotal = new Decimal(0);
    const itemsData = dto.items.map((item) => {
      const product = productById.get(item.productId)!;
      const lineSubtotal = new Decimal(product.price).times(item.quantity);
      subtotal = subtotal.plus(lineSubtotal);
      return {
        productId: item.productId,
        quantity: item.quantity,
        unitPrice: product.price,
        subtotal: lineSubtotal,
      };
    });

    // The deal's manager (and commission recipient) is whoever is actually
    // responsible for the sale — the lead's assigned manager if it has one,
    // falling back to the current user only for an OWNER working an
    // unassigned lead directly.
    const managerId = lead.assignedManagerId ?? currentUser.id;
    const manager = await this.prisma.user.findUniqueOrThrow({ where: { id: managerId } });

    const discount = new Decimal(dto.discount ?? 0);
    if (discount.greaterThan(subtotal)) {
      throw new BadRequestException('Скидка не может превышать сумму товаров.');
    }
    // The discount cap is tied to whoever is actually authorizing it: an
    // OWNER can always override, a MANAGER is capped at their own
    // maxDiscountPercent regardless of whose lead this is.
    if (currentUser.role === Role.MANAGER) {
      const actingUser = await this.prisma.user.findUniqueOrThrow({
        where: { id: currentUser.id },
      });
      const maxDiscount = subtotal.times(actingUser.maxDiscountPercent).dividedBy(100);
      if (discount.greaterThan(maxDiscount)) {
        throw new BadRequestException(
          `Скидка ${discount.toFixed(2)} превышает максимально допустимую для вас — ` +
            `${actingUser.maxDiscountPercent.toString()}% от суммы товаров (${maxDiscount.toFixed(2)}).`,
        );
      }
    }

    const delivery = await this.resolveDelivery(dto);

    const legalEntityMarkup =
      lead.buyerType === BuyerType.LEGAL_ENTITY && dto.requiresVatInvoice
        ? await this.computeLegalEntityMarkup(subtotal, tenantId)
        : new Decimal(0);

    const totalAmount = subtotal
      .minus(discount)
      .plus(delivery.deliveryCost)
      .plus(legalEntityMarkup);
    // Fixed here, forever — see the class doc comment on why this can never
    // be recomputed after creation.
    const commissionAmount = totalAmount.times(manager.commissionPercent).dividedBy(100);

    const deal = await this.prisma.$transaction(async (tx) => {
      // Race-condition-safe reservation: each decrement is a single
      // conditional UPDATE (quantity >= requested), which Postgres executes
      // atomically and serializes via the row lock it acquires — two
      // concurrent deals for the same product/warehouse can't both succeed
      // past the available quantity. If a decrement affects 0 rows, someone
      // else took the stock first (or there wasn't enough to begin with);
      // throwing here rolls back every decrement already applied in this
      // transaction, not just this one item.
      for (const item of itemsData) {
        const result = await tx.stock.updateMany({
          where: {
            warehouseId: dto.warehouseId,
            productId: item.productId,
            quantity: { gte: item.quantity },
          },
          data: { quantity: { decrement: item.quantity } },
        });
        if (result.count === 0) {
          throw new ConflictException(
            `Недостаточно товара "${productById.get(item.productId)!.name}" на складе "${warehouse.name}".`,
          );
        }
      }

      return tx.deal.create({
        data: {
          tenantId,
          leadId: dto.leadId,
          managerId,
          warehouseId: dto.warehouseId,
          deliveryOptionId: delivery.deliveryOptionId,
          deliveryQuoteId: delivery.deliveryQuoteId,
          deliveryCost: delivery.deliveryCost,
          discount,
          requiresVatInvoice: dto.requiresVatInvoice ?? false,
          legalEntityMarkup,
          totalAmount,
          paymentMethod: dto.paymentMethod,
          commissionPercentSnap: manager.commissionPercent,
          commissionAmount,
          items: { create: itemsData },
        },
        include: { items: { include: { product: true } } },
      });
    });

    return DealResponseDto.fromEntity(deal);
  }

  async findAll(
    query: ListDealsQueryDto,
    currentUser: AuthenticatedUser,
  ): Promise<DealResponseDto[]> {
    const managerId = currentUser.role === Role.MANAGER ? currentUser.id : query.managerId;

    const deals = await this.prisma.deal.findMany({
      where: { status: query.status, managerId, leadId: query.leadId },
      include: { items: { include: { product: true } } },
      orderBy: { createdAt: 'desc' },
      take: query.limit ?? 50,
      skip: query.offset ?? 0,
    });
    return deals.map(DealResponseDto.fromEntity);
  }

  async findOne(id: string, currentUser: AuthenticatedUser): Promise<DealResponseDto> {
    const deal = await this.findOrThrow(id, currentUser);
    return DealResponseDto.fromEntity(deal);
  }

  async changeStatus(
    id: string,
    dto: ChangeDealStatusDto,
    currentUser: AuthenticatedUser,
  ): Promise<DealResponseDto> {
    const deal = await this.findOrThrow(id, currentUser);

    const allowedNextStatuses = DEAL_STATUS_TRANSITIONS[deal.status];
    if (!allowedNextStatuses.includes(dto.status)) {
      throw new BadRequestException(
        `Недопустимый переход статуса сделки: ${deal.status} → ${dto.status}.`,
      );
    }

    const shouldRestoreStock = STOCK_RESTORING_STATUSES.has(dto.status) && deal.warehouseId;
    const isTerminal = TERMINAL_DEAL_STATUSES.has(dto.status);

    const updated = await this.prisma.$transaction(async (tx) => {
      if (shouldRestoreStock) {
        for (const item of deal.items) {
          // Product/Warehouse are only ever soft-deactivated (see catalog
          // module), never hard-deleted, so their Stock row is guaranteed
          // to still exist here — a plain increment is safe.
          await tx.stock.updateMany({
            where: { warehouseId: deal.warehouseId!, productId: item.productId },
            data: { quantity: { increment: item.quantity } },
          });
        }
      }

      return tx.deal.update({
        where: { id },
        data: { status: dto.status, closedAt: isTerminal ? new Date() : undefined },
        include: { items: { include: { product: true } } },
      });
    });

    return DealResponseDto.fromEntity(updated);
  }

  private async resolveDelivery(dto: CreateDealDto): Promise<ResolvedDelivery> {
    const providedCount = [dto.deliveryOptionId, dto.deliveryQuoteId, dto.deliveryCost].filter(
      (value) => value !== undefined && value !== null,
    ).length;
    if (providedCount > 1) {
      throw new BadRequestException(
        'Укажите не более одного способа определения стоимости доставки: deliveryOptionId, deliveryQuoteId или deliveryCost.',
      );
    }

    if (dto.deliveryOptionId) {
      const option = await this.prisma.deliveryOption.findUnique({
        where: { id: dto.deliveryOptionId },
      });
      if (!option) {
        throw new NotFoundException('Условие доставки не найдено.');
      }
      return { deliveryCost: new Decimal(option.price), deliveryOptionId: option.id };
    }

    if (dto.deliveryQuoteId) {
      const quote = await this.prisma.deliveryQuote.findUnique({
        where: { id: dto.deliveryQuoteId },
      });
      if (!quote) {
        throw new NotFoundException('Оценка доставки не найдена.');
      }
      const alreadyLinked = await this.prisma.deal.findUnique({
        where: { deliveryQuoteId: quote.id },
      });
      if (alreadyLinked) {
        throw new ConflictException('Эта оценка доставки уже привязана к другой сделке.');
      }
      return { deliveryCost: new Decimal(quote.cost), deliveryQuoteId: quote.id };
    }

    if (dto.deliveryCost !== undefined) {
      return { deliveryCost: new Decimal(dto.deliveryCost) };
    }

    return { deliveryCost: new Decimal(0) };
  }

  private async computeLegalEntityMarkup(subtotal: Decimal, tenantId: string): Promise<Decimal> {
    const tenant = await this.prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } });
    return subtotal.times(tenant.legalEntityMarkupPercent).dividedBy(100);
  }

  private async findOrThrow(id: string, currentUser: AuthenticatedUser) {
    const deal = await this.prisma.deal.findUnique({
      where: { id },
      include: { items: { include: { product: true } } },
    });
    if (!deal || (currentUser.role === Role.MANAGER && deal.managerId !== currentUser.id)) {
      throw new NotFoundException('Сделка не найдена.');
    }
    return deal;
  }
}

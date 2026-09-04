import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { DeliveryQuoteSource, Prisma } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { TenantPrismaClient } from '../common/prisma/create-tenant-prisma-client';
import { CurrentTenantService } from '../common/prisma/current-tenant.service';
import { TENANT_PRISMA } from '../common/prisma/prisma.constants';
import { DeliveryOptionResponseDto } from '../catalog/delivery-options/dto/delivery-option-response.dto';
import { DELIVERY_ESTIMATOR } from './delivery-calc.constants';
import { DeliveryCacheService } from './delivery-cache.service';
import {
  DeliveryCalcQuoteDto,
  DeliveryCalcResponseDto,
  DeliveryCalcVariantDto,
} from './dto/delivery-calc-response.dto';
import { DeliveryCalcRequestDto } from './dto/delivery-calc-request.dto';
import { CreateManualDeliveryQuoteDto } from './dto/create-manual-delivery-quote.dto';
import { DeliveryEstimator } from './delivery-estimator.interface';

@Injectable()
export class DeliveryCalcService {
  constructor(
    @Inject(TENANT_PRISMA) private readonly prisma: TenantPrismaClient,
    private readonly currentTenant: CurrentTenantService,
    private readonly deliveryCache: DeliveryCacheService,
    @Inject(DELIVERY_ESTIMATOR) private readonly deliveryEstimator: DeliveryEstimator,
  ) {}

  /**
   * Implements the 5-step algorithm from the spec:
   *  1) warehouses with enough Stock for every requested item;
   *  2) warehouse city == destination city (case-insensitive) → local, no
   *     DeliveryQuote row — the caller picks from the tenant's fixed
   *     DeliveryOptions instead (courier/pickup have flat prices, unrelated
   *     to distance);
   *  3) different cities → Redis cache by (fromCity, toCity, weightBucket),
   *     miss → DeepSeek, cache the result, persist a DeliveryQuote row
   *     (source=AI_ESTIMATE) either way — a fresh row every call even on a
   *     cache hit, because Deal.deliveryQuoteId is unique and a later Deal
   *     needs its own row to link to, not a shared one;
   *  4) legal entity + VAT invoice → legalEntityMarkup on the goods subtotal;
   *  5) sort local-first, then by ETA, then by price.
   *
   * A DeepSeek failure for one warehouse (not configured, API error,
   * invalid JSON) doesn't fail the whole request — that variant just comes
   * back with quoteUnavailableReason set instead of a quote, so local
   * options and other warehouses' quotes are still useful.
   */
  async quote(dto: DeliveryCalcRequestDto): Promise<DeliveryCalcResponseDto> {
    const tenantId = this.currentTenant.tenantId;

    const requestedQtyByProduct = new Map<string, number>();
    for (const item of dto.items) {
      requestedQtyByProduct.set(
        item.productId,
        (requestedQtyByProduct.get(item.productId) ?? 0) + item.quantity,
      );
    }
    const productIds = [...requestedQtyByProduct.keys()];

    const products = await this.prisma.product.findMany({ where: { id: { in: productIds } } });
    if (products.length !== productIds.length) {
      throw new NotFoundException('Один или несколько товаров не найдены.');
    }

    let subtotal = new Decimal(0);
    let totalWeightKg = new Decimal(0);
    for (const product of products) {
      const quantity = requestedQtyByProduct.get(product.id) ?? 0;
      subtotal = subtotal.plus(new Decimal(product.price).times(quantity));
      if (product.weightKg) {
        totalWeightKg = totalWeightKg.plus(new Decimal(product.weightKg).times(quantity));
      }
    }

    const tenant = await this.prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } });
    const legalEntityMarkup =
      dto.buyerType === 'LEGAL_ENTITY' && dto.requiresVatInvoice
        ? subtotal.times(tenant.legalEntityMarkupPercent).dividedBy(100)
        : new Decimal(0);

    // Step 1: warehouses with enough stock for every requested item.
    const stocks = await this.prisma.stock.findMany({
      where: { productId: { in: productIds } },
      include: { warehouse: true },
    });
    const stockByWarehouse = new Map<string, Map<string, number>>();
    for (const stock of stocks) {
      if (!stock.warehouse.isActive) {
        continue;
      }
      const perProduct = stockByWarehouse.get(stock.warehouseId) ?? new Map<string, number>();
      perProduct.set(stock.productId, stock.quantity);
      stockByWarehouse.set(stock.warehouseId, perProduct);
    }
    const eligibleWarehouseIds = [...stockByWarehouse.entries()]
      .filter(([, qtyByProduct]) =>
        [...requestedQtyByProduct.entries()].every(
          ([productId, quantity]) => (qtyByProduct.get(productId) ?? 0) >= quantity,
        ),
      )
      .map(([warehouseId]) => warehouseId);

    if (eligibleWarehouseIds.length === 0) {
      throw new ConflictException(
        'Нет ни одного склада, где в наличии все запрошенные товары в нужном количестве.',
      );
    }

    const warehouses = await this.prisma.warehouse.findMany({
      where: { id: { in: eligibleWarehouseIds } },
    });
    const localDeliveryOptions = await this.prisma.deliveryOption.findMany({
      orderBy: { price: 'asc' },
    });
    const localDeliveryOptionDtos = localDeliveryOptions.map(DeliveryOptionResponseDto.fromEntity);

    const variants = await Promise.all(
      warehouses.map((warehouse) =>
        this.buildVariant(
          warehouse,
          dto.destinationCity,
          totalWeightKg,
          localDeliveryOptionDtos,
          tenantId,
        ),
      ),
    );

    variants.sort((a, b) => this.compareVariants(a, b, localDeliveryOptionDtos));

    return {
      subtotal: subtotal.toString(),
      legalEntityMarkup: legalEntityMarkup.toString(),
      totalWeightKg: totalWeightKg.toString(),
      variants,
    };
  }

  async createManualQuote(dto: CreateManualDeliveryQuoteDto): Promise<DeliveryCalcQuoteDto> {
    const warehouse = await this.prisma.warehouse.findUnique({ where: { id: dto.warehouseId } });
    if (!warehouse) {
      throw new NotFoundException('Склад не найден.');
    }

    const quote = await this.prisma.deliveryQuote.create({
      data: {
        tenantId: this.currentTenant.tenantId,
        warehouseId: dto.warehouseId,
        destinationCity: dto.destinationCity,
        weightKg: dto.weightKg,
        cost: dto.cost,
        etaDaysMin: dto.etaDaysMin,
        etaDaysMax: dto.etaDaysMax,
        source: DeliveryQuoteSource.MANUAL,
        isApproximate: false,
      },
    });
    return this.toQuoteDto(quote);
  }

  private async buildVariant(
    warehouse: { id: string; name: string; city: string },
    destinationCity: string,
    totalWeightKg: Decimal,
    localDeliveryOptions: DeliveryOptionResponseDto[],
    tenantId: string,
  ): Promise<DeliveryCalcVariantDto> {
    const isLocal = warehouse.city.trim().toLowerCase() === destinationCity.trim().toLowerCase();

    if (isLocal) {
      return {
        warehouseId: warehouse.id,
        warehouseName: warehouse.name,
        warehouseCity: warehouse.city,
        isLocal: true,
        localDeliveryOptions,
      };
    }

    const weightNumber = totalWeightKg.toNumber();
    let estimate = await this.deliveryCache.get(warehouse.city, destinationCity, weightNumber);
    let quoteUnavailableReason: string | undefined;

    if (!estimate) {
      try {
        estimate = await this.deliveryEstimator.estimate({
          fromCity: warehouse.city,
          toCity: destinationCity,
          weightKg: weightNumber,
        });
        await this.deliveryCache.set(warehouse.city, destinationCity, weightNumber, estimate);
      } catch (error) {
        quoteUnavailableReason = error instanceof Error ? error.message : String(error);
      }
    }

    if (!estimate) {
      return {
        warehouseId: warehouse.id,
        warehouseName: warehouse.name,
        warehouseCity: warehouse.city,
        isLocal: false,
        quoteUnavailableReason,
      };
    }

    const quoteRow = await this.prisma.deliveryQuote.create({
      data: {
        tenantId,
        warehouseId: warehouse.id,
        destinationCity,
        weightKg: totalWeightKg,
        cost: estimate.costRub,
        etaDaysMin: estimate.etaDaysMin,
        etaDaysMax: estimate.etaDaysMax,
        source: DeliveryQuoteSource.AI_ESTIMATE,
        isApproximate: true,
        rawResponse: estimate.raw as Prisma.InputJsonValue | undefined,
      },
    });

    return {
      warehouseId: warehouse.id,
      warehouseName: warehouse.name,
      warehouseCity: warehouse.city,
      isLocal: false,
      quote: this.toQuoteDto(quoteRow),
    };
  }

  /**
   * "По наличию → сроку → цене": every returned variant already has enough
   * stock (step 1 filtered that), so "availability" is read as local vs.
   * cross-city — local delivery is the most immediately available, certain
   * option, so it's ranked first regardless of a cross-city quote's ETA.
   * Within each group, cheaper/faster wins the tie.
   */
  private compareVariants(
    a: DeliveryCalcVariantDto,
    b: DeliveryCalcVariantDto,
    localDeliveryOptions: DeliveryOptionResponseDto[],
  ): number {
    if (a.isLocal !== b.isLocal) {
      return a.isLocal ? -1 : 1;
    }

    const [etaA, priceA] = this.representativeEtaAndPrice(a, localDeliveryOptions);
    const [etaB, priceB] = this.representativeEtaAndPrice(b, localDeliveryOptions);

    if (etaA !== etaB) {
      return etaA - etaB;
    }
    return priceA - priceB;
  }

  private representativeEtaAndPrice(
    variant: DeliveryCalcVariantDto,
    localDeliveryOptions: DeliveryOptionResponseDto[],
  ): [number, number] {
    if (variant.isLocal) {
      const cheapest = localDeliveryOptions[0];
      return [cheapest?.etaDays ?? 0, cheapest ? Number(cheapest.price) : 0];
    }
    if (variant.quote) {
      return [variant.quote.etaDaysMax, Number(variant.quote.cost)];
    }
    // No usable quote — sort last within the cross-city group.
    return [Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER];
  }

  private toQuoteDto(quote: {
    id: string;
    cost: Decimal;
    etaDaysMin: number;
    etaDaysMax: number;
    isApproximate: boolean;
    source: DeliveryQuoteSource;
  }): DeliveryCalcQuoteDto {
    return {
      id: quote.id,
      cost: quote.cost.toString(),
      etaDaysMin: quote.etaDaysMin,
      etaDaysMax: quote.etaDaysMax,
      isApproximate: quote.isApproximate,
      source: quote.source,
    };
  }
}

import { ApiProperty } from '@nestjs/swagger';
import { Deal, DealItem, DealStatus, PaymentMethod } from '@prisma/client';

class DealItemResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  productId: string;

  @ApiProperty()
  productName: string;

  @ApiProperty()
  quantity: number;

  @ApiProperty({ description: 'Строка с десятичным значением' })
  unitPrice: string;

  @ApiProperty({ description: 'Строка с десятичным значением' })
  subtotal: string;
}

type DealWithItems = Deal & { items: (DealItem & { product: { name: string } })[] };

export class DealResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  leadId: string;

  @ApiProperty()
  managerId: string;

  @ApiProperty({ nullable: true, required: false })
  warehouseId: string | null;

  @ApiProperty({ nullable: true, required: false })
  deliveryOptionId: string | null;

  @ApiProperty({ nullable: true, required: false })
  deliveryQuoteId: string | null;

  @ApiProperty({ description: 'Строка с десятичным значением' })
  deliveryCost: string;

  @ApiProperty({ description: 'Строка с десятичным значением' })
  discount: string;

  @ApiProperty()
  requiresVatInvoice: boolean;

  @ApiProperty({ description: 'Строка с десятичным значением' })
  legalEntityMarkup: string;

  @ApiProperty({ description: 'Строка с десятичным значением' })
  totalAmount: string;

  @ApiProperty({ enum: PaymentMethod, nullable: true, required: false })
  paymentMethod: PaymentMethod | null;

  @ApiProperty({ enum: DealStatus })
  status: DealStatus;

  @ApiProperty({
    description:
      'Процент комиссии на момент создания сделки — зафиксирован и не пересчитывается задним числом',
  })
  commissionPercentSnap: string;

  @ApiProperty({ description: 'Строка с десятичным значением, зафиксирована при создании сделки' })
  commissionAmount: string;

  @ApiProperty({ type: [DealItemResponseDto] })
  items: DealItemResponseDto[];

  @ApiProperty()
  createdAt: Date;

  @ApiProperty({ nullable: true, required: false })
  closedAt: Date | null;

  static fromEntity(deal: DealWithItems): DealResponseDto {
    const dto = new DealResponseDto();
    dto.id = deal.id;
    dto.leadId = deal.leadId;
    dto.managerId = deal.managerId;
    dto.warehouseId = deal.warehouseId;
    dto.deliveryOptionId = deal.deliveryOptionId;
    dto.deliveryQuoteId = deal.deliveryQuoteId;
    dto.deliveryCost = deal.deliveryCost.toString();
    dto.discount = deal.discount.toString();
    dto.requiresVatInvoice = deal.requiresVatInvoice;
    dto.legalEntityMarkup = deal.legalEntityMarkup.toString();
    dto.totalAmount = deal.totalAmount.toString();
    dto.paymentMethod = deal.paymentMethod;
    dto.status = deal.status;
    dto.commissionPercentSnap = deal.commissionPercentSnap.toString();
    dto.commissionAmount = deal.commissionAmount.toString();
    dto.items = deal.items.map((item) => ({
      id: item.id,
      productId: item.productId,
      productName: item.product.name,
      quantity: item.quantity,
      unitPrice: item.unitPrice.toString(),
      subtotal: item.subtotal.toString(),
    }));
    dto.createdAt = deal.createdAt;
    dto.closedAt = deal.closedAt;
    return dto;
  }
}

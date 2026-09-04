import { ApiProperty } from '@nestjs/swagger';
import { Product } from '@prisma/client';

export class ProductResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty({ nullable: true, required: false })
  categoryId: string | null;

  @ApiProperty()
  name: string;

  @ApiProperty({ nullable: true, required: false })
  sku: string | null;

  @ApiProperty({ description: 'Строка с десятичным значением' })
  price: string;

  @ApiProperty({ nullable: true, required: false, description: 'Строка с десятичным значением' })
  costPrice: string | null;

  @ApiProperty({ nullable: true, required: false, description: 'Строка с десятичным значением' })
  weightKg: string | null;

  @ApiProperty({ nullable: true, required: false })
  specs: unknown;

  @ApiProperty({ type: [String] })
  imageUrls: string[];

  @ApiProperty()
  isActive: boolean;

  @ApiProperty()
  createdAt: Date;

  static fromEntity(product: Product): ProductResponseDto {
    const dto = new ProductResponseDto();
    dto.id = product.id;
    dto.categoryId = product.categoryId;
    dto.name = product.name;
    dto.sku = product.sku;
    dto.price = product.price.toString();
    dto.costPrice = product.costPrice?.toString() ?? null;
    dto.weightKg = product.weightKg?.toString() ?? null;
    dto.specs = product.specs;
    dto.imageUrls = product.imageUrls;
    dto.isActive = product.isActive;
    dto.createdAt = product.createdAt;
    return dto;
  }
}

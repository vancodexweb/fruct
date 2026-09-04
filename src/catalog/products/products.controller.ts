import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Roles } from '../../common/decorators/roles.decorator';
import { CreateProductDto } from './dto/create-product.dto';
import { ListProductsQueryDto } from './dto/list-products-query.dto';
import { ProductResponseDto } from './dto/product-response.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { ProductsService } from './products.service';

@ApiTags('catalog/products')
@ApiBearerAuth()
@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get()
  @ApiOperation({ summary: 'Список / поиск товаров (по названию, артикулу, характеристикам)' })
  @ApiResponse({ status: 200, type: [ProductResponseDto] })
  findAll(@Query() query: ListProductsQueryDto): Promise<ProductResponseDto[]> {
    return this.productsService.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Карточка товара' })
  @ApiResponse({ status: 200, type: ProductResponseDto })
  findOne(@Param('id') id: string): Promise<ProductResponseDto> {
    return this.productsService.findOne(id);
  }

  @Post()
  @Roles(Role.OWNER)
  @ApiOperation({ summary: '[Только OWNER] Добавить товар' })
  @ApiResponse({ status: 201, type: ProductResponseDto })
  create(@Body() dto: CreateProductDto): Promise<ProductResponseDto> {
    return this.productsService.create(dto);
  }

  @Patch(':id')
  @Roles(Role.OWNER)
  @ApiOperation({ summary: '[Только OWNER] Изменить данные товара' })
  @ApiResponse({ status: 200, type: ProductResponseDto })
  update(@Param('id') id: string, @Body() dto: UpdateProductDto): Promise<ProductResponseDto> {
    return this.productsService.update(id, dto);
  }

  @Patch(':id/deactivate')
  @Roles(Role.OWNER)
  @ApiOperation({ summary: '[Только OWNER] Снять товар с продажи' })
  @ApiResponse({ status: 200, type: ProductResponseDto })
  deactivate(@Param('id') id: string): Promise<ProductResponseDto> {
    return this.productsService.deactivate(id);
  }

  @Patch(':id/reactivate')
  @Roles(Role.OWNER)
  @ApiOperation({ summary: '[Только OWNER] Вернуть товар в продажу' })
  @ApiResponse({ status: 200, type: ProductResponseDto })
  reactivate(@Param('id') id: string): Promise<ProductResponseDto> {
    return this.productsService.reactivate(id);
  }
}

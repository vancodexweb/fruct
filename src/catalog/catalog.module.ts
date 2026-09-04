import { Module } from '@nestjs/common';
import { CategoriesController } from './categories/categories.controller';
import { CategoriesService } from './categories/categories.service';
import { DeliveryOptionsController } from './delivery-options/delivery-options.controller';
import { DeliveryOptionsService } from './delivery-options/delivery-options.service';
import { ProductsController } from './products/products.controller';
import { ProductsService } from './products/products.service';
import { StockController } from './stock/stock.controller';
import { StockService } from './stock/stock.service';
import { WarehousesController } from './warehouses/warehouses.controller';
import { WarehousesService } from './warehouses/warehouses.service';

@Module({
  controllers: [
    CategoriesController,
    ProductsController,
    WarehousesController,
    StockController,
    DeliveryOptionsController,
  ],
  providers: [
    CategoriesService,
    ProductsService,
    WarehousesService,
    StockService,
    DeliveryOptionsService,
  ],
  exports: [ProductsService, WarehousesService],
})
export class CatalogModule {}

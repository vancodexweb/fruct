import { Module } from '@nestjs/common';
import { RedisModule } from '../common/redis/redis.module';
import { DeepSeekDeliveryEstimator } from './deepseek-delivery-estimator.service';
import { DeliveryCacheService } from './delivery-cache.service';
import { DELIVERY_ESTIMATOR } from './delivery-calc.constants';
import { DeliveryCalcController } from './delivery-calc.controller';
import { DeliveryCalcService } from './delivery-calc.service';

@Module({
  imports: [RedisModule],
  controllers: [DeliveryCalcController],
  providers: [
    DeliveryCacheService,
    { provide: DELIVERY_ESTIMATOR, useClass: DeepSeekDeliveryEstimator },
    DeliveryCalcService,
  ],
  exports: [DeliveryCalcService],
})
export class DeliveryCalcModule {}

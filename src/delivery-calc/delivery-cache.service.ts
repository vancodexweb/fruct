import { Inject, Injectable } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { REDIS_CLIENT } from '../common/redis/redis.constants';
import { DELIVERY_CACHE_TTL_SECONDS, WEIGHT_BUCKET_SIZE_KG } from './delivery-calc.constants';
import { DeliveryEstimate } from './delivery-estimator.interface';

function bucketWeightKg(weightKg: number): number {
  return Math.max(
    WEIGHT_BUCKET_SIZE_KG,
    Math.ceil(weightKg / WEIGHT_BUCKET_SIZE_KG) * WEIGHT_BUCKET_SIZE_KG,
  );
}

function normalizeCity(city: string): string {
  return city.trim().toLowerCase();
}

function buildCacheKey(fromCity: string, toCity: string, weightKg: number): string {
  return `delivery:${normalizeCity(fromCity)}:${normalizeCity(toCity)}:${bucketWeightKg(weightKg)}`;
}

/** `delivery:{fromCity}:{toCity}:{weightBucket}`, TTL 24h — see spec step 3. */
@Injectable()
export class DeliveryCacheService {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async get(fromCity: string, toCity: string, weightKg: number): Promise<DeliveryEstimate | null> {
    const raw = await this.redis.get(buildCacheKey(fromCity, toCity, weightKg));
    if (!raw) {
      return null;
    }
    try {
      return JSON.parse(raw) as DeliveryEstimate;
    } catch {
      // A corrupted cache entry is a cache miss, not a request failure.
      return null;
    }
  }

  async set(
    fromCity: string,
    toCity: string,
    weightKg: number,
    estimate: DeliveryEstimate,
  ): Promise<void> {
    await this.redis.set(
      buildCacheKey(fromCity, toCity, weightKg),
      JSON.stringify(estimate),
      'EX',
      DELIVERY_CACHE_TTL_SECONDS,
    );
  }
}

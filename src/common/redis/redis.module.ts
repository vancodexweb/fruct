import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import IORedis from 'ioredis';
import { REDIS_CLIENT } from './redis.constants';

/**
 * General-purpose cache/lookup Redis client (e.g. delivery-calc's quote
 * cache). Deliberately a separate connection from the one BullMQ owns in
 * AppModule — BullMQ Workers hold a dedicated blocking connection, and
 * mixing regular GET/SET traffic onto that connection is a well-known
 * footgun (BullMQ's own docs warn against sharing it).
 */
@Global()
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => new IORedis(config.getOrThrow<string>('REDIS_URL')),
    },
  ],
  exports: [REDIS_CLIENT],
})
export class RedisModule {}

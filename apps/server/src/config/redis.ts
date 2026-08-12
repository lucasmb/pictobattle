import type { RedisOptions } from 'ioredis';

export function getRedisOptions(): RedisOptions {
    return {
        host: process.env.REDIS_HOST || 'localhost',
        port: Number(process.env.REDIS_PORT) || 6379,
        retryStrategy: (times) => Math.min(times * 200, 2000),
        maxRetriesPerRequest: 3,
        enableReadyCheck: true,
        lazyConnect: false,
    };
}
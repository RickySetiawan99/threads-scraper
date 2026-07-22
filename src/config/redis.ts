import { ConnectionOptions } from 'bullmq';
import Redis from 'ioredis';

function getRedisConnection(): ConnectionOptions {
  if (process.env.REDIS_URL) {
    try {
      const url = new URL(process.env.REDIS_URL);
      return {
        host: url.hostname,
        port: parseInt(url.port || '6379', 10),
        username: url.username ? decodeURIComponent(url.username) : undefined,
        password: url.password ? decodeURIComponent(url.password) : undefined,
        tls: url.protocol === 'rediss:' ? { rejectUnauthorized: false } : undefined,
      };
    } catch (e) {
      console.error('Failed to parse REDIS_URL, fallback to host/port configs:', e);
    }
  }

  return {
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
  };
}

let rawRedisClient: Redis | null = null;
export function getRawRedisClient(): Redis {
  if (!rawRedisClient) {
    if (process.env.REDIS_URL) {
      rawRedisClient = new Redis(process.env.REDIS_URL, { tls: { rejectUnauthorized: false } });
    } else {
      rawRedisClient = new Redis({
        host: process.env.REDIS_HOST || '127.0.0.1',
        port: parseInt(process.env.REDIS_PORT || '6379', 10),
        password: process.env.REDIS_PASSWORD || undefined,
      });
    }
  }
  return rawRedisClient;
}

export const redisConnection: ConnectionOptions = getRedisConnection();
export const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || 'default-secret-key';

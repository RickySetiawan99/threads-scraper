import { ConnectionOptions } from 'bullmq';
import Redis from 'ioredis';

const DEFAULT_REDIS_URL = process.env.REDIS_URL || "rediss://default:gQAAAAAAAtBOAAIgcDJkZDJkYjlmZWU4ZWY0ZjlhOWQxZGJkNjU0YTQ4NTNjZg@enhanced-dragon-184398.upstash.io:6379";

function getRedisConnection(): ConnectionOptions {
  if (DEFAULT_REDIS_URL) {
    try {
      const url = new URL(DEFAULT_REDIS_URL);
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
    if (DEFAULT_REDIS_URL) {
      rawRedisClient = new Redis(DEFAULT_REDIS_URL, { tls: { rejectUnauthorized: false } });
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
export const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || 'secret-key-super-aman';

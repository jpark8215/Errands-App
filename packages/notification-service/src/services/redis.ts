import Redis from 'ioredis';
import { config } from '../utils/config';

export const redis = new Redis(config.REDIS_URL, {
  lazyConnect: true,
  maxRetriesPerRequest: 3,
});

export const keys = {
  deviceTokens: (userId: string) => `notif:devices:${userId}`,
  preferences: (userId: string) => `notif:prefs:${userId}`,
  socketUser: (socketId: string) => `notif:socket:${socketId}:user`,
};

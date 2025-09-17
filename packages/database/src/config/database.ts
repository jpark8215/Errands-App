import { Pool, PoolConfig } from 'pg';
import { createClient, RedisClientType } from 'redis';
import { logger } from '../utils/logger';

export interface DatabaseConfig {
  postgres: PoolConfig;
  redis: {
    url: string;
  };
}

export class DatabaseManager {
  private postgresPool: Pool;
  private redisClient: RedisClientType;
  private isConnected = false;

  constructor(config: DatabaseConfig) {
    // PostgreSQL connection pool
    this.postgresPool = new Pool({
      ...config.postgres,
      max: 20, // Maximum number of clients in the pool
      idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
      connectionTimeoutMillis: 2000, // Return an error after 2 seconds if connection could not be established
      maxUses: 7500, // Close (and replace) a connection after it has been used 7500 times
    });

    // Redis client
    this.redisClient = createClient({
      url: config.redis.url,
      socket: {
        reconnectStrategy: (retries) => Math.min(retries * 50, 500)
      }
    });

    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    // PostgreSQL event handlers
    this.postgresPool.on('connect', (client) => {
      logger.info('PostgreSQL client connected');
    });

    this.postgresPool.on('error', (err) => {
      logger.error('Unexpected error on idle PostgreSQL client', err);
    });

    // Redis event handlers
    this.redisClient.on('connect', () => {
      logger.info('Redis client connected');
    });

    this.redisClient.on('error', (err) => {
      logger.error('Redis client error', err);
    });

    this.redisClient.on('reconnecting', () => {
      logger.info('Redis client reconnecting');
    });
  }

  async connect(): Promise<void> {
    try {
      // Test PostgreSQL connection
      const client = await this.postgresPool.connect();
      await client.query('SELECT NOW()');
      client.release();

      // Connect to Redis
      await this.redisClient.connect();

      // Enable PostGIS extension
      await this.enablePostGIS();

      this.isConnected = true;
      logger.info('Database connections established successfully');
    } catch (error) {
      logger.error('Failed to connect to databases', error);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    try {
      await this.postgresPool.end();
      await this.redisClient.quit();
      this.isConnected = false;
      logger.info('Database connections closed');
    } catch (error) {
      logger.error('Error closing database connections', error);
      throw error;
    }
  }

  private async enablePostGIS(): Promise<void> {
    const client = await this.postgresPool.connect();
    try {
      await client.query('CREATE EXTENSION IF NOT EXISTS postgis');
      await client.query('CREATE EXTENSION IF NOT EXISTS postgis_topology');
      logger.info('PostGIS extensions enabled');
    } catch (error) {
      logger.error('Failed to enable PostGIS extensions', error);
      throw error;
    } finally {
      client.release();
    }
  }

  getPostgresPool(): Pool {
    if (!this.isConnected) {
      throw new Error('Database not connected. Call connect() first.');
    }
    return this.postgresPool;
  }

  getRedisClient(): RedisClientType {
    if (!this.isConnected) {
      throw new Error('Database not connected. Call connect() first.');
    }
    return this.redisClient;
  }

  isHealthy(): boolean {
    return this.isConnected && !this.postgresPool.ended;
  }

  async healthCheck(): Promise<{
    postgres: boolean;
    redis: boolean;
    postgis: boolean;
  }> {
    const health = {
      postgres: false,
      redis: false,
      postgis: false
    };

    try {
      // Check PostgreSQL
      const client = await this.postgresPool.connect();
      await client.query('SELECT 1');
      client.release();
      health.postgres = true;

      // Check PostGIS
      const postgisClient = await this.postgresPool.connect();
      const result = await postgisClient.query('SELECT PostGIS_Version()');
      postgisClient.release();
      health.postgis = result.rows.length > 0;

      // Check Redis
      await this.redisClient.ping();
      health.redis = true;
    } catch (error) {
      logger.error('Health check failed', error);
    }

    return health;
  }
}

// Singleton instance
let databaseManager: DatabaseManager | null = null;

export const getDatabaseManager = (): DatabaseManager => {
  if (!databaseManager) {
    const config: DatabaseConfig = {
      postgres: {
        connectionString: process.env.DATABASE_URL || 'postgresql://errands_user:errands_password@localhost:5432/errands_buddy',
        ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
      },
      redis: {
        url: process.env.REDIS_URL || 'redis://localhost:6379',
      },
    };

    databaseManager = new DatabaseManager(config);
  }

  return databaseManager;
};

export const getPostgresPool = (): Pool => {
  return getDatabaseManager().getPostgresPool();
};

export const getRedisClient = (): RedisClientType => {
  return getDatabaseManager().getRedisClient();
};

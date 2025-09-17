import { Pool, PoolClient, QueryResult } from 'pg';
import { getPostgresPool } from '../config/database';
import { logger } from '../utils/logger';

export interface QueryOptions {
  limit?: number;
  offset?: number;
  orderBy?: string;
  orderDirection?: 'ASC' | 'DESC';
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export abstract class BaseRepository<T> {
  protected pool: Pool;
  protected tableName: string;
  protected primaryKey: string;

  constructor(tableName: string, primaryKey: string = 'id') {
    this.pool = getPostgresPool();
    this.tableName = tableName;
    this.primaryKey = primaryKey;
  }

  protected async query<R = any>(
    text: string,
    params?: any[]
  ): Promise<QueryResult<R>> {
    const start = Date.now();
    
    try {
      const result = await this.pool.query(text, params);
      const duration = Date.now() - start;
      
      logger.debug(`Query executed in ${duration}ms`, {
        query: text.substring(0, 100) + '...',
        duration,
        rowCount: result.rowCount
      });
      
      return result;
    } catch (error) {
      logger.error('Database query failed', {
        query: text,
        params,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  protected async transaction<R>(
    callback: (client: PoolClient) => Promise<R>
  ): Promise<R> {
    const client = await this.pool.connect();
    
    try {
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async findById(id: string): Promise<T | null> {
    const result = await this.query(
      `SELECT * FROM ${this.tableName} WHERE ${this.primaryKey} = $1`,
      [id]
    );
    
    return result.rows[0] || null;
  }

  async findByIds(ids: string[]): Promise<T[]> {
    if (ids.length === 0) return [];
    
    const placeholders = ids.map((_, index) => `$${index + 1}`).join(',');
    const result = await this.query(
      `SELECT * FROM ${this.tableName} WHERE ${this.primaryKey} IN (${placeholders})`,
      ids
    );
    
    return result.rows;
  }

  async findAll(options: QueryOptions = {}): Promise<T[]> {
    const { limit, offset, orderBy, orderDirection = 'ASC' } = options;
    
    let query = `SELECT * FROM ${this.tableName}`;
    const params: any[] = [];
    let paramIndex = 1;

    if (orderBy) {
      query += ` ORDER BY ${orderBy} ${orderDirection}`;
    }

    if (limit) {
      query += ` LIMIT $${paramIndex}`;
      params.push(limit);
      paramIndex++;
    }

    if (offset) {
      query += ` OFFSET $${paramIndex}`;
      params.push(offset);
      paramIndex++;
    }

    const result = await this.query(query, params);
    return result.rows;
  }

  async findPaginated(
    page: number = 1,
    limit: number = 10,
    options: QueryOptions = {}
  ): Promise<PaginatedResult<T>> {
    const offset = (page - 1) * limit;
    const { orderBy, orderDirection = 'ASC' } = options;

    // Get total count
    const countResult = await this.query(`SELECT COUNT(*) FROM ${this.tableName}`);
    const total = parseInt(countResult.rows[0].count);

    // Get data
    let query = `SELECT * FROM ${this.tableName}`;
    const params: any[] = [];
    let paramIndex = 1;

    if (orderBy) {
      query += ` ORDER BY ${orderBy} ${orderDirection}`;
    }

    query += ` LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(limit, offset);

    const result = await this.query(query, params);

    return {
      data: result.rows,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    };
  }

  async create(data: Partial<T>): Promise<T> {
    const columns = Object.keys(data);
    const values = Object.values(data);
    const placeholders = values.map((_, index) => `$${index + 1}`).join(',');
    
    const query = `
      INSERT INTO ${this.tableName} (${columns.join(',')})
      VALUES (${placeholders})
      RETURNING *
    `;
    
    const result = await this.query(query, values);
    return result.rows[0];
  }

  async update(id: string, data: Partial<T>): Promise<T | null> {
    const columns = Object.keys(data);
    const values = Object.values(data);
    const setClause = columns.map((col, index) => `${col} = $${index + 1}`).join(',');
    
    const query = `
      UPDATE ${this.tableName}
      SET ${setClause}
      WHERE ${this.primaryKey} = $${columns.length + 1}
      RETURNING *
    `;
    
    const result = await this.query(query, [...values, id]);
    return result.rows[0] || null;
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.query(
      `DELETE FROM ${this.tableName} WHERE ${this.primaryKey} = $1`,
      [id]
    );
    
    return result.rowCount > 0;
  }

  async exists(id: string): Promise<boolean> {
    const result = await this.query(
      `SELECT 1 FROM ${this.tableName} WHERE ${this.primaryKey} = $1 LIMIT 1`,
      [id]
    );
    
    return result.rows.length > 0;
  }

  async count(whereClause?: string, params?: any[]): Promise<number> {
    let query = `SELECT COUNT(*) FROM ${this.tableName}`;
    
    if (whereClause) {
      query += ` WHERE ${whereClause}`;
    }
    
    const result = await this.query(query, params);
    return parseInt(result.rows[0].count);
  }

  async findOne(whereClause: string, params?: any[]): Promise<T | null> {
    const query = `SELECT * FROM ${this.tableName} WHERE ${whereClause} LIMIT 1`;
    const result = await this.query(query, params);
    return result.rows[0] || null;
  }

  async findMany(whereClause: string, params?: any[], options?: QueryOptions): Promise<T[]> {
    const { limit, offset, orderBy, orderDirection = 'ASC' } = options || {};
    
    let query = `SELECT * FROM ${this.tableName} WHERE ${whereClause}`;
    const queryParams = [...(params || [])];
    let paramIndex = queryParams.length + 1;

    if (orderBy) {
      query += ` ORDER BY ${orderBy} ${orderDirection}`;
    }

    if (limit) {
      query += ` LIMIT $${paramIndex}`;
      queryParams.push(limit);
      paramIndex++;
    }

    if (offset) {
      query += ` OFFSET $${paramIndex}`;
      queryParams.push(offset);
      paramIndex++;
    }

    const result = await this.query(query, queryParams);
    return result.rows;
  }

  async bulkCreate(data: Partial<T>[]): Promise<T[]> {
    if (data.length === 0) return [];

    const columns = Object.keys(data[0]);
    const values = data.map(item => Object.values(item));
    const placeholders = values.map((_, rowIndex) => 
      `(${columns.map((_, colIndex) => `$${rowIndex * columns.length + colIndex + 1}`).join(',')})`
    ).join(',');

    const query = `
      INSERT INTO ${this.tableName} (${columns.join(',')})
      VALUES ${placeholders}
      RETURNING *
    `;

    const flatValues = values.flat();
    const result = await this.query(query, flatValues);
    return result.rows;
  }

  async bulkUpdate(updates: { id: string; data: Partial<T> }[]): Promise<T[]> {
    if (updates.length === 0) return [];

    const results: T[] = [];
    
    for (const update of updates) {
      const result = await this.update(update.id, update.data);
      if (result) {
        results.push(result);
      }
    }
    
    return results;
  }

  async bulkDelete(ids: string[]): Promise<number> {
    if (ids.length === 0) return 0;

    const placeholders = ids.map((_, index) => `$${index + 1}`).join(',');
    const result = await this.query(
      `DELETE FROM ${this.tableName} WHERE ${this.primaryKey} IN (${placeholders})`,
      ids
    );
    
    return result.rowCount || 0;
  }
}

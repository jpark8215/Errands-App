import { BaseRepository } from './BaseRepository';
import { Task, TaskStatus, TaskCategory, TaskLocation, GeoPoint, TaskSearchFilters } from '@errands-buddy/shared-types';
import { QueryResult } from 'pg';

export interface TaskWithLocation extends Task {
  location: TaskLocation;
}

export interface TaskWithAssignment extends Task {
  assignment?: {
    id: string;
    taskerId: string;
    acceptedAt: Date;
    startedAt?: Date;
    completedAt?: Date;
  };
}

export interface TaskCreationData {
  requesterId: string;
  title: string;
  description: string;
  category: TaskCategory;
  compensation: number;
  deadline: Date;
  isUrgent?: boolean;
  estimatedDuration?: number;
  pickupLocation?: GeoPoint & { address: string };
  deliveryLocation?: GeoPoint & { address: string };
  serviceArea?: { northeast: GeoPoint; southwest: GeoPoint };
}

export interface TaskUpdateData {
  title?: string;
  description?: string;
  category?: TaskCategory;
  compensation?: number;
  deadline?: Date;
  status?: TaskStatus;
  isUrgent?: boolean;
  estimatedDuration?: number;
}

export interface GeospatialSearchOptions {
  centerLat: number;
  centerLng: number;
  radiusKm: number;
  category?: TaskCategory;
  minCompensation?: number;
  maxCompensation?: number;
  status?: TaskStatus[];
  isUrgent?: boolean;
  limit?: number;
}

export class TaskRepository extends BaseRepository<Task> {
  constructor() {
    super('tasks', 'id');
  }

  async createWithLocation(taskData: TaskCreationData): Promise<TaskWithLocation> {
    return await this.transaction(async (client) => {
      // Create task
      const taskResult = await client.query(`
        INSERT INTO tasks (
          requester_id, title, description, category, compensation, 
          deadline, is_urgent, estimated_duration, status
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING *
      `, [
        taskData.requesterId,
        taskData.title,
        taskData.description,
        taskData.category,
        taskData.compensation,
        taskData.deadline,
        taskData.isUrgent || false,
        taskData.estimatedDuration,
        'draft'
      ]);

      const task = taskResult.rows[0];

      // Create task location
      if (taskData.pickupLocation || taskData.deliveryLocation || taskData.serviceArea) {
        await client.query(`
          INSERT INTO task_locations (
            task_id, pickup_location, pickup_address, 
            delivery_location, delivery_address, service_area
          )
          VALUES ($1, $2, $3, $4, $5, $6)
        `, [
          task.id,
          taskData.pickupLocation ? 
            `POINT(${taskData.pickupLocation.longitude} ${taskData.pickupLocation.latitude})` : null,
          taskData.pickupLocation?.address || null,
          taskData.deliveryLocation ? 
            `POINT(${taskData.deliveryLocation.longitude} ${taskData.deliveryLocation.latitude})` : null,
          taskData.deliveryLocation?.address || null,
          taskData.serviceArea ? 
            `POLYGON((${taskData.serviceArea.southwest.longitude} ${taskData.serviceArea.southwest.latitude}, 
                     ${taskData.serviceArea.northeast.longitude} ${taskData.serviceArea.southwest.latitude}, 
                     ${taskData.serviceArea.northeast.longitude} ${taskData.serviceArea.northeast.latitude}, 
                     ${taskData.serviceArea.southwest.longitude} ${taskData.serviceArea.northeast.latitude}, 
                     ${taskData.serviceArea.southwest.longitude} ${taskData.serviceArea.southwest.latitude}))` : null
        ]);
      }

      return await this.findByIdWithLocation(task.id) as TaskWithLocation;
    });
  }

  async findByIdWithLocation(taskId: string): Promise<TaskWithLocation | null> {
    const result = await this.query(`
      SELECT 
        t.*,
        tl.pickup_location,
        tl.pickup_address,
        tl.delivery_location,
        tl.delivery_address,
        tl.service_area
      FROM tasks t
      LEFT JOIN task_locations tl ON t.id = tl.task_id
      WHERE t.id = $1
    `, [taskId]);

    if (result.rows.length === 0) return null;

    const row = result.rows[0];
    return this.mapRowToTaskWithLocation(row);
  }

  async findByIdWithAssignment(taskId: string): Promise<TaskWithAssignment | null> {
    const result = await this.query(`
      SELECT 
        t.*,
        ta.id as assignment_id,
        ta.tasker_id,
        ta.accepted_at,
        ta.started_at,
        ta.completed_at
      FROM tasks t
      LEFT JOIN task_assignments ta ON t.id = ta.task_id
      WHERE t.id = $1
    `, [taskId]);

    if (result.rows.length === 0) return null;

    const row = result.rows[0];
    const task = this.mapRowToTask(row);
    
    return {
      ...task,
      assignment: row.assignment_id ? {
        id: row.assignment_id,
        taskerId: row.tasker_id,
        acceptedAt: row.accepted_at,
        startedAt: row.started_at,
        completedAt: row.completed_at
      } : undefined
    };
  }

  async findNearbyTasks(options: GeospatialSearchOptions): Promise<TaskWithLocation[]> {
    const {
      centerLat,
      centerLng,
      radiusKm,
      category,
      minCompensation,
      maxCompensation,
      status = ['posted'],
      isUrgent,
      limit = 50
    } = options;

    let whereConditions = ['t.status = ANY($1)'];
    const params: any[] = [status];
    let paramIndex = 2;

    if (category) {
      whereConditions.push(`t.category = $${paramIndex}`);
      params.push(category);
      paramIndex++;
    }

    if (minCompensation !== undefined) {
      whereConditions.push(`t.compensation >= $${paramIndex}`);
      params.push(minCompensation);
      paramIndex++;
    }

    if (maxCompensation !== undefined) {
      whereConditions.push(`t.compensation <= $${paramIndex}`);
      params.push(maxCompensation);
      paramIndex++;
    }

    if (isUrgent !== undefined) {
      whereConditions.push(`t.is_urgent = $${paramIndex}`);
      params.push(isUrgent);
      paramIndex++;
    }

    const whereClause = whereConditions.join(' AND ');

    const result = await this.query(`
      SELECT 
        t.*,
        tl.pickup_location,
        tl.pickup_address,
        tl.delivery_location,
        tl.delivery_address,
        tl.service_area,
        ST_Distance(
          COALESCE(tl.pickup_location, tl.delivery_location),
          ST_GeomFromText($${paramIndex}, 4326)
        ) as distance
      FROM tasks t
      LEFT JOIN task_locations tl ON t.id = tl.task_id
      WHERE ${whereClause}
        AND (
          tl.pickup_location IS NOT NULL OR 
          tl.delivery_location IS NOT NULL
        )
        AND ST_DWithin(
          COALESCE(tl.pickup_location, tl.delivery_location),
          ST_GeomFromText($${paramIndex}, 4326),
          $${paramIndex + 1}
        )
      ORDER BY 
        t.is_urgent DESC,
        distance ASC,
        t.created_at DESC
      LIMIT $${paramIndex + 2}
    `, [
      ...params,
      `POINT(${centerLng} ${centerLat})`,
      radiusKm * 1000, // Convert km to meters
      limit
    ]);

    return result.rows.map(row => this.mapRowToTaskWithLocation(row));
  }

  async findTasksByRequester(requesterId: string, status?: TaskStatus[]): Promise<Task[]> {
    if (status && status.length > 0) {
      return await this.findMany(
        'requester_id = $1 AND status = ANY($2)',
        [requesterId, status],
        { orderBy: 'created_at', orderDirection: 'DESC' }
      );
    }

    return await this.findMany(
      'requester_id = $1',
      [requesterId],
      { orderBy: 'created_at', orderDirection: 'DESC' }
    );
  }

  async findTasksByCategory(category: TaskCategory, limit: number = 50): Promise<Task[]> {
    return await this.findMany(
      'category = $1 AND status = $2',
      [category, 'posted'],
      { limit, orderBy: 'created_at', orderDirection: 'DESC' }
    );
  }

  async findUrgentTasks(limit: number = 20): Promise<Task[]> {
    return await this.findMany(
      'is_urgent = $1 AND status = $2',
      [true, 'posted'],
      { limit, orderBy: 'created_at', orderDirection: 'DESC' }
    );
  }

  async findTasksByDeadline(deadline: Date, limit: number = 50): Promise<Task[]> {
    return await this.findMany(
      'deadline <= $1 AND status = $2',
      [deadline, 'posted'],
      { limit, orderBy: 'deadline', orderDirection: 'ASC' }
    );
  }

  async searchTasks(filters: TaskSearchFilters): Promise<TaskWithLocation[]> {
    const {
      category,
      minCompensation,
      maxCompensation,
      radius,
      center,
      status = ['posted'],
      isUrgent
    } = filters;

    let whereConditions = ['t.status = ANY($1)'];
    const params: any[] = [status];
    let paramIndex = 2;

    if (category) {
      whereConditions.push(`t.category = $${paramIndex}`);
      params.push(category);
      paramIndex++;
    }

    if (minCompensation !== undefined) {
      whereConditions.push(`t.compensation >= $${paramIndex}`);
      params.push(minCompensation);
      paramIndex++;
    }

    if (maxCompensation !== undefined) {
      whereConditions.push(`t.compensation <= $${paramIndex}`);
      params.push(maxCompensation);
      paramIndex++;
    }

    if (isUrgent !== undefined) {
      whereConditions.push(`t.is_urgent = $${paramIndex}`);
      params.push(isUrgent);
      paramIndex++;
    }

    let orderClause = 'ORDER BY t.is_urgent DESC, t.created_at DESC';
    
    if (center && radius) {
      whereConditions.push(`
        ST_DWithin(
          COALESCE(tl.pickup_location, tl.delivery_location),
          ST_GeomFromText($${paramIndex}, 4326),
          $${paramIndex + 1}
        )
      `);
      params.push(`POINT(${center.longitude} ${center.latitude})`, radius * 1000);
      orderClause = `ORDER BY t.is_urgent DESC, ST_Distance(
        COALESCE(tl.pickup_location, tl.delivery_location),
        ST_GeomFromText($${paramIndex}, 4326)
      ) ASC, t.created_at DESC`;
    }

    const whereClause = whereConditions.join(' AND ');

    const result = await this.query(`
      SELECT 
        t.*,
        tl.pickup_location,
        tl.pickup_address,
        tl.delivery_location,
        tl.delivery_address,
        tl.service_area
      FROM tasks t
      LEFT JOIN task_locations tl ON t.id = tl.task_id
      WHERE ${whereClause}
      ${orderClause}
      LIMIT 50
    `, params);

    return result.rows.map(row => this.mapRowToTaskWithLocation(row));
  }

  async updateStatus(taskId: string, status: TaskStatus): Promise<boolean> {
    const result = await this.query(`
      UPDATE tasks
      SET status = $1, updated_at = NOW()
      WHERE id = $2
    `, [status, taskId]);

    return result.rowCount > 0;
  }

  async assignTask(taskId: string, taskerId: string): Promise<boolean> {
    return await this.transaction(async (client) => {
      // Update task status
      await client.query(`
        UPDATE tasks
        SET status = $1, updated_at = NOW()
        WHERE id = $2 AND status = $3
      `, ['assigned', taskId, 'posted']);

      // Create assignment
      await client.query(`
        INSERT INTO task_assignments (task_id, tasker_id)
        VALUES ($1, $2)
      `, [taskId, taskerId]);

      return true;
    });
  }

  async startTask(taskId: string, taskerId: string): Promise<boolean> {
    const result = await this.query(`
      UPDATE task_assignments
      SET started_at = NOW()
      WHERE task_id = $1 AND tasker_id = $2
    `, [taskId, taskerId]);

    if (result.rowCount > 0) {
      await this.updateStatus(taskId, 'in_progress');
      return true;
    }

    return false;
  }

  async completeTask(taskId: string, taskerId: string): Promise<boolean> {
    return await this.transaction(async (client) => {
      // Update assignment
      const assignmentResult = await client.query(`
        UPDATE task_assignments
        SET completed_at = NOW()
        WHERE task_id = $1 AND tasker_id = $2
      `, [taskId, taskerId]);

      if (assignmentResult.rowCount > 0) {
        // Update task status
        await client.query(`
          UPDATE tasks
          SET status = $1, updated_at = NOW()
          WHERE id = $2
        `, ['completed', taskId]);

        return true;
      }

      return false;
    });
  }

  async getTaskStats(): Promise<{
    totalTasks: number;
    postedTasks: number;
    completedTasks: number;
    cancelledTasks: number;
    averageCompensation: number;
  }> {
    const result = await this.query(`
      SELECT 
        COUNT(*) as total_tasks,
        COUNT(CASE WHEN status = 'posted' THEN 1 END) as posted_tasks,
        COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_tasks,
        COUNT(CASE WHEN status = 'cancelled' THEN 1 END) as cancelled_tasks,
        AVG(compensation) as average_compensation
      FROM tasks
    `);

    const stats = result.rows[0];
    return {
      totalTasks: parseInt(stats.total_tasks),
      postedTasks: parseInt(stats.posted_tasks),
      completedTasks: parseInt(stats.completed_tasks),
      cancelledTasks: parseInt(stats.cancelled_tasks),
      averageCompensation: parseFloat(stats.average_compensation) || 0
    };
  }

  private mapRowToTask(row: any): Task {
    return {
      id: row.id,
      requesterId: row.requester_id,
      title: row.title,
      description: row.description,
      category: row.category,
      compensation: parseFloat(row.compensation),
      deadline: row.deadline,
      status: row.status,
      isUrgent: row.is_urgent,
      estimatedDuration: row.estimated_duration,
      requirements: [], // Will be loaded separately
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      location: {
        pickup: row.pickup_location ? {
          latitude: parseFloat(row.pickup_location.y),
          longitude: parseFloat(row.pickup_location.x),
          accuracy: 0,
          timestamp: new Date(),
          address: row.pickup_address
        } : undefined,
        delivery: row.delivery_location ? {
          latitude: parseFloat(row.delivery_location.y),
          longitude: parseFloat(row.delivery_location.x),
          accuracy: 0,
          timestamp: new Date(),
          address: row.delivery_address
        } : undefined
      }
    };
  }

  private mapRowToTaskWithLocation(row: any): TaskWithLocation {
    const task = this.mapRowToTask(row);
    
    return {
      ...task,
      location: {
        pickup: row.pickup_location ? {
          latitude: parseFloat(row.pickup_location.y),
          longitude: parseFloat(row.pickup_location.x),
          accuracy: 0,
          timestamp: new Date(),
          address: row.pickup_address
        } : undefined,
        delivery: row.delivery_location ? {
          latitude: parseFloat(row.delivery_location.y),
          longitude: parseFloat(row.delivery_location.x),
          accuracy: 0,
          timestamp: new Date(),
          address: row.delivery_address
        } : undefined,
        serviceArea: row.service_area ? {
          northeast: {
            latitude: parseFloat(row.service_area.coordinates[0][2].y),
            longitude: parseFloat(row.service_area.coordinates[0][2].x),
            accuracy: 0,
            timestamp: new Date()
          },
          southwest: {
            latitude: parseFloat(row.service_area.coordinates[0][0].y),
            longitude: parseFloat(row.service_area.coordinates[0][0].x),
            accuracy: 0,
            timestamp: new Date()
          }
        } : undefined
      }
    };
  }
}

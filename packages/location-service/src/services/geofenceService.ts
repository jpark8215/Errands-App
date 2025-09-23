import { getRedisClient } from '../config/redis';
import { getDatabase } from '../config/database';
import { logger } from '../utils/logger';
import { GeoPoint, GeoBounds } from '@errands-buddy/shared-types';
import * as turf from '@turf/turf';

export interface Geofence {
  id: string;
  taskId: string;
  type: 'pickup' | 'delivery' | 'service_area' | 'safety_zone';
  center: GeoPoint;
  radius: number; // in meters
  bounds?: GeoBounds;
  isActive: boolean;
  createdAt: Date;
  metadata?: any;
}

export interface GeofenceEvent {
  id: string;
  userId: string;
  taskId: string;
  geofenceId: string;
  eventType: 'enter' | 'exit' | 'dwell';
  location: GeoPoint;
  timestamp: Date;
  metadata?: any;
}

export class GeofenceService {
  private redis = getRedisClient();
  private db = getDatabase();

  private readonly GEOFENCE_KEY = 'geofence:';
  private readonly GEOFENCE_EVENTS_KEY = 'geofence:events:';
  private readonly USER_GEOFENCE_STATE_KEY = 'geofence:state:';

  /**
   * Create a geofence for a task
   */
  async createGeofence(geofence: Omit<Geofence, 'id' | 'createdAt'>): Promise<string> {
    try {
      const geofenceId = `${geofence.taskId}_${geofence.type}_${Date.now()}`;
      const geofenceData: Geofence = {
        ...geofence,
        id: geofenceId,
        createdAt: new Date()
      };

      // Store in Redis for fast access
      await this.redis.setEx(
        `${this.GEOFENCE_KEY}${geofenceId}`,
        86400, // 24 hours TTL
        JSON.stringify(geofenceData)
      );

      // Store in database for persistence
      const query = `
        INSERT INTO geofences (id, task_id, type, center_lat, center_lng, radius, bounds, is_active, metadata, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      `;

      await this.db.query(query, [
        geofenceId,
        geofence.taskId,
        geofence.type,
        geofence.center.latitude,
        geofence.center.longitude,
        geofence.radius,
        geofence.bounds ? JSON.stringify(geofence.bounds) : null,
        geofence.isActive,
        geofence.metadata ? JSON.stringify(geofence.metadata) : null,
        geofenceData.createdAt
      ]);

      logger.info(`Created geofence ${geofenceId} for task ${geofence.taskId}`);
      return geofenceId;

    } catch (error) {
      logger.error('Error creating geofence:', error);
      throw error;
    }
  }

  /**
   * Set up geofences for a task based on task details
   */
  async setupTaskGeofences(taskId: string): Promise<string[]> {
    try {
      // Get task details from database
      const taskQuery = `
        SELECT pickup_location, delivery_location, service_area, task_type
        FROM tasks 
        WHERE id = $1
      `;

      const taskResult = await this.db.query(taskQuery, [taskId]);
      
      if (taskResult.rows.length === 0) {
        throw new Error(`Task ${taskId} not found`);
      }

      const task = taskResult.rows[0];
      const geofenceIds: string[] = [];

      // Create pickup geofence
      if (task.pickup_location) {
        const pickupLocation = JSON.parse(task.pickup_location);
        const pickupGeofenceId = await this.createGeofence({
          taskId,
          type: 'pickup',
          center: {
            latitude: pickupLocation.latitude,
            longitude: pickupLocation.longitude,
            accuracy: 10,
            timestamp: new Date()
          },
          radius: 100, // 100 meters
          isActive: true,
          metadata: { address: pickupLocation.address }
        });
        geofenceIds.push(pickupGeofenceId);
      }

      // Create delivery geofence
      if (task.delivery_location) {
        const deliveryLocation = JSON.parse(task.delivery_location);
        const deliveryGeofenceId = await this.createGeofence({
          taskId,
          type: 'delivery',
          center: {
            latitude: deliveryLocation.latitude,
            longitude: deliveryLocation.longitude,
            accuracy: 10,
            timestamp: new Date()
          },
          radius: 100, // 100 meters
          isActive: true,
          metadata: { address: deliveryLocation.address }
        });
        geofenceIds.push(deliveryGeofenceId);
      }

      // Create service area geofence for broader tasks
      if (task.service_area) {
        const serviceArea = JSON.parse(task.service_area);
        const serviceGeofenceId = await this.createGeofence({
          taskId,
          type: 'service_area',
          center: {
            latitude: (serviceArea.northeast.latitude + serviceArea.southwest.latitude) / 2,
            longitude: (serviceArea.northeast.longitude + serviceArea.southwest.longitude) / 2,
            accuracy: 10,
            timestamp: new Date()
          },
          radius: this.calculateBoundsRadius(serviceArea),
          bounds: serviceArea,
          isActive: true
        });
        geofenceIds.push(serviceGeofenceId);
      }

      logger.info(`Set up ${geofenceIds.length} geofences for task ${taskId}`);
      return geofenceIds;

    } catch (error) {
      logger.error('Error setting up task geofences:', error);
      throw error;
    }
  }

  /**
   * Check if a location triggers any geofence events
   */
  async checkGeofences(userId: string, taskId: string, location: GeoPoint): Promise<GeofenceEvent[]> {
    try {
      const events: GeofenceEvent[] = [];

      // Get all active geofences for the task
      const geofences = await this.getTaskGeofences(taskId);

      for (const geofence of geofences) {
        if (!geofence.isActive) continue;

        const isInside = this.isLocationInGeofence(location, geofence);
        const wasInside = await this.getUserGeofenceState(userId, geofence.id);

        // Check for enter event
        if (isInside && !wasInside) {
          const event = await this.createGeofenceEvent(
            userId,
            taskId,
            geofence.id,
            'enter',
            location
          );
          events.push(event);
          await this.setUserGeofenceState(userId, geofence.id, true);
        }
        // Check for exit event
        else if (!isInside && wasInside) {
          const event = await this.createGeofenceEvent(
            userId,
            taskId,
            geofence.id,
            'exit',
            location
          );
          events.push(event);
          await this.setUserGeofenceState(userId, geofence.id, false);
        }
        // Check for dwell event (staying in geofence for extended time)
        else if (isInside && wasInside) {
          const dwellTime = await this.getUserDwellTime(userId, geofence.id);
          if (dwellTime > 300000) { // 5 minutes
            const event = await this.createGeofenceEvent(
              userId,
              taskId,
              geofence.id,
              'dwell',
              location,
              { dwellTimeMs: dwellTime }
            );
            events.push(event);
          }
        }
      }

      return events;

    } catch (error) {
      logger.error('Error checking geofences:', error);
      return [];
    }
  }

  /**
   * Get all geofences for a task
   */
  private async getTaskGeofences(taskId: string): Promise<Geofence[]> {
    try {
      // First try Redis cache
      const cacheKey = `task:geofences:${taskId}`;
      const cached = await this.redis.get(cacheKey);

      if (cached) {
        return JSON.parse(cached);
      }

      // Fallback to database
      const query = `
        SELECT id, task_id, type, center_lat, center_lng, radius, bounds, is_active, metadata, created_at
        FROM geofences 
        WHERE task_id = $1 AND is_active = true
      `;

      const result = await this.db.query(query, [taskId]);
      const geofences: Geofence[] = result.rows.map(row => ({
        id: row.id,
        taskId: row.task_id,
        type: row.type,
        center: {
          latitude: row.center_lat,
          longitude: row.center_lng,
          accuracy: 10,
          timestamp: new Date()
        },
        radius: row.radius,
        bounds: row.bounds ? JSON.parse(row.bounds) : undefined,
        isActive: row.is_active,
        createdAt: row.created_at,
        metadata: row.metadata ? JSON.parse(row.metadata) : undefined
      }));

      // Cache for 5 minutes
      await this.redis.setEx(cacheKey, 300, JSON.stringify(geofences));

      return geofences;

    } catch (error) {
      logger.error('Error getting task geofences:', error);
      return [];
    }
  }

  /**
   * Check if a location is inside a geofence
   */
  private isLocationInGeofence(location: GeoPoint, geofence: Geofence): boolean {
    try {
      if (geofence.bounds) {
        // Use polygon bounds check
        const point = turf.point([location.longitude, location.latitude]);
        const polygon = turf.polygon([[
          [geofence.bounds.southwest.longitude, geofence.bounds.southwest.latitude],
          [geofence.bounds.northeast.longitude, geofence.bounds.southwest.latitude],
          [geofence.bounds.northeast.longitude, geofence.bounds.northeast.latitude],
          [geofence.bounds.southwest.longitude, geofence.bounds.northeast.latitude],
          [geofence.bounds.southwest.longitude, geofence.bounds.southwest.latitude]
        ]]);
        return turf.booleanPointInPolygon(point, polygon);
      } else {
        // Use circular geofence
        const center = turf.point([geofence.center.longitude, geofence.center.latitude]);
        const point = turf.point([location.longitude, location.latitude]);
        const distance = turf.distance(center, point, { units: 'meters' });
        return distance <= geofence.radius;
      }
    } catch (error) {
      logger.error('Error checking location in geofence:', error);
      return false;
    }
  }

  /**
   * Get user's current state for a geofence
   */
  private async getUserGeofenceState(userId: string, geofenceId: string): Promise<boolean> {
    try {
      const stateKey = `${this.USER_GEOFENCE_STATE_KEY}${userId}:${geofenceId}`;
      const state = await this.redis.get(stateKey);
      return state === 'true';
    } catch (error) {
      logger.error('Error getting user geofence state:', error);
      return false;
    }
  }

  /**
   * Set user's state for a geofence
   */
  private async setUserGeofenceState(userId: string, geofenceId: string, isInside: boolean): Promise<void> {
    try {
      const stateKey = `${this.USER_GEOFENCE_STATE_KEY}${userId}:${geofenceId}`;
      await this.redis.setEx(stateKey, 86400, isInside.toString()); // 24 hours TTL

      if (isInside) {
        // Set enter timestamp for dwell time calculation
        const enterKey = `${stateKey}:enter`;
        await this.redis.setEx(enterKey, 86400, Date.now().toString());
      }
    } catch (error) {
      logger.error('Error setting user geofence state:', error);
    }
  }

  /**
   * Get user's dwell time in a geofence
   */
  private async getUserDwellTime(userId: string, geofenceId: string): Promise<number> {
    try {
      const enterKey = `${this.USER_GEOFENCE_STATE_KEY}${userId}:${geofenceId}:enter`;
      const enterTime = await this.redis.get(enterKey);
      
      if (!enterTime) return 0;
      
      return Date.now() - parseInt(enterTime);
    } catch (error) {
      logger.error('Error getting user dwell time:', error);
      return 0;
    }
  }

  /**
   * Create a geofence event
   */
  private async createGeofenceEvent(
    userId: string,
    taskId: string,
    geofenceId: string,
    eventType: 'enter' | 'exit' | 'dwell',
    location: GeoPoint,
    metadata?: any
  ): Promise<GeofenceEvent> {
    try {
      const event: GeofenceEvent = {
        id: `${geofenceId}_${eventType}_${Date.now()}`,
        userId,
        taskId,
        geofenceId,
        eventType,
        location,
        timestamp: new Date(),
        metadata
      };

      // Store in Redis for real-time access
      const eventKey = `${this.GEOFENCE_EVENTS_KEY}${taskId}`;
      await this.redis.lPush(eventKey, JSON.stringify(event));
      await this.redis.expire(eventKey, 86400); // 24 hours TTL
      await this.redis.lTrim(eventKey, 0, 99); // Keep last 100 events

      // Store in database for persistence
      const query = `
        INSERT INTO geofence_events (id, user_id, task_id, geofence_id, event_type, latitude, longitude, metadata, timestamp)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      `;

      await this.db.query(query, [
        event.id,
        userId,
        taskId,
        geofenceId,
        eventType,
        location.latitude,
        location.longitude,
        metadata ? JSON.stringify(metadata) : null,
        event.timestamp
      ]);

      logger.info(`Created geofence event: ${eventType} for user ${userId} in geofence ${geofenceId}`);
      return event;

    } catch (error) {
      logger.error('Error creating geofence event:', error);
      throw error;
    }
  }

  /**
   * Calculate radius for bounds-based geofence
   */
  private calculateBoundsRadius(bounds: GeoBounds): number {
    try {
      const center = turf.point([
        (bounds.northeast.longitude + bounds.southwest.longitude) / 2,
        (bounds.northeast.latitude + bounds.southwest.latitude) / 2
      ]);
      const corner = turf.point([bounds.northeast.longitude, bounds.northeast.latitude]);
      return turf.distance(center, corner, { units: 'meters' });
    } catch (error) {
      logger.error('Error calculating bounds radius:', error);
      return 1000; // Default 1km radius
    }
  }

  /**
   * Deactivate geofences for a completed task
   */
  async deactivateTaskGeofences(taskId: string): Promise<void> {
    try {
      const query = `
        UPDATE geofences 
        SET is_active = false 
        WHERE task_id = $1
      `;

      await this.db.query(query, [taskId]);

      // Clear cache
      await this.redis.del(`task:geofences:${taskId}`);

      logger.info(`Deactivated geofences for task ${taskId}`);

    } catch (error) {
      logger.error('Error deactivating task geofences:', error);
      throw error;
    }
  }

  /**
   * Get geofence events for a task
   */
  async getTaskGeofenceEvents(taskId: string): Promise<GeofenceEvent[]> {
    try {
      const eventKey = `${this.GEOFENCE_EVENTS_KEY}${taskId}`;
      const events = await this.redis.lRange(eventKey, 0, -1);

      return events.map(event => JSON.parse(event)).reverse();

    } catch (error) {
      logger.error('Error getting task geofence events:', error);
      return [];
    }
  }
}

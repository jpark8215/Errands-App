import { getRedisClient } from '../config/redis';
import { getDatabase } from '../config/database';
import { logger } from '../utils/logger';
import { GeoPoint, RoutePoint, ActiveTasker } from '@errands-buddy/shared-types';
import { v4 as uuidv4 } from 'uuid';

export class LocationService {
  private redis = getRedisClient();
  private db = getDatabase();

  // Redis key patterns
  private readonly USER_LOCATION_KEY = 'location:user:';
  private readonly TASK_TRACKING_KEY = 'tracking:task:';
  private readonly ACTIVE_TASKERS_KEY = 'taskers:active';
  private readonly LOCATION_HISTORY_KEY = 'history:location:';

  // TTL settings (in seconds)
  private readonly LOCATION_TTL = 3600; // 1 hour
  private readonly TRACKING_TTL = 86400; // 24 hours
  private readonly HISTORY_TTL = 604800; // 7 days

  /**
   * Update user's current location in Redis cache and optionally in database
   */
  async updateUserLocation(userId: string, location: GeoPoint, taskId?: string): Promise<void> {
    try {
      const locationData = {
        ...location,
        userId,
        taskId: taskId || null,
        updatedAt: new Date().toISOString()
      };

      // Store in Redis with TTL
      await this.redis.setEx(
        `${this.USER_LOCATION_KEY}${userId}`,
        this.LOCATION_TTL,
        JSON.stringify(locationData)
      );

      // Add to geospatial index for nearby queries
      await this.redis.geoAdd(this.ACTIVE_TASKERS_KEY, {
        longitude: location.longitude,
        latitude: location.latitude,
        member: userId
      });

      // If tracking a task, store route point
      if (taskId) {
        await this.addRoutePoint(userId, taskId, location);
      }

      // Store in location history
      await this.addLocationHistory(userId, location);

      logger.debug(`Updated location for user ${userId}`, { location, taskId });

    } catch (error) {
      logger.error('Error updating user location:', error);
      throw error;
    }
  }

  /**
   * Get user's current location from cache
   */
  async getUserLocation(userId: string): Promise<GeoPoint | null> {
    try {
      const locationData = await this.redis.get(`${this.USER_LOCATION_KEY}${userId}`);
      
      if (!locationData) {
        return null;
      }

      const parsed = JSON.parse(locationData);
      return {
        latitude: parsed.latitude,
        longitude: parsed.longitude,
        accuracy: parsed.accuracy,
        timestamp: new Date(parsed.updatedAt)
      };

    } catch (error) {
      logger.error('Error getting user location:', error);
      return null;
    }
  }

  /**
   * Get nearby users within specified radius (in meters)
   */
  async getNearbyUsers(location: GeoPoint, radiusMeters: number): Promise<ActiveTasker[]> {
    try {
      const nearbyMembers = await this.redis.geoRadius(
        this.ACTIVE_TASKERS_KEY,
        location.longitude,
        location.latitude,
        radiusMeters,
        'm',
        {
          WITHCOORD: true,
          WITHDIST: true,
          COUNT: 50 // Limit results
        }
      );

      const nearbyUsers: ActiveTasker[] = [];

      for (const member of nearbyMembers) {
        const userId = member.member;
        const userLocation = await this.getUserLocation(userId);
        
        if (userLocation) {
          // Get user availability status from database
          const userQuery = `
            SELECT availability_status, preferred_categories, last_seen
            FROM users 
            WHERE id = $1 AND availability_status = 'available'
          `;
          
          const userResult = await this.db.query(userQuery, [userId]);
          
          if (userResult.rows.length > 0) {
            const user = userResult.rows[0];
            nearbyUsers.push({
              taskerId: userId,
              location: userLocation,
              availabilityStatus: user.availability_status,
              lastSeen: user.last_seen,
              preferredCategories: user.preferred_categories || []
            });
          }
        }
      }

      return nearbyUsers;

    } catch (error) {
      logger.error('Error getting nearby users:', error);
      return [];
    }
  }

  /**
   * Start a location tracking session for a task
   */
  async startTrackingSession(userId: string, taskId: string): Promise<void> {
    try {
      const sessionId = uuidv4();
      const sessionData = {
        sessionId,
        userId,
        taskId,
        startTime: new Date().toISOString(),
        status: 'active'
      };

      await this.redis.setEx(
        `${this.TASK_TRACKING_KEY}${taskId}:${userId}`,
        this.TRACKING_TTL,
        JSON.stringify(sessionData)
      );

      // Store in database for persistence
      const query = `
        INSERT INTO location_tracking_sessions (id, user_id, task_id, start_time, status)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (user_id, task_id) 
        DO UPDATE SET start_time = $4, status = $5
      `;

      await this.db.query(query, [sessionId, userId, taskId, new Date(), 'active']);

      logger.info(`Started tracking session for user ${userId}, task ${taskId}`);

    } catch (error) {
      logger.error('Error starting tracking session:', error);
      throw error;
    }
  }

  /**
   * Stop a location tracking session
   */
  async stopTrackingSession(userId: string, taskId: string): Promise<void> {
    try {
      // Remove from Redis
      await this.redis.del(`${this.TASK_TRACKING_KEY}${taskId}:${userId}`);

      // Update database
      const query = `
        UPDATE location_tracking_sessions 
        SET end_time = $1, status = 'completed'
        WHERE user_id = $2 AND task_id = $3 AND status = 'active'
      `;

      await this.db.query(query, [new Date(), userId, taskId]);

      logger.info(`Stopped tracking session for user ${userId}, task ${taskId}`);

    } catch (error) {
      logger.error('Error stopping tracking session:', error);
      throw error;
    }
  }

  /**
   * Add a route point to the tracking history
   */
  private async addRoutePoint(userId: string, taskId: string, location: GeoPoint): Promise<void> {
    try {
      const routePoint: RoutePoint = {
        latitude: location.latitude,
        longitude: location.longitude,
        timestamp: location.timestamp,
        accuracy: location.accuracy
      };

      // Add to Redis list (for real-time access)
      const routeKey = `route:${taskId}:${userId}`;
      await this.redis.lPush(routeKey, JSON.stringify(routePoint));
      await this.redis.expire(routeKey, this.TRACKING_TTL);

      // Limit route points to prevent memory issues
      await this.redis.lTrim(routeKey, 0, 999); // Keep last 1000 points

      // Store in database for persistence
      const query = `
        INSERT INTO route_points (user_id, task_id, latitude, longitude, accuracy, timestamp)
        VALUES ($1, $2, $3, $4, $5, $6)
      `;

      await this.db.query(query, [
        userId, taskId, location.latitude, location.longitude, 
        location.accuracy, location.timestamp
      ]);

    } catch (error) {
      logger.error('Error adding route point:', error);
      throw error;
    }
  }

  /**
   * Get route tracking data for a task
   */
  async getRouteTracking(taskId: string, userId: string): Promise<RoutePoint[]> {
    try {
      const routeKey = `route:${taskId}:${userId}`;
      const routeData = await this.redis.lRange(routeKey, 0, -1);

      const route: RoutePoint[] = routeData.map(point => JSON.parse(point)).reverse();

      return route;

    } catch (error) {
      logger.error('Error getting route tracking:', error);
      return [];
    }
  }

  /**
   * Add location to user's history
   */
  private async addLocationHistory(userId: string, location: GeoPoint): Promise<void> {
    try {
      const historyKey = `${this.LOCATION_HISTORY_KEY}${userId}`;
      const locationData = {
        ...location,
        timestamp: location.timestamp.toISOString()
      };

      await this.redis.lPush(historyKey, JSON.stringify(locationData));
      await this.redis.expire(historyKey, this.HISTORY_TTL);
      
      // Keep only recent history
      await this.redis.lTrim(historyKey, 0, 99); // Keep last 100 locations

    } catch (error) {
      logger.error('Error adding location history:', error);
    }
  }

  /**
   * Update user's last seen timestamp
   */
  async updateLastSeen(userId: string): Promise<void> {
    try {
      const query = `
        UPDATE users 
        SET last_seen = $1 
        WHERE id = $2
      `;

      await this.db.query(query, [new Date(), userId]);

    } catch (error) {
      logger.error('Error updating last seen:', error);
    }
  }

  /**
   * Clean up user sessions on disconnect
   */
  async cleanupUserSessions(userId: string): Promise<void> {
    try {
      // Remove from active taskers geospatial index
      await this.redis.zRem(this.ACTIVE_TASKERS_KEY, userId);

      // Update any active tracking sessions
      const query = `
        UPDATE location_tracking_sessions 
        SET status = 'disconnected', end_time = $1
        WHERE user_id = $2 AND status = 'active'
      `;

      await this.db.query(query, [new Date(), userId]);

      logger.debug(`Cleaned up sessions for user ${userId}`);

    } catch (error) {
      logger.error('Error cleaning up user sessions:', error);
    }
  }

  /**
   * Get location statistics for analytics
   */
  async getLocationStats(userId: string, startDate: Date, endDate: Date): Promise<any> {
    try {
      const query = `
        SELECT 
          COUNT(*) as total_updates,
          AVG(accuracy) as avg_accuracy,
          MIN(timestamp) as first_update,
          MAX(timestamp) as last_update
        FROM route_points 
        WHERE user_id = $1 AND timestamp BETWEEN $2 AND $3
      `;

      const result = await this.db.query(query, [userId, startDate, endDate]);
      return result.rows[0];

    } catch (error) {
      logger.error('Error getting location stats:', error);
      return null;
    }
  }
}

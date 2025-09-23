import { getRedisClient } from '../config/redis';
import { getDatabase } from '../config/database';
import { logger } from '../utils/logger';
import { GeoPoint } from '@errands-buddy/shared-types';
import crypto from 'crypto';

export interface LocationPrivacySettings {
  userId: string;
  locationSharingEnabled: boolean;
  precisionLevel: 'exact' | 'approximate' | 'city' | 'disabled';
  shareWithTaskers: boolean;
  shareWithClients: boolean;
  shareHistoryDuration: number; // in days
  anonymizeAfterHours: number;
  allowEmergencyAccess: boolean;
  geofenceNotifications: boolean;
  updatedAt: Date;
}

export interface AnonymizedLocation {
  approximateLatitude: number;
  approximateLongitude: number;
  accuracyRadius: number;
  timestamp: Date;
  isAnonymized: boolean;
}

export class LocationPrivacyService {
  private redis = getRedisClient();
  private db = getDatabase();

  private readonly PRIVACY_SETTINGS_KEY = 'privacy:location:';
  private readonly ENCRYPTED_LOCATION_KEY = 'encrypted:location:';
  private readonly ANONYMIZATION_SALT = process.env.LOCATION_ANONYMIZATION_SALT || 'default-salt';

  // Default privacy settings
  private readonly DEFAULT_SETTINGS: Omit<LocationPrivacySettings, 'userId' | 'updatedAt'> = {
    locationSharingEnabled: true,
    precisionLevel: 'approximate',
    shareWithTaskers: true,
    shareWithClients: true,
    shareHistoryDuration: 7, // 7 days
    anonymizeAfterHours: 24, // 24 hours
    allowEmergencyAccess: true,
    geofenceNotifications: true
  };

  /**
   * Get user's location privacy settings
   */
  async getUserPrivacySettings(userId: string): Promise<LocationPrivacySettings> {
    try {
      // Try Redis cache first
      const cacheKey = `${this.PRIVACY_SETTINGS_KEY}${userId}`;
      const cached = await this.redis.get(cacheKey);

      if (cached) {
        return JSON.parse(cached);
      }

      // Fallback to database
      const query = `
        SELECT * FROM location_privacy_settings 
        WHERE user_id = $1
      `;

      const result = await this.db.query(query, [userId]);

      let settings: LocationPrivacySettings;

      if (result.rows.length > 0) {
        const row = result.rows[0];
        settings = {
          userId: row.user_id,
          locationSharingEnabled: row.location_sharing_enabled,
          precisionLevel: row.precision_level,
          shareWithTaskers: row.share_with_taskers,
          shareWithClients: row.share_with_clients,
          shareHistoryDuration: row.share_history_duration,
          anonymizeAfterHours: row.anonymize_after_hours,
          allowEmergencyAccess: row.allow_emergency_access,
          geofenceNotifications: row.geofence_notifications,
          updatedAt: row.updated_at
        };
      } else {
        // Create default settings
        settings = {
          ...this.DEFAULT_SETTINGS,
          userId,
          updatedAt: new Date()
        };
        await this.createDefaultPrivacySettings(userId);
      }

      // Cache for 1 hour
      await this.redis.setEx(cacheKey, 3600, JSON.stringify(settings));

      return settings;

    } catch (error) {
      logger.error('Error getting user privacy settings:', error);
      // Return default settings on error
      return {
        ...this.DEFAULT_SETTINGS,
        userId,
        updatedAt: new Date()
      };
    }
  }

  /**
   * Update user's location privacy settings
   */
  async updateUserPrivacySettings(
    userId: string, 
    updates: Partial<Omit<LocationPrivacySettings, 'userId' | 'updatedAt'>>
  ): Promise<void> {
    try {
      const currentSettings = await this.getUserPrivacySettings(userId);
      const newSettings = {
        ...currentSettings,
        ...updates,
        updatedAt: new Date()
      };

      // Update database
      const query = `
        UPDATE location_privacy_settings 
        SET 
          location_sharing_enabled = $2,
          precision_level = $3,
          share_with_taskers = $4,
          share_with_clients = $5,
          share_history_duration = $6,
          anonymize_after_hours = $7,
          allow_emergency_access = $8,
          geofence_notifications = $9,
          updated_at = $10
        WHERE user_id = $1
      `;

      await this.db.query(query, [
        userId,
        newSettings.locationSharingEnabled,
        newSettings.precisionLevel,
        newSettings.shareWithTaskers,
        newSettings.shareWithClients,
        newSettings.shareHistoryDuration,
        newSettings.anonymizeAfterHours,
        newSettings.allowEmergencyAccess,
        newSettings.geofenceNotifications,
        newSettings.updatedAt
      ]);

      // Update cache
      const cacheKey = `${this.PRIVACY_SETTINGS_KEY}${userId}`;
      await this.redis.setEx(cacheKey, 3600, JSON.stringify(newSettings));

      logger.info(`Updated privacy settings for user ${userId}`);

    } catch (error) {
      logger.error('Error updating user privacy settings:', error);
      throw error;
    }
  }

  /**
   * Filter location data based on privacy settings
   */
  async filterLocationData(
    location: GeoPoint, 
    privacySettings: LocationPrivacySettings,
    requestingUserId?: string,
    context?: 'task' | 'nearby' | 'emergency'
  ): Promise<GeoPoint | AnonymizedLocation> {
    try {
      // Emergency access override
      if (context === 'emergency' && privacySettings.allowEmergencyAccess) {
        return location;
      }

      // Check if location sharing is disabled
      if (!privacySettings.locationSharingEnabled) {
        throw new Error('Location sharing is disabled');
      }

      // Apply precision level filtering
      switch (privacySettings.precisionLevel) {
        case 'exact':
          return location;

        case 'approximate':
          return this.approximateLocation(location, 100); // 100m radius

        case 'city':
          return this.approximateLocation(location, 5000); // 5km radius

        case 'disabled':
          throw new Error('Location precision is disabled');

        default:
          return this.approximateLocation(location, 100);
      }

    } catch (error) {
      logger.error('Error filtering location data:', error);
      throw error;
    }
  }

  /**
   * Encrypt location data for storage
   */
  async encryptLocationData(userId: string, location: GeoPoint): Promise<string> {
    try {
      const algorithm = 'aes-256-gcm';
      const key = this.deriveEncryptionKey(userId);
      const iv = crypto.randomBytes(16);

      const cipher = crypto.createCipher(algorithm, key);
      cipher.setAAD(Buffer.from(userId));

      const locationData = JSON.stringify(location);
      let encrypted = cipher.update(locationData, 'utf8', 'hex');
      encrypted += cipher.final('hex');

      const authTag = cipher.getAuthTag();

      const encryptedData = {
        encrypted,
        iv: iv.toString('hex'),
        authTag: authTag.toString('hex'),
        timestamp: Date.now()
      };

      return JSON.stringify(encryptedData);

    } catch (error) {
      logger.error('Error encrypting location data:', error);
      throw error;
    }
  }

  /**
   * Decrypt location data
   */
  async decryptLocationData(userId: string, encryptedData: string): Promise<GeoPoint> {
    try {
      const algorithm = 'aes-256-gcm';
      const key = this.deriveEncryptionKey(userId);
      const data = JSON.parse(encryptedData);

      const decipher = crypto.createDecipher(algorithm, key);
      decipher.setAAD(Buffer.from(userId));
      decipher.setAuthTag(Buffer.from(data.authTag, 'hex'));

      let decrypted = decipher.update(data.encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');

      return JSON.parse(decrypted);

    } catch (error) {
      logger.error('Error decrypting location data:', error);
      throw error;
    }
  }

  /**
   * Anonymize location by adding noise and reducing precision
   */
  async anonymizeLocation(location: GeoPoint, radiusMeters: number = 1000): Promise<AnonymizedLocation> {
    try {
      // Add controlled random noise to coordinates
      const latNoise = (Math.random() - 0.5) * (radiusMeters / 111000); // ~111km per degree lat
      const lngNoise = (Math.random() - 0.5) * (radiusMeters / (111000 * Math.cos(location.latitude * Math.PI / 180)));

      return {
        approximateLatitude: parseFloat((location.latitude + latNoise).toFixed(4)),
        approximateLongitude: parseFloat((location.longitude + lngNoise).toFixed(4)),
        accuracyRadius: radiusMeters,
        timestamp: location.timestamp,
        isAnonymized: true
      };

    } catch (error) {
      logger.error('Error anonymizing location:', error);
      throw error;
    }
  }

  /**
   * Clean up old location data based on retention policies
   */
  async cleanupLocationHistory(userId: string): Promise<void> {
    try {
      const privacySettings = await this.getUserPrivacySettings(userId);
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - privacySettings.shareHistoryDuration);

      // Clean up route points
      const routeQuery = `
        DELETE FROM route_points 
        WHERE user_id = $1 AND timestamp < $2
      `;
      await this.db.query(routeQuery, [userId, cutoffDate]);

      // Clean up geofence events
      const eventsQuery = `
        DELETE FROM geofence_events 
        WHERE user_id = $1 AND timestamp < $2
      `;
      await this.db.query(eventsQuery, [userId, cutoffDate]);

      // Clean up Redis location history
      const historyKey = `history:location:${userId}`;
      const historyData = await this.redis.lRange(historyKey, 0, -1);
      
      const filteredHistory = historyData.filter(item => {
        const location = JSON.parse(item);
        return new Date(location.timestamp) >= cutoffDate;
      });

      if (filteredHistory.length !== historyData.length) {
        await this.redis.del(historyKey);
        if (filteredHistory.length > 0) {
          await this.redis.lPush(historyKey, ...filteredHistory);
          await this.redis.expire(historyKey, 604800); // 7 days TTL
        }
      }

      logger.info(`Cleaned up location history for user ${userId}`);

    } catch (error) {
      logger.error('Error cleaning up location history:', error);
    }
  }

  /**
   * Anonymize old location data based on time threshold
   */
  async anonymizeOldLocationData(userId: string): Promise<void> {
    try {
      const privacySettings = await this.getUserPrivacySettings(userId);
      const cutoffDate = new Date();
      cutoffDate.setHours(cutoffDate.getHours() - privacySettings.anonymizeAfterHours);

      // Anonymize route points older than threshold
      const query = `
        UPDATE route_points 
        SET 
          latitude = latitude + (RANDOM() - 0.5) * 0.01,
          longitude = longitude + (RANDOM() - 0.5) * 0.01,
          is_anonymized = true
        WHERE user_id = $1 AND timestamp < $2 AND is_anonymized = false
      `;

      const result = await this.db.query(query, [userId, cutoffDate]);
      
      if (result.rowCount > 0) {
        logger.info(`Anonymized ${result.rowCount} location records for user ${userId}`);
      }

    } catch (error) {
      logger.error('Error anonymizing old location data:', error);
    }
  }

  /**
   * Create default privacy settings for a new user
   */
  private async createDefaultPrivacySettings(userId: string): Promise<void> {
    try {
      const query = `
        INSERT INTO location_privacy_settings (
          user_id, location_sharing_enabled, precision_level, share_with_taskers,
          share_with_clients, share_history_duration, anonymize_after_hours,
          allow_emergency_access, geofence_notifications, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        ON CONFLICT (user_id) DO NOTHING
      `;

      const now = new Date();
      await this.db.query(query, [
        userId,
        this.DEFAULT_SETTINGS.locationSharingEnabled,
        this.DEFAULT_SETTINGS.precisionLevel,
        this.DEFAULT_SETTINGS.shareWithTaskers,
        this.DEFAULT_SETTINGS.shareWithClients,
        this.DEFAULT_SETTINGS.shareHistoryDuration,
        this.DEFAULT_SETTINGS.anonymizeAfterHours,
        this.DEFAULT_SETTINGS.allowEmergencyAccess,
        this.DEFAULT_SETTINGS.geofenceNotifications,
        now,
        now
      ]);

    } catch (error) {
      logger.error('Error creating default privacy settings:', error);
    }
  }

  /**
   * Derive encryption key for user-specific location data
   */
  private deriveEncryptionKey(userId: string): string {
    const secret = process.env.LOCATION_ENCRYPTION_SECRET || 'default-secret';
    return crypto.pbkdf2Sync(userId, this.ANONYMIZATION_SALT, 10000, 32, 'sha256').toString('hex');
  }

  /**
   * Approximate location by reducing precision
   */
  private approximateLocation(location: GeoPoint, radiusMeters: number): AnonymizedLocation {
    // Calculate precision reduction based on radius
    const precisionReduction = Math.max(1, Math.floor(radiusMeters / 100));
    const latPrecision = Math.max(2, 6 - Math.log10(precisionReduction));
    const lngPrecision = Math.max(2, 6 - Math.log10(precisionReduction));

    return {
      approximateLatitude: parseFloat(location.latitude.toFixed(latPrecision)),
      approximateLongitude: parseFloat(location.longitude.toFixed(lngPrecision)),
      accuracyRadius: radiusMeters,
      timestamp: location.timestamp,
      isAnonymized: true
    };
  }

  /**
   * Check if user has permission to access another user's location
   */
  async hasLocationAccess(
    requestingUserId: string, 
    targetUserId: string, 
    context: 'task' | 'nearby' | 'emergency'
  ): Promise<boolean> {
    try {
      const targetSettings = await this.getUserPrivacySettings(targetUserId);

      // Emergency access
      if (context === 'emergency' && targetSettings.allowEmergencyAccess) {
        return true;
      }

      // Check if location sharing is enabled
      if (!targetSettings.locationSharingEnabled) {
        return false;
      }

      // Context-specific permissions
      switch (context) {
        case 'task':
          // Check if users are in the same task
          const taskQuery = `
            SELECT COUNT(*) as count FROM task_participants 
            WHERE task_id IN (
              SELECT task_id FROM task_participants WHERE user_id = $1
            ) AND user_id = $2
          `;
          const result = await this.db.query(taskQuery, [requestingUserId, targetUserId]);
          return result.rows[0].count > 0;

        case 'nearby':
          return targetSettings.shareWithTaskers;

        default:
          return false;
      }

    } catch (error) {
      logger.error('Error checking location access:', error);
      return false;
    }
  }
}

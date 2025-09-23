import { LocationPrivacyService } from '../../services/locationPrivacyService';
import { GeoPoint } from '@errands-buddy/shared-types';

// Mock dependencies
jest.mock('../../config/redis');
jest.mock('../../config/database');
jest.mock('../../utils/logger');

const mockRedis = {
  get: jest.fn(),
  setEx: jest.fn(),
  del: jest.fn(),
  lRange: jest.fn(),
  lPush: jest.fn(),
  expire: jest.fn()
};

const mockDb = {
  query: jest.fn()
};

jest.mock('../../config/redis', () => ({
  getRedisClient: () => mockRedis
}));

jest.mock('../../config/database', () => ({
  getDatabase: () => mockDb
}));

describe('LocationPrivacyService', () => {
  let privacyService: LocationPrivacyService;
  const testUserId = '123e4567-e89b-12d3-a456-426614174000';
  const testLocation: GeoPoint = {
    latitude: 40.7128,
    longitude: -74.0060,
    accuracy: 10,
    timestamp: new Date('2023-01-01T12:00:00Z')
  };

  beforeEach(() => {
    privacyService = new LocationPrivacyService();
    jest.clearAllMocks();
  });

  describe('getUserPrivacySettings', () => {
    test('should return cached privacy settings', async () => {
      const cachedSettings = {
        userId: testUserId,
        locationSharingEnabled: true,
        precisionLevel: 'approximate',
        shareWithTaskers: true,
        shareWithClients: true,
        shareHistoryDuration: 7,
        anonymizeAfterHours: 24,
        allowEmergencyAccess: true,
        geofenceNotifications: true,
        updatedAt: new Date()
      };

      mockRedis.get.mockResolvedValue(JSON.stringify(cachedSettings));

      const result = await privacyService.getUserPrivacySettings(testUserId);

      expect(mockRedis.get).toHaveBeenCalledWith(`privacy:location:${testUserId}`);
      expect(result).toEqual(cachedSettings);
    });

    test('should return database settings when not cached', async () => {
      const dbSettings = {
        user_id: testUserId,
        location_sharing_enabled: true,
        precision_level: 'exact',
        share_with_taskers: false,
        share_with_clients: true,
        share_history_duration: 14,
        anonymize_after_hours: 48,
        allow_emergency_access: true,
        geofence_notifications: false,
        updated_at: new Date()
      };

      mockRedis.get.mockResolvedValue(null);
      mockDb.query.mockResolvedValue({ rows: [dbSettings] });

      const result = await privacyService.getUserPrivacySettings(testUserId);

      expect(mockDb.query).toHaveBeenCalled();
      expect(result.userId).toBe(testUserId);
      expect(result.precisionLevel).toBe('exact');
      expect(result.shareWithTaskers).toBe(false);
      expect(mockRedis.setEx).toHaveBeenCalled(); // Should cache the result
    });

    test('should return default settings for new user', async () => {
      mockRedis.get.mockResolvedValue(null);
      mockDb.query.mockResolvedValue({ rows: [] });

      const result = await privacyService.getUserPrivacySettings(testUserId);

      expect(result.userId).toBe(testUserId);
      expect(result.locationSharingEnabled).toBe(true);
      expect(result.precisionLevel).toBe('approximate');
      expect(result.shareWithTaskers).toBe(true);
    });
  });

  describe('updateUserPrivacySettings', () => {
    test('should update privacy settings in database and cache', async () => {
      const currentSettings = {
        userId: testUserId,
        locationSharingEnabled: true,
        precisionLevel: 'approximate' as const,
        shareWithTaskers: true,
        shareWithClients: true,
        shareHistoryDuration: 7,
        anonymizeAfterHours: 24,
        allowEmergencyAccess: true,
        geofenceNotifications: true,
        updatedAt: new Date()
      };

      const updates = {
        precisionLevel: 'exact' as const,
        shareHistoryDuration: 14
      };

      // Mock getting current settings
      jest.spyOn(privacyService, 'getUserPrivacySettings').mockResolvedValue(currentSettings);
      mockDb.query.mockResolvedValue({ rows: [] });

      await privacyService.updateUserPrivacySettings(testUserId, updates);

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE location_privacy_settings'),
        expect.arrayContaining([testUserId, true, 'exact', true, true, 14, 24, true, true, expect.any(Date)])
      );
      expect(mockRedis.setEx).toHaveBeenCalled();
    });
  });

  describe('filterLocationData', () => {
    const privacySettings = {
      userId: testUserId,
      locationSharingEnabled: true,
      precisionLevel: 'approximate' as const,
      shareWithTaskers: true,
      shareWithClients: true,
      shareHistoryDuration: 7,
      anonymizeAfterHours: 24,
      allowEmergencyAccess: true,
      geofenceNotifications: true,
      updatedAt: new Date()
    };

    test('should return exact location for exact precision', async () => {
      const exactSettings = { ...privacySettings, precisionLevel: 'exact' as const };

      const result = await privacyService.filterLocationData(testLocation, exactSettings);

      expect(result).toEqual(testLocation);
    });

    test('should return approximate location for approximate precision', async () => {
      const result = await privacyService.filterLocationData(testLocation, privacySettings);

      expect(result).toHaveProperty('approximateLatitude');
      expect(result).toHaveProperty('approximateLongitude');
      expect(result).toHaveProperty('isAnonymized', true);
      expect(result).toHaveProperty('accuracyRadius', 100);
    });

    test('should return city-level location for city precision', async () => {
      const citySettings = { ...privacySettings, precisionLevel: 'city' as const };

      const result = await privacyService.filterLocationData(testLocation, citySettings);

      expect(result).toHaveProperty('approximateLatitude');
      expect(result).toHaveProperty('approximateLongitude');
      expect(result).toHaveProperty('isAnonymized', true);
      expect(result).toHaveProperty('accuracyRadius', 5000);
    });

    test('should throw error for disabled precision', async () => {
      const disabledSettings = { ...privacySettings, precisionLevel: 'disabled' as const };

      await expect(
        privacyService.filterLocationData(testLocation, disabledSettings)
      ).rejects.toThrow('Location precision is disabled');
    });

    test('should throw error when location sharing is disabled', async () => {
      const disabledSharingSettings = { ...privacySettings, locationSharingEnabled: false };

      await expect(
        privacyService.filterLocationData(testLocation, disabledSharingSettings)
      ).rejects.toThrow('Location sharing is disabled');
    });

    test('should allow emergency access override', async () => {
      const disabledSharingSettings = { ...privacySettings, locationSharingEnabled: false };

      const result = await privacyService.filterLocationData(
        testLocation, 
        disabledSharingSettings, 
        'emergency-user-id', 
        'emergency'
      );

      expect(result).toEqual(testLocation);
    });
  });

  describe('anonymizeLocation', () => {
    test('should add noise to coordinates', async () => {
      const result = await privacyService.anonymizeLocation(testLocation, 1000);

      expect(result.approximateLatitude).not.toBe(testLocation.latitude);
      expect(result.approximateLongitude).not.toBe(testLocation.longitude);
      expect(result.isAnonymized).toBe(true);
      expect(result.accuracyRadius).toBe(1000);
      expect(result.timestamp).toBe(testLocation.timestamp);
    });

    test('should use default radius when not specified', async () => {
      const result = await privacyService.anonymizeLocation(testLocation);

      expect(result.accuracyRadius).toBe(1000);
      expect(result.isAnonymized).toBe(true);
    });
  });

  describe('encryptLocationData', () => {
    test('should encrypt location data', async () => {
      const encrypted = await privacyService.encryptLocationData(testUserId, testLocation);

      expect(typeof encrypted).toBe('string');
      expect(encrypted).not.toContain(testLocation.latitude.toString());
      expect(encrypted).not.toContain(testLocation.longitude.toString());

      // Should be valid JSON
      const parsed = JSON.parse(encrypted);
      expect(parsed).toHaveProperty('encrypted');
      expect(parsed).toHaveProperty('iv');
      expect(parsed).toHaveProperty('authTag');
      expect(parsed).toHaveProperty('timestamp');
    });
  });

  describe('decryptLocationData', () => {
    test('should decrypt location data', async () => {
      // First encrypt the data
      const encrypted = await privacyService.encryptLocationData(testUserId, testLocation);
      
      // Then decrypt it
      const decrypted = await privacyService.decryptLocationData(testUserId, encrypted);

      expect(decrypted.latitude).toBe(testLocation.latitude);
      expect(decrypted.longitude).toBe(testLocation.longitude);
      expect(decrypted.accuracy).toBe(testLocation.accuracy);
    });

    test('should throw error for invalid encrypted data', async () => {
      const invalidEncrypted = JSON.stringify({
        encrypted: 'invalid',
        iv: 'invalid',
        authTag: 'invalid',
        timestamp: Date.now()
      });

      await expect(
        privacyService.decryptLocationData(testUserId, invalidEncrypted)
      ).rejects.toThrow();
    });
  });

  describe('cleanupLocationHistory', () => {
    test('should clean up old location data based on retention policy', async () => {
      const privacySettings = {
        userId: testUserId,
        locationSharingEnabled: true,
        precisionLevel: 'approximate' as const,
        shareWithTaskers: true,
        shareWithClients: true,
        shareHistoryDuration: 7,
        anonymizeAfterHours: 24,
        allowEmergencyAccess: true,
        geofenceNotifications: true,
        updatedAt: new Date()
      };

      jest.spyOn(privacyService, 'getUserPrivacySettings').mockResolvedValue(privacySettings);
      mockDb.query.mockResolvedValue({ rows: [] });
      mockRedis.lRange.mockResolvedValue([]);

      await privacyService.cleanupLocationHistory(testUserId);

      // Should delete old route points
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM route_points'),
        expect.arrayContaining([testUserId, expect.any(Date)])
      );

      // Should delete old geofence events
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM geofence_events'),
        expect.arrayContaining([testUserId, expect.any(Date)])
      );
    });
  });

  describe('anonymizeOldLocationData', () => {
    test('should anonymize old location data', async () => {
      const privacySettings = {
        userId: testUserId,
        locationSharingEnabled: true,
        precisionLevel: 'approximate' as const,
        shareWithTaskers: true,
        shareWithClients: true,
        shareHistoryDuration: 7,
        anonymizeAfterHours: 24,
        allowEmergencyAccess: true,
        geofenceNotifications: true,
        updatedAt: new Date()
      };

      jest.spyOn(privacyService, 'getUserPrivacySettings').mockResolvedValue(privacySettings);
      mockDb.query.mockResolvedValue({ rowCount: 5 });

      await privacyService.anonymizeOldLocationData(testUserId);

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE route_points'),
        expect.arrayContaining([testUserId, expect.any(Date)])
      );
    });
  });

  describe('hasLocationAccess', () => {
    const requestingUserId = 'requesting-user-id';
    const targetUserId = 'target-user-id';

    test('should allow emergency access when enabled', async () => {
      const privacySettings = {
        userId: targetUserId,
        locationSharingEnabled: true,
        precisionLevel: 'approximate' as const,
        shareWithTaskers: true,
        shareWithClients: true,
        shareHistoryDuration: 7,
        anonymizeAfterHours: 24,
        allowEmergencyAccess: true,
        geofenceNotifications: true,
        updatedAt: new Date()
      };

      jest.spyOn(privacyService, 'getUserPrivacySettings').mockResolvedValue(privacySettings);

      const hasAccess = await privacyService.hasLocationAccess(
        requestingUserId,
        targetUserId,
        'emergency'
      );

      expect(hasAccess).toBe(true);
    });

    test('should deny access when location sharing is disabled', async () => {
      const privacySettings = {
        userId: targetUserId,
        locationSharingEnabled: false,
        precisionLevel: 'approximate' as const,
        shareWithTaskers: true,
        shareWithClients: true,
        shareHistoryDuration: 7,
        anonymizeAfterHours: 24,
        allowEmergencyAccess: true,
        geofenceNotifications: true,
        updatedAt: new Date()
      };

      jest.spyOn(privacyService, 'getUserPrivacySettings').mockResolvedValue(privacySettings);

      const hasAccess = await privacyService.hasLocationAccess(
        requestingUserId,
        targetUserId,
        'nearby'
      );

      expect(hasAccess).toBe(false);
    });

    test('should check task participation for task context', async () => {
      const privacySettings = {
        userId: targetUserId,
        locationSharingEnabled: true,
        precisionLevel: 'approximate' as const,
        shareWithTaskers: true,
        shareWithClients: true,
        shareHistoryDuration: 7,
        anonymizeAfterHours: 24,
        allowEmergencyAccess: true,
        geofenceNotifications: true,
        updatedAt: new Date()
      };

      jest.spyOn(privacyService, 'getUserPrivacySettings').mockResolvedValue(privacySettings);
      mockDb.query.mockResolvedValue({ rows: [{ count: 1 }] });

      const hasAccess = await privacyService.hasLocationAccess(
        requestingUserId,
        targetUserId,
        'task'
      );

      expect(hasAccess).toBe(true);
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('SELECT COUNT(*) as count FROM task_participants'),
        [requestingUserId, targetUserId]
      );
    });

    test('should respect shareWithTaskers setting for nearby context', async () => {
      const privacySettings = {
        userId: targetUserId,
        locationSharingEnabled: true,
        precisionLevel: 'approximate' as const,
        shareWithTaskers: false,
        shareWithClients: true,
        shareHistoryDuration: 7,
        anonymizeAfterHours: 24,
        allowEmergencyAccess: true,
        geofenceNotifications: true,
        updatedAt: new Date()
      };

      jest.spyOn(privacyService, 'getUserPrivacySettings').mockResolvedValue(privacySettings);

      const hasAccess = await privacyService.hasLocationAccess(
        requestingUserId,
        targetUserId,
        'nearby'
      );

      expect(hasAccess).toBe(false);
    });
  });
});

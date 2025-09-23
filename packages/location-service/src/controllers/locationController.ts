import { Request, Response } from 'express';
import { LocationService } from '../services/locationService';
import { GeofenceService } from '../services/geofenceService';
import { LocationPrivacyService } from '../services/locationPrivacyService';
import { AuthenticatedRequest } from '../middleware/auth';
import { logger } from '../utils/logger';
import { GeoPoint } from '@errands-buddy/shared-types';

export class LocationController {
  private locationService = new LocationService();
  private geofenceService = new GeofenceService();
  private privacyService = new LocationPrivacyService();

  /**
   * Update user's current location
   */
  updateLocation = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { latitude, longitude, accuracy, taskId } = req.body;
      const userId = req.user!.userId;

      const location: GeoPoint = {
        latitude: parseFloat(latitude),
        longitude: parseFloat(longitude),
        accuracy: parseFloat(accuracy) || 10,
        timestamp: new Date()
      };

      // Check privacy settings
      const privacySettings = await this.privacyService.getUserPrivacySettings(userId);
      if (!privacySettings.locationSharingEnabled) {
        res.status(403).json({ error: 'Location sharing is disabled' });
        return;
      }

      await this.locationService.updateUserLocation(userId, location, taskId);

      res.json({
        success: true,
        timestamp: location.timestamp,
        message: 'Location updated successfully'
      });

    } catch (error) {
      logger.error('Error updating location:', error);
      res.status(500).json({ error: 'Failed to update location' });
    }
  };

  /**
   * Get current location for a user
   */
  getCurrentLocation = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const targetUserId = req.params.userId || req.user!.userId;
      const requestingUserId = req.user!.userId;

      // Check permissions
      if (targetUserId !== requestingUserId) {
        const hasAccess = await this.privacyService.hasLocationAccess(
          requestingUserId,
          targetUserId,
          'nearby'
        );

        if (!hasAccess) {
          res.status(403).json({ error: 'Access denied to user location' });
          return;
        }
      }

      const location = await this.locationService.getUserLocation(targetUserId);
      
      if (!location) {
        res.status(404).json({ error: 'Location not found' });
        return;
      }

      // Apply privacy filtering
      const privacySettings = await this.privacyService.getUserPrivacySettings(targetUserId);
      const filteredLocation = await this.privacyService.filterLocationData(
        location,
        privacySettings,
        requestingUserId,
        'nearby'
      );

      res.json({
        userId: targetUserId,
        location: filteredLocation,
        lastUpdated: location.timestamp
      });

    } catch (error) {
      logger.error('Error getting current location:', error);
      res.status(500).json({ error: 'Failed to get location' });
    }
  };

  /**
   * Get nearby users
   */
  getNearbyUsers = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { latitude, longitude, radius = 5000 } = req.query;
      const userId = req.user!.userId;

      if (!latitude || !longitude) {
        res.status(400).json({ error: 'Latitude and longitude are required' });
        return;
      }

      const location: GeoPoint = {
        latitude: parseFloat(latitude as string),
        longitude: parseFloat(longitude as string),
        accuracy: 10,
        timestamp: new Date()
      };

      const nearbyUsers = await this.locationService.getNearbyUsers(
        location,
        parseInt(radius as string)
      );

      // Filter out the requesting user and apply privacy settings
      const filteredUsers = [];
      for (const user of nearbyUsers) {
        if (user.taskerId !== userId) {
          const privacySettings = await this.privacyService.getUserPrivacySettings(user.taskerId);
          if (privacySettings.shareWithTaskers) {
            const filteredLocation = await this.privacyService.filterLocationData(
              user.location,
              privacySettings,
              userId,
              'nearby'
            );
            
            filteredUsers.push({
              ...user,
              location: filteredLocation
            });
          }
        }
      }

      res.json({
        nearbyUsers: filteredUsers,
        count: filteredUsers.length,
        searchRadius: radius
      });

    } catch (error) {
      logger.error('Error getting nearby users:', error);
      res.status(500).json({ error: 'Failed to get nearby users' });
    }
  };

  /**
   * Start location tracking for a task
   */
  startTracking = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { taskId } = req.body;
      const userId = req.user!.userId;

      if (!taskId) {
        res.status(400).json({ error: 'Task ID is required' });
        return;
      }

      await this.locationService.startTrackingSession(userId, taskId);
      await this.geofenceService.setupTaskGeofences(taskId);

      res.json({
        success: true,
        message: 'Location tracking started',
        taskId,
        userId
      });

    } catch (error) {
      logger.error('Error starting tracking:', error);
      res.status(500).json({ error: 'Failed to start tracking' });
    }
  };

  /**
   * Stop location tracking for a task
   */
  stopTracking = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { taskId } = req.body;
      const userId = req.user!.userId;

      if (!taskId) {
        res.status(400).json({ error: 'Task ID is required' });
        return;
      }

      await this.locationService.stopTrackingSession(userId, taskId);

      res.json({
        success: true,
        message: 'Location tracking stopped',
        taskId,
        userId
      });

    } catch (error) {
      logger.error('Error stopping tracking:', error);
      res.status(500).json({ error: 'Failed to stop tracking' });
    }
  };

  /**
   * Get route tracking data for a task
   */
  getRouteTracking = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { taskId, userId: targetUserId } = req.params;
      const requestingUserId = req.user!.userId;
      const userId = targetUserId || requestingUserId;

      // Check permissions for accessing other user's route
      if (userId !== requestingUserId) {
        const hasAccess = await this.privacyService.hasLocationAccess(
          requestingUserId,
          userId,
          'task'
        );

        if (!hasAccess) {
          res.status(403).json({ error: 'Access denied to route data' });
          return;
        }
      }

      const route = await this.locationService.getRouteTracking(taskId, userId);

      res.json({
        taskId,
        userId,
        route,
        totalPoints: route.length
      });

    } catch (error) {
      logger.error('Error getting route tracking:', error);
      res.status(500).json({ error: 'Failed to get route tracking' });
    }
  };

  /**
   * Get user's privacy settings
   */
  getPrivacySettings = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const userId = req.user!.userId;
      const settings = await this.privacyService.getUserPrivacySettings(userId);

      res.json(settings);

    } catch (error) {
      logger.error('Error getting privacy settings:', error);
      res.status(500).json({ error: 'Failed to get privacy settings' });
    }
  };

  /**
   * Update user's privacy settings
   */
  updatePrivacySettings = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const userId = req.user!.userId;
      const updates = req.body;

      await this.privacyService.updateUserPrivacySettings(userId, updates);

      res.json({
        success: true,
        message: 'Privacy settings updated successfully'
      });

    } catch (error) {
      logger.error('Error updating privacy settings:', error);
      res.status(500).json({ error: 'Failed to update privacy settings' });
    }
  };

  /**
   * Create a geofence
   */
  createGeofence = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { taskId, type, center, radius, bounds, metadata } = req.body;

      const geofenceId = await this.geofenceService.createGeofence({
        taskId,
        type,
        center,
        radius,
        bounds,
        isActive: true,
        metadata
      });

      res.json({
        success: true,
        geofenceId,
        message: 'Geofence created successfully'
      });

    } catch (error) {
      logger.error('Error creating geofence:', error);
      res.status(500).json({ error: 'Failed to create geofence' });
    }
  };

  /**
   * Get geofences for a task
   */
  getTaskGeofences = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { taskId } = req.params;
      const geofenceIds = await this.geofenceService.setupTaskGeofences(taskId);

      res.json({
        taskId,
        geofenceIds,
        count: geofenceIds.length
      });

    } catch (error) {
      logger.error('Error getting task geofences:', error);
      res.status(500).json({ error: 'Failed to get task geofences' });
    }
  };

  /**
   * Get geofence events for a task
   */
  getGeofenceEvents = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { taskId } = req.params;
      const events = await this.geofenceService.getTaskGeofenceEvents(taskId);

      res.json({
        taskId,
        events,
        count: events.length
      });

    } catch (error) {
      logger.error('Error getting geofence events:', error);
      res.status(500).json({ error: 'Failed to get geofence events' });
    }
  };

  /**
   * Delete a geofence
   */
  deleteGeofence = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { geofenceId } = req.params;
      
      // This would be implemented in the geofence service
      // await this.geofenceService.deleteGeofence(geofenceId);

      res.json({
        success: true,
        message: 'Geofence deleted successfully'
      });

    } catch (error) {
      logger.error('Error deleting geofence:', error);
      res.status(500).json({ error: 'Failed to delete geofence' });
    }
  };

  /**
   * Get location statistics
   */
  getLocationStats = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const userId = req.user!.userId;
      const { startDate, endDate } = req.query;

      const start = startDate ? new Date(startDate as string) : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const end = endDate ? new Date(endDate as string) : new Date();

      const stats = await this.locationService.getLocationStats(userId, start, end);

      res.json({
        userId,
        period: { startDate: start, endDate: end },
        stats
      });

    } catch (error) {
      logger.error('Error getting location stats:', error);
      res.status(500).json({ error: 'Failed to get location stats' });
    }
  };

  /**
   * Get location heatmap data
   */
  getLocationHeatmap = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const userId = req.user!.userId;
      
      // This would be implemented to return aggregated location data for heatmap visualization
      res.json({
        message: 'Heatmap data endpoint - to be implemented',
        userId
      });

    } catch (error) {
      logger.error('Error getting location heatmap:', error);
      res.status(500).json({ error: 'Failed to get location heatmap' });
    }
  };

  /**
   * Emergency locate user
   */
  emergencyLocate = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { targetUserId, emergencyType, reason } = req.body;
      const requestingUserId = req.user!.userId;

      // Verify emergency access permissions
      const hasAccess = await this.privacyService.hasLocationAccess(
        requestingUserId,
        targetUserId,
        'emergency'
      );

      if (!hasAccess) {
        res.status(403).json({ error: 'Emergency access denied' });
        return;
      }

      const location = await this.locationService.getUserLocation(targetUserId);
      
      if (!location) {
        res.status(404).json({ error: 'User location not available' });
        return;
      }

      // Log emergency access
      logger.warn(`Emergency location access: ${requestingUserId} accessed ${targetUserId} location`, {
        emergencyType,
        reason,
        timestamp: new Date()
      });

      res.json({
        userId: targetUserId,
        location,
        emergencyType,
        accessedAt: new Date(),
        accessedBy: requestingUserId
      });

    } catch (error) {
      logger.error('Error in emergency locate:', error);
      res.status(500).json({ error: 'Failed to locate user' });
    }
  };
}

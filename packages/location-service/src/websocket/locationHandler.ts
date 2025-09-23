import { Server, Socket } from 'socket.io';
import { logger } from '../utils/logger';
import { socketAuthMiddleware } from '../middleware/auth';
import { LocationService } from '../services/locationService';
import { GeofenceService } from '../services/geofenceService';
import { LocationPrivacyService } from '../services/locationPrivacyService';
import { GeoPoint } from '@errands-buddy/shared-types';

export class LocationWebSocketHandler {
  private io: Server;
  private locationService: LocationService;
  private geofenceService: GeofenceService;
  private privacyService: LocationPrivacyService;

  constructor(io: Server) {
    this.io = io;
    this.locationService = new LocationService();
    this.geofenceService = new GeofenceService();
    this.privacyService = new LocationPrivacyService();
    
    this.setupSocketHandlers();
  }

  private setupSocketHandlers(): void {
    // Authentication middleware for all socket connections
    this.io.use(socketAuthMiddleware);

    this.io.on('connection', (socket: Socket) => {
      logger.info(`User connected: ${socket.userId}`);

      // Join user to their personal room
      socket.join(`user:${socket.userId}`);

      // Handle location updates
      socket.on('location:update', async (data) => {
        await this.handleLocationUpdate(socket, data);
      });

      // Handle task tracking start
      socket.on('location:start-tracking', async (data) => {
        await this.handleStartTracking(socket, data);
      });

      // Handle task tracking stop
      socket.on('location:stop-tracking', async (data) => {
        await this.handleStopTracking(socket, data);
      });

      // Handle privacy settings update
      socket.on('location:privacy-update', async (data) => {
        await this.handlePrivacyUpdate(socket, data);
      });

      // Handle geofence subscription
      socket.on('location:subscribe-geofence', async (data) => {
        await this.handleGeofenceSubscription(socket, data);
      });

      // Handle disconnection
      socket.on('disconnect', async () => {
        await this.handleDisconnection(socket);
      });
    });
  }

  private async handleLocationUpdate(socket: Socket, data: any): Promise<void> {
    try {
      const { latitude, longitude, accuracy, taskId } = data;

      // Validate location data
      if (!this.isValidLocation(latitude, longitude)) {
        socket.emit('location:error', { message: 'Invalid location coordinates' });
        return;
      }

      const locationData: GeoPoint = {
        latitude: parseFloat(latitude),
        longitude: parseFloat(longitude),
        accuracy: parseFloat(accuracy) || 10,
        timestamp: new Date()
      };

      // Check privacy settings
      const privacySettings = await this.privacyService.getUserPrivacySettings(socket.userId);
      if (!privacySettings.locationSharingEnabled) {
        socket.emit('location:error', { message: 'Location sharing is disabled' });
        return;
      }

      // Update location in cache and database
      await this.locationService.updateUserLocation(socket.userId, locationData, taskId);

      // Check geofences if tracking a task
      if (taskId) {
        const geofenceEvents = await this.geofenceService.checkGeofences(
          socket.userId,
          taskId,
          locationData
        );

        // Emit geofence events
        for (const event of geofenceEvents) {
          this.io.to(`task:${taskId}`).emit('geofence:event', event);
        }

        // Notify task participants of location update
        socket.to(`task:${taskId}`).emit('location:updated', {
          userId: socket.userId,
          location: await this.privacyService.filterLocationData(locationData, privacySettings),
          timestamp: locationData.timestamp
        });
      }

      // Update nearby taskers if user is available
      await this.updateNearbyTaskers(socket.userId, locationData);

      socket.emit('location:update-success', { timestamp: locationData.timestamp });

    } catch (error) {
      logger.error('Error handling location update:', error);
      socket.emit('location:error', { message: 'Failed to update location' });
    }
  }

  private async handleStartTracking(socket: Socket, data: any): Promise<void> {
    try {
      const { taskId } = data;

      if (!taskId) {
        socket.emit('location:error', { message: 'Task ID is required' });
        return;
      }

      // Join task room for real-time updates
      socket.join(`task:${taskId}`);

      // Start tracking session
      await this.locationService.startTrackingSession(socket.userId, taskId);

      // Set up geofences for the task
      await this.geofenceService.setupTaskGeofences(taskId);

      socket.emit('location:tracking-started', { taskId });
      logger.info(`Started location tracking for user ${socket.userId}, task ${taskId}`);

    } catch (error) {
      logger.error('Error starting location tracking:', error);
      socket.emit('location:error', { message: 'Failed to start tracking' });
    }
  }

  private async handleStopTracking(socket: Socket, data: any): Promise<void> {
    try {
      const { taskId } = data;

      if (!taskId) {
        socket.emit('location:error', { message: 'Task ID is required' });
        return;
      }

      // Leave task room
      socket.leave(`task:${taskId}`);

      // Stop tracking session
      await this.locationService.stopTrackingSession(socket.userId, taskId);

      socket.emit('location:tracking-stopped', { taskId });
      logger.info(`Stopped location tracking for user ${socket.userId}, task ${taskId}`);

    } catch (error) {
      logger.error('Error stopping location tracking:', error);
      socket.emit('location:error', { message: 'Failed to stop tracking' });
    }
  }

  private async handlePrivacyUpdate(socket: Socket, data: any): Promise<void> {
    try {
      await this.privacyService.updateUserPrivacySettings(socket.userId, data);
      socket.emit('location:privacy-updated', { success: true });

    } catch (error) {
      logger.error('Error updating privacy settings:', error);
      socket.emit('location:error', { message: 'Failed to update privacy settings' });
    }
  }

  private async handleGeofenceSubscription(socket: Socket, data: any): Promise<void> {
    try {
      const { geofenceId } = data;
      socket.join(`geofence:${geofenceId}`);
      socket.emit('location:geofence-subscribed', { geofenceId });

    } catch (error) {
      logger.error('Error subscribing to geofence:', error);
      socket.emit('location:error', { message: 'Failed to subscribe to geofence' });
    }
  }

  private async handleDisconnection(socket: Socket): Promise<void> {
    try {
      logger.info(`User disconnected: ${socket.userId}`);
      
      // Update user's last seen timestamp
      await this.locationService.updateLastSeen(socket.userId);

      // Clean up any active tracking sessions
      await this.locationService.cleanupUserSessions(socket.userId);

    } catch (error) {
      logger.error('Error handling disconnection:', error);
    }
  }

  private isValidLocation(latitude: any, longitude: any): boolean {
    const lat = parseFloat(latitude);
    const lng = parseFloat(longitude);
    
    return !isNaN(lat) && !isNaN(lng) && 
           lat >= -90 && lat <= 90 && 
           lng >= -180 && lng <= 180;
  }

  private async updateNearbyTaskers(userId: string, location: GeoPoint): Promise<void> {
    try {
      // Get nearby users who might be interested in location updates
      const nearbyUsers = await this.locationService.getNearbyUsers(location, 5000); // 5km radius
      
      // Emit location update to nearby users (with privacy filtering)
      for (const nearbyUser of nearbyUsers) {
        if (nearbyUser.userId !== userId) {
          this.io.to(`user:${nearbyUser.userId}`).emit('location:nearby-update', {
            userId,
            approximateLocation: await this.privacyService.anonymizeLocation(location),
            timestamp: location.timestamp
          });
        }
      }
    } catch (error) {
      logger.error('Error updating nearby taskers:', error);
    }
  }
}

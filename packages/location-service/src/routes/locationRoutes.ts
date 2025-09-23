import { Router } from 'express';
import { LocationController } from '../controllers/locationController';
import { validateLocationUpdate, validatePrivacySettings } from '../middleware/validation';
import rateLimit from 'express-rate-limit';

const router = Router();
const locationController = new LocationController();

// Rate limiting for location updates
const locationUpdateLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 60, // 60 updates per minute
  message: 'Too many location updates, please slow down'
});

// Rate limiting for general API calls
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 requests per 15 minutes
  message: 'Too many requests, please try again later'
});

// Location update endpoints
router.post('/update', locationUpdateLimiter, validateLocationUpdate, locationController.updateLocation);
router.get('/current/:userId?', generalLimiter, locationController.getCurrentLocation);
router.get('/nearby', generalLimiter, locationController.getNearbyUsers);

// Tracking endpoints
router.post('/tracking/start', generalLimiter, locationController.startTracking);
router.post('/tracking/stop', generalLimiter, locationController.stopTracking);
router.get('/tracking/route/:taskId/:userId?', generalLimiter, locationController.getRouteTracking);

// Privacy settings endpoints
router.get('/privacy/settings', generalLimiter, locationController.getPrivacySettings);
router.put('/privacy/settings', generalLimiter, validatePrivacySettings, locationController.updatePrivacySettings);

// Geofence endpoints
router.post('/geofence/create', generalLimiter, locationController.createGeofence);
router.get('/geofence/task/:taskId', generalLimiter, locationController.getTaskGeofences);
router.get('/geofence/events/:taskId', generalLimiter, locationController.getGeofenceEvents);
router.delete('/geofence/:geofenceId', generalLimiter, locationController.deleteGeofence);

// Analytics endpoints
router.get('/analytics/stats', generalLimiter, locationController.getLocationStats);
router.get('/analytics/heatmap', generalLimiter, locationController.getLocationHeatmap);

// Emergency endpoints
router.post('/emergency/locate', generalLimiter, locationController.emergencyLocate);

// Health check
router.get('/health', (req, res) => {
  res.json({ status: 'healthy', service: 'location-service' });
});

export { router as locationRoutes };

import { Request, Response, NextFunction } from 'express';
import Joi from 'joi';
import { logger } from '../utils/logger';

// Location update validation schema
const locationUpdateSchema = Joi.object({
  latitude: Joi.number().min(-90).max(90).required(),
  longitude: Joi.number().min(-180).max(180).required(),
  accuracy: Joi.number().min(0).max(10000).optional(),
  taskId: Joi.string().uuid().optional()
});

// Privacy settings validation schema
const privacySettingsSchema = Joi.object({
  locationSharingEnabled: Joi.boolean().optional(),
  precisionLevel: Joi.string().valid('exact', 'approximate', 'city', 'disabled').optional(),
  shareWithTaskers: Joi.boolean().optional(),
  shareWithClients: Joi.boolean().optional(),
  shareHistoryDuration: Joi.number().min(1).max(365).optional(),
  anonymizeAfterHours: Joi.number().min(1).max(8760).optional(), // max 1 year
  allowEmergencyAccess: Joi.boolean().optional(),
  geofenceNotifications: Joi.boolean().optional()
});

// Geofence creation validation schema
const geofenceSchema = Joi.object({
  taskId: Joi.string().uuid().required(),
  type: Joi.string().valid('pickup', 'delivery', 'service_area', 'safety_zone').required(),
  center: Joi.object({
    latitude: Joi.number().min(-90).max(90).required(),
    longitude: Joi.number().min(-180).max(180).required(),
    accuracy: Joi.number().min(0).optional(),
    timestamp: Joi.date().optional()
  }).required(),
  radius: Joi.number().min(1).max(50000).required(), // 1m to 50km
  bounds: Joi.object({
    northeast: Joi.object({
      latitude: Joi.number().min(-90).max(90).required(),
      longitude: Joi.number().min(-180).max(180).required()
    }).required(),
    southwest: Joi.object({
      latitude: Joi.number().min(-90).max(90).required(),
      longitude: Joi.number().min(-180).max(180).required()
    }).required()
  }).optional(),
  metadata: Joi.object().optional()
});

// Tracking validation schema
const trackingSchema = Joi.object({
  taskId: Joi.string().uuid().required()
});

// Emergency locate validation schema
const emergencyLocateSchema = Joi.object({
  targetUserId: Joi.string().uuid().required(),
  emergencyType: Joi.string().valid('medical', 'safety', 'security', 'missing').required(),
  reason: Joi.string().min(10).max(500).required()
});

/**
 * Generic validation middleware factory
 */
function createValidationMiddleware(schema: Joi.ObjectSchema) {
  return (req: Request, res: Response, next: NextFunction) => {
    const { error, value } = schema.validate(req.body, {
      abortEarly: false,
      stripUnknown: true
    });

    if (error) {
      const errorDetails = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message,
        value: detail.context?.value
      }));

      logger.warn('Validation error:', { 
        url: req.url, 
        method: req.method, 
        errors: errorDetails 
      });

      return res.status(400).json({
        error: 'Validation failed',
        details: errorDetails
      });
    }

    // Replace req.body with validated and sanitized data
    req.body = value;
    next();
  };
}

/**
 * Query parameter validation middleware
 */
function createQueryValidationMiddleware(schema: Joi.ObjectSchema) {
  return (req: Request, res: Response, next: NextFunction) => {
    const { error, value } = schema.validate(req.query, {
      abortEarly: false,
      stripUnknown: true
    });

    if (error) {
      const errorDetails = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message,
        value: detail.context?.value
      }));

      logger.warn('Query validation error:', { 
        url: req.url, 
        method: req.method, 
        errors: errorDetails 
      });

      return res.status(400).json({
        error: 'Query validation failed',
        details: errorDetails
      });
    }

    // Replace req.query with validated data
    req.query = value;
    next();
  };
}

// Nearby users query validation schema
const nearbyUsersQuerySchema = Joi.object({
  latitude: Joi.number().min(-90).max(90).required(),
  longitude: Joi.number().min(-180).max(180).required(),
  radius: Joi.number().min(100).max(50000).default(5000) // 100m to 50km, default 5km
});

// Location stats query validation schema
const locationStatsQuerySchema = Joi.object({
  startDate: Joi.date().iso().optional(),
  endDate: Joi.date().iso().min(Joi.ref('startDate')).optional(),
  granularity: Joi.string().valid('hour', 'day', 'week', 'month').default('day')
});

// Parameter validation schemas
const userIdParamSchema = Joi.object({
  userId: Joi.string().uuid().optional()
});

const taskIdParamSchema = Joi.object({
  taskId: Joi.string().uuid().required()
});

const geofenceIdParamSchema = Joi.object({
  geofenceId: Joi.string().required()
});

/**
 * Parameter validation middleware
 */
function createParamValidationMiddleware(schema: Joi.ObjectSchema) {
  return (req: Request, res: Response, next: NextFunction) => {
    const { error, value } = schema.validate(req.params, {
      abortEarly: false,
      stripUnknown: true
    });

    if (error) {
      const errorDetails = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message,
        value: detail.context?.value
      }));

      logger.warn('Parameter validation error:', { 
        url: req.url, 
        method: req.method, 
        errors: errorDetails 
      });

      return res.status(400).json({
        error: 'Parameter validation failed',
        details: errorDetails
      });
    }

    req.params = value;
    next();
  };
}

// Export validation middleware functions
export const validateLocationUpdate = createValidationMiddleware(locationUpdateSchema);
export const validatePrivacySettings = createValidationMiddleware(privacySettingsSchema);
export const validateGeofence = createValidationMiddleware(geofenceSchema);
export const validateTracking = createValidationMiddleware(trackingSchema);
export const validateEmergencyLocate = createValidationMiddleware(emergencyLocateSchema);

export const validateNearbyUsersQuery = createQueryValidationMiddleware(nearbyUsersQuerySchema);
export const validateLocationStatsQuery = createQueryValidationMiddleware(locationStatsQuerySchema);

export const validateUserIdParam = createParamValidationMiddleware(userIdParamSchema);
export const validateTaskIdParam = createParamValidationMiddleware(taskIdParamSchema);
export const validateGeofenceIdParam = createParamValidationMiddleware(geofenceIdParamSchema);

/**
 * Custom validation for coordinate bounds
 */
export const validateCoordinateBounds = (req: Request, res: Response, next: NextFunction) => {
  const { latitude, longitude } = req.body;

  if (latitude !== undefined && longitude !== undefined) {
    const lat = parseFloat(latitude);
    const lng = parseFloat(longitude);

    if (isNaN(lat) || isNaN(lng)) {
      return res.status(400).json({
        error: 'Invalid coordinates',
        details: 'Latitude and longitude must be valid numbers'
      });
    }

    if (lat < -90 || lat > 90) {
      return res.status(400).json({
        error: 'Invalid latitude',
        details: 'Latitude must be between -90 and 90 degrees'
      });
    }

    if (lng < -180 || lng > 180) {
      return res.status(400).json({
        error: 'Invalid longitude',
        details: 'Longitude must be between -180 and 180 degrees'
      });
    }
  }

  next();
};

/**
 * Validation for location accuracy
 */
export const validateLocationAccuracy = (req: Request, res: Response, next: NextFunction) => {
  const { accuracy } = req.body;

  if (accuracy !== undefined) {
    const acc = parseFloat(accuracy);

    if (isNaN(acc) || acc < 0) {
      return res.status(400).json({
        error: 'Invalid accuracy',
        details: 'Accuracy must be a positive number representing meters'
      });
    }

    if (acc > 10000) {
      return res.status(400).json({
        error: 'Invalid accuracy',
        details: 'Accuracy cannot exceed 10,000 meters'
      });
    }
  }

  next();
};

/**
 * Rate limiting validation for location updates
 */
export const validateLocationUpdateRate = (req: Request, res: Response, next: NextFunction) => {
  // This could be enhanced to check user-specific rate limits
  // For now, we rely on the express-rate-limit middleware
  next();
};

/**
 * Sanitize location data
 */
export const sanitizeLocationData = (req: Request, res: Response, next: NextFunction) => {
  if (req.body.latitude !== undefined) {
    req.body.latitude = parseFloat(req.body.latitude);
  }
  
  if (req.body.longitude !== undefined) {
    req.body.longitude = parseFloat(req.body.longitude);
  }
  
  if (req.body.accuracy !== undefined) {
    req.body.accuracy = parseFloat(req.body.accuracy);
  }

  next();
};

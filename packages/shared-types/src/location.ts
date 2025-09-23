export interface GeoPoint {
  latitude: number;
  longitude: number;
  accuracy: number;
  timestamp: Date;
}

export interface GeoBounds {
  northeast: GeoPoint;
  southwest: GeoPoint;
}

export interface TaskLocation {
  pickup?: GeoPoint & { address: string };
  delivery?: GeoPoint & { address: string };
  serviceArea?: GeoBounds;
}

export interface RoutePoint {
  latitude: number;
  longitude: number;
  timestamp: Date;
  accuracy?: number;
}

export interface RouteTracking {
  taskerId: string;
  taskId: string;
  route: RoutePoint[];
  estimatedArrival?: Date;
  lastUpdated: Date;
}

export interface ActiveTasker {
  taskerId: string;
  location: GeoPoint;
  availabilityStatus: string;
  lastSeen: Date;
  preferredCategories: string[];
}

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

export interface LocationTrackingSession {
  id: string;
  userId: string;
  taskId: string;
  startTime: Date;
  endTime?: Date;
  status: 'active' | 'completed' | 'cancelled' | 'disconnected';
  createdAt: Date;
  updatedAt: Date;
}

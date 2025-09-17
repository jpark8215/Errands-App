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

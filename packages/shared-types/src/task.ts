import { TaskStatus, TaskCategory } from './enums';
import { TaskLocation, GeoPoint } from './location';

export interface Task {
  id: string;
  requesterId: string;
  title: string;
  description: string;
  category: TaskCategory;
  location: TaskLocation;
  compensation: number;
  deadline: Date;
  status: TaskStatus;
  requirements: TaskRequirement[];
  isUrgent: boolean;
  estimatedDuration?: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface TaskRequirement {
  id: string;
  description: string;
  isRequired: boolean;
  verificationType?: 'photo' | 'signature' | 'id_check';
}

export interface TaskAssignment {
  id: string;
  taskId: string;
  taskerId: string;
  acceptedAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  route: RoutePoint[];
  estimatedDuration: number;
  actualDuration?: number;
}

export interface RoutePoint {
  latitude: number;
  longitude: number;
  timestamp: Date;
  accuracy?: number;
}

export interface TaskCreationRequest {
  title: string;
  description: string;
  category: TaskCategory;
  location: TaskLocation;
  compensation: number;
  deadline: Date;
  requirements?: TaskRequirement[];
  isUrgent?: boolean;
}

export interface TaskUpdateRequest {
  title?: string;
  description?: string;
  compensation?: number;
  deadline?: Date;
  isUrgent?: boolean;
}

export interface TaskSearchFilters {
  category?: TaskCategory;
  minCompensation?: number;
  maxCompensation?: number;
  radius?: number; // in miles
  center?: GeoPoint;
  status?: TaskStatus[];
  isUrgent?: boolean;
}

export interface OptimizedRoute {
  taskerId: string;
  tasks: Task[];
  totalDistance: number;
  estimatedDuration: number;
  route: RoutePoint[];
  efficiencyScore: number;
}

export interface DemandForecast {
  location: GeoPoint;
  timeWindow: {
    start: Date;
    end: Date;
  };
  predictedDemand: number;
  confidence: number;
  factors: string[];
}

export interface PricingSuggestion {
  basePrice: number;
  suggestedPrice: number;
  surgeMultiplier: number;
  factors: {
    demand: number;
    urgency: number;
    distance: number;
    timeOfDay: number;
  };
}

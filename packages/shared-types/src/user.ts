import { UserType, VerificationStatus, AvailabilityStatus, TaskCategory } from './enums';
import { GeoPoint } from './location';

export interface User {
  id: string;
  email: string;
  phoneNumber: string;
  profile: UserProfile;
  verificationStatus: VerificationStatus;
  userType: UserType;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserProfile {
  firstName: string;
  lastName: string;
  avatar?: string;
  bio?: string;
  preferredCategories: TaskCategory[];
  availability: AvailabilitySchedule;
  rating: number;
  completedTasks: number;
  totalEarnings?: number;
  badges: string[];
}

export interface AvailabilitySchedule {
  status: AvailabilityStatus;
  schedule: TimeSlot[];
  timezone: string;
}

export interface TimeSlot {
  dayOfWeek: number; // 0-6 (Sunday-Saturday)
  startTime: string; // HH:MM format
  endTime: string; // HH:MM format
  isAvailable: boolean;
}

export interface UserRegistration {
  email: string;
  phoneNumber: string;
  password: string;
  userType: UserType;
  firstName: string;
  lastName: string;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface IdentityDocuments {
  governmentId: string; // base64 encoded image
  selfie: string; // base64 encoded image
  documentType: 'drivers_license' | 'passport' | 'state_id';
}

export interface AuthResult {
  user: User;
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface TaskerMatch {
  taskerId: string;
  distance: number;
  estimatedArrival: Date;
  matchScore: number;
  specializations: string[];
  rating: number;
  completedTasks: number;
}

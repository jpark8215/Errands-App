import { User, UserRegistration, LoginCredentials, AuthResult } from './user';
import { Task, TaskCreationRequest, TaskUpdateRequest, TaskSearchFilters } from './task';
import { Payment, PaymentMethod, PaymentResult } from './payment';
import { GeoPoint, TaskLocation } from './location';

// Authentication API
export interface AuthService {
  register(userData: UserRegistration): Promise<AuthResult>;
  login(credentials: LoginCredentials): Promise<AuthResult>;
  verifyPhone(phoneNumber: string, code: string): Promise<boolean>;
  verifyIdentity(documents: any): Promise<string>;
  refreshToken(refreshToken: string): Promise<AuthResult>;
  logout(userId: string): Promise<void>;
}

// User Management API
export interface UserService {
  getUserById(userId: string): Promise<User>;
  updateUserProfile(userId: string, profile: Partial<User>): Promise<User>;
  updateAvailability(userId: string, availability: any): Promise<void>;
  uploadProfilePhoto(userId: string, photo: string): Promise<string>;
  deleteUser(userId: string): Promise<void>;
}

// Task Management API
export interface TaskService {
  createTask(userId: string, taskData: TaskCreationRequest): Promise<Task>;
  getTaskById(taskId: string): Promise<Task>;
  updateTask(taskId: string, updates: TaskUpdateRequest): Promise<Task>;
  cancelTask(taskId: string, userId: string): Promise<void>;
  searchTasks(filters: TaskSearchFilters): Promise<Task[]>;
  getTasksByUser(userId: string, status?: string[]): Promise<Task[]>;
  acceptTask(taskId: string, taskerId: string): Promise<void>;
  startTask(taskId: string, taskerId: string): Promise<void>;
  completeTask(taskId: string, taskerId: string, evidence?: string[]): Promise<void>;
}

// Matching Service API
export interface MatchingService {
  findEligibleTaskers(task: Task, radius: number): Promise<any[]>;
  optimizeRoute(taskerId: string, availableTasks: Task[]): Promise<any>;
  predictDemand(location: GeoPoint, timeWindow: any): Promise<any>;
  suggestPricing(task: Task): Promise<any>;
}

// Location Service API
export interface LocationService {
  updateLocation(userId: string, location: GeoPoint): Promise<void>;
  getActiveTaskers(bounds: any): Promise<any[]>;
  createGeofence(taskId: string, location: GeoPoint, radius: number): Promise<string>;
  trackRoute(taskerId: string, taskId: string): Promise<any>;
}

// Payment Service API
export interface PaymentService {
  addPaymentMethod(userId: string, paymentMethod: any): Promise<PaymentMethod>;
  processPayment(taskId: string, amount: number): Promise<PaymentResult>;
  holdInEscrow(taskId: string, amount: number): Promise<any>;
  releasePayment(taskId: string): Promise<PaymentResult>;
  calculateFees(amount: number, userType: string): Promise<any>;
  scheduleInstantPayout(taskerId: string, amount: number): Promise<any>;
  getPaymentHistory(userId: string): Promise<Payment[]>;
}

// Notification Service API
export interface NotificationService {
  sendPushNotification(userId: string, notification: any): Promise<void>;
  sendSMS(phoneNumber: string, message: string): Promise<void>;
  sendInAppMessage(userId: string, message: any): Promise<void>;
  updateNotificationPreferences(userId: string, preferences: any): Promise<void>;
}

// Common API Response Types
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: Record<string, any>;
  };
  timestamp: string;
  requestId: string;
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

// Error Response
export interface ErrorResponse {
  error: {
    code: string;
    message: string;
    details?: Record<string, any>;
    timestamp: string;
    requestId: string;
  };
}

import { z } from 'zod';
import { UserType, TaskCategory, VerificationStatus } from './enums';

// User validation schemas
export const UserRegistrationSchema = z.object({
  email: z.string().email('Invalid email format'),
  phoneNumber: z.string().regex(/^\+?[1-9]\d{1,14}$/, 'Invalid phone number format'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  userType: z.nativeEnum(UserType),
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required')
});

export const LoginCredentialsSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string().min(1, 'Password is required')
});

export const UserProfileUpdateSchema = z.object({
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  bio: z.string().max(500).optional(),
  preferredCategories: z.array(z.nativeEnum(TaskCategory)).optional(),
  avatar: z.string().url().optional()
});

// Task validation schemas
export const TaskCreationSchema = z.object({
  title: z.string().min(5, 'Title must be at least 5 characters').max(100, 'Title too long'),
  description: z.string().min(10, 'Description must be at least 10 characters').max(1000, 'Description too long'),
  category: z.nativeEnum(TaskCategory),
  location: z.object({
    pickup: z.object({
      latitude: z.number().min(-90).max(90),
      longitude: z.number().min(-180).max(180),
      address: z.string().min(1),
      accuracy: z.number().positive().optional(),
      timestamp: z.date().optional()
    }).optional(),
    delivery: z.object({
      latitude: z.number().min(-90).max(90),
      longitude: z.number().min(-180).max(180),
      address: z.string().min(1),
      accuracy: z.number().positive().optional(),
      timestamp: z.date().optional()
    }).optional()
  }),
  compensation: z.number().min(5, 'Minimum compensation is $5').max(1000, 'Maximum compensation is $1000'),
  deadline: z.date().min(new Date(), 'Deadline must be in the future'),
  requirements: z.array(z.object({
    description: z.string().min(1),
    isRequired: z.boolean(),
    verificationType: z.enum(['photo', 'signature', 'id_check']).optional()
  })).optional(),
  isUrgent: z.boolean().optional()
});

export const TaskUpdateSchema = z.object({
  title: z.string().min(5).max(100).optional(),
  description: z.string().min(10).max(1000).optional(),
  compensation: z.number().min(5).max(1000).optional(),
  deadline: z.date().min(new Date()).optional(),
  isUrgent: z.boolean().optional()
});

export const TaskSearchFiltersSchema = z.object({
  category: z.nativeEnum(TaskCategory).optional(),
  minCompensation: z.number().min(0).optional(),
  maxCompensation: z.number().min(0).optional(),
  radius: z.number().min(0.1).max(50).optional(),
  center: z.object({
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
    accuracy: z.number().positive().optional(),
    timestamp: z.date().optional()
  }).optional(),
  status: z.array(z.string()).optional(),
  isUrgent: z.boolean().optional()
});

// Location validation schemas
export const GeoPointSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  accuracy: z.number().positive(),
  timestamp: z.date()
});

export const LocationUpdateSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  accuracy: z.number().positive(),
  timestamp: z.date().optional()
});

// Payment validation schemas
export const PaymentMethodSchema = z.object({
  type: z.enum(['card', 'bank_account']),
  token: z.string().min(1, 'Payment method token is required')
});

export const PaymentProcessSchema = z.object({
  taskId: z.string().uuid('Invalid task ID'),
  amount: z.number().positive('Amount must be positive'),
  paymentMethodId: z.string().min(1, 'Payment method ID is required')
});

// Notification validation schemas
export const NotificationPreferencesSchema = z.object({
  pushNotifications: z.boolean(),
  smsNotifications: z.boolean(),
  emailNotifications: z.boolean(),
  taskAssigned: z.boolean(),
  taskAccepted: z.boolean(),
  taskCompleted: z.boolean(),
  paymentProcessed: z.boolean(),
  messages: z.boolean()
});

// Common validation utilities
export const validateEmail = (email: string): boolean => {
  return z.string().email().safeParse(email).success;
};

export const validatePhoneNumber = (phone: string): boolean => {
  return z.string().regex(/^\+?[1-9]\d{1,14}$/).safeParse(phone).success;
};

export const validatePassword = (password: string): { valid: boolean; errors: string[] } => {
  const errors: string[] = [];
  
  if (password.length < 8) {
    errors.push('Password must be at least 8 characters');
  }
  if (!/[A-Z]/.test(password)) {
    errors.push('Password must contain at least one uppercase letter');
  }
  if (!/[a-z]/.test(password)) {
    errors.push('Password must contain at least one lowercase letter');
  }
  if (!/\d/.test(password)) {
    errors.push('Password must contain at least one number');
  }
  if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
    errors.push('Password must contain at least one special character');
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
};

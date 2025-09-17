import request from 'supertest';
import express from 'express';
import { userController } from '../../controllers/userController';
import { authMiddleware } from '../../middleware/auth';

// Mock dependencies
jest.mock('@errands-buddy/database', () => ({
  UserRepository: jest.fn().mockImplementation(() => ({
    findWithProfile: jest.fn(),
    updateProfile: jest.fn(),
    setUserPreferredCategories: jest.fn(),
    getUserStats: jest.fn(),
    updateAvailabilityStatus: jest.fn(),
    getAvailabilityStatus: jest.fn(),
    searchUsers: jest.fn(),
    getUserPreferredCategories: jest.fn()
  }))
}));

jest.mock('../../services/profilePhotoService', () => ({
  profilePhotoService: {
    uploadProfilePhoto: jest.fn(),
    deleteProfilePhoto: jest.fn()
  }
}));

jest.mock('../../services/availabilityService', () => ({
  availabilityService: {
    updateAvailabilitySchedule: jest.fn(),
    getAvailabilitySchedule: jest.fn()
  }
}));

describe('User Management API Tests', () => {
  let app: express.Application;
  let mockUserRepository: any;
  let mockProfilePhotoService: any;
  let mockAvailabilityService: any;

  beforeEach(() => {
    app = express();
    app.use(express.json());

    // Setup routes
    app.get('/api/users/profile', authMiddleware.requireAuth(), userController.getProfile);
    app.put('/api/users/profile', authMiddleware.requireAuth(), userController.updateProfile);
    app.put('/api/users/preferred-categories', authMiddleware.requireAuth(), userController.updatePreferredCategories);
    app.get('/api/users/stats', authMiddleware.requireAuth(), userController.getUserStats);
    app.put('/api/users/availability/status', authMiddleware.requireAuth(), userController.updateAvailabilityStatus);
    app.put('/api/users/availability/schedule', authMiddleware.requireAuth(), userController.updateAvailabilitySchedule);
    app.get('/api/users/availability/schedule', authMiddleware.requireAuth(), userController.getAvailabilitySchedule);
    app.post('/api/users/profile/photo', authMiddleware.requireAuth(), userController.uploadProfilePhoto);
    app.delete('/api/users/profile/photo', authMiddleware.requireAuth(), userController.deleteProfilePhoto);
    app.get('/api/users/search', userController.searchUsers);
    app.get('/api/users/:userId', userController.getUserById);

    // Mock authentication middleware
    app.use((req, res, next) => {
      req.user = {
        id: 'user-1',
        email: 'test@example.com',
        userType: 'requester',
        verificationStatus: 'verified',
        tokenPayload: { userId: 'user-1' }
      };
      next();
    });

    // Reset mocks
    mockUserRepository = {
      findWithProfile: jest.fn(),
      updateProfile: jest.fn(),
      setUserPreferredCategories: jest.fn(),
      getUserStats: jest.fn(),
      updateAvailabilityStatus: jest.fn(),
      getAvailabilityStatus: jest.fn(),
      searchUsers: jest.fn(),
      getUserPreferredCategories: jest.fn()
    };

    mockProfilePhotoService = require('../../services/profilePhotoService').profilePhotoService;
    mockAvailabilityService = require('../../services/availabilityService').availabilityService;

    jest.clearAllMocks();
  });

  describe('GET /api/users/profile', () => {
    it('should get user profile successfully', async () => {
      const mockUser = {
        id: 'user-1',
        email: 'test@example.com',
        phoneNumber: '+1234567890',
        userType: 'requester',
        verificationStatus: 'verified',
        profile: {
          firstName: 'John',
          lastName: 'Doe',
          avatar: 'https://example.com/avatar.jpg',
          bio: 'Test bio',
          preferredCategories: [],
          availability: {
            status: 'offline',
            schedule: [],
            timezone: 'UTC'
          },
          rating: 4.5,
          completedTasks: 10,
          badges: []
        }
      };

      mockUserRepository.findWithProfile.mockResolvedValue(mockUser);
      mockUserRepository.getUserPreferredCategories.mockResolvedValue(['shopping', 'delivery']);
      mockUserRepository.getAvailabilityStatus.mockResolvedValue('online');

      const response = await request(app)
        .get('/api/users/profile')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.id).toBe('user-1');
      expect(response.body.data.profile.firstName).toBe('John');
    });

    it('should return 404 if user not found', async () => {
      mockUserRepository.findWithProfile.mockResolvedValue(null);

      const response = await request(app)
        .get('/api/users/profile')
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('USER_NOT_FOUND');
    });
  });

  describe('PUT /api/users/profile', () => {
    it('should update user profile successfully', async () => {
      const updateData = {
        firstName: 'Jane',
        lastName: 'Smith',
        bio: 'Updated bio'
      };

      const updatedProfile = {
        firstName: 'Jane',
        lastName: 'Smith',
        bio: 'Updated bio',
        avatar: undefined,
        preferredCategories: [],
        availability: {
          status: 'offline',
          schedule: [],
          timezone: 'UTC'
        },
        rating: 0,
        completedTasks: 0,
        badges: []
      };

      mockUserRepository.updateProfile.mockResolvedValue(updatedProfile);

      const response = await request(app)
        .put('/api/users/profile')
        .send(updateData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.firstName).toBe('Jane');
      expect(response.body.data.lastName).toBe('Smith');
    });

    it('should validate input data', async () => {
      const invalidData = {
        firstName: 'A', // Too short
        lastName: 'B', // Too short
        bio: 'x'.repeat(501) // Too long
      };

      const response = await request(app)
        .put('/api/users/profile')
        .send(invalidData)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('PUT /api/users/preferred-categories', () => {
    it('should update preferred categories successfully', async () => {
      const categories = ['shopping', 'delivery', 'pharmacy'];

      mockUserRepository.setUserPreferredCategories.mockResolvedValue(undefined);

      const response = await request(app)
        .put('/api/users/preferred-categories')
        .send({ categories })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Preferred categories updated successfully');
    });

    it('should validate categories', async () => {
      const invalidCategories = ['invalid_category', 'shopping'];

      const response = await request(app)
        .put('/api/users/preferred-categories')
        .send({ categories: invalidCategories })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should limit number of categories', async () => {
      const tooManyCategories = Array(11).fill('shopping');

      const response = await request(app)
        .put('/api/users/preferred-categories')
        .send({ categories: tooManyCategories })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.message).toContain('Maximum 10 categories allowed');
    });
  });

  describe('GET /api/users/stats', () => {
    it('should get user statistics successfully', async () => {
      const mockStats = {
        totalTasks: 25,
        completedTasks: 20,
        averageRating: 4.8,
        totalEarnings: 450.00
      };

      mockUserRepository.getUserStats.mockResolvedValue(mockStats);

      const response = await request(app)
        .get('/api/users/stats')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual(mockStats);
    });
  });

  describe('PUT /api/users/availability/status', () => {
    it('should update availability status successfully', async () => {
      mockUserRepository.updateAvailabilityStatus.mockResolvedValue(true);

      const response = await request(app)
        .put('/api/users/availability/status')
        .send({ status: 'online' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Availability status updated successfully');
    });

    it('should validate availability status', async () => {
      const response = await request(app)
        .put('/api/users/availability/status')
        .send({ status: 'invalid_status' })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('PUT /api/users/availability/schedule', () => {
    it('should update availability schedule successfully', async () => {
      const schedule = [
        {
          dayOfWeek: 1, // Monday
          startTime: '09:00',
          endTime: '17:00',
          isAvailable: true
        },
        {
          dayOfWeek: 2, // Tuesday
          startTime: '09:00',
          endTime: '17:00',
          isAvailable: true
        }
      ];

      const mockResult = {
        success: true,
        schedule: schedule.map((entry, index) => ({
          id: `user-1_${entry.dayOfWeek}_${Date.now()}`,
          userId: 'user-1',
          ...entry,
          timezone: 'UTC',
          createdAt: new Date(),
          updatedAt: new Date()
        }))
      };

      mockAvailabilityService.updateAvailabilitySchedule.mockResolvedValue(mockResult);

      const response = await request(app)
        .put('/api/users/availability/schedule')
        .send({ schedule })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Availability schedule updated successfully');
      expect(response.body.data).toBeDefined();
    });

    it('should validate schedule data', async () => {
      const invalidSchedule = [
        {
          dayOfWeek: 8, // Invalid day
          startTime: '25:00', // Invalid time
          endTime: '09:00',
          isAvailable: true
        }
      ];

      const mockResult = {
        success: false,
        error: 'Invalid day of week'
      };

      mockAvailabilityService.updateAvailabilitySchedule.mockResolvedValue(mockResult);

      const response = await request(app)
        .put('/api/users/availability/schedule')
        .send({ schedule: invalidSchedule })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('GET /api/users/availability/schedule', () => {
    it('should get availability schedule successfully', async () => {
      const mockSchedule = [
        {
          id: 'schedule-1',
          userId: 'user-1',
          dayOfWeek: 1,
          startTime: '09:00',
          endTime: '17:00',
          isAvailable: true,
          timezone: 'UTC',
          createdAt: new Date(),
          updatedAt: new Date()
        }
      ];

      mockAvailabilityService.getAvailabilitySchedule.mockResolvedValue(mockSchedule);

      const response = await request(app)
        .get('/api/users/availability/schedule')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual(mockSchedule);
    });
  });

  describe('POST /api/users/profile/photo', () => {
    it('should upload profile photo successfully', async () => {
      const base64Image = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD...';

      const mockResult = {
        success: true,
        photoUrl: 'https://cdn.example.com/profile_123.jpg',
        thumbnailUrl: 'https://cdn.example.com/profile_123_thumb.jpg'
      };

      mockProfilePhotoService.uploadProfilePhoto.mockResolvedValue(mockResult);

      const response = await request(app)
        .post('/api/users/profile/photo')
        .send({ image: base64Image })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.photoUrl).toBeDefined();
      expect(response.body.data.thumbnailUrl).toBeDefined();
    });

    it('should handle photo upload failure', async () => {
      const base64Image = 'invalid-image-data';

      const mockResult = {
        success: false,
        error: 'Invalid image format'
      };

      mockProfilePhotoService.uploadProfilePhoto.mockResolvedValue(mockResult);

      const response = await request(app)
        .post('/api/users/profile/photo')
        .send({ image: base64Image })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('UPLOAD_ERROR');
    });
  });

  describe('DELETE /api/users/profile/photo', () => {
    it('should delete profile photo successfully', async () => {
      const mockResult = {
        success: true
      };

      mockProfilePhotoService.deleteProfilePhoto.mockResolvedValue(mockResult);

      const response = await request(app)
        .delete('/api/users/profile/photo')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Profile photo deleted successfully');
    });

    it('should handle photo deletion failure', async () => {
      const mockResult = {
        success: false,
        error: 'No profile photo found'
      };

      mockProfilePhotoService.deleteProfilePhoto.mockResolvedValue(mockResult);

      const response = await request(app)
        .delete('/api/users/profile/photo')
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('DELETE_ERROR');
    });
  });

  describe('GET /api/users/search', () => {
    it('should search users successfully', async () => {
      const mockUsers = [
        {
          id: 'user-1',
          email: 'john@example.com',
          userType: 'requester',
          verificationStatus: 'verified'
        },
        {
          id: 'user-2',
          email: 'jane@example.com',
          userType: 'tasker',
          verificationStatus: 'verified'
        }
      ];

      mockUserRepository.searchUsers.mockResolvedValue(mockUsers);

      const response = await request(app)
        .get('/api/users/search')
        .query({ q: 'john' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.users).toHaveLength(2);
      expect(response.body.data.query).toBe('john');
    });

    it('should filter by user type', async () => {
      const mockUsers = [
        {
          id: 'user-2',
          email: 'jane@example.com',
          userType: 'tasker',
          verificationStatus: 'verified'
        }
      ];

      mockUserRepository.searchUsers.mockResolvedValue(mockUsers);

      const response = await request(app)
        .get('/api/users/search')
        .query({ q: 'jane', userType: 'tasker' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.users).toHaveLength(1);
      expect(response.body.data.users[0].userType).toBe('tasker');
    });

    it('should require search query', async () => {
      const response = await request(app)
        .get('/api/users/search')
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('GET /api/users/:userId', () => {
    it('should get public user profile successfully', async () => {
      const mockUser = {
        id: 'user-1',
        email: 'test@example.com',
        phoneNumber: '+1234567890',
        userType: 'requester',
        verificationStatus: 'verified',
        profile: {
          firstName: 'John',
          lastName: 'Doe',
          avatar: 'https://example.com/avatar.jpg',
          bio: 'Test bio',
          preferredCategories: [],
          availability: {
            status: 'offline',
            schedule: [],
            timezone: 'UTC'
          },
          rating: 4.5,
          completedTasks: 10,
          badges: []
        }
      };

      mockUserRepository.findWithProfile.mockResolvedValue(mockUser);

      const response = await request(app)
        .get('/api/users/user-1')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.id).toBe('user-1');
      expect(response.body.data.profile.firstName).toBe('John');
      expect(response.body.data.email).toBeUndefined(); // Should not include private data
    });

    it('should return 404 if user not found', async () => {
      mockUserRepository.findWithProfile.mockResolvedValue(null);

      const response = await request(app)
        .get('/api/users/nonexistent')
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('USER_NOT_FOUND');
    });
  });

  describe('Error Handling', () => {
    it('should handle service errors gracefully', async () => {
      mockUserRepository.findWithProfile.mockRejectedValue(new Error('Database error'));

      const response = await request(app)
        .get('/api/users/profile')
        .expect(500);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('INTERNAL_ERROR');
    });

    it('should handle missing authentication', async () => {
      // Remove authentication middleware
      const appWithoutAuth = express();
      appWithoutAuth.use(express.json());
      appWithoutAuth.get('/api/users/profile', userController.getProfile);

      const response = await request(appWithoutAuth)
        .get('/api/users/profile')
        .expect(500);

      expect(response.body.success).toBe(false);
    });
  });
});

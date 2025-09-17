import { UserRepository } from '../UserRepository';
import { UserType, VerificationStatus } from '@errands-buddy/shared-types';

// Mock the database connection
jest.mock('../../config/database', () => ({
  getPostgresPool: jest.fn(() => ({
    query: jest.fn(),
    connect: jest.fn(),
    end: jest.fn()
  }))
}));

describe('UserRepository', () => {
  let userRepository: UserRepository;
  let mockQuery: jest.Mock;

  beforeEach(() => {
    userRepository = new UserRepository();
    mockQuery = jest.fn();
    (userRepository as any).query = mockQuery;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('findByEmail', () => {
    it('should return user when found by email', async () => {
      const mockUser = {
        id: 'user-1',
        email: 'test@example.com',
        phone_number: '+1234567890',
        user_type: 'requester',
        verification_status: 'verified',
        created_at: new Date(),
        updated_at: new Date()
      };

      mockQuery.mockResolvedValue({ rows: [mockUser] });

      const result = await userRepository.findByEmail('test@example.com');

      expect(result).toEqual({
        id: 'user-1',
        email: 'test@example.com',
        phoneNumber: '+1234567890',
        userType: 'requester',
        verificationStatus: 'verified',
        createdAt: mockUser.created_at,
        updatedAt: mockUser.updated_at,
        profile: expect.any(Object)
      });

      expect(mockQuery).toHaveBeenCalledWith(
        'SELECT * FROM users WHERE email = $1',
        ['test@example.com']
      );
    });

    it('should return null when user not found', async () => {
      mockQuery.mockResolvedValue({ rows: [] });

      const result = await userRepository.findByEmail('nonexistent@example.com');

      expect(result).toBeNull();
    });
  });

  describe('findByPhoneNumber', () => {
    it('should return user when found by phone number', async () => {
      const mockUser = {
        id: 'user-1',
        email: 'test@example.com',
        phone_number: '+1234567890',
        user_type: 'tasker',
        verification_status: 'verified',
        created_at: new Date(),
        updated_at: new Date()
      };

      mockQuery.mockResolvedValue({ rows: [mockUser] });

      const result = await userRepository.findByPhoneNumber('+1234567890');

      expect(result).toBeDefined();
      expect(result?.phoneNumber).toBe('+1234567890');

      expect(mockQuery).toHaveBeenCalledWith(
        'SELECT * FROM users WHERE phone_number = $1',
        ['+1234567890']
      );
    });
  });

  describe('createWithProfile', () => {
    it('should create user with profile', async () => {
      const userData = {
        email: 'newuser@example.com',
        phoneNumber: '+1234567890',
        passwordHash: 'hashed-password',
        userType: UserType.REQUESTER,
        firstName: 'John',
        lastName: 'Doe',
        bio: 'Test bio'
      };

      const mockUser = {
        id: 'user-1',
        email: userData.email,
        phone_number: userData.phoneNumber,
        password_hash: userData.passwordHash,
        user_type: userData.userType,
        verification_status: 'pending',
        created_at: new Date(),
        updated_at: new Date()
      };

      const mockProfile = {
        first_name: userData.firstName,
        last_name: userData.lastName,
        bio: userData.bio,
        rating: 0,
        completed_tasks: 0,
        total_earnings: 0
      };

      // Mock transaction
      const mockClient = {
        query: jest.fn()
          .mockResolvedValueOnce({ rows: [mockUser] }) // User creation
          .mockResolvedValueOnce({ rows: [] }) // Profile creation
          .mockResolvedValueOnce({ rows: [] }) // Availability creation
      };

      (userRepository as any).transaction = jest.fn().mockImplementation(async (callback) => {
        return await callback(mockClient);
      });

      // Mock findWithProfile
      jest.spyOn(userRepository, 'findWithProfile').mockResolvedValue({
        id: 'user-1',
        email: userData.email,
        phoneNumber: userData.phoneNumber,
        userType: userData.userType,
        verificationStatus: 'pending',
        createdAt: mockUser.created_at,
        updatedAt: mockUser.updated_at,
        profile: {
          firstName: userData.firstName,
          lastName: userData.lastName,
          avatar: undefined,
          bio: userData.bio,
          preferredCategories: [],
          availability: {
            status: 'offline',
            schedule: [],
            timezone: 'UTC'
          },
          rating: 0,
          completedTasks: 0,
          totalEarnings: 0,
          badges: []
        }
      });

      const result = await userRepository.createWithProfile(userData);

      expect(result).toBeDefined();
      expect(result.email).toBe(userData.email);
      expect(result.profile.firstName).toBe(userData.firstName);
      expect(result.profile.lastName).toBe(userData.lastName);

      expect(mockClient.query).toHaveBeenCalledTimes(3);
    });
  });

  describe('updateVerificationStatus', () => {
    it('should update user verification status', async () => {
      mockQuery.mockResolvedValue({ rowCount: 1 });

      const result = await userRepository.updateVerificationStatus('user-1', VerificationStatus.VERIFIED);

      expect(result).toBe(true);
      expect(mockQuery).toHaveBeenCalledWith(
        'UPDATE users SET verification_status = $1, updated_at = NOW() WHERE id = $2',
        [VerificationStatus.VERIFIED, 'user-1']
      );
    });

    it('should return false when user not found', async () => {
      mockQuery.mockResolvedValue({ rowCount: 0 });

      const result = await userRepository.updateVerificationStatus('nonexistent', VerificationStatus.VERIFIED);

      expect(result).toBe(false);
    });
  });

  describe('findTaskersByLocation', () => {
    it('should find taskers within radius', async () => {
      const mockTaskers = [
        {
          id: 'tasker-1',
          email: 'tasker1@example.com',
          phone_number: '+1234567890',
          user_type: 'tasker',
          verification_status: 'verified',
          created_at: new Date(),
          updated_at: new Date()
        }
      ];

      mockQuery.mockResolvedValue({ rows: mockTaskers });

      const result = await userRepository.findTaskersByLocation(40.7128, -74.0059, 5, 10);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('tasker-1');

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('ST_DWithin'),
        expect.arrayContaining([
          'POINT(-74.0059 40.7128)',
          5000, // 5km in meters
          10
        ])
      );
    });
  });

  describe('findTaskersByCategory', () => {
    it('should find taskers by category within radius', async () => {
      const mockTaskers = [
        {
          id: 'tasker-1',
          email: 'tasker1@example.com',
          phone_number: '+1234567890',
          user_type: 'tasker',
          verification_status: 'verified',
          created_at: new Date(),
          updated_at: new Date()
        }
      ];

      mockQuery.mockResolvedValue({ rows: mockTaskers });

      const result = await userRepository.findTaskersByCategory('shopping', 40.7128, -74.0059, 5, 10);

      expect(result).toHaveLength(1);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('upc.category = $1'),
        expect.arrayContaining(['shopping'])
      );
    });
  });

  describe('getUserStats', () => {
    it('should return user statistics', async () => {
      const mockStats = {
        total_tasks: 10,
        completed_tasks: 8,
        average_rating: 4.5,
        total_earnings: 150.00
      };

      mockQuery.mockResolvedValue({ rows: [mockStats] });

      const result = await userRepository.getUserStats('user-1');

      expect(result).toEqual({
        totalTasks: 10,
        completedTasks: 8,
        averageRating: 4.5,
        totalEarnings: 150.00
      });
    });
  });
});

import { authService } from '../authService';
import { UserType } from '@errands-buddy/shared-types';

// Mock bcrypt
jest.mock('bcryptjs', () => ({
  hash: jest.fn().mockResolvedValue('hashed-password'),
  compare: jest.fn().mockResolvedValue(true)
}));

// Mock jsonwebtoken
jest.mock('jsonwebtoken', () => ({
  sign: jest.fn().mockReturnValue('mock-token'),
  verify: jest.fn().mockReturnValue({ userId: 'test-id', email: 'test@example.com' })
}));

describe('AuthService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('register', () => {
    it('should register a new user successfully', async () => {
      const userData = {
        email: 'test@example.com',
        password: 'password123',
        phoneNumber: '+1234567890',
        userType: UserType.REQUESTER,
        firstName: 'John',
        lastName: 'Doe'
      };

      const result = await authService.register(userData);

      expect(result).toHaveProperty('user');
      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
      expect(result.user.email).toBe(userData.email);
      expect(result.user.userType).toBe(userData.userType);
    });

    it('should hash the password', async () => {
      const bcrypt = require('bcryptjs');
      const userData = {
        email: 'test@example.com',
        password: 'password123',
        phoneNumber: '+1234567890',
        userType: UserType.REQUESTER,
        firstName: 'John',
        lastName: 'Doe'
      };

      await authService.register(userData);

      expect(bcrypt.hash).toHaveBeenCalledWith(userData.password, 12);
    });
  });

  describe('login', () => {
    it('should login a user successfully', async () => {
      const credentials = {
        email: 'test@example.com',
        password: 'password123'
      };

      const result = await authService.login(credentials);

      expect(result).toHaveProperty('user');
      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
      expect(result.user.email).toBe(credentials.email);
    });
  });

  describe('refreshToken', () => {
    it('should refresh token successfully', async () => {
      const refreshToken = 'valid-refresh-token';

      const result = await authService.refreshToken(refreshToken);

      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
    });

    it('should throw error for invalid refresh token', async () => {
      const jwt = require('jsonwebtoken');
      jwt.verify.mockImplementation(() => {
        throw new Error('Invalid token');
      });

      await expect(authService.refreshToken('invalid-token')).rejects.toThrow('Invalid refresh token');
    });
  });

  describe('logout', () => {
    it('should logout user successfully', async () => {
      const userId = 'test-user-id';

      await expect(authService.logout(userId)).resolves.toBeUndefined();
    });
  });

  describe('verifyPhone', () => {
    it('should verify phone number successfully', async () => {
      const phoneNumber = '+1234567890';
      const code = '123456';

      const result = await authService.verifyPhone(phoneNumber, code);

      expect(result).toBe(true);
    });
  });

  describe('verifyIdentity', () => {
    it('should verify identity successfully', async () => {
      const documents = {
        governmentId: 'base64-encoded-image',
        selfie: 'base64-encoded-image',
        documentType: 'drivers_license'
      };

      const result = await authService.verifyIdentity(documents);

      expect(result).toBe('pending');
    });
  });
});

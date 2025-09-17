import { Request, Response, NextFunction } from 'express';
import { authMiddleware } from '../auth';
import { UserType, VerificationStatus } from '@errands-buddy/shared-types';

// Mock dependencies
jest.mock('@errands-buddy/database', () => ({
  UserRepository: jest.fn().mockImplementation(() => ({
    findById: jest.fn()
  }))
}));

jest.mock('../utils/jwt', () => ({
  jwtManager: {
    extractTokenFromHeader: jest.fn(),
    verifyAccessToken: jest.fn(),
    isTokenBlacklisted: jest.fn()
  }
}));

jest.mock('../../services/refreshTokenService', () => ({
  refreshTokenService: {
    validateRefreshToken: jest.fn()
  }
}));

describe('AuthMiddleware', () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let mockNext: NextFunction;
  let mockUserRepository: any;
  let mockJwtManager: any;
  let mockRefreshTokenService: any;

  beforeEach(() => {
    mockRequest = {
      headers: {},
      ip: '127.0.0.1',
      get: jest.fn()
    };
    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      setHeader: jest.fn()
    };
    mockNext = jest.fn();

    // Reset mocks
    mockUserRepository = {
      findById: jest.fn()
    };
    mockJwtManager = require('../utils/jwt').jwtManager;
    mockRefreshTokenService = require('../../services/refreshTokenService').refreshTokenService;

    jest.clearAllMocks();
  });

  describe('requireAuth', () => {
    it('should authenticate valid user', async () => {
      const mockUser = {
        id: 'user-1',
        email: 'test@example.com',
        userType: UserType.REQUESTER,
        verificationStatus: VerificationStatus.VERIFIED
      };

      const mockPayload = {
        userId: 'user-1',
        email: 'test@example.com',
        userType: UserType.REQUESTER,
        jti: 'token-123'
      };

      mockRequest.headers = { authorization: 'Bearer valid-token' };
      mockJwtManager.extractTokenFromHeader.mockReturnValue('valid-token');
      mockJwtManager.verifyAccessToken.mockReturnValue(mockPayload);
      mockJwtManager.isTokenBlacklisted.mockResolvedValue(false);
      mockUserRepository.findById.mockResolvedValue(mockUser);

      const middleware = authMiddleware.requireAuth();
      await middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockRequest.user).toEqual({
        id: 'user-1',
        email: 'test@example.com',
        userType: UserType.REQUESTER,
        verificationStatus: VerificationStatus.VERIFIED,
        tokenPayload: mockPayload
      });
    });

    it('should return 401 for missing token', async () => {
      mockRequest.headers = {};

      const middleware = authMiddleware.requireAuth();
      await middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        error: {
          code: 'MISSING_TOKEN',
          message: 'Authorization token required'
        }
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should return 401 for invalid token', async () => {
      mockRequest.headers = { authorization: 'Bearer invalid-token' };
      mockJwtManager.extractTokenFromHeader.mockReturnValue('invalid-token');
      mockJwtManager.verifyAccessToken.mockImplementation(() => {
        throw new Error('Invalid token');
      });

      const middleware = authMiddleware.requireAuth();
      await middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        error: {
          code: 'INVALID_TOKEN',
          message: 'Invalid token'
        }
      });
    });

    it('should return 401 for blacklisted token', async () => {
      const mockPayload = {
        userId: 'user-1',
        email: 'test@example.com',
        userType: UserType.REQUESTER,
        jti: 'token-123'
      };

      mockRequest.headers = { authorization: 'Bearer blacklisted-token' };
      mockJwtManager.extractTokenFromHeader.mockReturnValue('blacklisted-token');
      mockJwtManager.verifyAccessToken.mockReturnValue(mockPayload);
      mockJwtManager.isTokenBlacklisted.mockResolvedValue(true);

      const middleware = authMiddleware.requireAuth();
      await middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        error: {
          code: 'TOKEN_BLACKLISTED',
          message: 'Token has been revoked'
        }
      });
    });

    it('should return 401 for non-existent user', async () => {
      const mockPayload = {
        userId: 'non-existent',
        email: 'test@example.com',
        userType: UserType.REQUESTER,
        jti: 'token-123'
      };

      mockRequest.headers = { authorization: 'Bearer valid-token' };
      mockJwtManager.extractTokenFromHeader.mockReturnValue('valid-token');
      mockJwtManager.verifyAccessToken.mockReturnValue(mockPayload);
      mockJwtManager.isTokenBlacklisted.mockResolvedValue(false);
      mockUserRepository.findById.mockResolvedValue(null);

      const middleware = authMiddleware.requireAuth();
      await middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        error: {
          code: 'USER_NOT_FOUND',
          message: 'User not found'
        }
      });
    });
  });

  describe('requireUserTypes', () => {
    it('should allow access for correct user type', async () => {
      const mockUser = {
        id: 'user-1',
        email: 'test@example.com',
        userType: UserType.TASKER,
        verificationStatus: VerificationStatus.VERIFIED
      };

      const mockPayload = {
        userId: 'user-1',
        email: 'test@example.com',
        userType: UserType.TASKER,
        jti: 'token-123'
      };

      mockRequest.headers = { authorization: 'Bearer valid-token' };
      mockJwtManager.extractTokenFromHeader.mockReturnValue('valid-token');
      mockJwtManager.verifyAccessToken.mockReturnValue(mockPayload);
      mockJwtManager.isTokenBlacklisted.mockResolvedValue(false);
      mockUserRepository.findById.mockResolvedValue(mockUser);

      const middleware = authMiddleware.requireUserTypes(UserType.TASKER);
      await middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should deny access for incorrect user type', async () => {
      const mockUser = {
        id: 'user-1',
        email: 'test@example.com',
        userType: UserType.REQUESTER,
        verificationStatus: VerificationStatus.VERIFIED
      };

      const mockPayload = {
        userId: 'user-1',
        email: 'test@example.com',
        userType: UserType.REQUESTER,
        jti: 'token-123'
      };

      mockRequest.headers = { authorization: 'Bearer valid-token' };
      mockJwtManager.extractTokenFromHeader.mockReturnValue('valid-token');
      mockJwtManager.verifyAccessToken.mockReturnValue(mockPayload);
      mockJwtManager.isTokenBlacklisted.mockResolvedValue(false);
      mockUserRepository.findById.mockResolvedValue(mockUser);

      const middleware = authMiddleware.requireUserTypes(UserType.TASKER);
      await middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(403);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        error: {
          code: 'INSUFFICIENT_PERMISSIONS',
          message: 'Insufficient permissions for this action'
        }
      });
    });
  });

  describe('requireVerification', () => {
    it('should allow access for verified user', async () => {
      const mockUser = {
        id: 'user-1',
        email: 'test@example.com',
        userType: UserType.REQUESTER,
        verificationStatus: VerificationStatus.VERIFIED
      };

      const mockPayload = {
        userId: 'user-1',
        email: 'test@example.com',
        userType: UserType.REQUESTER,
        jti: 'token-123'
      };

      mockRequest.headers = { authorization: 'Bearer valid-token' };
      mockJwtManager.extractTokenFromHeader.mockReturnValue('valid-token');
      mockJwtManager.verifyAccessToken.mockReturnValue(mockPayload);
      mockJwtManager.isTokenBlacklisted.mockResolvedValue(false);
      mockUserRepository.findById.mockResolvedValue(mockUser);

      const middleware = authMiddleware.requireVerification();
      await middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should deny access for unverified user', async () => {
      const mockUser = {
        id: 'user-1',
        email: 'test@example.com',
        userType: UserType.REQUESTER,
        verificationStatus: VerificationStatus.PENDING
      };

      const mockPayload = {
        userId: 'user-1',
        email: 'test@example.com',
        userType: UserType.REQUESTER,
        jti: 'token-123'
      };

      mockRequest.headers = { authorization: 'Bearer valid-token' };
      mockJwtManager.extractTokenFromHeader.mockReturnValue('valid-token');
      mockJwtManager.verifyAccessToken.mockReturnValue(mockPayload);
      mockJwtManager.isTokenBlacklisted.mockResolvedValue(false);
      mockUserRepository.findById.mockResolvedValue(mockUser);

      const middleware = authMiddleware.requireVerification();
      await middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(403);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        error: {
          code: 'VERIFICATION_REQUIRED',
          message: 'Account verification required'
        }
      });
    });
  });

  describe('rateLimit', () => {
    it('should allow requests within limit', async () => {
      const middleware = authMiddleware.rateLimit(60000, 10); // 10 requests per minute

      // Make 5 requests
      for (let i = 0; i < 5; i++) {
        await middleware(mockRequest as Request, mockResponse as Response, mockNext);
        expect(mockNext).toHaveBeenCalledTimes(i + 1);
      }
    });

    it('should block requests exceeding limit', async () => {
      const middleware = authMiddleware.rateLimit(60000, 3); // 3 requests per minute

      // Make 3 requests (should be allowed)
      for (let i = 0; i < 3; i++) {
        await middleware(mockRequest as Request, mockResponse as Response, mockNext);
      }

      // 4th request should be blocked
      await middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(429);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: 'Too many requests, please try again later'
        }
      });
    });
  });

  describe('validateRefreshToken', () => {
    it('should validate refresh token', async () => {
      const mockTokenData = {
        userId: 'user-1',
        email: 'test@example.com',
        tokenVersion: 1,
        jti: 'refresh-123'
      };

      mockRequest.body = { refreshToken: 'valid-refresh-token' };
      mockRefreshTokenService.validateRefreshToken.mockResolvedValue(mockTokenData);

      const middleware = authMiddleware.validateRefreshToken();
      await middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect((mockRequest as any).refreshTokenData).toEqual(mockTokenData);
    });

    it('should return 400 for missing refresh token', async () => {
      mockRequest.body = {};

      const middleware = authMiddleware.validateRefreshToken();
      await middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        error: {
          code: 'MISSING_REFRESH_TOKEN',
          message: 'Refresh token required'
        }
      });
    });

    it('should return 401 for invalid refresh token', async () => {
      mockRequest.body = { refreshToken: 'invalid-refresh-token' };
      mockRefreshTokenService.validateRefreshToken.mockResolvedValue(null);

      const middleware = authMiddleware.validateRefreshToken();
      await middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        error: {
          code: 'INVALID_REFRESH_TOKEN',
          message: 'Invalid or expired refresh token'
        }
      });
    });
  });

  describe('securityHeaders', () => {
    it('should set security headers', () => {
      const middleware = authMiddleware.securityHeaders();
      middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.setHeader).toHaveBeenCalledWith('X-Frame-Options', 'DENY');
      expect(mockResponse.setHeader).toHaveBeenCalledWith('X-Content-Type-Options', 'nosniff');
      expect(mockResponse.setHeader).toHaveBeenCalledWith('X-XSS-Protection', '1; mode=block');
      expect(mockResponse.setHeader).toHaveBeenCalledWith('Content-Security-Policy', "default-src 'self'");
      expect(mockResponse.setHeader).toHaveBeenCalledWith('Referrer-Policy', 'strict-origin-when-cross-origin');
      expect(mockNext).toHaveBeenCalled();
    });
  });
});

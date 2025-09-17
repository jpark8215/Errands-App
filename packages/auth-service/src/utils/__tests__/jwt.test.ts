import { JWTManager, JWTPayload, RefreshTokenPayload } from '../jwt';
import { UserType, VerificationStatus } from '@errands-buddy/shared-types';

// Mock jsonwebtoken
jest.mock('jsonwebtoken', () => ({
  sign: jest.fn(),
  verify: jest.fn(),
  decode: jest.fn()
}));

describe('JWTManager', () => {
  let jwtManager: JWTManager;
  let mockJwt: any;

  beforeEach(() => {
    jwtManager = new JWTManager();
    mockJwt = require('jsonwebtoken');
    jest.clearAllMocks();
  });

  describe('generateAccessToken', () => {
    it('should generate access token with correct payload', () => {
      const user = {
        id: 'user-1',
        email: 'test@example.com',
        phoneNumber: '+1234567890',
        userType: UserType.REQUESTER,
        verificationStatus: VerificationStatus.VERIFIED,
        profile: {
          firstName: 'John',
          lastName: 'Doe',
          preferredCategories: [],
          availability: {
            status: 'offline',
            schedule: [],
            timezone: 'UTC'
          },
          rating: 0,
          completedTasks: 0,
          badges: []
        },
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const mockToken = 'mock-access-token';
      mockJwt.sign.mockReturnValue(mockToken);

      const result = jwtManager.generateAccessToken(user);

      expect(result).toBe(mockToken);
      expect(mockJwt.sign).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: user.id,
          email: user.email,
          userType: user.userType,
          jti: expect.any(String)
        }),
        expect.any(String),
        expect.objectContaining({
          expiresIn: expect.any(String),
          issuer: expect.any(String),
          audience: expect.any(String),
          algorithm: 'HS256'
        })
      );
    });

    it('should throw error when token generation fails', () => {
      const user = {
        id: 'user-1',
        email: 'test@example.com',
        phoneNumber: '+1234567890',
        userType: UserType.REQUESTER,
        verificationStatus: VerificationStatus.VERIFIED,
        profile: {
          firstName: 'John',
          lastName: 'Doe',
          preferredCategories: [],
          availability: {
            status: 'offline',
            schedule: [],
            timezone: 'UTC'
          },
          rating: 0,
          completedTasks: 0,
          badges: []
        },
        createdAt: new Date(),
        updatedAt: new Date()
      };

      mockJwt.sign.mockImplementation(() => {
        throw new Error('Signing failed');
      });

      expect(() => jwtManager.generateAccessToken(user)).toThrow('Token generation failed');
    });
  });

  describe('generateRefreshToken', () => {
    it('should generate refresh token with correct payload', () => {
      const user = {
        id: 'user-1',
        email: 'test@example.com',
        phoneNumber: '+1234567890',
        userType: UserType.REQUESTER,
        verificationStatus: VerificationStatus.VERIFIED,
        profile: {
          firstName: 'John',
          lastName: 'Doe',
          preferredCategories: [],
          availability: {
            status: 'offline',
            schedule: [],
            timezone: 'UTC'
          },
          rating: 0,
          completedTasks: 0,
          badges: []
        },
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const mockToken = 'mock-refresh-token';
      mockJwt.sign.mockReturnValue(mockToken);

      const result = jwtManager.generateRefreshToken(user, 2);

      expect(result).toBe(mockToken);
      expect(mockJwt.sign).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: user.id,
          email: user.email,
          tokenVersion: 2,
          jti: expect.any(String)
        }),
        expect.any(String),
        expect.objectContaining({
          expiresIn: expect.any(String),
          issuer: expect.any(String),
          audience: expect.any(String),
          algorithm: 'HS256'
        })
      );
    });
  });

  describe('generateTokenPair', () => {
    it('should generate both access and refresh tokens', () => {
      const user = {
        id: 'user-1',
        email: 'test@example.com',
        phoneNumber: '+1234567890',
        userType: UserType.REQUESTER,
        verificationStatus: VerificationStatus.VERIFIED,
        profile: {
          firstName: 'John',
          lastName: 'Doe',
          preferredCategories: [],
          availability: {
            status: 'offline',
            schedule: [],
            timezone: 'UTC'
          },
          rating: 0,
          completedTasks: 0,
          badges: []
        },
        createdAt: new Date(),
        updatedAt: new Date()
      };

      mockJwt.sign
        .mockReturnValueOnce('mock-access-token')
        .mockReturnValueOnce('mock-refresh-token');

      const result = jwtManager.generateTokenPair(user, 1);

      expect(result).toEqual({
        accessToken: 'mock-access-token',
        refreshToken: 'mock-refresh-token',
        expiresIn: expect.any(Number),
        tokenType: 'Bearer'
      });
    });
  });

  describe('verifyAccessToken', () => {
    it('should verify valid access token', () => {
      const mockPayload: JWTPayload = {
        userId: 'user-1',
        email: 'test@example.com',
        userType: UserType.REQUESTER,
        iat: 1234567890,
        exp: 1234567890 + 900,
        jti: 'token-id-123'
      };

      mockJwt.verify.mockReturnValue(mockPayload);

      const result = jwtManager.verifyAccessToken('valid-token');

      expect(result).toEqual(mockPayload);
      expect(mockJwt.verify).toHaveBeenCalledWith(
        'valid-token',
        expect.any(String),
        expect.objectContaining({
          issuer: expect.any(String),
          audience: expect.any(String),
          algorithms: ['HS256']
        })
      );
    });

    it('should throw error for expired token', () => {
      const error = new Error('jwt expired');
      error.name = 'TokenExpiredError';
      mockJwt.verify.mockImplementation(() => {
        throw error;
      });

      expect(() => jwtManager.verifyAccessToken('expired-token')).toThrow('Access token expired');
    });

    it('should throw error for invalid token', () => {
      const error = new Error('invalid token');
      error.name = 'JsonWebTokenError';
      mockJwt.verify.mockImplementation(() => {
        throw error;
      });

      expect(() => jwtManager.verifyAccessToken('invalid-token')).toThrow('Invalid access token');
    });
  });

  describe('verifyRefreshToken', () => {
    it('should verify valid refresh token', () => {
      const mockPayload: RefreshTokenPayload = {
        userId: 'user-1',
        email: 'test@example.com',
        tokenVersion: 1,
        iat: 1234567890,
        exp: 1234567890 + 604800,
        jti: 'refresh-token-id-123'
      };

      mockJwt.verify.mockReturnValue(mockPayload);

      const result = jwtManager.verifyRefreshToken('valid-refresh-token');

      expect(result).toEqual(mockPayload);
    });

    it('should throw error for expired refresh token', () => {
      const error = new Error('jwt expired');
      error.name = 'TokenExpiredError';
      mockJwt.verify.mockImplementation(() => {
        throw error;
      });

      expect(() => jwtManager.verifyRefreshToken('expired-refresh-token')).toThrow('Refresh token expired');
    });
  });

  describe('extractTokenFromHeader', () => {
    it('should extract token from valid Authorization header', () => {
      const result = jwtManager.extractTokenFromHeader('Bearer valid-token');

      expect(result).toBe('valid-token');
    });

    it('should throw error for missing Authorization header', () => {
      expect(() => jwtManager.extractTokenFromHeader(undefined)).toThrow('Authorization header missing');
    });

    it('should throw error for invalid header format', () => {
      expect(() => jwtManager.extractTokenFromHeader('InvalidFormat')).toThrow('Invalid authorization header format');
    });
  });

  describe('decodeToken', () => {
    it('should decode token without verification', () => {
      const mockDecoded = {
        header: { alg: 'HS256', typ: 'JWT' },
        payload: { userId: 'user-1', exp: 1234567890 },
        signature: 'signature'
      };

      mockJwt.decode.mockReturnValue(mockDecoded);

      const result = jwtManager.decodeToken('some-token');

      expect(result).toEqual(mockDecoded);
      expect(mockJwt.decode).toHaveBeenCalledWith('some-token', { complete: true });
    });

    it('should throw error when decode fails', () => {
      mockJwt.decode.mockImplementation(() => {
        throw new Error('Decode failed');
      });

      expect(() => jwtManager.decodeToken('invalid-token')).toThrow('Token decode failed');
    });
  });

  describe('isTokenExpired', () => {
    it('should return true for expired token', () => {
      const expiredToken = 'expired-token';
      mockJwt.decode.mockReturnValue({
        exp: Math.floor(Date.now() / 1000) - 3600 // 1 hour ago
      });

      const result = jwtManager.isTokenExpired(expiredToken);

      expect(result).toBe(true);
    });

    it('should return false for valid token', () => {
      const validToken = 'valid-token';
      mockJwt.decode.mockReturnValue({
        exp: Math.floor(Date.now() / 1000) + 3600 // 1 hour from now
      });

      const result = jwtManager.isTokenExpired(validToken);

      expect(result).toBe(false);
    });

    it('should return true for token without exp', () => {
      const invalidToken = 'invalid-token';
      mockJwt.decode.mockReturnValue({});

      const result = jwtManager.isTokenExpired(invalidToken);

      expect(result).toBe(true);
    });
  });

  describe('getTokenExpiration', () => {
    it('should return expiration date for valid token', () => {
      const expTime = Math.floor(Date.now() / 1000) + 3600;
      mockJwt.decode.mockReturnValue({ exp: expTime });

      const result = jwtManager.getTokenExpiration('valid-token');

      expect(result).toEqual(new Date(expTime * 1000));
    });

    it('should return null for token without exp', () => {
      mockJwt.decode.mockReturnValue({});

      const result = jwtManager.getTokenExpiration('invalid-token');

      expect(result).toBeNull();
    });
  });
});

import { Request, Response, NextFunction } from 'express';
import { jwtManager, JWTPayload } from '../utils/jwt';
import { refreshTokenService } from '../services/refreshTokenService';
import { UserRepository } from '@errands-buddy/database';
import { UserType, VerificationStatus } from '@errands-buddy/shared-types';
import { logger } from '../utils/logger';

// Extend Express Request interface to include user data
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
        userType: UserType;
        verificationStatus: VerificationStatus;
        tokenPayload: JWTPayload;
      };
    }
  }
}

export interface AuthOptions {
  required?: boolean;
  userTypes?: UserType[];
  verificationRequired?: boolean;
  allowExpired?: boolean;
}

export class AuthMiddleware {
  private userRepository = new UserRepository();

  /**
   * Main authentication middleware
   */
  authenticate(options: AuthOptions = {}) {
    return async (req: Request, res: Response, next: NextFunction) => {
      try {
        const {
          required = true,
          userTypes = [],
          verificationRequired = false,
          allowExpired = false
        } = options;

        // Extract token from Authorization header
        const authHeader = req.headers.authorization;
        let token: string;

        try {
          token = jwtManager.extractTokenFromHeader(authHeader);
        } catch (error) {
          if (required) {
            return res.status(401).json({
              success: false,
              error: {
                code: 'MISSING_TOKEN',
                message: 'Authorization token required'
              }
            });
          }
          return next();
        }

        // Verify access token
        let payload: JWTPayload;
        try {
          payload = jwtManager.verifyAccessToken(token);
        } catch (error) {
          if (required) {
            return res.status(401).json({
              success: false,
              error: {
                code: 'INVALID_TOKEN',
                message: error instanceof Error ? error.message : 'Invalid token'
              }
            });
          }
          return next();
        }

        // Check if token is blacklisted
        if (await jwtManager.isTokenBlacklisted(payload.jti)) {
          if (required) {
            return res.status(401).json({
              success: false,
              error: {
                code: 'TOKEN_BLACKLISTED',
                message: 'Token has been revoked'
              }
            });
          }
          return next();
        }

        // Get user from database
        const user = await this.userRepository.findById(payload.userId);
        if (!user) {
          if (required) {
            return res.status(401).json({
              success: false,
              error: {
                code: 'USER_NOT_FOUND',
                message: 'User not found'
              }
            });
          }
          return next();
        }

        // Check user type restrictions
        if (userTypes.length > 0 && !userTypes.includes(user.userType)) {
          return res.status(403).json({
            success: false,
            error: {
              code: 'INSUFFICIENT_PERMISSIONS',
              message: 'Insufficient permissions for this action'
            }
          });
        }

        // Check verification status
        if (verificationRequired && user.verificationStatus !== 'verified') {
          return res.status(403).json({
            success: false,
            error: {
              code: 'VERIFICATION_REQUIRED',
              message: 'Account verification required'
            }
          });
        }

        // Attach user to request
        req.user = {
          id: user.id,
          email: user.email,
          userType: user.userType,
          verificationStatus: user.verificationStatus,
          tokenPayload: payload
        };

        next();
      } catch (error) {
        logger.error('Authentication middleware error', error);
        res.status(500).json({
          success: false,
          error: {
            code: 'AUTH_ERROR',
            message: 'Authentication error'
          }
        });
      }
    };
  }

  /**
   * Require authentication
   */
  requireAuth() {
    return this.authenticate({ required: true });
  }

  /**
   * Optional authentication
   */
  optionalAuth() {
    return this.authenticate({ required: false });
  }

  /**
   * Require specific user types
   */
  requireUserTypes(...userTypes: UserType[]) {
    return this.authenticate({ required: true, userTypes });
  }

  /**
   * Require verification
   */
  requireVerification() {
    return this.authenticate({ required: true, verificationRequired: true });
  }

  /**
   * Require tasker role
   */
  requireTasker() {
    return this.authenticate({ 
      required: true, 
      userTypes: ['tasker', 'both'],
      verificationRequired: true
    });
  }

  /**
   * Require requester role
   */
  requireRequester() {
    return this.authenticate({ 
      required: true, 
      userTypes: ['requester', 'both']
    });
  }

  /**
   * Rate limiting middleware
   */
  rateLimit(windowMs: number, maxRequests: number) {
    const requests = new Map<string, { count: number; resetTime: number }>();

    return (req: Request, res: Response, next: NextFunction) => {
      const key = req.ip || 'unknown';
      const now = Date.now();
      const windowStart = now - windowMs;

      // Clean up old entries
      for (const [ip, data] of requests.entries()) {
        if (data.resetTime < now) {
          requests.delete(ip);
        }
      }

      const userRequests = requests.get(key);
      
      if (!userRequests) {
        requests.set(key, { count: 1, resetTime: now + windowMs });
        return next();
      }

      if (userRequests.resetTime < now) {
        userRequests.count = 1;
        userRequests.resetTime = now + windowMs;
        return next();
      }

      if (userRequests.count >= maxRequests) {
        return res.status(429).json({
          success: false,
          error: {
            code: 'RATE_LIMIT_EXCEEDED',
            message: 'Too many requests, please try again later'
          }
        });
      }

      userRequests.count++;
      next();
    };
  }

  /**
   * Validate refresh token middleware
   */
  validateRefreshToken() {
    return async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { refreshToken } = req.body;
        
        if (!refreshToken) {
          return res.status(400).json({
            success: false,
            error: {
              code: 'MISSING_REFRESH_TOKEN',
              message: 'Refresh token required'
            }
          });
        }

        const tokenData = await refreshTokenService.validateRefreshToken(refreshToken);
        if (!tokenData) {
          return res.status(401).json({
            success: false,
            error: {
              code: 'INVALID_REFRESH_TOKEN',
              message: 'Invalid or expired refresh token'
            }
          });
        }

        // Attach token data to request for use in controller
        (req as any).refreshTokenData = tokenData;
        next();
      } catch (error) {
        logger.error('Refresh token validation error', error);
        res.status(500).json({
          success: false,
          error: {
            code: 'REFRESH_TOKEN_ERROR',
            message: 'Refresh token validation error'
          }
        });
      }
    };
  }

  /**
   * Logout middleware
   */
  logout() {
    return async (req: Request, res: Response, next: NextFunction) => {
      try {
        if (req.user?.tokenPayload?.jti) {
          await jwtManager.blacklistToken(
            req.headers.authorization?.split(' ')[1] || '',
            'logout'
          );
        }

        if (req.user?.id) {
          await refreshTokenService.revokeAllUserTokens(req.user.id);
        }

        next();
      } catch (error) {
        logger.error('Logout middleware error', error);
        next(); // Continue even if logout fails
      }
    };
  }

  /**
   * Security headers middleware
   */
  securityHeaders() {
    return (req: Request, res: Response, next: NextFunction) => {
      // Prevent clickjacking
      res.setHeader('X-Frame-Options', 'DENY');
      
      // Prevent MIME type sniffing
      res.setHeader('X-Content-Type-Options', 'nosniff');
      
      // XSS protection
      res.setHeader('X-XSS-Protection', '1; mode=block');
      
      // Strict transport security (HTTPS only)
      if (req.secure) {
        res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
      }
      
      // Content security policy
      res.setHeader('Content-Security-Policy', "default-src 'self'");
      
      // Referrer policy
      res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
      
      next();
    };
  }

  /**
   * Request logging middleware
   */
  requestLogger() {
    return (req: Request, res: Response, next: NextFunction) => {
      const start = Date.now();
      
      res.on('finish', () => {
        const duration = Date.now() - start;
        const logData = {
          method: req.method,
          url: req.url,
          status: res.statusCode,
          duration,
          ip: req.ip,
          userAgent: req.get('User-Agent'),
          userId: req.user?.id
        };
        
        if (res.statusCode >= 400) {
          logger.warn('HTTP Request', logData);
        } else {
          logger.info('HTTP Request', logData);
        }
      });
      
      next();
    };
  }
}

// Export singleton instance
export const authMiddleware = new AuthMiddleware();

// Export individual middleware functions for convenience
export const {
  requireAuth,
  optionalAuth,
  requireUserTypes,
  requireVerification,
  requireTasker,
  requireRequester,
  rateLimit,
  validateRefreshToken,
  logout,
  securityHeaders,
  requestLogger
} = authMiddleware;

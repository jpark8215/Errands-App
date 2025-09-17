import jwt from 'jsonwebtoken';
import { User, UserType } from '@errands-buddy/shared-types';
import { logger } from './logger';

export interface JWTPayload {
  userId: string;
  email: string;
  userType: UserType;
  iat?: number;
  exp?: number;
  jti?: string; // JWT ID for token tracking
}

export interface RefreshTokenPayload {
  userId: string;
  email: string;
  tokenVersion: number;
  iat?: number;
  exp?: number;
  jti?: string;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  tokenType: 'Bearer';
}

export class JWTManager {
  private readonly accessTokenSecret: string;
  private readonly refreshTokenSecret: string;
  private readonly accessTokenExpiry: string;
  private readonly refreshTokenExpiry: string;
  private readonly issuer: string;
  private readonly audience: string;

  constructor() {
    this.accessTokenSecret = process.env.JWT_SECRET || 'your-access-secret-key';
    this.refreshTokenSecret = process.env.JWT_REFRESH_SECRET || 'your-refresh-secret-key';
    this.accessTokenExpiry = process.env.JWT_EXPIRES_IN || '15m';
    this.refreshTokenExpiry = process.env.REFRESH_TOKEN_EXPIRES_IN || '7d';
    this.issuer = process.env.JWT_ISSUER || 'errands-buddy';
    this.audience = process.env.JWT_AUDIENCE || 'errands-buddy-users';

    if (this.accessTokenSecret === 'your-access-secret-key' || this.refreshTokenSecret === 'your-refresh-secret-key') {
      logger.warn('Using default JWT secrets. Please set JWT_SECRET and JWT_REFRESH_SECRET environment variables in production.');
    }
  }

  /**
   * Generate access token
   */
  generateAccessToken(user: User, tokenVersion: number = 1): string {
    const payload: JWTPayload = {
      userId: user.id,
      email: user.email,
      userType: user.userType,
      jti: this.generateTokenId()
    };

    const options: jwt.SignOptions = {
      expiresIn: this.accessTokenExpiry,
      issuer: this.issuer,
      audience: this.audience,
      algorithm: 'HS256'
    };

    try {
      return jwt.sign(payload, this.accessTokenSecret, options);
    } catch (error) {
      logger.error('Failed to generate access token', error);
      throw new Error('Token generation failed');
    }
  }

  /**
   * Generate refresh token
   */
  generateRefreshToken(user: User, tokenVersion: number = 1): string {
    const payload: RefreshTokenPayload = {
      userId: user.id,
      email: user.email,
      tokenVersion,
      jti: this.generateTokenId()
    };

    const options: jwt.SignOptions = {
      expiresIn: this.refreshTokenExpiry,
      issuer: this.issuer,
      audience: this.audience,
      algorithm: 'HS256'
    };

    try {
      return jwt.sign(payload, this.refreshTokenSecret, options);
    } catch (error) {
      logger.error('Failed to generate refresh token', error);
      throw new Error('Token generation failed');
    }
  }

  /**
   * Generate token pair (access + refresh)
   */
  generateTokenPair(user: User, tokenVersion: number = 1): TokenPair {
    const accessToken = this.generateAccessToken(user, tokenVersion);
    const refreshToken = this.generateRefreshToken(user, tokenVersion);
    
    // Calculate expires in seconds
    const expiresIn = this.parseExpiryToSeconds(this.accessTokenExpiry);

    return {
      accessToken,
      refreshToken,
      expiresIn,
      tokenType: 'Bearer'
    };
  }

  /**
   * Verify access token
   */
  verifyAccessToken(token: string): JWTPayload {
    try {
      const decoded = jwt.verify(token, this.accessTokenSecret, {
        issuer: this.issuer,
        audience: this.audience,
        algorithms: ['HS256']
      }) as JWTPayload;

      return decoded;
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        throw new Error('Access token expired');
      } else if (error instanceof jwt.JsonWebTokenError) {
        throw new Error('Invalid access token');
      } else {
        logger.error('Token verification failed', error);
        throw new Error('Token verification failed');
      }
    }
  }

  /**
   * Verify refresh token
   */
  verifyRefreshToken(token: string): RefreshTokenPayload {
    try {
      const decoded = jwt.verify(token, this.refreshTokenSecret, {
        issuer: this.issuer,
        audience: this.audience,
        algorithms: ['HS256']
      }) as RefreshTokenPayload;

      return decoded;
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        throw new Error('Refresh token expired');
      } else if (error instanceof jwt.JsonWebTokenError) {
        throw new Error('Invalid refresh token');
      } else {
        logger.error('Refresh token verification failed', error);
        throw new Error('Token verification failed');
      }
    }
  }

  /**
   * Extract token from Authorization header
   */
  extractTokenFromHeader(authHeader: string | undefined): string {
    if (!authHeader) {
      throw new Error('Authorization header missing');
    }

    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      throw new Error('Invalid authorization header format');
    }

    return parts[1];
  }

  /**
   * Decode token without verification (for debugging)
   */
  decodeToken(token: string): any {
    try {
      return jwt.decode(token, { complete: true });
    } catch (error) {
      logger.error('Token decode failed', error);
      throw new Error('Token decode failed');
    }
  }

  /**
   * Check if token is expired
   */
  isTokenExpired(token: string): boolean {
    try {
      const decoded = jwt.decode(token) as any;
      if (!decoded || !decoded.exp) {
        return true;
      }

      const currentTime = Math.floor(Date.now() / 1000);
      return decoded.exp < currentTime;
    } catch (error) {
      return true;
    }
  }

  /**
   * Get token expiration time
   */
  getTokenExpiration(token: string): Date | null {
    try {
      const decoded = jwt.decode(token) as any;
      if (!decoded || !decoded.exp) {
        return null;
      }

      return new Date(decoded.exp * 1000);
    } catch (error) {
      return null;
    }
  }

  /**
   * Generate unique token ID
   */
  private generateTokenId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Parse expiry string to seconds
   */
  private parseExpiryToSeconds(expiry: string): number {
    const match = expiry.match(/^(\d+)([smhd])$/);
    if (!match) {
      return 900; // Default 15 minutes
    }

    const value = parseInt(match[1]);
    const unit = match[2];

    switch (unit) {
      case 's': return value;
      case 'm': return value * 60;
      case 'h': return value * 60 * 60;
      case 'd': return value * 60 * 60 * 24;
      default: return 900;
    }
  }

  /**
   * Blacklist token (for logout)
   */
  async blacklistToken(token: string, reason: string = 'logout'): Promise<void> {
    try {
      const decoded = this.decodeToken(token);
      if (!decoded || !decoded.payload) {
        throw new Error('Invalid token for blacklisting');
      }

      const jti = decoded.payload.jti;
      const exp = decoded.payload.exp;
      
      if (!jti || !exp) {
        throw new Error('Token missing required fields for blacklisting');
      }

      // Store in Redis with TTL
      // This would be implemented with Redis in a real scenario
      logger.info(`Token blacklisted: ${jti}, reason: ${reason}`);
      
    } catch (error) {
      logger.error('Failed to blacklist token', error);
      throw new Error('Token blacklisting failed');
    }
  }

  /**
   * Check if token is blacklisted
   */
  async isTokenBlacklisted(jti: string): Promise<boolean> {
    try {
      // Check Redis for blacklisted token
      // This would be implemented with Redis in a real scenario
      return false;
    } catch (error) {
      logger.error('Failed to check token blacklist', error);
      return false;
    }
  }
}

// Singleton instance
export const jwtManager = new JWTManager();

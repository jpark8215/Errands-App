import { getRedisClient } from '@errands-buddy/database';
import { jwtManager, RefreshTokenPayload } from '../utils/jwt';
import { User } from '@errands-buddy/shared-types';
import { logger } from '../utils/logger';

export interface RefreshTokenData {
  userId: string;
  email: string;
  tokenVersion: number;
  jti: string;
  createdAt: Date;
  expiresAt: Date;
  isRevoked: boolean;
  lastUsedAt?: Date;
  userAgent?: string;
  ipAddress?: string;
}

export interface TokenRotationResult {
  newAccessToken: string;
  newRefreshToken: string;
  expiresIn: number;
  tokenType: 'Bearer';
  revokedTokens: string[];
}

export class RefreshTokenService {
  private redis = getRedisClient();
  private readonly tokenPrefix = 'refresh_token:';
  private readonly userTokensPrefix = 'user_tokens:';
  private readonly maxTokensPerUser = 5; // Maximum active refresh tokens per user

  /**
   * Store refresh token in Redis
   */
  async storeRefreshToken(
    token: string,
    user: User,
    userAgent?: string,
    ipAddress?: string
  ): Promise<void> {
    try {
      const decoded = jwtManager.decodeToken(token) as any;
      if (!decoded || !decoded.payload) {
        throw new Error('Invalid token for storage');
      }

      const payload = decoded.payload as RefreshTokenPayload;
      const expiresAt = new Date(decoded.payload.exp * 1000);
      
      const tokenData: RefreshTokenData = {
        userId: user.id,
        email: user.email,
        tokenVersion: payload.tokenVersion,
        jti: payload.jti,
        createdAt: new Date(),
        expiresAt,
        isRevoked: false,
        userAgent,
        ipAddress
      };

      const key = `${this.tokenPrefix}${payload.jti}`;
      const userTokensKey = `${this.userTokensPrefix}${user.id}`;

      // Store token data
      await this.redis.setEx(
        key,
        Math.floor((expiresAt.getTime() - Date.now()) / 1000),
        JSON.stringify(tokenData)
      );

      // Add to user's token list
      await this.redis.sAdd(userTokensKey, payload.jti);
      await this.redis.expire(userTokensKey, Math.floor((expiresAt.getTime() - Date.now()) / 1000));

      logger.info(`Refresh token stored for user ${user.id}`);
    } catch (error) {
      logger.error('Failed to store refresh token', error);
      throw new Error('Token storage failed');
    }
  }

  /**
   * Validate refresh token
   */
  async validateRefreshToken(token: string): Promise<RefreshTokenData | null> {
    try {
      // Verify JWT signature and expiration
      const payload = jwtManager.verifyRefreshToken(token);
      
      // Check if token is blacklisted
      if (await jwtManager.isTokenBlacklisted(payload.jti)) {
        throw new Error('Token is blacklisted');
      }

      // Get token data from Redis
      const key = `${this.tokenPrefix}${payload.jti}`;
      const tokenDataStr = await this.redis.get(key);
      
      if (!tokenDataStr) {
        throw new Error('Token not found in storage');
      }

      const tokenData: RefreshTokenData = JSON.parse(tokenDataStr);
      
      if (tokenData.isRevoked) {
        throw new Error('Token has been revoked');
      }

      // Update last used timestamp
      tokenData.lastUsedAt = new Date();
      await this.redis.setEx(
        key,
        Math.floor((tokenData.expiresAt.getTime() - Date.now()) / 1000),
        JSON.stringify(tokenData)
      );

      return tokenData;
    } catch (error) {
      logger.error('Refresh token validation failed', error);
      return null;
    }
  }

  /**
   * Rotate refresh token (invalidate old, create new)
   */
  async rotateRefreshToken(
    oldToken: string,
    user: User,
    userAgent?: string,
    ipAddress?: string
  ): Promise<TokenRotationResult> {
    try {
      // Validate old token
      const tokenData = await this.validateRefreshToken(oldToken);
      if (!tokenData) {
        throw new Error('Invalid refresh token');
      }

      // Revoke old token
      await this.revokeToken(tokenData.jti);

      // Clean up old tokens for this user
      const revokedTokens = await this.cleanupOldTokens(user.id);

      // Generate new token pair with incremented version
      const newTokenVersion = tokenData.tokenVersion + 1;
      const newTokens = jwtManager.generateTokenPair(user, newTokenVersion);

      // Store new refresh token
      await this.storeRefreshToken(
        newTokens.refreshToken,
        user,
        userAgent,
        ipAddress
      );

      logger.info(`Refresh token rotated for user ${user.id}`);

      return {
        newAccessToken: newTokens.accessToken,
        newRefreshToken: newTokens.refreshToken,
        expiresIn: newTokens.expiresIn,
        tokenType: 'Bearer',
        revokedTokens
      };
    } catch (error) {
      logger.error('Refresh token rotation failed', error);
      throw new Error('Token rotation failed');
    }
  }

  /**
   * Revoke specific token
   */
  async revokeToken(jti: string): Promise<void> {
    try {
      const key = `${this.tokenPrefix}${jti}`;
      const tokenDataStr = await this.redis.get(key);
      
      if (tokenDataStr) {
        const tokenData: RefreshTokenData = JSON.parse(tokenDataStr);
        tokenData.isRevoked = true;
        
        await this.redis.setEx(
          key,
          Math.floor((tokenData.expiresAt.getTime() - Date.now()) / 1000),
          JSON.stringify(tokenData)
        );

        // Remove from user's active tokens
        const userTokensKey = `${this.userTokensPrefix}${tokenData.userId}`;
        await this.redis.sRem(userTokensKey, jti);

        logger.info(`Token revoked: ${jti}`);
      }
    } catch (error) {
      logger.error('Failed to revoke token', error);
      throw new Error('Token revocation failed');
    }
  }

  /**
   * Revoke all tokens for a user
   */
  async revokeAllUserTokens(userId: string): Promise<void> {
    try {
      const userTokensKey = `${this.userTokensPrefix}${userId}`;
      const tokenJtis = await this.redis.sMembers(userTokensKey);
      
      for (const jti of tokenJtis) {
        await this.revokeToken(jti);
      }

      // Clear user's token set
      await this.redis.del(userTokensKey);

      logger.info(`All tokens revoked for user ${userId}`);
    } catch (error) {
      logger.error('Failed to revoke all user tokens', error);
      throw new Error('Token revocation failed');
    }
  }

  /**
   * Clean up old tokens for a user (keep only maxTokensPerUser)
   */
  private async cleanupOldTokens(userId: string): Promise<string[]> {
    try {
      const userTokensKey = `${this.userTokensPrefix}${userId}`;
      const tokenJtis = await this.redis.sMembers(userTokensKey);
      
      if (tokenJtis.length <= this.maxTokensPerUser) {
        return [];
      }

      // Get token data and sort by last used
      const tokenDataList: Array<{ jti: string; lastUsedAt: Date }> = [];
      
      for (const jti of tokenJtis) {
        const key = `${this.tokenPrefix}${jti}`;
        const tokenDataStr = await this.redis.get(key);
        
        if (tokenDataStr) {
          const tokenData: RefreshTokenData = JSON.parse(tokenDataStr);
          tokenDataList.push({
            jti,
            lastUsedAt: tokenData.lastUsedAt || tokenData.createdAt
          });
        }
      }

      // Sort by last used (oldest first)
      tokenDataList.sort((a, b) => a.lastUsedAt.getTime() - b.lastUsedAt.getTime());

      // Revoke oldest tokens
      const tokensToRevoke = tokenDataList.slice(0, tokenDataList.length - this.maxTokensPerUser);
      const revokedTokens: string[] = [];

      for (const token of tokensToRevoke) {
        await this.revokeToken(token.jti);
        revokedTokens.push(token.jti);
      }

      return revokedTokens;
    } catch (error) {
      logger.error('Failed to cleanup old tokens', error);
      return [];
    }
  }

  /**
   * Get active tokens for a user
   */
  async getUserActiveTokens(userId: string): Promise<RefreshTokenData[]> {
    try {
      const userTokensKey = `${this.userTokensPrefix}${userId}`;
      const tokenJtis = await this.redis.sMembers(userTokensKey);
      
      const activeTokens: RefreshTokenData[] = [];
      
      for (const jti of tokenJtis) {
        const key = `${this.tokenPrefix}${jti}`;
        const tokenDataStr = await this.redis.get(key);
        
        if (tokenDataStr) {
          const tokenData: RefreshTokenData = JSON.parse(tokenDataStr);
          if (!tokenData.isRevoked && tokenData.expiresAt > new Date()) {
            activeTokens.push(tokenData);
          }
        }
      }

      return activeTokens.sort((a, b) => b.lastUsedAt?.getTime() || 0 - (a.lastUsedAt?.getTime() || 0));
    } catch (error) {
      logger.error('Failed to get user active tokens', error);
      return [];
    }
  }

  /**
   * Check if token is valid and not revoked
   */
  async isTokenValid(jti: string): Promise<boolean> {
    try {
      const key = `${this.tokenPrefix}${jti}`;
      const tokenDataStr = await this.redis.get(key);
      
      if (!tokenDataStr) {
        return false;
      }

      const tokenData: RefreshTokenData = JSON.parse(tokenDataStr);
      return !tokenData.isRevoked && tokenData.expiresAt > new Date();
    } catch (error) {
      logger.error('Failed to check token validity', error);
      return false;
    }
  }

  /**
   * Clean up expired tokens (should be run periodically)
   */
  async cleanupExpiredTokens(): Promise<number> {
    try {
      const pattern = `${this.tokenPrefix}*`;
      const keys = await this.redis.keys(pattern);
      let cleanedCount = 0;

      for (const key of keys) {
        const tokenDataStr = await this.redis.get(key);
        
        if (tokenDataStr) {
          const tokenData: RefreshTokenData = JSON.parse(tokenDataStr);
          
          if (tokenData.expiresAt <= new Date()) {
            await this.redis.del(key);
            
            // Remove from user's token set
            const userTokensKey = `${this.userTokensPrefix}${tokenData.userId}`;
            await this.redis.sRem(userTokensKey, tokenData.jti);
            
            cleanedCount++;
          }
        }
      }

      logger.info(`Cleaned up ${cleanedCount} expired tokens`);
      return cleanedCount;
    } catch (error) {
      logger.error('Failed to cleanup expired tokens', error);
      return 0;
    }
  }
}

// Singleton instance
export const refreshTokenService = new RefreshTokenService();

import { getRedisClient } from '@errands-buddy/database';
import { logger } from '../utils/logger';

// Mock Twilio for development (in production, use real Twilio SDK)
interface TwilioMessage {
  sid: string;
  status: string;
  to: string;
  from: string;
  body: string;
}

interface TwilioClient {
  messages: {
    create: (options: {
      body: string;
      from: string;
      to: string;
    }) => Promise<TwilioMessage>;
  };
}

export interface SMSResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

export interface VerificationCodeData {
  code: string;
  phoneNumber: string;
  expiresAt: Date;
  attempts: number;
  createdAt: Date;
}

export class SMSService {
  private redis = getRedisClient();
  private twilioClient: TwilioClient | null = null;
  private readonly twilioAccountSid: string;
  private readonly twilioAuthToken: string;
  private readonly twilioPhoneNumber: string;
  private readonly verificationCodePrefix = 'verification_code:';
  private readonly rateLimitPrefix = 'sms_rate_limit:';
  private readonly maxAttempts = 3;
  private readonly codeExpiryMinutes = 10;
  private readonly rateLimitWindowMinutes = 60;
  private readonly maxSMSPerHour = 5;

  constructor() {
    this.twilioAccountSid = process.env.TWILIO_ACCOUNT_SID || '';
    this.twilioAuthToken = process.env.TWILIO_AUTH_TOKEN || '';
    this.twilioPhoneNumber = process.env.TWILIO_PHONE_NUMBER || '';

    // Initialize Twilio client if credentials are provided
    if (this.twilioAccountSid && this.twilioAuthToken) {
      this.initializeTwilio();
    } else {
      logger.warn('Twilio credentials not provided. SMS service will run in mock mode.');
    }
  }

  private initializeTwilio(): void {
    try {
      // In a real implementation, you would use:
      // const twilio = require('twilio');
      // this.twilioClient = twilio(this.twilioAccountSid, this.twilioAuthToken);
      
      // For now, we'll create a mock client
      this.twilioClient = {
        messages: {
          create: async (options: { body: string; from: string; to: string }) => {
            // Mock implementation
            logger.info(`Mock SMS sent to ${options.to}: ${options.body}`);
            return {
              sid: `mock_${Date.now()}`,
              status: 'sent',
              to: options.to,
              from: options.from,
              body: options.body
            };
          }
        }
      };
    } catch (error) {
      logger.error('Failed to initialize Twilio client', error);
    }
  }

  /**
   * Send verification code via SMS
   */
  async sendVerificationCode(phoneNumber: string): Promise<SMSResult> {
    try {
      // Check rate limiting
      const rateLimitResult = await this.checkRateLimit(phoneNumber);
      if (!rateLimitResult.allowed) {
        return {
          success: false,
          error: `Rate limit exceeded. Please try again in ${rateLimitResult.retryAfter} minutes.`
        };
      }

      // Generate verification code
      const code = this.generateVerificationCode();
      const expiresAt = new Date(Date.now() + this.codeExpiryMinutes * 60 * 1000);

      // Store verification code
      await this.storeVerificationCode(phoneNumber, code, expiresAt);

      // Send SMS
      const message = `Your ErrandsBuddy verification code is: ${code}. This code expires in ${this.codeExpiryMinutes} minutes.`;
      const smsResult = await this.sendSMS(phoneNumber, message);

      if (smsResult.success) {
        // Update rate limit
        await this.updateRateLimit(phoneNumber);
        
        logger.info(`Verification code sent to ${phoneNumber}`);
        return {
          success: true,
          messageId: smsResult.messageId
        };
      } else {
        return {
          success: false,
          error: smsResult.error
        };
      }

    } catch (error) {
      logger.error('Failed to send verification code', error);
      return {
        success: false,
        error: 'Failed to send verification code'
      };
    }
  }

  /**
   * Verify code
   */
  async verifyCode(phoneNumber: string, code: string): Promise<{
    success: boolean;
    valid: boolean;
    attemptsRemaining: number;
    error?: string;
  }> {
    try {
      const verificationData = await this.getVerificationCode(phoneNumber);
      
      if (!verificationData) {
        return {
          success: false,
          valid: false,
          attemptsRemaining: 0,
          error: 'No verification code found for this phone number'
        };
      }

      // Check if code has expired
      if (verificationData.expiresAt < new Date()) {
        await this.removeVerificationCode(phoneNumber);
        return {
          success: false,
          valid: false,
          attemptsRemaining: 0,
          error: 'Verification code has expired'
        };
      }

      // Check remaining attempts
      if (verificationData.attempts >= this.maxAttempts) {
        await this.removeVerificationCode(phoneNumber);
        return {
          success: false,
          valid: false,
          attemptsRemaining: 0,
          error: 'Maximum verification attempts exceeded'
        };
      }

      // Verify code
      if (verificationData.code !== code) {
        verificationData.attempts++;
        await this.updateVerificationCode(phoneNumber, verificationData);
        
        return {
          success: true,
          valid: false,
          attemptsRemaining: this.maxAttempts - verificationData.attempts,
          error: 'Invalid verification code'
        };
      }

      // Code is valid, remove it
      await this.removeVerificationCode(phoneNumber);

      logger.info(`Phone number verified: ${phoneNumber}`);

      return {
        success: true,
        valid: true,
        attemptsRemaining: this.maxAttempts - verificationData.attempts
      };

    } catch (error) {
      logger.error('Code verification failed', error);
      return {
        success: false,
        valid: false,
        attemptsRemaining: 0,
        error: 'Verification failed'
      };
    }
  }

  /**
   * Send SMS message
   */
  private async sendSMS(phoneNumber: string, message: string): Promise<SMSResult> {
    try {
      if (!this.twilioClient) {
        // Mock mode
        logger.info(`Mock SMS to ${phoneNumber}: ${message}`);
        return {
          success: true,
          messageId: `mock_${Date.now()}`
        };
      }

      const result = await this.twilioClient.messages.create({
        body: message,
        from: this.twilioPhoneNumber,
        to: phoneNumber
      });

      return {
        success: result.status === 'sent' || result.status === 'queued',
        messageId: result.sid
      };

    } catch (error) {
      logger.error('SMS sending failed', error);
      return {
        success: false,
        error: 'Failed to send SMS'
      };
    }
  }

  /**
   * Generate verification code
   */
  private generateVerificationCode(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  /**
   * Store verification code in Redis
   */
  private async storeVerificationCode(
    phoneNumber: string,
    code: string,
    expiresAt: Date
  ): Promise<void> {
    const key = `${this.verificationCodePrefix}${phoneNumber}`;
    const data: VerificationCodeData = {
      code,
      phoneNumber,
      expiresAt,
      attempts: 0,
      createdAt: new Date()
    };

    const ttl = Math.floor((expiresAt.getTime() - Date.now()) / 1000);
    await this.redis.setEx(key, ttl, JSON.stringify(data));
  }

  /**
   * Get verification code from Redis
   */
  private async getVerificationCode(phoneNumber: string): Promise<VerificationCodeData | null> {
    const key = `${this.verificationCodePrefix}${phoneNumber}`;
    const data = await this.redis.get(key);
    
    if (!data) {
      return null;
    }

    return JSON.parse(data);
  }

  /**
   * Update verification code data
   */
  private async updateVerificationCode(
    phoneNumber: string,
    data: VerificationCodeData
  ): Promise<void> {
    const key = `${this.verificationCodePrefix}${phoneNumber}`;
    const ttl = Math.floor((data.expiresAt.getTime() - Date.now()) / 1000);
    
    if (ttl > 0) {
      await this.redis.setEx(key, ttl, JSON.stringify(data));
    }
  }

  /**
   * Remove verification code from Redis
   */
  private async removeVerificationCode(phoneNumber: string): Promise<void> {
    const key = `${this.verificationCodePrefix}${phoneNumber}`;
    await this.redis.del(key);
  }

  /**
   * Check rate limiting
   */
  private async checkRateLimit(phoneNumber: string): Promise<{
    allowed: boolean;
    retryAfter?: number;
  }> {
    const key = `${this.rateLimitPrefix}${phoneNumber}`;
    const data = await this.redis.get(key);
    
    if (!data) {
      return { allowed: true };
    }

    const rateLimitData = JSON.parse(data);
    const now = Date.now();
    const windowStart = now - (this.rateLimitWindowMinutes * 60 * 1000);

    // Filter out old attempts
    const recentAttempts = rateLimitData.attempts.filter((timestamp: number) => timestamp > windowStart);
    
    if (recentAttempts.length >= this.maxSMSPerHour) {
      const oldestAttempt = Math.min(...recentAttempts);
      const retryAfter = Math.ceil((oldestAttempt + (this.rateLimitWindowMinutes * 60 * 1000) - now) / (60 * 1000));
      
      return {
        allowed: false,
        retryAfter
      };
    }

    return { allowed: true };
  }

  /**
   * Update rate limit
   */
  private async updateRateLimit(phoneNumber: string): Promise<void> {
    const key = `${this.rateLimitPrefix}${phoneNumber}`;
    const data = await this.redis.get(key);
    
    const now = Date.now();
    const rateLimitData = data ? JSON.parse(data) : { attempts: [] };
    
    // Add current attempt
    rateLimitData.attempts.push(now);
    
    // Store with TTL
    await this.redis.setEx(key, this.rateLimitWindowMinutes * 60, JSON.stringify(rateLimitData));
  }

  /**
   * Send notification SMS
   */
  async sendNotification(phoneNumber: string, message: string): Promise<SMSResult> {
    try {
      return await this.sendSMS(phoneNumber, message);
    } catch (error) {
      logger.error('Failed to send notification SMS', error);
      return {
        success: false,
        error: 'Failed to send notification'
      };
    }
  }

  /**
   * Clean up expired verification codes
   */
  async cleanupExpiredCodes(): Promise<number> {
    try {
      const pattern = `${this.verificationCodePrefix}*`;
      const keys = await this.redis.keys(pattern);
      let cleanedCount = 0;

      for (const key of keys) {
        const data = await this.redis.get(key);
        if (data) {
          const verificationData: VerificationCodeData = JSON.parse(data);
          if (verificationData.expiresAt < new Date()) {
            await this.redis.del(key);
            cleanedCount++;
          }
        }
      }

      logger.info(`Cleaned up ${cleanedCount} expired verification codes`);
      return cleanedCount;
    } catch (error) {
      logger.error('Failed to cleanup expired codes', error);
      return 0;
    }
  }

  /**
   * Get SMS delivery status
   */
  async getDeliveryStatus(messageId: string): Promise<{
    status: string;
    delivered: boolean;
  }> {
    try {
      if (!this.twilioClient) {
        return {
          status: 'delivered',
          delivered: true
        };
      }

      // In a real implementation, you would check Twilio's message status
      // const message = await this.twilioClient.messages(messageId).fetch();
      
      return {
        status: 'delivered',
        delivered: true
      };
    } catch (error) {
      logger.error('Failed to get delivery status', error);
      return {
        status: 'unknown',
        delivered: false
      };
    }
  }
}

// Singleton instance
export const smsService = new SMSService();

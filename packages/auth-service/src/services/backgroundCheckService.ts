import { getRedisClient } from '@errands-buddy/database';
import { logger } from '../utils/logger';
import { v4 as uuidv4 } from 'uuid';

export interface BackgroundCheckData {
  id: string;
  userId: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'rejected';
  checkType: 'basic' | 'standard' | 'premium';
  initiatedAt: Date;
  completedAt?: Date;
  provider: 'checkr' | 'goodhire' | 'sterling' | 'mock';
  providerCheckId?: string;
  results?: BackgroundCheckResults;
  rejectionReason?: string;
  expiresAt?: Date;
  cost: number;
}

export interface BackgroundCheckResults {
  criminalHistory: {
    hasRecords: boolean;
    records: CriminalRecord[];
    status: 'clear' | 'flagged' | 'pending';
  };
  identityVerification: {
    verified: boolean;
    confidence: number;
    status: 'verified' | 'failed' | 'pending';
  };
  employmentHistory: {
    verified: boolean;
    discrepancies: string[];
    status: 'verified' | 'failed' | 'pending';
  };
  educationHistory: {
    verified: boolean;
    discrepancies: string[];
    status: 'verified' | 'failed' | 'pending';
  };
  overallStatus: 'pass' | 'fail' | 'pending' | 'review_required';
  reportUrl?: string;
  completedAt: Date;
}

export interface CriminalRecord {
  type: string;
  date: Date;
  description: string;
  severity: 'low' | 'medium' | 'high';
  status: 'active' | 'expunged' | 'dismissed';
}

export interface BackgroundCheckRequest {
  userId: string;
  checkType: 'basic' | 'standard' | 'premium';
  personalInfo: {
    firstName: string;
    lastName: string;
    dateOfBirth: Date;
    ssn?: string; // Last 4 digits only
    address: {
      street: string;
      city: string;
      state: string;
      zipCode: string;
    };
  };
  consent: {
    criminalCheck: boolean;
    identityVerification: boolean;
    employmentHistory: boolean;
    educationHistory: boolean;
    consentDate: Date;
  };
}

export class BackgroundCheckService {
  private redis = getRedisClient();
  private readonly checkPrefix = 'background_check:';
  private readonly userChecksPrefix = 'user_checks:';
  private readonly checkCosts = {
    basic: 15.00,
    standard: 35.00,
    premium: 75.00
  };
  private readonly checkValidityDays = 365; // 1 year

  /**
   * Initiate background check
   */
  async initiateBackgroundCheck(request: BackgroundCheckRequest): Promise<{
    success: boolean;
    checkId?: string;
    error?: string;
  }> {
    try {
      // Validate request
      const validation = this.validateBackgroundCheckRequest(request);
      if (!validation.valid) {
        return {
          success: false,
          error: validation.errors.join(', ')
        };
      }

      // Check if user already has a recent valid check
      const existingCheck = await this.getLatestValidCheck(request.userId);
      if (existingCheck && this.isCheckValid(existingCheck)) {
        return {
          success: false,
          error: 'User already has a valid background check'
        };
      }

      // Create background check record
      const checkId = uuidv4();
      const checkData: BackgroundCheckData = {
        id: checkId,
        userId: request.userId,
        status: 'pending',
        checkType: request.checkType,
        initiatedAt: new Date(),
        provider: 'mock', // In production, this would be determined by business logic
        cost: this.checkCosts[request.checkType],
        expiresAt: new Date(Date.now() + this.checkValidityDays * 24 * 60 * 60 * 1000)
      };

      // Store check data
      await this.storeBackgroundCheck(checkData);

      // Initiate check with provider
      await this.initiateProviderCheck(checkData, request);

      logger.info(`Background check initiated for user ${request.userId}`);

      return {
        success: true,
        checkId
      };

    } catch (error) {
      logger.error('Background check initiation failed', error);
      return {
        success: false,
        error: 'Failed to initiate background check'
      };
    }
  }

  /**
   * Get background check status
   */
  async getCheckStatus(checkId: string): Promise<BackgroundCheckData | null> {
    try {
      const key = `${this.checkPrefix}${checkId}`;
      const data = await this.redis.get(key);
      
      if (!data) {
        return null;
      }

      return JSON.parse(data);
    } catch (error) {
      logger.error('Failed to get check status', error);
      return null;
    }
  }

  /**
   * Get user's background checks
   */
  async getUserBackgroundChecks(userId: string): Promise<BackgroundCheckData[]> {
    try {
      const userKey = `${this.userChecksPrefix}${userId}`;
      const checkIds = await this.redis.sMembers(userKey);
      
      const checks: BackgroundCheckData[] = [];
      
      for (const checkId of checkIds) {
        const check = await this.getCheckStatus(checkId);
        if (check) {
          checks.push(check);
        }
      }
      
      return checks.sort((a, b) => b.initiatedAt.getTime() - a.initiatedAt.getTime());
    } catch (error) {
      logger.error('Failed to get user background checks', error);
      return [];
    }
  }

  /**
   * Get latest valid background check
   */
  async getLatestValidCheck(userId: string): Promise<BackgroundCheckData | null> {
    try {
      const checks = await this.getUserBackgroundChecks(userId);
      
      // Find the latest completed check
      const completedChecks = checks.filter(check => 
        check.status === 'completed' && 
        this.isCheckValid(check)
      );
      
      if (completedChecks.length === 0) {
        return null;
      }
      
      return completedChecks[0];
    } catch (error) {
      logger.error('Failed to get latest valid check', error);
      return null;
    }
  }

  /**
   * Process background check results
   */
  async processCheckResults(
    checkId: string,
    results: BackgroundCheckResults
  ): Promise<void> {
    try {
      const check = await this.getCheckStatus(checkId);
      if (!check) {
        logger.error(`Background check not found: ${checkId}`);
        return;
      }

      // Update check with results
      check.status = 'completed';
      check.completedAt = new Date();
      check.results = results;

      await this.updateBackgroundCheck(check);

      logger.info(`Background check completed for user ${check.userId}`);

    } catch (error) {
      logger.error('Failed to process check results', error);
    }
  }

  /**
   * Validate background check request
   */
  private validateBackgroundCheckRequest(request: BackgroundCheckRequest): {
    valid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    // Validate personal info
    if (!request.personalInfo.firstName || request.personalInfo.firstName.trim().length < 2) {
      errors.push('First name is required and must be at least 2 characters');
    }

    if (!request.personalInfo.lastName || request.personalInfo.lastName.trim().length < 2) {
      errors.push('Last name is required and must be at least 2 characters');
    }

    if (!request.personalInfo.dateOfBirth) {
      errors.push('Date of birth is required');
    } else {
      const age = this.calculateAge(request.personalInfo.dateOfBirth);
      if (age < 18) {
        errors.push('User must be at least 18 years old');
      }
    }

    // Validate address
    if (!request.personalInfo.address.street || request.personalInfo.address.street.trim().length < 5) {
      errors.push('Valid street address is required');
    }

    if (!request.personalInfo.address.city || request.personalInfo.address.city.trim().length < 2) {
      errors.push('City is required');
    }

    if (!request.personalInfo.address.state || request.personalInfo.address.state.length !== 2) {
      errors.push('Valid state code is required');
    }

    if (!request.personalInfo.address.zipCode || !/^\d{5}(-\d{4})?$/.test(request.personalInfo.address.zipCode)) {
      errors.push('Valid ZIP code is required');
    }

    // Validate consent
    if (!request.consent.criminalCheck) {
      errors.push('Criminal background check consent is required');
    }

    if (!request.consent.identityVerification) {
      errors.push('Identity verification consent is required');
    }

    if (!request.consent.consentDate) {
      errors.push('Consent date is required');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Calculate age from date of birth
   */
  private calculateAge(dateOfBirth: Date): number {
    const today = new Date();
    const birthDate = new Date(dateOfBirth);
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    
    return age;
  }

  /**
   * Check if background check is still valid
   */
  private isCheckValid(check: BackgroundCheckData): boolean {
    if (check.status !== 'completed' || !check.expiresAt) {
      return false;
    }
    
    return check.expiresAt > new Date();
  }

  /**
   * Store background check data
   */
  private async storeBackgroundCheck(check: BackgroundCheckData): Promise<void> {
    const key = `${this.checkPrefix}${check.id}`;
    const userKey = `${this.userChecksPrefix}${check.userId}`;
    
    // Store check
    await this.redis.setEx(key, 365 * 24 * 60 * 60, JSON.stringify(check)); // 1 year TTL
    
    // Add to user's checks
    await this.redis.sAdd(userKey, check.id);
    await this.redis.expire(userKey, 365 * 24 * 60 * 60);
  }

  /**
   * Update background check data
   */
  private async updateBackgroundCheck(check: BackgroundCheckData): Promise<void> {
    const key = `${this.checkPrefix}${check.id}`;
    await this.redis.setEx(key, 365 * 24 * 60 * 60, JSON.stringify(check));
  }

  /**
   * Initiate check with provider
   */
  private async initiateProviderCheck(
    check: BackgroundCheckData,
    request: BackgroundCheckRequest
  ): Promise<void> {
    try {
      // Update status
      check.status = 'in_progress';
      await this.updateBackgroundCheck(check);

      // In a real implementation, this would:
      // 1. Send data to background check provider (Checkr, GoodHire, etc.)
      // 2. Store provider check ID
      // 3. Set up webhook for results

      // For demo purposes, simulate the check process
      setTimeout(async () => {
        await this.simulateCheckCompletion(check.id);
      }, 30000); // Simulate 30-second processing time

      logger.info(`Provider check initiated for ${check.id}`);

    } catch (error) {
      logger.error('Provider check initiation failed', error);
      
      check.status = 'failed';
      await this.updateBackgroundCheck(check);
    }
  }

  /**
   * Simulate check completion (for demo purposes)
   */
  private async simulateCheckCompletion(checkId: string): Promise<void> {
    try {
      const check = await this.getCheckStatus(checkId);
      if (!check) {
        return;
      }

      // Simulate results based on check type
      const results: BackgroundCheckResults = {
        criminalHistory: {
          hasRecords: Math.random() < 0.1, // 10% chance of records
          records: [],
          status: 'clear'
        },
        identityVerification: {
          verified: true,
          confidence: 0.95,
          status: 'verified'
        },
        employmentHistory: {
          verified: true,
          discrepancies: [],
          status: 'verified'
        },
        educationHistory: {
          verified: true,
          discrepancies: [],
          status: 'verified'
        },
        overallStatus: 'pass',
        completedAt: new Date()
      };

      await this.processCheckResults(checkId, results);

    } catch (error) {
      logger.error('Simulated check completion failed', error);
    }
  }

  /**
   * Get background check report
   */
  async getCheckReport(checkId: string): Promise<{
    check: BackgroundCheckData | null;
    report: BackgroundCheckResults | null;
  }> {
    try {
      const check = await this.getCheckStatus(checkId);
      if (!check) {
        return { check: null, report: null };
      }

      return {
        check,
        report: check.results || null
      };
    } catch (error) {
      logger.error('Failed to get check report', error);
      return { check: null, report: null };
    }
  }

  /**
   * Clean up expired checks
   */
  async cleanupExpiredChecks(): Promise<number> {
    try {
      const pattern = `${this.checkPrefix}*`;
      const keys = await this.redis.keys(pattern);
      let cleanedCount = 0;

      for (const key of keys) {
        const data = await this.redis.get(key);
        if (data) {
          const check: BackgroundCheckData = JSON.parse(data);
          
          if (check.expiresAt && check.expiresAt < new Date()) {
            await this.redis.del(key);
            cleanedCount++;
          }
        }
      }

      logger.info(`Cleaned up ${cleanedCount} expired background checks`);
      return cleanedCount;
    } catch (error) {
      logger.error('Failed to cleanup expired checks', error);
      return 0;
    }
  }
}

// Singleton instance
export const backgroundCheckService = new BackgroundCheckService();

import bcrypt from 'bcryptjs';
import { UserRepository, UserRegistrationData } from '@errands-buddy/database';
import { UserRegistration, UserType, VerificationStatus } from '@errands-buddy/shared-types';
import { UserRegistrationSchema, validateEmail, validatePhoneNumber, validatePassword } from '@errands-buddy/shared-types';
import { logger } from '../utils/logger';

export interface RegistrationResult {
  success: boolean;
  user?: any;
  errors?: string[];
  requiresVerification?: boolean;
}

export interface PhoneVerificationResult {
  success: boolean;
  message: string;
  expiresAt?: Date;
}

export interface IdentityVerificationResult {
  success: boolean;
  status: VerificationStatus;
  message: string;
  verificationId?: string;
}

export class RegistrationService {
  private userRepository = new UserRepository();

  /**
   * Register a new user
   */
  async registerUser(userData: UserRegistration): Promise<RegistrationResult> {
    try {
      // Validate input data
      const validationResult = UserRegistrationSchema.safeParse(userData);
      if (!validationResult.success) {
        return {
          success: false,
          errors: validationResult.error.errors.map(err => err.message)
        };
      }

      // Check if email already exists
      const existingUserByEmail = await this.userRepository.findByEmail(userData.email);
      if (existingUserByEmail) {
        return {
          success: false,
          errors: ['Email already registered']
        };
      }

      // Check if phone number already exists
      const existingUserByPhone = await this.userRepository.findByPhoneNumber(userData.phoneNumber);
      if (existingUserByPhone) {
        return {
          success: false,
          errors: ['Phone number already registered']
        };
      }

      // Validate email format
      if (!validateEmail(userData.email)) {
        return {
          success: false,
          errors: ['Invalid email format']
        };
      }

      // Validate phone number format
      if (!validatePhoneNumber(userData.phoneNumber)) {
        return {
          success: false,
          errors: ['Invalid phone number format']
        };
      }

      // Validate password strength
      const passwordValidation = validatePassword(userData.password);
      if (!passwordValidation.valid) {
        return {
          success: false,
          errors: passwordValidation.errors
        };
      }

      // Hash password
      const passwordHash = await bcrypt.hash(userData.password, 12);

      // Create user registration data
      const registrationData: UserRegistrationData = {
        email: userData.email,
        phoneNumber: userData.phoneNumber,
        passwordHash,
        userType: userData.userType,
        firstName: userData.firstName,
        lastName: userData.lastName,
        bio: userData.bio
      };

      // Create user with profile
      const user = await this.userRepository.createWithProfile(registrationData);

      logger.info(`User registered successfully: ${user.email}`);

      return {
        success: true,
        user,
        requiresVerification: true
      };

    } catch (error) {
      logger.error('User registration failed', error);
      return {
        success: false,
        errors: ['Registration failed. Please try again.']
      };
    }
  }

  /**
   * Initiate phone number verification
   */
  async initiatePhoneVerification(phoneNumber: string): Promise<PhoneVerificationResult> {
    try {
      // Check if phone number is already verified
      const existingUser = await this.userRepository.findByPhoneNumber(phoneNumber);
      if (existingUser && existingUser.verificationStatus === 'verified') {
        return {
          success: false,
          message: 'Phone number already verified'
        };
      }

      // Generate verification code
      const verificationCode = this.generateVerificationCode();
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

      // Store verification code in Redis (in a real implementation)
      // await this.storeVerificationCode(phoneNumber, verificationCode, expiresAt);

      // Send SMS (this would integrate with Twilio in a real implementation)
      // await this.sendSMS(phoneNumber, `Your ErrandsBuddy verification code is: ${verificationCode}`);

      logger.info(`Phone verification initiated for: ${phoneNumber}`);

      return {
        success: true,
        message: 'Verification code sent',
        expiresAt
      };

    } catch (error) {
      logger.error('Phone verification initiation failed', error);
      return {
        success: false,
        message: 'Failed to send verification code'
      };
    }
  }

  /**
   * Verify phone number with code
   */
  async verifyPhoneNumber(phoneNumber: string, code: string): Promise<PhoneVerificationResult> {
    try {
      // In a real implementation, this would check the stored verification code
      // const storedCode = await this.getVerificationCode(phoneNumber);
      // if (!storedCode || storedCode !== code) {
      //   return {
      //     success: false,
      //     message: 'Invalid verification code'
      //   };
      // }

      // For demo purposes, accept any 6-digit code
      if (!/^\d{6}$/.test(code)) {
        return {
          success: false,
          message: 'Invalid verification code format'
        };
      }

      // Update user verification status
      const user = await this.userRepository.findByPhoneNumber(phoneNumber);
      if (user) {
        await this.userRepository.updateVerificationStatus(user.id, 'verified');
      }

      // Clean up verification code
      // await this.removeVerificationCode(phoneNumber);

      logger.info(`Phone number verified: ${phoneNumber}`);

      return {
        success: true,
        message: 'Phone number verified successfully'
      };

    } catch (error) {
      logger.error('Phone verification failed', error);
      return {
        success: false,
        message: 'Phone verification failed'
      };
    }
  }

  /**
   * Upload identity documents for verification
   */
  async uploadIdentityDocuments(
    userId: string,
    documents: {
      governmentId: string; // base64 encoded image
      selfie: string; // base64 encoded image
      documentType: 'drivers_license' | 'passport' | 'state_id';
    }
  ): Promise<IdentityVerificationResult> {
    try {
      // Validate document data
      if (!documents.governmentId || !documents.selfie) {
        return {
          success: false,
          status: 'pending',
          message: 'Both government ID and selfie are required'
        };
      }

      // Validate document type
      const validDocumentTypes = ['drivers_license', 'passport', 'state_id'];
      if (!validDocumentTypes.includes(documents.documentType)) {
        return {
          success: false,
          status: 'pending',
          message: 'Invalid document type'
        };
      }

      // In a real implementation, this would:
      // 1. Save documents to secure storage
      // 2. Send to identity verification service
      // 3. Return verification ID for tracking

      const verificationId = `verification_${Date.now()}_${userId}`;

      // Update user verification status to pending
      await this.userRepository.updateVerificationStatus(userId, 'pending');

      logger.info(`Identity documents uploaded for user ${userId}`);

      return {
        success: true,
        status: 'pending',
        message: 'Documents uploaded successfully. Verification in progress.',
        verificationId
      };

    } catch (error) {
      logger.error('Identity document upload failed', error);
      return {
        success: false,
        status: 'pending',
        message: 'Document upload failed'
      };
    }
  }

  /**
   * Check verification status
   */
  async getVerificationStatus(userId: string): Promise<{
    phoneVerified: boolean;
    identityVerified: boolean;
    overallStatus: VerificationStatus;
  }> {
    try {
      const user = await this.userRepository.findById(userId);
      if (!user) {
        throw new Error('User not found');
      }

      // In a real implementation, this would check:
      // - Phone verification status from database
      // - Identity verification status from external service
      // - Background check status

      const phoneVerified = user.verificationStatus === 'verified';
      const identityVerified = user.verificationStatus === 'verified';
      const overallStatus = user.verificationStatus;

      return {
        phoneVerified,
        identityVerified,
        overallStatus
      };

    } catch (error) {
      logger.error('Failed to get verification status', error);
      throw error;
    }
  }

  /**
   * Resend verification code
   */
  async resendVerificationCode(phoneNumber: string): Promise<PhoneVerificationResult> {
    try {
      // Check rate limiting (in a real implementation)
      // const rateLimitKey = `verification_attempts:${phoneNumber}`;
      // const attempts = await this.redis.get(rateLimitKey);
      // if (attempts && parseInt(attempts) >= 3) {
      //   return {
      //     success: false,
      //     message: 'Too many verification attempts. Please try again later.'
      //   };
      // }

      // Increment rate limit counter
      // await this.redis.incr(rateLimitKey);
      // await this.redis.expire(rateLimitKey, 3600); // 1 hour

      return await this.initiatePhoneVerification(phoneNumber);

    } catch (error) {
      logger.error('Resend verification code failed', error);
      return {
        success: false,
        message: 'Failed to resend verification code'
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
   * Validate user data before registration
   */
  private validateUserData(userData: UserRegistration): string[] {
    const errors: string[] = [];

    // Email validation
    if (!userData.email || !validateEmail(userData.email)) {
      errors.push('Valid email is required');
    }

    // Phone validation
    if (!userData.phoneNumber || !validatePhoneNumber(userData.phoneNumber)) {
      errors.push('Valid phone number is required');
    }

    // Password validation
    const passwordValidation = validatePassword(userData.password);
    if (!passwordValidation.valid) {
      errors.push(...passwordValidation.errors);
    }

    // Name validation
    if (!userData.firstName || userData.firstName.trim().length < 2) {
      errors.push('First name must be at least 2 characters');
    }

    if (!userData.lastName || userData.lastName.trim().length < 2) {
      errors.push('Last name must be at least 2 characters');
    }

    // User type validation
    const validUserTypes = ['requester', 'tasker', 'both'];
    if (!validUserTypes.includes(userData.userType)) {
      errors.push('Invalid user type');
    }

    return errors;
  }
}

// Singleton instance
export const registrationService = new RegistrationService();

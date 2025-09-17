import request from 'supertest';
import express from 'express';
import { registrationService } from '../../services/registrationService';
import { smsService } from '../../services/smsService';
import { identityVerificationService } from '../../services/identityVerificationService';
import { backgroundCheckService } from '../../services/backgroundCheckService';

// Mock dependencies
jest.mock('@errands-buddy/database', () => ({
  UserRepository: jest.fn().mockImplementation(() => ({
    findByEmail: jest.fn(),
    findByPhoneNumber: jest.fn(),
    createWithProfile: jest.fn(),
    updateVerificationStatus: jest.fn()
  }))
}));

jest.mock('../../services/smsService', () => ({
  smsService: {
    sendVerificationCode: jest.fn(),
    verifyCode: jest.fn()
  }
}));

jest.mock('../../services/identityVerificationService', () => ({
  identityVerificationService: {
    uploadDocuments: jest.fn(),
    getVerificationStatus: jest.fn()
  }
}));

jest.mock('../../services/backgroundCheckService', () => ({
  backgroundCheckService: {
    initiateBackgroundCheck: jest.fn(),
    getCheckStatus: jest.fn()
  }
}));

describe('Registration Integration Tests', () => {
  let app: express.Application;
  let mockUserRepository: any;
  let mockSmsService: any;
  let mockIdentityService: any;
  let mockBackgroundCheckService: any;

  beforeEach(() => {
    app = express();
    app.use(express.json());

    // Setup routes (in a real implementation, these would be actual route handlers)
    app.post('/api/auth/register', async (req, res) => {
      try {
        const result = await registrationService.registerUser(req.body);
        res.status(result.success ? 201 : 400).json(result);
      } catch (error) {
        res.status(500).json({ success: false, error: 'Internal server error' });
      }
    });

    app.post('/api/auth/verify-phone', async (req, res) => {
      try {
        const { phoneNumber, code } = req.body;
        const result = await smsService.verifyCode(phoneNumber, code);
        res.json(result);
      } catch (error) {
        res.status(500).json({ success: false, error: 'Internal server error' });
      }
    });

    app.post('/api/auth/send-verification-code', async (req, res) => {
      try {
        const { phoneNumber } = req.body;
        const result = await smsService.sendVerificationCode(phoneNumber);
        res.json(result);
      } catch (error) {
        res.status(500).json({ success: false, error: 'Internal server error' });
      }
    });

    app.post('/api/auth/upload-identity', async (req, res) => {
      try {
        const { userId, documents } = req.body;
        const result = await identityVerificationService.uploadDocuments(userId, documents);
        res.json(result);
      } catch (error) {
        res.status(500).json({ success: false, error: 'Internal server error' });
      }
    });

    app.post('/api/auth/background-check', async (req, res) => {
      try {
        const result = await backgroundCheckService.initiateBackgroundCheck(req.body);
        res.json(result);
      } catch (error) {
        res.status(500).json({ success: false, error: 'Internal server error' });
      }
    });

    // Reset mocks
    mockUserRepository = {
      findByEmail: jest.fn(),
      findByPhoneNumber: jest.fn(),
      createWithProfile: jest.fn(),
      updateVerificationStatus: jest.fn()
    };

    mockSmsService = smsService;
    mockIdentityService = identityVerificationService;
    mockBackgroundCheckService = backgroundCheckService;

    jest.clearAllMocks();
  });

  describe('User Registration Flow', () => {
    it('should complete full registration flow successfully', async () => {
      const userData = {
        email: 'test@example.com',
        phoneNumber: '+1234567890',
        password: 'SecurePassword123!',
        userType: 'requester',
        firstName: 'John',
        lastName: 'Doe'
      };

      // Mock successful registration
      mockUserRepository.findByEmail.mockResolvedValue(null);
      mockUserRepository.findByPhoneNumber.mockResolvedValue(null);
      mockUserRepository.createWithProfile.mockResolvedValue({
        id: 'user-1',
        email: userData.email,
        phoneNumber: userData.phoneNumber,
        userType: userData.userType,
        verificationStatus: 'pending'
      });

      // Register user
      const registerResponse = await request(app)
        .post('/api/auth/register')
        .send(userData)
        .expect(201);

      expect(registerResponse.body.success).toBe(true);
      expect(registerResponse.body.user).toBeDefined();
      expect(registerResponse.body.requiresVerification).toBe(true);

      // Mock phone verification
      mockSmsService.sendVerificationCode.mockResolvedValue({
        success: true,
        message: 'Verification code sent'
      });

      const smsResponse = await request(app)
        .post('/api/auth/send-verification-code')
        .send({ phoneNumber: userData.phoneNumber })
        .expect(200);

      expect(smsResponse.body.success).toBe(true);

      // Mock code verification
      mockSmsService.verifyCode.mockResolvedValue({
        success: true,
        valid: true,
        attemptsRemaining: 2
      });

      const verifyResponse = await request(app)
        .post('/api/auth/verify-phone')
        .send({ phoneNumber: userData.phoneNumber, code: '123456' })
        .expect(200);

      expect(verifyResponse.body.success).toBe(true);
      expect(verifyResponse.body.valid).toBe(true);
    });

    it('should handle registration with existing email', async () => {
      const userData = {
        email: 'existing@example.com',
        phoneNumber: '+1234567890',
        password: 'SecurePassword123!',
        userType: 'requester',
        firstName: 'John',
        lastName: 'Doe'
      };

      // Mock existing user
      mockUserRepository.findByEmail.mockResolvedValue({
        id: 'existing-user',
        email: userData.email
      });

      const response = await request(app)
        .post('/api/auth/register')
        .send(userData)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.errors).toContain('Email already registered');
    });

    it('should handle registration with existing phone number', async () => {
      const userData = {
        email: 'test@example.com',
        phoneNumber: '+1234567890',
        password: 'SecurePassword123!',
        userType: 'requester',
        firstName: 'John',
        lastName: 'Doe'
      };

      // Mock existing phone number
      mockUserRepository.findByEmail.mockResolvedValue(null);
      mockUserRepository.findByPhoneNumber.mockResolvedValue({
        id: 'existing-user',
        phoneNumber: userData.phoneNumber
      });

      const response = await request(app)
        .post('/api/auth/register')
        .send(userData)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.errors).toContain('Phone number already registered');
    });

    it('should validate password strength', async () => {
      const userData = {
        email: 'test@example.com',
        phoneNumber: '+1234567890',
        password: 'weak',
        userType: 'requester',
        firstName: 'John',
        lastName: 'Doe'
      };

      mockUserRepository.findByEmail.mockResolvedValue(null);
      mockUserRepository.findByPhoneNumber.mockResolvedValue(null);

      const response = await request(app)
        .post('/api/auth/register')
        .send(userData)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.errors).toContain('Password must be at least 8 characters');
    });
  });

  describe('Phone Verification Flow', () => {
    it('should send verification code successfully', async () => {
      mockSmsService.sendVerificationCode.mockResolvedValue({
        success: true,
        message: 'Verification code sent',
        messageId: 'msg_123'
      });

      const response = await request(app)
        .post('/api/auth/send-verification-code')
        .send({ phoneNumber: '+1234567890' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Verification code sent');
    });

    it('should verify code successfully', async () => {
      mockSmsService.verifyCode.mockResolvedValue({
        success: true,
        valid: true,
        attemptsRemaining: 2
      });

      const response = await request(app)
        .post('/api/auth/verify-phone')
        .send({ phoneNumber: '+1234567890', code: '123456' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.valid).toBe(true);
    });

    it('should handle invalid verification code', async () => {
      mockSmsService.verifyCode.mockResolvedValue({
        success: true,
        valid: false,
        attemptsRemaining: 1,
        error: 'Invalid verification code'
      });

      const response = await request(app)
        .post('/api/auth/verify-phone')
        .send({ phoneNumber: '+1234567890', code: '000000' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.valid).toBe(false);
      expect(response.body.error).toBe('Invalid verification code');
    });
  });

  describe('Identity Verification Flow', () => {
    it('should upload identity documents successfully', async () => {
      const documents = {
        documentType: 'drivers_license',
        frontImage: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD...',
        backImage: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD...',
        selfieImage: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD...'
      };

      mockIdentityService.uploadDocuments.mockResolvedValue({
        success: true,
        status: 'pending',
        message: 'Documents uploaded successfully. Verification in progress.',
        verificationId: 'verification_123'
      });

      const response = await request(app)
        .post('/api/auth/upload-identity')
        .send({ userId: 'user-1', documents })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.status).toBe('pending');
      expect(response.body.verificationId).toBeDefined();
    });

    it('should handle invalid document format', async () => {
      const documents = {
        documentType: 'drivers_license',
        frontImage: 'invalid-base64-data',
        selfieImage: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD...'
      };

      mockIdentityService.uploadDocuments.mockResolvedValue({
        success: false,
        status: 'rejected',
        message: 'Document validation failed',
        rejectionReason: 'Invalid front image format. Must be JPEG, PNG, or WebP.'
      });

      const response = await request(app)
        .post('/api/auth/upload-identity')
        .send({ userId: 'user-1', documents })
        .expect(200);

      expect(response.body.success).toBe(false);
      expect(response.body.status).toBe('rejected');
    });
  });

  describe('Background Check Flow', () => {
    it('should initiate background check successfully', async () => {
      const backgroundCheckRequest = {
        userId: 'user-1',
        checkType: 'standard',
        personalInfo: {
          firstName: 'John',
          lastName: 'Doe',
          dateOfBirth: '1990-01-01',
          ssn: '1234',
          address: {
            street: '123 Main St',
            city: 'New York',
            state: 'NY',
            zipCode: '10001'
          }
        },
        consent: {
          criminalCheck: true,
          identityVerification: true,
          employmentHistory: true,
          educationHistory: true,
          consentDate: new Date()
        }
      };

      mockBackgroundCheckService.initiateBackgroundCheck.mockResolvedValue({
        success: true,
        checkId: 'check_123'
      });

      const response = await request(app)
        .post('/api/auth/background-check')
        .send(backgroundCheckRequest)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.checkId).toBe('check_123');
    });

    it('should handle background check with missing consent', async () => {
      const backgroundCheckRequest = {
        userId: 'user-1',
        checkType: 'standard',
        personalInfo: {
          firstName: 'John',
          lastName: 'Doe',
          dateOfBirth: '1990-01-01',
          address: {
            street: '123 Main St',
            city: 'New York',
            state: 'NY',
            zipCode: '10001'
          }
        },
        consent: {
          criminalCheck: false, // Missing required consent
          identityVerification: true,
          employmentHistory: true,
          educationHistory: true,
          consentDate: new Date()
        }
      };

      mockBackgroundCheckService.initiateBackgroundCheck.mockResolvedValue({
        success: false,
        error: 'Criminal background check consent is required'
      });

      const response = await request(app)
        .post('/api/auth/background-check')
        .send(backgroundCheckRequest)
        .expect(200);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Criminal background check consent is required');
    });
  });

  describe('Error Handling', () => {
    it('should handle service errors gracefully', async () => {
      mockUserRepository.findByEmail.mockRejectedValue(new Error('Database error'));

      const response = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'test@example.com',
          phoneNumber: '+1234567890',
          password: 'SecurePassword123!',
          userType: 'requester',
          firstName: 'John',
          lastName: 'Doe'
        })
        .expect(500);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Internal server error');
    });

    it('should handle missing required fields', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'test@example.com'
          // Missing other required fields
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.errors).toBeDefined();
    });
  });
});

import { getRedisClient } from '@errands-buddy/database';
import { logger } from '../utils/logger';
import { v4 as uuidv4 } from 'uuid';

export interface IdentityDocument {
  id: string;
  userId: string;
  documentType: 'drivers_license' | 'passport' | 'state_id';
  frontImage: string; // base64 encoded
  backImage?: string; // base64 encoded (for driver's license)
  selfieImage: string; // base64 encoded
  uploadedAt: Date;
  status: 'pending' | 'processing' | 'verified' | 'rejected';
  verificationId?: string;
  rejectionReason?: string;
  verifiedAt?: Date;
}

export interface VerificationResult {
  success: boolean;
  status: 'pending' | 'verified' | 'rejected';
  message: string;
  verificationId?: string;
  rejectionReason?: string;
}

export interface DocumentValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export class IdentityVerificationService {
  private redis = getRedisClient();
  private readonly documentPrefix = 'identity_document:';
  private readonly verificationPrefix = 'verification:';
  private readonly maxFileSize = 10 * 1024 * 1024; // 10MB
  private readonly allowedImageTypes = ['image/jpeg', 'image/png', 'image/webp'];
  private readonly maxDocumentsPerUser = 3;

  /**
   * Upload identity documents
   */
  async uploadDocuments(
    userId: string,
    documents: {
      documentType: 'drivers_license' | 'passport' | 'state_id';
      frontImage: string;
      backImage?: string;
      selfieImage: string;
    }
  ): Promise<VerificationResult> {
    try {
      // Validate documents
      const validation = await this.validateDocuments(documents);
      if (!validation.valid) {
        return {
          success: false,
          status: 'rejected',
          message: 'Document validation failed',
          rejectionReason: validation.errors.join(', ')
        };
      }

      // Check if user has too many pending documents
      const existingDocuments = await this.getUserDocuments(userId);
      const pendingCount = existingDocuments.filter(doc => doc.status === 'pending' || doc.status === 'processing').length;
      
      if (pendingCount >= this.maxDocumentsPerUser) {
        return {
          success: false,
          status: 'rejected',
          message: 'Too many pending verification requests',
          rejectionReason: 'Maximum pending verifications exceeded'
        };
      }

      // Create document record
      const documentId = uuidv4();
      const verificationId = `verification_${Date.now()}_${userId}`;
      
      const identityDocument: IdentityDocument = {
        id: documentId,
        userId,
        documentType: documents.documentType,
        frontImage: documents.frontImage,
        backImage: documents.backImage,
        selfieImage: documents.selfieImage,
        uploadedAt: new Date(),
        status: 'pending',
        verificationId
      };

      // Store document in Redis (in production, use secure cloud storage)
      await this.storeDocument(identityDocument);

      // Start verification process
      await this.initiateVerification(identityDocument);

      logger.info(`Identity documents uploaded for user ${userId}`);

      return {
        success: true,
        status: 'pending',
        message: 'Documents uploaded successfully. Verification in progress.',
        verificationId
      };

    } catch (error) {
      logger.error('Document upload failed', error);
      return {
        success: false,
        status: 'rejected',
        message: 'Document upload failed'
      };
    }
  }

  /**
   * Validate uploaded documents
   */
  private async validateDocuments(documents: {
    documentType: string;
    frontImage: string;
    backImage?: string;
    selfieImage: string;
  }): Promise<DocumentValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Validate document type
    const validTypes = ['drivers_license', 'passport', 'state_id'];
    if (!validTypes.includes(documents.documentType)) {
      errors.push('Invalid document type');
    }

    // Validate front image
    const frontValidation = this.validateImage(documents.frontImage, 'front image');
    if (!frontValidation.valid) {
      errors.push(...frontValidation.errors);
    }

    // Validate back image (required for driver's license)
    if (documents.documentType === 'drivers_license' && !documents.backImage) {
      errors.push('Back image is required for driver\'s license');
    }

    if (documents.backImage) {
      const backValidation = this.validateImage(documents.backImage, 'back image');
      if (!backValidation.valid) {
        errors.push(...backValidation.errors);
      }
    }

    // Validate selfie
    const selfieValidation = this.validateImage(documents.selfieImage, 'selfie');
    if (!selfieValidation.valid) {
      errors.push(...selfieValidation.errors);
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Validate base64 image
   */
  private validateImage(base64Image: string, imageType: string): DocumentValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      // Check if it's valid base64
      if (!/^data:image\/(jpeg|jpg|png|webp);base64,/.test(base64Image)) {
        errors.push(`Invalid ${imageType} format. Must be JPEG, PNG, or WebP.`);
        return { valid: false, errors, warnings };
      }

      // Extract base64 data
      const base64Data = base64Image.split(',')[1];
      if (!base64Data) {
        errors.push(`Invalid ${imageType} data`);
        return { valid: false, errors, warnings };
      }

      // Check file size
      const sizeInBytes = (base64Data.length * 3) / 4;
      if (sizeInBytes > this.maxFileSize) {
        errors.push(`${imageType} is too large. Maximum size is 10MB.`);
      }

      // Check minimum size
      if (sizeInBytes < 1024) {
        warnings.push(`${imageType} is very small. Please ensure it's clear and readable.`);
      }

      // Basic image validation (in production, use proper image processing library)
      if (base64Data.length < 1000) {
        errors.push(`${imageType} appears to be corrupted or too small`);
      }

    } catch (error) {
      errors.push(`Invalid ${imageType} format`);
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Store document in Redis
   */
  private async storeDocument(document: IdentityDocument): Promise<void> {
    const key = `${this.documentPrefix}${document.id}`;
    const userKey = `${this.documentPrefix}user:${document.userId}`;
    
    // Store document
    await this.redis.setEx(key, 7 * 24 * 60 * 60, JSON.stringify(document)); // 7 days TTL
    
    // Add to user's document list
    await this.redis.sAdd(userKey, document.id);
    await this.redis.expire(userKey, 7 * 24 * 60 * 60);
  }

  /**
   * Get user's documents
   */
  async getUserDocuments(userId: string): Promise<IdentityDocument[]> {
    try {
      const userKey = `${this.documentPrefix}user:${userId}`;
      const documentIds = await this.redis.sMembers(userKey);
      
      const documents: IdentityDocument[] = [];
      
      for (const id of documentIds) {
        const key = `${this.documentPrefix}${id}`;
        const data = await this.redis.get(key);
        
        if (data) {
          documents.push(JSON.parse(data));
        }
      }
      
      return documents.sort((a, b) => b.uploadedAt.getTime() - a.uploadedAt.getTime());
    } catch (error) {
      logger.error('Failed to get user documents', error);
      return [];
    }
  }

  /**
   * Get document by ID
   */
  async getDocument(documentId: string): Promise<IdentityDocument | null> {
    try {
      const key = `${this.documentPrefix}${documentId}`;
      const data = await this.redis.get(key);
      
      if (!data) {
        return null;
      }
      
      return JSON.parse(data);
    } catch (error) {
      logger.error('Failed to get document', error);
      return null;
    }
  }

  /**
   * Initiate verification process
   */
  private async initiateVerification(document: IdentityDocument): Promise<void> {
    try {
      // In a real implementation, this would:
      // 1. Send documents to identity verification service (e.g., Jumio, Onfido)
      // 2. Store verification ID for tracking
      // 3. Set up webhook to receive results
      
      // For now, we'll simulate the verification process
      setTimeout(async () => {
        await this.processVerificationResult(document.id, {
          status: 'verified',
          confidence: 0.95,
          verifiedAt: new Date()
        });
      }, 5000); // Simulate 5-second processing time

      // Update document status
      document.status = 'processing';
      await this.updateDocument(document);

      logger.info(`Verification initiated for document ${document.id}`);
    } catch (error) {
      logger.error('Failed to initiate verification', error);
      
      // Mark as rejected if initiation fails
      document.status = 'rejected';
      document.rejectionReason = 'Verification initiation failed';
      await this.updateDocument(document);
    }
  }

  /**
   * Process verification result
   */
  async processVerificationResult(
    documentId: string,
    result: {
      status: 'verified' | 'rejected';
      confidence?: number;
      verifiedAt: Date;
      rejectionReason?: string;
    }
  ): Promise<void> {
    try {
      const document = await this.getDocument(documentId);
      if (!document) {
        logger.error(`Document not found: ${documentId}`);
        return;
      }

      document.status = result.status;
      document.verifiedAt = result.verifiedAt;
      
      if (result.status === 'rejected') {
        document.rejectionReason = result.rejectionReason || 'Verification failed';
      }

      await this.updateDocument(document);

      // Update user verification status if verified
      if (result.status === 'verified') {
        // This would typically update the user's verification status in the database
        logger.info(`Document ${documentId} verified successfully`);
      } else {
        logger.info(`Document ${documentId} rejected: ${document.rejectionReason}`);
      }

    } catch (error) {
      logger.error('Failed to process verification result', error);
    }
  }

  /**
   * Update document
   */
  private async updateDocument(document: IdentityDocument): Promise<void> {
    const key = `${this.documentPrefix}${document.id}`;
    await this.redis.setEx(key, 7 * 24 * 60 * 60, JSON.stringify(document));
  }

  /**
   * Get verification status
   */
  async getVerificationStatus(verificationId: string): Promise<{
    status: string;
    verified: boolean;
    message: string;
  }> {
    try {
      const key = `${this.verificationPrefix}${verificationId}`;
      const data = await this.redis.get(key);
      
      if (!data) {
        return {
          status: 'not_found',
          verified: false,
          message: 'Verification not found'
        };
      }

      const verificationData = JSON.parse(data);
      
      return {
        status: verificationData.status,
        verified: verificationData.status === 'verified',
        message: verificationData.message || 'Verification in progress'
      };

    } catch (error) {
      logger.error('Failed to get verification status', error);
      return {
        status: 'error',
        verified: false,
        message: 'Failed to get verification status'
      };
    }
  }

  /**
   * Delete document
   */
  async deleteDocument(documentId: string, userId: string): Promise<boolean> {
    try {
      const document = await this.getDocument(documentId);
      if (!document || document.userId !== userId) {
        return false;
      }

      // Only allow deletion of pending or rejected documents
      if (document.status === 'verified' || document.status === 'processing') {
        return false;
      }

      const key = `${this.documentPrefix}${documentId}`;
      const userKey = `${this.documentPrefix}user:${userId}`;
      
      await this.redis.del(key);
      await this.redis.sRem(userKey, documentId);

      logger.info(`Document ${documentId} deleted by user ${userId}`);
      return true;

    } catch (error) {
      logger.error('Failed to delete document', error);
      return false;
    }
  }

  /**
   * Clean up expired documents
   */
  async cleanupExpiredDocuments(): Promise<number> {
    try {
      const pattern = `${this.documentPrefix}*`;
      const keys = await this.redis.keys(pattern);
      let cleanedCount = 0;

      for (const key of keys) {
        if (key.includes('user:')) continue; // Skip user keys
        
        const data = await this.redis.get(key);
        if (data) {
          const document: IdentityDocument = JSON.parse(data);
          const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
          
          if (document.uploadedAt < sevenDaysAgo) {
            await this.redis.del(key);
            cleanedCount++;
          }
        }
      }

      logger.info(`Cleaned up ${cleanedCount} expired documents`);
      return cleanedCount;
    } catch (error) {
      logger.error('Failed to cleanup expired documents', error);
      return 0;
    }
  }
}

// Singleton instance
export const identityVerificationService = new IdentityVerificationService();

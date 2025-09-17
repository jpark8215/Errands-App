import { getRedisClient } from '@errands-buddy/database';
import { UserRepository } from '@errands-buddy/database';
import { logger } from '../utils/logger';
import { v4 as uuidv4 } from 'uuid';

export interface PhotoUploadResult {
  success: boolean;
  photoUrl?: string;
  thumbnailUrl?: string;
  error?: string;
}

export interface PhotoMetadata {
  id: string;
  userId: string;
  originalUrl: string;
  thumbnailUrl: string;
  uploadedAt: Date;
  size: number;
  dimensions: {
    width: number;
    height: number;
  };
  format: string;
}

export class ProfilePhotoService {
  private redis = getRedisClient();
  private userRepository = new UserRepository();
  private readonly photoPrefix = 'profile_photo:';
  private readonly maxFileSize = 5 * 1024 * 1024; // 5MB
  private readonly allowedFormats = ['jpeg', 'jpg', 'png', 'webp'];
  private readonly thumbnailSize = 150;
  private readonly baseUrl = process.env.CDN_BASE_URL || 'https://cdn.errandsbuddy.com';

  /**
   * Upload profile photo
   */
  async uploadProfilePhoto(userId: string, base64Image: string): Promise<PhotoUploadResult> {
    try {
      // Validate image
      const validation = this.validateImage(base64Image);
      if (!validation.valid) {
        return {
          success: false,
          error: validation.errors.join(', ')
        };
      }

      // Process image
      const processedImage = await this.processImage(base64Image);
      if (!processedImage) {
        return {
          success: false,
          error: 'Failed to process image'
        };
      }

      // Generate unique filename
      const photoId = uuidv4();
      const originalFilename = `profile_${userId}_${photoId}.${processedImage.format}`;
      const thumbnailFilename = `profile_${userId}_${photoId}_thumb.${processedImage.format}`;

      // In a real implementation, upload to cloud storage (AWS S3, Cloudinary, etc.)
      const photoUrl = await this.uploadToStorage(originalFilename, processedImage.original);
      const thumbnailUrl = await this.uploadToStorage(thumbnailFilename, processedImage.thumbnail);

      // Store metadata
      const metadata: PhotoMetadata = {
        id: photoId,
        userId,
        originalUrl: photoUrl,
        thumbnailUrl,
        uploadedAt: new Date(),
        size: processedImage.original.length,
        dimensions: processedImage.dimensions,
        format: processedImage.format
      };

      await this.storePhotoMetadata(metadata);

      // Update user profile with new photo URL
      await this.userRepository.updateProfile(userId, {
        avatar: photoUrl
      });

      // Clean up old photos
      await this.cleanupOldPhotos(userId);

      logger.info(`Profile photo uploaded for user ${userId}`);

      return {
        success: true,
        photoUrl,
        thumbnailUrl
      };

    } catch (error) {
      logger.error('Profile photo upload failed', error);
      return {
        success: false,
        error: 'Failed to upload profile photo'
      };
    }
  }

  /**
   * Delete profile photo
   */
  async deleteProfilePhoto(userId: string): Promise<PhotoUploadResult> {
    try {
      // Get current photo metadata
      const currentPhoto = await this.getCurrentPhoto(userId);
      if (!currentPhoto) {
        return {
          success: false,
          error: 'No profile photo found'
        };
      }

      // Delete from storage (in a real implementation)
      await this.deleteFromStorage(currentPhoto.originalUrl);
      await this.deleteFromStorage(currentPhoto.thumbnailUrl);

      // Remove metadata
      await this.removePhotoMetadata(userId);

      // Update user profile
      await this.userRepository.updateProfile(userId, {
        avatar: undefined
      });

      logger.info(`Profile photo deleted for user ${userId}`);

      return {
        success: true
      };

    } catch (error) {
      logger.error('Profile photo deletion failed', error);
      return {
        success: false,
        error: 'Failed to delete profile photo'
      };
    }
  }

  /**
   * Get current profile photo
   */
  async getCurrentPhoto(userId: string): Promise<PhotoMetadata | null> {
    try {
      const key = `${this.photoPrefix}${userId}`;
      const data = await this.redis.get(key);
      
      if (!data) {
        return null;
      }

      return JSON.parse(data);
    } catch (error) {
      logger.error('Failed to get current photo', error);
      return null;
    }
  }

  /**
   * Validate base64 image
   */
  private validateImage(base64Image: string): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    try {
      // Check if it's valid base64 image
      if (!/^data:image\/(jpeg|jpg|png|webp);base64,/.test(base64Image)) {
        errors.push('Invalid image format. Must be JPEG, PNG, or WebP.');
        return { valid: false, errors };
      }

      // Extract format and data
      const format = base64Image.split(';')[0].split('/')[1];
      if (!this.allowedFormats.includes(format)) {
        errors.push('Unsupported image format. Must be JPEG, PNG, or WebP.');
        return { valid: false, errors };
      }

      // Extract base64 data
      const base64Data = base64Image.split(',')[1];
      if (!base64Data) {
        errors.push('Invalid image data');
        return { valid: false, errors };
      }

      // Check file size
      const sizeInBytes = (base64Data.length * 3) / 4;
      if (sizeInBytes > this.maxFileSize) {
        errors.push(`Image too large. Maximum size is ${this.maxFileSize / (1024 * 1024)}MB.`);
        return { valid: false, errors };
      }

      // Check minimum size
      if (sizeInBytes < 1024) {
        errors.push('Image too small. Please ensure it\'s clear and readable.');
        return { valid: false, errors };
      }

    } catch (error) {
      errors.push('Invalid image format');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Process image (resize, create thumbnail)
   */
  private async processImage(base64Image: string): Promise<{
    original: string;
    thumbnail: string;
    dimensions: { width: number; height: number };
    format: string;
  } | null> {
    try {
      // In a real implementation, you would use a library like Sharp or Jimp
      // For now, we'll simulate the processing
      
      const format = base64Image.split(';')[0].split('/')[1];
      const base64Data = base64Image.split(',')[1];

      // Simulate image processing
      const processedImage = {
        original: base64Data,
        thumbnail: base64Data, // In reality, this would be a resized version
        dimensions: { width: 400, height: 400 }, // Simulated dimensions
        format
      };

      return processedImage;

    } catch (error) {
      logger.error('Image processing failed', error);
      return null;
    }
  }

  /**
   * Upload to storage (mock implementation)
   */
  private async uploadToStorage(filename: string, base64Data: string): Promise<string> {
    try {
      // In a real implementation, this would upload to AWS S3, Cloudinary, etc.
      // For now, we'll return a mock URL
      
      const mockUrl = `${this.baseUrl}/uploads/${filename}`;
      
      // Simulate upload delay
      await new Promise(resolve => setTimeout(resolve, 100));
      
      logger.info(`Mock upload: ${filename}`);
      
      return mockUrl;

    } catch (error) {
      logger.error('Storage upload failed', error);
      throw error;
    }
  }

  /**
   * Delete from storage (mock implementation)
   */
  private async deleteFromStorage(url: string): Promise<void> {
    try {
      // In a real implementation, this would delete from cloud storage
      logger.info(`Mock delete: ${url}`);
      
      // Simulate deletion delay
      await new Promise(resolve => setTimeout(resolve, 50));
      
    } catch (error) {
      logger.error('Storage deletion failed', error);
      throw error;
    }
  }

  /**
   * Store photo metadata
   */
  private async storePhotoMetadata(metadata: PhotoMetadata): Promise<void> {
    const key = `${this.photoPrefix}${metadata.userId}`;
    await this.redis.setEx(key, 365 * 24 * 60 * 60, JSON.stringify(metadata)); // 1 year TTL
  }

  /**
   * Remove photo metadata
   */
  private async removePhotoMetadata(userId: string): Promise<void> {
    const key = `${this.photoPrefix}${userId}`;
    await this.redis.del(key);
  }

  /**
   * Clean up old photos for user
   */
  private async cleanupOldPhotos(userId: string): Promise<void> {
    try {
      // In a real implementation, this would:
      // 1. Get all photos for the user
      // 2. Keep only the most recent one
      // 3. Delete the rest from storage
      
      logger.info(`Cleaned up old photos for user ${userId}`);
    } catch (error) {
      logger.error('Failed to cleanup old photos', error);
    }
  }

  /**
   * Get photo statistics
   */
  async getPhotoStats(userId: string): Promise<{
    hasPhoto: boolean;
    uploadDate?: Date;
    size?: number;
    dimensions?: { width: number; height: number };
  }> {
    try {
      const photo = await this.getCurrentPhoto(userId);
      
      if (!photo) {
        return { hasPhoto: false };
      }

      return {
        hasPhoto: true,
        uploadDate: photo.uploadedAt,
        size: photo.size,
        dimensions: photo.dimensions
      };

    } catch (error) {
      logger.error('Failed to get photo stats', error);
      return { hasPhoto: false };
    }
  }

  /**
   * Generate photo URL with transformations
   */
  generatePhotoUrl(photoUrl: string, transformations?: {
    width?: number;
    height?: number;
    quality?: number;
    format?: string;
  }): string {
    if (!transformations) {
      return photoUrl;
    }

    // In a real implementation, this would generate URLs with query parameters
    // for image transformation services like Cloudinary or ImageKit
    const params = new URLSearchParams();
    
    if (transformations.width) params.append('w', transformations.width.toString());
    if (transformations.height) params.append('h', transformations.height.toString());
    if (transformations.quality) params.append('q', transformations.quality.toString());
    if (transformations.format) params.append('f', transformations.format);

    const queryString = params.toString();
    return queryString ? `${photoUrl}?${queryString}` : photoUrl;
  }

  /**
   * Clean up expired photos
   */
  async cleanupExpiredPhotos(): Promise<number> {
    try {
      const pattern = `${this.photoPrefix}*`;
      const keys = await this.redis.keys(pattern);
      let cleanedCount = 0;

      for (const key of keys) {
        const data = await this.redis.get(key);
        if (data) {
          const photo: PhotoMetadata = JSON.parse(data);
          const oneYearAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
          
          if (photo.uploadedAt < oneYearAgo) {
            // Delete from storage
            await this.deleteFromStorage(photo.originalUrl);
            await this.deleteFromStorage(photo.thumbnailUrl);
            
            // Remove metadata
            await this.redis.del(key);
            cleanedCount++;
          }
        }
      }

      logger.info(`Cleaned up ${cleanedCount} expired photos`);
      return cleanedCount;
    } catch (error) {
      logger.error('Failed to cleanup expired photos', error);
      return 0;
    }
  }
}

// Singleton instance
export const profilePhotoService = new ProfilePhotoService();

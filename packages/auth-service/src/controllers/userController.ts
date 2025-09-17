import { Request, Response } from 'express';
import { UserRepository } from '@errands-buddy/database';
import { UserType, TaskCategory } from '@errands-buddy/shared-types';
import { logger } from '../utils/logger';
import { profilePhotoService } from '../services/profilePhotoService';
import { availabilityService } from '../services/availabilityService';

export class UserController {
  private userRepository = new UserRepository();

  /**
   * Get user profile
   */
  async getProfile(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({
          success: false,
          error: { code: 'UNAUTHORIZED', message: 'User not authenticated' }
        });
        return;
      }

      const user = await this.userRepository.findWithProfile(userId);
      if (!user) {
        res.status(404).json({
          success: false,
          error: { code: 'USER_NOT_FOUND', message: 'User not found' }
        });
        return;
      }

      // Get user's preferred categories
      const preferredCategories = await this.userRepository.getUserPreferredCategories(userId);

      // Get availability status
      const availabilityStatus = await this.userRepository.getAvailabilityStatus(userId);

      res.json({
        success: true,
        data: {
          ...user,
          profile: {
            ...user.profile,
            preferredCategories
          },
          availability: {
            ...user.profile.availability,
            status: availabilityStatus || 'offline'
          }
        }
      });

    } catch (error) {
      logger.error('Failed to get user profile', error);
      res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Failed to get user profile' }
      });
    }
  }

  /**
   * Update user profile
   */
  async updateProfile(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({
          success: false,
          error: { code: 'UNAUTHORIZED', message: 'User not authenticated' }
        });
        return;
      }

      const { firstName, lastName, bio } = req.body;

      // Validate input
      const errors: string[] = [];
      if (firstName && firstName.trim().length < 2) {
        errors.push('First name must be at least 2 characters');
      }
      if (lastName && lastName.trim().length < 2) {
        errors.push('Last name must be at least 2 characters');
      }
      if (bio && bio.length > 500) {
        errors.push('Bio must be less than 500 characters');
      }

      if (errors.length > 0) {
        res.status(400).json({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: errors.join(', ') }
        });
        return;
      }

      const updateData: any = {};
      if (firstName) updateData.firstName = firstName.trim();
      if (lastName) updateData.lastName = lastName.trim();
      if (bio !== undefined) updateData.bio = bio.trim();

      const updatedProfile = await this.userRepository.updateProfile(userId, updateData);
      if (!updatedProfile) {
        res.status(404).json({
          success: false,
          error: { code: 'USER_NOT_FOUND', message: 'User not found' }
        });
        return;
      }

      res.json({
        success: true,
        data: updatedProfile
      });

    } catch (error) {
      logger.error('Failed to update user profile', error);
      res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Failed to update profile' }
      });
    }
  }

  /**
   * Update user preferred categories
   */
  async updatePreferredCategories(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({
          success: false,
          error: { code: 'UNAUTHORIZED', message: 'User not authenticated' }
        });
        return;
      }

      const { categories } = req.body;

      // Validate categories
      if (!Array.isArray(categories)) {
        res.status(400).json({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'Categories must be an array' }
        });
        return;
      }

      const validCategories = Object.values(TaskCategory);
      const invalidCategories = categories.filter(cat => !validCategories.includes(cat));
      
      if (invalidCategories.length > 0) {
        res.status(400).json({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: `Invalid categories: ${invalidCategories.join(', ')}` }
        });
        return;
      }

      if (categories.length > 10) {
        res.status(400).json({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'Maximum 10 categories allowed' }
        });
        return;
      }

      await this.userRepository.setUserPreferredCategories(userId, categories);

      res.json({
        success: true,
        message: 'Preferred categories updated successfully'
      });

    } catch (error) {
      logger.error('Failed to update preferred categories', error);
      res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Failed to update categories' }
      });
    }
  }

  /**
   * Get user statistics
   */
  async getUserStats(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({
          success: false,
          error: { code: 'UNAUTHORIZED', message: 'User not authenticated' }
        });
        return;
      }

      const stats = await this.userRepository.getUserStats(userId);

      res.json({
        success: true,
        data: stats
      });

    } catch (error) {
      logger.error('Failed to get user stats', error);
      res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Failed to get user statistics' }
      });
    }
  }

  /**
   * Update user availability status
   */
  async updateAvailabilityStatus(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({
          success: false,
          error: { code: 'UNAUTHORIZED', message: 'User not authenticated' }
        });
        return;
      }

      const { status } = req.body;

      const validStatuses = ['online', 'offline', 'busy', 'away'];
      if (!validStatuses.includes(status)) {
        res.status(400).json({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'Invalid availability status' }
        });
        return;
      }

      const success = await this.userRepository.updateAvailabilityStatus(userId, status);
      if (!success) {
        res.status(404).json({
          success: false,
          error: { code: 'USER_NOT_FOUND', message: 'User not found' }
        });
        return;
      }

      res.json({
        success: true,
        message: 'Availability status updated successfully'
      });

    } catch (error) {
      logger.error('Failed to update availability status', error);
      res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Failed to update availability status' }
      });
    }
  }

  /**
   * Update availability schedule
   */
  async updateAvailabilitySchedule(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({
          success: false,
          error: { code: 'UNAUTHORIZED', message: 'User not authenticated' }
        });
        return;
      }

      const { schedule } = req.body;

      const result = await availabilityService.updateAvailabilitySchedule(userId, schedule);

      if (!result.success) {
        res.status(400).json({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: result.error }
        });
        return;
      }

      res.json({
        success: true,
        message: 'Availability schedule updated successfully',
        data: result.schedule
      });

    } catch (error) {
      logger.error('Failed to update availability schedule', error);
      res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Failed to update availability schedule' }
      });
    }
  }

  /**
   * Get availability schedule
   */
  async getAvailabilitySchedule(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({
          success: false,
          error: { code: 'UNAUTHORIZED', message: 'User not authenticated' }
        });
        return;
      }

      const schedule = await availabilityService.getAvailabilitySchedule(userId);

      res.json({
        success: true,
        data: schedule
      });

    } catch (error) {
      logger.error('Failed to get availability schedule', error);
      res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Failed to get availability schedule' }
      });
    }
  }

  /**
   * Upload profile photo
   */
  async uploadProfilePhoto(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({
          success: false,
          error: { code: 'UNAUTHORIZED', message: 'User not authenticated' }
        });
        return;
      }

      const { image } = req.body;

      if (!image) {
        res.status(400).json({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'Image is required' }
        });
        return;
      }

      const result = await profilePhotoService.uploadProfilePhoto(userId, image);

      if (!result.success) {
        res.status(400).json({
          success: false,
          error: { code: 'UPLOAD_ERROR', message: result.error }
        });
        return;
      }

      res.json({
        success: true,
        message: 'Profile photo uploaded successfully',
        data: {
          photoUrl: result.photoUrl,
          thumbnailUrl: result.thumbnailUrl
        }
      });

    } catch (error) {
      logger.error('Failed to upload profile photo', error);
      res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Failed to upload profile photo' }
      });
    }
  }

  /**
   * Delete profile photo
   */
  async deleteProfilePhoto(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({
          success: false,
          error: { code: 'UNAUTHORIZED', message: 'User not authenticated' }
        });
        return;
      }

      const result = await profilePhotoService.deleteProfilePhoto(userId);

      if (!result.success) {
        res.status(400).json({
          success: false,
          error: { code: 'DELETE_ERROR', message: result.error }
        });
        return;
      }

      res.json({
        success: true,
        message: 'Profile photo deleted successfully'
      });

    } catch (error) {
      logger.error('Failed to delete profile photo', error);
      res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Failed to delete profile photo' }
      });
    }
  }

  /**
   * Search users
   */
  async searchUsers(req: Request, res: Response): Promise<void> {
    try {
      const { q, limit = 20, userType } = req.query;

      if (!q || typeof q !== 'string') {
        res.status(400).json({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'Search query is required' }
        });
        return;
      }

      const searchLimit = Math.min(parseInt(limit as string) || 20, 50);
      const users = await this.userRepository.searchUsers(q, searchLimit);

      // Filter by user type if specified
      let filteredUsers = users;
      if (userType && Object.values(UserType).includes(userType as UserType)) {
        filteredUsers = users.filter(user => user.userType === userType);
      }

      res.json({
        success: true,
        data: {
          users: filteredUsers,
          total: filteredUsers.length,
          query: q
        }
      });

    } catch (error) {
      logger.error('Failed to search users', error);
      res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Failed to search users' }
      });
    }
  }

  /**
   * Get user by ID (public profile)
   */
  async getUserById(req: Request, res: Response): Promise<void> {
    try {
      const { userId } = req.params;

      const user = await this.userRepository.findWithProfile(userId);
      if (!user) {
        res.status(404).json({
          success: false,
          error: { code: 'USER_NOT_FOUND', message: 'User not found' }
        });
        return;
      }

      // Return public profile only
      const publicProfile = {
        id: user.id,
        userType: user.userType,
        profile: {
          firstName: user.profile.firstName,
          lastName: user.profile.lastName,
          avatar: user.profile.avatar,
          bio: user.profile.bio,
          rating: user.profile.rating,
          completedTasks: user.profile.completedTasks,
          badges: user.profile.badges
        }
      };

      res.json({
        success: true,
        data: publicProfile
      });

    } catch (error) {
      logger.error('Failed to get user by ID', error);
      res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Failed to get user profile' }
      });
    }
  }
}

// Export singleton instance
export const userController = new UserController();

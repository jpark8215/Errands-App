import { getRedisClient } from '@errands-buddy/database';
import { UserRepository } from '@errands-buddy/database';
import { logger } from '../utils/logger';

export interface AvailabilitySchedule {
  id: string;
  userId: string;
  dayOfWeek: number; // 0 = Sunday, 1 = Monday, etc.
  startTime: string; // HH:MM format
  endTime: string; // HH:MM format
  isAvailable: boolean;
  timezone: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface AvailabilityUpdate {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  isAvailable: boolean;
}

export interface AvailabilityResult {
  success: boolean;
  schedule?: AvailabilitySchedule[];
  error?: string;
}

export interface TimeSlot {
  start: string;
  end: string;
  available: boolean;
}

export interface WeeklyAvailability {
  monday: TimeSlot[];
  tuesday: TimeSlot[];
  wednesday: TimeSlot[];
  thursday: TimeSlot[];
  friday: TimeSlot[];
  saturday: TimeSlot[];
  sunday: TimeSlot[];
}

export class AvailabilityService {
  private redis = getRedisClient();
  private userRepository = new UserRepository();
  private readonly schedulePrefix = 'availability_schedule:';
  private readonly userSchedulePrefix = 'user_schedule:';

  /**
   * Update availability schedule
   */
  async updateAvailabilitySchedule(
    userId: string,
    schedule: AvailabilityUpdate[]
  ): Promise<AvailabilityResult> {
    try {
      // Validate schedule data
      const validation = this.validateSchedule(schedule);
      if (!validation.valid) {
        return {
          success: false,
          error: validation.errors.join(', ')
        };
      }

      // Clear existing schedule
      await this.clearUserSchedule(userId);

      // Create new schedule entries
      const newSchedule: AvailabilitySchedule[] = [];
      
      for (const entry of schedule) {
        const scheduleEntry: AvailabilitySchedule = {
          id: `${userId}_${entry.dayOfWeek}_${Date.now()}`,
          userId,
          dayOfWeek: entry.dayOfWeek,
          startTime: entry.startTime,
          endTime: entry.endTime,
          isAvailable: entry.isAvailable,
          timezone: 'UTC', // In production, get from user profile
          createdAt: new Date(),
          updatedAt: new Date()
        };

        await this.storeScheduleEntry(scheduleEntry);
        newSchedule.push(scheduleEntry);
      }

      // Update user's availability status based on schedule
      await this.updateUserAvailabilityStatus(userId, newSchedule);

      logger.info(`Availability schedule updated for user ${userId}`);

      return {
        success: true,
        schedule: newSchedule
      };

    } catch (error) {
      logger.error('Failed to update availability schedule', error);
      return {
        success: false,
        error: 'Failed to update availability schedule'
      };
    }
  }

  /**
   * Get availability schedule
   */
  async getAvailabilitySchedule(userId: string): Promise<AvailabilitySchedule[]> {
    try {
      const userKey = `${this.userSchedulePrefix}${userId}`;
      const scheduleIds = await this.redis.sMembers(userKey);
      
      const schedule: AvailabilitySchedule[] = [];
      
      for (const id of scheduleIds) {
        const key = `${this.schedulePrefix}${id}`;
        const data = await this.redis.get(key);
        
        if (data) {
          schedule.push(JSON.parse(data));
        }
      }
      
      return schedule.sort((a, b) => a.dayOfWeek - b.dayOfWeek || a.startTime.localeCompare(b.startTime));
    } catch (error) {
      logger.error('Failed to get availability schedule', error);
      return [];
    }
  }

  /**
   * Get weekly availability in a structured format
   */
  async getWeeklyAvailability(userId: string): Promise<WeeklyAvailability> {
    try {
      const schedule = await this.getAvailabilitySchedule(userId);
      
      const weeklyAvailability: WeeklyAvailability = {
        monday: [],
        tuesday: [],
        wednesday: [],
        thursday: [],
        friday: [],
        saturday: [],
        sunday: []
      };

      const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const;

      for (const entry of schedule) {
        const dayName = dayNames[entry.dayOfWeek];
        if (dayName) {
          weeklyAvailability[dayName].push({
            start: entry.startTime,
            end: entry.endTime,
            available: entry.isAvailable
          });
        }
      }

      return weeklyAvailability;
    } catch (error) {
      logger.error('Failed to get weekly availability', error);
      return {
        monday: [],
        tuesday: [],
        wednesday: [],
        thursday: [],
        friday: [],
        saturday: [],
        sunday: []
      };
    }
  }

  /**
   * Check if user is available at specific time
   */
  async isUserAvailable(
    userId: string,
    dayOfWeek: number,
    time: string
  ): Promise<boolean> {
    try {
      const schedule = await this.getAvailabilitySchedule(userId);
      
      const daySchedule = schedule.filter(entry => entry.dayOfWeek === dayOfWeek);
      
      for (const entry of daySchedule) {
        if (entry.isAvailable && this.isTimeInRange(time, entry.startTime, entry.endTime)) {
          return true;
        }
      }
      
      return false;
    } catch (error) {
      logger.error('Failed to check user availability', error);
      return false;
    }
  }

  /**
   * Get available time slots for a specific day
   */
  async getAvailableTimeSlots(
    userId: string,
    dayOfWeek: number
  ): Promise<TimeSlot[]> {
    try {
      const schedule = await this.getAvailabilitySchedule(userId);
      
      const daySchedule = schedule
        .filter(entry => entry.dayOfWeek === dayOfWeek && entry.isAvailable)
        .map(entry => ({
          start: entry.startTime,
          end: entry.endTime,
          available: true
        }))
        .sort((a, b) => a.start.localeCompare(b.start));
      
      return daySchedule;
    } catch (error) {
      logger.error('Failed to get available time slots', error);
      return [];
    }
  }

  /**
   * Set user as available/unavailable
   */
  async setAvailabilityStatus(
    userId: string,
    status: 'online' | 'offline' | 'busy' | 'away'
  ): Promise<boolean> {
    try {
      return await this.userRepository.updateAvailabilityStatus(userId, status);
    } catch (error) {
      logger.error('Failed to set availability status', error);
      return false;
    }
  }

  /**
   * Get user's current availability status
   */
  async getAvailabilityStatus(userId: string): Promise<string | null> {
    try {
      return await this.userRepository.getAvailabilityStatus(userId);
    } catch (error) {
      logger.error('Failed to get availability status', error);
      return null;
    }
  }

  /**
   * Validate schedule data
   */
  private validateSchedule(schedule: AvailabilityUpdate[]): {
    valid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    if (!Array.isArray(schedule)) {
      errors.push('Schedule must be an array');
      return { valid: false, errors };
    }

    if (schedule.length === 0) {
      errors.push('Schedule cannot be empty');
      return { valid: false, errors };
    }

    if (schedule.length > 7) {
      errors.push('Cannot have more than 7 schedule entries (one per day)');
      return { valid: false, errors };
    }

    const seenDays = new Set<number>();
    
    for (const entry of schedule) {
      // Validate day of week
      if (typeof entry.dayOfWeek !== 'number' || entry.dayOfWeek < 0 || entry.dayOfWeek > 6) {
        errors.push('Day of week must be between 0 (Sunday) and 6 (Saturday)');
        continue;
      }

      if (seenDays.has(entry.dayOfWeek)) {
        errors.push(`Duplicate entry for day ${entry.dayOfWeek}`);
        continue;
      }
      seenDays.add(entry.dayOfWeek);

      // Validate time format
      if (!this.isValidTime(entry.startTime)) {
        errors.push(`Invalid start time format: ${entry.startTime}. Use HH:MM format.`);
      }

      if (!this.isValidTime(entry.endTime)) {
        errors.push(`Invalid end time format: ${entry.endTime}. Use HH:MM format.`);
      }

      // Validate time range
      if (this.isValidTime(entry.startTime) && this.isValidTime(entry.endTime)) {
        if (entry.startTime >= entry.endTime) {
          errors.push(`Start time must be before end time for day ${entry.dayOfWeek}`);
        }
      }

      // Validate availability flag
      if (typeof entry.isAvailable !== 'boolean') {
        errors.push(`isAvailable must be a boolean for day ${entry.dayOfWeek}`);
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Validate time format (HH:MM)
   */
  private isValidTime(time: string): boolean {
    const timeRegex = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/;
    return timeRegex.test(time);
  }

  /**
   * Check if time is within range
   */
  private isTimeInRange(time: string, startTime: string, endTime: string): boolean {
    return time >= startTime && time <= endTime;
  }

  /**
   * Store schedule entry
   */
  private async storeScheduleEntry(entry: AvailabilitySchedule): Promise<void> {
    const key = `${this.schedulePrefix}${entry.id}`;
    const userKey = `${this.userSchedulePrefix}${entry.userId}`;
    
    // Store entry
    await this.redis.setEx(key, 30 * 24 * 60 * 60, JSON.stringify(entry)); // 30 days TTL
    
    // Add to user's schedule
    await this.redis.sAdd(userKey, entry.id);
    await this.redis.expire(userKey, 30 * 24 * 60 * 60);
  }

  /**
   * Clear user's schedule
   */
  private async clearUserSchedule(userId: string): Promise<void> {
    const userKey = `${this.userSchedulePrefix}${userId}`;
    const scheduleIds = await this.redis.sMembers(userKey);
    
    for (const id of scheduleIds) {
      const key = `${this.schedulePrefix}${id}`;
      await this.redis.del(key);
    }
    
    await this.redis.del(userKey);
  }

  /**
   * Update user's availability status based on schedule
   */
  private async updateUserAvailabilityStatus(
    userId: string,
    schedule: AvailabilitySchedule[]
  ): Promise<void> {
    try {
      const now = new Date();
      const currentDay = now.getDay();
      const currentTime = now.toTimeString().slice(0, 5); // HH:MM format

      // Check if user should be available now
      const isCurrentlyAvailable = schedule.some(entry => 
        entry.dayOfWeek === currentDay &&
        entry.isAvailable &&
        this.isTimeInRange(currentTime, entry.startTime, entry.endTime)
      );

      const status = isCurrentlyAvailable ? 'online' : 'offline';
      await this.userRepository.updateAvailabilityStatus(userId, status);

    } catch (error) {
      logger.error('Failed to update user availability status', error);
    }
  }

  /**
   * Get availability statistics
   */
  async getAvailabilityStats(userId: string): Promise<{
    totalHoursPerWeek: number;
    availableDays: number;
    averageHoursPerDay: number;
    mostActiveDay: string;
  }> {
    try {
      const schedule = await this.getAvailabilitySchedule(userId);
      
      const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      const dayHours: { [key: string]: number } = {};
      
      let totalHours = 0;
      let availableDays = 0;

      for (const entry of schedule) {
        if (entry.isAvailable) {
          const dayName = dayNames[entry.dayOfWeek];
          const hours = this.calculateHours(entry.startTime, entry.endTime);
          
          dayHours[dayName] = (dayHours[dayName] || 0) + hours;
          totalHours += hours;
          availableDays++;
        }
      }

      const averageHoursPerDay = availableDays > 0 ? totalHours / availableDays : 0;
      const mostActiveDay = Object.keys(dayHours).reduce((a, b) => 
        dayHours[a] > dayHours[b] ? a : b, 'None'
      );

      return {
        totalHoursPerWeek: totalHours,
        availableDays,
        averageHoursPerDay: Math.round(averageHoursPerDay * 100) / 100,
        mostActiveDay
      };

    } catch (error) {
      logger.error('Failed to get availability stats', error);
      return {
        totalHoursPerWeek: 0,
        availableDays: 0,
        averageHoursPerDay: 0,
        mostActiveDay: 'None'
      };
    }
  }

  /**
   * Calculate hours between two times
   */
  private calculateHours(startTime: string, endTime: string): number {
    const start = this.timeToMinutes(startTime);
    const end = this.timeToMinutes(endTime);
    return (end - start) / 60;
  }

  /**
   * Convert time string to minutes
   */
  private timeToMinutes(time: string): number {
    const [hours, minutes] = time.split(':').map(Number);
    return hours * 60 + minutes;
  }

  /**
   * Clean up expired schedules
   */
  async cleanupExpiredSchedules(): Promise<number> {
    try {
      const pattern = `${this.schedulePrefix}*`;
      const keys = await this.redis.keys(pattern);
      let cleanedCount = 0;

      for (const key of keys) {
        const data = await this.redis.get(key);
        if (data) {
          const schedule: AvailabilitySchedule = JSON.parse(data);
          const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
          
          if (schedule.createdAt < thirtyDaysAgo) {
            await this.redis.del(key);
            cleanedCount++;
          }
        }
      }

      logger.info(`Cleaned up ${cleanedCount} expired schedules`);
      return cleanedCount;
    } catch (error) {
      logger.error('Failed to cleanup expired schedules', error);
      return 0;
    }
  }
}

// Singleton instance
export const availabilityService = new AvailabilityService();

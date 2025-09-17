import { BaseRepository } from './BaseRepository';
import { User, UserProfile, UserType, VerificationStatus } from '@errands-buddy/shared-types';
import { QueryResult } from 'pg';

export interface UserWithProfile extends User {
  profile: UserProfile;
}

export interface UserRegistrationData {
  email: string;
  phoneNumber: string;
  passwordHash: string;
  userType: UserType;
  firstName: string;
  lastName: string;
  bio?: string;
}

export interface UserUpdateData {
  email?: string;
  phoneNumber?: string;
  userType?: UserType;
  verificationStatus?: VerificationStatus;
}

export interface UserProfileUpdateData {
  firstName?: string;
  lastName?: string;
  avatarUrl?: string;
  bio?: string;
}

export class UserRepository extends BaseRepository<User> {
  constructor() {
    super('users', 'id');
  }

  async findByEmail(email: string): Promise<User | null> {
    const result = await this.query(
      'SELECT * FROM users WHERE email = $1',
      [email]
    );
    
    return result.rows[0] || null;
  }

  async findByPhoneNumber(phoneNumber: string): Promise<User | null> {
    const result = await this.query(
      'SELECT * FROM users WHERE phone_number = $1',
      [phoneNumber]
    );
    
    return result.rows[0] || null;
  }

  async findWithProfile(userId: string): Promise<UserWithProfile | null> {
    const result = await this.query(`
      SELECT 
        u.*,
        up.first_name,
        up.last_name,
        up.avatar_url,
        up.bio,
        up.rating,
        up.completed_tasks,
        up.total_earnings
      FROM users u
      LEFT JOIN user_profiles up ON u.id = up.user_id
      WHERE u.id = $1
    `, [userId]);

    if (result.rows.length === 0) return null;

    const row = result.rows[0];
    return {
      id: row.id,
      email: row.email,
      phoneNumber: row.phone_number,
      userType: row.user_type,
      verificationStatus: row.verification_status,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      profile: {
        firstName: row.first_name,
        lastName: row.last_name,
        avatar: row.avatar_url,
        bio: row.bio,
        preferredCategories: [], // Will be loaded separately
        availability: {
          status: 'offline',
          schedule: [],
          timezone: 'UTC'
        },
        rating: row.rating || 0,
        completedTasks: row.completed_tasks || 0,
        totalEarnings: row.total_earnings || 0,
        badges: []
      }
    };
  }

  async createWithProfile(userData: UserRegistrationData): Promise<UserWithProfile> {
    return await this.transaction(async (client) => {
      // Create user
      const userResult = await client.query(`
        INSERT INTO users (email, phone_number, password_hash, user_type, verification_status)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING *
      `, [
        userData.email,
        userData.phoneNumber,
        userData.passwordHash,
        userData.userType,
        'pending'
      ]);

      const user = userResult.rows[0];

      // Create user profile
      await client.query(`
        INSERT INTO user_profiles (user_id, first_name, last_name, bio)
        VALUES ($1, $2, $3, $4)
      `, [
        user.id,
        userData.firstName,
        userData.lastName,
        userData.bio || null
      ]);

      // Create user availability
      await client.query(`
        INSERT INTO user_availability (user_id, status, timezone)
        VALUES ($1, $2, $3)
      `, [user.id, 'offline', 'UTC']);

      return await this.findWithProfile(user.id) as UserWithProfile;
    });
  }

  async updateProfile(userId: string, profileData: UserProfileUpdateData): Promise<UserProfile | null> {
    const columns = Object.keys(profileData);
    const values = Object.values(profileData);
    
    if (columns.length === 0) return null;

    const setClause = columns.map((col, index) => `${col} = $${index + 1}`).join(',');
    
    const result = await this.query(`
      UPDATE user_profiles
      SET ${setClause}, updated_at = NOW()
      WHERE user_id = $${columns.length + 1}
      RETURNING *
    `, [...values, userId]);

    if (result.rows.length === 0) return null;

    const row = result.rows[0];
    return {
      firstName: row.first_name,
      lastName: row.last_name,
      avatar: row.avatar_url,
      bio: row.bio,
      preferredCategories: [], // Will be loaded separately
      availability: {
        status: 'offline',
        schedule: [],
        timezone: 'UTC'
      },
      rating: row.rating || 0,
      completedTasks: row.completed_tasks || 0,
      totalEarnings: row.total_earnings || 0,
      badges: []
    };
  }

  async updateVerificationStatus(userId: string, status: VerificationStatus): Promise<boolean> {
    const result = await this.query(`
      UPDATE users
      SET verification_status = $1, updated_at = NOW()
      WHERE id = $2
    `, [status, userId]);

    return result.rowCount > 0;
  }

  async updatePassword(userId: string, passwordHash: string): Promise<boolean> {
    const result = await this.query(`
      UPDATE users
      SET password_hash = $1, updated_at = NOW()
      WHERE id = $2
    `, [passwordHash, userId]);

    return result.rowCount > 0;
  }

  async findTaskersByLocation(
    centerLat: number,
    centerLng: number,
    radiusKm: number,
    limit: number = 50
  ): Promise<User[]> {
    const result = await this.query(`
      SELECT DISTINCT u.*
      FROM users u
      INNER JOIN user_availability ua ON u.id = ua.user_id
      INNER JOIN tasker_locations tl ON u.id = tl.tasker_id
      WHERE u.user_type IN ('tasker', 'both')
        AND ua.status = 'online'
        AND tl.is_active = true
        AND ST_DWithin(
          tl.location,
          ST_GeomFromText($1, 4326),
          $2
        )
      ORDER BY ST_Distance(
        tl.location,
        ST_GeomFromText($1, 4326)
      )
      LIMIT $3
    `, [
      `POINT(${centerLng} ${centerLat})`,
      radiusKm * 1000, // Convert km to meters
      limit
    ]);

    return result.rows;
  }

  async findTaskersByCategory(
    category: string,
    centerLat: number,
    centerLng: number,
    radiusKm: number,
    limit: number = 50
  ): Promise<User[]> {
    const result = await this.query(`
      SELECT DISTINCT u.*
      FROM users u
      INNER JOIN user_availability ua ON u.id = ua.user_id
      INNER JOIN tasker_locations tl ON u.id = tl.tasker_id
      INNER JOIN user_preferred_categories upc ON u.id = upc.user_id
      WHERE u.user_type IN ('tasker', 'both')
        AND ua.status = 'online'
        AND tl.is_active = true
        AND upc.category = $1
        AND ST_DWithin(
          tl.location,
          ST_GeomFromText($2, 4326),
          $3
        )
      ORDER BY ST_Distance(
        tl.location,
        ST_GeomFromText($2, 4326)
      )
      LIMIT $4
    `, [
      category,
      `POINT(${centerLng} ${centerLat})`,
      radiusKm * 1000,
      limit
    ]);

    return result.rows;
  }

  async getUserPreferredCategories(userId: string): Promise<string[]> {
    const result = await this.query(`
      SELECT category
      FROM user_preferred_categories
      WHERE user_id = $1
      ORDER BY created_at
    `, [userId]);

    return result.rows.map(row => row.category);
  }

  async setUserPreferredCategories(userId: string, categories: string[]): Promise<void> {
    await this.transaction(async (client) => {
      // Remove existing categories
      await client.query(`
        DELETE FROM user_preferred_categories
        WHERE user_id = $1
      `, [userId]);

      // Add new categories
      if (categories.length > 0) {
        const values = categories.map((_, index) => 
          `($1, $${index + 2})`
        ).join(',');
        
        const params = [userId, ...categories];
        
        await client.query(`
          INSERT INTO user_preferred_categories (user_id, category)
          VALUES ${values}
        `, params);
      }
    });
  }

  async updateAvailabilityStatus(userId: string, status: string): Promise<boolean> {
    const result = await this.query(`
      UPDATE user_availability
      SET status = $1, updated_at = NOW()
      WHERE user_id = $2
    `, [status, userId]);

    return result.rowCount > 0;
  }

  async getAvailabilityStatus(userId: string): Promise<string | null> {
    const result = await this.query(`
      SELECT status
      FROM user_availability
      WHERE user_id = $1
    `, [userId]);

    return result.rows[0]?.status || null;
  }

  async findUsersByVerificationStatus(status: VerificationStatus): Promise<User[]> {
    return await this.findMany('verification_status = $1', [status]);
  }

  async findUsersByType(userType: UserType): Promise<User[]> {
    return await this.findMany('user_type = $1', [userType]);
  }

  async searchUsers(searchTerm: string, limit: number = 20): Promise<User[]> {
    const result = await this.query(`
      SELECT u.*
      FROM users u
      LEFT JOIN user_profiles up ON u.id = up.user_id
      WHERE u.email ILIKE $1
         OR up.first_name ILIKE $1
         OR up.last_name ILIKE $1
         OR u.phone_number ILIKE $1
      ORDER BY u.created_at DESC
      LIMIT $2
    `, [`%${searchTerm}%`, limit]);

    return result.rows;
  }

  async getUserStats(userId: string): Promise<{
    totalTasks: number;
    completedTasks: number;
    averageRating: number;
    totalEarnings: number;
  }> {
    const result = await this.query(`
      SELECT 
        up.completed_tasks as total_tasks,
        up.completed_tasks,
        up.rating as average_rating,
        up.total_earnings
      FROM user_profiles up
      WHERE up.user_id = $1
    `, [userId]);

    const stats = result.rows[0];
    return {
      totalTasks: stats?.total_tasks || 0,
      completedTasks: stats?.completed_tasks || 0,
      averageRating: stats?.average_rating || 0,
      totalEarnings: stats?.total_earnings || 0
    };
  }

  async deleteUser(userId: string): Promise<boolean> {
    return await this.transaction(async (client) => {
      // Delete user and all related data (cascade will handle most)
      const result = await client.query(`
        DELETE FROM users WHERE id = $1
      `, [userId]);

      return result.rowCount > 0;
    });
  }
}

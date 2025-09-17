import { getPostgresPool } from '../config/database';
import { logger } from '../utils/logger';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';

interface SeedData {
  users: any[];
  userProfiles: any[];
  tasks: any[];
  taskLocations: any[];
}

class DatabaseSeeder {
  private pool = getPostgresPool();

  async clearDatabase(): Promise<void> {
    const tables = [
      'user_ratings',
      'notifications',
      'payments',
      'payment_methods',
      'route_tracking',
      'tasker_locations',
      'task_assignments',
      'task_requirements',
      'task_locations',
      'tasks',
      'user_preferred_categories',
      'availability_schedule',
      'user_availability',
      'user_profiles',
      'users'
    ];

    for (const table of tables) {
      await this.pool.query(`TRUNCATE TABLE ${table} RESTART IDENTITY CASCADE`);
    }

    logger.info('Database cleared');
  }

  async seedUsers(): Promise<any[]> {
    const users = [
      {
        id: uuidv4(),
        email: 'john.doe@example.com',
        phone_number: '+1234567890',
        password_hash: await bcrypt.hash('password123', 12),
        user_type: 'requester',
        verification_status: 'verified'
      },
      {
        id: uuidv4(),
        email: 'jane.smith@example.com',
        phone_number: '+1234567891',
        password_hash: await bcrypt.hash('password123', 12),
        user_type: 'tasker',
        verification_status: 'verified'
      },
      {
        id: uuidv4(),
        email: 'mike.johnson@example.com',
        phone_number: '+1234567892',
        password_hash: await bcrypt.hash('password123', 12),
        user_type: 'both',
        verification_status: 'verified'
      },
      {
        id: uuidv4(),
        email: 'sarah.wilson@example.com',
        phone_number: '+1234567893',
        password_hash: await bcrypt.hash('password123', 12),
        user_type: 'tasker',
        verification_status: 'verified'
      }
    ];

    for (const user of users) {
      await this.pool.query(
        `INSERT INTO users (id, email, phone_number, password_hash, user_type, verification_status)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [user.id, user.email, user.phone_number, user.password_hash, user.user_type, user.verification_status]
      );
    }

    logger.info(`Seeded ${users.length} users`);
    return users;
  }

  async seedUserProfiles(users: any[]): Promise<any[]> {
    const profiles = [
      {
        user_id: users[0].id,
        first_name: 'John',
        last_name: 'Doe',
        bio: 'I need help with various tasks around the city.',
        rating: 0.00,
        completed_tasks: 0,
        total_earnings: 0.00
      },
      {
        user_id: users[1].id,
        first_name: 'Jane',
        last_name: 'Smith',
        bio: 'Experienced tasker available for shopping, delivery, and errands.',
        rating: 4.8,
        completed_tasks: 25,
        total_earnings: 450.00
      },
      {
        user_id: users[2].id,
        first_name: 'Mike',
        last_name: 'Johnson',
        bio: 'Flexible worker who can both request and complete tasks.',
        rating: 4.5,
        completed_tasks: 15,
        total_earnings: 300.00
      },
      {
        user_id: users[3].id,
        first_name: 'Sarah',
        last_name: 'Wilson',
        bio: 'Reliable tasker specializing in pharmacy and post office runs.',
        rating: 4.9,
        completed_tasks: 40,
        total_earnings: 720.00
      }
    ];

    for (const profile of profiles) {
      await this.pool.query(
        `INSERT INTO user_profiles (user_id, first_name, last_name, bio, rating, completed_tasks, total_earnings)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [profile.user_id, profile.first_name, profile.last_name, profile.bio, profile.rating, profile.completed_tasks, profile.total_earnings]
      );
    }

    logger.info(`Seeded ${profiles.length} user profiles`);
    return profiles;
  }

  async seedUserAvailability(users: any[]): Promise<void> {
    for (const user of users) {
      await this.pool.query(
        `INSERT INTO user_availability (user_id, status, timezone)
         VALUES ($1, $2, $3)`,
        [user.id, 'online', 'America/New_York']
      );
    }

    logger.info(`Seeded user availability for ${users.length} users`);
  }

  async seedUserPreferredCategories(users: any[]): Promise<void> {
    const categories = ['shopping', 'pickup_delivery', 'pharmacy', 'post_office', 'pet_care', 'waiting_services', 'errands'];
    
    for (const user of users) {
      if (user.user_type === 'tasker' || user.user_type === 'both') {
        // Randomly assign 2-4 categories to each tasker
        const numCategories = Math.floor(Math.random() * 3) + 2;
        const userCategories = categories.sort(() => 0.5 - Math.random()).slice(0, numCategories);
        
        for (const category of userCategories) {
          await this.pool.query(
            `INSERT INTO user_preferred_categories (user_id, category)
             VALUES ($1, $2)`,
            [user.id, category]
          );
        }
      }
    }

    logger.info('Seeded user preferred categories');
  }

  async seedTasks(users: any[]): Promise<any[]> {
    const requester = users.find(u => u.user_type === 'requester' || u.user_type === 'both');
    if (!requester) {
      throw new Error('No requester user found for seeding tasks');
    }

    const tasks = [
      {
        id: uuidv4(),
        requester_id: requester.id,
        title: 'Grocery Shopping at Whole Foods',
        description: 'Need someone to pick up groceries from Whole Foods. List will be provided via app.',
        category: 'shopping',
        compensation: 25.00,
        deadline: new Date(Date.now() + 2 * 60 * 60 * 1000), // 2 hours from now
        status: 'posted',
        is_urgent: false,
        estimated_duration: 60
      },
      {
        id: uuidv4(),
        requester_id: requester.id,
        title: 'Package Pickup from UPS Store',
        description: 'Pick up a package from UPS Store on Main Street and deliver to my office.',
        category: 'pickup_delivery',
        compensation: 15.00,
        deadline: new Date(Date.now() + 4 * 60 * 60 * 1000), // 4 hours from now
        status: 'posted',
        is_urgent: false,
        estimated_duration: 30
      },
      {
        id: uuidv4(),
        requester_id: requester.id,
        title: 'Pharmacy Run - Prescription Pickup',
        description: 'Pick up prescription medication from CVS Pharmacy. ID verification required.',
        category: 'pharmacy',
        compensation: 20.00,
        deadline: new Date(Date.now() + 6 * 60 * 60 * 1000), // 6 hours from now
        status: 'posted',
        is_urgent: true,
        estimated_duration: 45
      }
    ];

    for (const task of tasks) {
      await this.pool.query(
        `INSERT INTO tasks (id, requester_id, title, description, category, compensation, deadline, status, is_urgent, estimated_duration)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [task.id, task.requester_id, task.title, task.description, task.category, task.compensation, task.deadline, task.status, task.is_urgent, task.estimated_duration]
      );
    }

    logger.info(`Seeded ${tasks.length} tasks`);
    return tasks;
  }

  async seedTaskLocations(tasks: any[]): Promise<void> {
    const locations = [
      {
        task_id: tasks[0].id,
        pickup_location: 'POINT(-74.0059 40.7128)', // New York City coordinates
        pickup_address: 'Whole Foods Market, 250 7th Ave, New York, NY 10001',
        delivery_location: 'POINT(-74.0060 40.7129)',
        delivery_address: '123 Main St, New York, NY 10001'
      },
      {
        task_id: tasks[1].id,
        pickup_location: 'POINT(-74.0058 40.7127)',
        pickup_address: 'UPS Store, 456 Oak St, New York, NY 10002',
        delivery_location: 'POINT(-74.0061 40.7130)',
        delivery_address: '789 Business Ave, New York, NY 10003'
      },
      {
        task_id: tasks[2].id,
        pickup_location: 'POINT(-74.0057 40.7126)',
        pickup_address: 'CVS Pharmacy, 321 Pine St, New York, NY 10004',
        delivery_location: 'POINT(-74.0062 40.7131)',
        delivery_address: '456 Residential Rd, New York, NY 10005'
      }
    ];

    for (const location of locations) {
      await this.pool.query(
        `INSERT INTO task_locations (task_id, pickup_location, pickup_address, delivery_location, delivery_address)
         VALUES ($1, ST_GeomFromText($2, 4326), $3, ST_GeomFromText($4, 4326), $5)`,
        [location.task_id, location.pickup_location, location.pickup_address, location.delivery_location, location.delivery_address]
      );
    }

    logger.info(`Seeded ${locations.length} task locations`);
  }

  async seedTaskerLocations(users: any[]): Promise<void> {
    const taskers = users.filter(u => u.user_type === 'tasker' || u.user_type === 'both');
    
    for (const tasker of taskers) {
      // Random locations around New York City
      const lat = 40.7128 + (Math.random() - 0.5) * 0.1;
      const lng = -74.0059 + (Math.random() - 0.5) * 0.1;
      
      await this.pool.query(
        `INSERT INTO tasker_locations (tasker_id, location, is_active, accuracy)
         VALUES ($1, ST_GeomFromText($2, 4326), $3, $4)
         ON CONFLICT (tasker_id) DO UPDATE SET
         location = ST_GeomFromText($2, 4326),
         last_updated = NOW(),
         is_active = $3,
         accuracy = $4`,
        [tasker.id, `POINT(${lng} ${lat})`, true, 5.0]
      );
    }

    logger.info(`Seeded tasker locations for ${taskers.length} taskers`);
  }

  async seed(): Promise<void> {
    try {
      logger.info('Starting database seeding...');
      
      await this.clearDatabase();
      
      const users = await this.seedUsers();
      await this.seedUserProfiles(users);
      await this.seedUserAvailability(users);
      await this.seedUserPreferredCategories(users);
      
      const tasks = await this.seedTasks(users);
      await this.seedTaskLocations(tasks);
      await this.seedTaskerLocations(users);
      
      logger.info('Database seeding completed successfully');
    } catch (error) {
      logger.error('Database seeding failed', error);
      throw error;
    }
  }
}

// CLI interface
async function main() {
  const seeder = new DatabaseSeeder();
  
  try {
    await seeder.seed();
    process.exit(0);
  } catch (error) {
    logger.error('Seeding failed', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

export { DatabaseSeeder };

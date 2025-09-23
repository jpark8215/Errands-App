import { execSync } from 'child_process';

export default async function globalSetup() {
  console.log('Setting up test environment...');
  
  // Set test environment variables
  process.env.NODE_ENV = 'test';
  process.env.DB_NAME = 'errands_buddy_test';
  process.env.REDIS_URL = 'redis://localhost:6379/1'; // Use database 1 for tests
  
  try {
    // Create test database if it doesn't exist
    execSync('createdb errands_buddy_test', { stdio: 'ignore' });
  } catch (error) {
    // Database might already exist, ignore error
  }
  
  console.log('Test environment setup complete');
}

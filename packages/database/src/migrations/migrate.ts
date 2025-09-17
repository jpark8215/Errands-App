import { getPostgresPool } from '../config/database';
import { logger } from '../utils/logger';
import { readdir, readFile } from 'fs/promises';
import { join } from 'path';

interface Migration {
  version: string;
  name: string;
  up: string;
  down: string;
}

class MigrationManager {
  private pool = getPostgresPool();

  async createMigrationsTable(): Promise<void> {
    const createTableQuery = `
      CREATE TABLE IF NOT EXISTS migrations (
        id SERIAL PRIMARY KEY,
        version VARCHAR(255) NOT NULL UNIQUE,
        name VARCHAR(255) NOT NULL,
        executed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `;

    await this.pool.query(createTableQuery);
    logger.info('Migrations table created/verified');
  }

  async getExecutedMigrations(): Promise<string[]> {
    const result = await this.pool.query('SELECT version FROM migrations ORDER BY version');
    return result.rows.map(row => row.version);
  }

  async loadMigrations(): Promise<Migration[]> {
    const migrationsDir = join(__dirname, 'files');
    const files = await readdir(migrationsDir);
    const migrationFiles = files.filter(file => file.endsWith('.sql'));

    const migrations: Migration[] = [];

    for (const file of migrationFiles) {
      const content = await readFile(join(migrationsDir, file), 'utf-8');
      const [up, down] = content.split('-- DOWN');
      
      const version = file.split('_')[0];
      const name = file.replace('.sql', '').replace(`${version}_`, '');

      migrations.push({
        version,
        name,
        up: up.replace('-- UP', '').trim(),
        down: down?.trim() || ''
      });
    }

    return migrations.sort((a, b) => a.version.localeCompare(b.version));
  }

  async executeMigration(migration: Migration): Promise<void> {
    const client = await this.pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Execute the migration
      await client.query(migration.up);
      
      // Record the migration
      await client.query(
        'INSERT INTO migrations (version, name) VALUES ($1, $2)',
        [migration.version, migration.name]
      );
      
      await client.query('COMMIT');
      logger.info(`Migration ${migration.version}_${migration.name} executed successfully`);
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error(`Migration ${migration.version}_${migration.name} failed`, error);
      throw error;
    } finally {
      client.release();
    }
  }

  async rollbackMigration(migration: Migration): Promise<void> {
    const client = await this.pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Execute the rollback
      if (migration.down) {
        await client.query(migration.down);
      }
      
      // Remove the migration record
      await client.query('DELETE FROM migrations WHERE version = $1', [migration.version]);
      
      await client.query('COMMIT');
      logger.info(`Migration ${migration.version}_${migration.name} rolled back successfully`);
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error(`Rollback of migration ${migration.version}_${migration.name} failed`, error);
      throw error;
    } finally {
      client.release();
    }
  }

  async migrate(): Promise<void> {
    try {
      await this.createMigrationsTable();
      
      const executedMigrations = await this.getExecutedMigrations();
      const allMigrations = await this.loadMigrations();
      
      const pendingMigrations = allMigrations.filter(
        migration => !executedMigrations.includes(migration.version)
      );

      if (pendingMigrations.length === 0) {
        logger.info('No pending migrations');
        return;
      }

      logger.info(`Found ${pendingMigrations.length} pending migrations`);

      for (const migration of pendingMigrations) {
        await this.executeMigration(migration);
      }

      logger.info('All migrations completed successfully');
    } catch (error) {
      logger.error('Migration failed', error);
      throw error;
    }
  }

  async rollback(count: number = 1): Promise<void> {
    try {
      const executedMigrations = await this.getExecutedMigrations();
      const allMigrations = await this.loadMigrations();
      
      const executedMigrationsList = allMigrations.filter(
        migration => executedMigrations.includes(migration.version)
      );

      const migrationsToRollback = executedMigrationsList
        .slice(-count)
        .reverse();

      if (migrationsToRollback.length === 0) {
        logger.info('No migrations to rollback');
        return;
      }

      logger.info(`Rolling back ${migrationsToRollback.length} migrations`);

      for (const migration of migrationsToRollback) {
        await this.rollbackMigration(migration);
      }

      logger.info('Rollback completed successfully');
    } catch (error) {
      logger.error('Rollback failed', error);
      throw error;
    }
  }
}

// CLI interface
async function main() {
  const command = process.argv[2];
  const migrationManager = new MigrationManager();

  try {
    switch (command) {
      case 'up':
        await migrationManager.migrate();
        break;
      case 'down':
        const count = parseInt(process.argv[3]) || 1;
        await migrationManager.rollback(count);
        break;
      default:
        console.log('Usage: npm run migrate [up|down] [count]');
        process.exit(1);
    }
  } catch (error) {
    logger.error('Migration command failed', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

export { MigrationManager };

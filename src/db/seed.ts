/**
 * @file Database development seeding script inserting initial administrative and test user fixtures.
 * @module src/db/seed
 */

import argon2 from 'argon2';
import pino from 'pino';
import { generateId } from '#src/lib/id.js';
import { createDbClient } from './client.js';
import { users } from './schema.js';

const logger = pino({ name: 'db-seed' });

/**
 * Inserts default seed fixtures (admin and standard user) into PostgreSQL if they do not already exist.
 *
 * @returns Resolves when database seeding completes
 */
export async function runSeed(): Promise<void> {
  const client = createDbClient();
  logger.info('Seeding database...');

  try {
    const adminPassword = await argon2.hash('AdminSecret123!');
    const userPassword = await argon2.hash('UserSecret123!');

    await client.drizzle
      .insert(users)
      .values([
        {
          id: generateId('usr'),
          email: 'admin@example.com',
          passwordHash: adminPassword,
          role: 'admin',
          emailVerified: true,
        },
        {
          id: generateId('usr'),
          email: 'user@example.com',
          passwordHash: userPassword,
          role: 'user',
          emailVerified: true,
        },
      ])
      .onConflictDoNothing({ target: users.email });

    logger.info('Seed completed successfully: created admin and standard users.');
  } catch (err) {
    logger.error({ err }, 'Database seeding failed');
    process.exit(1);
  } finally {
    await client.close();
  }
}

runSeed();

/**
 * @file Testcontainers helper utilities managing ephemeral Postgres and Redis test containers.
 * @module test/helpers/containers
 */

import { GenericContainer, type StartedTestContainer, Wait } from 'testcontainers';

/** Suite holding started container instances and connection URIs. */
export interface TestContainersSuite {
  postgres?: StartedTestContainer;
  redis?: StartedTestContainer;
  postgresUri?: string;
  redisUri?: string;
}

/**
 * Checks if a Docker daemon is reachable in the current environment.
 *
 * @returns True if Docker is running and capable of starting containers.
 */
export async function isDockerAvailable(): Promise<boolean> {
  try {
    const container = await new GenericContainer('alpine:latest')
      .withCommand(['echo', 'hello'])
      .start();
    await container.stop();
    return true;
  } catch {
    return false;
  }
}

/**
 * Starts a real PostgreSQL container for integration testing.
 *
 * @returns Container instance and connection URI.
 */
export async function startPostgresContainer(): Promise<{
  container: StartedTestContainer;
  connectionUri: string;
}> {
  const container = await new GenericContainer('postgres:16-alpine')
    .withEnvironment({
      POSTGRES_USER: 'test_user',
      POSTGRES_PASSWORD: 'test_password',
      POSTGRES_DB: 'test_db',
    })
    .withExposedPorts(5432)
    .withWaitStrategy(Wait.forLogMessage(/database system is ready to accept connections/))
    .start();

  const host = container.getHost();
  const port = container.getMappedPort(5432);
  const connectionUri = `postgresql://test_user:test_password@${host}:${port}/test_db`;

  return { container, connectionUri };
}

/**
 * Starts a real Redis container for integration testing.
 *
 * @returns Container instance and connection URI.
 */
export async function startRedisContainer(): Promise<{
  container: StartedTestContainer;
  connectionUri: string;
}> {
  const container = await new GenericContainer('redis:7-alpine')
    .withExposedPorts(6379)
    .withWaitStrategy(Wait.forLogMessage(/Ready to accept connections/))
    .start();

  const host = container.getHost();
  const port = container.getMappedPort(6379);
  const connectionUri = `redis://${host}:${port}`;

  return { container, connectionUri };
}

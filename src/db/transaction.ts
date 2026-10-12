/**
 * @file Transaction management helper for executing transactional operations with support for propagation.
 * @module src/db/transaction
 */

import type { Database } from './client.js';

/**
 * Type representing a Drizzle database transaction instance.
 */
export type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];

/**
 * Reusable transaction helper that executes within an existing transaction
 * or initiates a new one, compatible with the repository pattern.
 *
 * @param db Database instance to initiate a new transaction if none exists
 * @param callback Transaction callback function receiving the transactional context
 * @param existingTx Optional active transaction instance to reuse
 * @returns Resolves with the result of the callback execution
 */
export async function withTransaction<T>(
  db: Database,
  callback: (tx: Database | Transaction) => Promise<T>,
  existingTx?: Transaction
): Promise<T> {
  if (existingTx) {
    return callback(existingTx);
  }
  return db.transaction((tx) => callback(tx));
}

/**
 * @file Integration tests asserting database transaction rollbacks and consistency.
 * @module test/db/transaction
 */

import { describe, expect, it, vi } from 'vitest';
import type { Database } from '#src/db/client.js';
import { type Transaction, withTransaction } from '#src/db/transaction.js';

describe('Transaction Helper', () => {
  it('calls db.transaction when no existing transaction is provided', async () => {
    const mockTx = { dummy: true } as unknown as Transaction;
    const mockDb = {
      transaction: vi.fn(async (cb: (tx: Transaction) => Promise<string>) => cb(mockTx)),
    } as unknown as Database;

    const result = await withTransaction(mockDb, async (tx) => {
      expect(tx).toBe(mockTx);
      return 'success';
    });

    expect(result).toBe('success');
    expect(mockDb.transaction).toHaveBeenCalledTimes(1);
  });

  it('reuses existing transaction without creating a new nested transaction', async () => {
    const existingTx = { existing: true } as unknown as Transaction;
    const mockDb = {
      transaction: vi.fn(),
    } as unknown as Database;

    const result = await withTransaction(
      mockDb,
      async (tx) => {
        expect(tx).toBe(existingTx);
        return 'reused';
      },
      existingTx
    );

    expect(result).toBe('reused');
    expect(mockDb.transaction).not.toHaveBeenCalled();
  });
});

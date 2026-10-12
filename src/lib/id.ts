/**
 * @file Identifier generator creating lexicographically sortable unique IDs.
 * @module src/lib/id
 */

import { ulid } from 'ulid';

/**
 * Generates a sortable, unique identifier formatted with an optional lowercase prefix.
 *
 * @param prefix Optional prefix string prepended to the generated ULID
 * @returns Formatted lowercase unique identifier string
 * @example
 * ```ts
 * const userId = generateId('usr'); // 'usr_01h2xcejqtf2n...'
 * const genericId = generateId();   // '01h2xcejqtf2n...'
 * ```
 */
export function generateId(prefix?: string): string {
  const id = ulid().toLowerCase();
  return prefix ? `${prefix}_${id}` : id;
}

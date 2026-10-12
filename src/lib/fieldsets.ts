/**
 * @file Sparse fieldsets and relation inclusion query utilities.
 * @module lib/fieldsets
 */

import { BadRequestError } from './errors.js';

/**
 * Parses and validates requested projection fields against allowlist.
 *
 * @param fieldsParam Comma-delimited list or array of field names.
 * @param allowedFields Whitelisted field names permitted for projection.
 * @returns Array of validated field names, or undefined if no projection was requested.
 * @throws BadRequestError when an unwhitelisted field is requested.
 * @example
 * ```ts
 * const fields = parseFieldsets('id,email', ['id', 'email', 'role']);
 * ```
 */
export function parseFieldsets(
  fieldsParam: string | string[] | undefined,
  allowedFields: readonly string[]
): string[] | undefined {
  if (!fieldsParam) return undefined;

  const rawFields = Array.isArray(fieldsParam) ? fieldsParam.join(',') : fieldsParam;
  const requested = rawFields
    .split(',')
    .map((f) => f.trim())
    .filter(Boolean);

  if (requested.length === 0) return undefined;

  for (const field of requested) {
    if (!allowedFields.includes(field)) {
      throw new BadRequestError(
        `Field '${field}' is not allowed in sparse fieldset. Allowed fields: ${allowedFields.join(', ')}`
      );
    }
  }

  return requested;
}

/**
 * Projects only selected fields from a single object record.
 *
 * @param record Source entity record.
 * @param fields Optional array of whitelisted field names to retain.
 * @returns Projected record subset.
 * @example
 * ```ts
 * const user = applySparseFieldset({ id: '1', email: 'a@b.c', secret: 'xyz' }, ['id', 'email']);
 * ```
 */
export function applySparseFieldset<T extends Record<string, unknown>>(
  record: T,
  fields?: readonly string[]
): Partial<T> {
  if (!fields || fields.length === 0) {
    return record;
  }

  const result: Partial<T> = {};
  for (const field of fields) {
    if (field in record) {
      result[field as keyof T] = record[field as keyof T];
    }
  }

  return result;
}

/**
 * Projects only selected fields from an array of records.
 *
 * @param records Array of entity records.
 * @param fields Optional array of whitelisted field names to retain.
 * @returns Array of projected record subsets.
 */
export function applySparseFieldsets<T extends Record<string, unknown>>(
  records: T[],
  fields?: readonly string[]
): Partial<T>[] {
  if (!fields || fields.length === 0) {
    return records;
  }
  return records.map((r) => applySparseFieldset(r, fields));
}

/**
 * Parses and validates relationship expansion names against allowlist.
 *
 * @param includeParam Comma-delimited list or array of relationship names.
 * @param allowedIncludes Whitelisted relation names permitted for expansion.
 * @returns Array of validated relation names.
 * @throws BadRequestError when an unwhitelisted relation name is requested.
 */
export function parseRelationIncludes(
  includeParam: string | string[] | undefined,
  allowedIncludes: readonly string[]
): string[] {
  if (!includeParam) return [];

  const raw = Array.isArray(includeParam) ? includeParam.join(',') : includeParam;
  const requested = raw
    .split(',')
    .map((r) => r.trim())
    .filter(Boolean);

  for (const inc of requested) {
    if (!allowedIncludes.includes(inc)) {
      throw new BadRequestError(
        `Relation '${inc}' is not allowed in relation expansion. Allowed relations: ${allowedIncludes.join(', ')}`
      );
    }
  }

  return requested;
}

/**
 * @file Database schema definitions and relational mappings for PostgreSQL.
 * @module db/schema
 */

import { relations } from 'drizzle-orm';
import { bigint, boolean, index, pgTable, text, timestamp, varchar } from 'drizzle-orm/pg-core';

/**
 * Users table storing user identity, roles, and status flags.
 */
export const users = pgTable(
  'users',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    email: varchar('email', { length: 255 }).notNull().unique(),
    passwordHash: text('password_hash').notNull(),
    role: varchar('role', { length: 32 }).notNull().default('user'),
    emailVerified: boolean('email_verified').notNull().default(false),
    avatarUrl: text('avatar_url'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => [
    index('users_email_idx').on(table.email),
    index('users_deleted_at_idx').on(table.deletedAt),
  ]
);

/**
 * Refresh tokens table supporting token rotation and family tracking.
 */
export const refreshTokens = pgTable(
  'refresh_tokens',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    userId: varchar('user_id', { length: 36 })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull().unique(),
    family: varchar('family', { length: 64 }).notNull(),
    isRevoked: boolean('is_revoked').notNull().default(false),
    userAgent: varchar('user_agent', { length: 512 }),
    ipAddress: varchar('ip_address', { length: 64 }),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('refresh_tokens_user_id_idx').on(table.userId),
    index('refresh_tokens_family_idx').on(table.family),
  ]
);

/**
 * Email verification tokens table.
 */
export const emailVerificationTokens = pgTable(
  'email_verification_tokens',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    userId: varchar('user_id', { length: 36 })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull().unique(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('email_verif_user_id_idx').on(table.userId),
    index('email_verif_token_hash_idx').on(table.tokenHash),
  ]
);

/**
 * Password reset tokens table.
 */
export const passwordResetTokens = pgTable(
  'password_reset_tokens',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    userId: varchar('user_id', { length: 36 })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull().unique(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('pwd_reset_user_id_idx').on(table.userId),
    index('pwd_reset_token_hash_idx').on(table.tokenHash),
  ]
);

/**
 * Uploaded files and metadata records table.
 */
export const files = pgTable(
  'files',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    ownerId: varchar('owner_id', { length: 36 })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    key: varchar('key', { length: 512 }).notNull().unique(),
    bucket: varchar('bucket', { length: 255 }).notNull(),
    originalName: varchar('original_name', { length: 255 }).notNull(),
    mimeType: varchar('mime_type', { length: 128 }).notNull(),
    size: bigint('size', { mode: 'number' }).notNull(),
    checksum: varchar('checksum', { length: 64 }).notNull(),
    status: varchar('status', { length: 32 }).notNull().default('pending'),
    visibility: varchar('visibility', { length: 32 }).notNull().default('private'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => [
    index('files_owner_id_idx').on(table.ownerId),
    index('files_key_idx').on(table.key),
    index('files_status_idx').on(table.status),
    index('files_deleted_at_idx').on(table.deletedAt),
  ]
);

/**
 * API keys table storing hashed tokens and access scopes.
 */
export const apiKeys = pgTable(
  'api_keys',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    userId: varchar('user_id', { length: 36 })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 255 }).notNull(),
    keyHash: text('key_hash').notNull().unique(),
    prefix: varchar('prefix', { length: 16 }).notNull(),
    scopes: text('scopes').notNull().default('["*"]'),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('api_keys_user_id_idx').on(table.userId),
    index('api_keys_prefix_idx').on(table.prefix),
    index('api_keys_key_hash_idx').on(table.keyHash),
  ]
);

/**
 * Relational navigation from users to associated tokens, files, and API keys.
 */
export const usersRelations = relations(users, ({ many }) => ({
  refreshTokens: many(refreshTokens),
  emailVerificationTokens: many(emailVerificationTokens),
  passwordResetTokens: many(passwordResetTokens),
  files: many(files),
  apiKeys: many(apiKeys),
}));

/**
 * Relational navigation from refresh tokens back to the user owner.
 */
export const refreshTokensRelations = relations(refreshTokens, ({ one }) => ({
  user: one(users, {
    fields: [refreshTokens.userId],
    references: [users.id],
  }),
}));

/**
 * Relational navigation from files back to the user owner.
 */
export const filesRelations = relations(files, ({ one }) => ({
  owner: one(users, {
    fields: [files.ownerId],
    references: [users.id],
  }),
}));

/**
 * Relational navigation from API keys back to the user owner.
 */
export const apiKeysRelations = relations(apiKeys, ({ one }) => ({
  user: one(users, {
    fields: [apiKeys.userId],
    references: [users.id],
  }),
}));

/** User row selected from the database. */
export type User = typeof users.$inferSelect;
/** User payload for insertion. */
export type NewUser = typeof users.$inferInsert;

/** Refresh token row selected from the database. */
export type RefreshToken = typeof refreshTokens.$inferSelect;
/** Refresh token payload for insertion. */
export type NewRefreshToken = typeof refreshTokens.$inferInsert;

/** Email verification token row selected from the database. */
export type EmailVerificationToken = typeof emailVerificationTokens.$inferSelect;
/** Email verification token payload for insertion. */
export type NewEmailVerificationToken = typeof emailVerificationTokens.$inferInsert;

/** Password reset token row selected from the database. */
export type PasswordResetToken = typeof passwordResetTokens.$inferSelect;
/** Password reset token payload for insertion. */
export type NewPasswordResetToken = typeof passwordResetTokens.$inferInsert;

/** File record row selected from the database. */
export type FileRecord = typeof files.$inferSelect;
/** File record payload for insertion. */
export type NewFileRecord = typeof files.$inferInsert;

/** API key row selected from the database. */
export type ApiKeyRecord = typeof apiKeys.$inferSelect;
/** API key payload for insertion. */
export type NewApiKeyRecord = typeof apiKeys.$inferInsert;

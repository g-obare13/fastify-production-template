/**
 * @file PostgreSQL database repository for user credentials, tokens, and API keys.
 * @module modules/auth/repository
 */

import { and, desc, eq, gt, isNull } from 'drizzle-orm';
import type { Database } from '#src/db/client.js';
import {
  type ApiKeyRecord,
  type EmailVerificationToken,
  type NewApiKeyRecord,
  type NewEmailVerificationToken,
  type NewPasswordResetToken,
  type NewRefreshToken,
  type NewUser,
  type PasswordResetToken,
  type RefreshToken,
  type User,
  apiKeys,
  emailVerificationTokens,
  passwordResetTokens,
  refreshTokens,
  users,
} from '#src/db/schema.js';

/** Repository contract for authentication, sessions, and API key persistence. */
export interface AuthRepository {
  /**
   * Finds a user record by email address.
   *
   * @param email User email
   * @returns User entity or null if not found
   */
  findUserByEmail(email: string): Promise<User | null>;

  /**
   * Finds a user record by unique ID.
   *
   * @param id User ID
   * @returns User entity or null if not found
   */
  findUserById(id: string): Promise<User | null>;

  /**
   * Inserts a new user record.
   *
   * @param user User payload
   * @returns Created user entity
   */
  createUser(user: NewUser): Promise<User>;

  /**
   * Updates user fields by ID.
   *
   * @param id User ID
   * @param data Fields to update
   * @returns Updated user entity
   */
  updateUser(id: string, data: Partial<User>): Promise<User>;

  /**
   * Inserts a new refresh token record.
   *
   * @param token Refresh token payload
   * @returns Created refresh token entity
   */
  createRefreshToken(token: NewRefreshToken): Promise<RefreshToken>;

  /**
   * Finds a refresh token by SHA-256 token hash.
   *
   * @param hash SHA-256 token hash
   * @returns Refresh token entity or null if not found
   */
  findRefreshTokenByHash(hash: string): Promise<RefreshToken | null>;

  /**
   * Finds a refresh token by ID.
   *
   * @param id Refresh token ID
   * @returns Refresh token entity or null if not found
   */
  findRefreshTokenById(id: string): Promise<RefreshToken | null>;

  /**
   * Lists active, non-expired refresh tokens for a user.
   *
   * @param userId User ID
   * @returns Array of active refresh tokens
   */
  listActiveRefreshTokensByUserId(userId: string): Promise<RefreshToken[]>;

  /**
   * Revokes a refresh token by ID.
   *
   * @param id Refresh token ID
   * @returns Resolves when marked revoked
   */
  revokeRefreshToken(id: string): Promise<void>;

  /**
   * Revokes all refresh tokens in a token family.
   *
   * @param family Token rotation family identifier
   * @returns Resolves when marked revoked
   */
  revokeTokenFamily(family: string): Promise<void>;

  /**
   * Revokes all refresh tokens belonging to a user.
   *
   * @param userId User ID
   * @returns Resolves when all tokens are marked revoked
   */
  revokeAllUserRefreshTokens(userId: string): Promise<void>;

  /**
   * Inserts a new email verification token record.
   *
   * @param token Email verification token payload
   * @returns Created verification token entity
   */
  createVerificationToken(token: NewEmailVerificationToken): Promise<EmailVerificationToken>;

  /**
   * Finds an email verification token by hash.
   *
   * @param hash SHA-256 token hash
   * @returns Verification token entity or null if not found
   */
  findVerificationTokenByHash(hash: string): Promise<EmailVerificationToken | null>;

  /**
   * Marks an email verification token as consumed.
   *
   * @param id Verification token ID
   * @returns Resolves when updated
   */
  markVerificationTokenUsed(id: string): Promise<void>;

  /**
   * Inserts a new password reset token record.
   *
   * @param token Password reset token payload
   * @returns Created password reset token entity
   */
  createPasswordResetToken(token: NewPasswordResetToken): Promise<PasswordResetToken>;

  /**
   * Finds a password reset token by hash.
   *
   * @param hash SHA-256 token hash
   * @returns Password reset token entity or null if not found
   */
  findPasswordResetTokenByHash(hash: string): Promise<PasswordResetToken | null>;

  /**
   * Marks a password reset token as consumed.
   *
   * @param id Password reset token ID
   * @returns Resolves when updated
   */
  markPasswordResetTokenUsed(id: string): Promise<void>;

  /**
   * Inserts a new API key record.
   *
   * @param data API key payload
   * @returns Created API key entity
   */
  createApiKey(data: NewApiKeyRecord): Promise<ApiKeyRecord>;

  /**
   * Finds an active API key by hash.
   *
   * @param hash SHA-256 key hash
   * @returns API key entity or null if not found
   */
  findApiKeyByHash(hash: string): Promise<ApiKeyRecord | null>;

  /**
   * Finds an API key by ID.
   *
   * @param id API key ID
   * @returns API key entity or null if not found
   */
  findApiKeyById(id: string): Promise<ApiKeyRecord | null>;

  /**
   * Lists active API keys for a user.
   *
   * @param userId User ID
   * @returns Array of API key entities
   */
  listApiKeysByUserId(userId: string): Promise<ApiKeyRecord[]>;

  /**
   * Revokes an API key by setting revokedAt timestamp.
   *
   * @param id API key ID
   * @returns Resolves when revoked
   */
  revokeApiKey(id: string): Promise<void>;

  /**
   * Updates lastUsedAt timestamp for an API key.
   *
   * @param id API key ID
   * @returns Resolves when updated
   */
  updateApiKeyLastUsed(id: string): Promise<void>;
}

/** Drizzle ORM implementation of the authentication repository interface. */
export class DrizzleAuthRepository implements AuthRepository {
  /**
   * Initializes repository with Drizzle database instance.
   *
   * @param db Drizzle database client instance.
   */
  constructor(private readonly db: Database) {}

  /**
   * Finds a user record by email address.
   *
   * @param email User email
   * @returns User entity or null if not found
   */
  async findUserByEmail(email: string): Promise<User | null> {
    const [user] = await this.db.select().from(users).where(eq(users.email, email)).limit(1);
    return user ?? null;
  }

  /**
   * Finds a user record by unique ID.
   *
   * @param id User ID
   * @returns User entity or null if not found
   */
  async findUserById(id: string): Promise<User | null> {
    const [user] = await this.db.select().from(users).where(eq(users.id, id)).limit(1);
    return user ?? null;
  }

  /**
   * Inserts a new user record.
   *
   * @param user User payload
   * @returns Created user entity
   */
  async createUser(user: NewUser): Promise<User> {
    const [created] = await this.db.insert(users).values(user).returning();
    if (!created) throw new Error('Failed to create user record');
    return created;
  }

  /**
   * Updates user fields by ID.
   *
   * @param id User ID
   * @param data Fields to update
   * @returns Updated user entity
   */
  async updateUser(id: string, data: Partial<User>): Promise<User> {
    const [updated] = await this.db
      .update(users)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning();
    if (!updated) throw new Error('User not found to update');
    return updated;
  }

  /**
   * Inserts a new refresh token record.
   *
   * @param token Refresh token payload
   * @returns Created refresh token entity
   */
  async createRefreshToken(token: NewRefreshToken): Promise<RefreshToken> {
    const [created] = await this.db.insert(refreshTokens).values(token).returning();
    if (!created) throw new Error('Failed to create refresh token');
    return created;
  }

  /**
   * Finds a refresh token by SHA-256 token hash.
   *
   * @param hash SHA-256 token hash
   * @returns Refresh token entity or null if not found
   */
  async findRefreshTokenByHash(hash: string): Promise<RefreshToken | null> {
    const [token] = await this.db
      .select()
      .from(refreshTokens)
      .where(eq(refreshTokens.tokenHash, hash))
      .limit(1);
    return token ?? null;
  }

  /**
   * Finds a refresh token by ID.
   *
   * @param id Refresh token ID
   * @returns Refresh token entity or null if not found
   */
  async findRefreshTokenById(id: string): Promise<RefreshToken | null> {
    const [token] = await this.db
      .select()
      .from(refreshTokens)
      .where(eq(refreshTokens.id, id))
      .limit(1);
    return token ?? null;
  }

  /**
   * Lists active, non-expired refresh tokens for a user.
   *
   * @param userId User ID
   * @returns Array of active refresh tokens
   */
  async listActiveRefreshTokensByUserId(userId: string): Promise<RefreshToken[]> {
    return this.db
      .select()
      .from(refreshTokens)
      .where(
        and(
          eq(refreshTokens.userId, userId),
          eq(refreshTokens.isRevoked, false),
          gt(refreshTokens.expiresAt, new Date())
        )
      )
      .orderBy(desc(refreshTokens.createdAt));
  }

  /**
   * Revokes a refresh token by ID.
   *
   * @param id Refresh token ID
   * @returns Resolves when marked revoked
   */
  async revokeRefreshToken(id: string): Promise<void> {
    await this.db.update(refreshTokens).set({ isRevoked: true }).where(eq(refreshTokens.id, id));
  }

  /**
   * Revokes all refresh tokens in a token family.
   *
   * @param family Token rotation family identifier
   * @returns Resolves when marked revoked
   */
  async revokeTokenFamily(family: string): Promise<void> {
    await this.db
      .update(refreshTokens)
      .set({ isRevoked: true })
      .where(eq(refreshTokens.family, family));
  }

  /**
   * Revokes all refresh tokens belonging to a user.
   *
   * @param userId User ID
   * @returns Resolves when all tokens are marked revoked
   */
  async revokeAllUserRefreshTokens(userId: string): Promise<void> {
    await this.db
      .update(refreshTokens)
      .set({ isRevoked: true })
      .where(eq(refreshTokens.userId, userId));
  }

  /**
   * Inserts a new email verification token record.
   *
   * @param token Email verification token payload
   * @returns Created verification token entity
   */
  async createVerificationToken(token: NewEmailVerificationToken): Promise<EmailVerificationToken> {
    const [created] = await this.db.insert(emailVerificationTokens).values(token).returning();
    if (!created) throw new Error('Failed to create email verification token');
    return created;
  }

  /**
   * Finds an email verification token by hash.
   *
   * @param hash SHA-256 token hash
   * @returns Verification token entity or null if not found
   */
  async findVerificationTokenByHash(hash: string): Promise<EmailVerificationToken | null> {
    const [token] = await this.db
      .select()
      .from(emailVerificationTokens)
      .where(eq(emailVerificationTokens.tokenHash, hash))
      .limit(1);
    return token ?? null;
  }

  /**
   * Marks an email verification token as consumed.
   *
   * @param id Verification token ID
   * @returns Resolves when updated
   */
  async markVerificationTokenUsed(id: string): Promise<void> {
    await this.db
      .update(emailVerificationTokens)
      .set({ usedAt: new Date() })
      .where(eq(emailVerificationTokens.id, id));
  }

  /**
   * Inserts a new password reset token record.
   *
   * @param token Password reset token payload
   * @returns Created password reset token entity
   */
  async createPasswordResetToken(token: NewPasswordResetToken): Promise<PasswordResetToken> {
    const [created] = await this.db.insert(passwordResetTokens).values(token).returning();
    if (!created) throw new Error('Failed to create password reset token');
    return created;
  }

  /**
   * Finds a password reset token by hash.
   *
   * @param hash SHA-256 token hash
   * @returns Password reset token entity or null if not found
   */
  async findPasswordResetTokenByHash(hash: string): Promise<PasswordResetToken | null> {
    const [token] = await this.db
      .select()
      .from(passwordResetTokens)
      .where(eq(passwordResetTokens.tokenHash, hash))
      .limit(1);
    return token ?? null;
  }

  /**
   * Marks a password reset token as consumed.
   *
   * @param id Password reset token ID
   * @returns Resolves when updated
   */
  async markPasswordResetTokenUsed(id: string): Promise<void> {
    await this.db
      .update(passwordResetTokens)
      .set({ usedAt: new Date() })
      .where(eq(passwordResetTokens.id, id));
  }

  /**
   * Inserts a new API key record.
   *
   * @param data API key payload
   * @returns Created API key entity
   */
  async createApiKey(data: NewApiKeyRecord): Promise<ApiKeyRecord> {
    const [created] = await this.db.insert(apiKeys).values(data).returning();
    if (!created) throw new Error('Failed to create API key');
    return created;
  }

  /**
   * Finds an active API key by hash.
   *
   * @param hash SHA-256 key hash
   * @returns API key entity or null if not found
   */
  async findApiKeyByHash(hash: string): Promise<ApiKeyRecord | null> {
    const [key] = await this.db
      .select()
      .from(apiKeys)
      .where(and(eq(apiKeys.keyHash, hash), isNull(apiKeys.revokedAt)))
      .limit(1);
    return key ?? null;
  }

  /**
   * Finds an API key by ID.
   *
   * @param id API key ID
   * @returns API key entity or null if not found
   */
  async findApiKeyById(id: string): Promise<ApiKeyRecord | null> {
    const [key] = await this.db.select().from(apiKeys).where(eq(apiKeys.id, id)).limit(1);
    return key ?? null;
  }

  /**
   * Lists active API keys for a user.
   *
   * @param userId User ID
   * @returns Array of API key entities
   */
  async listApiKeysByUserId(userId: string): Promise<ApiKeyRecord[]> {
    return this.db
      .select()
      .from(apiKeys)
      .where(and(eq(apiKeys.userId, userId), isNull(apiKeys.revokedAt)))
      .orderBy(desc(apiKeys.createdAt));
  }

  /**
   * Revokes an API key by setting revokedAt timestamp.
   *
   * @param id API key ID
   * @returns Resolves when revoked
   */
  async revokeApiKey(id: string): Promise<void> {
    await this.db.update(apiKeys).set({ revokedAt: new Date() }).where(eq(apiKeys.id, id));
  }

  /**
   * Updates lastUsedAt timestamp for an API key.
   *
   * @param id API key ID
   * @returns Resolves when updated
   */
  async updateApiKeyLastUsed(id: string): Promise<void> {
    await this.db.update(apiKeys).set({ lastUsedAt: new Date() }).where(eq(apiKeys.id, id));
  }
}

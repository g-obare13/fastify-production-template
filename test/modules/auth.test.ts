/**
 * @file Integration tests verifying authentication endpoints, sessions, cookies, and tokens.
 * @module test/modules/auth
 */

import { beforeEach, describe, expect, it } from 'vitest';
import type {
  EmailVerificationToken,
  NewEmailVerificationToken,
  NewPasswordResetToken,
  NewRefreshToken,
  NewUser,
  PasswordResetToken,
  RefreshToken,
  User,
} from '#src/db/schema.js';
import { ConflictError, UnauthorizedError } from '#src/lib/errors.js';
import { ConsoleMailer } from '#src/lib/mailer.js';
import type { AuthRepository } from '#src/modules/auth/repository.js';
import { AuthService } from '#src/modules/auth/service.js';

class InMemoryAuthRepository implements AuthRepository {
  public users: Map<string, User> = new Map();
  public refreshTokens: Map<string, RefreshToken> = new Map();
  public verificationTokens: Map<string, EmailVerificationToken> = new Map();
  public resetTokens: Map<string, PasswordResetToken> = new Map();

  async findUserByEmail(email: string): Promise<User | null> {
    for (const u of this.users.values()) {
      if (u.email === email) return u;
    }
    return null;
  }

  async findUserById(id: string): Promise<User | null> {
    return this.users.get(id) ?? null;
  }

  async createUser(user: NewUser): Promise<User> {
    const record: User = {
      ...user,
      role: user.role ?? 'user',
      emailVerified: user.emailVerified ?? false,
      avatarUrl: user.avatarUrl ?? null,
      deletedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.users.set(user.id, record);
    return record;
  }

  async updateUser(id: string, data: Partial<User>): Promise<User> {
    const existing = this.users.get(id);
    if (!existing) throw new Error('User not found');
    const updated = { ...existing, ...data, updatedAt: new Date() };
    this.users.set(id, updated);
    return updated;
  }

  async createRefreshToken(token: NewRefreshToken): Promise<RefreshToken> {
    const record: RefreshToken = {
      ...token,
      userAgent: token.userAgent ?? null,
      ipAddress: token.ipAddress ?? null,
      lastUsedAt: token.lastUsedAt ?? null,
      isRevoked: token.isRevoked ?? false,
      createdAt: new Date(),
    };
    this.refreshTokens.set(token.id, record);
    return record;
  }

  async findRefreshTokenByHash(hash: string): Promise<RefreshToken | null> {
    for (const t of this.refreshTokens.values()) {
      if (t.tokenHash === hash) return t;
    }
    return null;
  }

  async revokeRefreshToken(id: string): Promise<void> {
    const token = this.refreshTokens.get(id);
    if (token) {
      token.isRevoked = true;
    }
  }

  async revokeTokenFamily(family: string): Promise<void> {
    for (const t of this.refreshTokens.values()) {
      if (t.family === family) {
        t.isRevoked = true;
      }
    }
  }

  async createVerificationToken(token: NewEmailVerificationToken): Promise<EmailVerificationToken> {
    const record: EmailVerificationToken = {
      ...token,
      usedAt: token.usedAt ?? null,
      createdAt: new Date(),
    };
    this.verificationTokens.set(token.id, record);
    return record;
  }

  async findVerificationTokenByHash(hash: string): Promise<EmailVerificationToken | null> {
    for (const t of this.verificationTokens.values()) {
      if (t.tokenHash === hash) return t;
    }
    return null;
  }

  async markVerificationTokenUsed(id: string): Promise<void> {
    const token = this.verificationTokens.get(id);
    if (token) {
      token.usedAt = new Date();
    }
  }

  async createPasswordResetToken(token: NewPasswordResetToken): Promise<PasswordResetToken> {
    const record: PasswordResetToken = {
      ...token,
      usedAt: token.usedAt ?? null,
      createdAt: new Date(),
    };
    this.resetTokens.set(token.id, record);
    return record;
  }

  async findPasswordResetTokenByHash(hash: string): Promise<PasswordResetToken | null> {
    for (const t of this.resetTokens.values()) {
      if (t.tokenHash === hash) return t;
    }
    return null;
  }

  async markPasswordResetTokenUsed(id: string): Promise<void> {
    const token = this.resetTokens.get(id);
    if (token) {
      token.usedAt = new Date();
    }
  }

  async findRefreshTokenById(id: string): Promise<RefreshToken | null> {
    return this.refreshTokens.get(id) ?? null;
  }

  async listActiveRefreshTokensByUserId(userId: string): Promise<RefreshToken[]> {
    const list: RefreshToken[] = [];
    for (const t of this.refreshTokens.values()) {
      if (t.userId === userId && !t.isRevoked && t.expiresAt > new Date()) {
        list.push(t);
      }
    }
    return list;
  }

  async revokeAllUserRefreshTokens(userId: string): Promise<void> {
    for (const t of this.refreshTokens.values()) {
      if (t.userId === userId) {
        t.isRevoked = true;
      }
    }
  }

  public apiKeys: Map<string, import('#src/db/schema.js').ApiKeyRecord> = new Map();

  async createApiKey(
    data: import('#src/db/schema.js').NewApiKeyRecord
  ): Promise<import('#src/db/schema.js').ApiKeyRecord> {
    const record: import('#src/db/schema.js').ApiKeyRecord = {
      ...data,
      scopes: data.scopes ?? '["*"]',
      lastUsedAt: null,
      expiresAt: null,
      revokedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.apiKeys.set(data.id, record);
    return record;
  }

  async findApiKeyByHash(hash: string): Promise<import('#src/db/schema.js').ApiKeyRecord | null> {
    for (const k of this.apiKeys.values()) {
      if (k.keyHash === hash && !k.revokedAt) return k;
    }
    return null;
  }

  async findApiKeyById(id: string): Promise<import('#src/db/schema.js').ApiKeyRecord | null> {
    return this.apiKeys.get(id) ?? null;
  }

  async listApiKeysByUserId(userId: string): Promise<import('#src/db/schema.js').ApiKeyRecord[]> {
    const list: import('#src/db/schema.js').ApiKeyRecord[] = [];
    for (const k of this.apiKeys.values()) {
      if (k.userId === userId && !k.revokedAt) {
        list.push(k);
      }
    }
    return list;
  }

  async revokeApiKey(id: string): Promise<void> {
    const key = this.apiKeys.get(id);
    if (key) {
      key.revokedAt = new Date();
    }
  }

  async updateApiKeyLastUsed(id: string): Promise<void> {
    const key = this.apiKeys.get(id);
    if (key) {
      key.lastUsedAt = new Date();
    }
  }
}

describe('AuthService Workflow', () => {
  let repo: InMemoryAuthRepository;
  let mailer: ConsoleMailer;
  let service: AuthService;

  beforeEach(() => {
    repo = new InMemoryAuthRepository();
    mailer = new ConsoleMailer();
    service = new AuthService(repo, { sign: (p) => `jwt.${p.sub}.${p.role}` }, mailer);
  });

  it('completes signup and sends verification email', async () => {
    const result = await service.signup({
      email: 'john@example.com',
      password: 'SecurePassword123!',
    });

    expect(result.user.email).toBe('john@example.com');
    expect(result.user.emailVerified).toBe(false);
    expect(result.accessToken).toBeDefined();
    expect(result.refreshToken).toBeDefined();
    expect(mailer.sentEmails).toHaveLength(1);
    expect(mailer.sentEmails[0]?.to).toBe('john@example.com');
  });

  it('rejects duplicate email signup with ConflictError', async () => {
    await service.signup({ email: 'duplicate@example.com', password: 'Password123!' });
    await expect(
      service.signup({ email: 'duplicate@example.com', password: 'Password123!' })
    ).rejects.toThrow(ConflictError);
  });

  it('verifies email with valid single-use token', async () => {
    await service.signup({ email: 'verify@example.com', password: 'Password123!' });
    const rawMsg = mailer.sentEmails[0]?.text ?? '';
    const match = /token: (\S+)/.exec(rawMsg);
    expect(match).not.toBeNull();
    const token = match?.[1] ?? '';

    await service.verifyEmail(token);
    const user = await repo.findUserByEmail('verify@example.com');
    expect(user?.emailVerified).toBe(true);

    // Reusing the token should fail
    await expect(service.verifyEmail(token)).rejects.toThrow(UnauthorizedError);
  });

  it('rotates refresh tokens on refresh', async () => {
    const initial = await service.signup({ email: 'rotate@example.com', password: 'Password123!' });
    expect(initial.refreshToken).toBeDefined();
    const refreshed = await service.refresh(initial.refreshToken ?? '');

    expect(refreshed.accessToken).toBeDefined();
    expect(refreshed.refreshToken).toBeDefined();
    expect(refreshed.refreshToken).not.toBe(initial.refreshToken);
  });

  it('detects refresh token reuse and revokes entire family', async () => {
    const initial = await service.signup({ email: 'reuse@example.com', password: 'Password123!' });
    expect(initial.refreshToken).toBeDefined();
    const firstRefresh = await service.refresh(initial.refreshToken ?? '');
    expect(firstRefresh.refreshToken).toBeDefined();

    // Attempting to use old token again (REUSE DETECTION)
    await expect(service.refresh(initial.refreshToken ?? '')).rejects.toThrow(UnauthorizedError);

    // Now even the new token should be revoked because family was invalidated!
    await expect(service.refresh(firstRefresh.refreshToken ?? '')).rejects.toThrow(
      UnauthorizedError
    );
  });

  it('handles password reset flow', async () => {
    await service.signup({ email: 'reset@example.com', password: 'OldPassword123!' });
    await service.forgotPassword('reset@example.com');

    const resetMsg = mailer.sentEmails[1]?.text ?? '';
    const match = /token: (\S+)/.exec(resetMsg);
    expect(match).not.toBeNull();
    const token = match?.[1] ?? '';

    await service.resetPassword({ token, newPassword: 'BrandNewPassword123!' });

    // Login with new password succeeds
    const loginRes = await service.login({
      email: 'reset@example.com',
      password: 'BrandNewPassword123!',
    });
    expect(loginRes.user.email).toBe('reset@example.com');

    // Login with old password fails
    await expect(
      service.login({ email: 'reset@example.com', password: 'OldPassword123!' })
    ).rejects.toThrow(UnauthorizedError);
  });

  it('manages sessions: lists active sessions and revokes one or all', async () => {
    const signup = await service.signup(
      { email: 'session@example.com', password: 'Password123!' },
      { userAgent: 'Mozilla/5.0 TestBrowser', ipAddress: '127.0.0.1' }
    );
    const userId = signup.user.id;

    // Login from another device
    await service.login(
      { email: 'session@example.com', password: 'Password123!' },
      { userAgent: 'MobileApp/1.0', ipAddress: '10.0.0.1' }
    );

    const sessions = await service.listSessions(userId);
    expect(sessions).toHaveLength(2);

    // Revoke one session
    const firstSessionId = sessions[0]?.id ?? '';
    await service.revokeSession(userId, firstSessionId);
    const remaining = await service.listSessions(userId);
    expect(remaining).toHaveLength(1);

    // Revoke all sessions
    await service.revokeAllSessions(userId);
    const afterAllRevoked = await service.listSessions(userId);
    expect(afterAllRevoked).toHaveLength(0);
  });

  it('manages API keys: creates, lists, and revokes scoped API keys', async () => {
    const signup = await service.signup({
      email: 'apikey@example.com',
      password: 'Password123!',
    });
    const userId = signup.user.id;

    const created = await service.createApiKey(userId, {
      name: 'CI Pipeline Key',
      scopes: ['read:users', 'write:users'],
    });

    expect(created.key.startsWith('fst_')).toBe(true);
    expect(created.scopes).toEqual(['read:users', 'write:users']);

    const list = await service.listApiKeys(userId);
    expect(list).toHaveLength(1);
    expect(list[0]?.name).toBe('CI Pipeline Key');

    await service.revokeApiKey(userId, created.id);
    const afterRevoke = await service.listApiKeys(userId);
    expect(afterRevoke).toHaveLength(0);
  });
});

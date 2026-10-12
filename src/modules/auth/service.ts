/**
 * @file Business domain service for user authentication, password security, sessions, and API keys.
 * @module modules/auth/service
 */

import { env } from '#src/config/env.js';
import {
  generateApiKey,
  generateSecureToken,
  hashPassword,
  hashToken,
  verifyPassword,
} from '#src/lib/crypto.js';
import {
  ConflictError,
  ErrorCode,
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
} from '#src/lib/errors.js';
import { generateId } from '#src/lib/id.js';
import { type Mailer, defaultMailer } from '#src/lib/mailer.js';
import type { AuthRepository } from './repository.js';
import type {
  ApiKeyResponse,
  AuthTokensResponse,
  CreateApiKeyRequest,
  CreatedApiKeyResponse,
  LoginRequest,
  ResetPasswordRequest,
  SessionResponse,
  SignupRequest,
} from './schemas.js';

/** Abstract JWT token signer interface for issuing signed claims. */
export interface TokenSigner {
  sign(payload: { sub: string; email: string; role: 'user' | 'admin' }): string;
}

/** Contextual client metadata captured during authentication flows. */
export interface AuthContext {
  userAgent?: string | undefined;
  ipAddress?: string | undefined;
  clientType?: ('browser' | 'native' | 'mobile') | undefined;
  currentSessionId?: string | undefined;
}

/** Service managing user registration, credential verification, and token lifecycles. */
export class AuthService {
  /**
   * Initializes auth service with repository, signer, and mailer.
   *
   * @param repo Authentication data repository.
   * @param signer JWT signer implementation.
   * @param mailer Transactional email delivery service.
   */
  constructor(
    private readonly repo: AuthRepository,
    private readonly signer: TokenSigner,
    private readonly mailer: Mailer = defaultMailer
  ) {}

  /**
   * Registers a new user account, sends verification email, and returns auth tokens.
   *
   * @param data Registration payload
   * @param context Client device and IP metadata
   * @returns Generated access and refresh tokens
   * @throws ConflictError When user email is already registered
   */
  async signup(data: SignupRequest, context?: AuthContext): Promise<AuthTokensResponse> {
    const existing = await this.repo.findUserByEmail(data.email);
    if (existing) {
      throw new ConflictError('A user with this email address already exists');
    }

    const passwordHash = await hashPassword(data.password);
    const userId = generateId('usr');

    const user = await this.repo.createUser({
      id: userId,
      email: data.email,
      passwordHash,
      role: 'user',
      emailVerified: false,
    });

    // Generate email verification token
    const rawVerificationToken = generateSecureToken();
    const verificationHash = hashToken(rawVerificationToken);
    const verificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    await this.repo.createVerificationToken({
      id: generateId('evt'),
      userId: user.id,
      tokenHash: verificationHash,
      expiresAt: verificationExpires,
    });

    await this.mailer.sendVerificationEmail(user.email, rawVerificationToken);

    return this.generateTokenPair(user, undefined, context);
  }

  /**
   * Authenticates user with email and password credentials.
   *
   * @param data User login credentials
   * @param context Client device and IP metadata
   * @returns Generated access and refresh tokens
   * @throws UnauthorizedError When credentials are invalid or user deleted
   */
  async login(data: LoginRequest, context?: AuthContext): Promise<AuthTokensResponse> {
    const user = await this.repo.findUserByEmail(data.email);
    if (!user || user.deletedAt) {
      throw new UnauthorizedError('Invalid email or password', ErrorCode.AUTH_INVALID_CREDENTIALS);
    }

    const isValid = await verifyPassword(user.passwordHash, data.password);
    if (!isValid) {
      throw new UnauthorizedError('Invalid email or password', ErrorCode.AUTH_INVALID_CREDENTIALS);
    }

    return this.generateTokenPair(user, undefined, context);
  }

  /**
   * Rotates refresh token and issues a new access/refresh token pair.
   *
   * @param rawRefreshToken Unhashed incoming refresh token
   * @param context Client device and IP metadata
   * @returns Rotated access and refresh tokens
   * @throws UnauthorizedError When token is invalid, expired, or compromised
   */
  async refresh(rawRefreshToken: string, context?: AuthContext): Promise<AuthTokensResponse> {
    const hashed = hashToken(rawRefreshToken);
    const tokenRecord = await this.repo.findRefreshTokenByHash(hashed);

    if (!tokenRecord) {
      throw new UnauthorizedError('Invalid refresh token', ErrorCode.AUTH_TOKEN_INVALID);
    }

    // Reuse detection: If token was already revoked, revoke the entire family!
    if (tokenRecord.isRevoked) {
      await this.repo.revokeTokenFamily(tokenRecord.family);
      throw new UnauthorizedError(
        'Compromised refresh token detected. Session revoked.',
        ErrorCode.AUTH_TOKEN_INVALID
      );
    }

    if (new Date() > tokenRecord.expiresAt) {
      await this.repo.revokeRefreshToken(tokenRecord.id);
      throw new UnauthorizedError('Refresh token expired', ErrorCode.AUTH_TOKEN_EXPIRED);
    }

    // Revoke the current token
    await this.repo.revokeRefreshToken(tokenRecord.id);

    const user = await this.repo.findUserById(tokenRecord.userId);
    if (!user || user.deletedAt) {
      throw new UnauthorizedError('User account not found or deleted');
    }

    // Issue new token in the same rotation family
    return this.generateTokenPair(user, tokenRecord.family, context);
  }

  /**
   * Revokes the provided refresh token session on user logout.
   *
   * @param rawRefreshToken Unhashed refresh token to revoke
   * @returns Resolves when revoked
   */
  async logout(rawRefreshToken: string): Promise<void> {
    const hashed = hashToken(rawRefreshToken);
    const tokenRecord = await this.repo.findRefreshTokenByHash(hashed);
    if (tokenRecord) {
      await this.repo.revokeRefreshToken(tokenRecord.id);
    }
  }

  /**
   * Verifies a user's email address using a secure verification token.
   *
   * @param rawToken Unhashed verification token
   * @returns Resolves when email is verified
   * @throws UnauthorizedError When token is invalid, expired, or already used
   */
  async verifyEmail(rawToken: string): Promise<void> {
    const hashed = hashToken(rawToken);
    const record = await this.repo.findVerificationTokenByHash(hashed);

    if (!record || record.usedAt || new Date() > record.expiresAt) {
      throw new UnauthorizedError('Invalid, expired, or already used verification token');
    }

    await this.repo.markVerificationTokenUsed(record.id);
    await this.repo.updateUser(record.userId, { emailVerified: true });
  }

  /**
   * Initiates password reset flow by sending a reset link to the email.
   *
   * @param email User email address
   * @returns Resolves when email is sent or silently ignored if not found
   */
  async forgotPassword(email: string): Promise<void> {
    const user = await this.repo.findUserByEmail(email);
    if (!user || user.deletedAt) {
      // Return cleanly to avoid user enumeration
      return;
    }

    const rawToken = generateSecureToken();
    const tokenHash = hashToken(rawToken);
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await this.repo.createPasswordResetToken({
      id: generateId('prt'),
      userId: user.id,
      tokenHash,
      expiresAt,
    });

    await this.mailer.sendPasswordResetEmail(user.email, rawToken);
  }

  /**
   * Resets user password using a verified password reset token.
   *
   * @param data New password and reset token payload
   * @returns Resolves when password is updated
   * @throws UnauthorizedError When reset token is invalid, expired, or already used
   */
  async resetPassword(data: ResetPasswordRequest): Promise<void> {
    const hashed = hashToken(data.token);
    const record = await this.repo.findPasswordResetTokenByHash(hashed);

    if (!record || record.usedAt || new Date() > record.expiresAt) {
      throw new UnauthorizedError('Invalid, expired, or already used reset token');
    }

    const newPasswordHash = await hashPassword(data.newPassword);
    await this.repo.markPasswordResetTokenUsed(record.id);
    await this.repo.updateUser(record.userId, { passwordHash: newPasswordHash });
  }

  /**
   * Lists all active login sessions for a user.
   *
   * @param userId Target user ID
   * @param currentSessionId Optional ID of the caller's current session
   * @returns Array of active user sessions
   */
  async listSessions(userId: string, currentSessionId?: string): Promise<SessionResponse[]> {
    const activeTokens = await this.repo.listActiveRefreshTokensByUserId(userId);
    return activeTokens.map((t) => ({
      id: t.id,
      userAgent: t.userAgent ?? null,
      ipAddress: t.ipAddress ?? null,
      createdAt: t.createdAt.toISOString(),
      isCurrent: currentSessionId !== undefined && t.id === currentSessionId,
    }));
  }

  /**
   * Revokes a specific session belonging to the user.
   *
   * @param userId Target user ID
   * @param sessionId Session ID to revoke
   * @returns Resolves when revoked
   * @throws NotFoundError When session does not exist or belongs to another user
   */
  async revokeSession(userId: string, sessionId: string): Promise<void> {
    const token = await this.repo.findRefreshTokenById(sessionId);
    if (!token || token.userId !== userId) {
      throw new NotFoundError('Session not found');
    }
    await this.repo.revokeRefreshToken(sessionId);
  }

  /**
   * Revokes all active refresh tokens for a user.
   *
   * @param userId Target user ID
   * @returns Resolves when all sessions are revoked
   */
  async revokeAllSessions(userId: string): Promise<void> {
    await this.repo.revokeAllUserRefreshTokens(userId);
  }

  /**
   * Creates a new scoped API key for machine-to-machine access.
   *
   * @param userId User owner ID
   * @param data API key metadata and scopes
   * @returns Created API key entity including raw secret key
   */
  async createApiKey(userId: string, data: CreateApiKeyRequest): Promise<CreatedApiKeyResponse> {
    const { key, prefix, hash } = generateApiKey('fst');
    const apiKeyId = generateId('apk');

    const created = await this.repo.createApiKey({
      id: apiKeyId,
      userId,
      name: data.name,
      prefix,
      keyHash: hash,
      scopes: JSON.stringify(data.scopes),
    });

    return {
      id: created.id,
      name: created.name,
      prefix: created.prefix,
      scopes: JSON.parse(created.scopes),
      lastUsedAt: created.lastUsedAt ? created.lastUsedAt.toISOString() : null,
      createdAt: created.createdAt.toISOString(),
      key,
    };
  }

  /**
   * Lists all API keys owned by a user without exposing secrets.
   *
   * @param userId User owner ID
   * @returns Array of API keys
   */
  async listApiKeys(userId: string): Promise<ApiKeyResponse[]> {
    const keys = await this.repo.listApiKeysByUserId(userId);
    return keys.map((k) => ({
      id: k.id,
      name: k.name,
      prefix: k.prefix,
      scopes: JSON.parse(k.scopes),
      lastUsedAt: k.lastUsedAt ? k.lastUsedAt.toISOString() : null,
      createdAt: k.createdAt.toISOString(),
    }));
  }

  /**
   * Revokes an API key owned by the user.
   *
   * @param userId User owner ID
   * @param apiKeyId API key ID to revoke
   * @returns Resolves when key is revoked
   * @throws NotFoundError When API key does not exist or belongs to another user
   */
  async revokeApiKey(userId: string, apiKeyId: string): Promise<void> {
    const key = await this.repo.findApiKeyById(apiKeyId);
    if (!key || key.userId !== userId) {
      throw new NotFoundError('API key not found');
    }
    await this.repo.revokeApiKey(apiKeyId);
  }

  /**
   * Handles external OAuth provider profile callback and links/creates local user.
   *
   * @param _provider Identity provider name
   * @param profile External profile payload
   * @param context Client device and IP metadata
   * @returns Generated access and refresh tokens
   */
  async handleOAuthCallback(
    _provider: string,
    profile: { email: string; id: string },
    context?: AuthContext
  ): Promise<AuthTokensResponse> {
    let user = await this.repo.findUserByEmail(profile.email);
    if (!user) {
      const dummyPassword = await hashPassword(generateSecureToken(32));
      user = await this.repo.createUser({
        id: generateId('usr'),
        email: profile.email,
        passwordHash: dummyPassword,
        role: 'user',
        emailVerified: true,
      });
    }
    return this.generateTokenPair(user, undefined, context);
  }

  /**
   * Signs and stores a new token pair and session record for a user.
   *
   * @param user User account entity
   * @param family Refresh token rotation family ID
   * @param context Client device and IP metadata
   * @returns Access and refresh token pair
   */
  private async generateTokenPair(
    user: {
      id: string;
      email: string;
      role: string;
      emailVerified: boolean;
      avatarUrl?: string | null;
      createdAt: Date;
      updatedAt: Date;
    },
    family?: string,
    context?: AuthContext
  ): Promise<AuthTokensResponse> {
    const role = user.role as 'user' | 'admin';
    const accessToken = this.signer.sign({
      sub: user.id,
      email: user.email,
      role,
    });

    const rawRefreshToken = generateSecureToken(48);
    const hashed = hashToken(rawRefreshToken);
    const tokenFamily = family ?? generateId('fam');
    const expiresAt = new Date(Date.now() + env.REFRESH_TOKEN_EXPIRES_DAYS * 24 * 60 * 60 * 1000);
    const csrfToken = generateSecureToken(32);

    await this.repo.createRefreshToken({
      id: generateId('rft'),
      userId: user.id,
      tokenHash: hashed,
      family: tokenFamily,
      userAgent: context?.userAgent ?? null,
      ipAddress: context?.ipAddress ?? null,
      lastUsedAt: new Date(),
      isRevoked: false,
      expiresAt,
    });

    return {
      accessToken,
      refreshToken: rawRefreshToken,
      tokenType: 'Bearer',
      expiresIn: env.JWT_EXPIRES_IN,
      csrfToken,
      user: {
        id: user.id,
        email: user.email,
        role,
        emailVerified: user.emailVerified,
        avatarUrl: user.avatarUrl ?? null,
        createdAt: user.createdAt.toISOString(),
        updatedAt: user.updatedAt.toISOString(),
      },
    };
  }
}

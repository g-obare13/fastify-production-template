/**
 * @file Zod validation schemas and TypeScript types for authentication requests and responses.
 * @module modules/auth/schemas
 */

import { z } from 'zod';

/** Public user account profile representation schema. */
export const userProfileSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  role: z.enum(['user', 'admin']),
  emailVerified: z.boolean(),
  avatarUrl: z.string().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

/** Schema for user signup registration requests. Requires email and min-8 char password. */
export const signupRequestSchema = z.object({
  name: z.string().optional(),
  email: z.string().email().toLowerCase(),
  password: z.string().min(8, 'Password must be at least 8 characters long'),
  clientType: z.enum(['browser', 'native', 'mobile']).optional(),
});

/** Schema for user password login credentials. */
export const loginRequestSchema = z.object({
  email: z.string().email().toLowerCase(),
  password: z.string().min(1, 'Password is required'),
  clientType: z.enum(['browser', 'native', 'mobile']).optional(),
});

/** Response payload schema containing access token, rotating refresh token, and user profile. */
export const authTokensResponseSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string().optional(),
  tokenType: z.literal('Bearer'),
  expiresIn: z.string(),
  csrfToken: z.string().optional(),
  user: userProfileSchema,
});

/** Schema for refresh token rotation request. */
export const refreshRequestSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required').optional(),
  clientType: z.enum(['browser', 'native', 'mobile']).optional(),
});

/** Schema for user logout and session invalidation request. */
export const logoutRequestSchema = z.object({
  refreshToken: z.string().optional(),
});

/** Schema for email verification token confirmation. */
export const verifyEmailRequestSchema = z.object({
  token: z.string().min(1, 'Verification token is required'),
});

/** Schema for requesting password reset instructions via email. */
export const forgotPasswordRequestSchema = z.object({
  email: z.string().email().toLowerCase(),
});

/** Schema for password reset confirmation with token and new password. */
export const resetPasswordRequestSchema = z.object({
  token: z.string().min(1, 'Reset token is required'),
  newPassword: z.string().min(8, 'Password must be at least 8 characters long'),
});

/** Generic operational success message response. */
export const messageResponseSchema = z.object({
  message: z.string(),
  success: z.boolean(),
});

/** Session record schema representing an active refresh token grant. */
export const sessionResponseSchema = z.object({
  id: z.string(),
  userAgent: z.string().nullable(),
  ipAddress: z.string().nullable(),
  createdAt: z.string(),
  isCurrent: z.boolean(),
});

/** List of active sessions for the authenticated user. */
export const listSessionsResponseSchema = z.object({
  sessions: z.array(sessionResponseSchema),
});

/** Schema for generating a new scoped API key. */
export const createApiKeyRequestSchema = z.object({
  name: z.string().min(1).max(255),
  scopes: z.array(z.string()).default(['*']),
});

/** Public API key metadata descriptor schema. */
export const apiKeyResponseSchema = z.object({
  id: z.string(),
  name: z.string(),
  prefix: z.string(),
  scopes: z.array(z.string()),
  lastUsedAt: z.string().nullable(),
  createdAt: z.string(),
});

/** Response schema returning newly created API key including plaintext secret. */
export const createdApiKeyResponseSchema = apiKeyResponseSchema.extend({
  key: z.string(),
});

/** List of API keys owned by user. */
export const listApiKeysResponseSchema = z.object({
  apiKeys: z.array(apiKeyResponseSchema),
});

/** Query parameter schema for OAuth authorization redirect initiation. */
export const oauthAuthorizeQuerySchema = z.object({
  provider: z.enum(['google', 'github', 'oidc']),
  redirectUri: z.string().url(),
  state: z.string().optional(),
  codeChallenge: z.string().optional(),
  codeChallengeMethod: z.enum(['S256']).optional(),
});

/** Request payload for OAuth authorization code callback exchange. */
export const oauthCallbackRequestSchema = z.object({
  code: z.string(),
  codeVerifier: z.string().optional(),
  state: z.string().optional(),
  clientType: z.enum(['browser', 'native', 'mobile']).optional(),
});

/** Registration request body type. */
export type SignupRequest = z.infer<typeof signupRequestSchema>;
/** Login request body type. */
export type LoginRequest = z.infer<typeof loginRequestSchema>;
/** Refresh token rotation request type. */
export type RefreshRequest = z.infer<typeof refreshRequestSchema>;
/** Logout request type. */
export type LogoutRequest = z.infer<typeof logoutRequestSchema>;
/** Auth tokens response envelope type. */
export type AuthTokensResponse = z.infer<typeof authTokensResponseSchema>;
/** Verification token confirmation type. */
export type VerifyEmailRequest = z.infer<typeof verifyEmailRequestSchema>;
/** Password reset initiation type. */
export type ForgotPasswordRequest = z.infer<typeof forgotPasswordRequestSchema>;
/** Password reset confirmation type. */
export type ResetPasswordRequest = z.infer<typeof resetPasswordRequestSchema>;
/** Session record descriptor type. */
export type SessionResponse = z.infer<typeof sessionResponseSchema>;
/** API key creation request type. */
export type CreateApiKeyRequest = z.infer<typeof createApiKeyRequestSchema>;
/** API key descriptor type. */
export type ApiKeyResponse = z.infer<typeof apiKeyResponseSchema>;
/** Newly created API key response with secret. */
export type CreatedApiKeyResponse = z.infer<typeof createdApiKeyResponseSchema>;
/** OAuth authorization query type. */
export type OAuthAuthorizeQuery = z.infer<typeof oauthAuthorizeQuerySchema>;
/** OAuth callback exchange request type. */
export type OAuthCallbackRequest = z.infer<typeof oauthCallbackRequestSchema>;

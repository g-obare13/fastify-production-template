/**
 * @file Email delivery interfaces and console logging implementation.
 * @module src/lib/mailer
 */

import pino from 'pino';

/**
 * Message payload options for sending an email.
 */
export interface SendEmailOptions {
  /** Destination email address */
  to: string;
  /** Subject line of the email */
  subject: string;
  /** Plaintext body content */
  text: string;
  /** Optional HTML rendered body content */
  html?: string;
}

/**
 * Contract for application email transport providers.
 */
export interface Mailer {
  /**
   * Dispatches a generic transactional email message.
   *
   * @param options Recipient, subject, and body contents
   * @returns Resolves when dispatch completes
   */
  sendEmail(options: SendEmailOptions): Promise<void>;

  /**
   * Dispatches an account email verification token.
   *
   * @param to Target user email address
   * @param token Single-use verification token
   * @returns Resolves when email is sent
   */
  sendVerificationEmail(to: string, token: string): Promise<void>;

  /**
   * Dispatches a password reset token.
   *
   * @param to Target user email address
   * @param token Single-use password reset token
   * @returns Resolves when email is sent
   */
  sendPasswordResetEmail(to: string, token: string): Promise<void>;
}

const logger = pino({ name: 'mailer' });

/**
 * Console-based mailer implementation capturing sent messages in memory for inspection.
 */
export class ConsoleMailer implements Mailer {
  /** In-memory log of all messages dispatched through this instance */
  public sentEmails: SendEmailOptions[] = [];

  /**
   * Dispatches an email by logging to structured console output and recording in memory.
   *
   * @param options Email details
   * @returns Resolves immediately
   */
  async sendEmail(options: SendEmailOptions): Promise<void> {
    this.sentEmails.push(options);
    if (process.env.NODE_ENV !== 'test') {
      logger.info({ to: options.to, subject: options.subject }, 'Email dispatched');
    }
  }

  /**
   * Sends an account email verification token.
   *
   * @param to Recipient email address
   * @param token Verification token string
   * @returns Resolves when email is recorded
   */
  async sendVerificationEmail(to: string, token: string): Promise<void> {
    await this.sendEmail({
      to,
      subject: 'Verify your email address',
      text: `Welcome! Please verify your email by using verification token: ${token}`,
    });
  }

  /**
   * Sends a password reset token.
   *
   * @param to Recipient email address
   * @param token Reset token string
   * @returns Resolves when email is recorded
   */
  async sendPasswordResetEmail(to: string, token: string): Promise<void> {
    await this.sendEmail({
      to,
      subject: 'Reset your password',
      text: `Password reset requested. Use token: ${token}`,
    });
  }
}

/**
 * Global singleton mailer instance used across application services.
 */
export const defaultMailer = new ConsoleMailer();

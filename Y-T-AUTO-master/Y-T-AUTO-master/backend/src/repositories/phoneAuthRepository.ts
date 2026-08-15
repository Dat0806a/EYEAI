import type { Database } from 'sqlite';
import { getDb } from '../database';

export type PhoneChallengePurpose = 'LOGIN' | 'REGISTER' | 'LINK';

export interface PhoneChallengeRow {
  challenge_hash: string;
  binding_hash: string;
  phone_e164: string;
  purpose: PhoneChallengePurpose;
  target_user_id: string | null;
  code_mac: string | null;
  status: 'PENDING_SEND' | 'SENT' | 'SEND_FAILED' | 'LOCKED' | 'CONSUMED';
  attempts: number;
  max_attempts: number;
  expires_at: number;
  resend_available_at: number;
  created_at: number;
  sent_at: number | null;
  failed_at: number | null;
  locked_at: number | null;
  consumed_at: number | null;
  updated_at: number;
}

export interface PendingChallengeInput {
  challengeHash: string;
  bindingHash: string;
  phoneE164: string;
  purpose: PhoneChallengePurpose;
  targetUserId: string | null;
  codeMac: string;
  maxAttempts: number;
  expiresAt: number;
  resendAvailableAt: number;
  now: number;
}

function maskPhone(phoneE164: string): string {
  const visiblePrefix = phoneE164.slice(0, Math.min(3, phoneE164.length - 3));
  return `${visiblePrefix}${'*'.repeat(6)}${phoneE164.slice(-3)}`;
}

export async function getPhoneAccountStatus(
  userId: string,
  database?: Database,
): Promise<{ phoneVerified: boolean; maskedPhone: string | null }> {
  const db = database ?? await getDb();
  const identity = await db.get<{ phone_e164: string }>(
    'SELECT phone_e164 FROM user_phone_identities WHERE user_id = ?',
    userId,
  );
  return identity
    ? { phoneVerified: true, maskedPhone: maskPhone(identity.phone_e164) }
    : { phoneVerified: false, maskedPhone: null };
}

export class PhoneAuthRepository {
  constructor(readonly db: Database) {}

  async cleanupChallenges(now: number, retentionMs: number, batchSize: number): Promise<void> {
    await this.db.run(
      `UPDATE phone_otp_challenges
       SET status = 'SEND_FAILED', code_mac = NULL, failed_at = ?, updated_at = ?
       WHERE challenge_hash IN (
         SELECT challenge_hash
         FROM phone_otp_challenges
         WHERE status = 'PENDING_SEND' AND expires_at <= ?
         ORDER BY expires_at, challenge_hash
         LIMIT ?
       )`,
      now, now, now, batchSize,
    );
    await this.db.run(
      `UPDATE phone_otp_challenges
       SET status = 'LOCKED', code_mac = NULL, attempts = max_attempts,
           locked_at = ?, updated_at = ?
       WHERE challenge_hash IN (
         SELECT challenge_hash
         FROM phone_otp_challenges
         WHERE status = 'SENT' AND expires_at <= ?
         ORDER BY expires_at, challenge_hash
         LIMIT ?
       )`,
      now, now, now, batchSize,
    );
    await this.db.run(
      `DELETE FROM phone_otp_challenges
       WHERE challenge_hash IN (
         SELECT challenge_hash
         FROM phone_otp_challenges
         WHERE status IN ('SEND_FAILED', 'LOCKED', 'CONSUMED')
           AND updated_at <= ?
         ORDER BY updated_at, challenge_hash
         LIMIT ?
       )`,
      now - retentionMs, batchSize,
    );
  }

  async findCooldown(phoneE164: string, purpose: PhoneChallengePurpose, targetUserId: string | null, now: number) {
    return this.db.get<{ resend_available_at: number }>(
      `SELECT resend_available_at FROM phone_otp_challenges
       WHERE phone_e164 = ? AND purpose = ? AND target_user_id IS ?
         AND status IN ('PENDING_SEND', 'SENT') AND resend_available_at > ?
       ORDER BY created_at DESC LIMIT 1`,
      phoneE164, purpose, targetUserId, now,
    );
  }

  async insertPending(input: PendingChallengeInput): Promise<void> {
    await this.db.run(
      `INSERT INTO phone_otp_challenges
       (challenge_hash, binding_hash, phone_e164, purpose, target_user_id, code_mac,
        status, attempts, max_attempts, expires_at, resend_available_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'PENDING_SEND', 0, ?, ?, ?, ?, ?)`,
      input.challengeHash, input.bindingHash, input.phoneE164, input.purpose, input.targetUserId,
      input.codeMac, input.maxAttempts, input.expiresAt, input.resendAvailableAt, input.now, input.now,
    );
  }

  async finalizeSent(challengeHash: string, now: number): Promise<void> {
    const challenge = await this.getChallenge(challengeHash);
    if (!challenge || challenge.status !== 'PENDING_SEND') throw new Error('Phone challenge finalization failed.');
    await this.db.run(
      `UPDATE phone_otp_challenges SET status = 'LOCKED', code_mac = NULL,
       attempts = max_attempts, sent_at = COALESCE(sent_at, ?), locked_at = ?, updated_at = ?
       WHERE phone_e164 = ? AND purpose = ? AND target_user_id IS ?
         AND challenge_hash <> ? AND status = 'SENT'`,
      now, now, now, challenge.phone_e164, challenge.purpose, challenge.target_user_id, challengeHash,
    );
    const result = await this.db.run(
      `UPDATE phone_otp_challenges SET status = 'SENT', sent_at = ?, updated_at = ?
       WHERE challenge_hash = ? AND status = 'PENDING_SEND'`,
      now, now, challengeHash,
    );
    if (result.changes !== 1) throw new Error('Phone challenge finalization failed.');
  }

  async finalizeFailed(challengeHash: string, now: number): Promise<void> {
    await this.db.run(
      `UPDATE phone_otp_challenges SET status = 'SEND_FAILED', code_mac = NULL, failed_at = ?, updated_at = ?
       WHERE challenge_hash = ? AND status = 'PENDING_SEND'`,
      now, now, challengeHash,
    );
  }

  getChallenge(challengeHash: string): Promise<PhoneChallengeRow | undefined> {
    return this.db.get<PhoneChallengeRow>('SELECT * FROM phone_otp_challenges WHERE challenge_hash = ?', challengeHash);
  }

  getPhoneIdentityForUser(userId: string): Promise<{ phone_e164: string } | undefined> {
    return this.db.get<{ phone_e164: string }>(
      'SELECT phone_e164 FROM user_phone_identities WHERE user_id = ?',
      userId,
    );
  }

  async recordWrongAttempt(challenge: PhoneChallengeRow, now: number): Promise<boolean> {
    const locks = challenge.attempts + 1 >= challenge.max_attempts;
    await this.db.run(
      locks
        ? `UPDATE phone_otp_challenges SET attempts = attempts + 1, status = 'LOCKED', code_mac = NULL,
           locked_at = ?, updated_at = ? WHERE challenge_hash = ? AND status = 'SENT'`
        : `UPDATE phone_otp_challenges SET attempts = attempts + 1, updated_at = ?
           WHERE challenge_hash = ? AND status = 'SENT'`,
      ...(locks ? [now, now, challenge.challenge_hash] : [now, challenge.challenge_hash]),
    );
    return locks;
  }

  async consumeChallenge(challengeHash: string, now: number): Promise<void> {
    const result = await this.db.run(
      `UPDATE phone_otp_challenges SET status = 'CONSUMED', code_mac = NULL, consumed_at = ?, updated_at = ?
       WHERE challenge_hash = ? AND status = 'SENT' AND consumed_at IS NULL`,
      now, now, challengeHash,
    );
    if (result.changes !== 1) throw phoneError('OTP_INVALID_OR_EXPIRED', 400);
  }

  async resolveLoginUser(phoneE164: string): Promise<string | null> {
    const existing = await this.db.get<{ user_id: string }>(
      'SELECT user_id FROM user_phone_identities WHERE phone_e164 = ?', phoneE164,
    );
    return existing?.user_id ?? null;
  }

  async registerPhoneUser(phoneE164: string, now: number, generateId: () => string): Promise<string | null> {
    const existing = await this.db.get<{ user_id: string }>(
      'SELECT user_id FROM user_phone_identities WHERE phone_e164 = ?', phoneE164,
    );
    if (existing) return null;
    const userId = generateId();
    const identityId = generateId();
    await this.db.run(
      `INSERT INTO users (id, email, password_hash, auth_provider, email_is_placeholder)
       VALUES (?, ?, 'PHONE_ONLY_NO_PASSWORD', 'PHONE', 1)`,
      userId, `phone-${userId}@phone-auth.invalid`,
    );
    await this.db.run(
      `INSERT INTO user_phone_identities (id, user_id, phone_e164, verified_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      identityId, userId, phoneE164, now, now, now,
    );
    return userId;
  }

  async linkPhone(userId: string, phoneE164: string, now: number, generateId: () => string): Promise<void> {
    const user = await this.db.get<{ id: string }>('SELECT id FROM users WHERE id = ?', userId);
    if (!user) throw phoneError('USER_NOT_FOUND', 404);
    const owner = await this.db.get<{ user_id: string }>(
      'SELECT user_id FROM user_phone_identities WHERE phone_e164 = ?', phoneE164,
    );
    if (owner) {
      if (owner.user_id === userId) return;
      throw phoneError('PHONE_IDENTITY_CONFLICT', 409);
    }
    const alternate = await this.db.get<{ phone_e164: string }>(
      'SELECT phone_e164 FROM user_phone_identities WHERE user_id = ?', userId,
    );
    if (alternate) throw phoneError('PHONE_IDENTITY_CONFLICT', 409);
    await this.db.run(
      `INSERT INTO user_phone_identities (id, user_id, phone_e164, verified_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      generateId(), userId, phoneE164, now, now, now,
    );
  }
}

export function phoneError(code: string, statusCode: number, retryAfterMs?: number): Error & {
  code: string; statusCode: number; retryAfterMs?: number;
} {
  const error = new Error(code) as Error & { code: string; statusCode: number; retryAfterMs?: number };
  error.code = code;
  error.statusCode = statusCode;
  if (retryAfterMs !== undefined) error.retryAfterMs = retryAfterMs;
  return error;
}

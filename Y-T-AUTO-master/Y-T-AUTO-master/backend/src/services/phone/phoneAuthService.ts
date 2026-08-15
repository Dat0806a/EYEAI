import type { Database } from 'sqlite';
import { randomUUID } from 'crypto';
import { withTransaction } from '../../database';
import {
  getPhoneAccountStatus,
  PhoneAuthRepository,
  phoneError,
  type PhoneChallengePurpose,
} from '../../repositories/phoneAuthRepository';
import type { SmsProvider } from '../sms/types';
import { normalizePhoneNumber } from './normalizePhone';
import { createOtpMac, generateOpaqueToken, generateOtpCode, hashOpaqueToken, verifyOtpMac } from './otpCrypto';
import { hashPhoneBinding, isPhoneBindingToken, resolvePhoneBinding } from './phoneBinding';
import { PersistentPhoneRateLimiter, type PhoneRateLimitBucketSpec } from './rateLimits';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const DEFAULT_CHALLENGE_RETENTION_MS = DAY;
const DEFAULT_CHALLENGE_CLEANUP_BATCH_SIZE = 250;

export interface PhoneAuthServiceOptions {
  db: Database;
  provider: SmsProvider;
  otpHmacSecret: string;
  rateLimiter: PersistentPhoneRateLimiter;
  now?: () => number;
  generateChallengeToken?: () => string;
  generateBindingToken?: () => string;
  generateOtp?: () => string;
  generateId?: () => string;
  sessionSigner: (userId: string) => Promise<{ userId: string; token: string }>;
  ttlMs?: number;
  resendCooldownMs?: number;
  maxAttempts?: number;
  challengeRetentionMs?: number;
  challengeCleanupBatchSize?: number;
}

export interface RequestOtpInput {
  phone: string;
  ip: string;
  browserBinding: string | null;
}

export interface RequestLinkOtpInput extends RequestOtpInput { userId: string }

export interface VerifyOtpInput {
  challengeToken: string;
  code: string;
  ip: string;
  browserBinding: string;
}

export interface VerifyLinkOtpInput extends VerifyOtpInput { userId: string }

export class PhoneAuthService {
  private readonly repository: PhoneAuthRepository;
  private readonly now: () => number;
  private readonly generateChallengeToken: () => string;
  private readonly generateBindingToken: () => string;
  private readonly generateOtp: () => string;
  private readonly generateId: () => string;
  private readonly ttlMs: number;
  private readonly resendCooldownMs: number;
  private readonly maxAttempts: number;
  private readonly challengeRetentionMs: number;
  private readonly challengeCleanupBatchSize: number;

  constructor(private readonly options: PhoneAuthServiceOptions) {
    this.repository = new PhoneAuthRepository(options.db);
    this.now = options.now ?? Date.now;
    this.generateChallengeToken = options.generateChallengeToken ?? generateOpaqueToken;
    this.generateBindingToken = options.generateBindingToken ?? generateOpaqueToken;
    this.generateOtp = options.generateOtp ?? generateOtpCode;
    this.generateId = options.generateId ?? randomUUID;
    this.ttlMs = options.ttlMs ?? 5 * MINUTE;
    this.resendCooldownMs = options.resendCooldownMs ?? MINUTE;
    this.maxAttempts = options.maxAttempts ?? 5;
    this.challengeRetentionMs = options.challengeRetentionMs ?? DEFAULT_CHALLENGE_RETENTION_MS;
    this.challengeCleanupBatchSize = options.challengeCleanupBatchSize
      ?? DEFAULT_CHALLENGE_CLEANUP_BATCH_SIZE;
  }

  requestLoginOtp(input: RequestOtpInput) {
    return this.requestOtp('LOGIN', null, input);
  }

  requestLinkOtp(input: RequestLinkOtpInput) {
    return this.requestOtp('LINK', input.userId, input);
  }

  requestRegisterOtp(input: RequestOtpInput) {
    return this.requestOtp('REGISTER', null, input);
  }

  verifyLoginOtp(input: VerifyOtpInput) {
    return this.verifyOtp('LOGIN', null, input);
  }

  verifyLinkOtp(input: VerifyLinkOtpInput) {
    return this.verifyOtp('LINK', input.userId, input);
  }

  verifyRegisterOtp(input: VerifyOtpInput) {
    return this.verifyOtp('REGISTER', null, input);
  }

  async getStatus(userId: string): Promise<{ phoneVerified: boolean; maskedPhone: string | null }> {
    return getPhoneAccountStatus(userId, this.options.db);
  }

  private async requestOtp(purpose: PhoneChallengePurpose, targetUserId: string | null, input: RequestOtpInput) {
    const phoneE164 = normalizePhoneNumber(input.phone);
    const binding = resolvePhoneBinding(input.browserBinding, this.generateBindingToken);
    const challengeToken = this.generateChallengeToken();
    const challengeHash = hashOpaqueToken(challengeToken);
    const code = this.generateOtp();
    const codeMac = createOtpMac({ secret: this.options.otpHmacSecret, challengeHash, phoneE164, code });
    const now = this.now();
    const expiresAt = now + this.ttlMs;
    const resendAvailableAt = now + this.resendCooldownMs;

    await withTransaction(this.options.db, async () => {
      await this.repository.cleanupChallenges(
        now,
        this.challengeRetentionMs,
        this.challengeCleanupBatchSize,
      );
      const cooldown = await this.repository.findCooldown(phoneE164, purpose, targetUserId, now);
      if (cooldown) throw phoneError('OTP_RESEND_COOLDOWN', 429, cooldown.resend_available_at - now);
      await this.options.rateLimiter.consumeWithinTransaction(this.sendBudgets(phoneE164, input.ip, targetUserId));
      await this.repository.insertPending({
        challengeHash, bindingHash: binding.hash, phoneE164, purpose, targetUserId, codeMac,
        maxAttempts: this.maxAttempts, expiresAt, resendAvailableAt, now,
      });
    });

    try {
      await this.options.provider.sendOtp({ toE164: phoneE164, code, expiresInSeconds: Math.ceil(this.ttlMs / 1000) });
    } catch (error) {
      await withTransaction(this.options.db, () => this.repository.finalizeFailed(challengeHash, this.now()));
      if ((error as { code?: unknown } | null)?.code === 'OTP_NOT_CONFIGURED') throw error;
      throw phoneError('OTP_DELIVERY_UNAVAILABLE', 502);
    }
    await withTransaction(this.options.db, () => this.repository.finalizeSent(challengeHash, this.now()));
    return {
      challengeToken,
      expiresAt,
      resendAvailableAt,
      browserBinding: binding.token,
      bindingWasCreated: binding.wasCreated,
    };
  }

  private async verifyOtp(purpose: PhoneChallengePurpose, targetUserId: string | null, input: VerifyOtpInput) {
    const challengeHash = hashOpaqueToken(input.challengeToken);
    const bindingHash = isPhoneBindingToken(input.browserBinding)
      ? hashPhoneBinding(input.browserBinding)
      : null;
    const result = await withTransaction(this.options.db, async () => {
      const challenge = await this.repository.getChallenge(challengeHash);
      if (!challenge) {
        await this.options.rateLimiter.consumeWithinTransaction([
          bucket('verify:ip:minute', input.ip, 20, MINUTE),
        ]);
        return { verificationError: phoneError('OTP_INVALID_OR_EXPIRED', 400) };
      }
      const now = this.now();
      await this.options.rateLimiter.consumeWithinTransaction(this.verifyBudgets(challenge.phone_e164, input.ip));
      if (challenge.binding_hash !== bindingHash || challenge.purpose !== purpose ||
          challenge.target_user_id !== targetUserId || challenge.status !== 'SENT' || !challenge.code_mac) {
        return { verificationError: phoneError('OTP_INVALID_OR_EXPIRED', 400) };
      }
      if (challenge.expires_at <= now) return { verificationError: phoneError('OTP_EXPIRED', 400) };
      if (challenge.attempts >= challenge.max_attempts) {
        return { verificationError: phoneError('OTP_INVALID_OR_EXPIRED', 400) };
      }
      const valid = verifyOtpMac({
        secret: this.options.otpHmacSecret, challengeHash, phoneE164: challenge.phone_e164,
        code: input.code, storedMac: challenge.code_mac,
      });
      if (!valid) {
        const locked = await this.repository.recordWrongAttempt(challenge, now);
        return { verificationError: phoneError(locked ? 'OTP_ATTEMPTS_EXCEEDED' : 'OTP_INVALID', locked ? 429 : 400) };
      }
      await this.repository.consumeChallenge(challengeHash, now);
      if (purpose === 'LOGIN') {
        const userId = await this.repository.resolveLoginUser(challenge.phone_e164);
        if (!userId) {
          return { semanticError: phoneError('REGISTRATION_REQUIRED', 409) };
        }
        return { value: await this.options.sessionSigner(userId) };
      }
      if (purpose === 'REGISTER') {
        const userId = await this.repository.registerPhoneUser(challenge.phone_e164, now, this.generateId);
        if (!userId) return { semanticError: phoneError('LOGIN_REQUIRED', 409) };
        return { value: await this.options.sessionSigner(userId) };
      }
      try {
        await this.repository.linkPhone(targetUserId!, challenge.phone_e164, now, this.generateId);
        return { value: { userId: targetUserId!, phoneE164: challenge.phone_e164 } };
      } catch (error) {
        if ((error as { code?: unknown } | null)?.code === 'PHONE_IDENTITY_CONFLICT') {
          return { semanticError: error as Error };
        }
        throw error;
      }
    });
    if ('verificationError' in result) throw result.verificationError;
    if ('semanticError' in result) throw result.semanticError;
    return result.value;
  }

  private sendBudgets(phone: string, ip: string, userId: string | null): PhoneRateLimitBucketSpec[] {
    const specs = [
      bucket('send:phone:minute', phone, 1, MINUTE),
      bucket('send:phone:hour', phone, 5, HOUR),
      bucket('send:phone:day', phone, 10, DAY),
      bucket('send:ip:minute', ip, 5, MINUTE),
      bucket('send:ip:hour', ip, 30, HOUR),
    ];
    if (userId) specs.push(bucket('send:user:minute', userId, 3, MINUTE), bucket('send:user:hour', userId, 10, HOUR));
    return specs;
  }

  private verifyBudgets(phone: string, ip: string): PhoneRateLimitBucketSpec[] {
    return [bucket('verify:phone:minute', phone, 10, MINUTE), bucket('verify:ip:minute', ip, 20, MINUTE)];
  }
}

function bucket(domain: string, identity: string, limit: number, windowMs: number): PhoneRateLimitBucketSpec {
  return { domain, identity, limit, windowMs };
}

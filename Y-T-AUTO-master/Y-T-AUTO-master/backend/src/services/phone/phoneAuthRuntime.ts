import { config } from '../../config';
import { getDb } from '../../database';
import { signSessionForUser } from '../../repositories/authRepository';
import {
  createSmsProvider,
  isPhoneAuthConfigured,
  SmsProviderNotConfiguredError,
} from '../sms/providerFactory';
import { PhoneAuthService } from './phoneAuthService';
import { PersistentPhoneRateLimiter } from './rateLimits';

let runtimePromise: Promise<PhoneAuthService> | null = null;

export function getPhoneAuthRuntime(): Promise<PhoneAuthService> {
  if (!runtimePromise) {
    runtimePromise = (async () => {
      if (!isPhoneAuthConfigured({
        sms: config.sms,
        otpHmacSecret: config.otp.hmacSecret,
      })) {
        throw new SmsProviderNotConfiguredError();
      }
      const db = await getDb();
      const provider = createSmsProvider(config.sms);
      return new PhoneAuthService({
        db,
        provider,
        otpHmacSecret: config.otp.hmacSecret,
        rateLimiter: new PersistentPhoneRateLimiter({
          db,
          hmacKey: config.otp.hmacSecret,
        }),
        sessionSigner: async (userId) => signSessionForUser(userId),
        ttlMs: config.otp.ttlMinutes * 60_000,
        resendCooldownMs: config.otp.resendCooldownSeconds * 1_000,
        maxAttempts: config.otp.maxAttempts,
      });
    })().catch((error) => {
      runtimePromise = null;
      throw error;
    });
  }
  return runtimePromise;
}

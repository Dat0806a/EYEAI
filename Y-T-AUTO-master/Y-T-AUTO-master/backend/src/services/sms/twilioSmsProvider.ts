import type { SendOtpInput, SmsProvider, TwilioSmsProviderConfig } from './types';
import { OtpDeliveryUnavailableError } from './types';

export class TwilioSmsProvider implements SmsProvider {
  constructor(private readonly config: TwilioSmsProviderConfig) {}

  async sendOtp(input: SendOtpInput): Promise<void> {
    const body = new URLSearchParams({
      To: input.toE164,
      Body: `Y Te Cho Nguoi Binh Thuong: Ma OTP cua ban la ${input.code}. Ma het han sau ${Math.ceil(input.expiresInSeconds / 60)} phut.`,
    });
    if (this.config.messagingServiceSid.trim()) {
      body.set('MessagingServiceSid', this.config.messagingServiceSid);
    } else {
      body.set('From', this.config.fromNumber);
    }

    try {
      const response = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(this.config.accountSid)}/Messages.json`,
        {
          method: 'POST',
          headers: {
            Authorization: `Basic ${Buffer.from(`${this.config.accountSid}:${this.config.authToken}`).toString('base64')}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: body.toString(),
          signal: AbortSignal.timeout(this.config.requestTimeoutMs),
        },
      );
      if (!response.ok) throw new OtpDeliveryUnavailableError();
    } catch {
      throw new OtpDeliveryUnavailableError();
    }
  }
}

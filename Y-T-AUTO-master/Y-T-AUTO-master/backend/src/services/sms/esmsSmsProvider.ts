import { parsePhoneNumberFromString } from 'libphonenumber-js/max';
import { parseEsmsSendResponse } from './esmsResponse';
import type { EsmsSmsProviderConfig, SendOtpInput, SmsProvider } from './types';
import { OtpDeliveryUnavailableError } from './types';

const ESMS_SEND_ENDPOINT =
  'https://rest.esms.vn/MainService.svc/json/SendMultipleMessage_V4_post_json/';
const ESMS_BRANDNAME = 'Baotrixemay';
const ESMS_SMS_TYPE = '2';
const ESMS_IS_UNICODE = '0';
const ESMS_CODE = /^[A-Za-z0-9]{1,8}$/;

function toEsmsPhone(toE164: string): string | null {
  const phone = parsePhoneNumberFromString(toE164);
  if (!phone?.isValid() || phone.country !== 'VN' || phone.number !== toE164) return null;
  return `0${phone.nationalNumber}`;
}

export class EsmsSmsProvider implements SmsProvider {
  constructor(private readonly config: EsmsSmsProviderConfig) {}

  async sendOtp(input: SendOtpInput): Promise<void> {
    const phone = toEsmsPhone(input.toE164);
    if (!phone || !ESMS_CODE.test(input.code)) throw new OtpDeliveryUnavailableError();

    try {
      const response = await fetch(ESMS_SEND_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ApiKey: this.config.apiKey,
          SecretKey: this.config.secretKey,
          Content: `${input.code} la ma xac minh dang ky Baotrixemay cua ban`,
          Phone: phone,
          Brandname: ESMS_BRANDNAME,
          SmsType: ESMS_SMS_TYPE,
          IsUnicode: ESMS_IS_UNICODE,
        }),
        signal: AbortSignal.timeout(this.config.requestTimeoutMs),
      });
      if (!response.ok) throw new OtpDeliveryUnavailableError();
      const result = parseEsmsSendResponse(await response.json());
      if (!result || result.CodeResult !== '100') throw new OtpDeliveryUnavailableError();
    } catch {
      throw new OtpDeliveryUnavailableError();
    }
  }
}

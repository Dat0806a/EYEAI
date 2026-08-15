import { isFacebookOAuthConfigured } from './facebookOAuth';
import { isGoogleOAuthConfigured } from './googleOAuth';
import { config } from '../../config';
import { isPhoneAuthConfigured } from '../sms/providerFactory';

export interface AuthProviderStatus {
  google: boolean;
  facebook: boolean;
  phoneOtp: boolean;
}

export function getAuthProviderStatus(): AuthProviderStatus {
  return {
    google: isGoogleOAuthConfigured(),
    facebook: isFacebookOAuthConfigured(),
    phoneOtp: isPhoneAuthConfigured({
      sms: config.sms,
      otpHmacSecret: config.otp.hmacSecret,
    }),
  };
}

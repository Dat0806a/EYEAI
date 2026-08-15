import { Router } from 'express';
import {
  register,
  login,
  getMe,
  updateProfile,
  googleLogin,
  googleCallback,
  googleLink,
  facebookLogin,
  facebookCallback,
  facebookLink,
  exchangeOAuthCallbackCode,
  authProviders,
} from '../controllers/authController';
import {
  getPhoneStatus,
  requestPhoneLinkOtp,
  requestPhoneLoginOtp,
  requestPhoneRegisterOtp,
  verifyPhoneLinkOtp,
  verifyPhoneLoginOtp,
  verifyPhoneRegisterOtp,
} from '../controllers/phoneAuthController';
import { requireAuth } from '../middleware/auth';
import { noStore } from '../middleware/noStore';
import {
  oauthCallbackRateLimit,
  oauthLinkRateLimit,
  oauthLoginRateLimit,
} from '../middleware/oauthRateLimit';
import { validateBody } from '../middleware/validation';
import {
  registerSchema,
  loginSchema,
  oauthExchangeSchema,
  phoneRequestSchema,
  phoneVerifySchema,
  profileSchema,
} from '../schemas';

export const authRouter = Router();

authRouter.post('/register', validateBody(registerSchema), register);
authRouter.post('/login', validateBody(loginSchema), login);
authRouter.get('/me', requireAuth, getMe);
authRouter.put('/profile', requireAuth, validateBody(profileSchema), updateProfile);
authRouter.get('/google', oauthLoginRateLimit, googleLogin);
authRouter.get('/google/callback', oauthCallbackRateLimit, googleCallback);
authRouter.post('/google/link', requireAuth, oauthLinkRateLimit, googleLink);
authRouter.get('/facebook', oauthLoginRateLimit, facebookLogin);
authRouter.get('/facebook/callback', oauthCallbackRateLimit, facebookCallback);
authRouter.post('/facebook/link', requireAuth, oauthLinkRateLimit, facebookLink);
authRouter.post('/oauth/exchange', validateBody(oauthExchangeSchema), exchangeOAuthCallbackCode);
authRouter.post('/phone/request', noStore, validateBody(phoneRequestSchema), requestPhoneLoginOtp);
authRouter.post('/phone/verify', noStore, validateBody(phoneVerifySchema), verifyPhoneLoginOtp);
authRouter.post('/phone/register/request', noStore, validateBody(phoneRequestSchema), requestPhoneRegisterOtp);
authRouter.post('/phone/register/verify', noStore, validateBody(phoneVerifySchema), verifyPhoneRegisterOtp);
authRouter.post('/phone/link/request', requireAuth, noStore, validateBody(phoneRequestSchema), requestPhoneLinkOtp);
authRouter.post('/phone/link/verify', requireAuth, noStore, validateBody(phoneVerifySchema), verifyPhoneLinkOtp);
authRouter.get('/phone', requireAuth, getPhoneStatus);
authRouter.get('/providers', authProviders);

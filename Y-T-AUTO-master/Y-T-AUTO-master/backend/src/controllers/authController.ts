import { Request, Response } from 'express';
import {
  registerUser,
  loginUser,
  getProfile,
  upsertProfile,
  loginWithOAuthIdentity,
  registerOAuthUser,
  linkOAuthIdentityToAuthenticatedUser,
  createSessionForUser,
} from '../repositories/authRepository';
import { getPhoneAccountStatus } from '../repositories/phoneAuthRepository';
import { AuthedRequest } from '../middleware/auth';
import { calculateAge } from '../utils/age';
import { config } from '../config';
import {
  buildGoogleAuthorizationUrl,
  exchangeGoogleCodeForToken,
  getGoogleUserInfo,
  isGoogleOAuthConfigured,
} from '../services/oauth/googleOAuth';
import {
  buildFacebookAuthorizationUrl,
  exchangeFacebookCodeForToken,
  getFacebookUserInfo,
  isFacebookOAuthConfigured,
} from '../services/oauth/facebookOAuth';
import { getAuthProviderStatus } from '../services/oauth/providerStatus';
import {
  consumeOAuthAuthorizationState,
  issueOAuthAuthorizationState,
  OAuthProvider,
  OAuthPurpose,
} from '../services/oauth/oauthState';
import {
  consumeOAuthCallbackCode,
  isOAuthCallbackErrorCode,
  issueOAuthCallbackCode,
  OAuthCallbackErrorCode,
} from '../services/oauth/oauthExchange';
import {
  ensureOAuthBinding,
  readOAuthBinding,
  setOAuthBindingCookie,
} from '../services/oauth/oauthBinding';

function sendError(res: Response, err: unknown, fallback = 'Đã xảy ra lỗi.'): void {
  const e = err as Error & { code?: unknown; statusCode?: number };
  const statusCode = e.statusCode ?? 500;
  const safeCode = typeof e.code === 'string' && /^[A-Z][A-Z0-9_]*$/.test(e.code)
    ? e.code
    : statusCode < 500 ? 'REQUEST_ERROR' : 'INTERNAL_ERROR';
  res.status(statusCode).json({
    success: false,
    data: null,
    error: {
      code: safeCode,
      message: statusCode < 500 && e.message ? e.message : fallback,
    },
  });
}

const oauthExchangeErrors: Record<OAuthCallbackErrorCode | 'INVALID_OAUTH_CODE', {
  statusCode: number;
  message: string;
}> = {
  INVALID_OAUTH_CODE: {
    statusCode: 400,
    message: 'The OAuth callback code is invalid or expired.',
  },
  INVALID_OAUTH_STATE: {
    statusCode: 400,
    message: 'The OAuth authorization state is invalid or expired.',
  },
  OAUTH_PROVIDER_FAILED: {
    statusCode: 502,
    message: 'The OAuth provider could not complete authentication.',
  },
  OAUTH_EMAIL_LINK_REQUIRED: {
    statusCode: 409,
    message: 'Sign in to the existing account before linking this OAuth identity.',
  },
  OAUTH_IDENTITY_CONFLICT: {
    statusCode: 409,
    message: 'This OAuth identity is already linked to another account.',
  },
  LOGIN_REQUIRED: {
    statusCode: 409,
    message: 'This account is already registered. Please sign in.',
  },
  REGISTRATION_REQUIRED: {
    statusCode: 409,
    message: 'No account exists for this identity. Please register.',
  },
};

function sendOAuthExchangeError(
  res: Response,
  code: OAuthCallbackErrorCode | 'INVALID_OAUTH_CODE',
): void {
  const safe = oauthExchangeErrors[code];
  res.status(safe.statusCode).json({
    success: false,
    data: null,
    error: { code, message: safe.message },
  });
}

function callbackErrorCode(err: unknown): OAuthCallbackErrorCode {
  const code = (err as { code?: unknown } | null)?.code;
  return isOAuthCallbackErrorCode(code) ? code : 'OAUTH_PROVIDER_FAILED';
}

function setNoStore(res: Response): void {
  res.set('Cache-Control', 'no-store');
}

function redirectOAuthCallback(res: Response, code: string, purpose: OAuthPurpose): void {
  const redirectUrl = new URL('/oauth/callback', config.webOrigin);
  redirectUrl.searchParams.set('code', code);
  redirectUrl.searchParams.set('intent', purpose);
  setNoStore(res);
  res.set('Referrer-Policy', 'no-referrer');
  res.redirect(redirectUrl.toString());
}

function readPublicOAuthIntent(req: Request): 'LOGIN' | 'REGISTER' {
  const intent = req.query.intent;
  if (intent !== 'LOGIN' && intent !== 'REGISTER') {
    throw Object.assign(new Error('OAuth intent must be LOGIN or REGISTER.'), {
      code: 'INVALID_OAUTH_INTENT',
      statusCode: 400,
    });
  }
  return intent;
}

function sendOAuthNotConfigured(res: Response, provider: OAuthProvider): void {
  res.status(503).json({
    success: false,
    data: null,
    error: {
      code: 'OAUTH_NOT_CONFIGURED',
      message: `${provider === 'GOOGLE' ? 'Google' : 'Facebook'} OAuth is not configured on the server.`,
    },
  });
}

export async function register(req: Request, res: Response): Promise<void> {
  try {
    const { email, password } = req.body as { email: string; password: string };
    const result = await registerUser(email, password);
    res.status(201).json({ success: true, data: result, error: null });
  } catch (err) {
    sendError(res, err, 'Không thể đăng ký tài khoản.');
  }
}

export async function login(req: Request, res: Response): Promise<void> {
  try {
    const { email, password } = req.body as { email: string; password: string };
    const result = await loginUser(email, password);
    res.json({ success: true, data: result, error: null });
  } catch (err) {
    sendError(res, err, 'Không thể đăng nhập.');
  }
}

export async function getMe(req: AuthedRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId as string;
    const [profile, phone] = await Promise.all([
      getProfile(userId),
      getPhoneAccountStatus(userId),
    ]);
    setNoStore(res);
    res.json({
      success: true,
      data: { userId, hasProfile: Boolean(profile), profile: profile ?? null, phone },
      error: null,
    });
  } catch (err) {
    sendError(res, err);
  }
}

export async function updateProfile(req: AuthedRequest, res: Response): Promise<void> {
  try {
    const { fullName, dateOfBirth, gender } = req.body as {
      fullName: string;
      dateOfBirth: string;
      gender: 'MALE' | 'FEMALE' | 'OTHER';
    };
    const profile = await upsertProfile(req.userId as string, fullName, dateOfBirth, gender);
    res.json({
      success: true,
      data: { ...profile, age: calculateAge(profile.date_of_birth) },
      error: null,
    });
  } catch (err) {
    sendError(res, err);
  }
}

export async function googleLogin(req: Request, res: Response): Promise<void> {
  setNoStore(res);
  if (!isGoogleOAuthConfigured()) {
    sendOAuthNotConfigured(res, 'GOOGLE');
    return;
  }
  try {
    const intent = readPublicOAuthIntent(req);
    const binding = ensureOAuthBinding(req, res);
    const state = await issueOAuthAuthorizationState(
      { provider: 'GOOGLE', purpose: intent },
      binding,
    );
    res.redirect(buildGoogleAuthorizationUrl(state));
  } catch (err) {
    sendError(res, err, 'Unable to start Google OAuth.');
  }
}

export async function googleLink(req: AuthedRequest, res: Response): Promise<void> {
  setNoStore(res);
  if (!isGoogleOAuthConfigured()) {
    sendOAuthNotConfigured(res, 'GOOGLE');
    return;
  }
  try {
    const binding = ensureOAuthBinding(req, res);
    const state = await issueOAuthAuthorizationState({
      provider: 'GOOGLE',
      purpose: 'LINK',
      userId: req.userId as string,
    }, binding);
    res.json({
      success: true,
      data: { provider: 'GOOGLE', authorizationUrl: buildGoogleAuthorizationUrl(state) },
      error: null,
    });
  } catch (err) {
    sendError(res, err, 'Unable to start Google account linking.');
  }
}

export async function googleCallback(req: Request, res: Response): Promise<void> {
  let binding = readOAuthBinding(req);
  let purpose: OAuthPurpose | null = null;
  try {
    const code = req.query.code;
    const state = req.query.state;
    if (typeof state !== 'string') {
      throw Object.assign(new Error('Invalid OAuth state.'), { code: 'INVALID_OAUTH_STATE' });
    }
    if (!binding) {
      throw Object.assign(new Error('Invalid OAuth state.'), { code: 'INVALID_OAUTH_STATE' });
    }
    const authorizationState = await consumeOAuthAuthorizationState(state, 'GOOGLE', binding);
    purpose = authorizationState.purpose;
    if (!isGoogleOAuthConfigured() || typeof code !== 'string' || !code) {
      throw new Error('Google OAuth callback could not be completed.');
    }
    const { accessToken } = await exchangeGoogleCodeForToken(code);
    const info = await getGoogleUserInfo(accessToken);
    const identity = {
        provider: 'GOOGLE',
        providerSub: info.sub,
        email: info.email,
        emailVerified: info.email_verified === true,
      } as const;
    const result = authorizationState.purpose === 'LOGIN'
      ? await loginWithOAuthIdentity(identity)
      : authorizationState.purpose === 'REGISTER'
        ? await registerOAuthUser(identity)
        : await linkOAuthIdentityToAuthenticatedUser(authorizationState.userId, {
        provider: 'GOOGLE',
        providerSub: info.sub,
      });
    const callbackCode = await issueOAuthCallbackCode(
      { kind: 'SESSION', purpose: authorizationState.purpose, userId: result.userId },
      binding,
    );
    setOAuthBindingCookie(res, binding);
    redirectOAuthCallback(res, callbackCode, authorizationState.purpose);
  } catch (err) {
    try {
      if (!purpose) {
        sendError(res, Object.assign(new Error('Invalid OAuth state.'), {
          code: 'INVALID_OAUTH_STATE', statusCode: 400,
        }), 'Unable to complete Google OAuth.');
        return;
      }
      binding = binding ?? ensureOAuthBinding(req, res);
      const code = await issueOAuthCallbackCode(
        { kind: 'ERROR', purpose, errorCode: callbackErrorCode(err) },
        binding,
      );
      setOAuthBindingCookie(res, binding);
      redirectOAuthCallback(res, code, purpose);
    } catch (issueError) {
      sendError(res, issueError, 'Unable to complete Google OAuth.');
    }
  }
}

export async function facebookLogin(req: Request, res: Response): Promise<void> {
  setNoStore(res);
  if (!isFacebookOAuthConfigured()) {
    sendOAuthNotConfigured(res, 'FACEBOOK');
    return;
  }
  try {
    const intent = readPublicOAuthIntent(req);
    const binding = ensureOAuthBinding(req, res);
    const state = await issueOAuthAuthorizationState(
      { provider: 'FACEBOOK', purpose: intent },
      binding,
    );
    res.redirect(buildFacebookAuthorizationUrl(state));
  } catch (err) {
    sendError(res, err, 'Unable to start Facebook OAuth.');
  }
}

export async function facebookLink(req: AuthedRequest, res: Response): Promise<void> {
  setNoStore(res);
  if (!isFacebookOAuthConfigured()) {
    sendOAuthNotConfigured(res, 'FACEBOOK');
    return;
  }
  try {
    const binding = ensureOAuthBinding(req, res);
    const state = await issueOAuthAuthorizationState({
      provider: 'FACEBOOK',
      purpose: 'LINK',
      userId: req.userId as string,
    }, binding);
    res.json({
      success: true,
      data: { provider: 'FACEBOOK', authorizationUrl: buildFacebookAuthorizationUrl(state) },
      error: null,
    });
  } catch (err) {
    sendError(res, err, 'Unable to start Facebook account linking.');
  }
}

export async function facebookCallback(req: Request, res: Response): Promise<void> {
  let binding = readOAuthBinding(req);
  let purpose: OAuthPurpose | null = null;
  try {
    const code = req.query.code;
    const state = req.query.state;
    if (typeof state !== 'string') {
      throw Object.assign(new Error('Invalid OAuth state.'), { code: 'INVALID_OAUTH_STATE' });
    }
    if (!binding) {
      throw Object.assign(new Error('Invalid OAuth state.'), { code: 'INVALID_OAUTH_STATE' });
    }
    const authorizationState = await consumeOAuthAuthorizationState(state, 'FACEBOOK', binding);
    purpose = authorizationState.purpose;
    if (!isFacebookOAuthConfigured() || typeof code !== 'string' || !code) {
      throw new Error('Facebook OAuth callback could not be completed.');
    }
    const { accessToken } = await exchangeFacebookCodeForToken(code);
    const info = await getFacebookUserInfo(accessToken);
    const identity = {
        provider: 'FACEBOOK',
        providerSub: info.id,
        email: info.email,
        emailVerified: false,
      } as const;
    const result = authorizationState.purpose === 'LOGIN'
      ? await loginWithOAuthIdentity(identity)
      : authorizationState.purpose === 'REGISTER'
        ? await registerOAuthUser(identity)
        : await linkOAuthIdentityToAuthenticatedUser(authorizationState.userId, {
        provider: 'FACEBOOK',
        providerSub: info.id,
      });
    const callbackCode = await issueOAuthCallbackCode(
      { kind: 'SESSION', purpose: authorizationState.purpose, userId: result.userId },
      binding,
    );
    setOAuthBindingCookie(res, binding);
    redirectOAuthCallback(res, callbackCode, authorizationState.purpose);
  } catch (err) {
    try {
      if (!purpose) {
        sendError(res, Object.assign(new Error('Invalid OAuth state.'), {
          code: 'INVALID_OAUTH_STATE', statusCode: 400,
        }), 'Unable to complete Facebook OAuth.');
        return;
      }
      binding = binding ?? ensureOAuthBinding(req, res);
      const code = await issueOAuthCallbackCode(
        { kind: 'ERROR', purpose, errorCode: callbackErrorCode(err) },
        binding,
      );
      setOAuthBindingCookie(res, binding);
      redirectOAuthCallback(res, code, purpose);
    } catch (issueError) {
      sendError(res, issueError, 'Unable to complete Facebook OAuth.');
    }
  }
}

export async function exchangeOAuthCallbackCode(req: Request, res: Response): Promise<void> {
  setNoStore(res);
  try {
    const { code, intent } = req.body as { code: string; intent: OAuthPurpose };
    const binding = readOAuthBinding(req);
    if (!binding) {
      sendOAuthExchangeError(res, 'INVALID_OAUTH_CODE');
      return;
    }
    const result = await consumeOAuthCallbackCode(code, binding, intent);
    if (result.kind === 'ERROR') {
      sendOAuthExchangeError(res, result.errorCode);
      return;
    }
    const session = await createSessionForUser(result.userId);
    res.json({ success: true, data: { ...session, intent: result.purpose }, error: null });
  } catch (err) {
    if ((err as { code?: unknown } | null)?.code === 'INVALID_OAUTH_CODE') {
      sendOAuthExchangeError(res, 'INVALID_OAUTH_CODE');
      return;
    }
    sendError(res, new Error('OAuth session creation failed.'), 'Unable to complete OAuth login.');
  }
}

export async function authProviders(req: Request, res: Response): Promise<void> {
  res.json({
    success: true,
    data: { providers: getAuthProviderStatus() },
    error: null,
  });
}

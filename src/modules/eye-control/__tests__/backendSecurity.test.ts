import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import { verifyAuthHeader } from '../../../../server/patientAuth';
import { loadServerEnvironment } from '../../../../server/envLoader';
import { SECURITY_CSP_POLICY } from '../../../../server/securityMiddleware';
import { createPatientRouter } from '../../../../server/patientBackend';
import { createPatientAgentRouter } from '../../../../server/patientAgentBackend';
import aiChatV2, { handler as aiChatV1 } from '../../../../netlify/functions/ai-chat';
import entSearchV2 from '../../../../netlify/functions/entertainment-search';
import ttsV2, { handler as ttsV1 } from '../../../../netlify/functions/tts';
import patientFnV2 from '../../../../netlify/functions/patient';
import patientAgentFnV2 from '../../../../netlify/functions/patient-agent';
import * as patientService from '../../../services/patientService';
import { supabase } from '../../../lib/supabase';

function makeUnsignedJwt(payload: Record<string, unknown>): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${header}.${body}.fakesig`;
}

describe('EYEAI Task 5 & Task 6 — Backend Auth, Rate Limit, Payload & TTS Privacy Verification', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.restoreAllMocks();
    process.env.SUPABASE_URL = 'https://test-project.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-test-key';
    process.env.SUPABASE_ANON_KEY = 'anon-test-key';
    process.env.YOUTUBE_API_KEY = 'yt-test-key';
    process.env.GEMINI_API_KEY = 'gemini-test-key';
    process.env.APP_URL = 'https://eyetalk.example.com';
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.unstubAllGlobals();
  });

  it('Task 5.1: verifyAuthHeader handles all 6 JWT verification scenarios accurately', async () => {
    // 1. Missing token
    const missing = await verifyAuthHeader(undefined, { requirePatient: false });
    expect(missing.ok).toBe(false);
    expect(missing.status).toBe(401);

    // 2. Malformed token (not Bearer or fewer than 3 segments / non-JWT)
    const fetchMock = vi.fn(async (url: RequestInfo | URL) => {
      const target = String(url);
      if (target.endsWith('/auth/v1/user')) {
        return new Response(JSON.stringify({ message: 'invalid JWT' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response('[]', { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);
    const malformed = await verifyAuthHeader('Bearer not-a-jwt', { requirePatient: false });
    expect(malformed.ok).toBe(false);
    expect(malformed.status).toBe(401);

    // 3. Fake signature rejected by Supabase Auth
    const fakeToken = makeUnsignedJwt({
      sub: 'user-1',
      aal: 'aal1',
      exp: Math.floor(Date.now() / 1000) + 3600,
    });
    const fakeRes = await verifyAuthHeader(`Bearer ${fakeToken}`, { requirePatient: false });
    expect(fakeRes.ok).toBe(false);
    expect(fakeRes.status).toBe(401);

    // 4. Expired token rejected by Supabase Auth
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ message: 'token is expired' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      })
    );
    const expiredToken = makeUnsignedJwt({
      sub: 'user-1',
      aal: 'aal1',
      exp: Math.floor(Date.now() / 1000) - 60,
    });
    const expiredRes = await verifyAuthHeader(`Bearer ${expiredToken}`, { requirePatient: false });
    expect(expiredRes.ok).toBe(false);
    expect(expiredRes.status).toBe(401);

    // 5. Token sub / user mismatch
    fetchMock.mockImplementationOnce(async () =>
      new Response(JSON.stringify({ id: 'different-user-id', email: 'a@b.com' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );
    const mismatchToken = makeUnsignedJwt({ sub: 'attacker-id', aal: 'aal2' });
    const mismatchRes = await verifyAuthHeader(`Bearer ${mismatchToken}`, { requirePatient: false });
    expect(mismatchRes.ok).toBe(false);
    expect(mismatchRes.status).toBe(401);

    // 6. Valid token for verified Impaired user (requirePatient: false)
    fetchMock.mockImplementation(async (url: RequestInfo | URL) => {
      const target = String(url);
      if (target.endsWith('/auth/v1/user')) {
        return new Response(
          JSON.stringify({ id: 'imp-user-1', email: 'imp@eyetalk.vn', app_metadata: { account_type: 'impaired' } }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }
        );
      }
      if (target.includes('user_account_policies')) {
        return new Response(
          JSON.stringify([{ account_type: 'impaired', mfa_enforced: false, role_verified: true, requires_role_review: false }]),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }
        );
      }
      if (target.includes('profiles')) {
        return new Response(
          JSON.stringify([{ id: 'imp-user-1', display_name: 'Impaired User' }]),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      return new Response('[]', { status: 200 });
    });

    const validToken = makeUnsignedJwt({ sub: 'imp-user-1', aal: 'aal1' });
    const validRes = await verifyAuthHeader(`Bearer ${validToken}`, { requirePatient: false });
    expect(validRes.ok).toBe(true);
    expect(validRes.identity?.userId).toBe('imp-user-1');
    expect(validRes.identity?.accountType).toBe('impaired');
  });

  it('Task 5.2: ai-chat Netlify function enforces POST, 100KB limit, JWT auth, and 429 rate limiting', async () => {
    // Method guard
    const getRes = await aiChatV2(
      new Request('https://eyetalk.example.com/api/ai/chat', {
        method: 'GET',
        headers: { 'x-forwarded-for': '203.0.113.10' },
      })
    );
    expect(getRes.status).toBe(405);

    // Payload > 100KB -> 413
    const hugeBody = JSON.stringify({ message: 'a'.repeat(110 * 1024) });
    const largeRes = await aiChatV2(
      new Request('https://eyetalk.example.com/api/ai/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-forwarded-for': '203.0.113.11',
        },
        body: hugeBody,
      })
    );
    expect(largeRes.status).toBe(413);

    // Missing auth -> 401
    const unauthRes = await aiChatV2(
      new Request('https://eyetalk.example.com/api/ai/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-forwarded-for': '203.0.113.12',
        },
        body: JSON.stringify({ message: 'Xin chào' }),
      })
    );
    expect(unauthRes.status).toBe(401);

    // V1 handler payload guard
    const v1Large = await aiChatV1({
      httpMethod: 'POST',
      headers: { 'x-forwarded-for': '203.0.113.13' },
      body: hugeBody,
    });
    expect(v1Large.statusCode).toBe(413);

    // Rate limiting: > 30 requests in 60s -> 429 with Retry-After
    let hit429: Response | null = null;
    for (let i = 0; i < 32; i++) {
      const r = await aiChatV2(
        new Request('https://eyetalk.example.com/api/ai/chat', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-forwarded-for': '203.0.113.99',
          },
          body: JSON.stringify({ message: 'test' }),
        })
      );
      if (r.status === 429) {
        hit429 = r;
        break;
      }
    }
    expect(hit429).not.toBeNull();
    expect(Number(hit429!.headers.get('Retry-After'))).toBeGreaterThanOrEqual(1);
  });

  it('Task 5.3: entertainment-search Netlify function enforces auth, validation, size cap, and rate limit', async () => {
    // Missing auth -> 401
    const unauthRes = await entSearchV2(
      new Request('https://eyetalk.example.com/api/entertainment/search?q=nhac&mode=music', {
        method: 'GET',
        headers: { 'x-forwarded-for': '198.51.100.1' },
      })
    );
    expect(unauthRes.status).toBe(401);

    // Oversized POST -> 413
    const largePost = await entSearchV2(
      new Request('https://eyetalk.example.com/api/entertainment/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-forwarded-for': '198.51.100.2',
        },
        body: JSON.stringify({ q: 'x'.repeat(35 * 1024), mode: 'music' }),
      })
    );
    expect(largePost.status).toBe(413);

    // Authorized YouTube normalization + no key leak
    const fetchMock = vi.fn(async (url: RequestInfo | URL) => {
      const target = String(url);
      if (target.endsWith('/auth/v1/user')) {
        return new Response(
          JSON.stringify({ id: 'imp-user-2', app_metadata: { account_type: 'impaired' } }),
          { status: 200 }
        );
      }
      if (target.includes('user_account_policies')) {
        return new Response(
          JSON.stringify([{ account_type: 'impaired', mfa_enforced: false, role_verified: true, requires_role_review: false }]),
          { status: 200 }
        );
      }
      if (target.includes('profiles')) {
        return new Response(JSON.stringify([{ id: 'imp-user-2', display_name: 'Impaired User 2' }]), {
          status: 200,
        });
      }
      if (target.includes('googleapis.com/youtube/v3/search')) {
        return new Response(
          JSON.stringify({
            items: [
              {
                id: { videoId: 'vid-123' },
                snippet: {
                  title: 'Nhạc &amp; Thư giãn',
                  channelTitle: 'Relax Channel',
                  publishedAt: '2026-01-01T00:00:00Z',
                  description: 'Desc',
                  thumbnails: { high: { url: 'https://i.ytimg.com/vi/vid-123/hqdefault.jpg' } },
                },
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      return new Response('[]', { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const validJwt = makeUnsignedJwt({ sub: 'imp-user-2', aal: 'aal1' });
    const okRes = await entSearchV2(
      new Request('https://eyetalk.example.com/api/entertainment/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${validJwt}`,
          Origin: 'http://localhost:5173',
          'x-forwarded-for': '198.51.100.3',
        },
        body: JSON.stringify({ q: 'nhạc nhẹ', mode: 'invalid_mode' }),
      })
    );
    expect(okRes.status).toBe(200);
    const json = await okRes.json();
    expect(json.success).toBe(true);
    expect(json.mode).toBe('music');
    expect(json.results[0].title).toBe('Nhạc & Thư giãn');
    expect(JSON.stringify(json)).not.toContain('yt-test-key');
  });

  it('Task 6: TTS endpoint enforces POST + private no-store + CORS, and speech.ts Strategy 3 uses POST + Blob URL revocation', async () => {
    const fakeMp3 = new Uint8Array([0x49, 0x44, 0x33, 0x03]);
    const fetchMock = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
      const target = String(input);
      if (target.startsWith('https://translate.google.com/translate_tts')) {
        return new Response(fakeMp3, {
          status: 200,
          headers: { 'Content-Type': 'audio/mpeg' },
        });
      }
      return new Response(fakeMp3, {
        status: 200,
        headers: { 'Content-Type': 'audio/mpeg', 'Cache-Control': 'private, no-store, max-age=0' },
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    // 1. Netlify TTS V2 & V1 enforce private, no-store, strict CORS
    const ttsResV2 = await ttsV2(
      new Request('https://eyetalk.example.com/api/tts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: 'https://evil.example.net',
          'x-forwarded-for': '192.0.2.10',
        },
        body: JSON.stringify({ text: 'Kiểm tra quyền riêng tư' }),
      })
    );
    expect(ttsResV2.status).toBe(200);
    expect(ttsResV2.headers.get('Cache-Control')).toBe('private, no-store, max-age=0');
    expect(ttsResV2.headers.get('Access-Control-Allow-Origin')).toBe('https://eyetalk.example.com');

    const ttsResV1 = await ttsV1({
      httpMethod: 'POST',
      headers: {
        Origin: 'http://localhost:5173',
        'x-forwarded-for': '192.0.2.11',
      },
      body: JSON.stringify({ text: 'Đọc thông báo' }),
    });
    expect(ttsResV1.statusCode).toBe(200);
    expect(ttsResV1.headers['Cache-Control']).toBe('private, no-store, max-age=0');
    expect(ttsResV1.headers['Access-Control-Allow-Origin']).toBe('http://localhost:5173');

    // 2. speech.ts Strategy 3 HTMLAudioElement fallback (force Chrome UA + no AudioContext)
    vi.resetModules();
    Object.defineProperty(navigator, 'userAgent', {
      configurable: true,
      value: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36',
    });
    delete (window as any).AudioContext;
    delete (window as any).webkitAudioContext;

    const createObjSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:http://localhost/tts-1');
    const revokeObjSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => { });

    const playSpy = vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(function (this: HTMLMediaElement) {
      setTimeout(() => {
        this.onended?.(new Event('ended'));
      }, 0);
      return Promise.resolve();
    });

    const speechMod = await import('../../../utils/speech');
    speechMod.updateSpeechSettings({ speakerEnabled: true, speechVolume: 1, speechRate: 1 });
    speechMod.speakVietnamese('Xin chào bảo mật');

    await vi.waitFor(() => {
      const apiCalls = fetchMock.mock.calls.filter((c) => String(c[0]).startsWith('/api/tts'));
      expect(apiCalls.length).toBeGreaterThanOrEqual(1);
    });

    const ttsCall = fetchMock.mock.calls.find((c) => String(c[0]).startsWith('/api/tts'))!;
    expect(String(ttsCall[0])).toBe('/api/tts');
    expect(String(ttsCall[0])).not.toContain('?text=');
    expect((ttsCall[1] as RequestInit).method).toBe('POST');
    expect((ttsCall[1] as RequestInit).body).toContain('Xin chào bảo mật');

    await vi.waitFor(() => {
      expect(revokeObjSpy).toHaveBeenCalledWith('blob:http://localhost/tts-1');
    });
    expect(createObjSpy).toHaveBeenCalledTimes(1);
    playSpy.mockRestore();
  });

  it('Zero Client Secret: loadServerEnvironment prioritizes .env.local without overriding system env', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'eyeai-env-test-'));
    try {
      fs.writeFileSync(
        path.join(tmpDir, '.env.local'),
        'TEST_EYEAI_KEY=from_env_local\nTEST_OVERRIDE_SYSTEM=from_local_file\n'
      );
      fs.writeFileSync(
        path.join(tmpDir, '.env'),
        'TEST_EYEAI_KEY=from_default_env\nTEST_FALLBACK_KEY=from_default_only\n'
      );

      delete process.env.TEST_EYEAI_KEY;
      delete process.env.TEST_FALLBACK_KEY;
      process.env.TEST_OVERRIDE_SYSTEM = 'from_platform_env';

      loadServerEnvironment(tmpDir);

      expect(process.env.TEST_EYEAI_KEY).toBe('from_env_local');
      expect(process.env.TEST_FALLBACK_KEY).toBe('from_default_only');
      expect(process.env.TEST_OVERRIDE_SYSTEM).toBe('from_platform_env');
    } finally {
      delete process.env.TEST_EYEAI_KEY;
      delete process.env.TEST_FALLBACK_KEY;
      delete process.env.TEST_OVERRIDE_SYSTEM;
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('Zero Client Secret: Netlify functions reject VITE_GEMINI_API_KEY fallback and CSP blocks generativelanguage', async () => {
    expect(SECURITY_CSP_POLICY).not.toContain('generativelanguage.googleapis.com');

    delete process.env.GEMINI_API_KEY;
    delete process.env.PATIENT_AGENT_GEMINI_API_KEY;
    process.env.VITE_GEMINI_API_KEY = 'should-never-be-read-by-server';

    const fetchMock = vi.fn(async (url: RequestInfo | URL) => {
      const target = String(url);
      if (target.endsWith('/auth/v1/user')) {
        return new Response(
          JSON.stringify({ id: 'imp-zero-1', app_metadata: { account_type: 'impaired' } }),
          { status: 200 }
        );
      }
      if (target.includes('user_account_policies')) {
        return new Response(
          JSON.stringify([{ account_type: 'impaired', mfa_enforced: false, role_verified: true, requires_role_review: false }]),
          { status: 200 }
        );
      }
      if (target.includes('profiles')) {
        return new Response(JSON.stringify([{ id: 'imp-zero-1', display_name: 'Impaired' }]), { status: 200 });
      }
      return new Response('[]', { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const jwt = makeUnsignedJwt({ sub: 'imp-zero-1', aal: 'aal1' });
    const aiRes = await aiChatV2(
      new Request('https://eyetalk.example.com/api/ai/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${jwt}`,
          'x-forwarded-for': '198.51.100.77',
        },
        body: JSON.stringify({ message: 'Xin chào' }),
      })
    );
    expect(aiRes.status).toBe(500);

    // Patient Netlify function checks runtime GEMINI_API_KEY only (AAL2 patient auth)
    const patFetchMock = vi.fn(async (url: RequestInfo | URL) => {
      const target = String(url);
      if (target.endsWith('/auth/v1/user')) {
        return new Response(
          JSON.stringify({
            id: 'pat-zero-1',
            app_metadata: { account_type: 'patient' },
            factors: [{ status: 'verified' }],
          }),
          { status: 200 }
        );
      }
      if (target.includes('user_account_policies')) {
        return new Response(
          JSON.stringify([{ account_type: 'patient', mfa_enforced: true, role_verified: true, requires_role_review: false }]),
          { status: 200 }
        );
      }
      if (target.includes('profiles')) {
        return new Response(JSON.stringify([{ id: 'pat-zero-1', display_name: 'Patient' }]), { status: 200 });
      }
      return new Response('[]', { status: 200 });
    });
    vi.stubGlobal('fetch', patFetchMock);

    const patJwt = makeUnsignedJwt({ sub: 'pat-zero-1', aal: 'aal2' });
    const patRes = await patientFnV2(
      new Request('https://eyetalk.example.com/api/patient/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${patJwt}` },
        body: JSON.stringify({ message: 'Đường huyết 7.5 là sao?' }),
      })
    );
    expect(patRes.status).toBe(500);

    const agentRes = await patientAgentFnV2(
      new Request('https://eyetalk.example.com/api/patient/agent/turn', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${patJwt}` },
        body: JSON.stringify({ sessionId: 's1', taskId: 't1', turnId: 'r1', userMessage: 'Mở trang lịch sử' }),
      })
    );
    expect(agentRes.status).toBe(503);
  });

  it('Zero Client Secret: patientService never calls Gemini directly from browser when backend fails', async () => {
    process.env.VITE_GEMINI_API_KEY = 'leaked-test-key';
    process.env.GEMINI_API_KEY = 'leaked-test-key';

    vi.spyOn(supabase.auth, 'getSession').mockResolvedValue({
      data: { session: { access_token: 'tok-pat', user: { id: 'pat-cli-1' } } },
      error: null,
    } as any);
    vi.spyOn(supabase.auth, 'getUser').mockResolvedValue({
      data: { user: { id: 'pat-cli-1' } },
      error: null,
    } as any);

    const fetchSpy = vi.fn(async (input: RequestInfo | URL) => {
      const target = String(input);
      if (target.includes('generativelanguage.googleapis.com')) {
        throw new Error('SECURITY_VIOLATION: Client called Gemini API directly!');
      }
      return new Response(JSON.stringify({ error: 'Backend down' }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      });
    });
    vi.stubGlobal('fetch', fetchSpy);

    // 1. Image & PDF OCR fail cleanly via backend error without calling Gemini directly
    const origImage = globalThis.Image;
    class ImmediateErrorImage {
      onerror: ((err?: any) => void) | null = null;
      onload: (() => void) | null = null;
      set src(_v: string) {
        setTimeout(() => this.onerror?.(new Error('skip resize in jsdom')), 0);
      }
    }
    vi.stubGlobal('Image', ImmediateErrorImage as any);

    const imgFile = new File([new Uint8Array([1, 2, 3])], 'lab.png', { type: 'image/png' });
    await expect(patientService.scanOcr(imgFile)).rejects.toThrow(/Không thể kết nối dịch vụ phân tích phiếu xét nghiệm/i);

    const pdfFile = new File([new Uint8Array([0x25, 0x50, 0x44, 0x46])], 'lab.pdf', { type: 'application/pdf' });
    await expect(patientService.scanOcr(pdfFile)).rejects.toThrow(/Không thể kết nối dịch vụ phân tích phiếu xét nghiệm/i);
    vi.stubGlobal('Image', origImage);

    // 2. .txt OCR still works offline via parseOcrText without calling Gemini
    const txtFile = new File(['GLUCOSE | Đường huyết | 5.6 | mmol/L | 3.9 - 6.1'], 'lab.txt', {
      type: 'text/plain',
    });
    const txtRes = await patientService.scanOcr(txtFile);
    expect(txtRes.provider).toBe('LOCAL_TEXT_PARSER');
    expect(txtRes.results[0].testCode).toBe('GLUCOSE');

    // 3. confirmAnalysis & sendPatientChatMessage fall back locally without calling Gemini directly
    const bundle = await patientService.confirmAnalysis('rep_zero_1', [
      {
        testCode: 'GLUCOSE',
        testName: 'Đường huyết',
        value: 5.6,
        valueType: 'NUMERIC',
        unit: 'mmol/L',
        referenceLow: 3.9,
        referenceHigh: 6.1,
        referenceText: '3.9 - 6.1',
      },
    ]);
    expect(bundle.analysis.reportId).toBe('rep_zero_1');

    const chatReply = await patientService.sendPatientChatMessage('Chỉ số này ổn không?');
    expect(chatReply).toContain('tham khảo ý kiến bác sĩ');

    const externalGeminiCalls = fetchSpy.mock.calls.filter((c) =>
      String(c[0]).includes('generativelanguage.googleapis.com')
    );
    expect(externalGeminiCalls).toHaveLength(0);
  });

  it('Zero Client Secret: Express patient & agent routers execute OCR (image/PDF), Analyze, Chat & Turn using server AI', async () => {
    vi.unstubAllGlobals();
    const generateContent = vi.fn(async ({ contents, config }: any) => {
      const promptText = JSON.stringify(contents || '');
      if (promptText.includes('actionType') || promptText.includes('semanticElements')) {
        return {
          text: JSON.stringify({
            actionType: 'ANSWER_ONLY',
            speakText: 'Đã ghi nhận yêu cầu.',
            confidence: 0.95,
          }),
        };
      }
      if (config?.responseMimeType === 'application/json' && promptText.includes('overallSummary')) {
        return {
          text: JSON.stringify({
            overallSummary: 'Chỉ số bình thường.',
            results: [{ testCode: 'GLUCOSE', testName: 'Đường huyết', value: 5.5, status: 'NORMAL' }],
            mealPlan: { title: 'Thực đơn', items: [{ mealType: 'BREAKFAST', name: 'Cháo yến mạch' }] },
            exercisePlan: { title: 'Vận động', items: [{ name: 'Đi bộ', duration: 20 }] },
          }),
        };
      }
      if (config?.responseMimeType === 'application/json') {
        return {
          text: JSON.stringify({
            results: [
              {
                testCode: 'GLUCOSE',
                testName: 'Đường huyết',
                value: 5.5,
                valueType: 'NUMERIC',
                unit: 'mmol/L',
                ocrConfidence: 0.98,
                isUncertain: false,
                flag: 'NORMAL',
              },
            ],
          }),
        };
      }
      return { text: 'Phản hồi an toàn từ máy chủ.' };
    });

    const mockAi = { models: { generateContent } } as any;
    const mockVerify = vi.fn(async () => ({
      ok: true as const,
      status: 200 as const,
      identity: {
        userId: 'pat-srv-1',
        email: 'pat@eyetalk.vn',
        accountType: 'patient' as const,
        roleVerified: true,
        requiresRoleReview: false,
        displayName: 'Bệnh nhân Test',
        aal: 'aal2' as const,
        hasVerifiedMfa: true,
        mfaRequired: true,
      },
    }));

    const app = express();
    app.use(express.json({ limit: '5mb' }));
    app.use('/api/patient/agent', createPatientAgentRouter({ ai: mockAi, apiKey: 'srv-key', verifyAuth: mockVerify }));
    app.use('/api/patient', createPatientRouter(mockAi, 'srv-key', mockVerify));

    const server = await new Promise<ReturnType<typeof app.listen>>((resolve) => {
      const s = app.listen(0, '127.0.0.1', () => resolve(s));
    });

    try {
      const addr = server.address() as any;
      const baseUrl = `http://127.0.0.1:${addr.port}`;

      // 1. OCR Image & PDF
      const imgOcr = await fetch(`${baseUrl}/api/patient/ocr`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer tok' },
        body: JSON.stringify({ fileBase64: 'data:image/png;base64,AAAA', mimeType: 'image/png', fileName: 'a.png' }),
      });
      expect(imgOcr.status).toBe(200);
      expect((await imgOcr.json()).results[0].testCode).toBe('GLUCOSE');

      const pdfOcr = await fetch(`${baseUrl}/api/patient/ocr`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer tok' },
        body: JSON.stringify({ fileBase64: 'data:application/pdf;base64,JVBERg==', mimeType: 'application/pdf', fileName: 'a.pdf' }),
      });
      expect(pdfOcr.status).toBe(200);
      expect((await pdfOcr.json()).results[0].testCode).toBe('GLUCOSE');

      // 2. Analyze
      const analyzeRes = await fetch(`${baseUrl}/api/patient/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer tok' },
        body: JSON.stringify({
          reportId: 'rep_srv_1',
          age: 40,
          results: [{ testCode: 'GLUCOSE', testName: 'Đường huyết', value: 5.5, valueType: 'NUMERIC', unit: 'mmol/L', referenceLow: 3.9, referenceHigh: 6.1, referenceText: '3.9 - 6.1' }],
        }),
      });
      expect(analyzeRes.status).toBe(200);
      expect((await analyzeRes.json()).bundle.analysis.reportId).toBe('rep_srv_1');

      // 3. Chat
      const chatRes = await fetch(`${baseUrl}/api/patient/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer tok' },
        body: JSON.stringify({ message: 'Chỉ số glucose 5.5 có tốt không?' }),
      });
      expect(chatRes.status).toBe(200);
      expect((await chatRes.json()).reply).toContain('Phản hồi an toàn từ máy chủ');

      // 4. Agent Turn
      const agentRes = await fetch(`${baseUrl}/api/patient/agent/turn`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer tok' },
        body: JSON.stringify({ sessionId: 's1', taskId: 't1', turnId: 'turn1', userMessage: 'Giải thích giúp tôi' }),
      });
      expect(agentRes.status).toBe(200);
      expect((await agentRes.json()).success).toBe(true);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});

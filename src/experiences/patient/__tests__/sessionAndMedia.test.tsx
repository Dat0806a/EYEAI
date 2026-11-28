import React, { useEffect } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import { AuthProvider, useAuthContext } from '../../../context/AuthContext';
import { PatientModeProvider, usePatientMode } from '../mode/PatientModeProvider';
import { VerifiedMedia } from '../components/VerifiedMedia';
import { supabase } from '../../../lib/supabase';
import {
  searchDynamicFoodImage,
  searchDynamicExerciseVideo,
} from '../../../../server/patientMediaSearch';

function AuthSessionObserver({
  onLoadingChange,
  onAuthSnapshot,
}: {
  onLoadingChange: (loading: boolean, mfaSatisfied: boolean) => void;
  onAuthSnapshot: (snap: {
    userId: string | null;
    accountType: string | null;
    accessToken: string | null;
    mfaSatisfied: boolean;
  }) => void;
}) {
  const auth = useAuthContext();
  useEffect(() => {
    onLoadingChange(auth.loading || auth.mfaLoading, auth.mfaSatisfied);
    onAuthSnapshot({
      userId: auth.userId,
      accountType: auth.profile?.account_type ?? null,
      accessToken: auth.session?.access_token ?? null,
      mfaSatisfied: auth.mfaSatisfied,
    });
  }, [
    auth.loading,
    auth.mfaLoading,
    auth.mfaSatisfied,
    auth.userId,
    auth.profile?.account_type,
    auth.session?.access_token,
    onLoadingChange,
    onAuthSnapshot,
  ]);
  return <div data-testid="auth-role">{auth.profile?.account_type || 'none'}</div>;
}

describe('Session Persistence on Tab Switch & Dynamic Patient Media', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.unstubAllGlobals();
  });

  it.each(['impaired', 'patient'] as const)(
    'keeps %s session hydrated without reloading or toggling loading when Supabase emits TOKEN_REFRESHED / SIGNED_IN on tab switch',
    async (accountType) => {
      let authCallback: ((event: string, session: any) => void) | null = null;
      const userObj = {
        id: `user-${accountType}-1`,
        email: `${accountType}@eyetalk.vn`,
        app_metadata: { account_type: accountType },
        user_metadata: { display_name: `User ${accountType}` },
      };
      const initialSession = { access_token: 'tok-initial', user: userObj };

      vi.spyOn(supabase.auth, 'getSession').mockResolvedValue({
        data: { session: initialSession as any },
        error: null,
      });
      vi.spyOn(supabase.auth, 'onAuthStateChange').mockImplementation((cb: any) => {
        authCallback = cb;
        return { data: { subscription: { unsubscribe: vi.fn() } } } as any;
      });
      vi.spyOn(supabase.auth.mfa, 'getAuthenticatorAssuranceLevel').mockResolvedValue({
        data: { currentLevel: 'aal1', nextLevel: 'aal1', currentAuthenticationMethods: [] },
        error: null,
      } as any);
      vi.spyOn(supabase.auth.mfa, 'listFactors').mockResolvedValue({
        data: { all: [], totp: [] },
        error: null,
      } as any);

      vi.spyOn(supabase, 'from').mockImplementation((table: string) => {
        if (table === 'user_account_policies') {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: {
                    account_type: accountType,
                    mfa_enforced: false,
                    role_verified: true,
                    requires_role_review: false,
                  },
                  error: null,
                }),
              }),
            }),
          } as any;
        }
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: { id: userObj.id, display_name: `User ${accountType}`, avatar_url: null },
                error: null,
              }),
            }),
          }),
        } as any;
      });

      const loadingTransitionsAfterBoot: boolean[] = [];
      let bootComplete = false;
      let latestSnapshot: any = null;

      render(
        <AuthProvider>
          <AuthSessionObserver
            onLoadingChange={(isLoading, mfaSatisfied) => {
              if (bootComplete) {
                loadingTransitionsAfterBoot.push(isLoading || !mfaSatisfied);
              }
            }}
            onAuthSnapshot={(snap) => {
              latestSnapshot = snap;
            }}
          />
        </AuthProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('auth-role')).toHaveTextContent(accountType);
        expect(latestSnapshot?.mfaSatisfied).toBe(true);
      });

      bootComplete = true;

      // Simulate browser tab switch / app switch returning focus -> Supabase emits TOKEN_REFRESHED & SIGNED_IN
      await act(async () => {
        authCallback?.('TOKEN_REFRESHED', {
          access_token: 'tok-refreshed-1',
          user: userObj,
        });
        authCallback?.('SIGNED_IN', {
          access_token: 'tok-refreshed-2',
          user: userObj,
        });
      });

      // Session token is updated silently, and loading/unmount NEVER triggered
      expect(latestSnapshot.accessToken).toBe('tok-refreshed-2');
      expect(latestSnapshot.accountType).toBe(accountType);
      expect(latestSnapshot.mfaSatisfied).toBe(true);
      expect(loadingTransitionsAfterBoot.some((didReload) => didReload === true)).toBe(false);
    }
  );

  it('PatientModeProvider preserves selected mode across silent session refreshes for the same patient', () => {
    function ModeConsumer() {
      const { mode, selectMode } = usePatientMode();
      return (
        <div>
          <span data-testid="patient-mode">{mode ?? 'null'}</span>
          <button type="button" onClick={() => selectMode('default')}>
            Choose Default
          </button>
        </div>
      );
    }

    const { rerender } = render(
      <PatientModeProvider userId="pat-1" accountType="patient" isAuthenticated={true}>
        <ModeConsumer />
      </PatientModeProvider>
    );

    act(() => {
      screen.getByText('Choose Default').click();
    });
    expect(screen.getByTestId('patient-mode')).toHaveTextContent('default');

    // Transient auth re-render with same userId does not wipe mode
    rerender(
      <PatientModeProvider userId="pat-1" accountType="patient" isAuthenticated={false}>
        <ModeConsumer />
      </PatientModeProvider>
    );
    expect(screen.getByTestId('patient-mode')).toHaveTextContent('default');
  });

  it('searchDynamicFoodImage fetches Google Custom Search images when configured and falls back cleanly to Openverse/Wikipedia', async () => {
    process.env.GOOGLE_CUSTOM_SEARCH_API_KEY = 'google-cse-key';
    process.env.GOOGLE_CUSTOM_SEARCH_CX = 'google-cx-id';

    const fetchMock = vi.fn(async (url: RequestInfo | URL) => {
      const target = String(url);
      if (target.includes('googleapis.com/customsearch/v1')) {
        return new Response(
          JSON.stringify({
            items: [
              {
                link: 'https://cdn.example.com/pho-bo-google.jpg',
                title: 'Phở bò Hà Nội',
                displayLink: 'amthuc.example.com',
                image: { contextLink: 'https://amthuc.example.com/pho-bo' },
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      return new Response('{}', { status: 404 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const googleRes = await searchDynamicFoodImage({
      name: 'Phở bò tái nạc',
      mealType: 'BREAKFAST',
      searchQuery: 'vietnamese beef pho',
    });

    expect(googleRes.imageProvider).toBe('GOOGLE_CUSTOM_SEARCH');
    expect(googleRes.imageUrl).toBe('https://cdn.example.com/pho-bo-google.jpg');
    expect(googleRes.imageAuthor).toBe('amthuc.example.com');
  });

  it('searchDynamicExerciseVideo searches YouTube Data API with videoEmbeddable=true and avoids duplicates', async () => {
    process.env.YOUTUBE_API_KEY = 'yt-test-key';

    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: RequestInfo | URL) => {
        const target = String(url);
        expect(target).toContain('videoEmbeddable=true');
        return new Response(
          JSON.stringify({
            items: [
              {
                id: { videoId: 'embedVid1' },
                snippet: {
                  title: 'Đi bộ nhẹ nhàng tại nhà',
                  channelTitle: 'Health Channel',
                  channelId: 'ch1',
                  thumbnails: { high: { url: 'https://i.ytimg.com/vi/embedVid1/hqdefault.jpg' } },
                },
              },
              {
                id: { videoId: 'embedVid2' },
                snippet: {
                  title: 'Yoga phục hồi buổi sáng',
                  channelTitle: 'Yoga Channel',
                  channelId: 'ch2',
                  thumbnails: { high: { url: 'https://i.ytimg.com/vi/embedVid2/hqdefault.jpg' } },
                },
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      })
    );

    const used = new Set<string>();
    const first = await searchDynamicExerciseVideo({
      name: 'Đi bộ tại nhà',
      searchQuery: 'bài tập đi bộ nhẹ nhàng tại nhà',
      excludeVideoIds: used,
    });
    const second = await searchDynamicExerciseVideo({
      name: 'Đi bộ tại nhà 2',
      searchQuery: 'bài tập đi bộ nhẹ nhàng tại nhà',
      excludeVideoIds: used,
    });

    expect(first.videoProvider).toBe('YOUTUBE_DATA_API');
    expect(first.youtubeVideoId).toBe('embedVid1');
    expect(second.youtubeVideoId).toBe('embedVid2');
  });

  it('VerifiedMedia embeds exercise video directly in-app without external YouTube redirect links and renders Google meal image', () => {
    const { container } = render(
      <div>
        <VerifiedMedia
          kind="meal"
          item={{
            mealType: 'LUNCH',
            name: 'Cá hồi hấp gừng',
            description: 'Món trưa thanh đạm',
            ingredients: 'Cá hồi, gừng',
            preparation: 'Hấp 12 phút',
            rationale: 'Giàu omega-3',
            imageUrl: 'https://cdn.example.com/steamed-salmon.jpg',
            imageAlt: 'Cá hồi hấp gừng',
            imageAuthor: 'google.com',
            imageProvider: 'GOOGLE_CUSTOM_SEARCH',
          }}
        />
        <VerifiedMedia
          kind="exercise"
          item={{
            name: 'Yoga ghế nhẹ nhàng',
            description: 'Tập trên ghế',
            duration: 15,
            difficulty: 'EASY',
            rationale: 'Bảo vệ khớp',
            youtubeVideoId: 'rkb3DWS82zM',
            youtubeTitle: 'Yoga cơ bản tại nhà',
            youtubeAuthor: 'Hoàng Uyên Yoga',
            youtubeAuthorUrl: 'https://www.youtube.com/@hoanguyenyoga',
            youtubeVerified: true,
          }}
        />
      </div>
    );

    const img = screen.getByAltText('Cá hồi hấp gừng') as HTMLImageElement;
    expect(img.src).toBe('https://cdn.example.com/steamed-salmon.jpg');
    expect(screen.getByText('Google Images')).toBeInTheDocument();

    const iframe = container.querySelector('iframe') as HTMLIFrameElement;
    expect(iframe).not.toBeNull();
    expect(iframe.src).toContain('https://www.youtube-nocookie.com/embed/rkb3DWS82zM');
    expect(iframe).toHaveAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
    expect(screen.getByText('Phát trực tiếp trong ứng dụng')).toBeInTheDocument();
    expect(container.querySelectorAll('a')).toHaveLength(0);
  });
});

import React, { createContext, useContext } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, fireEvent, waitFor } from '@testing-library/react';
import { CallProvider, useCall } from '../CallProvider';
import { signalingService } from '../signalingService';
import { supabase } from '../../../lib/supabase';
import { HumanChatPage } from '../../../pages/HumanChatPage';

interface AuthValue {
  user: { id: string } | null;
  profile: { id: string; display_name: string; avatar_url: string | null } | null;
  mfaSatisfied: boolean;
}

const TestAuthContext = createContext<AuthValue>({
  user: { id: 'caller-uuid' },
  profile: { id: 'caller-uuid', display_name: 'Người gọi', avatar_url: null },
  mfaSatisfied: true,
});

vi.mock('../../../hooks/useAuth', () => ({
  useAuth: () => useContext(TestAuthContext),
}));

vi.mock('../../eye-control/useEyeTracking', () => ({
  useEyeTrackingSettings: () => ({
    settings: { eyeControlEnabled: false },
  }),
}));

vi.mock('../../eye-control/EyeNavigationProvider', () => ({
  useEyeNavigationContext: () => ({
    activeFocusId: null,
    registerFocusNode: vi.fn(),
    unregisterFocusNode: vi.fn(),
    setFocusId: vi.fn(),
    setKeyboardOpen: vi.fn(),
  }),
}));

vi.mock('../../eye-control/EyeFocusScopeContext', () => ({
  useEyeFocusScope: () => null,
}));

vi.mock('../../../utils/speech', () => ({
  speakVietnamese: vi.fn(),
}));

vi.mock('../../../services/chat/chatService', () => ({
  chatService: {
    getOrCreateConversation: vi.fn().mockResolvedValue('conv-1'),
    getMessages: vi.fn().mockResolvedValue([]),
    subscribeToMessages: vi.fn(() => ({ unsubscribe: vi.fn() })),
    sendMessage: vi.fn().mockResolvedValue(null),
  },
}));

vi.mock('../../../components/ui/KeyboardHudSlot', () => ({
  KeyboardHudSlot: () => null,
}));

vi.mock('../../virtual-keyboard/VirtualKeyboard', () => ({
  VirtualKeyboard: () => null,
}));

class MockRealtimeHub {
  private subscribers = new Map<string, Array<{ id: string; callback: (payload: any) => void }>>();

  createChannel(topic: string, ownerId: string, delaySubscribeMs = 15) {
    let broadcastHandler: ((msg: { payload: any }) => void) | null = null;
    const subId = `${ownerId}-${Math.random().toString(36).slice(2)}`;
    const hub = this;

    const channel: any = {
      topic,
      on: vi.fn((_type: string, _filter: any, cb: (msg: { payload: any }) => void) => {
        broadcastHandler = cb;
        return channel;
      }),
      subscribe: vi.fn((statusCb?: (status: string) => void) => {
        setTimeout(() => {
          const list = hub.subscribers.get(topic) || [];
          list.push({
            id: subId,
            callback: payload => {
              broadcastHandler?.({ payload });
            },
          });
          hub.subscribers.set(topic, list);
          statusCb?.('SUBSCRIBED');
        }, delaySubscribeMs);
        return channel;
      }),
      send: vi.fn(async ({ payload }: { payload: any }) => {
        const list = hub.subscribers.get(topic) || [];
        for (const entry of list) {
          if (entry.id !== subId) {
            setTimeout(() => entry.callback(payload), 0);
          }
        }
        return 'ok';
      }),
      unsubscribe: vi.fn(async () => {
        const list = hub.subscribers.get(topic) || [];
        hub.subscribers.set(
          topic,
          list.filter(entry => entry.id !== subId)
        );
        return 'ok';
      }),
    };
    return channel;
  }
}

class MockRTCPeerConnection {
  static instances: MockRTCPeerConnection[] = [];
  signalingState: RTCSignalingState = 'stable';
  iceGatheringState: RTCIceGatheringState = 'new';
  iceConnectionState: RTCIceConnectionState = 'new';
  connectionState: RTCPeerConnectionState = 'new';
  localDescription: RTCSessionDescriptionInit | null = null;
  remoteDescription: RTCSessionDescriptionInit | null = null;
  onicecandidate: ((ev: any) => void) | null = null;
  ontrack: ((ev: any) => void) | null = null;
  onconnectionstatechange: (() => void) | null = null;
  oniceconnectionstatechange: (() => void) | null = null;
  private senders: Array<{ track: MediaStreamTrack | null }> = [];
  private receivers: Array<{ track: MediaStreamTrack | null }> = [];
  addedIceCandidates: RTCIceCandidateInit[] = [];

  constructor() {
    MockRTCPeerConnection.instances.push(this);
  }

  addTrack(track: MediaStreamTrack) {
    this.senders.push({ track });
    return { track } as RTCRtpSender;
  }

  getSenders() {
    return this.senders as unknown as RTCRtpSender[];
  }

  getReceivers() {
    return this.receivers as unknown as RTCRtpReceiver[];
  }

  async createOffer(): Promise<RTCSessionDescriptionInit> {
    return { type: 'offer', sdp: 'v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\n' };
  }

  async createAnswer(): Promise<RTCSessionDescriptionInit> {
    return { type: 'answer', sdp: 'v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\n' };
  }

  async setLocalDescription(desc: RTCSessionDescriptionInit) {
    this.localDescription = desc;
    this.signalingState = desc.type === 'offer' ? 'have-local-offer' : 'stable';
    queueMicrotask(() => {
      this.onicecandidate?.({
        candidate: {
          protocol: 'udp',
          toJSON: () => ({ candidate: `candidate:${desc.type}:1`, sdpMid: '0', sdpMLineIndex: 0 }),
        },
      });
    });
  }

  async setRemoteDescription(desc: RTCSessionDescriptionInit) {
    this.remoteDescription = desc;
    if (desc.type === 'offer') {
      this.signalingState = 'have-remote-offer';
    } else if (desc.type === 'answer') {
      this.signalingState = 'stable';
    }
  }

  async addIceCandidate(candidate: RTCIceCandidateInit) {
    this.addedIceCandidates.push(candidate);
  }

  async getStats() {
    return new Map();
  }

  triggerConnected(remoteAudioTrack: MediaStreamTrack) {
    this.receivers.push({ track: remoteAudioTrack });
    this.ontrack?.({ track: remoteAudioTrack });
    this.iceConnectionState = 'connected';
    this.connectionState = 'connected';
    this.onconnectionstatechange?.();
  }

  close() {
    this.signalingState = 'closed';
    this.connectionState = 'closed';
  }
}

function makeFakeAudioTrack(id: string): MediaStreamTrack {
  return {
    id,
    kind: 'audio',
    label: `Mic ${id}`,
    readyState: 'live',
    enabled: true,
    stop: vi.fn(),
  } as unknown as MediaStreamTrack;
}

class MockMediaStream {
  private tracks: MediaStreamTrack[];
  constructor(tracks: MediaStreamTrack[] = []) {
    this.tracks = [...tracks];
  }
  getTracks() {
    return this.tracks;
  }
  getAudioTracks() {
    return this.tracks.filter(t => t.kind === 'audio');
  }
  getVideoTracks() {
    return this.tracks.filter(t => t.kind === 'video');
  }
  addTrack(track: MediaStreamTrack) {
    this.tracks.push(track);
  }
}

describe('WebRTC Call Flow & Signaling Reliability', () => {
  beforeEach(() => {
    MockRTCPeerConnection.instances = [];
    vi.restoreAllMocks();
    (globalThis as any).RTCPeerConnection = MockRTCPeerConnection;
    (globalThis as any).RTCSessionDescription = class {
      type: RTCSdpType;
      sdp?: string;
      constructor(init: RTCSessionDescriptionInit) {
        this.type = init.type;
        this.sdp = init.sdp;
      }
    };
    (globalThis as any).RTCIceCandidate = class {
      candidate?: string;
      constructor(init: RTCIceCandidateInit) {
        this.candidate = init.candidate;
      }
    };
    (globalThis as any).MediaStream = MockMediaStream;

    Object.defineProperty(globalThis.navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: vi.fn(async () => new MockMediaStream([makeFakeAudioTrack('local-audio')])),
      },
    });

    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('waits for call_room subscription readiness before broadcasting signals in signalingService', async () => {
    const hub = new MockRealtimeHub();
    vi.spyOn(supabase, 'channel').mockImplementation((topic: string) => hub.createChannel(topic, 'caller', 30));

    const channel = signalingService.joinCallRoom('call-ready-1', vi.fn());
    const sendPromise = signalingService.sendToCallRoom(channel, {
      type: 'call:accept',
      callId: 'call-ready-1',
      senderId: 'u1',
      receiverId: 'u2',
      senderName: 'User 1',
    });

    expect((channel as any).send).not.toHaveBeenCalled();

    const sent = await sendPromise;
    expect(sent).toBe(true);
    expect((channel as any).send).toHaveBeenCalledTimes(1);
  });

  it('connects caller and callee end-to-end when callee accepts after ringing (no lost offer or ICE)', async () => {
    const hub = new MockRealtimeHub();
    const CALL_ID = '11111111-1111-4111-8111-111111111111';
    const CALLER_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const CALLEE_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

    vi.spyOn(supabase, 'from').mockImplementation(() => {
      const chain: any = {
        insert: () => chain,
        update: () => chain,
        eq: async () => ({ data: null, error: null }),
        select: () => chain,
        single: async () => ({ data: { id: CALL_ID }, error: null }),
      };
      return chain;
    });

    vi.spyOn(supabase, 'removeChannel').mockImplementation((ch: any) => {
      void ch?.unsubscribe?.();
      return Promise.resolve('ok' as any);
    });

    let channelCounter = 0;
    vi.spyOn(supabase, 'channel').mockImplementation((topic: string) => {
      channelCounter += 1;
      return hub.createChannel(topic, `peer-${channelCounter}`, 20);
    });

    const calleeAuth: AuthValue = {
      user: { id: CALLEE_ID },
      profile: { id: CALLEE_ID, display_name: 'Người nhận', avatar_url: null },
      mfaSatisfied: true,
    };

    const callerAuth: AuthValue = {
      user: { id: CALLER_ID },
      profile: { id: CALLER_ID, display_name: 'Người gọi', avatar_url: null },
      mfaSatisfied: true,
    };

    let calleeApi: ReturnType<typeof useCall> | null = null;
    function CalleeProbe() {
      calleeApi = useCall();
      return <div data-testid="callee-state">{calleeApi.callState}</div>;
    }

    const calleeView = render(
      <TestAuthContext.Provider value={calleeAuth}>
        <CallProvider>
          <CalleeProbe />
        </CallProvider>
      </TestAuthContext.Provider>
    );

    let callerApi: ReturnType<typeof useCall> | null = null;
    function CallerProbe() {
      callerApi = useCall();
      return <div data-testid="caller-state">{callerApi.callState}</div>;
    }

    const callerView = render(
      <TestAuthContext.Provider value={callerAuth}>
        <CallProvider>
          <CallerProbe />
        </CallProvider>
      </TestAuthContext.Provider>
    );

    // Wait for both global user_signaling channels to subscribe
    await act(async () => {
      await new Promise(r => setTimeout(r, 40));
    });

    // Caller initiates call
    await act(async () => {
      await callerApi!.startCall(CALLEE_ID, 'Người nhận', 'voice');
    });

    // Wait for call:ring delivery to Callee
    await waitFor(() => {
      expect(calleeView.getByTestId('callee-state').textContent).toBe('ringing');
    });
    expect(callerView.getByTestId('caller-state').textContent).toBe('ringing');

    // Callee clicks Accept (even immediately before/during call_room subscribe!)
    await act(async () => {
      await calleeApi!.acceptCall();
    });

    // Wait for full WebRTC SDP Offer/Answer & ICE candidate exchange on both peers
    await waitFor(() => {
      expect(MockRTCPeerConnection.instances.length).toBe(2);
      const [calleePc, callerPc] = MockRTCPeerConnection.instances;
      expect(callerPc.localDescription?.type).toBe('offer');
      expect(callerPc.remoteDescription?.type).toBe('answer');
      expect(calleePc.remoteDescription?.type).toBe('offer');
      expect(calleePc.localDescription?.type).toBe('answer');
      expect(callerPc.addedIceCandidates.length).toBeGreaterThanOrEqual(1);
      expect(calleePc.addedIceCandidates.length).toBeGreaterThanOrEqual(1);
    });

    // Simulate WebRTC ICE/DTLS reaching connected on both peers
    await act(async () => {
      const [calleePc, callerPc] = MockRTCPeerConnection.instances;
      calleePc.triggerConnected(makeFakeAudioTrack('remote-from-caller'));
      callerPc.triggerConnected(makeFakeAudioTrack('remote-from-callee'));
    });

    await waitFor(() => {
      expect(calleeView.getByTestId('callee-state').textContent).toBe('accepted');
      expect(callerView.getByTestId('caller-state').textContent).toBe('accepted');
    });
  });

  it('triggers startCall only once when clicking Voice Call button in HumanChatPage', async () => {
    const callerAuth: AuthValue = {
      user: { id: 'caller-uuid' },
      profile: { id: 'caller-uuid', display_name: 'Người gọi', avatar_url: null },
      mfaSatisfied: true,
    };

    vi.spyOn(supabase, 'channel').mockReturnValue({
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn().mockReturnThis(),
      send: vi.fn().mockResolvedValue('ok'),
      unsubscribe: vi.fn().mockResolvedValue('ok'),
      teardown: vi.fn(),
    } as any);
    vi.spyOn(supabase, 'removeChannel').mockResolvedValue('ok' as any);

    const fromSpy = vi.spyOn(supabase, 'from').mockImplementation(() => {
      const chain: any = {
        insert: () => chain,
        select: () => chain,
        single: async () => ({ data: { id: 'call-single-1' }, error: null }),
      };
      return chain;
    });

    render(
      <TestAuthContext.Provider value={callerAuth}>
        <CallProvider>
          <HumanChatPage
            friend={{ id: 'friend-1', name: 'Lan' }}
            onBack={vi.fn()}
          />
        </CallProvider>
      </TestAuthContext.Provider>
    );

    const voiceBtn = screen.getByTitle('Gọi thoại');
    await act(async () => {
      fireEvent.click(voiceBtn);
    });

    const callInserts = fromSpy.mock.calls.filter(([table]) => table === 'calls');
    expect(callInserts.length).toBe(1);
  });
});

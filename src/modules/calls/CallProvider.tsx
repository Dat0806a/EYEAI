import React, { createContext, useContext, useState, useEffect, useRef, ReactNode } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';
import { useEyeTrackingSettings } from '../eye-control/useEyeTracking';
import { signalingService } from './signalingService';
import { WebRTCService } from './webrtcService';
import { CallType, CallStatus, SignalingPayload, CallSession } from '../../types/chat';
import { AppButton } from '../../components/ui/AppButton';
import { speakVietnamese } from '../../utils/speech';
import { Phone, PhoneOff, Video, Mic, MicOff, VideoOff, Volume2, User, AlertTriangle } from 'lucide-react';
import { RealtimeChannel } from '@supabase/supabase-js';

interface CallContextType {
  callSession: CallSession | null;
  callState: CallStatus;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  isMuted: boolean;
  isVideoOff: boolean;
  startCall: (friendId: string, friendName: string, callType: CallType, friendAvatar?: string | null) => Promise<void>;
  acceptCall: () => Promise<void>;
  declineCall: () => Promise<void>;
  endCall: () => Promise<void>;
  toggleMute: () => void;
  toggleCamera: () => void;
}

const CallContext = createContext<CallContextType | undefined>(undefined);

export function CallProvider({ children }: { children: ReactNode }) {
  const { user, profile } = useAuth();
  const { settings } = useEyeTrackingSettings(); // Access Eye Tracking cameraStream

  const [callSession, setCallSession] = useState<CallSession | null>(null);
  const [callState, setCallState] = useState<CallStatus>('idle');
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);

  const webrtcRef = useRef<WebRTCService | null>(null);
  const callRoomChannelRef = useRef<RealtimeChannel | null>(null);
  const callTracksToStopRef = useRef<MediaStreamTrack[]>([]);
  const pendingOfferRef = useRef<RTCSessionDescriptionInit | null>(null);
  const callTimerRef = useRef<number | null>(null);
  const connectTimeoutRef = useRef<number | null>(null);

  const callStateRef = useRef<CallStatus>('idle');
  const callSessionRef = useRef<CallSession | null>(null);
  const profileRef = useRef(profile);

  const currentUserId = user?.id;

  // Synchronize refs
  useEffect(() => {
    callStateRef.current = callState;
  }, [callState]);

  useEffect(() => {
    callSessionRef.current = callSession;
  }, [callSession]);

  useEffect(() => {
    profileRef.current = profile;
  }, [profile]);

  /**
   * Get or create WebRTCService singleton (STABLE LIFECYCLE)
   */
  const getWebRTCService = (): WebRTCService => {
    if (!webrtcRef.current) {
      console.log('[CALL][WEBRTC] Instantiating new WebRTCService instance');
      webrtcRef.current = new WebRTCService({
        onIceCandidate: candidate => {
          if (callSessionRef.current && currentUserId && callRoomChannelRef.current) {
            const targetId =
              callSessionRef.current.caller_id === currentUserId
                ? callSessionRef.current.callee_id
                : callSessionRef.current.caller_id;
            console.log('[CALL][WEBRTC] Broadcasting ICE candidate to room');
            signalingService.sendToCallRoom(callRoomChannelRef.current, {
              type: 'webrtc:ice-candidate',
              callId: callSessionRef.current.id,
              senderId: currentUserId,
              receiverId: targetId,
              senderName: profileRef.current?.display_name || 'Người dùng',
              candidate,
            });
          }
        },
        onRemoteStream: stream => {
          console.log('[CALL][WEBRTC] Remote stream callback. Tracks:', stream.getTracks().map(t => `${t.kind}:${t.readyState}`));
          setRemoteStream(stream);
        },
        onConnectionStateChange: async state => {
          console.log('[CALL][WEBRTC] Connection state transitioned to:', state);
          if (state === 'connected') {
            if (connectTimeoutRef.current) clearTimeout(connectTimeoutRef.current);
            setCallState('accepted');
            speakVietnamese('Âm thanh cuộc gọi đã kết nối');
            if (webrtcRef.current) {
              await webrtcRef.current.getRtpStats();
            }
          } else if (state === 'failed') {
            console.warn('[CALL][WEBRTC] Connection state FAILED');
            if (connectTimeoutRef.current) clearTimeout(connectTimeoutRef.current);
            setCallState('failed');
          } else if (state === 'disconnected') {
            handleCleanup();
          }
        },
      });
    }
    return webrtcRef.current;
  };

  /**
   * Handle WebRTC signaling events inside the dedicated Call Room
   */
  const handleRoomSignaling = async (payload: SignalingPayload) => {
    console.log('[CALL][SIGNAL] Call Room received event:', payload.type, 'from:', payload.senderName);

    switch (payload.type) {
      case 'call:accept': {
        console.log('[CALL][SIGNAL] Receiver accepted call');
        setCallState('connecting');
        startConnectTimeout();
        break;
      }

      case 'webrtc:offer': {
        console.log('[CALL][WEBRTC] Received offer SDP from:', payload.senderName);
        pendingOfferRef.current = payload.sdp || null;
        break;
      }

      case 'webrtc:answer': {
        console.log('[CALL][WEBRTC] Received answer SDP from receiver');
        if (payload.sdp) {
          const webrtc = getWebRTCService();
          await webrtc.handleAnswer(payload.sdp);
        }
        break;
      }

      case 'webrtc:ice-candidate': {
        if (payload.candidate) {
          const webrtc = getWebRTCService();
          await webrtc.addIceCandidate(payload.candidate);
        }
        break;
      }

      case 'call:decline':
      case 'call:hangup': {
        speakVietnamese('Cuộc gọi đã kết thúc');
        handleCleanup();
        break;
      }
    }
  };

  // Global Signaling Listener for Current User (Incoming ring notification)
  useEffect(() => {
    if (!currentUserId) return;

    const channel = signalingService.subscribeToUserSignaling(currentUserId, async payload => {
      if (payload.type === 'call:ring') {
        if (callStateRef.current !== 'idle') {
          console.log('[CALL][Realtime] User is busy, declining incoming call:', payload.callId);
          signalingService.sendUserSignal(payload.senderId, {
            type: 'call:decline',
            callId: payload.callId,
            senderId: currentUserId,
            receiverId: payload.senderId,
            senderName: profileRef.current?.display_name || 'Người dùng',
            reason: 'busy',
          });
          return;
        }

        setCallSession({
          id: payload.callId,
          caller_id: payload.senderId,
          callee_id: currentUserId,
          caller_name: payload.senderName,
          caller_avatar: payload.senderAvatar,
          type: payload.callType || 'voice',
          status: 'ringing',
          created_at: new Date().toISOString(),
        });
        setCallState('ringing');
        speakVietnamese(`Có cuộc gọi thoại đến từ ${payload.senderName}`);

        // Callee immediately joins the dedicated Call Room channel
        if (callRoomChannelRef.current) {
          supabase.removeChannel(callRoomChannelRef.current);
        }
        callRoomChannelRef.current = signalingService.joinCallRoom(payload.callId, handleRoomSignaling);
      }
    });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentUserId]);

  /**
   * Start 20s Connection Timeout Safety Gate
   */
  const startConnectTimeout = () => {
    if (connectTimeoutRef.current) clearTimeout(connectTimeoutRef.current);
    connectTimeoutRef.current = window.setTimeout(() => {
      if (callStateRef.current === 'connecting') {
        console.warn('[CALL][TIMEOUT] Voice call connection timed out after 20s');
        speakVietnamese('Không thể kết nối cuộc gọi thoại');
        setCallState('failed');
      }
    }, 20000);
  };

  /**
   * Acquire local media stream SAFELY preserving Eye Tracking camera
   */
  const acquireMediaStream = async (type: CallType): Promise<MediaStream> => {
    const tracks: MediaStreamTrack[] = [];
    const callTracksToStop: MediaStreamTrack[] = [];

    // Microphone Track
    try {
      console.log('[CALL][MEDIA] Requesting microphone access...');
      const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      const audioTrack = audioStream.getAudioTracks()[0];
      if (audioTrack) {
        tracks.push(audioTrack);
        callTracksToStop.push(audioTrack);
        console.log('[CALL][MEDIA] Microphone track acquired:', audioTrack.label);
      }
    } catch (e) {
      console.warn('[CALL][MEDIA] Microphone access failed or denied:', e);
    }

    callTracksToStopRef.current = callTracksToStop;
    const combinedStream = new MediaStream(tracks);
    setLocalStream(combinedStream);
    return combinedStream;
  };

  /**
   * Start Outgoing Voice Call
   */
  const startCall = async (
    friendId: string,
    friendName: string,
    callType: CallType = 'voice',
    friendAvatar?: string | null
  ) => {
    if (!currentUserId) {
      console.warn('[CALL] Cannot start call: User not authenticated');
      return;
    }

    console.log('[CALL][UI] Starting voice call to:', friendName, 'ID:', friendId);

    // 1. Create DB call session row
    let callId = crypto.randomUUID();
    try {
      const { data: callRow } = await supabase
        .from('calls')
        .insert({
          caller_id: currentUserId,
          callee_id: friendId,
          type: 'voice',
          status: 'ringing',
        })
        .select('id')
        .single();

      if (callRow?.id) {
        callId = callRow.id;
        console.log('[CALL][DB] Inserted call row into database with ID:', callId);
      }
    } catch (err) {
      console.warn('[CALL][DB] Failed to insert call row, fallback to UUID:', err);
    }

    const session: CallSession = {
      id: callId,
      caller_id: currentUserId,
      callee_id: friendId,
      caller_name: profile?.display_name || 'Người dùng',
      callee_name: friendName,
      callee_avatar: friendAvatar,
      type: 'voice',
      status: 'ringing',
      created_at: new Date().toISOString(),
    };

    // 2. Update UI state to outgoing_ringing & Join Call Room
    setCallSession(session);
    setCallState('ringing');
    speakVietnamese(`Đang gọi thoại cho ${friendName}`);

    if (callRoomChannelRef.current) {
      supabase.removeChannel(callRoomChannelRef.current);
    }
    callRoomChannelRef.current = signalingService.joinCallRoom(callId, handleRoomSignaling);

    // 3. Send ring notification to Callee's global incoming channel
    console.log('[CALL][SIGNAL] Sending call:ring signal to callee global channel:', friendId);
    await signalingService.sendUserSignal(friendId, {
      type: 'call:ring',
      callId,
      senderId: currentUserId,
      receiverId: friendId,
      senderName: profile?.display_name || 'Người dùng',
      senderAvatar: profile?.avatar_url,
      callType: 'voice',
    });

    // 4. Acquire Media Stream & Init WebRTC Offer
    const stream = await acquireMediaStream('voice');
    const webrtc = getWebRTCService();
    webrtc.addLocalStream(stream);
    const offer = await webrtc.createOffer();

    // 5. Broadcast offer over Call Room
    console.log('[CALL][SIGNAL] Broadcasting webrtc:offer over Call Room channel');
    await signalingService.sendToCallRoom(callRoomChannelRef.current, {
      type: 'webrtc:offer',
      callId,
      senderId: currentUserId,
      receiverId: friendId,
      senderName: profile?.display_name || 'Người dùng',
      sdp: offer,
    });

    // 6. Ringing Timeout (30s)
    callTimerRef.current = window.setTimeout(() => {
      if (callStateRef.current === 'ringing') {
        speakVietnamese('Người thân không nghe máy');
        endCall();
      }
    }, 30000);
  };

  /**
   * Accept Incoming Voice Call
   */
  const acceptCall = async () => {
    if (!callSession || !currentUserId) return;

    console.log('[CALL][UI] Accepting incoming voice call from:', callSession.caller_name);
    if (callTimerRef.current) clearTimeout(callTimerRef.current);
    setCallState('connecting');
    startConnectTimeout();

    try {
      await supabase
        .from('calls')
        .update({ status: 'accepted', answered_at: new Date().toISOString() })
        .eq('id', callSession.id);
    } catch {
      // Ignore
    }

    const stream = await acquireMediaStream('voice');
    const webrtc = getWebRTCService();
    webrtc.addLocalStream(stream);

    // 1. Broadcast call:accept over Call Room
    console.log('[CALL][SIGNAL] Broadcasting call:accept to Call Room');
    await signalingService.sendToCallRoom(callRoomChannelRef.current, {
      type: 'call:accept',
      callId: callSession.id,
      senderId: currentUserId,
      receiverId: callSession.caller_id,
      senderName: profile?.display_name || 'Người dùng',
    });

    // 2. Broadcast webrtc:answer over Call Room
    if (pendingOfferRef.current) {
      console.log('[CALL][WEBRTC] Creating answer SDP for offer');
      const answer = await webrtc.createAnswer(pendingOfferRef.current);
      console.log('[CALL][SIGNAL] Broadcasting webrtc:answer to Call Room');
      await signalingService.sendToCallRoom(callRoomChannelRef.current, {
        type: 'webrtc:answer',
        callId: callSession.id,
        senderId: currentUserId,
        receiverId: callSession.caller_id,
        senderName: profile?.display_name || 'Người dùng',
        sdp: answer,
      });
    }
  };

  /**
   * Decline Incoming Call
   */
  const declineCall = async () => {
    if (callSession && currentUserId) {
      console.log('[CALL][UI] Declining incoming call from:', callSession.caller_name);
      try {
        await supabase
          .from('calls')
          .update({ status: 'declined', ended_at: new Date().toISOString() })
          .eq('id', callSession.id);
      } catch {
        // Ignore
      }

      await signalingService.sendToCallRoom(callRoomChannelRef.current, {
        type: 'call:decline',
        callId: callSession.id,
        senderId: currentUserId,
        receiverId: callSession.caller_id,
        senderName: profile?.display_name || 'Người dùng',
      });
    }
    handleCleanup();
  };

  /**
   * End Active Call
   */
  const endCall = async () => {
    if (callSession && currentUserId) {
      console.log('[CALL][UI] Ending call session:', callSession.id);
      const targetId = callSession.caller_id === currentUserId ? callSession.callee_id : callSession.caller_id;

      try {
        await supabase
          .from('calls')
          .update({ status: 'ended', ended_at: new Date().toISOString() })
          .eq('id', callSession.id);
      } catch {
        // Ignore
      }

      await signalingService.sendToCallRoom(callRoomChannelRef.current, {
        type: 'call:hangup',
        callId: callSession.id,
        senderId: currentUserId,
        receiverId: targetId,
        senderName: profile?.display_name || 'Người dùng',
      });
    }
    handleCleanup();
  };

  const toggleMute = () => {
    if (localStream) {
      localStream.getAudioTracks().forEach(track => {
        track.enabled = !track.enabled;
        console.log('[CALL][MEDIA] Audio track enabled set to:', track.enabled);
      });
      setIsMuted(!isMuted);
    }
  };

  const toggleCamera = () => {
    if (localStream) {
      localStream.getVideoTracks().forEach(track => {
        track.enabled = !track.enabled;
      });
      setIsVideoOff(!isVideoOff);
    }
  };

  /**
   * Clean up call resources SAFELY without stopping Eye Tracking camera!
   */
  const handleCleanup = () => {
    console.log('[CALL][CLEANUP] Cleaning up call resources');
    if (callTimerRef.current) clearTimeout(callTimerRef.current);
    if (connectTimeoutRef.current) clearTimeout(connectTimeoutRef.current);

    // Leave Call Room Channel
    if (callRoomChannelRef.current) {
      supabase.removeChannel(callRoomChannelRef.current);
      callRoomChannelRef.current = null;
    }

    // Stop ONLY call-specific tracks
    callTracksToStopRef.current.forEach(track => {
      try {
        track.stop();
        console.log('[CALL][CLEANUP] Stopped call microphone track:', track.label);
      } catch {
        // Ignore
      }
    });
    callTracksToStopRef.current = [];

    if (webrtcRef.current) {
      webrtcRef.current.close();
      webrtcRef.current = null;
    }

    setLocalStream(null);
    setRemoteStream(null);
    setCallSession(null);
    setCallState('idle');
    setIsMuted(false);
    setIsVideoOff(false);
    pendingOfferRef.current = null;
  };

  return (
    <CallContext.Provider
      value={{
        callSession,
        callState,
        localStream,
        remoteStream,
        isMuted,
        isVideoOff,
        startCall,
        acceptCall,
        declineCall,
        endCall,
        toggleMute,
        toggleCamera,
      }}
    >
      {children}

      {/* Global Call Overlay Modal */}
      {callState !== 'idle' && (
        <CallOverlayModal
          callSession={callSession}
          callState={callState}
          localStream={localStream}
          remoteStream={remoteStream}
          isMuted={isMuted}
          onAccept={acceptCall}
          onDecline={declineCall}
          onEnd={endCall}
          onToggleMute={toggleMute}
          currentUserId={currentUserId}
        />
      )}
    </CallContext.Provider>
  );
}

export function useCall() {
  const ctx = useContext(CallContext);
  if (!ctx) throw new Error('useCall must be used within CallProvider');
  return ctx;
}

/**
 * Global Call Overlay Modal Component with Remote Audio Element
 */
function CallOverlayModal({
  callSession,
  callState,
  localStream,
  remoteStream,
  isMuted,
  onAccept,
  onDecline,
  onEnd,
  onToggleMute,
  currentUserId,
}: {
  callSession: CallSession | null;
  callState: CallStatus;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  isMuted: boolean;
  onAccept: () => void;
  onDecline: () => void;
  onEnd: () => void;
  onToggleMute: () => void;
  currentUserId?: string;
}) {
  const remoteAudioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    if (remoteAudioRef.current && remoteStream) {
      console.log('[CALL][AUDIO] Attaching remoteStream to remoteAudioRef. Audio tracks:', remoteStream.getAudioTracks().length);
      remoteAudioRef.current.srcObject = remoteStream;
      remoteAudioRef.current.muted = false;
      remoteAudioRef.current.volume = 1.0;
      remoteAudioRef.current
        .play()
        .then(() => console.log('[CALL][AUDIO] Remote audio element playback started successfully'))
        .catch(e => console.warn('[CALL][AUDIO] Remote audio autoplay error:', e));
    }
  }, [remoteStream]);

  const isIncoming = callSession && callSession.callee_id === currentUserId && callState === 'ringing';
  const isOutgoing = callSession && callSession.caller_id === currentUserId && callState === 'ringing';
  const isConnecting = callState === 'connecting';
  const isAccepted = callState === 'accepted';
  const isFailed = callState === 'failed';

  const otherName = isIncoming
    ? callSession.caller_name
    : callSession?.callee_name || 'Người thân';

  return (
    <div className="fixed inset-0 z-[120] bg-[#14213D]/95 backdrop-blur-xl flex flex-col items-center justify-between p-4 md:p-6 text-white animate-fade-in select-none">
      
      {/* Hidden Audio Element for WebRTC Remote Audio Playback */}
      <audio ref={remoteAudioRef} autoPlay playsInline className="hidden" />

      {/* Top Bar Header */}
      <div className="w-full max-w-md flex items-center justify-between pt-2">
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full bg-[#6AC9F0] animate-ping" />
          <span className="font-bold text-sm tracking-wider uppercase text-[#6AC9F0]">
            Cuộc gọi EyeTalk (Thoại)
          </span>
        </div>
      </div>

      {/* Center Stage: Voice Call Presentation */}
      <div className="flex-1 w-full max-w-lg flex flex-col items-center justify-center relative my-4">
        <div className="flex flex-col items-center text-center gap-6 py-6">
          <div className="relative">
            <div className="w-28 h-28 md:w-36 md:h-36 rounded-full bg-[#6AC9F0]/20 border-4 border-[#6AC9F0] flex items-center justify-center shadow-xl animate-pulse">
              {callSession?.caller_avatar ? (
                <img
                  src={callSession.caller_avatar}
                  alt={otherName}
                  className="w-full h-full rounded-full object-cover"
                />
              ) : (
                <User className="w-16 h-16 text-[#6AC9F0]" />
              )}
            </div>
          </div>

          <div>
            <h2 className="text-3xl md:text-4xl font-black text-white">{otherName}</h2>
            <p className="text-base font-semibold mt-2">
              {isIncoming && <span className="text-[#6AC9F0]">Đang gọi thoại cho bạn...</span>}
              {isOutgoing && <span className="text-[#6AC9F0]">Đang gọi...</span>}
              {isConnecting && <span className="text-amber-300 animate-pulse">Đang kết nối âm thanh...</span>}
              {isAccepted && <span className="text-emerald-400">Âm thanh cuộc gọi đã kết nối</span>}
              {isFailed && <span className="text-red-400">Không thể kết nối cuộc gọi</span>}
            </p>
          </div>
        </div>
      </div>

      {/* Bottom Action Controls */}
      <div className="w-full max-w-md pb-6">
        
        {/* INCOMING RINGING ACTIONS: [TỪ CHỐI] [CHẤP NHẬN] */}
        {isIncoming && (
          <div className="grid grid-cols-2 gap-4 w-full">
            <AppButton
              id="btn-call-decline"
              variant="danger"
              size="lg"
              fullWidth
              onClick={onDecline}
              icon={<PhoneOff className="w-6 h-6" />}
              row={0}
              col={0}
            >
              <span>TỪ CHỐI</span>
            </AppButton>

            <AppButton
              id="btn-call-accept"
              variant="primary"
              size="lg"
              fullWidth
              onClick={onAccept}
              icon={<Phone className="w-6 h-6" />}
              row={0}
              col={1}
            >
              <span>CHẤP NHẬN</span>
            </AppButton>
          </div>
        )}

        {/* OUTGOING RINGING ACTION: [HỦY] */}
        {isOutgoing && (
          <div className="w-full">
            <AppButton
              id="btn-call-cancel"
              variant="danger"
              size="lg"
              fullWidth
              onClick={onEnd}
              icon={<PhoneOff className="w-6 h-6" />}
            >
              <span>HỦY CUỘC GỌI</span>
            </AppButton>
          </div>
        )}

        {/* CONNECTING OR CONNECTED OR FAILED CONTROLS */}
        {(isConnecting || isAccepted || isFailed) && (
          <div className="flex flex-col gap-3 w-full">
            {isAccepted && (
              <div className="w-full">
                <AppButton
                  id="btn-call-toggle-mic"
                  variant={isMuted ? 'danger' : 'secondary'}
                  size="md"
                  fullWidth
                  onClick={onToggleMute}
                  icon={isMuted ? <MicOff className="w-[#14213D] h-5" /> : <Mic className="w-5 h-5 text-[#14213D]" />}
                  row={0}
                  col={0}
                >
                  <span>{isMuted ? 'TẮT MIC' : 'MỞ MIC'}</span>
                </AppButton>
              </div>
            )}

            <AppButton
              id="btn-call-end"
              variant="danger"
              size="lg"
              fullWidth
              onClick={onEnd}
              icon={<PhoneOff className="w-6 h-6" />}
              row={1}
              col={0}
            >
              <span>{isFailed ? 'ĐÓNG' : 'KẾT THÚC CUỘC GỌI'}</span>
            </AppButton>
          </div>
        )}
      </div>
    </div>
  );
}

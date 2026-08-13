import { SignalingPayload } from '../../types/chat';

export interface WebRTCCallbacks {
  onIceCandidate: (candidate: RTCIceCandidateInit) => void;
  onRemoteStream: (stream: MediaStream) => void;
  onConnectionStateChange: (state: RTCPeerConnectionState) => void;
}

export class WebRTCService {
  private pc: RTCPeerConnection | null = null;
  private candidateBuffer: RTCIceCandidateInit[] = [];
  private remoteStream: MediaStream = new MediaStream();
  private callbacks: WebRTCCallbacks;

  constructor(callbacks: WebRTCCallbacks) {
    this.callbacks = callbacks;
  }

  /**
   * Initialize RTCPeerConnection with STUN / TURN configuration
   */
  public initPeerConnection(): RTCPeerConnection {
    if (this.pc && this.pc.signalingState !== 'closed') return this.pc;

    const iceServers: RTCIceServer[] = [
      { urls: import.meta.env.VITE_WEBRTC_STUN_URL || 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' },
    ];

    if (import.meta.env.VITE_WEBRTC_TURN_URL) {
      iceServers.push({
        urls: import.meta.env.VITE_WEBRTC_TURN_URL,
        username: import.meta.env.VITE_WEBRTC_TURN_USERNAME || '',
        credential: import.meta.env.VITE_WEBRTC_TURN_CREDENTIAL || '',
      });
    }

    const config: RTCConfiguration = {
      iceServers,
      iceTransportPolicy: 'all',
    };

    console.log('[CALL][WEBRTC] Initializing RTCPeerConnection with ICE servers:', iceServers.map(s => s.urls));
    this.pc = new RTCPeerConnection(config);

    // 1. ICE Candidate Handler
    this.pc.onicecandidate = event => {
      if (event.candidate) {
        console.log('[CALL][ICE] Local ICE candidate generated:', event.candidate.protocol || 'candidate');
        this.callbacks.onIceCandidate(event.candidate.toJSON());
      }
    };

    // 2. Remote Track Handler
    this.pc.ontrack = event => {
      console.log('[CALL][MEDIA] Remote track received:', event.track.kind, 'ID:', event.track.id, 'readyState:', event.track.readyState);
      if (event.track) {
        this.remoteStream.addTrack(event.track);
        // Create new MediaStream reference for React state change detection
        const updatedStream = new MediaStream(this.remoteStream.getTracks());
        this.callbacks.onRemoteStream(updatedStream);
      }
    };

    // 3. Connection State Change
    this.pc.onconnectionstatechange = () => {
      if (this.pc) {
        console.log('[CALL][WEBRTC] Connection state changed to:', this.pc.connectionState);
        this.dumpWebRTCState();
        this.callbacks.onConnectionStateChange(this.pc.connectionState);
      }
    };

    this.pc.oniceconnectionstatechange = () => {
      if (this.pc) {
        console.log('[CALL][ICE] ICE connection state changed to:', this.pc.iceConnectionState);
      }
    };

    return this.pc;
  }

  /**
   * Add local media tracks to peer connection
   */
  public addLocalStream(stream: MediaStream): void {
    const pc = this.initPeerConnection();
    const existingSenders = pc.getSenders();
    console.log('[CALL][MEDIA] Adding local tracks to PeerConnection:', stream.getTracks().map(t => `${t.kind}:${t.readyState}`));

    stream.getTracks().forEach(track => {
      // Prevent adding duplicate tracks for same kind
      const senderExists = existingSenders.some(s => s.track && s.track.kind === track.kind);
      if (!senderExists) {
        pc.addTrack(track, stream);
        console.log('[CALL][MEDIA] Track added to PeerConnection:', track.kind, track.id);
      } else {
        console.log('[CALL][MEDIA] Sender already exists for track kind:', track.kind);
      }
    });

    this.dumpWebRTCState();
  }

  /**
   * Create WebRTC Offer SDP (Caller)
   */
  public async createOffer(): Promise<RTCSessionDescriptionInit> {
    const pc = this.initPeerConnection();
    const offer = await pc.createOffer({
      offerToReceiveAudio: true,
      offerToReceiveVideo: false,
    });
    await pc.setLocalDescription(offer);

    const hasAudio = offer.sdp ? /m=audio/.test(offer.sdp) : false;
    console.log('[CALL][WEBRTC] Local offer created & set. offerHasAudio:', hasAudio);
    this.dumpWebRTCState();
    return offer;
  }

  /**
   * Create WebRTC Answer SDP (Callee)
   */
  public async createAnswer(offerSdp: RTCSessionDescriptionInit): Promise<RTCSessionDescriptionInit> {
    const pc = this.initPeerConnection();
    console.log('[CALL][WEBRTC] Setting remote description (Offer)...');
    await pc.setRemoteDescription(new RTCSessionDescription(offerSdp));
    await this.flushCandidateBuffer();

    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    const hasAudio = answer.sdp ? /m=audio/.test(answer.sdp) : false;
    console.log('[CALL][WEBRTC] Local answer created & set. answerHasAudio:', hasAudio);
    this.dumpWebRTCState();
    return answer;
  }

  /**
   * Handle incoming Answer SDP (Caller)
   */
  public async handleAnswer(answerSdp: RTCSessionDescriptionInit): Promise<void> {
    if (!this.pc) return;
    console.log('[CALL][WEBRTC] Setting remote description (Answer)...');
    await this.pc.setRemoteDescription(new RTCSessionDescription(answerSdp));
    console.log('[CALL][WEBRTC] Remote answer set successfully. Signaling state:', this.pc.signalingState);
    await this.flushCandidateBuffer();
    this.dumpWebRTCState();
  }

  /**
   * Add remote ICE candidate with buffering
   */
  public async addIceCandidate(candidate: RTCIceCandidateInit): Promise<void> {
    if (this.pc && this.pc.remoteDescription && this.pc.remoteDescription.type) {
      try {
        await this.pc.addIceCandidate(new RTCIceCandidate(candidate));
        console.log('[CALL][ICE] Remote candidate added directly');
      } catch (e) {
        console.warn('[CALL][ICE] Failed to add remote candidate:', e);
      }
    } else {
      console.log('[CALL][ICE] Remote description not ready, buffering candidate. Queue size:', this.candidateBuffer.length + 1);
      this.candidateBuffer.push(candidate);
    }
  }

  /**
   * Flush buffered ICE candidates after setRemoteDescription
   */
  private async flushCandidateBuffer(): Promise<void> {
    if (!this.pc) return;
    console.log(`[CALL][ICE] Flushing ${this.candidateBuffer.length} buffered candidates`);
    while (this.candidateBuffer.length > 0) {
      const candidate = this.candidateBuffer.shift();
      if (candidate) {
        try {
          await this.pc.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (e) {
          console.warn('[CALL][ICE] Failed to flush candidate:', e);
        }
      }
    }
  }

  /**
   * Dump WebRTC State Snapshot for Development Diagnostics
   */
  public dumpWebRTCState(): Record<string, any> {
    if (!this.pc) {
      const emptyState = { status: 'NO_PEER_CONNECTION' };
      console.log('[CALL][STATE] WebRTC State Snapshot:', emptyState);
      return emptyState;
    }

    const senders = this.pc.getSenders();
    const receivers = this.pc.getReceivers();

    const snapshot = {
      signalingState: this.pc.signalingState,
      iceGatheringState: this.pc.iceGatheringState,
      iceConnectionState: this.pc.iceConnectionState,
      connectionState: this.pc.connectionState,
      hasLocalDescription: !!this.pc.localDescription,
      hasRemoteDescription: !!this.pc.remoteDescription,
      localAudioTracksCount: senders.filter(s => s.track?.kind === 'audio').length,
      remoteAudioTracksCount: receivers.filter(r => r.track?.kind === 'audio').length,
      senderCount: senders.length,
      receiverCount: receivers.length,
      candidateBufferCount: this.candidateBuffer.length,
    };

    console.log('[CALL][STATE] WebRTC State Snapshot:', snapshot);
    return snapshot;
  }

  /**
   * Get WebRTC Audio RTP stats for diagnostic verification
   */
  public async getRtpStats(): Promise<{ audioSent: number; audioReceived: number; packetsSent: number; packetsReceived: number }> {
    if (!this.pc) return { audioSent: 0, audioReceived: 0, packetsSent: 0, packetsReceived: 0 };
    const stats = await this.pc.getStats();
    let audioSent = 0;
    let audioReceived = 0;
    let packetsSent = 0;
    let packetsReceived = 0;

    stats.forEach(report => {
      if (report.type === 'outbound-rtp' && report.kind === 'audio') {
        audioSent += report.bytesSent || 0;
        packetsSent += report.packetsSent || 0;
      }
      if (report.type === 'inbound-rtp' && report.kind === 'audio') {
        audioReceived += report.bytesReceived || 0;
        packetsReceived += report.packetsReceived || 0;
      }
    });

    const result = { audioSent, audioReceived, packetsSent, packetsReceived };
    console.log('[CALL][STATS] Audio RTP Stats:', result);
    return result;
  }

  /**
   * Close peer connection and reset
   */
  public close(): void {
    if (this.pc) {
      this.pc.onicecandidate = null;
      this.pc.ontrack = null;
      this.pc.onconnectionstatechange = null;
      this.pc.oniceconnectionstatechange = null;
      try {
        this.pc.close();
      } catch {
        // Ignore
      }
      this.pc = null;
    }
    this.candidateBuffer = [];
    this.remoteStream = new MediaStream();
    console.log('[CALL][WEBRTC] PeerConnection closed and cleaned up');
  }
}

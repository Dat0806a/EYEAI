export interface DirectMessage {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  created_at: string;
  edited_at?: string | null;
  status?: 'sending' | 'sent' | 'failed';
}

export interface DirectConversation {
  id: string;
  user_a: string;
  user_b: string;
  created_at: string;
  updated_at: string;
}

export type CallType = 'voice' | 'video';

export type CallStatus =
  | 'idle'
  | 'ringing'
  | 'connecting'
  | 'accepted'
  | 'declined'
  | 'cancelled'
  | 'ended'
  | 'failed'
  | 'missed';

export interface CallSession {
  id: string;
  caller_id: string;
  callee_id: string;
  caller_name: string;
  callee_name?: string;
  caller_avatar?: string | null;
  callee_avatar?: string | null;
  type: CallType;
  status: CallStatus;
  created_at: string;
}

export type SignalingType =
  | 'call:ring'
  | 'call:accept'
  | 'call:decline'
  | 'call:hangup'
  | 'webrtc:offer'
  | 'webrtc:answer'
  | 'webrtc:ice-candidate';

export interface SignalingPayload {
  type: SignalingType;
  callId: string;
  senderId: string;
  receiverId: string;
  senderName: string;
  senderAvatar?: string | null;
  callType?: CallType;
  sdp?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
  reason?: string;
}

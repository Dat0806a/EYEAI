import { supabase } from '../../lib/supabase';
import { SignalingPayload } from '../../types/chat';
import { RealtimeChannel } from '@supabase/supabase-js';

export const signalingService = {
  /**
   * Subscribe to user's global incoming signaling channel (for call:ring)
   */
  subscribeToUserSignaling(
    userId: string,
    onSignaling: (payload: SignalingPayload) => void
  ): RealtimeChannel {
    const channelName = `user_signaling_${userId}`;
    console.log(`[CALL][SIGNAL] Subscribing global incoming user channel: ${channelName}`);

    const channel = supabase
      .channel(channelName, {
        config: {
          broadcast: { self: false },
        },
      })
      .on('broadcast', { event: 'webrtc_signal' }, ({ payload }) => {
        if (payload) {
          console.log(`[CALL][SIGNAL] Global channel ${channelName} received:`, payload.type);
          onSignaling(payload as SignalingPayload);
        }
      })
      .subscribe(status => {
        console.log(`[CALL][SIGNAL] Global channel ${channelName} status:`, status);
      });

    return channel;
  },

  /**
   * Send a one-shot signal to a user's global incoming channel (e.g. call:ring)
   */
  async sendUserSignal(targetUserId: string, payload: SignalingPayload): Promise<boolean> {
    const channelName = `user_signaling_${targetUserId}`;
    const channel = supabase.channel(channelName, {
      config: { broadcast: { self: false } },
    });

    return new Promise(resolve => {
      channel.subscribe(async status => {
        if (status === 'SUBSCRIBED') {
          console.log(`[CALL][SIGNAL] Sending ring to target user channel ${channelName}`);
          await channel.send({
            type: 'broadcast',
            event: 'webrtc_signal',
            payload,
          });
          setTimeout(() => {
            supabase.removeChannel(channel);
          }, 1000);
          resolve(true);
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.warn(`[CALL][SIGNAL] Failed to subscribe to ${channelName}:`, status);
          supabase.removeChannel(channel);
          resolve(false);
        }
      });
    });
  },

  /**
   * Join a dedicated Realtime Call Room channel (for call:accept, offer, answer, ICE, hangup)
   */
  joinCallRoom(
    callId: string,
    onSignaling: (payload: SignalingPayload) => void
  ): RealtimeChannel {
    const channelName = `call_room_${callId}`;
    console.log(`[CALL][SIGNAL] Joining dedicated call room channel: ${channelName}`);

    const channel = supabase
      .channel(channelName, {
        config: {
          broadcast: { self: false },
        },
      })
      .on('broadcast', { event: 'webrtc_signal' }, ({ payload }) => {
        if (payload) {
          console.log(`[CALL][SIGNAL] Room ${channelName} received:`, payload.type, 'from:', payload.senderName);
          onSignaling(payload as SignalingPayload);
        }
      })
      .subscribe(status => {
        console.log(`[CALL][SIGNAL] Room ${channelName} status:`, status);
      });

    return channel;
  },

  /**
   * Broadcast a payload instantly over an active Call Room channel
   */
  async sendToCallRoom(channel: RealtimeChannel | null, payload: SignalingPayload): Promise<boolean> {
    if (!channel) {
      console.warn('[CALL][SIGNAL] Cannot send to room: channel is null');
      return false;
    }

    try {
      console.log(`[CALL][SIGNAL] Broadcasting to room event: ${payload.type}`);
      await channel.send({
        type: 'broadcast',
        event: 'webrtc_signal',
        payload,
      });
      return true;
    } catch (err) {
      console.warn('[CALL][SIGNAL] Failed to send broadcast to call room:', err);
      return false;
    }
  },
};

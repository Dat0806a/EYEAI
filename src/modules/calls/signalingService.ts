import { supabase } from '../../lib/supabase';
import { SignalingPayload } from '../../types/chat';
import { RealtimeChannel } from '@supabase/supabase-js';

const channelReadyPromises = new WeakMap<RealtimeChannel, Promise<boolean>>();
const userSignalActiveCounts = new Map<string, number>();

export const signalingService = {
  /**
   * Subscribe to user's global incoming signaling channel (for call:ring & fallback signaling)
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
          private: true,
          broadcast: { ack: true, self: false },
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
   * Send a signal to a user's global incoming channel (for call:ring and signaling fallback)
   */
  async sendUserSignal(targetUserId: string, payload: SignalingPayload): Promise<boolean> {
    const channelName = `user_signaling_${targetUserId}`;
    const nextCount = (userSignalActiveCounts.get(channelName) || 0) + 1;
    userSignalActiveCounts.set(channelName, nextCount);

    const channel = supabase.channel(channelName, {
      config: { private: true, broadcast: { ack: true, self: false } },
    });

    const releaseChannel = () => {
      const remaining = Math.max(0, (userSignalActiveCounts.get(channelName) || 1) - 1);
      if (remaining === 0) {
        userSignalActiveCounts.delete(channelName);
        supabase.removeChannel(channel);
      } else {
        userSignalActiveCounts.set(channelName, remaining);
      }
    };

    const sendPayload = async (): Promise<boolean> => {
      try {
        const sendResult = await channel.send({
          type: 'broadcast',
          event: 'webrtc_signal',
          payload,
        });
        setTimeout(releaseChannel, 1000);
        if (sendResult !== 'ok') {
          console.warn(`[CALL][SIGNAL] User signal ${payload.type} to ${channelName} returned:`, sendResult);
          return false;
        }
        return true;
      } catch (err) {
        console.warn(`[CALL][SIGNAL] Error sending signal to ${channelName}:`, err);
        releaseChannel();
        return false;
      }
    };

    // If the channel is already joined in supabase-js, subscribe() won't fire again
    if ((channel as any).state === 'joined') {
      console.log(`[CALL][SIGNAL] Reusing joined channel ${channelName} for ${payload.type}`);
      return await sendPayload();
    }

    return new Promise(resolve => {
      let settled = false;
      const finish = (ok: boolean) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeoutId);
        resolve(ok);
      };

      const timeoutId = setTimeout(() => {
        console.warn(`[CALL][SIGNAL] Timed out sending signal ${payload.type} to ${channelName}`);
        releaseChannel();
        finish(false);
      }, 8000);

      channel.subscribe(async status => {
        if (status === 'SUBSCRIBED') {
          console.log(`[CALL][SIGNAL] Sending ${payload.type} to target user channel ${channelName}`);
          const ok = await sendPayload();
          finish(ok);
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          console.warn(`[CALL][SIGNAL] Failed to subscribe to ${channelName}:`, status);
          releaseChannel();
          finish(false);
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

    let resolveReady!: (ready: boolean) => void;
    let settled = false;
    const readyPromise = new Promise<boolean>(resolve => {
      resolveReady = (ready: boolean) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeoutId);
        resolve(ready);
      };
    });

    const timeoutId = setTimeout(() => {
      console.warn(`[CALL][SIGNAL] Timed out waiting for ${channelName} subscription`);
      resolveReady(false);
    }, 10000);

    const channel = supabase
      .channel(channelName, {
        config: {
          private: true,
          broadcast: { ack: true, self: false },
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
        if (status === 'SUBSCRIBED') {
          resolveReady(true);
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          resolveReady(false);
        }
      });

    channelReadyPromises.set(channel, readyPromise);
    return channel;
  },

  /**
   * Wait until the Call Room channel finishes subscribing before sending/accepting WebRTC signals
   */
  async waitForCallRoomReady(channel: RealtimeChannel | null): Promise<boolean> {
    if (!channel) return false;
    const readyPromise = channelReadyPromises.get(channel);
    if (!readyPromise) return true;
    return readyPromise;
  },

  /**
   * Broadcast a payload over an active Call Room channel (waiting for subscription readiness first)
   */
  async sendToCallRoom(channel: RealtimeChannel | null, payload: SignalingPayload): Promise<boolean> {
    if (!channel) {
      console.warn('[CALL][SIGNAL] Cannot send to room: channel is null');
      return false;
    }

    const ready = await this.waitForCallRoomReady(channel);
    if (!ready) {
      console.warn(`[CALL][SIGNAL] Call room not subscribed before sending ${payload.type}`);
      return false;
    }

    try {
      console.log(`[CALL][SIGNAL] Broadcasting to room event: ${payload.type}`);
      const sendResult = await channel.send({
        type: 'broadcast',
        event: 'webrtc_signal',
        payload,
      });
      if (sendResult !== 'ok') {
        console.warn(`[CALL][SIGNAL] Broadcast ${payload.type} returned status:`, sendResult);
        return false;
      }
      return true;
    } catch (err) {
      console.warn('[CALL][SIGNAL] Failed to send broadcast to call room:', err);
      return false;
    }
  },
};

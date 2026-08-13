import { supabase } from '../../lib/supabase';
import { DirectMessage } from '../../types/chat';
import { RealtimeChannel } from '@supabase/supabase-js';

export const chatService = {
  /**
   * Get or create a direct conversation with an accepted friend
   */
  async getOrCreateConversation(friendId: string): Promise<string | null> {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) return null;

    // Try RPC first
    const { data, error } = await supabase.rpc('get_or_create_direct_conversation', {
      p_friend_id: friendId,
    });

    if (!error && data?.conversation_id) {
      return data.conversation_id as string;
    }

    // Fallback: direct select/insert
    const userId = userData.user.id;
    const userA = userId < friendId ? userId : friendId;
    const userB = userId < friendId ? friendId : userId;

    const { data: existing } = await supabase
      .from('conversations')
      .select('id')
      .eq('user_a', userA)
      .eq('user_b', userB)
      .maybeSingle();

    if (existing) {
      return existing.id;
    }

    const { data: created, error: insErr } = await supabase
      .from('conversations')
      .insert({ user_a: userA, user_b: userB })
      .select('id')
      .single();

    if (insErr || !created) {
      return null;
    }

    return created.id;
  },

  /**
   * Fetch recent message history for a conversation
   */
  async getMessages(conversationId: string, limit = 50): Promise<DirectMessage[]> {
    // Try RPC first
    const { data, error } = await supabase.rpc('get_conversation_messages', {
      p_conversation_id: conversationId,
      p_limit: limit,
    });

    if (!error && data) {
      return data as DirectMessage[];
    }

    // Fallback: direct select
    const { data: msgs, error: mErr } = await supabase
      .from('messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true })
      .limit(limit);

    if (mErr || !msgs) return [];
    return msgs as DirectMessage[];
  },

  /**
   * Send a new chat message to a conversation
   */
  async sendMessage(conversationId: string, content: string): Promise<DirectMessage | null> {
    const trimmed = content.trim();
    if (!trimmed) return null;

    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) return null;

    // Try RPC first
    const { data, error } = await supabase.rpc('send_chat_message', {
      p_conversation_id: conversationId,
      p_content: trimmed,
    });

    if (!error && data?.id) {
      return data as DirectMessage;
    }

    // Fallback direct insert
    const userId = userData.user.id;
    const { data: insMsg, error: insErr } = await supabase
      .from('messages')
      .insert({
        conversation_id: conversationId,
        sender_id: userId,
        content: trimmed,
      })
      .select('*')
      .single();

    if (insErr || !insMsg) return null;
    return insMsg as DirectMessage;
  },

  /**
   * Subscribe to realtime incoming messages for a specific conversation
   */
  subscribeToMessages(
    conversationId: string,
    onMessage: (msg: DirectMessage) => void
  ): RealtimeChannel {
    const channelName = `conversation:${conversationId}`;
    
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        payload => {
          if (payload.new) {
            onMessage(payload.new as DirectMessage);
          }
        }
      )
      .subscribe();

    return channel;
  },
};

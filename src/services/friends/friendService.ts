import { supabase } from '../../lib/supabase';
import {
  FriendContact,
  IncomingRequest,
  FriendSearchResult,
} from '../../types/friends';

export const friendService = {
  /**
   * Fetch current user's friends list
   */
  async getFriends(): Promise<FriendContact[]> {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) return [];

    // Try RPC first for optimal join without N+1
    const { data, error } = await supabase.rpc('get_my_friends');
    if (!error && data) {
      return data as FriendContact[];
    }

    // Fallback: direct table queries if RPC is not deployed yet
    const userId = userData.user.id;
    const { data: friendships, error: fsErr } = await supabase
      .from('friendships')
      .select('id, user_a, user_b, created_at')
      .or(`user_a.eq.${userId},user_b.eq.${userId}`);

    if (fsErr || !friendships || friendships.length === 0) {
      return [];
    }

    const friendIds = friendships.map(f => (f.user_a === userId ? f.user_b : f.user_a));
    const { data: profiles, error: pErr } = await supabase
      .from('profiles')
      .select('id, display_name, avatar_url')
      .in('id', friendIds);

    if (pErr || !profiles) return [];

    const profileMap = new Map(profiles.map(p => [p.id, p]));

    return friendships
      .map(f => {
        const friendId = f.user_a === userId ? f.user_b : f.user_a;
        const profile = profileMap.get(friendId);
        if (!profile) return null;
        return {
          friendship_id: f.id,
          friend_id: friendId,
          display_name: profile.display_name,
          avatar_url: profile.avatar_url,
          friendship_created_at: f.created_at,
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null);
  },

  /**
   * Fetch incoming pending friend requests for current user
   */
  async getIncomingRequests(): Promise<IncomingRequest[]> {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) return [];

    // Try RPC first
    const { data, error } = await supabase.rpc('get_incoming_friend_requests');
    if (!error && data) {
      return data as IncomingRequest[];
    }

    // Fallback: direct query
    const userId = userData.user.id;
    const { data: requests, error: reqErr } = await supabase
      .from('friend_requests')
      .select('id, sender_id, created_at')
      .eq('receiver_id', userId)
      .eq('status', 'pending')
      .order('created_at', { ascending: true });

    if (reqErr || !requests || requests.length === 0) return [];

    const senderIds = requests.map(r => r.sender_id);
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, display_name, avatar_url')
      .in('id', senderIds);

    const profileMap = new Map((profiles || []).map(p => [p.id, p]));

    return requests.map(r => {
      const p = profileMap.get(r.sender_id);
      return {
        request_id: r.id,
        sender_id: r.sender_id,
        display_name: p?.display_name || 'Người dùng',
        avatar_url: p?.avatar_url || null,
        created_at: r.created_at,
      };
    });
  },

  /**
   * Search users by display_name and determine relationship status
   */
  async searchUsers(query: string): Promise<FriendSearchResult[]> {
    const trimmed = query.trim();
    if (!trimmed) return [];

    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) return [];

    // Try RPC search_users_with_status first
    const { data, error } = await supabase.rpc('search_users_with_status', {
      p_query: trimmed,
    });
    if (!error && data) {
      return data as FriendSearchResult[];
    }

    // Fallback: direct search
    const userId = userData.user.id;
    const { data: profiles, error: pErr } = await supabase
      .from('profiles')
      .select('id, display_name, avatar_url')
      .neq('id', userId)
      .ilike('display_name', `%${trimmed}%`)
      .limit(20);

    if (pErr || !profiles || profiles.length === 0) return [];

    // Check relationship status for each profile
    const targetIds = profiles.map(p => p.id);

    const { data: friendships } = await supabase
      .from('friendships')
      .select('user_a, user_b')
      .or(`user_a.eq.${userId},user_b.eq.${userId}`);

    const friendIdSet = new Set<string>();
    (friendships || []).forEach(f => {
      friendIdSet.add(f.user_a === userId ? f.user_b : f.user_a);
    });

    const { data: requests } = await supabase
      .from('friend_requests')
      .select('id, sender_id, receiver_id, status')
      .eq('status', 'pending')
      .or(`sender_id.eq.${userId},receiver_id.eq.${userId}`);

    const outgoingMap = new Map<string, string>(); // receiver_id -> request_id
    const incomingMap = new Map<string, string>(); // sender_id -> request_id

    (requests || []).forEach(r => {
      if (r.sender_id === userId) {
        outgoingMap.set(r.receiver_id, r.id);
      } else if (r.receiver_id === userId) {
        incomingMap.set(r.sender_id, r.id);
      }
    });

    return profiles.map(p => {
      let relationship_status: FriendSearchResult['relationship_status'] = 'none';
      let request_id: string | null = null;

      if (friendIdSet.has(p.id)) {
        relationship_status = 'friend';
      } else if (outgoingMap.has(p.id)) {
        relationship_status = 'outgoing_pending';
        request_id = outgoingMap.get(p.id) || null;
      } else if (incomingMap.has(p.id)) {
        relationship_status = 'incoming_pending';
        request_id = incomingMap.get(p.id) || null;
      }

      return {
        id: p.id,
        display_name: p.display_name,
        avatar_url: p.avatar_url,
        relationship_status,
        request_id,
      };
    });
  },

  /**
   * Send a friend request to a target user
   */
  async sendFriendRequest(receiverId: string): Promise<{ success: boolean; message: string }> {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) {
      return { success: false, message: 'Bạn chưa đăng nhập' };
    }

    // Try RPC send_friend_request
    const { data, error } = await supabase.rpc('send_friend_request', {
      p_receiver_id: receiverId,
    });

    if (!error && data) {
      return {
        success: data.success ?? true,
        message: data.message || 'Đã gửi lời mời kết bạn',
      };
    }

    // Fallback: direct insert
    const userId = userData.user.id;
    const { error: insErr } = await supabase.from('friend_requests').insert({
      sender_id: userId,
      receiver_id: receiverId,
      status: 'pending',
    });

    if (insErr) {
      if (insErr.code === '23505') {
        return { success: true, message: 'Lời mời kết bạn đã được gửi trước đó' };
      }
      return { success: false, message: 'Không thể gửi lời mời kết bạn' };
    }

    return { success: true, message: 'Đã gửi lời mời kết bạn thành công' };
  },

  /**
   * Accept an incoming friend request
   */
  async acceptFriendRequest(requestId: string): Promise<{ success: boolean; message: string }> {
    // Try RPC accept_friend_request
    const { data, error } = await supabase.rpc('accept_friend_request', {
      p_request_id: requestId,
    });

    if (!error && data) {
      return {
        success: data.success ?? true,
        message: data.message || 'Đã chấp nhận lời mời kết bạn',
      };
    }

    // Fallback direct execution
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) return { success: false, message: 'Bạn chưa đăng nhập' };

    const userId = userData.user.id;

    const { data: req, error: reqErr } = await supabase
      .from('friend_requests')
      .select('*')
      .eq('id', requestId)
      .single();

    if (reqErr || !req) return { success: false, message: 'Không tìm thấy lời mời' };
    if (req.receiver_id !== userId) return { success: false, message: 'Không có quyền thực hiện' };

    const userA = req.sender_id < req.receiver_id ? req.sender_id : req.receiver_id;
    const userB = req.sender_id < req.receiver_id ? req.receiver_id : req.sender_id;

    await supabase.from('friendships').insert({ user_a: userA, user_b: userB });

    await supabase
      .from('friend_requests')
      .update({ status: 'accepted', responded_at: new Date().toISOString() })
      .eq('id', requestId);

    return { success: true, message: 'Đã chấp nhận lời mời kết bạn' };
  },

  /**
   * Reject an incoming friend request
   */
  async rejectFriendRequest(requestId: string): Promise<{ success: boolean; message: string }> {
    // Try RPC
    const { data, error } = await supabase.rpc('reject_friend_request', {
      p_request_id: requestId,
    });

    if (!error && data) {
      return {
        success: data.success ?? true,
        message: data.message || 'Đã từ chối lời mời',
      };
    }

    // Fallback
    const { error: updErr } = await supabase
      .from('friend_requests')
      .update({ status: 'rejected', responded_at: new Date().toISOString() })
      .eq('id', requestId);

    if (updErr) return { success: false, message: 'Không thể từ chối lời mời' };
    return { success: true, message: 'Đã từ chối lời mời kết bạn' };
  },

  /**
   * Cancel an outgoing friend request
   */
  async cancelFriendRequest(requestId: string): Promise<{ success: boolean; message: string }> {
    const { data, error } = await supabase.rpc('cancel_friend_request', {
      p_request_id: requestId,
    });

    if (!error && data) {
      return {
        success: data.success ?? true,
        message: data.message || 'Đã hủy lời mời',
      };
    }

    const { error: updErr } = await supabase
      .from('friend_requests')
      .update({ status: 'cancelled', responded_at: new Date().toISOString() })
      .eq('id', requestId);

    if (updErr) return { success: false, message: 'Không thể hủy lời mời' };
    return { success: true, message: 'Đã hủy lời mời' };
  },
};

export interface PublicProfile {
  id: string;
  display_name: string;
  avatar_url?: string | null;
  created_at?: string;
}

export type FriendRequestStatus = 'pending' | 'accepted' | 'rejected' | 'cancelled';

export interface FriendRequest {
  id: string;
  sender_id: string;
  receiver_id: string;
  status: FriendRequestStatus;
  created_at: string;
  responded_at?: string | null;
}

export interface Friendship {
  id: string;
  user_a: string;
  user_b: string;
  created_at: string;
}

export type RelationshipState = 'none' | 'outgoing_pending' | 'incoming_pending' | 'friend';

export interface FriendSearchResult {
  id: string;
  display_name: string;
  avatar_url?: string | null;
  relationship_status: RelationshipState;
  request_id?: string | null;
}

export interface FriendContact {
  friendship_id: string;
  friend_id: string;
  display_name: string;
  avatar_url?: string | null;
  friendship_created_at: string;
}

export interface IncomingRequest {
  request_id: string;
  sender_id: string;
  display_name: string;
  avatar_url?: string | null;
  created_at: string;
}

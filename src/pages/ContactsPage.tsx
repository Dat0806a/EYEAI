import React, { useState, useEffect, useCallback } from 'react';
import { PageHeader } from '../components/ui/PageHeader';
import { AppButton } from '../components/ui/AppButton';
import { Modal } from '../components/ui/Modal';
import { AuthModal } from '../components/auth/AuthModal';
import { FriendSearchModal } from '../components/contacts/FriendSearchModal';
import { FriendRequestsModal } from '../components/contacts/FriendRequestsModal';
import { useAuth } from '../hooks/useAuth';
import { useCall } from '../modules/calls/CallProvider';
import { friendService } from '../services/friends/friendService';
import { FriendContact } from '../types/friends';
import {
  User,
  Phone,
  MessageSquare,
  UserPlus,
  Inbox,
  LogIn,
  LogOut,
  Users,
  Search,
  Sparkles,
} from 'lucide-react';
import { speakVietnamese } from '../utils/speech';

interface ContactsPageProps {
  onBack: () => void;
  onOpenChat: (friend: { id: string; name: string; avatarUrl?: string | null }) => void;
}

export function ContactsPage({ onBack, onOpenChat }: ContactsPageProps) {
  const { user, profile, isAuthenticated, loading: authLoading, signOut } = useAuth();
  const { startCall } = useCall();

  const [friends, setFriends] = useState<FriendContact[]>([]);
  const [incomingCount, setIncomingCount] = useState<number>(0);
  const [loadingFriends, setLoadingFriends] = useState<boolean>(true);

  const [isAuthModalOpen, setIsAuthModalOpen] = useState<boolean>(false);
  const [isSearchModalOpen, setIsSearchModalOpen] = useState<boolean>(false);
  const [isRequestsModalOpen, setIsRequestsModalOpen] = useState<boolean>(false);

  const [selectedFriend, setSelectedFriend] = useState<FriendContact | null>(null);
  const [isCallModalOpen, setIsCallModalOpen] = useState<boolean>(false);

  // Load friends and incoming requests count
  const loadContactsData = useCallback(async () => {
    if (!isAuthenticated) {
      setFriends([]);
      setIncomingCount(0);
      setLoadingFriends(false);
      return;
    }

    setLoadingFriends(true);
    try {
      const [friendList, requests] = await Promise.all([
        friendService.getFriends(),
        friendService.getIncomingRequests(),
      ]);
      setFriends(friendList);
      setIncomingCount(requests.length);
    } catch {
      setFriends([]);
      setIncomingCount(0);
    } fontFinally: {
      setLoadingFriends(false);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    loadContactsData();
  }, [loadContactsData]);

  const handleSelectFriend = (friend: FriendContact) => {
    setSelectedFriend(friend);
    setIsCallModalOpen(true);
    speakVietnamese(`Liên lạc với ${friend.display_name}`);
  };

  const getInitials = (name: string) => {
    const parts = name.trim().split(' ').filter(Boolean);
    if (parts.length === 0) return 'U';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  };

  return (
    <div className="min-h-screen bg-[#FFF2D6] text-[#14213D] flex flex-col pb-16">
      <PageHeader title="Liên lạc Người thân" showBack onBack={onBack} />

      <main className="flex-1 max-w-md md:max-w-xl mx-auto w-full px-4 py-6 flex flex-col gap-6">
        
        {/* User Account / Auth Section Banner */}
        {!authLoading && (
          <div className="bg-white/80 backdrop-blur-md rounded-[24px] p-4 border-2 border-[#14213D]/10 shadow-sm flex items-center justify-between gap-3">
            {isAuthenticated && user ? (
              <>
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-[#6AC9F0] border-2 border-[#14213D] flex items-center justify-center font-black text-[#14213D] text-base flex-shrink-0 shadow-inner">
                    {profile?.avatar_url ? (
                      <img
                        src={profile.avatar_url}
                        alt={profile.display_name}
                        className="w-full h-full rounded-full object-cover"
                      />
                    ) : (
                      getInitials(profile?.display_name || user.email || 'Người dùng')
                    )}
                  </div>

                  <div className="flex flex-col">
                    <span className="text-xs font-semibold text-[#3B4B68]">Tài khoản hiện tại</span>
                    <span className="font-black text-lg text-[#14213D] truncate max-w-[170px] md:max-w-[220px]">
                      {profile?.display_name || user.email?.split('@')[0] || 'Người dùng'}
                    </span>
                  </div>
                </div>

                <AppButton
                  id="btn-contacts-logout"
                  variant="outline"
                  size="sm"
                  onClick={signOut}
                  icon={<LogOut className="w-4 h-4 text-rose-600" />}
                >
                  <span>Đăng xuất</span>
                </AppButton>
              </>
            ) : (
              <div className="w-full flex flex-col sm:flex-row items-center justify-between gap-3 py-1">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-[#6AC9F0]/20 flex items-center justify-center flex-shrink-0">
                    <User className="w-5 h-5 text-[#14213D]" />
                  </div>
                  <div>
                    <span className="font-bold text-[#14213D] text-sm block">Bạn chưa đăng nhập</span>
                    <span className="text-xs text-[#3B4B68]">Đăng nhập để kết bạn và gọi thoại người thân</span>
                  </div>
                </div>

                <AppButton
                  id="btn-contacts-login-banner"
                  variant="primary"
                  size="sm"
                  onClick={() => setIsAuthModalOpen(true)}
                  icon={<LogIn className="w-4 h-4" />}
                >
                  <span>Đăng nhập ngay</span>
                </AppButton>
              </div>
            )}
          </div>
        )}

        {/* Action Controls Header: [ Kết bạn ] [ Lời mời (count) ] */}
        <div className="grid grid-cols-2 gap-3 w-full">
          <AppButton
            id="btn-contacts-add-friend"
            variant="primary"
            size="md"
            fullWidth
            onClick={() => {
              if (!isAuthenticated) {
                setIsAuthModalOpen(true);
              } else {
                setIsSearchModalOpen(true);
              }
            }}
            icon={<UserPlus className="w-5 h-5" />}
            row={0}
            col={0}
          >
            <span>Kết bạn mới</span>
          </AppButton>

          <AppButton
            id="btn-contacts-requests"
            variant="secondary"
            size="md"
            fullWidth
            onClick={() => {
              if (!isAuthenticated) {
                setIsAuthModalOpen(true);
              } else {
                setIsRequestsModalOpen(true);
              }
            }}
            icon={<Inbox className="w-5 h-5" />}
            row={0}
            col={1}
          >
            <div className="flex items-center gap-1.5">
              <span>Lời mời</span>
              {incomingCount > 0 && (
                <span className="ml-1 px-2 py-0.5 rounded-full bg-[#FF6F61] text-white font-black text-xs animate-pulse">
                  {incomingCount}
                </span>
              )}
            </div>
          </AppButton>
        </div>

        {/* Section Title */}
        <div className="flex items-center justify-between pt-2">
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-[#14213D]" />
            <h3 className="font-black text-xl text-[#14213D]">Danh sách bạn bè ({friends.length})</h3>
          </div>
        </div>

        {/* Loading State */}
        {loadingFriends && (
          <div className="grid grid-cols-2 gap-4 w-full">
            {[1, 2, 3, 4].map(idx => (
              <div
                key={idx}
                className="h-28 bg-white/50 animate-pulse rounded-[24px] border border-[#14213D]/10"
              />
            ))}
          </div>
        )}

        {/* Empty State */}
        {!loadingFriends && friends.length === 0 && (
          <div className="bg-white/80 rounded-[28px] p-8 border-2 border-[#14213D]/10 text-center flex flex-col items-center gap-4 shadow-sm">
            <div className="w-16 h-16 rounded-full bg-[#6AC9F0]/20 border-2 border-[#6AC9F0] flex items-center justify-center">
              <Users className="w-8 h-8 text-[#14213D]" />
            </div>

            <div>
              <h4 className="font-black text-xl text-[#14213D]">Bạn chưa có người liên lạc nào</h4>
              <p className="text-sm text-[#3B4B68] mt-1">
                {isAuthenticated
                  ? 'Hãy bấm vào "Kết bạn mới" để tìm kiếm người thân trong hệ thống.'
                  : 'Hãy đăng nhập để kết nối với người thân của bạn.'}
              </p>
            </div>

            <AppButton
              id="btn-contacts-empty-action"
              variant="accent"
              size="md"
              onClick={() => {
                if (!isAuthenticated) {
                  setIsAuthModalOpen(true);
                } else {
                  setIsSearchModalOpen(true);
                }
              }}
              icon={<Search className="w-5 h-5" />}
            >
              <span>{isAuthenticated ? 'TÌM BẠN NGAY' : 'ĐĂNG NHẬP ĐỂ TÌM BẠN'}</span>
            </AppButton>
          </div>
        )}

        {/* Friend Contact Grid (2-Column Mobile Portrait Layout) */}
        {!loadingFriends && friends.length > 0 && (
          <div className="grid grid-cols-2 gap-4 w-full">
            {friends.map((friend, idx) => (
              <div key={friend.friendship_id} className="w-full">
                <AppButton
                  id={`btn-friend-card-${friend.friend_id}`}
                  variant="secondary"
                  size="lg"
                  fullWidth
                  onClick={() => handleSelectFriend(friend)}
                  row={Math.floor(idx / 2) + 1}
                  col={idx % 2}
                >
                  <div className="flex flex-col items-center text-center py-2">
                    <div className="relative w-14 h-14 rounded-full bg-[#6AC9F0]/20 border-2 border-[#6AC9F0] flex items-center justify-center mb-2 shadow-sm">
                      {friend.avatar_url ? (
                        <img
                          src={friend.avatar_url}
                          alt={friend.display_name}
                          className="w-full h-full rounded-full object-cover"
                        />
                      ) : (
                        <span className="font-black text-[#14213D] text-lg">
                          {getInitials(friend.display_name)}
                        </span>
                      )}
                      <span className="absolute bottom-0 right-0 w-3.5 h-3.5 rounded-full border-2 border-white bg-emerald-500" />
                    </div>

                    <span className="font-black text-base md:text-lg text-[#14213D] truncate max-w-[130px]">
                      {friend.display_name}
                    </span>
                    <span className="text-xs text-[#3B4B68] mt-0.5">Người liên lạc</span>
                  </div>
                </AppButton>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Call / Action Modal for Selected Friend */}
      <Modal
        isOpen={isCallModalOpen}
        onClose={() => setIsCallModalOpen(false)}
        title="Tùy chọn Liên lạc"
      >
        <div className="flex flex-col items-center text-center gap-5 py-4">
          <div className="w-16 h-16 rounded-full bg-[#6AC9F0]/20 border-2 border-[#6AC9F0] flex items-center justify-center">
            {selectedFriend?.avatar_url ? (
              <img
                src={selectedFriend.avatar_url}
                alt={selectedFriend.display_name}
                className="w-full h-full rounded-full object-cover"
              />
            ) : (
              <span className="font-black text-[#14213D] text-xl">
                {selectedFriend ? getInitials(selectedFriend.display_name) : ''}
              </span>
            )}
          </div>

          <div>
            <h3 className="text-2xl font-black text-[#14213D]">
              {selectedFriend?.display_name}
            </h3>
            <p className="text-sm text-[#3B4B68] mt-1">Đang sẵn sàng kết nối qua EyeTalk</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full">
            <AppButton
              id="btn-friend-start-chat"
              variant="accent"
              size="md"
              fullWidth
              onClick={() => {
                setIsCallModalOpen(false);
                if (selectedFriend) {
                  onOpenChat({
                    id: selectedFriend.friend_id,
                    name: selectedFriend.display_name,
                    avatarUrl: selectedFriend.avatar_url,
                  });
                }
              }}
              icon={<MessageSquare className="w-5 h-5" />}
            >
              <span>NHẮN TIN</span>
            </AppButton>

            <AppButton
              id="btn-friend-start-call"
              variant="primary"
              size="md"
              fullWidth
              onClick={() => {
                setIsCallModalOpen(false);
                if (selectedFriend) {
                  console.log('[CALL][UI] Voice Call triggered from Contacts modal for:', selectedFriend.display_name);
                  startCall(selectedFriend.friend_id, selectedFriend.display_name, 'voice', selectedFriend.avatar_url);
                }
              }}
              icon={<Phone className="w-5 h-5" />}
            >
              <span>GỌI THOẠI</span>
            </AppButton>
          </div>

          <AppButton
            id="btn-close-friend-modal"
            variant="outline"
            size="sm"
            fullWidth
            onClick={() => setIsCallModalOpen(false)}
          >
            <span>ĐÓNG MENU</span>
          </AppButton>
        </div>
      </Modal>

      {/* Auth Modal */}
      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
        onSuccess={loadContactsData}
      />

      {/* Friend Search Modal */}
      <FriendSearchModal
        isOpen={isSearchModalOpen}
        onClose={() => setIsSearchModalOpen(false)}
        onFriendAdded={loadContactsData}
      />

      {/* Friend Requests Modal */}
      <FriendRequestsModal
        isOpen={isRequestsModalOpen}
        onClose={() => setIsRequestsModalOpen(false)}
        onRequestHandled={loadContactsData}
      />
    </div>
  );
}

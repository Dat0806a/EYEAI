import React, { useState, useEffect, useCallback } from 'react';
import { Modal } from '../ui/Modal';
import { AppButton } from '../ui/AppButton';
import { EyeTextComposer } from '../../modules/virtual-keyboard/EyeTextComposer';
import { VirtualKeyboard } from '../../modules/virtual-keyboard/VirtualKeyboard';
import { applyVietnameseAccents } from '../../modules/virtual-keyboard/vietnameseTelex';
import { GridItem } from '../../modules/virtual-keyboard/types';
import { useEyeTrackingSettings } from '../../modules/eye-control/useEyeTracking';
import { friendService } from '../../services/friends/friendService';
import { FriendSearchResult } from '../../types/friends';
import { User, Search, UserPlus, Check, Clock, UserCheck, X } from 'lucide-react';
import { speakVietnamese } from '../../utils/speech';
import { KeyboardHudSlot } from '../ui/KeyboardHudSlot';

interface FriendSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onFriendAdded?: () => void;
}

export function FriendSearchModal({ isOpen, onClose, onFriendAdded }: FriendSearchModalProps) {
  const { settings } = useEyeTrackingSettings();
  const eyeControlEnabled = settings.eyeControlEnabled;

  const [searchQuery, setSearchQuery] = useState('');
  const [results, setResults] = useState<FriendSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [isKeyboardOpen, setIsKeyboardOpen] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Debounced search
  const performSearch = useCallback(async (query: string) => {
    if (!query.trim()) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await friendService.searchUsers(query);
      setResults(res);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      performSearch(searchQuery);
    }, 350);
    return () => clearTimeout(timer);
  }, [searchQuery, performSearch]);

  const handleKeyPress = (item: GridItem) => {
    if (item.type === 'phrase') {
      setSearchQuery(prev => {
        const next = prev + (prev.endsWith(' ') || prev === '' ? '' : ' ') + item.value;
        return applyVietnameseAccents(next);
      });
    } else if (item.type === 'letter') {
      setSearchQuery(prev => {
        const next = prev + item.value;
        return applyVietnameseAccents(next);
      });
    } else if (item.type === 'action') {
      if (item.value === ' ' || item.id === 'l_space') {
        setSearchQuery(prev => prev + ' ');
      } else if (item.value === 'BACKSPACE') {
        setSearchQuery(prev => prev.slice(0, -1));
      } else if (item.value === 'CLEAR_ALL') {
        setSearchQuery('');
      } else if (item.value === 'SEND') {
        performSearch(searchQuery);
      }
    }
  };

  const handleBackspace = () => {
    setSearchQuery(prev => prev.slice(0, -1));
  };

  const handleClear = () => {
    setSearchQuery('');
  };

  const handleSendRequest = async (userItem: FriendSearchResult) => {
    setActionLoadingId(userItem.id);
    setFeedbackMsg(null);
    try {
      const res = await friendService.sendFriendRequest(userItem.id);
      if (res.success) {
        speakVietnamese(`Đã gửi lời mời kết bạn tới ${userItem.display_name}`);
        setFeedbackMsg({ text: res.message, type: 'success' });
        // Update local status
        setResults(prev =>
          prev.map(r =>
            r.id === userItem.id ? { ...r, relationship_status: 'outgoing_pending' } : r
          )
        );
        if (onFriendAdded) onFriendAdded();
      } else {
        setFeedbackMsg({ text: res.message, type: 'error' });
      }
    } catch {
      setFeedbackMsg({ text: 'Không thể gửi lời mời kết bạn.', type: 'error' });
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleAcceptRequest = async (userItem: FriendSearchResult) => {
    if (!userItem.request_id) return;
    setActionLoadingId(userItem.id);
    setFeedbackMsg(null);
    try {
      const res = await friendService.acceptFriendRequest(userItem.request_id);
      if (res.success) {
        speakVietnamese(`Đã kết bạn với ${userItem.display_name}`);
        setFeedbackMsg({ text: res.message, type: 'success' });
        setResults(prev =>
          prev.map(r => (r.id === userItem.id ? { ...r, relationship_status: 'friend' } : r))
        );
        if (onFriendAdded) onFriendAdded();
      } else {
        setFeedbackMsg({ text: res.message, type: 'error' });
      }
    } catch {
      setFeedbackMsg({ text: 'Không thể chấp nhận lời mời.', type: 'error' });
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleRejectRequest = async (userItem: FriendSearchResult) => {
    if (!userItem.request_id) return;
    setActionLoadingId(userItem.id);
    setFeedbackMsg(null);
    try {
      const res = await friendService.rejectFriendRequest(userItem.request_id);
      if (res.success) {
        setFeedbackMsg({ text: res.message, type: 'success' });
        setResults(prev =>
          prev.map(r => (r.id === userItem.id ? { ...r, relationship_status: 'none' } : r))
        );
      }
    } catch {
      setFeedbackMsg({ text: 'Không thể từ chối lời mời.', type: 'error' });
    } finally {
      setActionLoadingId(null);
    }
  };

  // Helper for Initials Avatar
  const getInitials = (name: string) => {
    const parts = name.trim().split(' ').filter(Boolean);
    if (parts.length === 0) return 'U';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Tìm & Kết bạn Mới">
      <KeyboardHudSlot />
      <div className="flex flex-col gap-4 py-2 max-h-[75vh] overflow-y-auto pr-1">
        {feedbackMsg && (
          <div
            className={`p-3 rounded-xl text-sm font-bold border ${
              feedbackMsg.type === 'success'
                ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                : 'bg-rose-50 text-rose-800 border-rose-200'
            }`}
          >
            {feedbackMsg.text}
          </div>
        )}

        {/* Input Composer Section */}
        {eyeControlEnabled ? (
          <div className="flex flex-col gap-3">
            <EyeTextComposer
              value={searchQuery}
              onChange={setSearchQuery}
              placeholder="Nhập tên người cần tìm..."
              actionLabel="TÌM"
              onSubmit={() => performSearch(searchQuery)}
              onToggleKeyboard={() => setIsKeyboardOpen(!isKeyboardOpen)}
              isKeyboardOpen={isKeyboardOpen}
            />

            {isKeyboardOpen && (
              <VirtualKeyboard
                isOpen={isKeyboardOpen}
                onKeyPress={handleKeyPress}
                onClose={() => setIsKeyboardOpen(false)}
                actionLabel="Tìm"
              />
            )}
          </div>
        ) : (
          <div className="relative">
            <Search className="w-5 h-5 absolute left-3.5 top-1/2 -translate-y-1/2 text-[#3B4B68]" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Nhập tên người thân hoặc bạn bè..."
              className="w-full pl-11 pr-4 py-3.5 bg-white border-2 border-[#14213D]/15 rounded-2xl font-semibold text-[#14213D] focus:border-[#6AC9F0] outline-none text-base shadow-sm"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 rounded-full hover:bg-slate-100 text-slate-500"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        )}

        {/* Results Container */}
        <div className="flex flex-col gap-3 mt-2">
          {loading && (
            <div className="flex items-center justify-center py-8 text-[#3B4B68] font-semibold text-sm">
              Đang tìm kiếm người dùng...
            </div>
          )}

          {!loading && searchQuery.trim() !== '' && results.length === 0 && (
            <div className="text-center py-8 text-[#3B4B68] font-medium">
              Không tìm thấy người dùng phù hợp với "<span className="font-bold text-[#14213D]">{searchQuery}</span>"
            </div>
          )}

          {!loading && searchQuery.trim() === '' && (
            <div className="text-center py-6 text-[#3B4B68]/70 text-sm italic">
              Nhập tên người thân để bắt đầu tìm kiếm
            </div>
          )}

          {!loading &&
            results.map((item, idx) => (
              <div
                key={item.id}
                className="flex items-center justify-between p-3.5 bg-white rounded-2xl border-2 border-[#14213D]/10 shadow-sm"
              >
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-[#6AC9F0]/20 border-2 border-[#6AC9F0] flex items-center justify-center flex-shrink-0">
                    {item.avatar_url ? (
                      <img
                        src={item.avatar_url}
                        alt={item.display_name}
                        className="w-full h-full rounded-full object-cover"
                        onError={e => {
                          (e.target as HTMLElement).style.display = 'none';
                        }}
                      />
                    ) : (
                      <span className="font-black text-[#14213D] text-sm">
                        {getInitials(item.display_name)}
                      </span>
                    )}
                  </div>

                  <div className="flex flex-col">
                    <span className="font-bold text-[#14213D] text-base leading-tight">
                      {item.display_name}
                    </span>
                    <span className="text-xs text-[#3B4B68] mt-0.5">
                      {item.relationship_status === 'friend' && 'Đã là bạn bè'}
                      {item.relationship_status === 'outgoing_pending' && 'Đã gửi lời mời'}
                      {item.relationship_status === 'incoming_pending' && 'Đã gửi lời mời cho bạn'}
                      {item.relationship_status === 'none' && 'Thành viên EyeTalk'}
                    </span>
                  </div>
                </div>

                {/* Relationship Action Button */}
                <div className="flex-shrink-0">
                  {item.relationship_status === 'none' && (
                    <AppButton
                      id={`btn-send-req-${item.id}`}
                      variant="primary"
                      size="sm"
                      disabled={actionLoadingId === item.id}
                      onClick={() => handleSendRequest(item)}
                      row={idx}
                      col={0}
                      icon={<UserPlus className="w-4 h-4" />}
                    >
                      <span>{actionLoadingId === item.id ? 'Đang gửi...' : 'Kết bạn'}</span>
                    </AppButton>
                  )}

                  {item.relationship_status === 'outgoing_pending' && (
                    <div className="flex items-center gap-1 px-3 py-2 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 font-bold text-xs">
                      <Clock className="w-3.5 h-3.5" />
                      <span>Đã gửi</span>
                    </div>
                  )}

                  {item.relationship_status === 'incoming_pending' && (
                    <div className="flex gap-2">
                      <AppButton
                        id={`btn-accept-search-${item.id}`}
                        variant="primary"
                        size="sm"
                        disabled={actionLoadingId === item.id}
                        onClick={() => handleAcceptRequest(item)}
                        row={idx}
                        col={0}
                        icon={<Check className="w-4 h-4" />}
                      >
                        <span>Đồng ý</span>
                      </AppButton>
                    </div>
                  )}

                  {item.relationship_status === 'friend' && (
                    <div className="flex items-center gap-1 px-3 py-2 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 font-bold text-xs">
                      <UserCheck className="w-3.5 h-3.5" />
                      <span>Bạn bè</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
        </div>
      </div>
    </Modal>
  );
}

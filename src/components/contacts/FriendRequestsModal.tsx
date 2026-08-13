import React, { useState, useEffect } from 'react';
import { Modal } from '../ui/Modal';
import { AppButton } from '../ui/AppButton';
import { friendService } from '../../services/friends/friendService';
import { IncomingRequest } from '../../types/friends';
import { Check, X, Inbox, User } from 'lucide-react';
import { speakVietnamese } from '../../utils/speech';

interface FriendRequestsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRequestHandled?: () => void;
}

export function FriendRequestsModal({ isOpen, onClose, onRequestHandled }: FriendRequestsModalProps) {
  const [requests, setRequests] = useState<IncomingRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null);

  const loadRequests = async () => {
    setLoading(true);
    try {
      const data = await friendService.getIncomingRequests();
      setRequests(data);
    } catch {
      setRequests([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadRequests();
    }
  }, [isOpen]);

  const handleAccept = async (req: IncomingRequest) => {
    setActionLoadingId(req.request_id);
    try {
      const res = await friendService.acceptFriendRequest(req.request_id);
      if (res.success) {
        speakVietnamese(`Đã chấp nhận lời mời kết bạn từ ${req.display_name}`);
        setFeedbackMsg(`Đã kết bạn với ${req.display_name}`);
        setRequests(prev => prev.filter(r => r.request_id !== req.request_id));
        if (onRequestHandled) onRequestHandled();
      }
    } catch {
      setFeedbackMsg('Không thể chấp nhận lời mời.');
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleReject = async (req: IncomingRequest) => {
    setActionLoadingId(req.request_id);
    try {
      const res = await friendService.rejectFriendRequest(req.request_id);
      if (res.success) {
        setFeedbackMsg(`Đã từ chối lời mời từ ${req.display_name}`);
        setRequests(prev => prev.filter(r => r.request_id !== req.request_id));
        if (onRequestHandled) onRequestHandled();
      }
    } catch {
      setFeedbackMsg('Không thể từ chối lời mời.');
    } finally {
      setActionLoadingId(null);
    }
  };

  const getInitials = (name: string) => {
    const parts = name.trim().split(' ').filter(Boolean);
    if (parts.length === 0) return 'U';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Lời mời Kết bạn">
      <div className="flex flex-col gap-4 py-2 max-h-[75vh] overflow-y-auto pr-1">
        {feedbackMsg && (
          <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-sm font-bold">
            {feedbackMsg}
          </div>
        )}

        {loading && (
          <div className="flex items-center justify-center py-10 text-[#3B4B68] font-semibold text-sm">
            Đang tải danh sách lời mời...
          </div>
        )}

        {!loading && requests.length === 0 && (
          <div className="flex flex-col items-center justify-center py-10 text-center gap-3">
            <div className="w-14 h-14 rounded-full bg-[#FFF2D6] flex items-center justify-center border-2 border-[#14213D]/10">
              <Inbox className="w-7 h-7 text-[#3B4B68]" />
            </div>
            <span className="font-bold text-[#14213D] text-base">
              Hiện chưa có lời mời kết bạn.
            </span>
            <span className="text-xs text-[#3B4B68]">
              Khi có người gửi lời mời, danh sách sẽ hiển thị tại đây.
            </span>
          </div>
        )}

        {!loading &&
          requests.map((req, idx) => (
            <div
              key={req.request_id}
              className="flex flex-col sm:flex-row items-center justify-between p-4 bg-white rounded-2xl border-2 border-[#14213D]/10 gap-4 shadow-sm"
            >
              <div className="flex items-center gap-3 w-full sm:w-auto">
                <div className="w-12 h-12 rounded-full bg-[#6AC9F0]/20 border-2 border-[#6AC9F0] flex items-center justify-center flex-shrink-0">
                  {req.avatar_url ? (
                    <img
                      src={req.avatar_url}
                      alt={req.display_name}
                      className="w-full h-full rounded-full object-cover"
                    />
                  ) : (
                    <span className="font-black text-[#14213D] text-sm">
                      {getInitials(req.display_name)}
                    </span>
                  )}
                </div>

                <div className="flex flex-col">
                  <span className="font-bold text-[#14213D] text-base leading-tight">
                    {req.display_name}
                  </span>
                  <span className="text-xs text-[#3B4B68] mt-0.5">Muốn kết bạn với bạn</span>
                </div>
              </div>

              {/* Action buttons with separate EyeFocusable */}
              <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end">
                <AppButton
                  id={`btn-reject-req-${req.request_id}`}
                  variant="outline"
                  size="sm"
                  disabled={actionLoadingId === req.request_id}
                  onClick={() => handleReject(req)}
                  row={idx}
                  col={0}
                  icon={<X className="w-4 h-4 text-rose-600" />}
                >
                  <span>Từ chối</span>
                </AppButton>

                <AppButton
                  id={`btn-accept-req-${req.request_id}`}
                  variant="primary"
                  size="sm"
                  disabled={actionLoadingId === req.request_id}
                  onClick={() => handleAccept(req)}
                  row={idx}
                  col={1}
                  icon={<Check className="w-4 h-4" />}
                >
                  <span>Chấp nhận</span>
                </AppButton>
              </div>
            </div>
          ))}
      </div>
    </Modal>
  );
}

import React, { useEffect, useState } from 'react';
import { ShieldCheck, Camera, Database, Eye, Check, X } from 'lucide-react';
import { PRIVACY_POLICY_VERSION } from '../../modules/privacy/types';

export interface ConsentModalProps {
  isOpen: boolean;
  onAccept: (grantCalibrationStorage: boolean) => void;
  onDecline: () => void;
  initialCalibrationStorageChecked?: boolean;
}

/**
 * Accessible dual-layer consent modal for Face Processing (required for local camera)
 * and Calibration Storage (optional device persistence).
 * Supports mouse, touch, keyboard (Tab / Enter / Escape), screen readers, and caregiver assistance
 * without requiring eye tracking to activate eye tracking.
 */
export function ConsentModal({
  isOpen,
  onAccept,
  onDecline,
  initialCalibrationStorageChecked = false,
}: ConsentModalProps) {
  const [saveCalibrationChecked, setSaveCalibrationChecked] = useState<boolean>(
    initialCalibrationStorageChecked
  );

  useEffect(() => {
    setSaveCalibrationChecked(initialCalibrationStorageChecked);
  }, [initialCalibrationStorageChecked, isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onDecline();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onDecline]);

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="eyeai-consent-modal-title"
      className="fixed inset-0 z-[130] flex items-center justify-center p-4 bg-[#14213D]/70 backdrop-blur-sm"
    >
      <div className="relative w-full max-w-lg bg-white rounded-[28px] p-6 border-2 border-[#14213D]/15 shadow-[0_24px_48px_rgba(20,33,61,0.28)] text-[#14213D] max-h-[92vh] overflow-y-auto">
        <div className="flex items-start justify-between gap-3 pb-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-[#6AC9F0]/20 border border-[#6AC9F0]/50 flex items-center justify-center text-[#0E6C99] shrink-0">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <h2 id="eyeai-consent-modal-title" className="text-lg sm:text-xl font-black text-[#14213D]">
                Quyền riêng tư & Xử lý khuôn mặt cục bộ
              </h2>
              <p className="text-xs font-bold text-[#3B4B68]">
                Chính sách quyền riêng tư v{PRIVACY_POLICY_VERSION}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onDecline}
            aria-label="Đóng hộp thoại đồng ý"
            className="p-2 rounded-full bg-slate-100 hover:bg-slate-200 text-[#14213D] cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="py-4 space-y-4 text-sm">
          {/* Layer 1: Face Processing Consent */}
          <div className="p-4 rounded-2xl bg-sky-50/80 border-2 border-sky-200 space-y-2">
            <div className="flex items-center gap-2 font-black text-[#14213D]">
              <Camera className="w-5 h-5 text-[#0E6C99] shrink-0" />
              <span>1. Quyền xử lý camera & điểm mốc khuôn mặt (Bắt buộc để bật Camera)</span>
            </div>
            <ul className="text-xs font-semibold text-[#3B4B68] space-y-1.5 list-disc pl-5 leading-relaxed">
              <li>
                Khung hình camera và 478 điểm mốc khuôn mặt được xử lý{' '}
                <strong className="text-[#14213D]">100% cục bộ trong RAM trình duyệt</strong>.
              </li>
              <li>
                Không gửi ảnh khuôn mặt, video hoặc tọa độ mắt lên máy chủ, cơ sở dữ liệu hay dịch vụ AI (Gemini).
              </li>
              <li>
                Không lưu lịch sử khung hình hoặc lịch sử tọa độ mắt; dữ liệu tạm trong RAM được giải phóng khi tắt camera hoặc đăng xuất.
              </li>
            </ul>
          </div>

          {/* Layer 2: Independent Calibration Storage Consent */}
          <div className="p-4 rounded-2xl bg-slate-50 border-2 border-slate-200 space-y-2.5">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-2.5">
                <Database className="w-5 h-5 text-[#0E6C99] shrink-0 mt-0.5" />
                <div>
                  <label
                    htmlFor="consent-calibration-storage-checkbox"
                    className="font-black text-[#14213D] cursor-pointer block"
                  >
                    2. Quyền lưu thông số hiệu chỉnh trên thiết bị (Tùy chọn)
                  </label>
                  <p className="text-xs font-semibold text-[#3B4B68] mt-1 leading-relaxed">
                    Chỉ lưu các ngưỡng số học tối giản (EAR, ngưỡng liếc) gắn riêng theo tài khoản hiện tại trên trình duyệt này. Nếu từ chối, Eye Tracking vẫn hoạt động bình thường ở chế độ chỉ dùng RAM (RAM-only).
                  </p>
                </div>
              </div>

              <input
                id="consent-calibration-storage-checkbox"
                type="checkbox"
                checked={saveCalibrationChecked}
                onChange={(e) => setSaveCalibrationChecked(e.target.checked)}
                className="w-5 h-5 mt-1 accent-[#0E6C99] rounded cursor-pointer shrink-0"
              />
            </div>
          </div>

          <div className="p-3 rounded-xl bg-amber-50/90 border border-amber-200 text-xs font-bold text-amber-900 flex items-start gap-2">
            <Eye className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
            <span>
              Bạn có thể thu hồi bất kỳ quyền nào hoặc xóa dữ liệu cục bộ bất cứ lúc nào trong{' '}
              <strong>Cài đặt ➔ Quyền riêng tư và dữ liệu</strong>. Quyền camera của trình duyệt không thay thế sự đồng ý này.
            </span>
          </div>
        </div>

        <div className="pt-3 border-t border-slate-100 flex flex-col sm:flex-row gap-2.5">
          <button
            type="button"
            id="btn-consent-decline"
            onClick={onDecline}
            className="flex-1 min-h-[48px] px-4 py-3 rounded-2xl bg-slate-100 hover:bg-slate-200 text-[#14213D] font-extrabold text-sm cursor-pointer transition-colors"
          >
            Từ chối (Không bật Camera)
          </button>

          <button
            type="button"
            id="btn-consent-accept"
            onClick={() => onAccept(saveCalibrationChecked)}
            className="flex-1 min-h-[48px] px-4 py-3 rounded-2xl bg-[#6AC9F0] hover:bg-[#5bbce3] text-[#14213D] font-black text-sm flex items-center justify-center gap-2 cursor-pointer shadow-sm transition-colors"
          >
            <Check className="w-4 h-4" />
            <span>Đồng ý xử lý cục bộ</span>
          </button>
        </div>
      </div>
    </div>
  );
}

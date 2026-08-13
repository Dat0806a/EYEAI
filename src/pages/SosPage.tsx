import React, { useState, useEffect } from 'react';
import { PageHeader } from '../components/ui/PageHeader';
import { AppButton } from '../components/ui/AppButton';
import { Modal } from '../components/ui/Modal';
import { ShieldAlert, Phone, User, CheckCircle2, AlertTriangle } from 'lucide-react';
import { speakVietnamese } from '../utils/speech';
import { useEyeTrackingTelemetry } from '../modules/eye-control/useEyeTracking';

interface SosPageProps {
  onBack: () => void;
}

interface EmergencyContact {
  id: string;
  name: string;
  role: string;
  phone: string;
}

const EMERGENCY_CONTACTS: EmergencyContact[] = [
  { id: 'c1', name: 'Bác sĩ Nguyễn Văn A', role: 'Bác sĩ điều trị chính', phone: '0901 234 567' },
  { id: 'c2', name: 'Trần Thị B (Người thân)', role: 'Vợ / Người chăm sóc', phone: '0912 345 678' },
  { id: 'c3', name: 'Trung tâm Cấp cứu 115', role: 'Y tế khẩn cấp', phone: '115' },
];

export function SosPage({ onBack }: SosPageProps) {
  const { trackingState } = useEyeTrackingTelemetry();
  const { closedDuration, eyesClosed } = trackingState;

  const [selectedContact, setSelectedContact] = useState<EmergencyContact | null>(null);
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [isCallConfirmed, setIsCallConfirmed] = useState<boolean>(false);
  const [hasSosTriggered, setHasSosTriggered] = useState<boolean>(false);

  // Single Source of Truth: Reusing global closedDuration to compute remaining 8s
  const remainingSeconds = Math.max(0, Math.ceil(8 - closedDuration));

  useEffect(() => {
    if (closedDuration >= 8.0 && !hasSosTriggered) {
      setHasSosTriggered(true);
      speakVietnamese('Báo động khẩn cấp SOS đã được phát tới người thân!');
    }
  }, [closedDuration, hasSosTriggered]);

  const handleSelectContact = (contact: EmergencyContact) => {
    setSelectedContact(contact);
    setIsModalOpen(true);
  };

  const handleConfirmCall = () => {
    setIsCallConfirmed(true);
    speakVietnamese(`Đang thực hiện cuộc gọi khẩn cấp tới ${selectedContact?.name}`);
    setTimeout(() => {
      setIsModalOpen(false);
      setIsCallConfirmed(false);
    }, 2500);
  };

  return (
    <div className="min-h-screen bg-transparent text-[#14213D] flex flex-col pb-28">
      <PageHeader title="Cấp cứu Khẩn cấp (SOS)" showBack onBack={onBack} />

      <main className="flex-1 max-w-md md:max-w-xl mx-auto w-full px-4 py-6 flex flex-col gap-6 items-center">
        
        {/* 8-Second Countdown Circular Progress Visual reusing global closedDuration */}
        <div className="relative w-48 h-48 rounded-full bg-[#FF6F61]/15 border-4 border-[#FF6F61] flex flex-col items-center justify-center p-4 pulse-sos shadow-[0_12px_36px_-4px_rgba(255,111,97,0.4)]">
          <ShieldAlert className="w-12 h-12 text-[#FF6F61] animate-pulse" />
          <span className="text-4xl font-black text-[#FF6F61] mt-1">
            {hasSosTriggered ? '0s' : `${remainingSeconds}s`}
          </span>
          <span className="text-xs font-bold text-[#14213D] uppercase tracking-wider text-center mt-0.5">
            {hasSosTriggered
              ? 'ĐÃ PHÁT BÁO ĐỘNG'
              : eyesClosed
              ? `Nhắm giữ (${closedDuration.toFixed(1)}s)`
              : 'Nhắm mắt giữ 8s'}
          </span>
        </div>

        {/* Informational Guidance Banner */}
        <div className="bg-white rounded-[24px] p-5 border-2 border-[#14213D]/10 card-asymmetric shadow-sm w-full text-center">
          <p className="font-bold text-[#14213D] text-base md:text-lg">
            Hệ thống tự động phát tín hiệu và chia sẻ định vị GPS tới người thân khi bạn nhắm mắt liên tục 8 giây.
          </p>
          <p className="text-xs text-[#3B4B68] mt-1">
            Hoặc chọn một liên hệ bên dưới để thực hiện cuộc gọi hỗ trợ trực tiếp.
          </p>
        </div>

        {/* Emergency Contacts Selector List */}
        <div className="w-full space-y-3">
          <h3 className="font-black text-lg text-[#14213D] px-1">Danh sách liên hệ khẩn cấp:</h3>
          
          {EMERGENCY_CONTACTS.map((contact, idx) => (
            <div key={contact.id}>
              <AppButton
                id={`btn-sos-contact-${contact.id}`}
                variant="accent"
                size="lg"
                fullWidth
                onClick={() => handleSelectContact(contact)}
                icon={<Phone className="w-6 h-6 text-white" />}
                row={idx}
                col={0}
              >
                <div className="flex flex-col text-left w-full">
                  <span className="font-black text-lg">{contact.name}</span>
                  <span className="text-xs font-normal text-white/90">{contact.role} • {contact.phone}</span>
                </div>
              </AppButton>
            </div>
          ))}
        </div>

      </main>

      {/* Custom Confirmation Dialog Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Xác nhận cuộc gọi khẩn cấp"
      >
        <div className="flex flex-col gap-4 text-center py-2">
          {isCallConfirmed ? (
            <div className="flex flex-col items-center gap-3">
              <CheckCircle2 className="w-16 h-16 text-emerald-500 animate-bounce" />
              <h3 className="text-2xl font-black text-[#14213D]">
                Đang kết nối cuộc gọi...
              </h3>
              <p className="text-sm text-[#3B4B68]">
                Đang quay số tới {selectedContact?.name} ({selectedContact?.phone}).
              </p>
            </div>
          ) : (
            <>
              <div className="p-4 rounded-[20px] bg-[#FFF2D6] border border-[#14213D]/10">
                <p className="font-black text-xl text-[#14213D]">
                  Thực hiện cuộc gọi tới <span className="text-[#FF6F61]">{selectedContact?.name}</span>?
                </p>
                <p className="text-sm text-[#3B4B68] mt-1">
                  Số điện thoại: {selectedContact?.phone}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3 mt-2">
                <AppButton
                  id="btn-modal-cancel"
                  variant="secondary"
                  size="md"
                  onClick={() => setIsModalOpen(false)}
                >
                  <span>HỦY BỎ</span>
                </AppButton>

                <AppButton
                  id="btn-modal-confirm"
                  variant="accent"
                  size="md"
                  onClick={handleConfirmCall}
                >
                  <span>XÁC NHẬN GỌI</span>
                </AppButton>
              </div>
            </>
          )}
        </div>
      </Modal>
    </div>
  );
}

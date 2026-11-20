import React, { useState, useEffect, useRef } from 'react';
import { PageHeader } from '../components/ui/PageHeader';
import { AppButton } from '../components/ui/AppButton';
import { Modal } from '../components/ui/Modal';
import { ShieldAlert, Phone, PhoneCall, PhoneOff, CheckCircle2, AlertTriangle, Eye, Navigation } from 'lucide-react';
import { speakVietnamese } from '../utils/speech';
import { useEyeTrackingTelemetry } from '../modules/eye-control/useEyeTracking';

interface SosPageProps {
  onBack: () => void;
  autoCall?: boolean;
}

interface EmergencyContact {
  id: string;
  name: string;
  role: string;
  phone: string;
}

const EMERGENCY_CONTACTS: EmergencyContact[] = [
  { id: 'c3', name: 'Trung tâm Cấp cứu 115', role: 'Y tế khẩn cấp', phone: '115' },
  { id: 'c1', name: 'Bác sĩ Nguyễn Văn A', role: 'Bác sĩ điều trị chính', phone: '0901 234 567' },
  { id: 'c2', name: 'Trần Thị B (Người thân)', role: 'Vợ / Người chăm sóc', phone: '0912 345 678' },
];

export function SosPage({ onBack, autoCall = false }: SosPageProps) {
  const { trackingState } = useEyeTrackingTelemetry();
  const { closedDuration, eyesClosed, blinkCount = 0, lastExecutedAction } = trackingState;

  const [selectedContact, setSelectedContact] = useState<EmergencyContact>(EMERGENCY_CONTACTS[0]);
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [isCallConfirmed, setIsCallConfirmed] = useState<boolean>(false);
  const [hasSosTriggered, setHasSosTriggered] = useState<boolean>(false);
  const [callTimer, setCallTimer] = useState<number>(0);

  const callIntervalRef = useRef<any>(null);

  const startEmergencyCall = (contact: EmergencyContact) => {
    setSelectedContact(contact);
    setHasSosTriggered(true);
    setIsCallConfirmed(true);
    setIsModalOpen(true);
    speakVietnamese(`Đang thực hiện cuộc gọi khẩn cấp tới ${contact.name}! Định vị GPS đang được chia sẻ.`);
  };

  // 1. Trigger if autoCall prop is true on mount
  useEffect(() => {
    if (autoCall && !hasSosTriggered) {
      startEmergencyCall(EMERGENCY_CONTACTS[0]);
    }
  }, [autoCall]);

  // 2. Global eyeai:emergency event listener
  useEffect(() => {
    const handleEmergencyEvent = () => {
      if (!hasSosTriggered) {
        startEmergencyCall(EMERGENCY_CONTACTS[0]);
      }
    };
    window.addEventListener('eyeai:emergency', handleEmergencyEvent);
    return () => window.removeEventListener('eyeai:emergency', handleEmergencyEvent);
  }, [hasSosTriggered]);

  // 3. Eye Tracking 3-Blink Detection trigger (Primary Requirement)
  useEffect(() => {
    if ((blinkCount === 3 || lastExecutedAction === 'EMERGENCY') && !hasSosTriggered) {
      startEmergencyCall(EMERGENCY_CONTACTS[0]);
    }
  }, [blinkCount, lastExecutedAction, hasSosTriggered]);

  // 4. Secondary Safety Fallback: Prolonged 8-second eye close
  useEffect(() => {
    if (closedDuration >= 8.0 && !hasSosTriggered) {
      startEmergencyCall(EMERGENCY_CONTACTS[0]);
    }
  }, [closedDuration, hasSosTriggered]);

  // Call timer effect when call is confirmed
  useEffect(() => {
    if (isCallConfirmed) {
      setCallTimer(0);
      callIntervalRef.current = setInterval(() => {
        setCallTimer(prev => prev + 1);
      }, 1000);
    } else {
      if (callIntervalRef.current) clearInterval(callIntervalRef.current);
    }
    return () => {
      if (callIntervalRef.current) clearInterval(callIntervalRef.current);
    };
  }, [isCallConfirmed]);

  const handleSelectContact = (contact: EmergencyContact) => {
    setSelectedContact(contact);
    setIsCallConfirmed(false);
    setIsModalOpen(true);
  };

  const handleConfirmCall = () => {
    startEmergencyCall(selectedContact);
  };

  const handleCancelCall = () => {
    setIsModalOpen(false);
    setIsCallConfirmed(false);
    setHasSosTriggered(false);
    if (callIntervalRef.current) clearInterval(callIntervalRef.current);
    speakVietnamese('Đã dừng cuộc gọi khẩn cấp');
  };

  const formatTimer = (seconds: number) => {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  return (
    <div className="min-h-screen bg-transparent text-[#14213D] flex flex-col pb-28">
      <PageHeader title="Cấp cứu Khẩn cấp (SOS)" showBack onBack={onBack} />

      <main className="flex-1 max-w-md md:max-w-xl mx-auto w-full px-4 py-6 flex flex-col gap-6 items-center">
        
        {/* 3-Blink Circular Progress Indicator */}
        <div className="relative w-52 h-52 rounded-full bg-gradient-to-b from-[#FF6F61]/20 via-[#FF6F61]/10 to-transparent border-4 border-[#FF6F61] flex flex-col items-center justify-center p-4 pulse-sos shadow-[0_12px_36px_-4px_rgba(255,111,97,0.45)]">
          {hasSosTriggered ? (
            <PhoneCall className="w-14 h-14 text-[#FF6F61] animate-bounce" />
          ) : (
            <ShieldAlert className="w-13 h-13 text-[#FF6F61] animate-pulse" />
          )}

          <div className="flex items-center gap-1.5 mt-2">
            {[1, 2, 3].map(step => (
              <span
                key={step}
                className={`w-3 h-3 rounded-full transition-all duration-200 ${
                  hasSosTriggered || blinkCount >= step
                    ? 'bg-[#FF6F61] scale-125 shadow-[0_0_8px_#FF6F61]'
                    : 'bg-black/15'
                }`}
              />
            ))}
          </div>

          <span className="text-3xl font-black text-[#FF6F61] mt-1.5">
            {hasSosTriggered ? 'ĐANG GỌI' : `${Math.min(3, blinkCount)} / 3`}
          </span>

          <span className="text-xs font-black text-[#14213D] uppercase tracking-wider text-center mt-1">
            {hasSosTriggered
              ? 'ĐÃ KẾT NỐI CẤP CỨU'
              : blinkCount === 2
              ? 'Nháy thêm 1 lần nữa!'
              : blinkCount === 1
              ? 'Đã nháy 1 lần'
              : eyesClosed
              ? `Nhắm giữ (${closedDuration.toFixed(1)}s)`
              : 'Nháy mắt 3 lần để gọi'}
          </span>
        </div>

        {/* Informational Guidance Banner */}
        <div className="bg-white rounded-[24px] p-5 border-2 border-[#14213D]/10 card-asymmetric shadow-sm w-full text-center">
          <p className="font-bold text-[#14213D] text-base md:text-lg">
            Hệ thống tự động kích hoạt cuộc gọi khẩn cấp và chia sẻ định vị GPS tới y tế & người thân khi bạn <span className="text-[#FF6F61] font-black underline decoration-2">nháy mắt 3 lần liên tiếp</span>.
          </p>
          <div className="mt-3 flex items-center justify-center gap-3 text-xs font-bold text-[#3B4B68]">
            <span className="flex items-center gap-1">
              <Eye className="w-4 h-4 text-[#FF6F61]" /> Nháy 3 lần: Gọi 115
            </span>
            <span className="text-slate-300">•</span>
            <span className="flex items-center gap-1">
              <Navigation className="w-4 h-4 text-emerald-600" /> Tự gửi vị trí GPS
            </span>
          </div>
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
                  <div className="flex items-center justify-between">
                    <span className="font-black text-lg">{contact.name}</span>
                    <span className="text-xs bg-white/20 px-2.5 py-0.5 rounded-full font-bold">
                      {contact.phone}
                    </span>
                  </div>
                  <span className="text-xs font-normal text-white/90">{contact.role}</span>
                </div>
              </AppButton>
            </div>
          ))}
        </div>

      </main>

      {/* Emergency Call Modal / Active Call Overlay */}
      <Modal
        isOpen={isModalOpen}
        onClose={handleCancelCall}
        title={isCallConfirmed ? "Đang gọi khẩn cấp SOS" : "Xác nhận cuộc gọi khẩn cấp"}
      >
        <div className="flex flex-col gap-4 text-center py-2">
          {isCallConfirmed ? (
            <div className="flex flex-col items-center gap-3">
              <div className="relative w-20 h-20 rounded-full bg-rose-100 flex items-center justify-center text-rose-600 animate-pulse border-4 border-rose-500 shadow-[0_0_24px_rgba(244,63,94,0.4)]">
                <PhoneCall className="w-10 h-10 animate-bounce" />
              </div>

              <div className="flex flex-col items-center">
                <span className="text-xs font-bold text-rose-600 uppercase tracking-widest animate-pulse">
                  ĐANG KẾT NỐI ĐƯỜNG DÂY NÓNG CẤP CỨU
                </span>
                <h3 className="text-2xl font-black text-[#14213D] mt-1">
                  {selectedContact.name}
                </h3>
                <span className="text-xl font-mono font-black text-rose-600 mt-0.5">
                  {selectedContact.phone}
                </span>
                <span className="text-sm font-mono font-bold text-slate-500 mt-1">
                  Thời lượng: {formatTimer(callTimer)}
                </span>
              </div>

              <div className="w-full p-3 rounded-2xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 font-bold flex items-center justify-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                <span>Tọa độ GPS hiện tại đã được gửi tới người thân</span>
              </div>

              <div className="w-full mt-2">
                <AppButton
                  id="btn-sos-hangup"
                  variant="secondary"
                  size="lg"
                  fullWidth
                  onClick={handleCancelCall}
                  icon={<PhoneOff className="w-5 h-5 text-rose-600" />}
                >
                  <span className="text-rose-600 font-black">KẾT THÚC CUỘC GỌI</span>
                </AppButton>
              </div>
            </div>
          ) : (
            <>
              <div className="p-4 rounded-[20px] bg-[#FFF2D6] border border-[#14213D]/10">
                <p className="font-black text-xl text-[#14213D]">
                  Thực hiện cuộc gọi tới <span className="text-[#FF6F61]">{selectedContact.name}</span>?
                </p>
                <p className="text-sm text-[#3B4B68] mt-1 font-mono font-bold">
                  Số điện thoại: {selectedContact.phone}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3 mt-2">
                <AppButton
                  id="btn-modal-cancel"
                  variant="secondary"
                  size="md"
                  onClick={handleCancelCall}
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

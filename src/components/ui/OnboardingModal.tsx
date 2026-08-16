import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Eye,
  Sparkles,
  MessageSquare,
  Bot,
  Tv,
  PhoneCall,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  HelpCircle,
  X,
  Target,
  Sun,
  Sliders,
  Zap,
} from 'lucide-react';
import { Modal } from './Modal';
import { EyeFocusable } from '../../modules/eye-control/EyeFocusable';

interface OnboardingModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function OnboardingModal({ isOpen, onClose }: OnboardingModalProps) {
  const [currentSlide, setCurrentSlide] = useState<number>(0);
  const totalSlides = 3;

  const handleNext = () => {
    if (currentSlide < totalSlides - 1) {
      setCurrentSlide((prev) => prev + 1);
    } else {
      onClose();
      setCurrentSlide(0);
    }
  };

  const handlePrev = () => {
    if (currentSlide > 0) {
      setCurrentSlide((prev) => prev - 1);
    }
  };

  const handleCloseModal = () => {
    onClose();
    setCurrentSlide(0);
  };

  return (
    <Modal isOpen={isOpen} onClose={handleCloseModal} className="max-w-2xl bg-[#0F172A] border-2 border-[#6AC9F0]/50 text-white p-0 overflow-hidden shadow-[0_0_50px_rgba(106,201,240,0.25)]">
      <div className="relative flex flex-col min-h-[540px] max-h-[88vh]">
        {/* Top Header Banner - High Contrast */}
        <div className="relative bg-gradient-to-r from-[#14213D] via-[#1E2942] to-[#0F172A] p-5 border-b border-white/20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-[#6AC9F0] text-[#0F172A] flex items-center justify-center font-black shadow-lg shadow-[#6AC9F0]/30">
              <Sparkles className="w-6 h-6 animate-pulse" />
            </div>
            <div>
              <h2 className="text-xl font-black tracking-tight text-white uppercase flex items-center gap-2">
                Hướng Dẫn Sử Dụng
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-[#6AC9F0] text-[#0F172A] font-black shadow-md">
                  Trang {currentSlide + 1} / {totalSlides}
                </span>
              </h2>
              <p className="text-xs text-sky-200 font-bold mt-0.5">Trợ lý giao tiếp bằng mắt LUCKY DREAM EyeAI</p>
            </div>
          </div>

          <EyeFocusable id="btn-tutorial-close" onSelect={handleCloseModal} speakLabel="Đóng hướng dẫn">
            <div className="p-2.5 rounded-xl bg-white/15 text-white hover:bg-white/30 transition-colors border border-white/20 cursor-pointer">
              <X className="w-5 h-5" />
            </div>
          </EyeFocusable>
        </div>

        {/* Step Indicator Tabs - High Contrast */}
        <div className="flex border-b border-white/15 bg-[#0A101D] px-4 py-2.5 gap-2">
          {[
            { label: '1. Tổng Quan App', icon: Sparkles },
            { label: '2. Công Thức Giao Tiếp Mắt', icon: Eye },
            { label: '3. Mẹo & Tiện Ích', icon: HelpCircle },
          ].map((tab, idx) => {
            const Icon = tab.icon;
            const isActive = currentSlide === idx;
            return (
              <EyeFocusable
                key={idx}
                id={`btn-tutorial-tab-${idx}`}
                onSelect={() => setCurrentSlide(idx)}
                speakLabel={`Chuyển đến ${tab.label}`}
                className="flex-1"
              >
                <div
                  className={`w-full py-2.5 px-3 rounded-xl text-xs sm:text-sm font-extrabold transition-all flex items-center justify-center gap-2 cursor-pointer border ${
                    isActive
                      ? 'bg-[#6AC9F0] text-[#0F172A] border-[#6AC9F0] shadow-lg shadow-[#6AC9F0]/30 scale-[1.02]'
                      : 'bg-slate-850 text-slate-100 border-slate-700 hover:bg-slate-800 hover:text-white'
                  }`}
                >
                  <Icon className="w-4 h-4 flex-shrink-0" />
                  <span className="hidden sm:inline">{tab.label}</span>
                  <span className="sm:hidden">Trang {idx + 1}</span>
                </div>
              </EyeFocusable>
            );
          })}
        </div>

        {/* Content Body Slider */}
        <div className="flex-1 p-5 overflow-y-auto custom-scrollbar bg-[#0F172A]">
          <AnimatePresence mode="wait">
            {/* TRANG 1: TỔNG QUAN APP */}
            {currentSlide === 0 && (
              <motion.div
                key="slide-0"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.2 }}
                className="space-y-4"
              >
                <div className="bg-gradient-to-r from-[#14213D] via-[#1E2942] to-indigo-950 border-2 border-[#6AC9F0]/40 rounded-2xl p-4 flex items-start gap-3.5 shadow-md">
                  <div className="w-12 h-12 rounded-xl bg-[#6AC9F0] text-[#0F172A] flex items-center justify-center flex-shrink-0 font-black shadow-lg">
                    <Eye className="w-7 h-7" />
                  </div>
                  <div>
                    <h3 className="font-black text-white text-base sm:text-lg">Ứng dụng giao tiếp thông minh bằng ánh mắt</h3>
                    <p className="text-xs sm:text-sm text-slate-100 mt-1 leading-relaxed font-medium">
                      LUCKY DREAM EyeAI giúp người bệnh và người hạn chế vận động có thể tự do điều khiển giao diện, phát ra giọng nói, giải trí và gửi tín hiệu cứu hộ bằng ánh mắt mà không cần dùng tay.
                    </p>
                  </div>
                </div>

                <h4 className="text-xs font-black uppercase text-[#6AC9F0] tracking-wider flex items-center gap-1.5">
                  <Zap className="w-4 h-4 text-amber-300" />
                  Các tính năng cốt lõi:
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="bg-slate-900 border-2 border-slate-750 p-3.5 rounded-2xl flex items-center gap-3 shadow-sm hover:border-[#6AC9F0]/40 transition-colors">
                    <div className="p-3 rounded-xl bg-amber-500/25 text-amber-300 border border-amber-500/40">
                      <MessageSquare className="w-6 h-6" />
                    </div>
                    <div>
                      <h5 className="font-extrabold text-sm sm:text-base text-white">Nói Chuyện Quick-Talk</h5>
                      <p className="text-xs text-slate-200 font-medium">Câu nói có sẵn & gõ phím tiếng Việt</p>
                    </div>
                  </div>

                  <div className="bg-slate-900 border-2 border-slate-750 p-3.5 rounded-2xl flex items-center gap-3 shadow-sm hover:border-[#6AC9F0]/40 transition-colors">
                    <div className="p-3 rounded-xl bg-cyan-500/25 text-[#6AC9F0] border border-cyan-500/40">
                      <Bot className="w-6 h-6" />
                    </div>
                    <div>
                      <h5 className="font-extrabold text-sm sm:text-base text-white">Trợ Lý AI Thông Minh</h5>
                      <p className="text-xs text-slate-200 font-medium">Hỏi đáp & tâm sự 24/7 bằng ánh mắt</p>
                    </div>
                  </div>

                  <div className="bg-slate-900 border-2 border-slate-750 p-3.5 rounded-2xl flex items-center gap-3 shadow-sm hover:border-[#6AC9F0]/40 transition-colors">
                    <div className="p-3 rounded-xl bg-purple-500/25 text-purple-300 border border-purple-500/40">
                      <Tv className="w-6 h-6" />
                    </div>
                    <div>
                      <h5 className="font-extrabold text-sm sm:text-base text-white">Giải Trí YouTube</h5>
                      <p className="text-xs text-slate-200 font-medium">Xem ca nhạc, phim truyền hình trực tiếp</p>
                    </div>
                  </div>

                  <div className="bg-slate-900 border-2 border-slate-750 p-3.5 rounded-2xl flex items-center gap-3 shadow-sm hover:border-[#6AC9F0]/40 transition-colors">
                    <div className="p-3 rounded-xl bg-red-500/25 text-red-300 border border-red-500/40">
                      <PhoneCall className="w-6 h-6" />
                    </div>
                    <div>
                      <h5 className="font-extrabold text-sm sm:text-base text-white">Liên Lạc & Cấp Cứu SOS</h5>
                      <p className="text-xs text-slate-200 font-medium">Gọi người thân & phát chuông báo động</p>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {/* TRANG 2: CÔNG THỨC THAO TÁC MẮT (NHÁY 1, 2, 3 CÁI & NHẮM MẮT 1.5-2S, 2.5S+) */}
            {currentSlide === 1 && (
              <motion.div
                key="slide-1"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.2 }}
                className="space-y-3.5"
              >
                <div className="bg-gradient-to-r from-[#14213D] via-[#1E2942] to-slate-900 border-2 border-[#6AC9F0]/50 rounded-2xl p-4 shadow-md">
                  <h3 className="font-black text-white text-base sm:text-lg flex items-center gap-2">
                    <Target className="w-6 h-6 text-[#6AC9F0]" />
                    Công Thức Thao Tác Mắt Độc Quyền
                  </h3>
                  <p className="text-xs sm:text-sm text-sky-200 font-semibold mt-1">
                    Quy định số lần nháy mắt và thời gian nhắm mắt để điều khiển ứng dụng:
                  </p>
                </div>

                {/* Danh sách 5 Công Thức Chi Tiết */}
                <div className="space-y-2.5">
                  {/* Quy tắc 1: Nháy 1 cái */}
                  <div className="bg-gradient-to-r from-amber-950/90 to-slate-900 border-2 border-amber-400/50 p-3 rounded-2xl flex items-center gap-3 shadow-sm">
                    <div className="w-10 h-10 rounded-xl bg-amber-400 text-[#0F172A] font-black flex items-center justify-center text-lg flex-shrink-0 shadow-md">
                      👁️‍🗨️
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <h4 className="font-black text-white text-sm sm:text-base">Nháy 1 Cái</h4>
                        <span className="px-2.5 py-0.5 rounded-full bg-amber-400 text-[#0F172A] font-black text-xs shadow-sm">
                          CHỌN
                        </span>
                      </div>
                      <p className="text-xs text-slate-100 font-medium mt-0.5">
                        Nháy mắt 1 lần để <strong className="text-amber-300 font-bold">chọn nút bấm / kích hoạt tính năng</strong> tại điểm nhìn.
                      </p>
                    </div>
                  </div>

                  {/* Quy tắc 2: Nháy 2 cái */}
                  <div className="bg-gradient-to-r from-purple-950/90 to-slate-900 border-2 border-purple-400/50 p-3 rounded-2xl flex items-center gap-3 shadow-sm">
                    <div className="w-10 h-10 rounded-xl bg-purple-400 text-[#0F172A] font-black flex items-center justify-center text-lg flex-shrink-0 shadow-md">
                      ➡️
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <h4 className="font-black text-white text-sm sm:text-base">Nháy 2 Cái</h4>
                        <span className="px-2.5 py-0.5 rounded-full bg-purple-400 text-[#0F172A] font-black text-xs shadow-sm">
                          SANG BÊN PHẢI
                        </span>
                      </div>
                      <p className="text-xs text-slate-100 font-medium mt-0.5">
                        Nháy mắt 2 lần liên tiếp để <strong className="text-amber-300 font-bold">di chuyển sang bên phải</strong>.
                      </p>
                    </div>
                  </div>

                  {/* Quy tắc 3: Nháy 3 cái */}
                  <div className="bg-gradient-to-r from-indigo-950/90 to-slate-900 border-2 border-indigo-400/50 p-3 rounded-2xl flex items-center gap-3 shadow-sm">
                    <div className="w-10 h-10 rounded-xl bg-indigo-400 text-[#0F172A] font-black flex items-center justify-center text-lg flex-shrink-0 shadow-md">
                      ⬅️
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <h4 className="font-black text-white text-sm sm:text-base">Nháy 3 Cái</h4>
                        <span className="px-2.5 py-0.5 rounded-full bg-indigo-400 text-[#0F172A] font-black text-xs shadow-sm">
                          SANG BÊN TRÁI
                        </span>
                      </div>
                      <p className="text-xs text-slate-100 font-medium mt-0.5">
                        Nháy mắt 3 lần liên tiếp để <strong className="text-amber-300 font-bold">di chuyển sang bên trái</strong>.
                      </p>
                    </div>
                  </div>

                  {/* Quy tắc 4: Nhắm mắt 1.5 - 2s */}
                  <div className="bg-gradient-to-r from-cyan-950/90 to-slate-900 border-2 border-cyan-400/50 p-3 rounded-2xl flex items-center gap-3 shadow-sm">
                    <div className="w-10 h-10 rounded-xl bg-cyan-400 text-[#0F172A] font-black flex items-center justify-center text-lg flex-shrink-0 shadow-md">
                      ⬇️
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <h4 className="font-black text-white text-sm sm:text-base">Nhắm Mắt 1.5s - 2.0s</h4>
                        <span className="px-2.5 py-0.5 rounded-full bg-cyan-400 text-[#0F172A] font-black text-xs shadow-sm">
                          XUỐNG DƯỚI
                        </span>
                      </div>
                      <p className="text-xs text-slate-100 font-medium mt-0.5">
                        Nhắm mắt giữ trong khoảng 1.5s đến 2.0s để <strong className="text-amber-300 font-bold">di chuyển xuống dưới</strong> (cuộn xuống).
                      </p>
                    </div>
                  </div>

                  {/* Quy tắc 5: Nhắm mắt 2.5s trở lên */}
                  <div className="bg-gradient-to-r from-sky-950/90 to-slate-900 border-2 border-sky-400/50 p-3 rounded-2xl flex items-center gap-3 shadow-sm">
                    <div className="w-10 h-10 rounded-xl bg-sky-400 text-[#0F172A] font-black flex items-center justify-center text-lg flex-shrink-0 shadow-md">
                      ⬆️
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <h4 className="font-black text-white text-sm sm:text-base">Nhắm Mắt Từ 2.5s Trở Lên</h4>
                        <span className="px-2.5 py-0.5 rounded-full bg-sky-400 text-[#0F172A] font-black text-xs shadow-sm">
                          LÊN TRÊN
                        </span>
                      </div>
                      <p className="text-xs text-slate-100 font-medium mt-0.5">
                        Nhắm mắt giữ từ 2.5s trở lên để <strong className="text-amber-300 font-bold">di chuyển lên trên</strong> (cuộn lên).
                      </p>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {/* TRANG 3: MẸO & TIỆN ÍCH */}
            {currentSlide === 2 && (
              <motion.div
                key="slide-2"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.2 }}
                className="space-y-4"
              >
                <div className="bg-gradient-to-r from-emerald-950/90 to-teal-950 border-2 border-emerald-400/50 rounded-2xl p-4 flex items-start gap-3.5 shadow-md">
                  <CheckCircle2 className="w-7 h-7 text-emerald-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <h3 className="font-black text-white text-base sm:text-lg">Bạn đã sẵn sàng sử dụng ứng dụng!</h3>
                    <p className="text-xs sm:text-sm text-slate-100 mt-1 leading-relaxed font-medium">
                      Hãy ghi nhớ các mẹo tư thế và tiện ích nhanh bên dưới để thao tác mắt đạt độ chính xác cao nhất.
                    </p>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="bg-slate-900 border-2 border-slate-750 p-4 rounded-2xl flex items-start gap-3.5 shadow-sm">
                    <Sun className="w-6 h-6 text-amber-300 flex-shrink-0 mt-0.5" />
                    <div>
                      <h5 className="font-extrabold text-sm sm:text-base text-white">Tư Thế Ngồi & Ánh Sáng Chuẩn</h5>
                      <p className="text-xs sm:text-sm text-slate-200 mt-1 font-medium leading-relaxed">
                        Ngồi đối diện thẳng camera khoảng cách <strong className="text-amber-300 font-bold">40 - 70 cm</strong>. Đảm bảo phòng đủ sáng, tránh để đèn chiếu thẳng vào camera gây chói.
                      </p>
                    </div>
                  </div>

                  <div className="bg-slate-900 border-2 border-slate-750 p-4 rounded-2xl flex items-start gap-3.5 shadow-sm">
                    <Sliders className="w-6 h-6 text-[#6AC9F0] flex-shrink-0 mt-0.5" />
                    <div>
                      <h5 className="font-extrabold text-sm sm:text-base text-white">Tùy Chỉnh Tốc Độ Dwell theo Yêu Cầu</h5>
                      <p className="text-xs sm:text-sm text-slate-200 mt-1 font-medium leading-relaxed">
                        Nếu thấy 1.5 giây quá nhanh hoặc quá chậm, bạn có thể vào menu <strong className="text-[#6AC9F0]">Cài Đặt ⚙️</strong> để điều chỉnh thời gian giữ ánh mắt phù hợp.
                      </p>
                    </div>
                  </div>

                  <div className="bg-slate-900 border-2 border-slate-750 p-4 rounded-2xl flex items-start gap-3.5 shadow-sm">
                    <HelpCircle className="w-6 h-6 text-indigo-300 flex-shrink-0 mt-0.5" />
                    <div>
                      <h5 className="font-extrabold text-sm sm:text-base text-white">Xem Lại Hướng Dẫn Bất Kỳ Lúc Nào</h5>
                      <p className="text-xs sm:text-sm text-slate-200 mt-1 font-medium leading-relaxed">
                        Bấm vào biểu tượng nút hỏi chấm <strong className="px-2 py-0.5 rounded bg-[#6AC9F0] text-[#0F172A] font-black text-xs shadow-sm">?</strong> ở góc phải thanh Header bất kỳ lúc nào để xem lại bảng hướng dẫn này.
                      </p>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Footer Controls - Clean Single Trigger Stepper */}
        <div className="p-4 bg-[#0A101D] border-t border-white/15 flex items-center justify-between gap-3">
          {currentSlide > 0 ? (
            <EyeFocusable id="btn-tutorial-prev" onSelect={handlePrev} speakLabel="Trang trước">
              <div className="px-4 py-2.5 rounded-xl bg-slate-800 text-white font-extrabold text-xs sm:text-sm hover:bg-slate-700 transition-all flex items-center gap-1.5 cursor-pointer active:scale-95 border border-slate-700 shadow-md">
                <ChevronLeft className="w-4 h-4" />
                <span>Trang Trước</span>
              </div>
            </EyeFocusable>
          ) : (
            <div />
          )}

          <div className="flex items-center gap-2">
            {[0, 1, 2].map((idx) => (
              <div
                key={idx}
                onClick={() => setCurrentSlide(idx)}
                className={`h-3 rounded-full transition-all cursor-pointer ${
                  currentSlide === idx ? 'bg-[#6AC9F0] w-7 shadow-md shadow-[#6AC9F0]/40' : 'bg-slate-700 w-3 hover:bg-slate-500'
                }`}
                aria-label={`Slide ${idx + 1}`}
              />
            ))}
          </div>

          <EyeFocusable
            id="btn-tutorial-next"
            onSelect={handleNext}
            speakLabel={currentSlide === totalSlides - 1 ? 'Đã hiểu và bắt đầu' : 'Trang tiếp theo'}
          >
            <div className="px-5 py-2.5 rounded-xl bg-[#6AC9F0] text-[#0F172A] font-black text-xs sm:text-sm hover:bg-[#52baee] transition-all flex items-center gap-2 shadow-lg shadow-[#6AC9F0]/30 cursor-pointer active:scale-95">
              <span>{currentSlide === totalSlides - 1 ? 'Đã Hiểu & Bắt Đầu' : 'Trang Tiếp'}</span>
              {currentSlide === totalSlides - 1 ? <CheckCircle2 className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            </div>
          </EyeFocusable>
        </div>
      </div>
    </Modal>
  );
}

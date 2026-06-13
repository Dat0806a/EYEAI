import React, { useState } from 'react';
import EyeTalkDashboard from './components/EyeTalkDashboard';
import { Eye, Keyboard, HelpCircle, Check, Sparkles, User, ShieldAlert, Monitor, Volume2, Accessibility, Play } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export default function App() {
  const [view, setView] = useState<'home' | 'chat'>('home');
  const [isExtraLarge, setIsExtraLarge] = useState<boolean>(false);

  return (
    <div className={`min-h-screen transition-all ${isExtraLarge ? 'text-xl' : 'text-base'} bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-100`}>
      
      {/* Dynamic Accessible Top Utility Bar */}
      <header className="bg-white dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 py-3.5 px-4 md:px-6 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-2.5">
          <Eye className="w-7 h-7 text-indigo-600 animate-pulse" />
          <span className="font-sans font-black text-xl tracking-tight text-slate-900 dark:text-white uppercase">
            EyeTalk Assistant
          </span>
        </div>
        
        {/* Simple Utility controls for visually impaired seniors */}
        <div className="flex items-center gap-3">
          <button
            id="btn-toggle-accessibility-font"
            onClick={() => setIsExtraLarge(!isExtraLarge)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${
              isExtraLarge 
                ? 'bg-indigo-600 text-white border-indigo-700' 
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700'
            }`}
            title="Bật/Tắt chữ to"
          >
            <Accessibility className="w-4 h-4" />
            <span>Kích thước chữ: {isExtraLarge ? 'CỰC TO' : 'TIÊU CHUẨN'}</span>
          </button>
        </div>
      </header>

      <AnimatePresence mode="wait">
        {view === 'home' ? (
          <motion.main
            key="home-screen"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.3 }}
            className="max-w-4xl mx-auto px-4 py-8 md:py-16 flex flex-col gap-8 md:gap-12"
          >
            
            {/* Elegant Display Banner */}
            <div className="text-center flex flex-col items-center gap-4">
              <span className="px-3.5 py-1.5 bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300 text-xs font-bold uppercase tracking-widest rounded-full flex items-center gap-1">
                <Sparkles className="w-3.5 h-3.5" /> Giải pháp giao tiếp y tế thông minh
              </span>
              
              <h1 className="text-4xl md:text-5xl font-black text-slate-900 dark:text-white tracking-tight leading-tight max-w-2xl">
                Để Đôi Mắt Thay Lời Nói Của Bạn
              </h1>
              
              <p className="text-lg md:text-xl text-slate-500 dark:text-slate-400 max-w-xl leading-relaxed mt-2">
                Hệ thống virtual keyboard điều khiển bằng hướng nhìn và cái nhắm mắt. Người bệnh, người cao tuổi có thể giao tiếp dễ dàng, không cần chạm hay gõ phím.
              </p>

              {/* Huge Primary Launcher Button for seniors (Interactive with large padding and pointer scale-hover) */}
              <button
                id="btn-launch-chat-interface"
                onClick={() => setView('chat')}
                className="group relative mt-6 flex items-center justify-center gap-3 px-10 py-5 bg-indigo-600 hover:bg-indigo-700 text-white text-xl font-bold rounded-2xl shadow-lg ring-4 ring-indigo-100 dark:ring-indigo-950/40 hover:scale-102 hover:shadow-xl transition-all cursor-pointer"
              >
                <Play className="w-6 h-6 fill-white" />
                <span>Bắt đầu Trò chuyện</span>
                <span className="absolute -bottom-1 left-1/2 transform -translate-x-1/2 w-4/5 h-1.5 bg-indigo-800/20 blur-md rounded-full group-hover:scale-105 transition-all" />
              </button>
            </div>

            {/* How It Works Guidelines / Visual Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-4">
              
              {/* Card 1: Features for patient */}
              <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 border border-slate-100 dark:border-slate-800 shadow-sm flex flex-col gap-4">
                <h3 className="text-lg font-bold text-indigo-600 dark:text-indigo-400 flex items-center gap-2">
                  <Eye className="w-5 h-5" />
                  <span>Cách thức điều khiển bằng cử chỉ mắt (Nhìn thẳng)</span>
                </h3>
                
                <ul className="space-y-3 text-slate-600 dark:text-slate-300 text-sm leading-relaxed">
                  <li className="flex gap-2">
                    <span className="text-indigo-500 font-bold">➡️</span>
                    <span><strong>Phải (Next):</strong> Nháy mắt 2 lần liên tiếp trong vòng 1.5 giây để di chuyển vùng chọn sang phải.</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="text-indigo-500 font-bold">⬅️</span>
                    <span><strong>Trái (Back):</strong> Nháy mắt 3 lần liên tiếp trong vòng 3.5 giây để di chuyển vùng chọn sang trái.</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="text-emerald-500 font-bold">🎯</span>
                    <span><strong>Chọn phím (Select):</strong> Nháy mắt 1 lần để kích hoạt/chọn phím đã tô đậm và hiển thị nội dung ô được chọn lên khung chat.</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="text-indigo-500 font-bold">👇</span>
                    <span><strong>Xuống hàng (Down):</strong> Nhắm cả hai mắt giữ 1.5–2.0 giây rồi mở ra để di chuyển xuống hàng phím dưới.</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="text-indigo-500 font-bold">👆</span>
                    <span><strong>Lên hàng (Up):</strong> Nhắm cả hai mắt giữ khoảng 2.5 giây rồi mở ra để di chuyển lên hàng phím trên.</span>
                  </li>
                </ul>
              </div>

              {/* Card 2: Technical simulation details */}
              <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 border border-slate-100 dark:border-slate-800 shadow-sm flex flex-col gap-4">
                <h3 className="text-lg font-bold text-amber-600 dark:text-amber-400 flex items-center gap-2">
                  <Keyboard className="w-5 h-5" />
                  <span>Cảm biến giả lập hỗ trợ thử nghiệm</span>
                </h3>
                
                <div className="text-slate-600 dark:text-slate-300 text-sm leading-relaxed flex flex-col gap-3">
                  <p>
                    Để đơn giản cho việc kiểm thử khi không đứng trước camera hoặc khi phòng không đủ sáng, hệ thống tích hợp sẵn <strong>Cảm biến Bàn phím máy tính</strong>:
                  </p>
                  
                  <div className="p-3 bg-slate-50 dark:bg-slate-900 rounded-xl space-y-2 border border-slate-100 dark:border-slate-700 font-mono text-xs text-slate-500 dark:text-slate-400">
                    <div className="flex justify-between">
                      <span>Mũi Phím phải (→)</span>
                      <span className="font-bold text-indigo-600">Next phím tiếp</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Mũi Phím trái (←)</span>
                      <span className="font-bold text-indigo-600">Back phím trước</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Mũi Phím lên (↑)</span>
                      <span className="font-bold text-indigo-600">Lên hàng trên</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Mũi Phím xuống (↓)</span>
                      <span className="font-bold text-indigo-600">Xuống hàng dưới</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Phím Enter</span>
                      <span className="font-bold text-emerald-600 font-bold">SELECT (Chọn)</span>
                    </div>
                  </div>

                  <p className="text-xs text-slate-400">
                    * Bạn có thể chuyển đổi giữa camera và giả lập bất kỳ lúc nào ngay trên bảng điều khiển một cách dễ dàng.
                  </p>
                </div>
              </div>

            </div>

            {/* Smart medical quick tips */}
            <div className="bg-indigo-50 dark:bg-indigo-950/40 rounded-2xl p-6 border border-indigo-100 dark:border-indigo-900 flex flex-col md:flex-row items-center gap-4">
              <span className="text-3xl">💡</span>
              <div className="text-sm">
                <p className="font-bold text-indigo-950 dark:text-indigo-200">Gợi ý trải nghiệm hoàn hảo cho người già:</p>
                <p className="text-slate-600 dark:text-slate-400 mt-1">
                  Đặt webcam ngay chính diện khuôn mặt với khoảng cách từ 40cm đến 60cm. Cố gắng có ánh sáng phòng vừa đủ soi sáng vùng mắt, và giữ đầu thẳng cố định khi điều khiển.
                </p>
              </div>
            </div>

            {/* Footer with safety warning */}
            <footer className="text-center text-xs text-slate-400 border-t border-slate-200 dark:border-slate-800 pt-6">
              EyeTalk Assistant &copy; 2026 • Được thiết kế tối ưu hóa khả năng truy cập cao cho người khiếm khuyết.
            </footer>

          </motion.main>
        ) : (
          <motion.div
            key="chat-screen"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
          >
            {/* Render loaded dashboard controls panel */}
            <EyeTalkDashboard onBackToHome={() => setView('home')} />
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}


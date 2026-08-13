import React, { useState } from 'react';
import { Modal } from '../ui/Modal';
import { AppButton } from '../ui/AppButton';
import { supabase } from '../../lib/supabase';
import { LogIn, UserPlus, Sparkles, Mail, Lock, User } from 'lucide-react';
import { speakVietnamese } from '../../utils/speech';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export function AuthModal({ isOpen, onClose, onSuccess }: AuthModalProps) {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setErrorMsg(null);
    if (!email || !password) {
      setErrorMsg('Vui lòng nhập đầy đủ Email và Mật khẩu.');
      return;
    }

    setLoading(true);
    try {
      if (mode === 'signup') {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              display_name: displayName || email.split('@')[0],
            },
          },
        });

        if (error) throw error;

        if (data.user) {
          speakVietnamese('Đăng ký tài khoản thành công');
          if (onSuccess) onSuccess();
          onClose();
        }
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (error) throw error;

        if (data.user) {
          speakVietnamese('Đăng nhập thành công');
          if (onSuccess) onSuccess();
          onClose();
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Đã có lỗi xảy ra';
      setErrorMsg(msg.includes('Invalid login credentials') ? 'Tài khoản hoặc mật khẩu không chính xác.' : msg);
    } finally {
      setLoading(false);
    }
  };

  const handleQuickDemo = async (demoNumber: 1 | 2) => {
    setLoading(true);
    setErrorMsg(null);
    const demoEmail = `benhnhan${demoNumber}@eyetalk.app`;
    const demoPassword = 'Password123!';
    const demoName = demoNumber === 1 ? 'Nguyễn Văn An' : 'Trần Thị Bình';

    try {
      // 1. Try sign in first
      const { data: signInData, error: signInErr } = await supabase.auth.signInWithPassword({
        email: demoEmail,
        password: demoPassword,
      });

      if (!signInErr && signInData.user) {
        speakVietnamese(`Đã đăng nhập tài khoản ${demoName}`);
        if (onSuccess) onSuccess();
        onClose();
        return;
      }

      // 2. If sign in failed, create account
      const { data: signUpData, error: signUpErr } = await supabase.auth.signUp({
        email: demoEmail,
        password: demoPassword,
        options: {
          data: { display_name: demoName },
        },
      });

      if (signUpErr) throw signUpErr;

      if (signUpData.user) {
        // Create profile if needed
        await supabase.from('profiles').upsert({
          id: signUpData.user.id,
          display_name: demoName,
        });

        speakVietnamese(`Đã tạo và đăng nhập ${demoName}`);
        if (onSuccess) onSuccess();
        onClose();
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Lỗi tạo tài khoản Demo';
      setErrorMsg(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={mode === 'signin' ? 'Đăng nhập Tài khoản' : 'Đăng ký Tài khoản Mới'}
    >
      <div className="flex flex-col gap-5 py-2">
        {errorMsg && (
          <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-sm font-semibold">
            {errorMsg}
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-3.5">
          {mode === 'signup' && (
            <div>
              <label className="block text-xs font-bold text-[#14213D] mb-1">Tên hiển thị</label>
              <div className="relative">
                <User className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-[#3B4B68]" />
                <input
                  type="text"
                  value={displayName}
                  onChange={e => setDisplayName(e.target.value)}
                  placeholder="Ví dụ: Nguyễn Văn A"
                  className="w-full pl-10 pr-4 py-3 bg-white border-2 border-[#14213D]/15 rounded-xl font-medium text-[#14213D] focus:border-[#6AC9F0] outline-none"
                />
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-[#14213D] mb-1">Email</label>
            <div className="relative">
              <Mail className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-[#3B4B68]" />
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="email@vietham.com"
                className="w-full pl-10 pr-4 py-3 bg-white border-2 border-[#14213D]/15 rounded-xl font-medium text-[#14213D] focus:border-[#6AC9F0] outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-[#14213D] mb-1">Mật khẩu</label>
            <div className="relative">
              <Lock className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-[#3B4B68]" />
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full pl-10 pr-4 py-3 bg-white border-2 border-[#14213D]/15 rounded-xl font-medium text-[#14213D] focus:border-[#6AC9F0] outline-none"
              />
            </div>
          </div>

          <div className="mt-2">
            <AppButton
              id="btn-auth-submit"
              variant="primary"
              size="lg"
              fullWidth
              disabled={loading}
              onClick={handleSubmit}
              icon={mode === 'signin' ? <LogIn className="w-5 h-5" /> : <UserPlus className="w-5 h-5" />}
            >
              <span>{loading ? 'Đang xử lý...' : mode === 'signin' ? 'ĐĂNG NHẬP' : 'TẠO TÀI KHOẢN'}</span>
            </AppButton>
          </div>
        </form>

        <div className="flex items-center justify-center gap-2 text-sm text-[#3B4B68]">
          <span>{mode === 'signin' ? 'Chưa có tài khoản?' : 'Đã có tài khoản?'}</span>
          <button
            type="button"
            onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')}
            className="font-bold text-[#6AC9F0] hover:underline"
          >
            {mode === 'signin' ? 'Đăng ký ngay' : 'Đăng nhập'}
          </button>
        </div>

        {/* Quick Demo Login Option */}
        <div className="border-t border-[#14213D]/10 pt-4 flex flex-col gap-2">
          <div className="flex items-center gap-1.5 text-xs font-bold text-[#3B4B68] justify-center">
            <Sparkles className="w-4 h-4 text-[#FF6F61]" />
            <span>Thử nghiệm nhanh với tài khoản Demo</span>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <AppButton
              id="btn-demo-user-1"
              variant="secondary"
              size="sm"
              fullWidth
              disabled={loading}
              onClick={() => handleQuickDemo(1)}
            >
              <span>Demo 1 (Nguyễn An)</span>
            </AppButton>

            <AppButton
              id="btn-demo-user-2"
              variant="secondary"
              size="sm"
              fullWidth
              disabled={loading}
              onClick={() => handleQuickDemo(2)}
            >
              <span>Demo 2 (Trần Bình)</span>
            </AppButton>
          </div>
        </div>
      </div>
    </Modal>
  );
}

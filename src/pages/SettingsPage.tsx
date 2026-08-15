import React, { useState } from 'react';
import { PageHeader } from '../components/ui/PageHeader';
import { AppButton } from '../components/ui/AppButton';
import { Modal } from '../components/ui/Modal';
import { useEyeTracking } from '../modules/eye-control/useEyeTracking';
import { EyeFocusable } from '../modules/eye-control/EyeFocusable';
import {
  Eye,
  Camera,
  Keyboard,
  Volume2,
  Target,
  AlertTriangle,
  Play,
  Minus,
  Plus,
  User,
  LogOut,
  Mail,
  Edit2,
  Lock,
  CheckCircle2,
  AlertCircle,
  Check,
  X,
} from 'lucide-react';
import { StatusBadge } from '../components/ui/StatusBadge';
import { CameraPreview } from '../modules/eye-control/CameraPreview';
import { speakVietnamese } from '../utils/speech';
import { useAuth } from '../hooks/useAuth';
import { supabase } from '../lib/supabase';
import { AccountType, ACCOUNT_TYPE_LABELS, getAccountTypeLabel } from '../types/account';

interface SettingsPageProps {
  onBack: () => void;
}

export function SettingsPage({ onBack }: SettingsPageProps) {
  const {
    settings,
    trackingState,
    setEyeControlEnabled,
    setSimulatorMode,
    setSoundFeedback,
    setSpeakerEnabled,
    setSpeechVolume,
    setSpeechRate,
    toggleCamera,
    startCalibration,
    calibrationStage,
    calibrationProgress,
    calibrationMessage,
  } = useEyeTracking();

  const {
    user,
    profile,
    isAuthenticated,
    signOut,
    updateAccountType,
    updateDisplayName,
  } = useAuth();

  const [speakerNotice, setSpeakerNotice] = useState<string | null>(null);

  // Account Settings States
  const [isEditingName, setIsEditingName] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [savingName, setSavingName] = useState(false);

  const [pendingAccountType, setPendingAccountType] = useState<AccountType | null>(null);
  const [showTypeConfirmModal, setShowTypeConfirmModal] = useState(false);
  const [updatingType, setUpdatingType] = useState(false);

  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null);

  const [accountNotice, setAccountNotice] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const speechSupported = typeof window !== 'undefined' && 'speechSynthesis' in window;

  // Handlers for Account Settings
  const handleStartEditName = () => {
    setNameInput(profile?.display_name || '');
    setIsEditingName(true);
  };

  const handleSaveName = async () => {
    if (!nameInput.trim()) return;
    setSavingName(true);
    setAccountNotice(null);
    const res = await updateDisplayName(nameInput.trim());
    setSavingName(false);
    if (res.success) {
      setIsEditingName(false);
      speakVietnamese('Đã cập nhật tên hiển thị thành công');
      setAccountNotice({ type: 'success', message: 'Đã cập nhật tên hiển thị thành công!' });
    } else {
      setAccountNotice({ type: 'error', message: res.error || 'Không thể cập nhật tên.' });
    }
  };

  const handleSelectAccountType = (targetType: AccountType) => {
    if (targetType === profile?.account_type) return;
    setPendingAccountType(targetType);
    setShowTypeConfirmModal(true);
  };

  const handleConfirmAccountTypeChange = async () => {
    if (!pendingAccountType) return;
    setUpdatingType(true);
    setAccountNotice(null);

    const res = await updateAccountType(pendingAccountType);
    setUpdatingType(false);
    setShowTypeConfirmModal(false);

    if (res.success) {
      const label = ACCOUNT_TYPE_LABELS[pendingAccountType];
      speakVietnamese(`Đã chuyển loại tài khoản thành ${label}`);
      setAccountNotice({
        type: 'success',
        message: `Đã cập nhật loại tài khoản thành ${label}`,
      });
    } else {
      setAccountNotice({
        type: 'error',
        message: res.error || 'Không thể cập nhật loại tài khoản.',
      });
    }
    setPendingAccountType(null);
  };

  const handleUpdatePassword = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setPasswordError(null);
    setPasswordSuccess(null);

    if (!newPassword) {
      setPasswordError('Vui lòng nhập mật khẩu mới.');
      return;
    }
    if (newPassword.length < 6) {
      setPasswordError('Mật khẩu mới phải có ít nhất 6 ký tự.');
      return;
    }
    if (newPassword !== confirmNewPassword) {
      setPasswordError('Mật khẩu xác nhận không khớp.');
      return;
    }

    setPasswordLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;

      setPasswordSuccess('Đổi mật khẩu thành công!');
      speakVietnamese('Đã đổi mật khẩu thành công');
      setNewPassword('');
      setConfirmNewPassword('');
      setTimeout(() => {
        setShowPasswordModal(false);
        setPasswordSuccess(null);
      }, 1800);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Đổi mật khẩu thất bại.';
      setPasswordError(msg);
    } finally {
      setPasswordLoading(false);
    }
  };

  const handleTestSpeaker = () => {
    if (!settings.speakerEnabled) {
      setSpeakerNotice('Hãy bật Kích hoạt loa trước.');
      setTimeout(() => setSpeakerNotice(null), 3500);
      return;
    }
    speakVietnamese('Xin chào, đây là giọng nói của LUCKY DREAM.');
  };

  const handleDecreaseVolume = () => {
    if (!settings.speakerEnabled) return;
    const newVol = Math.max(0, Math.round((settings.speechVolume - 0.1) * 10) / 10);
    setSpeechVolume(newVol);
  };

  const handleIncreaseVolume = () => {
    if (!settings.speakerEnabled) return;
    const newVol = Math.min(1.0, Math.round((settings.speechVolume + 0.1) * 10) / 10);
    setSpeechVolume(newVol);
  };

  const handleDecreaseRate = () => {
    if (!settings.speakerEnabled) return;
    const newRate = Math.max(0.7, Math.round((settings.speechRate - 0.1) * 10) / 10);
    setSpeechRate(newRate);
  };

  const handleIncreaseRate = () => {
    if (!settings.speakerEnabled) return;
    const newRate = Math.min(1.5, Math.round((settings.speechRate + 0.1) * 10) / 10);
    setSpeechRate(newRate);
  };

  return (
    <div className="min-h-screen bg-transparent text-[#14213D] flex flex-col pb-28">
      <PageHeader title="Cài đặt Hỗ trợ" showBack onBack={onBack} />

      <main className="flex-1 max-w-md md:max-w-xl mx-auto w-full px-4 py-6 flex flex-col gap-6">

        {/* ================= SECTION 0: CÀI ĐẶT TÀI KHOẢN ================= */}
        <div className="bg-white rounded-[28px] p-6 border-2 border-[#14213D]/10 card-asymmetric shadow-sm flex flex-col gap-5">
          {/* Header */}
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-[16px] bg-[#0E6C99]/15 text-[#0E6C99]">
                <User className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-black text-lg text-[#14213D]">Cài đặt tài khoản</h3>
                <p className="text-xs text-[#3B4B68]">Quản lý thông tin cá nhân và loại tài khoản</p>
              </div>
            </div>

            {isAuthenticated && (
              <EyeFocusable
                id="btn-account-logout"
                onSelect={signOut}
                speakLabel="Đăng xuất tài khoản"
              >
                <AppButton
                  id="btn-account-logout"
                  variant="outline"
                  size="sm"
                  onClick={signOut}
                  icon={<LogOut className="w-4 h-4 text-rose-600" />}
                >
                  <span>Đăng xuất</span>
                </AppButton>
              </EyeFocusable>
            )}
          </div>

          {/* Account Notification Banner */}
          {accountNotice && (
            <div
              className={`p-3 rounded-2xl border text-xs font-black flex items-center justify-between gap-2 ${
                accountNotice.type === 'success'
                  ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-950'
                  : 'bg-rose-500/15 border-rose-500/40 text-rose-950'
              }`}
            >
              <div className="flex items-center gap-2">
                {accountNotice.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                )}
                <span>{accountNotice.message}</span>
              </div>
              <button
                type="button"
                onClick={() => setAccountNotice(null)}
                className="p-1 hover:opacity-75 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* User Profile Card */}
          <div className="p-4 rounded-[20px] bg-gradient-to-r from-sky-50/80 to-indigo-50/80 border border-sky-100 flex items-center gap-4">
            {/* Avatar */}
            <div className="w-14 h-14 rounded-2xl bg-[#0E6C99] text-white font-black text-xl flex items-center justify-center shadow-md overflow-hidden shrink-0">
              {profile?.avatar_url ? (
                <img
                  src={profile.avatar_url}
                  alt={profile.display_name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <span>
                  {(profile?.display_name || user?.email || 'U').charAt(0).toUpperCase()}
                </span>
              )}
            </div>

            {/* Info Details */}
            <div className="flex-1 min-w-0 flex flex-col gap-1">
              {/* Display Name Edit / View */}
              {isEditingName ? (
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={nameInput}
                    onChange={(e) => setNameInput(e.target.value)}
                    disabled={savingName}
                    className="flex-1 px-3 py-1 bg-white border border-[#0E6C99] rounded-xl font-bold text-sm text-[#14213D] outline-none"
                    placeholder="Nhập tên hiển thị"
                    autoFocus
                  />
                  <EyeFocusable
                    id="btn-save-name"
                    onSelect={handleSaveName}
                    speakLabel="Lưu tên hiển thị"
                  >
                    <button
                      type="button"
                      onClick={handleSaveName}
                      disabled={savingName}
                      className="p-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs cursor-pointer"
                    >
                      <Check className="w-4 h-4" />
                    </button>
                  </EyeFocusable>
                  <EyeFocusable
                    id="btn-cancel-name"
                    onSelect={() => setIsEditingName(false)}
                    speakLabel="Hủy chỉnh sửa tên"
                  >
                    <button
                      type="button"
                      onClick={() => setIsEditingName(false)}
                      disabled={savingName}
                      className="p-1.5 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold text-xs cursor-pointer"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </EyeFocusable>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <h4 className="font-black text-base text-[#14213D] truncate">
                    {profile?.display_name || 'Người dùng'}
                  </h4>
                  <EyeFocusable
                    id="btn-edit-name"
                    onSelect={handleStartEditName}
                    speakLabel="Chỉnh sửa tên hiển thị"
                  >
                    <button
                      type="button"
                      onClick={handleStartEditName}
                      className="p-1 hover:bg-white/80 rounded-lg text-[#0E6C99] transition-colors cursor-pointer"
                      title="Sửa tên"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                  </EyeFocusable>
                </div>
              )}

              {/* Email */}
              <div className="flex items-center gap-1.5 text-xs text-slate-600 font-bold truncate">
                <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span className="truncate">{user?.email || 'Chưa cập nhật email'}</span>
              </div>
            </div>
          </div>

          {/* ACCOUNT TYPE SECTION */}
          <div className="flex flex-col gap-3 pt-2 border-t border-slate-100">
            <div className="flex items-center justify-between">
              <div className="flex flex-col">
                <span className="font-extrabold text-sm text-[#14213D]">Loại tài khoản</span>
                <span className="text-xs text-slate-500">Chọn nhóm người dùng phù hợp với bạn</span>
              </div>

              {/* Current Account Type Badge */}
              <span
                className={`px-3 py-1 rounded-full text-xs font-black border ${
                  profile?.account_type === 'impaired'
                    ? 'bg-blue-50 border-blue-200 text-blue-800'
                    : profile?.account_type === 'patient'
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                    : 'bg-amber-50 border-amber-200 text-amber-900'
                }`}
              >
                {getAccountTypeLabel(profile?.account_type)}
              </span>
            </div>

            {/* Account Type Option Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {/* 1. Người suy giảm */}
              <EyeFocusable
                id="btn-select-type-impaired"
                onSelect={() => handleSelectAccountType('impaired')}
                speakLabel="Chọn loại tài khoản Người suy giảm"
              >
                <button
                  type="button"
                  onClick={() => handleSelectAccountType('impaired')}
                  className={`p-3.5 rounded-2xl text-left border-2 transition-all cursor-pointer flex flex-col gap-1.5 relative ${
                    profile?.account_type === 'impaired'
                      ? 'bg-blue-50/70 border-[#0E6C99] shadow-xs'
                      : 'bg-slate-50/80 hover:bg-slate-100/80 border-slate-200'
                  }`}
                >
                  <div className="flex items-center justify-between w-full">
                    <span className="font-black text-sm text-[#14213D]">Người suy giảm</span>
                    {profile?.account_type === 'impaired' && (
                      <CheckCircle2 className="w-5 h-5 text-[#0E6C99]" />
                    )}
                  </div>
                  <span className="text-xs font-bold text-slate-600">
                    Hỗ trợ thao tác và giao tiếp thuận tiện
                  </span>
                </button>
              </EyeFocusable>

              {/* 2. Bệnh nhân */}
              <EyeFocusable
                id="btn-select-type-patient"
                onSelect={() => handleSelectAccountType('patient')}
                speakLabel="Chọn loại tài khoản Bệnh nhân"
              >
                <button
                  type="button"
                  onClick={() => handleSelectAccountType('patient')}
                  className={`p-3.5 rounded-2xl text-left border-2 transition-all cursor-pointer flex flex-col gap-1.5 relative ${
                    profile?.account_type === 'patient'
                      ? 'bg-emerald-50/70 border-emerald-600 shadow-xs'
                      : 'bg-slate-50/80 hover:bg-slate-100/80 border-slate-200'
                  }`}
                >
                  <div className="flex items-center justify-between w-full">
                    <span className="font-black text-sm text-[#14213D]">Bệnh nhân</span>
                    {profile?.account_type === 'patient' && (
                      <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                    )}
                  </div>
                  <span className="text-xs font-bold text-slate-600">
                    Sử dụng các tính năng hỗ trợ phù hợp
                  </span>
                </button>
              </EyeFocusable>
            </div>
          </div>

          {/* Actions Row: Change Password */}
          <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
            <div className="flex flex-col">
              <span className="font-extrabold text-sm text-[#14213D]">Bảo mật tài khoản</span>
              <span className="text-xs text-slate-500">Cập nhật mật khẩu đăng nhập</span>
            </div>

            <EyeFocusable
              id="btn-open-password-modal"
              onSelect={() => setShowPasswordModal(true)}
              speakLabel="Đổi mật khẩu tài khoản"
            >
              <AppButton
                id="btn-open-password-modal"
                variant="outline"
                size="sm"
                onClick={() => setShowPasswordModal(true)}
                icon={<Lock className="w-4 h-4 text-[#0E6C99]" />}
              >
                <span>Đổi mật khẩu</span>
              </AppButton>
            </EyeFocusable>
          </div>
        </div>
        
        {/* Section 1: Master Eye Control Switch */}
        <div className="bg-white rounded-[28px] p-6 border-2 border-[#14213D]/10 card-asymmetric shadow-sm flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-[16px] bg-[#6AC9F0]/20 text-[#14213D]">
                <Eye className="w-6 h-6 text-[#14213D]" />
              </div>
              <div>
                <h3 className="font-black text-lg text-[#14213D]">Hỗ trợ điều khiển bằng mắt</h3>
                <p className="text-xs text-[#3B4B68]">Bật/Tắt Eye Mode và Camera trên toàn bộ app</p>
              </div>
            </div>

            <EyeFocusable
              id="btn-setting-toggle-eyemode"
              onSelect={() => setEyeControlEnabled(!settings.eyeControlEnabled)}
              speakLabel="Chuyển đổi điều khiển bằng mắt"
            >
              <AppButton
                id="btn-setting-toggle-eyemode"
                variant={settings.eyeControlEnabled ? 'primary' : 'secondary'}
                size="sm"
                onClick={() => setEyeControlEnabled(!settings.eyeControlEnabled)}
              >
                <span>{settings.eyeControlEnabled ? 'ĐANG BẬT' : 'ĐÃ TẮT'}</span>
              </AppButton>
            </EyeFocusable>
          </div>
        </div>

        {/* Section 2: Camera Status & Live Preview */}
        <div className="bg-white rounded-[28px] p-6 border-2 border-[#14213D]/10 card-asymmetric shadow-sm flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h3 className="font-black text-lg text-[#14213D] flex items-center gap-2">
              <Camera className="w-5 h-5 text-[#6AC9F0]" />
              <span>Camera & Hiệu chỉnh mắt</span>
            </h3>
            <StatusBadge
              label={trackingState.cameraActive ? 'Camera Active' : 'Camera Stopped'}
              status={trackingState.cameraActive ? 'active' : 'idle'}
            />
          </div>

          {/* Real Live Camera Preview */}
          <div className="w-full rounded-[20px] overflow-hidden border-2 border-[#14213D]/15 shadow-inner bg-slate-900 h-52 sm:h-64 relative">
            <CameraPreview className="w-full h-full" mirrored showOverlay />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <EyeFocusable
              id="btn-setting-toggle-camera"
              onSelect={toggleCamera}
              speakLabel="Bật hoặc tắt camera"
            >
              <AppButton
                id="btn-setting-toggle-camera"
                variant={trackingState.cameraActive ? 'secondary' : 'primary'}
                size="md"
                onClick={toggleCamera}
                icon={<Camera className="w-5 h-5" />}
              >
                <span>{trackingState.cameraActive ? 'Tắt Camera' : 'Bật Camera'}</span>
              </AppButton>
            </EyeFocusable>

            <EyeFocusable
              id="btn-setting-calibrate"
              onSelect={startCalibration}
              speakLabel="Bắt đầu hiệu chỉnh mắt"
            >
              <AppButton
                id="btn-setting-calibrate"
                variant="outline"
                size="md"
                disabled={!trackingState.cameraActive}
                onClick={startCalibration}
                icon={<Target className="w-5 h-5 text-[#FF6F61]" />}
              >
                <span>Hiệu chỉnh mắt</span>
              </AppButton>
            </EyeFocusable>
          </div>

          {/* Calibration Progress Message */}
          {calibrationStage !== 'idle' && (
            <div className="p-4 rounded-[18px] bg-[#FFF2D6] border border-[#14213D]/15 flex flex-col gap-2">
              <span className="font-bold text-sm text-[#14213D]">{calibrationMessage}</span>
              {calibrationStage === 'collecting' && (
                <div className="w-full bg-slate-200 rounded-full h-3 overflow-hidden">
                  <div
                    className="bg-[#6AC9F0] h-full transition-all duration-100"
                    style={{ width: `${calibrationProgress}%` }}
                  />
                </div>
              )}
            </div>
          )}
        </div>

        {/* Section 3: Keyboard Simulator Mode */}
        <div className="bg-white rounded-[28px] p-6 border-2 border-[#14213D]/10 card-asymmetric shadow-sm flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-[16px] bg-amber-100 text-amber-900">
                <Keyboard className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-black text-lg text-[#14213D]">Giả lập Bàn phím physical</h3>
                <p className="text-xs text-[#3B4B68]">Dùng các phím Mũi tên (← → ↑ ↓) và Enter để điều khiển</p>
              </div>
            </div>

            <EyeFocusable
              id="btn-setting-toggle-simulator"
              onSelect={() => setSimulatorMode(!settings.simulatorMode)}
              speakLabel="Bật tắt giả lập bàn phím"
            >
              <AppButton
                id="btn-setting-toggle-simulator"
                variant={settings.simulatorMode ? 'primary' : 'secondary'}
                size="sm"
                onClick={() => setSimulatorMode(!settings.simulatorMode)}
              >
                <span>{settings.simulatorMode ? 'ĐANG BẬT' : 'ĐÃ TẮT'}</span>
              </AppButton>
            </EyeFocusable>
          </div>
        </div>

        {/* Section 4: ÂM THANH & GIỌNG NÓI */}
        <div className="bg-white rounded-[28px] p-6 border-2 border-[#14213D]/10 card-asymmetric shadow-sm flex flex-col gap-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-[16px] bg-emerald-100 text-emerald-900">
                <Volume2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-black text-lg text-[#14213D]">Âm thanh & Giọng nói</h3>
                <p className="text-xs text-[#3B4B68]">Cấu hình đọc văn bản thành tiếng (Text-to-Speech)</p>
              </div>
            </div>
          </div>

          {/* Fallback browser notice */}
          {!speechSupported && (
            <div className="p-3 bg-amber-100 border-2 border-amber-300 rounded-2xl text-amber-900 text-xs font-bold flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-700 flex-shrink-0" />
              <span>Thiết bị này chưa hỗ trợ đọc văn bản.</span>
            </div>
          )}

          {/* Speaker Disabled Notice */}
          {speakerNotice && (
            <div className="p-3 bg-amber-100 border-2 border-amber-400 rounded-2xl text-amber-900 text-xs font-bold flex items-center gap-2 animate-bounce">
              <AlertTriangle className="w-4 h-4 text-amber-700 flex-shrink-0" />
              <span>{speakerNotice}</span>
            </div>
          )}

          {/* 1. Kích hoạt loa */}
          <div className="flex items-center justify-between gap-3 pt-1">
            <div>
              <h4 className="font-extrabold text-sm text-[#14213D]">Kích hoạt loa</h4>
              <p className="text-xs text-slate-500">Cho phép ứng dụng đọc nội dung thành tiếng</p>
            </div>

            <EyeFocusable
              id="btn-setting-toggle-speaker"
              onSelect={() => setSpeakerEnabled(!settings.speakerEnabled)}
              speakLabel="Bật hoặc tắt kích hoạt loa"
            >
              <AppButton
                id="btn-setting-toggle-speaker"
                variant={settings.speakerEnabled ? 'primary' : 'secondary'}
                size="sm"
                onClick={() => setSpeakerEnabled(!settings.speakerEnabled)}
              >
                <span>{settings.speakerEnabled ? 'ĐANG BẬT' : 'ĐÃ TẮT'}</span>
              </AppButton>
            </EyeFocusable>
          </div>

          {/* Sub-controls container */}
          <div
            className={`flex flex-col gap-4 pt-3 border-t border-slate-100 transition-opacity ${
              !settings.speakerEnabled ? 'opacity-50' : ''
            }`}
          >
            {/* 2. Âm lượng giọng đọc */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="font-extrabold text-sm text-[#14213D]">Âm lượng giọng đọc</span>
                <span className="text-xs font-black text-[#6AC9F0] bg-[#14213D] px-2.5 py-0.5 rounded-full">
                  {Math.round(settings.speechVolume * 100)}%
                </span>
              </div>
              <div className="flex items-center gap-2">
                <EyeFocusable
                  id="btn-setting-volume-minus"
                  onSelect={handleDecreaseVolume}
                  speakLabel="Giảm âm lượng"
                >
                  <button
                    type="button"
                    disabled={!settings.speakerEnabled || settings.speechVolume <= 0}
                    onClick={handleDecreaseVolume}
                    className="w-10 h-10 rounded-xl bg-slate-100 hover:bg-slate-200 active:scale-95 text-[#14213D] font-black text-lg flex items-center justify-center cursor-pointer disabled:opacity-40"
                    aria-label="Giảm âm lượng"
                  >
                    <Minus className="w-4 h-4" />
                  </button>
                </EyeFocusable>

                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={settings.speechVolume}
                  disabled={!settings.speakerEnabled}
                  onChange={(e) => setSpeechVolume(parseFloat(e.target.value))}
                  className="flex-1 accent-[#6AC9F0] h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer disabled:cursor-not-allowed"
                />

                <EyeFocusable
                  id="btn-setting-volume-plus"
                  onSelect={handleIncreaseVolume}
                  speakLabel="Tăng âm lượng"
                >
                  <button
                    type="button"
                    disabled={!settings.speakerEnabled || settings.speechVolume >= 1}
                    onClick={handleIncreaseVolume}
                    className="w-10 h-10 rounded-xl bg-slate-100 hover:bg-slate-200 active:scale-95 text-[#14213D] font-black text-lg flex items-center justify-center cursor-pointer disabled:opacity-40"
                    aria-label="Tăng âm lượng"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </EyeFocusable>
              </div>
            </div>

            {/* 3. Tốc độ đọc */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="font-extrabold text-sm text-[#14213D]">Tốc độ đọc</span>
                <span className="text-xs font-black text-[#6AC9F0] bg-[#14213D] px-2.5 py-0.5 rounded-full">
                  {settings.speechRate.toFixed(1)}x
                </span>
              </div>
              <div className="flex items-center gap-2">
                <EyeFocusable
                  id="btn-setting-rate-minus"
                  onSelect={handleDecreaseRate}
                  speakLabel="Giảm tốc độ đọc"
                >
                  <button
                    type="button"
                    disabled={!settings.speakerEnabled || settings.speechRate <= 0.7}
                    onClick={handleDecreaseRate}
                    className="w-10 h-10 rounded-xl bg-slate-100 hover:bg-slate-200 active:scale-95 text-[#14213D] font-black text-lg flex items-center justify-center cursor-pointer disabled:opacity-40"
                    aria-label="Giảm tốc độ đọc"
                  >
                    <Minus className="w-4 h-4" />
                  </button>
                </EyeFocusable>

                <input
                  type="range"
                  min="0.7"
                  max="1.5"
                  step="0.1"
                  value={settings.speechRate}
                  disabled={!settings.speakerEnabled}
                  onChange={(e) => setSpeechRate(parseFloat(e.target.value))}
                  className="flex-1 accent-[#6AC9F0] h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer disabled:cursor-not-allowed"
                />

                <EyeFocusable
                  id="btn-setting-rate-plus"
                  onSelect={handleIncreaseRate}
                  speakLabel="Tăng tốc độ đọc"
                >
                  <button
                    type="button"
                    disabled={!settings.speakerEnabled || settings.speechRate >= 1.5}
                    onClick={handleIncreaseRate}
                    className="w-10 h-10 rounded-xl bg-slate-100 hover:bg-slate-200 active:scale-95 text-[#14213D] font-black text-lg flex items-center justify-center cursor-pointer disabled:opacity-40"
                    aria-label="Tăng tốc độ đọc"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </EyeFocusable>
              </div>
            </div>

            {/* 4. Nghe thử */}
            <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2">
              <div className="flex flex-col">
                <span className="text-xs font-bold text-[#14213D]">Nghe thử giọng đọc</span>
                <span className="text-[11px] text-slate-500">Bấm để phát thử giọng đọc chuẩn</span>
              </div>
              <EyeFocusable
                id="btn-setting-test-speaker"
                onSelect={handleTestSpeaker}
                speakLabel="Nghe thử giọng đọc"
              >
                <AppButton
                  id="btn-setting-test-speaker"
                  variant="outline"
                  size="sm"
                  disabled={!settings.speakerEnabled || !speechSupported}
                  onClick={handleTestSpeaker}
                  icon={<Play className="w-4 h-4 text-[#6AC9F0] fill-[#6AC9F0]" />}
                >
                  <span>Nghe thử</span>
                </AppButton>
              </EyeFocusable>
            </div>

            {/* Eye Sound Feedback toggle */}
            <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2">
              <div className="flex flex-col">
                <span className="text-xs font-bold text-[#14213D]">Âm thanh phản hồi mắt</span>
                <span className="text-[11px] text-slate-500">Phát tiếng pip khi cử chỉ điều khiển mắt được chọn</span>
              </div>
              <EyeFocusable
                id="btn-setting-toggle-sound"
                onSelect={() => setSoundFeedback(!settings.soundFeedback)}
                speakLabel="Bật tắt âm thanh cử chỉ mắt"
              >
                <AppButton
                  id="btn-setting-toggle-sound"
                  variant={settings.soundFeedback ? 'primary' : 'secondary'}
                  size="sm"
                  onClick={() => setSoundFeedback(!settings.soundFeedback)}
                >
                  <span>{settings.soundFeedback ? 'ĐANG BẬT' : 'ĐÃ TẮT'}</span>
                </AppButton>
              </EyeFocusable>
            </div>
          </div>
        </div>

      </main>

      {/* CONFIRMATION MODAL FOR ACCOUNT TYPE CHANGE */}
      <Modal
        isOpen={showTypeConfirmModal}
        onClose={() => {
          if (!updatingType) {
            setShowTypeConfirmModal(false);
            setPendingAccountType(null);
          }
        }}
        title="Xác nhận thay đổi"
      >
        <div className="flex flex-col gap-4">
          <p className="text-sm font-bold text-[#14213D]">
            Bạn có muốn thay đổi loại tài khoản thành{' '}
            <span className="font-black text-[#0E6C99]">
              "{pendingAccountType ? ACCOUNT_TYPE_LABELS[pendingAccountType] : ''}"
            </span>
            ?
          </p>

          <div className="flex items-center gap-3 pt-2">
            <EyeFocusable
              id="btn-cancel-type-confirm"
              onSelect={() => {
                setShowTypeConfirmModal(false);
                setPendingAccountType(null);
              }}
              speakLabel="Hủy thay đổi loại tài khoản"
            >
              <AppButton
                id="btn-cancel-type-confirm"
                variant="secondary"
                size="md"
                disabled={updatingType}
                onClick={() => {
                  setShowTypeConfirmModal(false);
                  setPendingAccountType(null);
                }}
                className="flex-1"
              >
                <span>Hủy</span>
              </AppButton>
            </EyeFocusable>

            <EyeFocusable
              id="btn-submit-type-confirm"
              onSelect={handleConfirmAccountTypeChange}
              speakLabel="Xác nhận thay đổi loại tài khoản"
            >
              <AppButton
                id="btn-submit-type-confirm"
                variant="primary"
                size="md"
                disabled={updatingType}
                onClick={handleConfirmAccountTypeChange}
                className="flex-1"
              >
                <span>{updatingType ? 'Đang cập nhật...' : 'Xác nhận'}</span>
              </AppButton>
            </EyeFocusable>
          </div>
        </div>
      </Modal>

      {/* CHANGE PASSWORD MODAL */}
      <Modal
        isOpen={showPasswordModal}
        onClose={() => {
          if (!passwordLoading) {
            setShowPasswordModal(false);
            setPasswordError(null);
            setPasswordSuccess(null);
            setNewPassword('');
            setConfirmNewPassword('');
          }
        }}
        title="Đổi mật khẩu"
      >
        <form onSubmit={handleUpdatePassword} className="flex flex-col gap-4">
          {passwordError && (
            <div className="p-3 bg-rose-500/15 border border-rose-500/40 text-rose-950 rounded-xl text-xs font-black flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-700 shrink-0" />
              <span>{passwordError}</span>
            </div>
          )}

          {passwordSuccess && (
            <div className="p-3 bg-emerald-500/15 border border-emerald-500/40 text-emerald-950 rounded-xl text-xs font-black flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
              <span>{passwordSuccess}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-black text-[#14213D] mb-1">
              Mật khẩu mới (tối thiểu 6 ký tự)
            </label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              disabled={passwordLoading}
              placeholder="Nhập mật khẩu mới"
              className="w-full h-10 px-3.5 bg-slate-50 border border-slate-300 focus:border-[#0E6C99] rounded-xl font-bold text-sm text-[#14213D] outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-black text-[#14213D] mb-1">
              Xác nhận mật khẩu mới
            </label>
            <input
              type="password"
              value={confirmNewPassword}
              onChange={(e) => setConfirmNewPassword(e.target.value)}
              disabled={passwordLoading}
              placeholder="Nhập lại mật khẩu mới"
              className="w-full h-10 px-3.5 bg-slate-50 border border-slate-300 focus:border-[#0E6C99] rounded-xl font-bold text-sm text-[#14213D] outline-none"
            />
          </div>

          <div className="flex items-center gap-3 pt-2">
            <EyeFocusable
              id="btn-close-pass-modal"
              onSelect={() => setShowPasswordModal(false)}
              speakLabel="Hủy đổi mật khẩu"
            >
              <AppButton
                id="btn-close-pass-modal"
                variant="secondary"
                size="md"
                disabled={passwordLoading}
                onClick={() => setShowPasswordModal(false)}
                className="flex-1"
              >
                <span>Hủy</span>
              </AppButton>
            </EyeFocusable>

            <EyeFocusable
              id="btn-submit-pass"
              onSelect={() => handleUpdatePassword()}
              speakLabel="Lưu mật khẩu mới"
            >
              <AppButton
                id="btn-submit-pass"
                variant="primary"
                size="md"
                disabled={passwordLoading}
                onClick={() => handleUpdatePassword()}
                className="flex-1"
              >
                <span>{passwordLoading ? 'Đang lưu...' : 'Lưu mật khẩu'}</span>
              </AppButton>
            </EyeFocusable>
          </div>
        </form>
      </Modal>
    </div>
  );
}

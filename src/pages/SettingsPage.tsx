import React, { useState } from 'react';
import { PageHeader } from '../components/ui/PageHeader';
import { AppButton } from '../components/ui/AppButton';
import { useEyeTracking } from '../modules/eye-control/useEyeTracking';
import { EyeFocusable } from '../modules/eye-control/EyeFocusable';
import { Eye, Camera, Keyboard, Volume2, Target, AlertTriangle, Play, Minus, Plus } from 'lucide-react';
import { StatusBadge } from '../components/ui/StatusBadge';
import { CameraPreview } from '../modules/eye-control/CameraPreview';
import { speakVietnamese } from '../utils/speech';

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

  const [speakerNotice, setSpeakerNotice] = useState<string | null>(null);

  const speechSupported = typeof window !== 'undefined' && 'speechSynthesis' in window;

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

          {/* Sub-controls container (Disabled visually when Kích hoạt loa is OFF) */}
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
    </div>
  );
}

import React from 'react';
import { PageHeader } from '../components/ui/PageHeader';
import { AppButton } from '../components/ui/AppButton';
import { useEyeTracking } from '../modules/eye-control/useEyeTracking';
import { Eye, Camera, Keyboard, Volume2, Target, CheckCircle2, AlertTriangle } from 'lucide-react';
import { StatusBadge } from '../components/ui/StatusBadge';
import { CameraPreview } from '../modules/eye-control/CameraPreview';

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
    toggleCamera,
    startCalibration,
    calibrationStage,
    calibrationProgress,
    calibrationMessage,
  } = useEyeTracking();

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

            {/* Functional Eye Control Toggle Button */}
            <AppButton
              id="btn-setting-toggle-eyemode"
              variant={settings.eyeControlEnabled ? 'primary' : 'secondary'}
              size="sm"
              onClick={() => setEyeControlEnabled(!settings.eyeControlEnabled)}
            >
              <span>{settings.eyeControlEnabled ? 'ĐANG BẬT' : 'ĐÃ TẮT'}</span>
            </AppButton>
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
            <AppButton
              id="btn-setting-toggle-camera"
              variant={trackingState.cameraActive ? 'secondary' : 'primary'}
              size="md"
              onClick={toggleCamera}
              icon={<Camera className="w-5 h-5" />}
            >
              <span>{trackingState.cameraActive ? 'Tắt Camera' : 'Bật Camera'}</span>
            </AppButton>

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

            <AppButton
              id="btn-setting-toggle-simulator"
              variant={settings.simulatorMode ? 'primary' : 'secondary'}
              size="sm"
              onClick={() => setSimulatorMode(!settings.simulatorMode)}
            >
              <span>{settings.simulatorMode ? 'ĐANG BẬT' : 'ĐÃ TẮT'}</span>
            </AppButton>
          </div>
        </div>

        {/* Section 4: Sound Feedback */}
        <div className="bg-white rounded-[28px] p-6 border-2 border-[#14213D]/10 card-asymmetric shadow-sm flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-[16px] bg-emerald-100 text-emerald-900">
                <Volume2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-black text-lg text-[#14213D]">Phát âm thanh chỉ dẫn</h3>
                <p className="text-xs text-[#3B4B68]">Phát tiếng Việt khi di chuyển và chọn phím</p>
              </div>
            </div>

            <AppButton
              id="btn-setting-toggle-sound"
              variant={settings.soundFeedback ? 'primary' : 'secondary'}
              size="sm"
              onClick={() => setSoundFeedback(!settings.soundFeedback)}
            >
              <span>{settings.soundFeedback ? 'ĐANG BẬT' : 'ĐÃ TẮT'}</span>
            </AppButton>
          </div>
        </div>

      </main>
    </div>
  );
}

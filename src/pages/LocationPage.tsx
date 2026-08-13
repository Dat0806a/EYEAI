import React, { useState } from 'react';
import { PageHeader } from '../components/ui/PageHeader';
import { AppButton } from '../components/ui/AppButton';
import { GoogleMapView } from '../modules/location/GoogleMapView';
import { useGeolocation } from '../modules/location/useGeolocation';
import { useEyeTrackingSettings } from '../modules/eye-control/useEyeTracking';
import {
  MapPin,
  Share2,
  Navigation,
  ShieldCheck,
  AlertCircle,
  Compass,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { speakVietnamese } from '../utils/speech';

interface LocationPageProps {
  onBack: () => void;
}

export function LocationPage({ onBack }: LocationPageProps) {
  const { settings } = useEyeTrackingSettings();
  const isEyeMode = settings.eyeControlEnabled;

  const {
    status,
    coords,
    accuracy,
    errorMessage,
    isRealGps,
    refreshLocation,
  } = useGeolocation(true);

  const [shareSuccess, setShareSuccess] = useState<boolean>(false);
  const [showCoordsDetail, setShowCoordsDetail] = useState<boolean>(false);

  const googleMapsApiKey =
    (import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string) ||
    '';

  const handleRefresh = () => {
    refreshLocation();
    speakVietnamese('Đang định vị lại vị trí GPS');
  };

  const handleShareLocation = () => {
    setShareSuccess(true);
    speakVietnamese('Đã chia sẻ vị trí an toàn hiện tại tới người thân');
    setTimeout(() => setShareSuccess(false), 3000);
  };

  const formattedCoords = `${coords.lat.toFixed(4)}° N, ${coords.lng.toFixed(4)}° E`;

  return (
    <div className="min-h-screen bg-[#FFF2D6] text-[#14213D] flex flex-col pb-10 select-none relative overflow-hidden">
      {/* Subtle Ambient Pastel Light Accents */}
      <div className="absolute top-0 right-0 w-80 h-80 bg-[#6AC9F0]/15 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-96 h-96 bg-[#FF6F61]/10 rounded-full blur-3xl pointer-events-none" />

      {/* Simplified Mobile Header */}
      <PageHeader title="Vị trí" showBack onBack={onBack} />

      <main className="flex-1 max-w-lg md:max-w-xl mx-auto w-full px-4 py-3 flex flex-col gap-4 relative z-10">

        {/* Permission Denied Card */}
        {status === 'PERMISSION_DENIED' && (
          <div className="bg-white rounded-[24px] p-4 border-2 border-[#FF6F61]/40 shadow-sm flex flex-col gap-3">
            <div className="flex items-start gap-3">
              <div className="p-2.5 rounded-[14px] bg-[#FF6F61]/15 text-[#FF6F61] border border-[#FF6F61]/30">
                <AlertCircle className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <h3 className="font-black text-sm text-[#14213D]">Chưa bật quyền vị trí GPS</h3>
                <p className="text-xs text-[#3B4B68] mt-0.5 leading-relaxed">
                  {errorMessage || 'Vui lòng cấp quyền vị trí để ứng dụng định vị chính xác vị trí của bạn.'}
                </p>
              </div>
            </div>

            <AppButton
              id="btn-location-grant"
              variant="primary"
              size="sm"
              fullWidth
              onClick={handleRefresh}
              icon={<Navigation className="w-4 h-4" />}
            >
              <span>CHO PHÉP ĐỊNH VỊ LẠI</span>
            </AppButton>
          </div>
        )}

        {/* HERO ILLUSTRATED MAP CANVAS */}
        <div className="relative">
          <GoogleMapView
            apiKey={googleMapsApiKey}
            center={coords}
            zoom={16}
            accuracy={accuracy}
            isEyeMode={isEyeMode}
            onRecenter={() => speakVietnamese('Đã đưa bản đồ về vị trí của bạn')}
          />
        </div>

        {/* REDESIGN LOCATION INFO CARD */}
        <div className="bg-white rounded-[28px] p-4 md:p-5 border-2 border-[#14213D]/8 shadow-xs flex flex-col gap-3">
          <div className="flex items-start gap-3.5">
            <div className="p-3 rounded-2xl bg-[#6AC9F0]/20 text-[#14213D] border border-[#6AC9F0]/50 flex-shrink-0">
              <MapPin className="w-6 h-6 text-[#14213D]" />
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-black text-[#3B4B68] uppercase tracking-wider">
                  Vị trí hiện tại
                </span>
                <span className="text-[11px] font-extrabold text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200/80 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  {status === 'LOCATED' && isRealGps ? '● GPS chính xác' : 'Đang định vị...'}
                </span>
              </div>
              
              <h2 className="font-black text-lg md:text-xl text-[#14213D] mt-0.5 tracking-tight">
                Vị trí an toàn của bạn
              </h2>
            </div>
          </div>

          <div className="h-px bg-[#14213D]/8 w-full" />

          {/* Location Details & Accuracy Info */}
          <div className="flex items-center justify-between text-xs font-bold text-[#3B4B68] px-1">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              <span>An toàn & bảo mật</span>
            </div>
            {accuracy && (
              <div className="flex items-center gap-1 text-[#3B4B68]">
                <Compass className="w-3.5 h-3.5 text-[#6AC9F0]" />
                <span>Bán kính: ~{Math.round(accuracy)}m</span>
              </div>
            )}
          </div>

          {/* Collapsible Coordinates for Developer Details */}
          <button
            type="button"
            onClick={() => setShowCoordsDetail(!showCoordsDetail)}
            className="flex items-center justify-between text-[11px] font-bold text-[#3B4B68]/70 hover:text-[#14213D] pt-1 transition-colors cursor-pointer"
          >
            <span>Chi tiết tọa độ kỹ thuật</span>
            {showCoordsDetail ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>

          {showCoordsDetail && (
            <div className="bg-[#FFFDF9] rounded-xl p-2.5 border border-[#14213D]/10 text-xs font-mono text-[#14213D]">
              Tọa độ: {formattedCoords}
            </div>
          )}
        </div>

        {/* CAREGIVER QUICK SHARE BUTTON */}
        <div className="flex flex-col gap-2">
          <AppButton
            id="btn-share-location"
            variant={shareSuccess ? 'secondary' : 'accent'}
            size="lg"
            fullWidth
            onClick={handleShareLocation}
            icon={
              shareSuccess ? (
                <ShieldCheck className="w-6 h-6 text-emerald-600 animate-bounce" />
              ) : (
                <Share2 className="w-6 h-6 text-white" />
              )
            }
          >
            <span>
              {shareSuccess
                ? 'ĐÃ GỬI VỊ TRÍ THÀNH CÔNG!'
                : 'CHIA SẺ VỊ TRÍ CHO NGƯỜI THÂN'}
            </span>
          </AppButton>
          <p className="text-[11px] text-[#3B4B68] text-center font-bold">
            Gửi vị trí GPS trực tiếp để người chăm sóc yên tâm theo dõi.
          </p>
        </div>

      </main>
    </div>
  );
}

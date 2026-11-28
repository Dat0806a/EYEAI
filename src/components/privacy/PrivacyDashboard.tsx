import React, { useState } from 'react';
import {
  ShieldCheck,
  Camera,
  Database,
  Trash2,
  Eye,
  FileText,
  CheckCircle2,
  XCircle,
  Clock,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
} from 'lucide-react';
import { useEyeTracking } from '../../modules/eye-control/useEyeTracking';
import { EyeFocusable } from '../../modules/eye-control/EyeFocusable';
import { AppButton } from '../ui/AppButton';
import { StatusBadge } from '../ui/StatusBadge';

function formatTimestamp(isoOrMs: string | number | null | undefined): string {
  if (!isoOrMs) return 'Chưa có';
  try {
    const d = typeof isoOrMs === 'number' ? new Date(isoOrMs) : new Date(isoOrMs);
    if (Number.isNaN(d.getTime())) return 'Không hợp lệ';
    return d.toLocaleString('vi-VN');
  } catch {
    return 'Không hợp lệ';
  }
}

export function PrivacyDashboard() {
  const {
    trackingState,
    calibration,
    consentState,
    consentLogs,
    grantFaceProcessingConsent,
    revokeFaceProcessingConsent,
    grantCalibrationStorageConsent,
    revokeCalibrationStorageConsent,
    deleteCalibrationData,
    deleteAllLocalEyeData,
    persistedCalibrationProfile,
    calibrationRetentionDays,
    activeSessionId,
    privacyPolicyVersion,
    openConsentModal,
  } = useEyeTracking();

  const [showCalibrationDetails, setShowCalibrationDetails] = useState(false);
  const [showConsentLogs, setShowConsentLogs] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const faceGranted = consentState.faceProcessing.granted;
  const calibStorageGranted = consentState.calibrationStorage.granted;

  const notify = (msg: string) => {
    setActionMessage(msg);
    setTimeout(() => setActionMessage(null), 4000);
  };

  return (
    <section
      aria-label="Quyền riêng tư và dữ liệu"
      className="bg-white rounded-[28px] p-6 border-2 border-[#14213D]/10 card-asymmetric shadow-sm flex flex-col gap-5"
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-3 pb-3 border-b border-slate-100">
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-[16px] bg-emerald-100 text-emerald-900">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <h3 className="font-black text-lg text-[#14213D]">Quyền riêng tư và dữ liệu</h3>
            <p className="text-xs text-[#3B4B68]">
              Kiểm soát camera, sự đồng ý và dữ liệu hiệu chỉnh cục bộ (v{privacyPolicyVersion})
            </p>
          </div>
        </div>

        <StatusBadge
          label={trackingState.cameraActive ? `Phiên #${activeSessionId} Đang chạy` : 'Camera Đã dừng'}
          status={trackingState.cameraActive ? 'active' : 'idle'}
        />
      </div>

      {actionMessage && (
        <div className="p-3 rounded-2xl bg-sky-50 border border-sky-200 text-xs font-black text-[#14213D] flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-[#0E6C99] shrink-0" />
          <span>{actionMessage}</span>
        </div>
      )}

      {/* Real-time Transparency Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
        <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 space-y-1">
          <div className="font-extrabold text-[#3B4B68] flex items-center gap-1.5">
            <Camera className="w-3.5 h-3.5 text-[#0E6C99]" />
            <span>Trạng thái Camera thực tế</span>
          </div>
          <div className="font-black text-sm text-[#14213D]">
            {trackingState.cameraActive
              ? `Đang hoạt động (Session #${activeSessionId})`
              : 'Đã dừng & giải phóng stream'}
          </div>
          <div className="text-[11px] text-slate-500">
            Nơi xử lý khuôn mặt: <strong>100% cục bộ trong RAM trình duyệt</strong>
          </div>
        </div>

        <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 space-y-1">
          <div className="font-extrabold text-[#3B4B68] flex items-center gap-1.5">
            <Database className="w-3.5 h-3.5 text-[#0E6C99]" />
            <span>Nơi lưu Hiệu chỉnh (Calibration)</span>
          </div>
          <div className="font-black text-sm text-[#14213D]">
            {persistedCalibrationProfile
              ? 'Đã lưu cục bộ (User-scoped LocalStorage)'
              : calibStorageGranted
              ? 'Đã cấp quyền lưu (Chưa có hồ sơ đã lưu)'
              : 'Chỉ dùng RAM (RAM-only, không ghi ổ cứng)'}
          </div>
          <div className="text-[11px] text-slate-500">
            Chính sách lưu giữ: {calibrationRetentionDays} ngày • Chính sách v{privacyPolicyVersion}
          </div>
        </div>
      </div>

      {/* Data Inventory Notice */}
      <div className="p-3.5 rounded-2xl bg-sky-50/70 border border-sky-200 text-xs text-[#14213D] space-y-1">
        <div className="font-black flex items-center gap-1.5">
          <Eye className="w-4 h-4 text-[#0E6C99]" />
          <span>Dữ liệu đang được xử lý & lưu trữ</span>
        </div>
        <p className="text-[11px] font-semibold text-[#3B4B68] leading-relaxed">
          • <strong>Không lưu / Không gửi mạng:</strong> Khung hình camera, 478 điểm mốc khuôn mặt (landmarks), lịch sử tọa độ mắt.
          <br />• <strong>Lưu tùy chọn theo tài khoản:</strong> Ngưỡng hiệu chỉnh tối giản (EAR, ngưỡng chớp, ngưỡng liếc 4 hướng) khi có sự đồng ý lưu.
        </p>
      </div>

      {/* Consent 1: Face Processing Consent */}
      <div className="p-4 rounded-2xl border-2 border-slate-200 flex flex-col gap-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1 flex-1 min-w-[200px]">
            <div className="flex items-center gap-2">
              {faceGranted ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              ) : (
                <XCircle className="w-4 h-4 text-rose-600 shrink-0" />
              )}
              <span className="font-black text-sm text-[#14213D]">
                Quyền xử lý camera & khuôn mặt cục bộ
              </span>
            </div>
            <p className="text-xs text-slate-600 font-semibold">
              Trạng thái: <strong>{faceGranted ? 'ĐÃ CẤP QUYỀN' : 'CHƯA CẤP / ĐÃ THU HỒI'}</strong> • Cập nhật:{' '}
              {formatTimestamp(consentState.faceProcessing.updatedAt)}
            </p>
            <p className="text-[11px] text-slate-500">
              Lưu ý: Quyền này độc lập với quyền Camera của trình duyệt. Thu hồi sẽ lập tức tắt camera và giải phóng tài nguyên.
            </p>
          </div>

          <div className="flex items-center gap-2">
            {faceGranted ? (
              <EyeFocusable
                id="btn-privacy-revoke-face"
                onSelect={() => {
                  revokeFaceProcessingConsent('privacy_dashboard');
                  notify('Đã thu hồi quyền xử lý khuôn mặt và dừng camera.');
                }}
                speakLabel="Thu hồi quyền xử lý camera"
              >
                <AppButton
                  id="btn-privacy-revoke-face"
                  variant="danger"
                  size="sm"
                  onClick={() => {
                    revokeFaceProcessingConsent('privacy_dashboard');
                    notify('Đã thu hồi quyền xử lý khuôn mặt và dừng camera.');
                  }}
                >
                  <span>Thu hồi quyền Camera</span>
                </AppButton>
              </EyeFocusable>
            ) : (
              <EyeFocusable
                id="btn-privacy-grant-face"
                onSelect={() => {
                  grantFaceProcessingConsent(false, 'privacy_dashboard');
                  notify('Đã cấp quyền xử lý khuôn mặt cục bộ.');
                }}
                speakLabel="Cấp quyền xử lý camera cục bộ"
              >
                <AppButton
                  id="btn-privacy-grant-face"
                  variant="primary"
                  size="sm"
                  onClick={() => {
                    grantFaceProcessingConsent(false, 'privacy_dashboard');
                    notify('Đã cấp quyền xử lý khuôn mặt cục bộ.');
                  }}
                >
                  <span>Cấp quyền xử lý</span>
                </AppButton>
              </EyeFocusable>
            )}
          </div>
        </div>

        {!faceGranted && (
          <div className="flex items-center justify-between pt-2 border-t border-slate-100">
            <span className="text-[11px] text-slate-500 font-semibold">
              Hoặc mở hộp thoại giải thích chi tiết (hỗ trợ bàn phím / chạm / người chăm sóc):
            </span>
            <button
              type="button"
              onClick={openConsentModal}
              className="text-xs font-black text-[#0E6C99] hover:underline cursor-pointer"
            >
              Mở hộp thoại đồng ý
            </button>
          </div>
        )}
      </div>

      {/* Consent 2: Calibration Storage Consent */}
      <div className="p-4 rounded-2xl border-2 border-slate-200 flex flex-col gap-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1 flex-1 min-w-[200px]">
            <div className="flex items-center gap-2">
              {calibStorageGranted ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              ) : (
                <XCircle className="w-4 h-4 text-amber-600 shrink-0" />
              )}
              <span className="font-black text-sm text-[#14213D]">
                Quyền lưu thông số hiệu chỉnh trên thiết bị
              </span>
            </div>
            <p className="text-xs text-slate-600 font-semibold">
              Trạng thái: <strong>{calibStorageGranted ? 'CHO PHÉP LƯU' : 'CHỈ DÙNG RAM (KHÔNG LƯU)'}</strong> • Cập nhật:{' '}
              {formatTimestamp(consentState.calibrationStorage.updatedAt)}
            </p>
            <p className="text-[11px] text-slate-500">
              Thu hồi quyền này sẽ xóa hồ sơ đã lưu và chặn mọi lần ghi tiếp theo, nhưng Eye Tracking vẫn hoạt động bằng RAM.
            </p>
          </div>

          <div className="flex items-center gap-2">
            {calibStorageGranted ? (
              <EyeFocusable
                id="btn-privacy-revoke-calibration-storage"
                onSelect={() => {
                  revokeCalibrationStorageConsent('privacy_dashboard');
                  notify('Đã thu hồi quyền lưu hiệu chỉnh và xóa hồ sơ trên thiết bị.');
                }}
                speakLabel="Thu hồi quyền lưu hiệu chỉnh"
              >
                <AppButton
                  id="btn-privacy-revoke-calibration-storage"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    revokeCalibrationStorageConsent('privacy_dashboard');
                    notify('Đã thu hồi quyền lưu hiệu chỉnh và xóa hồ sơ trên thiết bị.');
                  }}
                >
                  <span>Thu hồi quyền lưu</span>
                </AppButton>
              </EyeFocusable>
            ) : (
              <EyeFocusable
                id="btn-privacy-grant-calibration-storage"
                onSelect={() => {
                  grantCalibrationStorageConsent('privacy_dashboard');
                  notify('Đã cho phép lưu thông số hiệu chỉnh trên thiết bị.');
                }}
                speakLabel="Cho phép lưu thông số hiệu chỉnh"
              >
                <AppButton
                  id="btn-privacy-grant-calibration-storage"
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    grantCalibrationStorageConsent('privacy_dashboard');
                    notify('Đã cho phép lưu thông số hiệu chỉnh trên thiết bị.');
                  }}
                >
                  <span>Cho phép lưu</span>
                </AppButton>
              </EyeFocusable>
            )}
          </div>
        </div>
      </div>

      {/* Calibration Profile Inspector & Deletion Actions */}
      <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <EyeFocusable
            id="btn-privacy-toggle-calib-view"
            onSelect={() => setShowCalibrationDetails((prev) => !prev)}
            speakLabel="Xem hoặc ẩn thông số hiệu chỉnh"
          >
            <button
              type="button"
              onClick={() => setShowCalibrationDetails((prev) => !prev)}
              className="flex items-center gap-2 font-black text-sm text-[#14213D] cursor-pointer"
            >
              {showCalibrationDetails ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              <span>Xem thông số Calibration ({calibration.isCalibrated ? 'Đã hiệu chỉnh phiên này' : 'Mặc định / Tự căn'})</span>
            </button>
          </EyeFocusable>

          <div className="flex flex-wrap items-center gap-2">
            <EyeFocusable
              id="btn-privacy-delete-calibration"
              onSelect={() => {
                deleteCalibrationData();
                notify('Đã xóa hồ sơ hiệu chỉnh của tài khoản hiện tại.');
              }}
              speakLabel="Xóa dữ liệu hiệu chỉnh"
            >
              <AppButton
                id="btn-privacy-delete-calibration"
                variant="outline"
                size="sm"
                onClick={() => {
                  deleteCalibrationData();
                  notify('Đã xóa hồ sơ hiệu chỉnh của tài khoản hiện tại.');
                }}
                icon={<Trash2 className="w-4 h-4 text-rose-600" />}
              >
                <span>Xóa Calibration</span>
              </AppButton>
            </EyeFocusable>

            <EyeFocusable
              id="btn-privacy-delete-all-local"
              onSelect={() => {
                deleteAllLocalEyeData();
                notify('Đã xóa toàn bộ dữ liệu Eye Control cục bộ của tài khoản hiện tại.');
              }}
              speakLabel="Xóa toàn bộ dữ liệu Eye Control cục bộ"
            >
              <AppButton
                id="btn-privacy-delete-all-local"
                variant="danger"
                size="sm"
                onClick={() => {
                  deleteAllLocalEyeData();
                  notify('Đã xóa toàn bộ dữ liệu Eye Control cục bộ của tài khoản hiện tại.');
                }}
                icon={<AlertTriangle className="w-4 h-4" />}
              >
                <span>Xóa dữ liệu cục bộ</span>
              </AppButton>
            </EyeFocusable>
          </div>
        </div>

        {showCalibrationDetails && (
          <div className="p-3 rounded-xl bg-white border border-slate-200 grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs font-mono">
            <div>
              <span className="text-slate-500 block font-sans">neutralEAR</span>
              <strong>{calibration.neutralEAR.toFixed(3)}</strong>
            </div>
            <div>
              <span className="text-slate-500 block font-sans">blinkThreshold</span>
              <strong>{calibration.blinkThreshold.toFixed(3)}</strong>
            </div>
            <div>
              <span className="text-slate-500 block font-sans">thresholdUp / Down</span>
              <strong>
                {(calibration.thresholdUp ?? calibration.thresholdV).toFixed(3)} /{' '}
                {(calibration.thresholdDown ?? calibration.thresholdV).toFixed(3)}
              </strong>
            </div>
            <div>
              <span className="text-slate-500 block font-sans">thresholdLeft / Right</span>
              <strong>
                {(calibration.thresholdLeft ?? calibration.thresholdH).toFixed(3)} /{' '}
                {(calibration.thresholdRight ?? calibration.thresholdH).toFixed(3)}
              </strong>
            </div>
            <div>
              <span className="text-slate-500 block font-sans">Lưu trên đĩa</span>
              <strong>{persistedCalibrationProfile ? `v${persistedCalibrationProfile.schemaVersion}` : 'Không'}</strong>
            </div>
            <div>
              <span className="text-slate-500 block font-sans">Cập nhật đĩa</span>
              <strong>{persistedCalibrationProfile ? formatTimestamp(persistedCalibrationProfile.updatedAt) : 'RAM-only'}</strong>
            </div>
          </div>
        )}
      </div>

      {/* Local Consent Audit Log */}
      <div className="border-t border-slate-100 pt-3">
        <EyeFocusable
          id="btn-privacy-toggle-consent-logs"
          onSelect={() => setShowConsentLogs((prev) => !prev)}
          speakLabel="Xem nhật ký đồng ý cục bộ"
        >
          <button
            type="button"
            onClick={() => setShowConsentLogs((prev) => !prev)}
            className="flex items-center justify-between w-full text-left font-black text-sm text-[#14213D] cursor-pointer py-1"
          >
            <span className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-[#0E6C99]" />
              <span>Nhật ký đồng ý cục bộ ({consentLogs.length} bản ghi gần nhất)</span>
            </span>
            {showConsentLogs ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </EyeFocusable>

        {showConsentLogs && (
          <div className="mt-2 space-y-2">
            <p className="text-[11px] text-slate-500 font-semibold">
              Đây là nhật ký trạng thái đồng ý lưu cục bộ trên trình duyệt (tối đa 50 bản ghi, không chứa khung hình hay dữ liệu sinh trắc học, không phải bằng chứng pháp lý bất biến phía máy chủ).
            </p>
            {consentLogs.length === 0 ? (
              <div className="p-3 rounded-xl bg-slate-50 text-xs text-slate-500 font-bold">
                Chưa có bản ghi đồng ý nào cho tài khoản này.
              </div>
            ) : (
              <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1">
                {consentLogs.map((log) => (
                  <div
                    key={`${log.consentId}-${log.timestamp}-${log.action}`}
                    className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-[11px] flex flex-wrap items-center justify-between gap-2"
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className={`px-2 py-0.5 rounded-full font-black ${
                          log.action === 'GRANTED'
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-rose-100 text-rose-800'
                        }`}
                      >
                        {log.action}
                      </span>
                      <span className="font-bold text-[#14213D]">{log.consentType}</span>
                      <span className="text-slate-500">({log.trigger})</span>
                    </div>
                    <div className="flex items-center gap-1 text-slate-500 font-mono">
                      <Clock className="w-3 h-3" />
                      <span>{formatTimestamp(log.timestamp)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

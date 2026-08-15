import React, { useState, useRef } from 'react';
import { PageHeader } from '../../../components/ui/PageHeader';
import { AppButton } from '../../../components/ui/AppButton';
import { Upload, Camera, FileText, AlertCircle, Loader2 } from 'lucide-react';
import { scanOcr } from '../../../services/patientService';
import { OcrResultItem } from '../../../types/patient';

interface PatientScanPageProps {
  onBack: () => void;
  onOpenSettings?: () => void;
  onScanComplete: (reportId: string, results: OcrResultItem[]) => void;
}

export function PatientScanPage({ onBack, onOpenSettings, onScanComplete }: PatientScanPageProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFileProcess = async (file: File | undefined | null) => {
    if (!file) return;
    setError(null);
    setLoading(true);

    try {
      const res = await scanOcr(file);
      onScanComplete(res.reportId, res.results);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Không thể quét ảnh xét nghiệm.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateSampleReport = () => {
    const sampleText = [
      'WBC | Số lượng bạch cầu | 7.2 | 10^9/L | 4.0 - 10.0',
      'RBC | Số lượng hồng cầu | 3.8 | 10^12/L | 4.0 - 5.5',
      'HGB | Hemoglobin | 112 | g/L | 120 - 160',
      'PLT | Số lượng tiểu cầu | 210 | 10^9/L | 150 - 400',
      'GLUCOSE | Đường huyết | 6.8 | mmol/L | 3.9 - 6.1',
    ].join('\n');

    const blob = new Blob([sampleText], { type: 'text/plain' });
    const file = new File([blob], 'mau-xet-nghiem.txt', { type: 'text/plain' });
    handleFileProcess(file);
  };

  return (
    <div className="min-h-screen bg-transparent text-[#14213D] flex flex-col pb-28">
      <PageHeader title="Quét giấy xét nghiệm" showBack onBack={onBack} onOpenSettings={onOpenSettings} />

      <main className="flex-1 max-w-md md:max-w-xl mx-auto w-full px-4 py-6 flex flex-col gap-6">
        {/* Instruction Card */}
        <div className="bg-white rounded-[28px] p-6 border-2 border-[#14213D]/10 shadow-xs flex flex-col gap-3">
          <h2 className="text-xl font-black text-[#14213D] flex items-center gap-2">
            <Camera className="w-6 h-6 text-[#0E6C99]" />
            <span>Chụp hoặc tải ảnh phiếu xét nghiệm</span>
          </h2>
          <p className="text-xs font-bold text-slate-600 leading-relaxed">
            Chụp ảnh rõ nét hoặc chọn tệp ảnh/PDF/Văn bản từ thiết bị. Hệ thống sẽ tự động nhận diện các chỉ số để bạn rà soát.
          </p>

          {error && (
            <div className="p-3.5 rounded-2xl bg-rose-500/15 border border-rose-500/40 text-rose-950 text-xs font-black flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {loading ? (
            <div className="py-12 flex flex-col items-center justify-center gap-3 text-center">
              <Loader2 className="w-10 h-10 text-[#0E6C99] animate-spin" />
              <span className="font-black text-sm text-[#14213D]">Đang quét OCR chỉ số xét nghiệm...</span>
              <span className="text-xs text-slate-500 font-bold">Vui lòng chờ trong giây lát</span>
            </div>
          ) : (
            <>
              {/* File Input */}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,application/pdf,text/plain"
                className="hidden"
                onChange={(e) => handleFileProcess(e.target.files?.[0])}
              />

              {/* Drag and drop target */}
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOver(false);
                  handleFileProcess(e.dataTransfer.files?.[0]);
                }}
                className={`p-8 rounded-[24px] border-2 border-dashed flex flex-col items-center justify-center gap-4 text-center transition-all ${
                  dragOver ? 'border-[#0E6C99] bg-sky-50' : 'border-slate-300 bg-slate-50/70'
                }`}
              >
                <div className="w-16 h-16 rounded-full bg-sky-100 text-[#0E6C99] flex items-center justify-center">
                  <Upload className="w-8 h-8" />
                </div>
                <div className="flex flex-col gap-1">
                  <span className="font-black text-sm text-[#14213D]">Kéo thả tệp vào đây</span>
                  <span className="text-xs font-bold text-slate-500">Hỗ trợ JPG, PNG, PDF, TXT</span>
                </div>

                <div className="flex flex-wrap items-center justify-center gap-2.5 pt-2">
                  <AppButton
                    id="btn-upload-file"
                    variant="primary"
                    size="md"
                    onClick={() => fileInputRef.current?.click()}
                    icon={<Upload className="w-4 h-4" />}
                  >
                    <span>Tải ảnh lên</span>
                  </AppButton>

                  <AppButton
                    id="btn-camera-capture"
                    variant="secondary"
                    size="md"
                    onClick={() => {
                      const input = document.createElement('input');
                      input.type = 'file';
                      input.accept = 'image/*';
                      input.capture = 'environment';
                      input.onchange = () => handleFileProcess(input.files?.[0]);
                      input.click();
                    }}
                    icon={<Camera className="w-4 h-4" />}
                  >
                    <span>Chụp bằng camera</span>
                  </AppButton>
                </div>
              </div>

              {/* Sample test button for testing */}
              <div className="p-4 rounded-[20px] bg-amber-500/10 border border-amber-500/20 flex flex-col gap-2">
                <div className="flex items-center gap-2 text-amber-900 font-black text-xs">
                  <FileText className="w-4 h-4 text-amber-700" />
                  <span>Chưa có tệp xét nghiệm thật?</span>
                </div>
                <p className="text-xs text-amber-950 font-bold">
                  Bạn có thể dùng mẫu dữ liệu thử nghiệm chuẩn để trải nghiệm toàn bộ luồng phân tích.
                </p>
                <AppButton
                  id="btn-sample-report"
                  variant="outline"
                  size="sm"
                  onClick={handleCreateSampleReport}
                >
                  <span>Dùng mẫu xét nghiệm thử</span>
                </AppButton>
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}

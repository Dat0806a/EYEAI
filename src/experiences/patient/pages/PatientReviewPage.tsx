import React, { useState } from 'react';
import { PageHeader } from '../../../components/ui/PageHeader';
import { AppButton } from '../../../components/ui/AppButton';
import { AlertCircle, CheckCircle2, Plus, Trash2, Edit3, Loader2 } from 'lucide-react';
import { OcrResultItem, ConfirmedLabResult, AnalysisBundle } from '../../../types/patient';
import { confirmAnalysis } from '../../../services/patientService';

interface PatientReviewPageProps {
  reportId: string;
  initialResults: OcrResultItem[];
  onBack: () => void;
  onOpenSettings?: () => void;
  onConfirmSuccess: (bundle: AnalysisBundle) => void;
}

interface ReviewRow {
  testCode: string;
  testName: string;
  value: string;
  unit: string;
  referenceLow: string;
  referenceHigh: string;
  referenceText: string;
  ocrConfidence: number;
}

export function PatientReviewPage({
  reportId,
  initialResults,
  onBack,
  onOpenSettings,
  onConfirmSuccess,
}: PatientReviewPageProps) {
  const [rows, setRows] = useState<ReviewRow[]>(
    initialResults.map((r) => ({
      testCode: r.testCode,
      testName: r.testName,
      value: String(r.value),
      unit: r.unit,
      referenceLow: r.referenceRange?.low !== null && r.referenceRange?.low !== undefined ? String(r.referenceRange.low) : '',
      referenceHigh: r.referenceRange?.high !== null && r.referenceRange?.high !== undefined ? String(r.referenceRange.high) : '',
      referenceText: r.referenceRange?.text || '',
      ocrConfidence: r.ocrConfidence,
    }))
  );

  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const updateRow = (index: number, field: keyof ReviewRow, val: string) => {
    setRows((prev) => prev.map((item, i) => (i === index ? { ...item, [field]: val } : item)));
  };

  const addRow = () => {
    setRows((prev) => [
      ...prev,
      {
        testCode: 'NEW_TEST',
        testName: 'Tên chỉ số mới',
        value: '0',
        unit: 'đơn vị',
        referenceLow: '',
        referenceHigh: '',
        referenceText: '',
        ocrConfidence: 1.0,
      },
    ]);
  };

  const removeRow = (index: number) => {
    setRows((prev) => prev.filter((_, i) => i !== index));
  };

  const handleConfirm = async () => {
    setError(null);
    if (rows.length === 0) {
      setError('Vui lòng có ít nhất một chỉ số xét nghiệm.');
      return;
    }

    const payload: ConfirmedLabResult[] = [];
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      if (!r.testCode.trim() || !r.testName.trim() || !r.value.trim() || !r.unit.trim()) {
        setError(`Dòng thứ ${i + 1} chưa điền đủ thông tin.`);
        return;
      }
      const valNum = Number(r.value);
      if (!Number.isFinite(valNum)) {
        setError(`Giá trị của "${r.testName}" phải là số hợp lệ.`);
        return;
      }

      payload.push({
        testCode: r.testCode.trim().toUpperCase(),
        testName: r.testName.trim(),
        value: valNum,
        unit: r.unit.trim(),
        referenceLow: r.referenceLow.trim() ? Number(r.referenceLow) : null,
        referenceHigh: r.referenceHigh.trim() ? Number(r.referenceHigh) : null,
        referenceText: r.referenceText.trim() || null,
      });
    }

    setLoading(true);
    try {
      const bundle = await confirmAnalysis(reportId, payload);
      onConfirmSuccess(bundle);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Không thể xác nhận kết quả.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-transparent text-[#14213D] flex flex-col pb-28">
      <PageHeader title="Rà soát kết quả OCR" showBack onBack={onBack} onOpenSettings={onOpenSettings} />

      <main className="flex-1 max-w-md md:max-w-xl mx-auto w-full px-4 py-6 flex flex-col gap-6">
        <div className="bg-white rounded-[28px] p-6 border-2 border-[#14213D]/10 shadow-xs flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <h2 className="text-xl font-black text-[#14213D] flex items-center gap-2">
              <Edit3 className="w-6 h-6 text-[#0E6C99]" />
              <span>Kiểm tra & Chỉnh sửa kết quả</span>
            </h2>
            <p className="text-xs font-bold text-slate-600">
              Hãy kiểm tra kỹ các thông tin mà hệ thống vừa nhận diện được. Bạn có thể tự chỉnh sửa hoặc bổ sung thêm trước khi nhận giải thích.
            </p>
          </div>

          {error && (
            <div className="p-3.5 rounded-2xl bg-rose-500/15 border border-rose-500/40 text-rose-950 text-xs font-black flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* List of Rows */}
          <div className="flex flex-col gap-4">
            {rows.map((row, idx) => (
              <div
                key={idx}
                className={`p-4 rounded-[22px] border-2 flex flex-col gap-3 transition-all ${
                  row.ocrConfidence < 0.7
                    ? 'border-amber-400 bg-amber-50/60'
                    : 'border-slate-200 bg-slate-50/50'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-black text-xs text-[#14213D]">
                      Chỉ số #{idx + 1}
                    </span>
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-[10px] font-black border ${
                        row.ocrConfidence < 0.7
                          ? 'bg-amber-100 text-amber-900 border-amber-300'
                          : 'bg-emerald-100 text-emerald-900 border-emerald-300'
                      }`}
                    >
                      Độ tin cậy {Math.round(row.ocrConfidence * 100)}%
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => removeRow(idx)}
                    className="p-1.5 rounded-xl text-rose-600 hover:bg-rose-100 transition-colors cursor-pointer"
                    title="Xóa chỉ số"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-2.5 text-xs font-bold">
                  <div>
                    <label className="text-[11px] text-slate-500 block mb-1">Mã chỉ số</label>
                    <input
                      type="text"
                      value={row.testCode}
                      onChange={(e) => updateRow(idx, 'testCode', e.target.value)}
                      className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-xl font-extrabold text-[#14213D] outline-none focus:border-[#0E6C99]"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] text-slate-500 block mb-1">Tên chỉ số</label>
                    <input
                      type="text"
                      value={row.testName}
                      onChange={(e) => updateRow(idx, 'testName', e.target.value)}
                      className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-xl font-extrabold text-[#14213D] outline-none focus:border-[#0E6C99]"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] text-slate-500 block mb-1">Giá trị đo được</label>
                    <input
                      type="text"
                      value={row.value}
                      onChange={(e) => updateRow(idx, 'value', e.target.value)}
                      className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-xl font-extrabold text-[#14213D] outline-none focus:border-[#0E6C99]"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] text-slate-500 block mb-1">Đơn vị tính</label>
                    <input
                      type="text"
                      value={row.unit}
                      onChange={(e) => updateRow(idx, 'unit', e.target.value)}
                      className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-xl font-extrabold text-[#14213D] outline-none focus:border-[#0E6C99]"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] text-slate-500 block mb-1">Ngưỡng tối thiểu</label>
                    <input
                      type="text"
                      value={row.referenceLow}
                      onChange={(e) => updateRow(idx, 'referenceLow', e.target.value)}
                      placeholder="VD: 4.0"
                      className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-xl font-extrabold text-[#14213D] outline-none focus:border-[#0E6C99]"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] text-slate-500 block mb-1">Ngưỡng tối đa</label>
                    <input
                      type="text"
                      value={row.referenceHigh}
                      onChange={(e) => updateRow(idx, 'referenceHigh', e.target.value)}
                      placeholder="VD: 10.0"
                      className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-xl font-extrabold text-[#14213D] outline-none focus:border-[#0E6C99]"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-slate-100">
            <AppButton
              id="btn-add-row"
              variant="outline"
              size="sm"
              onClick={addRow}
              icon={<Plus className="w-4 h-4 text-[#0E6C99]" />}
            >
              <span>Thêm chỉ số</span>
            </AppButton>

            <AppButton
              id="btn-confirm-analysis"
              variant="primary"
              size="md"
              disabled={loading}
              onClick={handleConfirm}
              icon={loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
            >
              <span>{loading ? 'Đang phân tích...' : 'Xác nhận & Phân tích'}</span>
            </AppButton>
          </div>
        </div>
      </main>
    </div>
  );
}

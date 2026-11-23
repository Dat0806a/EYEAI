import React, { useState } from 'react';
import { PageHeader } from '../../../components/ui/PageHeader';
import { AppButton } from '../../../components/ui/AppButton';
import { AlertCircle, AlertTriangle, CheckCircle2, Plus, Trash2, Edit3, Loader2, Sparkles, HelpCircle } from 'lucide-react';
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
  valueType: 'NUMERIC' | 'QUALITATIVE';
  unit: string;
  referenceLow: string;
  referenceHigh: string;
  referenceText: string;
  ocrConfidence: number;
  isUncertain: boolean;
  note: string;
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
      testCode: r.testCode || '',
      testName: r.testName || r.testCode || '',
      value: r.value !== undefined && r.value !== null ? String(r.value) : '',
      valueType: r.valueType || (Number.isFinite(Number(r.value)) ? 'NUMERIC' : 'QUALITATIVE'),
      unit: r.unit || '',
      referenceLow: r.referenceRange?.low !== null && r.referenceRange?.low !== undefined ? String(r.referenceRange.low) : '',
      referenceHigh: r.referenceRange?.high !== null && r.referenceRange?.high !== undefined ? String(r.referenceRange.high) : '',
      referenceText: r.referenceRange?.text || '',
      ocrConfidence: r.ocrConfidence !== undefined ? r.ocrConfidence : 0.9,
      isUncertain: Boolean(r.isUncertain || (r.ocrConfidence !== undefined && r.ocrConfidence < 0.7)),
      note: r.note || '',
    }))
  );

  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const updateRow = (index: number, field: keyof ReviewRow, val: any) => {
    setRows((prev) => prev.map((item, i) => (i === index ? { ...item, [field]: val } : item)));
  };

  const addRow = () => {
    setRows((prev) => [
      ...prev,
      {
        testCode: 'CHISO_MOI',
        testName: 'Tên chỉ số mới',
        value: '0',
        valueType: 'NUMERIC',
        unit: '',
        referenceLow: '',
        referenceHigh: '',
        referenceText: '',
        ocrConfidence: 1.0,
        isUncertain: false,
        note: '',
      },
    ]);
  };

  const removeRow = (index: number) => {
    setRows((prev) => prev.filter((_, i) => i !== index));
  };

  const uncertainCount = rows.filter((r) => r.isUncertain || r.ocrConfidence < 0.7).length;

  const handleConfirm = async () => {
    setError(null);
    if (rows.length === 0) {
      setError('Vui lòng có ít nhất một chỉ số xét nghiệm.');
      return;
    }

    const payload: ConfirmedLabResult[] = [];
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      if (!r.testCode.trim() || !r.testName.trim()) {
        setError(`Dòng thứ ${i + 1} chưa điền mã hoặc tên chỉ số.`);
        return;
      }
      if (!r.value.trim()) {
        setError(`Dòng thứ ${i + 1} ("${r.testName}") chưa có giá trị.`);
        return;
      }

      const valTrimmed = r.value.trim();
      const valNum = Number(valTrimmed.replace(',', '.'));
      const isNum = Number.isFinite(valNum);

      let refLow: number | null = null;
      let refHigh: number | null = null;
      if (r.referenceLow.trim()) {
        const parsedLow = Number(r.referenceLow.replace(',', '.'));
        if (Number.isFinite(parsedLow)) refLow = parsedLow;
      }
      if (r.referenceHigh.trim()) {
        const parsedHigh = Number(r.referenceHigh.replace(',', '.'));
        if (Number.isFinite(parsedHigh)) refHigh = parsedHigh;
      }

      payload.push({
        testCode: r.testCode.trim().toUpperCase(),
        testName: r.testName.trim(),
        value: isNum ? valNum : valTrimmed,
        valueType: isNum ? 'NUMERIC' : 'QUALITATIVE',
        unit: r.unit.trim(),
        referenceLow: refLow,
        referenceHigh: refHigh,
        referenceText: r.referenceText.trim() || (refLow !== null && refHigh !== null ? `${refLow} - ${refHigh}` : null),
        isUncertain: r.isUncertain,
        note: r.note.trim() || null,
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
      <PageHeader
        title="Rà soát kết quả OCR"
        showBack
        onBack={onBack}
        onOpenSettings={onOpenSettings}
        isPatient={true}
        currentRoute="patient-review"
      />

      <main className="flex-1 max-w-md md:max-w-xl mx-auto w-full px-4 py-6 flex flex-col gap-6">
        <div className="bg-white rounded-[28px] p-4 sm:p-6 border-2 border-[#14213D]/10 shadow-xs flex flex-col gap-4 overflow-hidden">
          <div className="flex flex-col gap-1.5">
            <h2 className="text-xl font-black text-[#14213D] flex items-center gap-2">
              <Edit3 className="w-6 h-6 text-[#0E6C99]" />
              <span>Kiểm tra & Chỉnh sửa kết quả</span>
            </h2>
            <p className="text-xs font-bold text-slate-600 leading-relaxed">
              Mô hình Vision AI đã tự động trích xuất các chỉ số từ phiếu của bạn. Hãy đối chiếu với phiếu gốc, chỉnh sửa hoặc bổ sung nếu cần trước khi nhận phân tích y tế.
            </p>
          </div>

          {/* Quick Counter Summary */}
          <div className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-2xl bg-slate-50 border border-slate-200 text-xs font-black">
            <span className="text-[#14213D]">
              Đã nhận diện: <strong className="text-[#0E6C99]">{rows.length}</strong> chỉ số
            </span>
            {uncertainCount > 0 ? (
              <span className="px-2.5 py-0.5 rounded-full bg-amber-100 border border-amber-300 text-amber-900 flex items-center gap-1">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                {uncertainCount} chỉ số cần rà soát kỹ
              </span>
            ) : (
              <span className="px-2.5 py-0.5 rounded-full bg-emerald-100 border border-emerald-300 text-emerald-900 flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                Độ rõ nét cao
              </span>
            )}
          </div>

          {error && (
            <div className="p-3.5 rounded-2xl bg-rose-500/15 border border-rose-500/40 text-rose-950 text-xs font-black flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* List of Dynamic Rows */}
          <div className="flex flex-col gap-4">
            {rows.map((row, idx) => {
              const isLowConfidence = row.isUncertain || row.ocrConfidence < 0.7;

              return (
                <div
                  key={idx}
                  className={`p-4 rounded-[22px] border-2 flex flex-col gap-3 transition-all ${
                    isLowConfidence
                      ? 'border-amber-400 bg-amber-50/70 shadow-xs'
                      : 'border-slate-200 bg-slate-50/50'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-black text-xs text-[#14213D]">
                        Chỉ số #{idx + 1}
                      </span>
                      {isLowConfidence ? (
                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black border bg-amber-200/80 text-amber-950 border-amber-400 flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3 text-amber-700" />
                          Cần rà soát kỹ ({Math.round(row.ocrConfidence * 100)}%)
                        </span>
                      ) : (
                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black border bg-emerald-100 text-emerald-900 border-emerald-300 flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                          Rõ nét ({Math.round(row.ocrConfidence * 100)}%)
                        </span>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() => removeRow(idx)}
                      className="p-1.5 rounded-xl text-rose-600 hover:bg-rose-100 transition-colors cursor-pointer"
                      title="Xóa chỉ số này"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Warning Note if uncertain */}
                  {row.note && (
                    <div className="p-2 rounded-xl bg-amber-100/90 border border-amber-300 text-[11px] font-bold text-amber-950 flex items-center gap-1.5">
                      <HelpCircle className="w-3.5 h-3.5 text-amber-700 shrink-0" />
                      <span>{row.note}</span>
                    </div>
                  )}

                  {/* Editable Fields Grid */}
                  <div className="grid grid-cols-2 gap-2.5 text-xs font-bold">
                    <div>
                      <label className="text-[11px] text-slate-500 block mb-1">Mã chỉ số</label>
                      <input
                        type="text"
                        value={row.testCode}
                        onChange={(e) => updateRow(idx, 'testCode', e.target.value)}
                        placeholder="VD: WBC, GLU, URIC..."
                        className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-xl font-extrabold text-[#14213D] outline-none focus:border-[#0E6C99]"
                      />
                    </div>

                    <div>
                      <label className="text-[11px] text-slate-500 block mb-1">Tên chỉ số</label>
                      <input
                        type="text"
                        value={row.testName}
                        onChange={(e) => updateRow(idx, 'testName', e.target.value)}
                        placeholder="VD: Số lượng bạch cầu..."
                        className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-xl font-extrabold text-[#14213D] outline-none focus:border-[#0E6C99]"
                      />
                    </div>

                    <div>
                      <label className="text-[11px] text-slate-500 block mb-1">
                        Giá trị {row.valueType === 'QUALITATIVE' ? '(Định tính)' : '(Số)'}
                      </label>
                      <input
                        type="text"
                        value={row.value}
                        onChange={(e) => updateRow(idx, 'value', e.target.value)}
                        placeholder="VD: 7.2 hoặc Âm tính"
                        className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-xl font-extrabold text-[#14213D] outline-none focus:border-[#0E6C99]"
                      />
                    </div>

                    <div>
                      <label className="text-[11px] text-slate-500 block mb-1">Đơn vị đo</label>
                      <input
                        type="text"
                        value={row.unit}
                        onChange={(e) => updateRow(idx, 'unit', e.target.value)}
                        placeholder="VD: mmol/L, g/L..."
                        className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-xl font-extrabold text-[#14213D] outline-none focus:border-[#0E6C99]"
                      />
                    </div>

                    <div>
                      <label className="text-[11px] text-slate-500 block mb-1">Cận dưới (Min)</label>
                      <input
                        type="text"
                        value={row.referenceLow}
                        onChange={(e) => updateRow(idx, 'referenceLow', e.target.value)}
                        placeholder="VD: 4.0 (hoặc để trống)"
                        className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-xl font-extrabold text-[#14213D] outline-none focus:border-[#0E6C99]"
                      />
                    </div>

                    <div>
                      <label className="text-[11px] text-slate-500 block mb-1">Cận trên (Max)</label>
                      <input
                        type="text"
                        value={row.referenceHigh}
                        onChange={(e) => updateRow(idx, 'referenceHigh', e.target.value)}
                        placeholder="VD: 10.0 (hoặc để trống)"
                        className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-xl font-extrabold text-[#14213D] outline-none focus:border-[#0E6C99]"
                      />
                    </div>

                    <div className="col-span-2">
                      <label className="text-[11px] text-slate-500 block mb-1">Khoảng tham chiếu in trên phiếu (Chuẩn gốc)</label>
                      <input
                        type="text"
                        value={row.referenceText}
                        onChange={(e) => updateRow(idx, 'referenceText', e.target.value)}
                        placeholder="VD: 4.0 - 10.0 mmol/L hoặc Âm tính"
                        className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-xl font-bold text-[#14213D] outline-none focus:border-[#0E6C99]"
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Action Footer: Responsive layout preventing horizontal overflow on all screen sizes */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-3 border-t border-slate-100">
            <AppButton
              id="btn-add-row"
              variant="outline"
              size="sm"
              onClick={addRow}
              className="w-full sm:w-auto"
              fullWidth
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
              className="w-full sm:w-auto shrink-0"
              fullWidth
              icon={loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
            >
              <span>{loading ? 'Đang phân tích AI...' : 'Xác nhận & Phân tích'}</span>
            </AppButton>
          </div>
        </div>
      </main>
    </div>
  );
}

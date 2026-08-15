import { useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { apiError, confirmAnalysis } from '../services/api';
import type { OcrResultItem } from '../types';
import { Alert, Badge, Button, Card, Input, Spinner } from '../components/ui';
import { formatConfidence } from '../utils/status';

interface ReviewItem {
  testCode: string;
  testName: string;
  value: string;
  unit: string;
  referenceLow: string;
  referenceHigh: string;
  referenceText: string;
  ocrConfidence: number;
}

export function ReviewPage() {
  const { reportId = '' } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { token } = useAuth();
  const initial = (location.state as { results?: OcrResultItem[] } | null)?.results ?? [];

  const [items, setItems] = useState<ReviewItem[]>(
    initial.map((r) => ({
      testCode: r.testCode,
      testName: r.testName,
      value: String(r.value),
      unit: r.unit,
      referenceLow: r.referenceRange?.low != null ? String(r.referenceRange.low) : '',
      referenceHigh: r.referenceRange?.high != null ? String(r.referenceRange.high) : '',
      referenceText: r.referenceRange?.text ?? '',
      ocrConfidence: r.ocrConfidence,
    })),
  );
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const hasLowConfidence = useMemo(() => items.some((i) => i.ocrConfidence < 0.7), [items]);

  if (!token) return null;

  const update = (index: number, field: keyof ReviewItem, value: string) => {
    setItems((prev) => prev.map((item, i) => (i === index ? { ...item, [field]: value } : item)));
  };

  const onConfirm = async () => {
    setError('');
    for (let i = 0; i < items.length; i += 1) {
      const item = items[i];
      if (!item.testCode.trim() || !item.testName.trim() || !item.value.trim() || !item.unit.trim()) {
        setError(`Dòng ${i + 1} chưa đầy đủ thông tin.`);
        return;
      }
      if (!Number.isFinite(Number(item.value))) {
        setError(`Giá trị của "${item.testName}" phải là số.`);
        return;
      }
    }
    setLoading(true);
    try {
      const payload = items.map((item) => ({
        testCode: item.testCode.trim(),
        testName: item.testName.trim(),
        value: Number(item.value),
        unit: item.unit.trim(),
        referenceRange: {
          low: item.referenceLow.trim() === '' ? null : Number(item.referenceLow),
          high: item.referenceHigh.trim() === '' ? null : Number(item.referenceHigh),
          text: item.referenceText.trim() === '' ? null : item.referenceText.trim(),
        },
      }));
      const bundle = await confirmAnalysis(reportId, payload);
      navigate(`/analysis/${reportId}`, { state: { bundle } });
    } catch (err) {
      setError(apiError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-soft-gray">
      <header className="border-b border-gray-100 bg-white px-4 py-3">
        <button onClick={() => navigate('/scan')} className="text-sm font-semibold text-sky-blue hover:underline">
          ← Quét lại
        </button>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-8">
        <h1 className="text-2xl font-bold text-navy">Kiểm tra kết quả OCR</h1>
        <p className="mt-1 text-gray-500">
          Vui lòng rà soát và chỉnh sửa các chỉ số nếu hệ thống nhận diện sai, sau đó bấm xác nhận để phân tích.
        </p>

        {hasLowConfidence && (
          <div className="mt-4">
            <Alert tone="warning">Có chỉ số có độ tin cậy thấp — hãy kiểm tra kỹ các dòng được đánh dấu.</Alert>
          </div>
        )}
        {error && <div className="mt-4"><Alert>{error}</Alert></div>}

        {loading ? (
          <Card className="mt-6">
            <Spinner label="Đang phân tích và tạo gợi ý..." />
          </Card>
        ) : (
          <div className="mt-6 space-y-4">
            {items.length === 0 ? (
              <Card>
                <p className="text-gray-500">Không có dữ liệu OCR để xem lại. Hãy quét lại giấy xét nghiệm.</p>
                <Button className="mt-3" onClick={() => navigate('/scan')}>Quét lại</Button>
              </Card>
            ) : (
              items.map((item, index) => (
                <Card key={index} className={item.ocrConfidence < 0.7 ? 'border-amber-300 bg-amber-50/50' : ''}>
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-navy">Chỉ số {index + 1}</span>
                    {item.ocrConfidence < 0.7 ? (
                      <Badge className="border-amber-300 bg-amber-100 text-amber-800">Độ tin cậy {formatConfidence(item.ocrConfidence)} — cần kiểm tra</Badge>
                    ) : (
                      <Badge className="border-green-200 bg-green-50 text-green-700">Độ tin cậy {formatConfidence(item.ocrConfidence)}</Badge>
                    )}
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-xs font-medium text-gray-500">Mã chỉ số</label>
                      <Input value={item.testCode} onChange={(e) => update(index, 'testCode', e.target.value)} />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-gray-500">Tên chỉ số</label>
                      <Input value={item.testName} onChange={(e) => update(index, 'testName', e.target.value)} />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-gray-500">Giá trị</label>
                      <Input value={item.value} onChange={(e) => update(index, 'value', e.target.value)} />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-gray-500">Đơn vị</label>
                      <Input value={item.unit} onChange={(e) => update(index, 'unit', e.target.value)} />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-gray-500">Ngưỡng thấp</label>
                      <Input value={item.referenceLow} onChange={(e) => update(index, 'referenceLow', e.target.value)} placeholder="Ví dụ: 4.0" />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-gray-500">Ngưỡng cao</label>
                      <Input value={item.referenceHigh} onChange={(e) => update(index, 'referenceHigh', e.target.value)} placeholder="Ví dụ: 10.0" />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="mb-1 block text-xs font-medium text-gray-500">Khoảng tham chiếu (text)</label>
                      <Input value={item.referenceText} onChange={(e) => update(index, 'referenceText', e.target.value)} placeholder="Ví dụ: 4.0 - 10.0" />
                    </div>
                  </div>
                </Card>
              ))
            )}
            {items.length > 0 && (
              <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
                <Button variant="ghost" onClick={() => navigate('/scan')}>Hủy</Button>
                <Button variant="secondary" onClick={() => void onConfirm()}>Xác nhận kết quả</Button>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

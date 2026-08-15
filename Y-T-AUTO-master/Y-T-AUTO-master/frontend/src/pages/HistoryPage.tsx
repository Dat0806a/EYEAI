import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileText } from 'lucide-react';
import { apiError, getHistory } from '../services/api';
import type { HistoryReport } from '../types';
import { Alert, Button, Card, Spinner } from '../components/ui';

export function HistoryPage() {
  const navigate = useNavigate();
  const [reports, setReports] = useState<HistoryReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    getHistory()
      .then(setReports)
      .catch((err) => setError(apiError(err)))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="min-h-screen bg-soft-gray">
      <header className="border-b border-gray-100 bg-white px-4 py-3">
        <button onClick={() => navigate('/dashboard')} className="text-sm font-semibold text-sky-blue hover:underline">
          ← Trở về Dashboard
        </button>
      </header>
      <main className="mx-auto max-w-2xl px-4 py-8">
        <h1 className="text-2xl font-bold text-navy">Lịch sử xét nghiệm</h1>
        <p className="mt-1 text-gray-500">Xem lại các lần quét xét nghiệm trước đây của bạn.</p>

        {error && <div className="mt-4"><Alert>{error}</Alert></div>}
        {loading ? (
          <Card className="mt-6"><Spinner label="Đang tải lịch sử..." /></Card>
        ) : reports.length === 0 ? (
          <Card className="mt-6 text-center">
            <FileText className="mx-auto h-10 w-10 text-gray-300" />
            <p className="mt-2 text-gray-500">Bạn chưa có lần quét nào. Hãy bắt đầu quét giấy xét nghiệm đầu tiên!</p>
            <Button className="mt-4" onClick={() => navigate('/scan')}>Quét OCR ngay</Button>
          </Card>
        ) : (
          <div className="mt-6 space-y-3">
            {reports.map((report) => (
              <button
                key={report.id}
                onClick={() => navigate(`/analysis/${report.id}`)}
                className="flex w-full items-center justify-between gap-3 rounded-2xl border border-gray-100 bg-white p-4 text-left shadow-sm transition hover:shadow-md"
              >
                <div>
                  <p className="font-semibold text-navy">Phiếu xét nghiệm</p>
                  <p className="text-sm text-gray-500">{new Date(report.created_at).toLocaleString('vi-VN')}</p>
                </div>
                <span className="text-sm font-medium text-sky-blue">Xem chi tiết →</span>
              </button>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Camera, Upload } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { apiError, scanOcr } from '../services/api';
import { Alert, Button, Card, Spinner } from '../components/ui';

export function ScanPage() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!token) navigate('/login');
  }, [token, navigate]);

  const handleFile = async (file: File | undefined | null) => {
    if (!file) return;
    setError('');
    setLoading(true);
    try {
      const result = await scanOcr(file);
      navigate(`/review/${result.reportId}`, { state: { results: result.results, provider: result.provider } });
    } catch (err) {
      setError(apiError(err));
    } finally {
      setLoading(false);
    }
  };

  const createSampleReport = () => {
    const content = [
      'WBC | Số lượng bạch cầu | 7.2 | 10^9/L | 4.0 - 10.0',
      'RBC | Số lượng hồng cầu | 3.8 | 10^12/L | 4.0 - 5.5',
      'HGB | Hemoglobin | 112 | g/L | 120 - 160',
      'PLT | Số lượng tiểu cầu | 210 | 10^9/L | 150 - 400',
      'GLUCOSE | Đường huyết | 6.8 | mmol/L | 3.9 - 6.1',
    ].join('\n');
    const blob = new Blob([content], { type: 'text/plain' });
    const file = new File([blob], 'mau-xet-nghiem.txt', { type: 'text/plain' });
    void handleFile(file);
  };

  return (
    <div className="min-h-screen bg-soft-gray">
      <header className="border-b border-gray-100 bg-white px-4 py-3">
        <button onClick={() => navigate('/dashboard')} className="text-sm font-semibold text-sky-blue hover:underline">
          ← Trở về Dashboard
        </button>
      </header>
      <main className="mx-auto max-w-2xl px-4 py-8">
        <h1 className="text-2xl font-bold text-navy">Quét giấy xét nghiệm 📷</h1>
        <p className="mt-1 text-gray-500">Chụp ảnh rõ nét hoặc tải ảnh lên. Hệ thống sẽ tự động nhận diện các chỉ số.</p>

        {loading ? (
          <Card className="mt-6">
            <Spinner label="Đang quét OCR, vui lòng chờ..." />
          </Card>
        ) : (
          <>
            {error && <div className="mt-4"><Alert>{error}</Alert></div>}
            <Card className="mt-6">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,application/pdf,text/plain"
                className="hidden"
                onChange={(e) => void handleFile(e.target.files?.[0])}
              />
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOver(false);
                  void handleFile(e.dataTransfer.files?.[0]);
                }}
                className={`flex flex-col items-center gap-4 rounded-2xl border-2 border-dashed p-10 text-center transition ${
                  dragOver ? 'border-sky-blue bg-sky-blue/10' : 'border-gray-300 bg-white'
                }`}
              >
                <Upload className="h-12 w-12 text-sky-blue" />
                <p className="font-medium text-navy">Kéo thả ảnh vào đây</p>
                <p className="text-sm text-gray-500">Hoặc chọn từ thiết bị</p>
                <div className="flex flex-wrap justify-center gap-3">
                  <Button onClick={() => fileInputRef.current?.click()}>
                    <Upload className="mr-2 h-4 w-4" /> Tải ảnh lên
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => {
                      const input = document.createElement('input');
                      input.type = 'file';
                      input.accept = 'image/*';
                      input.capture = 'environment';
                      input.onchange = () => void handleFile(input.files?.[0]);
                      input.click();
                    }}
                  >
                    <Camera className="mr-2 h-4 w-4" /> Chụp bằng camera
                  </Button>
                </div>
              </div>
              <div className="mt-4 rounded-2xl bg-cream/70 p-4 text-sm text-navy">
                <p className="font-semibold">Chưa có ảnh xét nghiệm?</p>
                <p className="mt-1 text-gray-600">
                  Bạn có thể tải lên mẫu dữ liệu thử để xem toàn bộ luồng phân tích hoạt động:
                </p>
                <Button variant="ghost" className="mt-2" onClick={createSampleReport}>
                  Tải mẫu xét nghiệm thử
                </Button>
              </div>
            </Card>
          </>
        )}
      </main>
    </div>
  );
}

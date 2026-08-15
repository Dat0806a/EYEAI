export interface VoiceRecognitionCallbacks {
  onResult: (transcript: string, isFinal: boolean) => void;
  onEnd: () => void;
  onError: (message: string) => void;
}

export interface VoiceRecognitionController {
  supported: boolean;
  start: () => void;
  stop: () => void;
}

interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

interface SpeechRecognitionEventLike {
  results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }>;
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

function getRecognitionConstructor(): SpeechRecognitionConstructor | null {
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function isSpeechRecognitionSupported(): boolean {
  return getRecognitionConstructor() !== null;
}

export function createSpeechRecognition(
  callbacks: VoiceRecognitionCallbacks,
): VoiceRecognitionController | null {
  const Recognition = getRecognitionConstructor();
  if (!Recognition) return null;

  const instance = new Recognition();
  instance.lang = 'vi-VN';
  instance.continuous = true;
  instance.interimResults = true;
  (window as unknown as { lastRecognition?: SpeechRecognitionLike }).lastRecognition = instance;

  instance.onresult = (event) => {
    const results = event.results;
    const transcript = Array.from(results)
      .map((result) => result[0].transcript)
      .join('');
    const last = results[results.length - 1];
    callbacks.onResult(transcript, Boolean(last?.isFinal));
  };
  instance.onerror = (event) => {
    if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
      callbacks.onError('Không thể truy cập microphone. Vui lòng kiểm tra quyền truy cập microphone.');
    } else {
      callbacks.onError('Không nhận được giọng nói. Vui lòng thử lại.');
    }
  };
  instance.onend = () => callbacks.onEnd();

  return {
    supported: true,
    start: () => instance.start(),
    stop: () => instance.stop(),
  };
}

export function speakText(text: string): boolean {
  const synthesis = window.speechSynthesis;
  if (!synthesis || typeof SpeechSynthesisUtterance === 'undefined') return false;
  synthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'vi-VN';
  utterance.rate = 1;
  synthesis.speak(utterance);
  return true;
}

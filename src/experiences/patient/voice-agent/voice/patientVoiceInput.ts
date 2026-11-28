export interface VoiceInputCallbacks {
  onStart?: () => void;
  onInterim?: (transcript: string) => void;
  onInterimTranscript?: (transcript: string) => void;
  onFinal?: (transcript: string) => void;
  onFinalTranscript?: (transcript: string) => void;
  onError?: (friendlyMessage: string, code: string) => void;
  onEnd?: () => void;
}

export interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onerror: ((ev: { error?: string }) => void) | null;
  onresult: ((ev: any) => void) | null;
}

export type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

export function getBrowserSpeechRecognitionCtor(): SpeechRecognitionConstructor | null {
  if (typeof window === 'undefined') return null;
  const win = window as unknown as {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };
  return win.SpeechRecognition || win.webkitSpeechRecognition || null;
}

export function isPatientSttSupported(): boolean {
  return getBrowserSpeechRecognitionCtor() !== null;
}

/**
 * Isolated Patient-only Vietnamese Speech-to-Text controller.
 * Never alters Impaired Mode microphone or speech hooks.
 */
export class PatientVoiceInputController {
  private recognition: SpeechRecognitionLike | null = null;
  private listening = false;
  private lastFinalText = '';
  private lastFinalAt = 0;
  private isSpeakingGuard: () => boolean;

  constructor(options?: { isSpeakingGuard?: () => boolean }) {
    this.isSpeakingGuard = options?.isSpeakingGuard || (() => false);
  }

  public isListening(): boolean {
    return this.listening;
  }

  public start(callbacks: VoiceInputCallbacks): boolean {
    if (this.listening) {
      this.stop();
      return false;
    }

    const Ctor = getBrowserSpeechRecognitionCtor();
    if (!Ctor) {
      callbacks.onError?.(
        'Trình duyệt này chưa hỗ trợ nhận diện giọng nói tiếng Việt. Bạn vui lòng nhập yêu cầu bằng văn bản.',
        'not-supported'
      );
      return false;
    }

    try {
      const rec = new Ctor();
      rec.lang = 'vi-VN';
      rec.continuous = false;
      rec.interimResults = true;
      rec.maxAlternatives = 1;

      let emittedFinalForSession = false;

      rec.onstart = () => {
        this.listening = true;
        callbacks.onStart?.();
      };

      rec.onresult = (event: any) => {
        // Guard against capturing Agent's own TTS output
        if (this.isSpeakingGuard()) return;

        let interim = '';
        let finalText = '';
        const results = event?.results;
        if (!results) return;

        for (let i = event.resultIndex || 0; i < results.length; i++) {
          const item = results[i];
          const text = item?.[0]?.transcript || '';
          if (item?.isFinal) {
            finalText += text;
          } else {
            interim += text;
          }
        }

        if (interim.trim()) {
          callbacks.onInterim?.(interim.trim());
        }

        const cleanedFinal = finalText.trim();
        if (cleanedFinal && !emittedFinalForSession) {
          const now = Date.now();
          // Prevent duplicate submission from browsers firing duplicate final events
          if (cleanedFinal === this.lastFinalText && now - this.lastFinalAt < 2500) {
            return;
          }
          emittedFinalForSession = true;
          this.lastFinalText = cleanedFinal;
          this.lastFinalAt = now;
          callbacks.onFinal?.(cleanedFinal);
        }
      };

      rec.onerror = (ev: { error?: string }) => {
        const code = ev?.error || 'unknown';
        this.listening = false;
        this.recognition = null;

        if (code === 'aborted') {
          return;
        }
        if (code === 'not-allowed' || code === 'service-not-allowed') {
          callbacks.onError?.(
            'Quyền sử dụng micro chưa được cấp. Vui lòng cho phép micro trong trình duyệt hoặc nhập văn bản.',
            code
          );
          return;
        }
        if (code === 'no-speech') {
          callbacks.onError?.(
            'Tôi chưa nghe rõ giọng nói của bạn. Bạn hãy bấm micro và nói lại gần hơn nhé.',
            code
          );
          return;
        }
        callbacks.onError?.(
          'Không thể thu âm lúc này. Bạn có thể thử lại hoặc nhập văn bản.',
          code
        );
      };

      rec.onend = () => {
        this.listening = false;
        if (this.recognition === rec) {
          this.recognition = null;
        }
        callbacks.onEnd?.();
      };

      this.recognition = rec;
      rec.start();
      return true;
    } catch {
      this.listening = false;
      this.recognition = null;
      callbacks.onError?.(
        'Không thể khởi động micro trên thiết bị này. Vui lòng nhập văn bản.',
        'start-failed'
      );
      return false;
    }
  }

  public stop() {
    this.listening = false;
    if (this.recognition) {
      try {
        this.recognition.stop();
      } catch {
        // Ignore
      }
      this.recognition = null;
    }
  }

  public abort() {
    this.listening = false;
    if (this.recognition) {
      try {
        this.recognition.abort();
      } catch {
        // Ignore
      }
      this.recognition = null;
    }
  }
}

/* ── Factory adapter expected by PatientAgentProvider ── */

/** Alias used by Provider to check browser STT support at render time. */
export const isPatientSpeechRecognitionSupported = isPatientSttSupported;

/**
 * Creates a PatientVoiceInputController whose `.start()` requires no arguments —
 * the callbacks are bound at construction time so the Provider can call `ctrl.start()`
 * directly from a click handler without forwarding callbacks each time.
 */
export function createPatientVoiceInputController(callbacks: {
  onStart?: () => void;
  onInterimTranscript?: (partial: string) => void;
  onFinalTranscript?: (finalText: string) => void;
  onError?: (friendlyMsg: string) => void;
  onEnd?: () => void;
}): PatientVoiceInputController {
  const ctrl = new PatientVoiceInputController();

  // Monkey-patch `.start()` so it forwards bound callbacks automatically.
  const originalStart = ctrl.start.bind(ctrl);
  (ctrl as any).start = (): boolean =>
    originalStart({
      onStart: callbacks.onStart,
      onInterim: callbacks.onInterimTranscript,
      onFinal: callbacks.onFinalTranscript,
      onError: (msg: string, _code: string) => callbacks.onError?.(msg),
      onEnd: callbacks.onEnd,
    });

  return ctrl;
}

import {
  cleanTextForSpeech,
  hasNativeVietnameseSpeech,
  speakVietnamese,
  stopSpeech,
} from '../../../../utils/speech';

export interface VoiceOutputCallbacks {
  onSpeakingChange?: (speaking: boolean) => void;
}

/**
 * Checks whether text includes quantitative lab values or diagnostic-like measurements
 * so sensitive health figures are never sent to unapproved external TTS proxies.
 */
export function containsSensitiveMedicalNumbers(text: string): boolean {
  const lower = text.toLowerCase();
  const hasLabUnit =
    /\b(mmol\/l|mg\/dl|umol\/l|u\/l|g\/l|10\^9\/l|10\^12\/l|ui\/ml|hba1c|glucose|cholesterol|creatinin|bạch cầu|hồng cầu|acid uric)\b/i.test(
      lower
    );
  const hasNumericMeasurement = /\b\d+([.,]\d+)?\s*(mmol|mg|umol|g\/l|u\/l|%)\b/i.test(lower);
  return hasLabUnit || hasNumericMeasurement;
}

/**
 * Patient-only Voice Output Controller.
 * Wraps local browser SpeechSynthesis first and coordinates queue + mute state
 * strictly inside Patient Agent Mode without mutating Impaired Mode settings.
 */
export class PatientVoiceOutputController {
  private queue: string[] = [];
  private speaking = false;
  private muted = false;
  private activeSession = 0;
  private callbacks: VoiceOutputCallbacks;

  constructor(callbacks: VoiceOutputCallbacks = {}) {
    this.callbacks = callbacks;
  }

  public isSpeaking(): boolean {
    return this.speaking;
  }

  public isMuted(): boolean {
    return this.muted;
  }

  public setMuted(muted: boolean) {
    this.muted = muted;
    if (muted) {
      this.stopSpeaking();
    }
  }

  public speak(text: string) {
    this.speakImmediate(text);
  }

  public stop() {
    this.stopSpeaking();
  }

  public dispose() {
    this.stopSpeaking();
    this.callbacks = {};
  }

  private setSpeaking(val: boolean) {
    if (this.speaking !== val) {
      this.speaking = val;
      this.callbacks.onSpeakingChange?.(val);
    }
  }

  public enqueue(text: string) {
    if (this.muted || typeof window === 'undefined') return;
    const cleaned = cleanTextForSpeech(text);
    if (!cleaned) return;
    this.queue.push(cleaned);
    if (!this.speaking) {
      this.drainNext();
    }
  }

  public speakImmediate(text: string) {
    this.stopSpeaking();
    this.enqueue(text);
  }

  public stopSpeaking() {
    this.activeSession += 1;
    this.queue = [];
    this.setSpeaking(false);
    try {
      stopSpeech();
    } catch {
      // Ignore
    }
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        if (window.speechSynthesis.speaking || window.speechSynthesis.pending) {
          window.speechSynthesis.cancel();
        }
      } catch {
        // Ignore
      }
    }
  }

  private drainNext() {
    if (this.muted || this.queue.length === 0) {
      this.setSpeaking(false);
      return;
    }

    const nextText = this.queue.shift()!;
    const sessionToken = this.activeSession;
    this.setSpeaking(true);

    // Privacy gate: if text contains sensitive medical measurements and device has no local Vietnamese TTS,
    // use local browser synthesis fallback rather than proxying medical numbers externally.
    const hasNativeVi = hasNativeVietnameseSpeech();
    const isSensitive = containsSensitiveMedicalNumbers(nextText);

    if (hasNativeVi || !isSensitive) {
      try {
        speakVietnamese(nextText, {
          onStart: () => {
            if (sessionToken === this.activeSession) {
              this.setSpeaking(true);
            }
          },
          onEnd: () => {
            if (sessionToken !== this.activeSession) return;
            if (this.queue.length > 0 && !this.muted) {
              this.drainNext();
            } else {
              this.setSpeaking(false);
            }
          },
        });
        return;
      } catch {
        // Fallback below
      }
    }

    // Local SpeechSynthesis fallback when avoiding external proxy for sensitive lab details
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        const utt = new SpeechSynthesisUtterance(nextText);
        utt.lang = 'vi-VN';
        utt.onend = () => {
          if (sessionToken !== this.activeSession) return;
          if (this.queue.length > 0 && !this.muted) {
            this.drainNext();
          } else {
            this.setSpeaking(false);
          }
        };
        utt.onerror = () => {
          if (sessionToken !== this.activeSession) return;
          this.setSpeaking(false);
        };
        window.speechSynthesis.speak(utt);
        return;
      } catch {
        // Ignore
      }
    }

    this.setSpeaking(false);
  }
}

/* ── Factory adapter expected by PatientAgentProvider ── */

/** No-arg factory so Provider can call `createPatientVoiceOutputController()` without coupling to constructor. */
export function createPatientVoiceOutputController(): PatientVoiceOutputController {
  return new PatientVoiceOutputController();
}

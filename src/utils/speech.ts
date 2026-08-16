// Multi-platform Vietnamese Text-to-Speech (TTS) engine for EyeTalk Assistant.
// Dual-Engine: Native Web Speech API with automatic Online Vietnamese TTS Fallback for iOS Safari / Netlify.

export interface SpeechSettings {
  speakerEnabled: boolean;
  speechVolume: number; // 0.0 to 1.0
  speechRate: number;   // 0.7 to 1.5
}

// Silent WAV base64 buffer to unlock HTML5 Audio on iOS Safari without producing noise
const SILENT_WAV_BASE64 = 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=';

let activeUtterances: SpeechSynthesisUtterance[] = [];
let isAudioUnlocked = false;
let sharedAudioElement: HTMLAudioElement | null = null;
let globalAudioContext: AudioContext | null = null;
let isPlayingAudio = false;
let cachedVoices: SpeechSynthesisVoice[] = [];
let currentSafetyTimer: ReturnType<typeof setTimeout> | null = null;

function loadInitialSpeechSettings(): SpeechSettings {
  if (typeof window === 'undefined') {
    return { speakerEnabled: false, speechVolume: 1.0, speechRate: 1.0 };
  }
  try {
    const savedEnabled = localStorage.getItem('luckyDream.speakerEnabled');
    const savedVolume = localStorage.getItem('luckyDream.speechVolume');
    const savedRate = localStorage.getItem('luckyDream.speechRate');
    return {
      speakerEnabled: savedEnabled !== null ? savedEnabled === 'true' : false,
      speechVolume: savedVolume !== null ? Math.max(0, Math.min(1, parseFloat(savedVolume))) : 1.0,
      speechRate: savedRate !== null ? Math.max(0.7, Math.min(1.5, parseFloat(savedRate))) : 1.0,
    };
  } catch {
    return { speakerEnabled: false, speechVolume: 1.0, speechRate: 1.0 };
  }
}

let currentSpeechSettings: SpeechSettings = loadInitialSpeechSettings();

export function getSpeechSettings(): SpeechSettings {
  return { ...currentSpeechSettings };
}

export function updateSpeechSettings(newSettings: Partial<SpeechSettings>) {
  const previousEnabled = currentSpeechSettings.speakerEnabled;
  currentSpeechSettings = {
    ...currentSpeechSettings,
    ...newSettings,
  };

  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem('luckyDream.speakerEnabled', String(currentSpeechSettings.speakerEnabled));
      localStorage.setItem('luckyDream.speechVolume', String(currentSpeechSettings.speechVolume));
      localStorage.setItem('luckyDream.speechRate', String(currentSpeechSettings.speechRate));
    } catch {
      // ignore
    }
  }

  if (previousEnabled && !currentSpeechSettings.speakerEnabled) {
    stopSpeech();
  }
}

function loadVoices() {
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    cachedVoices = window.speechSynthesis.getVoices();
  }
}

if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
  loadVoices();
  window.speechSynthesis.onvoiceschanged = () => {
    loadVoices();
  };
}

function getVietnameseVoice(): SpeechSynthesisVoice | null {
  if (cachedVoices.length === 0) {
    loadVoices();
  }
  return (
    cachedVoices.find(
      v =>
        v.lang.toLowerCase().startsWith('vi') ||
        v.lang.toLowerCase().includes('vietnam') ||
        v.name.toLowerCase().includes('vietnam') ||
        v.name.toLowerCase().includes('hoaimy') ||
        v.name.toLowerCase().includes('linh')
    ) || null
  );
}

export function isSpeechSupported(): boolean {
  return true; // Supported everywhere via Native Web Speech or Online TTS Fallback
}

export function cleanTextForSpeech(text: string): string {
  if (!text) return '';
  return text
    .replace(/```[\s\S]*?```/g, '')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/[*_]{1,3}([^*_]+)[*_]{1,3}/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[\r\n]+/g, '. ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Pre-unlocks audio playback contexts on initial user interaction (specifically tuned for iOS Safari).
 */
export function unlockAudio() {
  if (typeof window === 'undefined') return;

  // 1. Resume / Unlock Web Audio Context
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (AudioCtx) {
      if (!globalAudioContext) {
        globalAudioContext = new AudioCtx();
      }
      if (globalAudioContext.state === 'suspended') {
        globalAudioContext.resume();
      }
    }
  } catch (err) {
    console.warn('AudioContext unlock notice:', err);
  }

  // 2. Prime shared HTMLAudioElement for iOS Safari fallback playback
  try {
    if (!sharedAudioElement && typeof Audio !== 'undefined') {
      sharedAudioElement = new Audio();
      sharedAudioElement.setAttribute('playsinline', 'true');
      sharedAudioElement.setAttribute('webkit-playsinline', 'true');
    }
    if (sharedAudioElement) {
      sharedAudioElement.src = SILENT_WAV_BASE64;
      const p = sharedAudioElement.play();
      if (p !== undefined) {
        p.then(() => {
          sharedAudioElement?.pause();
        }).catch(() => {});
      }
    }
  } catch (err) {
    console.warn('HTMLAudioElement unlock notice:', err);
  }

  // 3. Resume SpeechSynthesis SAFELY (WITHOUT empty utterance speak which causes WebKit queue lock!)
  try {
    if ('speechSynthesis' in window) {
      loadVoices();
      if (window.speechSynthesis.paused) {
        window.speechSynthesis.resume();
      }
    }
  } catch (err) {
    console.warn('SpeechSynthesis unlock notice:', err);
  }

  isAudioUnlocked = true;
}

// Register global user touch/click listeners to unlock audio on first interaction
if (typeof window !== 'undefined') {
  const handleUserInteraction = () => {
    unlockAudio();
    if (isAudioUnlocked) {
      window.removeEventListener('pointerdown', handleUserInteraction);
      window.removeEventListener('touchstart', handleUserInteraction);
      window.removeEventListener('click', handleUserInteraction);
      window.removeEventListener('keydown', handleUserInteraction);
    }
  };

  window.addEventListener('pointerdown', handleUserInteraction, { passive: true });
  window.addEventListener('touchstart', handleUserInteraction, { passive: true });
  window.addEventListener('click', handleUserInteraction, { passive: true });
  window.addEventListener('keydown', handleUserInteraction, { passive: true });
}

/**
 * Stops all currently active speech (both Web Speech and Online Audio fallback).
 */
export function stopSpeech() {
  if (typeof window === 'undefined') return;

  if (currentSafetyTimer) {
    clearTimeout(currentSafetyTimer);
    currentSafetyTimer = null;
  }

  if ('speechSynthesis' in window) {
    try {
      window.speechSynthesis.cancel();
    } catch {
      // ignore
    }
  }

  if (sharedAudioElement) {
    try {
      sharedAudioElement.pause();
      sharedAudioElement.currentTime = 0;
    } catch {
      // ignore
    }
  }

  activeUtterances = [];
  isPlayingAudio = false;
}

export function isSpeaking(): boolean {
  if (typeof window === 'undefined') return false;
  const isWebSpeechSpeaking =
    'speechSynthesis' in window && window.speechSynthesis.speaking;
  return isWebSpeechSpeaking || isPlayingAudio;
}

/**
 * Splits text into smaller sentence chunks (<= 150 chars) for smooth TTS audio playback.
 */
function splitTextIntoChunks(text: string, maxLen = 150): string[] {
  if (text.length <= maxLen) return [text];
  const sentences = text.match(/[^.!?;\n]+[.!?;\n]+/g) || [text];
  const chunks: string[] = [];
  let currentChunk = '';

  for (const sentence of sentences) {
    if ((currentChunk + sentence).length <= maxLen) {
      currentChunk += sentence;
    } else {
      if (currentChunk.trim()) chunks.push(currentChunk.trim());
      if (sentence.length > maxLen) {
        const words = sentence.split(' ');
        let wordChunk = '';
        for (const w of words) {
          if ((wordChunk + ' ' + w).length <= maxLen) {
            wordChunk += (wordChunk ? ' ' : '') + w;
          } else {
            if (wordChunk.trim()) chunks.push(wordChunk.trim());
            wordChunk = w;
          }
        }
        if (wordChunk.trim()) currentChunk = wordChunk.trim();
        else currentChunk = '';
      } else {
        currentChunk = sentence;
      }
    }
  }
  if (currentChunk.trim()) chunks.push(currentChunk.trim());
  return chunks.length > 0 ? chunks : [text];
}

/**
 * Online Vietnamese TTS Fallback Player using pre-unlocked HTML5 Audio.
 * Uses Google Translate TTS & StreamElements fallback.
 */
function playOnlineTTS(
  text: string,
  options?: {
    onStart?: () => void;
    onEnd?: () => void;
    volume?: number;
    rate?: number;
  }
) {
  const chunks = splitTextIntoChunks(text, 150);
  let chunkIndex = 0;

  isPlayingAudio = true;
  options?.onStart?.();

  const playNextChunk = () => {
    if (chunkIndex >= chunks.length || !isPlayingAudio) {
      isPlayingAudio = false;
      options?.onEnd?.();
      return;
    }

    const chunkText = chunks[chunkIndex];
    chunkIndex++;

    const encoded = encodeURIComponent(chunkText);
    const primaryUrl = `https://translate.google.com/translate_tts?ie=UTF-8&tl=vi&client=tw-ob&q=${encoded}`;
    const secondaryUrl = `https://api.streamelements.com/kappa/v2/speech?voice=Vietnamese%20Female&text=${encoded}`;

    if (!sharedAudioElement && typeof Audio !== 'undefined') {
      sharedAudioElement = new Audio();
      sharedAudioElement.setAttribute('playsinline', 'true');
      sharedAudioElement.setAttribute('webkit-playsinline', 'true');
    }

    if (!sharedAudioElement) {
      isPlayingAudio = false;
      options?.onEnd?.();
      return;
    }

    const targetAudio = sharedAudioElement;
    targetAudio.playbackRate = options?.rate ?? currentSpeechSettings.speechRate;
    targetAudio.volume = options?.volume ?? currentSpeechSettings.speechVolume;

    let trySecondary = false;

    const handleEnded = () => {
      targetAudio.removeEventListener('ended', handleEnded);
      targetAudio.removeEventListener('error', handleError);
      playNextChunk();
    };

    const handleError = () => {
      targetAudio.removeEventListener('ended', handleEnded);
      targetAudio.removeEventListener('error', handleError);

      if (!trySecondary) {
        trySecondary = true;
        targetAudio.src = secondaryUrl;
        targetAudio.addEventListener('ended', handleEnded, { once: true });
        targetAudio.addEventListener('error', () => {
          isPlayingAudio = false;
          options?.onEnd?.();
        }, { once: true });
        targetAudio.play().catch(() => {
          isPlayingAudio = false;
          options?.onEnd?.();
        });
      } else {
        isPlayingAudio = false;
        options?.onEnd?.();
      }
    };

    targetAudio.addEventListener('ended', handleEnded, { once: true });
    targetAudio.addEventListener('error', handleError, { once: true });
    targetAudio.src = primaryUrl;

    const playPromise = targetAudio.play();
    if (playPromise !== undefined) {
      playPromise.catch(err => {
        console.warn('Audio play catch error, retrying secondary stream:', err);
        handleError();
      });
    }
  };

  playNextChunk();
}

/**
 * Speaks Vietnamese text out loud using native Web Speech API with automatic Online Audio fallback for iOS / Netlify.
 */
export function speakVietnamese(
  text: string,
  options?: {
    onStart?: () => void;
    onEnd?: () => void;
    volume?: number;
    rate?: number;
  }
) {
  if (typeof window === 'undefined') {
    options?.onEnd?.();
    return;
  }

  if (!currentSpeechSettings.speakerEnabled) {
    options?.onEnd?.();
    return;
  }

  const cleanedText = cleanTextForSpeech(text);
  if (!cleanedText) {
    options?.onEnd?.();
    return;
  }

  // Make sure audio contexts are unlocked
  unlockAudio();

  // Stop any active speech before starting new speech
  stopSpeech();

  const nativeViVoice = getVietnameseVoice();

  // If Web Speech API is supported AND device has native Vietnamese voice installed:
  if ('speechSynthesis' in window && nativeViVoice) {
    try {
      if (window.speechSynthesis.paused) {
        window.speechSynthesis.resume();
      }

      const utterance = new SpeechSynthesisUtterance(cleanedText);
      utterance.lang = 'vi-VN';
      utterance.rate = options?.rate ?? currentSpeechSettings.speechRate;
      utterance.pitch = 1.0;
      utterance.volume = options?.volume ?? currentSpeechSettings.speechVolume;
      utterance.voice = nativeViVoice;

      activeUtterances.push(utterance);

      let hasStarted = false;

      utterance.onstart = () => {
        hasStarted = true;
        if (currentSafetyTimer) {
          clearTimeout(currentSafetyTimer);
          currentSafetyTimer = null;
        }
        options?.onStart?.();
      };

      utterance.onend = () => {
        activeUtterances = activeUtterances.filter(u => u !== utterance);
        options?.onEnd?.();
      };

      utterance.onerror = (e) => {
        console.warn('SpeechSynthesis error, falling back to Online TTS:', e);
        activeUtterances = activeUtterances.filter(u => u !== utterance);
        playOnlineTTS(cleanedText, options);
      };

      // SAFETY TIMER: If Web Speech engine freezes on iOS Safari (onstart never fires after 350ms), fallback to Online TTS!
      currentSafetyTimer = setTimeout(() => {
        if (!hasStarted) {
          console.warn('SpeechSynthesis onstart timeout on iOS WebKit, switching to Online Audio TTS fallback');
          try {
            window.speechSynthesis.cancel();
          } catch {
            // ignore
          }
          activeUtterances = activeUtterances.filter(u => u !== utterance);
          playOnlineTTS(cleanedText, options);
        }
      }, 350);

      window.speechSynthesis.speak(utterance);
      return;
    } catch (err) {
      console.warn('Web Speech API exception, using Online TTS fallback:', err);
    }
  }

  // FALLBACK: Directly use Online Vietnamese TTS (ideal for iPhone / iOS Safari where vi-VN voice is missing)
  playOnlineTTS(cleanedText, options);
}





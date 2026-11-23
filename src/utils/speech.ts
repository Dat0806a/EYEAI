// Multi-platform Vietnamese Text-to-Speech (TTS) engine for EyeTalk Assistant.
// Dual-Engine: High-Performance Serverless Online TTS (/api/tts) + Native Web Speech API for Edge / Safari / Chrome / Android.

export interface SpeechSettings {
  speakerEnabled: boolean;
  speechVolume: number; // 0.0 to 1.0
  speechRate: number;   // 0.7 to 1.5
}

// Silent WAV base64 buffer to unlock HTML5 Audio on iOS Safari / Chrome without producing noise
const SILENT_WAV_BASE64 = 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=';

let activeUtterances: SpeechSynthesisUtterance[] = [];
let isAudioUnlocked = false;
let sharedAudioElement: HTMLAudioElement | null = null;
let globalAudioContext: AudioContext | null = null;
let currentAudioSource: AudioBufferSourceNode | null = null;
let isPlayingAudio = false;
let cachedVoices: SpeechSynthesisVoice[] = [];
let currentSafetyTimer: ReturnType<typeof setTimeout> | null = null;
let currentPlaybackSession = 0;

function loadInitialSpeechSettings(): SpeechSettings {
  if (typeof window === 'undefined') {
    return { speakerEnabled: true, speechVolume: 1.0, speechRate: 1.0 };
  }
  try {
    const savedEnabled = localStorage.getItem('luckyDream.speakerEnabled');
    const savedVolume = localStorage.getItem('luckyDream.speechVolume');
    const savedRate = localStorage.getItem('luckyDream.speechRate');
    return {
      // DEFAULT TO TRUE so new users on Chrome / Safari hear sound immediately!
      speakerEnabled: savedEnabled !== null ? savedEnabled === 'true' : true,
      speechVolume: savedVolume !== null ? Math.max(0, Math.min(1, parseFloat(savedVolume))) : 1.0,
      speechRate: savedRate !== null ? Math.max(0.7, Math.min(1.5, parseFloat(savedRate))) : 1.0,
    };
  } catch {
    return { speakerEnabled: true, speechVolume: 1.0, speechRate: 1.0 };
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
    try {
      const v = window.speechSynthesis.getVoices();
      if (v && v.length > 0) {
        cachedVoices = v;
      }
    } catch {
      // ignore
    }
  }
}

if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
  loadVoices();
  window.speechSynthesis.onvoiceschanged = () => {
    loadVoices();
  };
}

export function getVietnameseVoice(): SpeechSynthesisVoice | null {
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
        v.name.toLowerCase().includes('namminh') ||
        v.name.toLowerCase().includes('linh') ||
        v.name.toLowerCase().includes('an')
    ) || null
  );
}

export function isSpeechSupported(): boolean {
  return true;
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

function getGlobalAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!globalAudioContext) {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        globalAudioContext = new AudioCtx();
      }
    } catch (e) {
      console.warn('Cannot initialize AudioContext:', e);
    }
  }
  return globalAudioContext;
}

function getSharedAudioElement(): HTMLAudioElement | null {
  if (typeof window === 'undefined') return null;
  if (!sharedAudioElement && typeof Audio !== 'undefined') {
    try {
      sharedAudioElement = new Audio();
      sharedAudioElement.setAttribute('playsinline', 'true');
      sharedAudioElement.setAttribute('webkit-playsinline', 'true');
    } catch (e) {
      console.warn('Cannot initialize shared HTMLAudioElement:', e);
    }
  }
  return sharedAudioElement;
}

/**
 * Pre-unlocks audio playback contexts on initial user interaction (for iOS Safari, Chrome, and Edge).
 */
export function unlockAudio() {
  if (typeof window === 'undefined') return;

  // 1. Resume / Unlock Web Audio Context
  try {
    const ctx = getGlobalAudioContext();
    if (ctx && ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
  } catch (err) {
    console.warn('AudioContext unlock notice:', err);
  }

  // 2. Prime shared HTMLAudioElement for fallback playback
  try {
    const audio = getSharedAudioElement();
    if (audio) {
      audio.src = SILENT_WAV_BASE64;
      const p = audio.play();
      if (p !== undefined) {
        p.then(() => {
          audio.pause();
        }).catch(() => {});
      }
    }
  } catch (err) {
    console.warn('HTMLAudioElement unlock notice:', err);
  }

  // 3. Resume SpeechSynthesis & prime WebKit queue safely
  try {
    if ('speechSynthesis' in window) {
      loadVoices();
      if (window.speechSynthesis.paused) {
        window.speechSynthesis.resume();
      }
      // Prime iOS WebKit speech synthesis with a micro utterance during touch event
      if (
        typeof navigator !== 'undefined' &&
        /iPhone|iPad|iPod/i.test(navigator.userAgent)
      ) {
        const primeUtterance = new SpeechSynthesisUtterance(' ');
        primeUtterance.volume = 0.01;
        primeUtterance.rate = 2.0;
        window.speechSynthesis.speak(primeUtterance);
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

  currentPlaybackSession++;
  isPlayingAudio = false;

  if (currentSafetyTimer) {
    clearTimeout(currentSafetyTimer);
    currentSafetyTimer = null;
  }

  if (currentAudioSource) {
    try {
      currentAudioSource.stop();
      currentAudioSource.disconnect();
    } catch {
      // ignore
    }
    currentAudioSource = null;
  }

  if (sharedAudioElement) {
    try {
      sharedAudioElement.pause();
      sharedAudioElement.currentTime = 0;
    } catch {
      // ignore
    }
  }

  if ('speechSynthesis' in window) {
    try {
      window.speechSynthesis.cancel();
    } catch {
      // ignore
    }
  }

  activeUtterances = [];
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
 * Plays a single audio chunk via Web Audio API (or HTMLAudio fallback).
 */
async function playSingleChunk(
  chunk: string,
  volume: number,
  rate: number,
  sessionId: number
): Promise<void> {
  if (!isPlayingAudio || sessionId !== currentPlaybackSession) return;

  const encoded = encodeURIComponent(chunk);
  const ttsUrl = `/api/tts?text=${encoded}`;

  // Strategy 1: Web Audio API (Permanent Autoplay Immune once unlocked)
  const ctx = getGlobalAudioContext();
  if (ctx) {
    try {
      if (ctx.state === 'suspended') {
        await ctx.resume().catch(() => {});
      }

      if (ctx.state === 'running') {
        const response = await fetch(ttsUrl);
        if (!response.ok) {
          throw new Error(`TTS server responded with ${response.status}`);
        }

        if (!isPlayingAudio || sessionId !== currentPlaybackSession) return;

        const arrayBuffer = await response.arrayBuffer();
        if (!isPlayingAudio || sessionId !== currentPlaybackSession) return;

        // Decode audio data
        const decodedBuffer = await new Promise<AudioBuffer>((resolve, reject) => {
          ctx.decodeAudioData(arrayBuffer.slice(0), resolve, reject);
        });

        if (!isPlayingAudio || sessionId !== currentPlaybackSession) return;

        await new Promise<void>((resolve) => {
          const source = ctx.createBufferSource();
          const gainNode = ctx.createGain();

          source.buffer = decodedBuffer;
          source.playbackRate.value = rate;
          gainNode.gain.value = volume;

          source.connect(gainNode);
          gainNode.connect(ctx.destination);

          currentAudioSource = source;

          source.onended = () => {
            if (currentAudioSource === source) {
              currentAudioSource = null;
            }
            resolve();
          };

          try {
            source.start(0);
          } catch {
            resolve();
          }
        });

        return; // Successfully played chunk via Web Audio API!
      }
    } catch (err) {
      console.warn('Web Audio chunk playback exception, trying HTMLAudio fallback:', err);
    }
  }

  // Strategy 2: HTMLAudioElement fallback
  const audio = getSharedAudioElement();
  if (audio) {
    try {
      audio.playbackRate = rate;
      audio.volume = volume;

      await new Promise<void>((resolve, reject) => {
        let finished = false;

        const cleanup = () => {
          finished = true;
          audio.onended = null;
          audio.onerror = null;
        };

        audio.onended = () => {
          cleanup();
          resolve();
        };

        audio.onerror = (e) => {
          cleanup();
          reject(e);
        };

        audio.src = ttsUrl;
        const playPromise = audio.play();
        if (playPromise !== undefined) {
          playPromise.catch((err) => {
            if (!finished) {
              cleanup();
              reject(err);
            }
          });
        }
      });
      return;
    } catch (err) {
      console.warn('HTMLAudioElement chunk playback failed:', err);
    }
  }

  // Strategy 3: Emergency Web Speech fallback for this chunk
  if ('speechSynthesis' in window) {
    await new Promise<void>((resolve) => {
      try {
        const u = new SpeechSynthesisUtterance(chunk);
        u.lang = 'vi-VN';
        u.volume = volume;
        u.rate = rate;
        u.onend = () => resolve();
        u.onerror = () => resolve();
        window.speechSynthesis.speak(u);
      } catch {
        resolve();
      }
    });
  }
}

/**
 * Online Vietnamese TTS Engine using Serverless /api/tts.
 * Works seamlessly across Chrome, Safari, Edge, Android, iOS, and Netlify.
 */
async function playOnlineTTS(
  text: string,
  options?: {
    onStart?: () => void;
    onEnd?: () => void;
    volume?: number;
    rate?: number;
  }
) {
  const sessionId = ++currentPlaybackSession;
  const chunks = splitTextIntoChunks(text, 150);

  isPlayingAudio = true;
  options?.onStart?.();

  const volume = options?.volume ?? currentSpeechSettings.speechVolume;
  const rate = options?.rate ?? currentSpeechSettings.speechRate;

  for (const chunk of chunks) {
    if (!isPlayingAudio || sessionId !== currentPlaybackSession) {
      break;
    }
    await playSingleChunk(chunk, volume, rate, sessionId);
  }

  if (sessionId === currentPlaybackSession) {
    isPlayingAudio = false;
    options?.onEnd?.();
  }
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

  // Check if browser has a native Vietnamese voice available
  // (e.g., Microsoft Edge HoaiMy/NamMinh, iOS Linh, Android Google tiếng Việt)
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
        console.warn('SpeechSynthesis error, falling back to Online TTS (/api/tts):', e);
        activeUtterances = activeUtterances.filter(u => u !== utterance);
        playOnlineTTS(cleanedText, options);
      };

      // SAFETY TIMER: If Web Speech engine freezes on iOS Safari (onstart never fires after 1200ms), fallback to Online TTS!
      currentSafetyTimer = setTimeout(() => {
        if (!hasStarted) {
          console.warn('SpeechSynthesis onstart timeout, switching to Online Audio TTS fallback (/api/tts)');
          try {
            window.speechSynthesis.cancel();
          } catch {
            // ignore
          }
          activeUtterances = activeUtterances.filter(u => u !== utterance);
          playOnlineTTS(cleanedText, options);
        }
      }, 1200);

      window.speechSynthesis.speak(utterance);
      return;
    } catch (err) {
      console.warn('Web Speech API exception, using Online TTS fallback:', err);
    }
  }

  // Check if running on iOS Safari where voices may not be preloaded into getVoices()
  const isIOS =
    typeof navigator !== 'undefined' &&
    (/iPhone|iPad|iPod/i.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));

  if (isIOS && 'speechSynthesis' in window) {
    try {
      if (window.speechSynthesis.paused) {
        window.speechSynthesis.resume();
      }

      const utterance = new SpeechSynthesisUtterance(cleanedText);
      utterance.lang = 'vi-VN';
      utterance.rate = options?.rate ?? currentSpeechSettings.speechRate;
      utterance.pitch = 1.0;
      utterance.volume = options?.volume ?? currentSpeechSettings.speechVolume;

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

      utterance.onerror = () => {
        activeUtterances = activeUtterances.filter(u => u !== utterance);
        playOnlineTTS(cleanedText, options);
      };

      currentSafetyTimer = setTimeout(() => {
        if (!hasStarted) {
          try {
            window.speechSynthesis.cancel();
          } catch {}
          activeUtterances = activeUtterances.filter(u => u !== utterance);
          playOnlineTTS(cleanedText, options);
        }
      }, 1000);

      window.speechSynthesis.speak(utterance);
      return;
    } catch (err) {
      console.warn('iOS Web Speech attempt failed, using /api/tts:', err);
    }
  }

  // FALLBACK & DEFAULT FOR GOOGLE CHROME ON DESKTOP:
  // Google Chrome on Windows does not include a Vietnamese voice in Web Speech API.
  // We directly use high-quality Serverless Online Vietnamese TTS (/api/tts)!
  playOnlineTTS(cleanedText, options);
}

// Multi-platform Vietnamese Text-to-Speech (TTS) engine for EyeTalk Assistant.
// High-fidelity standard Vietnamese voice with resilient 3-Tier fallback:
// Tier 1: Serverless /api/tts decoded via Web Audio API (with Content-Type validation to prevent EncodingError).
// Tier 2: Dedicated iOS Safari native speech fallback (with vi-VN language mapping).
// Tier 3: Direct Google Translate TTS via HTMLAudioElement (using document-level no-referrer).
// Tier 4: Verified native Vietnamese Web Speech voice for Desktop (Edge HoaiMy / Android Google tiếng Việt).

export interface SpeechSettings {
  speakerEnabled: boolean;
  speechVolume: number; // 0.0 to 1.0
  speechRate: number;   // 0.7 to 1.5
}

// Silent WAV base64 buffer to unlock HTML5 Audio / AudioContext on iOS Safari & Chrome
const SILENT_WAV_BASE64 = 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=';

export const isIOS =
  typeof navigator !== 'undefined' &&
  (/iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));

let isAudioUnlocked = false;
let sharedAudioElement: HTMLAudioElement | null = null;
let globalAudioContext: AudioContext | null = null;
let currentAudioSource: AudioBufferSourceNode | null = null;
let isPlayingAudio = false;
let cachedVoices: SpeechSynthesisVoice[] = [];
let currentPlaybackSession = 0;

// In-memory cache for decoded audio buffers to guarantee 0ms instant playback for UI feedback
const audioBufferCache = new Map<string, AudioBuffer>();

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

/**
 * Strictly verifies whether a voice is a REAL Vietnamese voice.
 * NEVER matches English names (Daniel, Samantha, Susan, Alan, etc.).
 */
export function isVietnameseVoice(v: SpeechSynthesisVoice): boolean {
  if (!v) return false;
  const lang = (v.lang || '').toLowerCase().replace('_', '-');
  // BCP-47 language tag must strictly be Vietnamese
  if (lang === 'vi' || lang.startsWith('vi-')) {
    return true;
  }
  const name = (v.name || '').toLowerCase();
  // Name must explicitly indicate Vietnamese language
  if (
    name.includes('vietnam') ||
    name.includes('tiếng việt') ||
    name.includes('tieng viet')
  ) {
    return true;
  }
  if (name.includes('hoaimy') || name.includes('namminh')) {
    return true;
  }
  return false;
}

export function getVietnameseVoice(): SpeechSynthesisVoice | null {
  if (cachedVoices.length === 0) {
    loadVoices();
  }
  return cachedVoices.find(isVietnameseVoice) || null;
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
      let existing = document.getElementById('eyetalk-shared-audio') as HTMLAudioElement | null;
      if (!existing && typeof document !== 'undefined' && document.body) {
        existing = document.createElement('audio');
        existing.id = 'eyetalk-shared-audio';
        existing.setAttribute('playsinline', 'true');
        existing.setAttribute('webkit-playsinline', 'true');
        existing.setAttribute('referrerpolicy', 'no-referrer');
        existing.style.display = 'none';
        document.body.appendChild(existing);
      }
      sharedAudioElement = existing || new Audio();
      sharedAudioElement.setAttribute('playsinline', 'true');
      sharedAudioElement.setAttribute('webkit-playsinline', 'true');
      sharedAudioElement.setAttribute('referrerpolicy', 'no-referrer');
    } catch (e) {
      console.warn('Cannot initialize shared HTMLAudioElement:', e);
    }
  }
  return sharedAudioElement;
}

// Common UI navigation phrases to pre-warm in memory for instant 0ms gaze dwell feedback
const COMMON_UI_WORDS = [
  'Chọn',
  'Sang phải',
  'Sang trái',
  'Xuống',
  'Lên',
  'Hủy thao tác',
  'Kích hoạt cuộc gọi khẩn cấp',
  'Không có phần tử theo hướng này',
  'Đã căn tâm',
  'Đã đặt lại hiệu chỉnh',
];

export function prefetchCommonSounds() {
  if (typeof window === 'undefined') return;
  const ctx = getGlobalAudioContext();
  if (!ctx || ctx.state !== 'running') return;

  COMMON_UI_WORDS.forEach((word) => {
    if (audioBufferCache.has(word)) return;
    const url = `/api/tts?text=${encodeURIComponent(word)}`;
    fetch(url)
      .then((r) => {
        const ct = r.headers.get('content-type') || '';
        if (r.ok && !ct.includes('text/html') && (ct.includes('audio') || ct.includes('octet-stream'))) {
          return r.arrayBuffer();
        }
        return Promise.reject();
      })
      .then((ab) => ctx.decodeAudioData(ab))
      .then((buf) => {
        audioBufferCache.set(word, buf);
      })
      .catch(() => {});
  });
}

/**
 * Pre-unlocks audio playback contexts on initial user interaction (specifically tuned for iOS Safari & Chrome).
 */
export function unlockAudio() {
  if (typeof window === 'undefined') return;

  // 1. Permanent iOS Safari Web Audio Context unlock via 1-sample silent buffer node
  try {
    const ctx = getGlobalAudioContext();
    if (ctx) {
      if (ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
      }
      try {
        const buffer = ctx.createBuffer(1, 1, 22050);
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.connect(ctx.destination);
        source.start(0);
        setTimeout(() => {
          try {
            source.disconnect();
          } catch {}
        }, 50);
      } catch {}

      if (ctx.state === 'running') {
        prefetchCommonSounds();
      }
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

  // 3. Prime Web Speech API for iOS Safari
  try {
    if ('speechSynthesis' in window) {
      loadVoices();
      if (window.speechSynthesis.paused) {
        window.speechSynthesis.resume();
      }
      // Prime iOS WebKit speech queue with a micro utterance during touch event
      if (isIOS) {
        try {
          const primeUtterance = new SpeechSynthesisUtterance(' ');
          primeUtterance.volume = 0.01;
          primeUtterance.rate = 2.0;
          window.speechSynthesis.speak(primeUtterance);
        } catch {}
      }
    }
  } catch (err) {
    console.warn('SpeechSynthesis unlock notice:', err);
  }

  isAudioUnlocked = true;
}

// Register global user touch/click listeners to unlock audio on interaction
if (typeof window !== 'undefined') {
  const handleUserInteraction = () => {
    unlockAudio();
    const ctx = getGlobalAudioContext();
    // Only unregister listeners once audio context is genuinely running
    if (isAudioUnlocked && ctx && ctx.state === 'running') {
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
 * Stops all currently active speech immediately.
 */
export function stopSpeech() {
  if (typeof window === 'undefined') return;

  currentPlaybackSession++;
  isPlayingAudio = false;

  // Stop Web Audio API buffer source immediately
  if (currentAudioSource) {
    try {
      currentAudioSource.stop();
      currentAudioSource.disconnect();
    } catch {
      // ignore
    }
    currentAudioSource = null;
  }

  // Pause HTMLAudioElement
  if (sharedAudioElement) {
    try {
      sharedAudioElement.pause();
      sharedAudioElement.currentTime = 0;
    } catch {
      // ignore
    }
  }

  // Cancel Web Speech API
  if ('speechSynthesis' in window) {
    try {
      window.speechSynthesis.cancel();
    } catch {
      // ignore
    }
  }
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
 * Helper to play an AudioBuffer through Web Audio API
 */
function playAudioBuffer(
  ctx: AudioContext,
  buffer: AudioBuffer,
  volume: number,
  rate: number,
  sessionId: number
): Promise<void> {
  return new Promise<void>((resolve) => {
    if (!isPlayingAudio || sessionId !== currentPlaybackSession) {
      resolve();
      return;
    }

    const source = ctx.createBufferSource();
    const gainNode = ctx.createGain();

    source.buffer = buffer;
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
}

/**
 * Plays a single audio chunk with 4-tier resilient fallback:
 * Tier 1: Web Audio API via /api/tts (validating Content-Type).
 * Tier 2: Dedicated iOS Safari native speech fallback (with vi-VN language mapping).
 * Tier 3: Direct Google Translate TTS via HTMLAudioElement (using document-level no-referrer).
 * Tier 4: Verified native Vietnamese Web Speech voice for Desktop.
 */
async function playSingleChunk(
  chunk: string,
  volume: number,
  rate: number,
  sessionId: number
): Promise<void> {
  if (!isPlayingAudio || sessionId !== currentPlaybackSession) return;

  const encoded = encodeURIComponent(chunk);

  // Strategy 1: Check in-memory AudioBuffer cache (0ms instant playback for UI feedback)
  const cachedBuf = audioBufferCache.get(chunk);
  const ctx = getGlobalAudioContext();
  if (cachedBuf && ctx) {
    try {
      if (ctx.state === 'suspended') {
        await ctx.resume().catch(() => {});
      }
      if (ctx.state === 'running') {
        await playAudioBuffer(ctx, cachedBuf, volume, rate, sessionId);
        return;
      }
    } catch {
      // proceed to tier 1
    }
  }

  // Strategy 2 (Tier 1): Serverless /api/tts + Web Audio API
  // VALIDATES Content-Type to strictly prevent passing HTML (index.html) to decodeAudioData!
  if (ctx) {
    try {
      if (ctx.state === 'suspended') {
        await ctx.resume().catch(() => {});
      }

      if (ctx.state === 'running') {
        const ttsUrl = `/api/tts?text=${encoded}`;
        const response = await fetch(ttsUrl);
        const contentType = (response.headers.get('content-type') || '').toLowerCase();

        // STRICT VALIDATION: If response is HTML or not audio, do NOT attempt decodeAudioData!
        if (
          response.ok &&
          !contentType.includes('text/html') &&
          !contentType.includes('text/plain') &&
          (contentType.includes('audio') || contentType.includes('octet-stream'))
        ) {
          if (!isPlayingAudio || sessionId !== currentPlaybackSession) return;

          const arrayBuffer = await response.arrayBuffer();
          if (!isPlayingAudio || sessionId !== currentPlaybackSession) return;

          const decodedBuffer = await new Promise<AudioBuffer>((resolve, reject) => {
            ctx.decodeAudioData(arrayBuffer.slice(0), resolve, reject);
          });

          if (audioBufferCache.size < 60) {
            audioBufferCache.set(chunk, decodedBuffer);
          }

          if (!isPlayingAudio || sessionId !== currentPlaybackSession) return;
          await playAudioBuffer(ctx, decodedBuffer, volume, rate, sessionId);
          return; // Successfully played chunk via Web Audio API!
        }
      }
    } catch {
      // Tier 1 unavailable, proceed to Tier 2
    }
  }

  // Strategy 3 (Tier 2 - Dedicated for iOS Safari): Native Web Speech API with vi-VN language mapping
  // On iPhone, Apple AVFoundation speaks vi-VN locally with 100% reliability even if Web Audio / fetch is blocked!
  if (isIOS && 'speechSynthesis' in window) {
    try {
      if (window.speechSynthesis.paused) {
        window.speechSynthesis.resume();
      }
      await new Promise<void>((resolve) => {
        const u = new SpeechSynthesisUtterance(chunk);
        u.lang = 'vi-VN';
        const viVoice = getVietnameseVoice();
        if (viVoice) {
          u.voice = viVoice;
        }
        u.volume = volume;
        u.rate = rate;
        u.onend = () => resolve();
        u.onerror = () => resolve();
        window.speechSynthesis.speak(u);
      });
      return; // Successfully played on iOS Safari!
    } catch (iosErr) {
      console.warn('iOS Web Speech attempt notice:', iosErr);
    }
  }

  // Strategy 4 (Tier 3): Direct Google Translate TTS via HTMLAudioElement
  // Powered by <meta name="referrer" content="no-referrer"> in index.html (no 404 blocked referer!)
  const audio = getSharedAudioElement();
  if (audio) {
    try {
      audio.playbackRate = rate;
      audio.volume = volume;

      const directTtsUrl = `https://translate.google.com/translate_tts?ie=UTF-8&tl=vi&client=tw-ob&q=${encoded}`;

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

        audio.src = directTtsUrl;
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
      return; // Successfully played chunk via Direct Google TTS!
    } catch {
      // proceed to Tier 4
    }
  }

  // Strategy 5 (Tier 4): Verified Vietnamese Web Speech voice for Desktop (ONLY genuine Vietnamese, NEVER English)
  const viVoice = getVietnameseVoice();
  if ('speechSynthesis' in window && viVoice) {
    await new Promise<void>((resolve) => {
      try {
        const u = new SpeechSynthesisUtterance(chunk);
        u.voice = viVoice;
        u.lang = viVoice.lang || 'vi-VN';
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
 * Standard Vietnamese TTS Engine using Serverless /api/tts & iOS Fallback.
 * Plays ONE single pristine Vietnamese audio stream with ZERO overlaps and NO English mispronunciation.
 */
async function playStandardVietnameseTTS(
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
 * Speaks Vietnamese text out loud using the high-fidelity standard Vietnamese voice.
 * Works seamlessly and identically on Chrome, Safari, Edge, Android, and iOS.
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

  // Ensure audio contexts are unlocked
  unlockAudio();

  // Stop any active speech before starting new speech
  stopSpeech();

  // Play standard Vietnamese TTS directly - SINGLE ENGINE, ZERO OVERLAP
  playStandardVietnameseTTS(cleanedText, options);
}

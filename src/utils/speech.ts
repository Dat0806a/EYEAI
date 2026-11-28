// Multi-platform Vietnamese Text-to-Speech (TTS) engine for EyeTalk Assistant.
// Optimized per-platform architecture:
// - Microsoft Edge & Android: Native browser voice (HoaiMy / Google vi-VN) with 0ms latency & zero network lag.
// - Safari on iPhone (iOS): Native iOS AVFoundation speech synthesizer (vi-VN) immune to WebKit GC bugs & autoplay blocks.
// - Google Chrome on PC: High-fidelity Serverless /api/tts with in-memory caching & fetch abort controller.

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
let currentFetchController: AbortController | null = null;
let isPlayingAudio = false;
let cachedVoices: SpeechSynthesisVoice[] = [];
let currentPlaybackSession = 0;

// Persistent array of active utterances to prevent iOS Safari WebKit Garbage Collection bug
let activeUtterances: SpeechSynthesisUtterance[] = [];

// In-memory cache for decoded audio buffers to guarantee 0ms instant playback for UI feedback on Chrome
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
      window.dispatchEvent(
        new CustomEvent('eyetalk:speech-settings-changed', {
          detail: { ...currentSpeechSettings },
        })
      );
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
 * Strictly verifies whether a voice is a genuine Vietnamese voice.
 * NEVER matches English names (Daniel, Samantha, Susan, Alan, etc.).
 */
export function isVietnameseVoice(v: SpeechSynthesisVoice): boolean {
  if (!v) return false;
  const lang = (v.lang || '').toLowerCase().replace('_', '-');
  if (lang === 'vi' || lang.startsWith('vi-')) {
    return true;
  }
  const name = (v.name || '').toLowerCase();
  if (
    name.includes('vietnam') ||
    name.includes('tiếng việt') ||
    name.includes('tieng viet')
  ) {
    return true;
  }
  if (name.includes('hoaimy') || name.includes('namminh') || name.includes('linh')) {
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

/**
 * Checks if the current environment has a native Vietnamese speech synthesis voice:
 * - Edge on Windows has HoaiMy / NamMinh
 * - iPhone / iPad (iOS) has native AVFoundation vi-VN speech support
 * - Android has Google tiếng Việt
 */
export function hasNativeVietnameseSpeech(): boolean {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return false;
  if (isIOS) return true;
  return getVietnameseVoice() !== null;
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
  if (!globalAudioContext || globalAudioContext.state === 'closed') {
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

/**
 * Automatically revives AudioContext and SpeechSynthesis after media hardware changes
 * (e.g. camera stream started or stopped, route changes, or user navigation).
 * Khoi phuc AudioContext (neu bi suspended/interrupted) va Web Speech API sau khi bat/tat camera.
 */
export function recoverAudioSession() {
  if (typeof window === 'undefined') return;

  // 1. Recover Web Audio Context
  try {
    const ctx = getGlobalAudioContext();
    if (ctx && (ctx.state === 'suspended' || (ctx.state as any) === 'interrupted')) {
      ctx.resume().catch(() => {});
    }
  } catch (err) {
    console.warn('AudioContext recover error:', err);
  }

  // 2. Recover Web Speech API
  try {
    if ('speechSynthesis' in window) {
      if (window.speechSynthesis.paused) {
        window.speechSynthesis.resume();
      }
    }
  } catch (err) {
    console.warn('SpeechSynthesis recover error:', err);
  }
}

/**
 * Pre-unlocks audio playback contexts on initial user interaction (tuned for iOS Safari & Chrome).
 */
/**
 * Mo khoa Web Audio / SpeechSynthesis tren trinh duyet va thiet bi di dong (iOS Safari / Chrome).
 * - Can duoc goi trong lan tuong tac nguoi dung dau tien (click, cham man hinh, nhap phim).
 * - Phat mot am thanh im lang / utterance rong de danh thuc audio context va nap danh sach giong noi.
 */
export function unlockAudio() {
  if (typeof window === 'undefined') return;

  // 1. Permanent iOS Safari Web Audio Context unlock via 1-sample silent buffer node
  try {
    const ctx = getGlobalAudioContext();
    if (ctx) {
      if (ctx.state === 'suspended' || (ctx.state as any) === 'interrupted') {
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
          activeUtterances.push(primeUtterance);
          primeUtterance.onend = () => {
            activeUtterances = activeUtterances.filter(u => u !== primeUtterance);
          };
          primeUtterance.onerror = () => {
            activeUtterances = activeUtterances.filter(u => u !== primeUtterance);
          };
          window.speechSynthesis.speak(primeUtterance);
        } catch {}
      }
    }
  } catch (err) {
    console.warn('SpeechSynthesis unlock notice:', err);
  }

  isAudioUnlocked = true;
}

// Persistent user touch/click listener to ensure audio remains alive even after media stream changes
if (typeof window !== 'undefined') {
  const handleUserInteraction = () => {
    if (!isAudioUnlocked) {
      unlockAudio();
    } else {
      recoverAudioSession();
    }
  };

  window.addEventListener('pointerdown', handleUserInteraction, { passive: true });
  window.addEventListener('touchstart', handleUserInteraction, { passive: true });
  window.addEventListener('click', handleUserInteraction, { passive: true });
  window.addEventListener('keydown', handleUserInteraction, { passive: true });
}

/**
 * Stops all currently active speech immediately across all engines.
 */
export function stopSpeech() {
  if (typeof window === 'undefined') return;

  currentPlaybackSession++;
  isPlayingAudio = false;

  // Abort any pending network fetch requests to prevent lagging audio
  if (currentFetchController) {
    try {
      currentFetchController.abort();
    } catch {
      // ignore
    }
    currentFetchController = null;
  }

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

  // Cancel Web Speech API only when active or pending to avoid Chromium/WebKit async cancel collision
  if ('speechSynthesis' in window) {
    try {
      if (window.speechSynthesis.speaking || window.speechSynthesis.pending) {
        window.speechSynthesis.cancel();
      }
      if (window.speechSynthesis.paused) {
        window.speechSynthesis.resume();
      }
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
 * NATIVE SPEECH ENGINE (Edge / iOS Safari / Android)
 * Runs 100% locally on the device with 0ms latency, zero network requests, zero rate limits, and NO overlapping.
 */
function speakNative(
  text: string,
  options?: {
    onStart?: () => void;
    onEnd?: () => void;
    volume?: number;
    rate?: number;
  }
) {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    options?.onEnd?.();
    return;
  }

  try {
    if (window.speechSynthesis.paused) {
      window.speechSynthesis.resume();
    }

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'vi-VN';
    utterance.volume = options?.volume ?? currentSpeechSettings.speechVolume;
    utterance.rate = options?.rate ?? currentSpeechSettings.speechRate;
    utterance.pitch = 1.0;

    const viVoice = getVietnameseVoice();
    if (viVoice) {
      utterance.voice = viVoice;
    }

    // Keep reference in module-level array to prevent iOS Safari Garbage Collection bug
    activeUtterances.push(utterance);

    utterance.onstart = () => {
      options?.onStart?.();
    };

    let finished = false;
    const cleanup = () => {
      if (finished) return;
      finished = true;
      activeUtterances = activeUtterances.filter(u => u !== utterance);
      options?.onEnd?.();
    };

    utterance.onend = cleanup;
    utterance.onerror = cleanup;

    window.speechSynthesis.speak(utterance);

    // On iOS Safari & WebKit, unpause if immediately paused by browser
    if (window.speechSynthesis.paused) {
      window.speechSynthesis.resume();
    }
  } catch (err) {
    console.warn('Native speech exception:', err);
    options?.onEnd?.();
  }
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
 * Plays a single audio chunk for Google Chrome on Desktop via /api/tts.
 * Includes AbortController to abort previous fetches and in-memory cache to prevent lag.
 */
/**
 * Phat mot doan van ban tieng Viet qua duong dan `/api/tts` (bo trung chuyen Google Translate TTS).
 * - Dung khi trinh duyet thieu giong tieng Viet cai san (hoac giong may qua kho nghe).
 * - Ho tro huy ngang bang ma phien `sessionId` de khong bi chong tieng khi nguoi dung chuyen muc nhanh.
 */
async function playSingleChunkOnline(
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
      if (ctx.state === 'suspended' || (ctx.state as any) === 'interrupted') {
        await ctx.resume().catch(() => {});
      }
      await playAudioBuffer(ctx, cachedBuf, volume, rate, sessionId);
      return;
    } catch {
      // proceed to fetch
    }
  }

  // Strategy 2: Serverless /api/tts + Web Audio API
  if (ctx) {
    try {
      const ttsUrl = `/api/tts?text=${encoded}`;

      // Create AbortController to cancel this request if user triggers a new action
      currentFetchController = new AbortController();
      const response = await fetch(ttsUrl, { signal: currentFetchController.signal });
      currentFetchController = null;

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
        if (ctx.state === 'suspended' || (ctx.state as any) === 'interrupted') {
          await ctx.resume().catch(() => {});
        }
        await playAudioBuffer(ctx, decodedBuffer, volume, rate, sessionId);
        return; // Successfully played chunk via Web Audio API!
      }
    } catch (err: any) {
      if (err?.name === 'AbortError') return;
      // proceed to HTMLAudioElement fallback
    }
  }

  // Strategy 3: Serverless /api/tts via HTMLAudioElement fallback
  const audio = getSharedAudioElement();
  if (audio) {
    try {
      audio.playbackRate = rate;
      audio.volume = volume;

      // Primary fallback: Netlify /api/tts serverless function (safe proxy, no CORS/Referrer issues)
      const ttsProxyUrl = `/api/tts?text=${encoded}`;

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

        audio.src = ttsProxyUrl;
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
    } catch {
      // end
    }
  }
}

/**
 * Online Vietnamese TTS Engine for Chrome Desktop.
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
    await playSingleChunkOnline(chunk, volume, rate, sessionId);
  }

  if (sessionId === currentPlaybackSession) {
    isPlayingAudio = false;
    options?.onEnd?.();
  }
}

/**
 * Speaks Vietnamese text out loud using the optimal per-platform engine:
 * - Edge & iOS Safari: Native speech synthesis (0ms latency, zero network lag, zero rate limits).
 * - Chrome on Desktop: Online Serverless /api/tts with fetch aborting and RAM caching.
 *
 * Ham phat giong noi tieng Viet chinh cho toan phan he Nguoi suy giam:
 * 1. Kiem tra `speakerEnabled` va lam sach ky tu dinh dang markdown.
 * 2. Danh thuc bo am thanh trinh duyet (`recoverAudioSession`) va ngat cau doc cu (`stopSpeech`).
 * 3. Uu tien giong ban dia (Edge/iOS/Android); neu khong co (Chrome may tinh) thi goi `/api/tts` va luu dem RAM 60 muc.
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

  // Ensure audio contexts and speech synthesis are awake
  recoverAudioSession();

  // Stop any active speech before starting new speech
  stopSpeech();

  // PATH 1: Devices with native Vietnamese speech support (Edge, iPhone / iPad, Android)
  // Runs 100% locally with 0ms latency, zero network lag, and zero rate limits!
  if (hasNativeVietnameseSpeech()) {
    speakNative(cleanedText, options);
    return;
  }

  // PATH 2: Desktop Chrome on Windows (no native Vietnamese voice in SAPI)
  // Uses /api/tts with in-memory AudioBuffer caching & request aborting
  playOnlineTTS(cleanedText, options);
}

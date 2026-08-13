// Multi-platform Vietnamese Text-to-Speech (TTS) engine for EyeTalk Assistant.
// Uses native Web Speech API with Chrome GC protection and async voice preloading.

let activeUtterances: SpeechSynthesisUtterance[] = [];
let isAudioUnlocked = false;
let currentAudio: HTMLAudioElement | null = null;
let isPlayingAudio = false;
let cachedVoices: SpeechSynthesisVoice[] = [];

export interface SpeechSettings {
  speakerEnabled: boolean;
  speechVolume: number; // 0.0 to 1.0
  speechRate: number;   // 0.7 to 1.5
}

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
    } catch {
      // ignore
    }
  }

  // STOP SPEECH IMMEDIATELY IF TURNING SPEAKER OFF (Requirement 24)
  if (previousEnabled && !currentSpeechSettings.speakerEnabled) {
    stopSpeech();
  }
}

/**
 * Preload available browser voices asynchronously.
 */
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

/**
 * Finds best native Vietnamese voice in browser.
 */
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

/**
 * Clean markdown syntax, HTML tags, and code tokens for clear TTS reading out loud.
 */
export function cleanTextForSpeech(text: string): string {
  if (!text) return '';
  return text
    // Remove markdown code blocks
    .replace(/```[\s\S]*?```/g, '')
    // Remove inline code
    .replace(/`([^`]+)`/g, '$1')
    // Remove bold/italic formatting
    .replace(/[*_]{1,3}([^*_]+)[*_]{1,3}/g, '$1')
    // Remove headers (#)
    .replace(/^#{1,6}\s+/gm, '')
    // Remove markdown links [text](url)
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    // Replace multiple newlines or spaces with a single pause period
    .replace(/[\r\n]+/g, '. ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Pre-unlocks audio playback contexts on initial user interaction.
 */
export function unlockAudio() {
  if (typeof window === 'undefined') return;

  try {
    if ('speechSynthesis' in window) {
      loadVoices();
      if (window.speechSynthesis.paused) {
        window.speechSynthesis.resume();
      }
      const dummy = new SpeechSynthesisUtterance('');
      dummy.volume = 0;
      window.speechSynthesis.speak(dummy);
      isAudioUnlocked = true;
    }

    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (AudioCtx) {
      const ctx = new AudioCtx();
      if (ctx.state === 'suspended') {
        ctx.resume();
      }
    }
  } catch (err) {
    console.warn('Audio unlock notice:', err);
  }
}

// Register global user touch/click listeners to unlock audio
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
 * Stops all currently active speech.
 */
export function stopSpeech() {
  if (typeof window === 'undefined') return;

  if ('speechSynthesis' in window) {
    try {
      window.speechSynthesis.cancel();
    } catch {
      // ignore
    }
  }

  if (currentAudio) {
    try {
      currentAudio.pause();
      currentAudio.currentTime = 0;
    } catch {
      // ignore
    }
    currentAudio = null;
  }

  activeUtterances = [];
  isPlayingAudio = false;
}

/**
 * Checks if speech is currently playing.
 */
export function isSpeaking(): boolean {
  if (typeof window === 'undefined') return false;
  const isWebSpeechSpeaking =
    'speechSynthesis' in window && window.speechSynthesis.speaking;
  return isWebSpeechSpeaking || isPlayingAudio;
}

/**
 * Speaks Vietnamese text out loud using native Web Speech API.
 * Works reliably on Desktop (Chrome/Edge/Safari/Firefox) and Mobile (iOS/Android).
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

  // Master check: speakerEnabled (Requirements 4, 7, 8)
  if (!currentSpeechSettings.speakerEnabled) {
    options?.onEnd?.();
    return;
  }

  const cleanedText = cleanTextForSpeech(text);
  if (!cleanedText) {
    options?.onEnd?.();
    return;
  }

  // Ensure audio is unlocked
  unlockAudio();

  if ('speechSynthesis' in window) {
    try {
      if (window.speechSynthesis.speaking) {
        window.speechSynthesis.cancel();
      }
      if (window.speechSynthesis.paused) {
        window.speechSynthesis.resume();
      }

      const utterance = new SpeechSynthesisUtterance(cleanedText);
      utterance.lang = 'vi-VN';
      utterance.rate = options?.rate ?? currentSpeechSettings.speechRate;
      utterance.pitch = 1.0;
      utterance.volume = options?.volume ?? currentSpeechSettings.speechVolume;

      const viVoice = getVietnameseVoice();
      if (viVoice) {
        utterance.voice = viVoice;
      }

      // CRITICAL FIX: Keep reference in activeUtterances array to prevent Chrome Garbage Collector bug!
      activeUtterances.push(utterance);

      utterance.onstart = () => {
        options?.onStart?.();
      };

      utterance.onend = () => {
        activeUtterances = activeUtterances.filter(u => u !== utterance);
        options?.onEnd?.();
      };

      utterance.onerror = (e) => {
        console.warn('SpeechSynthesis error:', e);
        activeUtterances = activeUtterances.filter(u => u !== utterance);
        options?.onEnd?.();
      };

      window.speechSynthesis.speak(utterance);
      return;
    } catch (err) {
      console.warn('Web Speech API exception:', err);
    }
  }

  options?.onEnd?.();
}




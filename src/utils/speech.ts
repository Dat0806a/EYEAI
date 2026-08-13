// Robust, mobile-optimized Vietnamese Text-to-Speech (TTS) engine for EyeTalk Assistant.
// Resolves mobile web (iOS Safari / Android Chrome) audio autoplay restrictions and missing native voices.

let currentUtterance: SpeechSynthesisUtterance | null = null;
let currentAudio: HTMLAudioElement | null = null;
let isAudioUnlocked = false;
let isPlayingAudio = false;

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
 * Splits text into small readable chunks (max ~150 chars) at natural sentence boundaries
 * to ensure smooth streaming and avoid URL character limits or browser TTS timeouts.
 */
function chunkText(text: string, maxLen = 150): string[] {
  const clean = cleanTextForSpeech(text);
  if (!clean) return [];
  if (clean.length <= maxLen) return [clean];

  const sentences = clean.match(/[^.!?;\n]+[.!?;\n]+/g) || [clean];
  const chunks: string[] = [];
  let currentChunk = '';

  for (const sentence of sentences) {
    if ((currentChunk + sentence).length <= maxLen) {
      currentChunk += sentence;
    } else {
      if (currentChunk.trim()) chunks.push(currentChunk.trim());
      if (sentence.length > maxLen) {
        const words = sentence.split(' ');
        let subChunk = '';
        for (const word of words) {
          if ((subChunk + ' ' + word).length <= maxLen) {
            subChunk += (subChunk ? ' ' : '') + word;
          } else {
            if (subChunk.trim()) chunks.push(subChunk.trim());
            subChunk = word;
          }
        }
        if (subChunk.trim()) currentChunk = subChunk.trim();
        else currentChunk = '';
      } else {
        currentChunk = sentence;
      }
    }
  }
  if (currentChunk.trim()) chunks.push(currentChunk.trim());

  return chunks.length > 0 ? chunks : [clean];
}

let persistentAudio: HTMLAudioElement | null = null;

/**
 * Singleton persistent HTML5 Audio element to bypass iOS Safari autoplay locks.
 */
function getPersistentAudio(): HTMLAudioElement {
  if (!persistentAudio && typeof window !== 'undefined') {
    persistentAudio = new Audio();
    persistentAudio.setAttribute('playsinline', 'true');
    persistentAudio.setAttribute('webkit-playsinline', 'true');
    persistentAudio.preload = 'auto';
  }
  return persistentAudio!;
}

/**
 * Pre-unlocks audio playback contexts on mobile web (iOS Safari & Android Chrome)
 * by playing silent speech and audio buffers on initial user interaction.
 */
export function unlockAudio() {
  if (typeof window === 'undefined') return;

  try {
    // 1. Unlock Web Speech API
    if ('speechSynthesis' in window) {
      window.speechSynthesis.getVoices();
      const dummy = new SpeechSynthesisUtterance('');
      dummy.volume = 0;
      window.speechSynthesis.speak(dummy);
      if (window.speechSynthesis.paused) {
        window.speechSynthesis.resume();
      }
    }

    // 2. Unlock persistent HTML5 Audio element instance with silent WAV buffer for iOS Safari
    const audio = getPersistentAudio();
    if (!isAudioUnlocked) {
      audio.src = 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=';
      audio.volume = 0.05;
      const playPromise = audio.play();
      if (playPromise !== undefined) {
        playPromise
          .then(() => {
            audio.pause();
            isAudioUnlocked = true;
          })
          .catch(() => {
            // Will retry unlock on next tap
          });
      }
    }
  } catch (err) {
    console.warn('Audio unlock notice:', err);
  }
}

// Auto-register touch/click interaction listeners to unlock audio on first tap
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

  if ('speechSynthesis' in window) {
    window.speechSynthesis.onvoiceschanged = () => {
      window.speechSynthesis.getVoices();
    };
  }
}

/**
 * Stops all currently active speech (both WebSpeech and HTMLAudio fallback).
 */
export function stopSpeech() {
  if (typeof window === 'undefined') return;

  if ('speechSynthesis' in window) {
    try {
      window.speechSynthesis.cancel();
    } catch {
      // Ignore WebSpeech cancel errors
    }
  }

  if (persistentAudio) {
    try {
      persistentAudio.pause();
      persistentAudio.currentTime = 0;
    } catch {
      // Ignore audio cleanup errors
    }
  }

  currentUtterance = null;
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
 * Locates native Vietnamese TTS voice in browser if available.
 */
function getVietnameseVoice(): SpeechSynthesisVoice | null {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return null;
  const voices = window.speechSynthesis.getVoices();
  return (
    voices.find(
      v =>
        v.lang.toLowerCase().startsWith('vi') ||
        v.lang.toLowerCase().includes('vietnam') ||
        v.name.toLowerCase().includes('vietnam') ||
        v.name.toLowerCase().includes('vietnamese')
    ) || null
  );
}

/**
 * Detects if the device is an iOS device (iPhone, iPad, iPod).
 */
function isIOSDevice(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  return /iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

/**
 * Detects if the device is a mobile phone/tablet (iOS/Android).
 */
function isMobileDevice(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
    navigator.userAgent
  ) || isIOSDevice();
}

/**
 * Speaks text using Online Google TTS MP3 fallback with persistent Audio element instance.
 * Highly reliable on mobile browsers (iOS Safari & Android Chrome) where native TTS is muted or missing.
 */
function speakOnlineAudio(
  text: string,
  options?: { onStart?: () => void; onEnd?: () => void }
) {
  stopSpeech();

  const chunks = chunkText(text);
  if (chunks.length === 0) {
    options?.onEnd?.();
    return;
  }

  isPlayingAudio = true;
  options?.onStart?.();

  let index = 0;
  const audio = getPersistentAudio();

  function playNextChunk() {
    if (index >= chunks.length || !isPlayingAudio) {
      isPlayingAudio = false;
      options?.onEnd?.();
      return;
    }

    const chunk = chunks[index];
    index++;

    const ttsUrl = `https://translate.google.com/translate_tts?ie=UTF-8&tl=vi&client=tw-ob&q=${encodeURIComponent(
      chunk
    )}`;

    audio.onended = () => {
      playNextChunk();
    };

    audio.onerror = (e) => {
      console.warn('Online TTS chunk error, skipping to next chunk:', e);
      playNextChunk();
    };

    // Reuse the unlocked persistent audio element
    audio.src = ttsUrl;
    audio.currentTime = 0;
    audio.volume = 1.0;

    const playPromise = audio.play();
    if (playPromise !== undefined) {
      playPromise.catch(err => {
        console.warn('iPhone Audio play blocked by WebKit policy:', err);
        isPlayingAudio = false;
        options?.onEnd?.();
      });
    }
  }

  playNextChunk();
}

/**
 * Main TTS function to speak Vietnamese text.
 * Switches intelligently between native SpeechSynthesis and Online Audio TTS fallback.
 */
export function speakVietnamese(
  text: string,
  options?: {
    onStart?: () => void;
    onEnd?: () => void;
  }
) {
  if (typeof window === 'undefined') {
    options?.onEnd?.();
    return;
  }

  const cleanedText = cleanTextForSpeech(text);
  if (!cleanedText) {
    options?.onEnd?.();
    return;
  }

  // Pre-unlock audio context
  unlockAudio();

  const mobile = isMobileDevice();
  const nativeViVoice = getVietnameseVoice();

  // On Mobile OR if no native Vietnamese voice exists, use high-clarity Online Audio TTS fallback directly
  if (mobile || !nativeViVoice) {
    speakOnlineAudio(cleanedText, options);
    return;
  }

  // On Desktop with native Vietnamese voice, use Web Speech API
  stopSpeech();

  try {
    const utterance = new SpeechSynthesisUtterance(cleanedText);
    utterance.voice = nativeViVoice;
    utterance.lang = 'vi-VN';
    utterance.pitch = 1.0;
    utterance.rate = 0.95;

    let hasStarted = false;

    utterance.onstart = () => {
      hasStarted = true;
      options?.onStart?.();
    };

    utterance.onend = () => {
      currentUtterance = null;
      options?.onEnd?.();
    };

    utterance.onerror = (e) => {
      console.warn('WebSpeech error, falling back to Online Audio TTS:', e);
      currentUtterance = null;
      speakOnlineAudio(cleanedText, options);
    };

    currentUtterance = utterance;

    if (window.speechSynthesis.paused) {
      window.speechSynthesis.resume();
    }

    window.speechSynthesis.speak(utterance);

    // Timeout safety fallback: if WebSpeech doesn't start in 1s (common on mobile silent mode)
    setTimeout(() => {
      if (!hasStarted && currentUtterance === utterance) {
        console.warn('WebSpeech start timeout, falling back to Online Audio TTS');
        stopSpeech();
        speakOnlineAudio(cleanedText, options);
      }
    }, 1000);
  } catch (err) {
    console.warn('SpeechSynthesis exception, using online fallback:', err);
    speakOnlineAudio(cleanedText, options);
  }
}



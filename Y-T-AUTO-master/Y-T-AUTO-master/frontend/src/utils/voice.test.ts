import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createSpeechRecognition,
  isSpeechRecognitionSupported,
  speakText,
} from './voice';

class FakeSpeechRecognition {
  lang = '';
  continuous = false;
  interimResults = false;
  onresult: ((event: unknown) => void) | null = null;
  onerror: ((event: { error?: string }) => void) | null = null;
  onend: (() => void) | null = null;
  start = vi.fn();
  stop = vi.fn();
}

class FakeUtterance {
  text: string;
  lang = '';
  rate = 1;
  constructor(text: string) {
    this.text = text;
  }
}

const originalSpeechRecognition = (
  window as unknown as { SpeechRecognition?: typeof FakeSpeechRecognition }
).SpeechRecognition;
const originalWebkitSpeechRecognition = (
  window as unknown as { webkitSpeechRecognition?: typeof FakeSpeechRecognition }
).webkitSpeechRecognition;

const originalSpeechSynthesis = window.speechSynthesis;
const originalUtterance = globalThis.SpeechSynthesisUtterance;

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  Object.defineProperty(window, 'SpeechRecognition', {
    configurable: true,
    value: originalSpeechRecognition,
  });
  Object.defineProperty(window, 'webkitSpeechRecognition', {
    configurable: true,
    value: originalWebkitSpeechRecognition,
  });
  Object.defineProperty(window, 'speechSynthesis', {
    configurable: true,
    value: originalSpeechSynthesis,
  });
  Object.defineProperty(globalThis, 'SpeechSynthesisUtterance', {
    configurable: true,
    value: originalUtterance,
  });
});

describe('voice utilities', () => {
  it('reports speech recognition support when SpeechRecognition exists', () => {
    Object.defineProperty(window, 'SpeechRecognition', {
      configurable: true,
      value: FakeSpeechRecognition,
    });
    Object.defineProperty(window, 'webkitSpeechRecognition', {
      configurable: true,
      value: undefined,
    });
    expect(isSpeechRecognitionSupported()).toBe(true);
  });

  it('reports speech recognition support via webkit prefix', () => {
    Object.defineProperty(window, 'SpeechRecognition', {
      configurable: true,
      value: undefined,
    });
    Object.defineProperty(window, 'webkitSpeechRecognition', {
      configurable: true,
      value: FakeSpeechRecognition,
    });
    expect(isSpeechRecognitionSupported()).toBe(true);
  });

  it('returns false when speech recognition is unavailable', () => {
    Object.defineProperty(window, 'SpeechRecognition', {
      configurable: true,
      value: undefined,
    });
    Object.defineProperty(window, 'webkitSpeechRecognition', {
      configurable: true,
      value: undefined,
    });
    expect(isSpeechRecognitionSupported()).toBe(false);
  });

  it('creates a Vietnamese recognition controller and forwards final transcripts', () => {
    Object.defineProperty(window, 'SpeechRecognition', {
      configurable: true,
      value: FakeSpeechRecognition,
    });
    Object.defineProperty(window, 'webkitSpeechRecognition', {
      configurable: true,
      value: undefined,
    });
    const onResult = vi.fn();
    const onEnd = vi.fn();
    const onError = vi.fn();
    const controller = createSpeechRecognition({ onResult, onEnd, onError });
    expect(controller).not.toBeNull();

    const instance = (window as unknown as { lastRecognition?: FakeSpeechRecognition }).lastRecognition;
    expect(instance).toBeDefined();
    expect(instance!.lang).toBe('vi-VN');
    expect(instance!.continuous).toBe(true);
    expect(instance!.interimResults).toBe(true);

    controller!.start();
    expect(instance!.start).toHaveBeenCalledTimes(1);
    instance!.onresult!({
      results: [
        { 0: { transcript: 'chỉ số ' }, isFinal: false },
        { 0: { transcript: 'WBC là gì?' }, isFinal: true },
      ],
    });
    expect(onResult).toHaveBeenCalledWith('chỉ số WBC là gì?', true);

    instance!.onend!();
    expect(onEnd).toHaveBeenCalledTimes(1);

    controller!.stop();
    expect(instance!.stop).toHaveBeenCalledTimes(1);
  });

  it('maps microphone permission errors to a Vietnamese message', () => {
    Object.defineProperty(window, 'SpeechRecognition', {
      configurable: true,
      value: FakeSpeechRecognition,
    });
    const onError = vi.fn();
    createSpeechRecognition({ onResult: vi.fn(), onEnd: vi.fn(), onError });
    const instance = (window as unknown as { lastRecognition?: FakeSpeechRecognition }).lastRecognition;
    instance!.onerror!({ error: 'not-allowed' });
    expect(onError.mock.calls[0][0]).toContain('quyền truy cập microphone');
  });

  it('speaks Vietnamese text with speechSynthesis and cancels previous speech', () => {
    const speak = vi.fn();
    const cancel = vi.fn();
    Object.defineProperty(globalThis, 'SpeechSynthesisUtterance', {
      configurable: true,
      value: FakeUtterance,
    });
    Object.defineProperty(window, 'speechSynthesis', {
      configurable: true,
      value: { speak, cancel },
    });

    expect(speakText('Xin chào')).toBe(true);
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(speak).toHaveBeenCalledTimes(1);
    const utterance = speak.mock.calls[0][0] as SpeechSynthesisUtterance;
    expect(utterance.text).toBe('Xin chào');
    expect(utterance.lang).toBe('vi-VN');
  });

  it('returns false when speechSynthesis is unavailable', () => {
    Object.defineProperty(window, 'speechSynthesis', {
      configurable: true,
      value: undefined,
    });
    expect(speakText('Xin chào')).toBe(false);
  });
});

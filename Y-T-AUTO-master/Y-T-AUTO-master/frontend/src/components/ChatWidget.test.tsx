import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { sendChatMessage } from '../services/api';
import { ChatWidget } from './ChatWidget';
import {
  createSpeechRecognition,
  isSpeechRecognitionSupported,
  speakText,
  VoiceRecognitionCallbacks,
} from '../utils/voice';

vi.mock('../services/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/api')>();
  return { ...actual, sendChatMessage: vi.fn() };
});

vi.mock('../utils/voice', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../utils/voice')>();
  return {
    ...actual,
    isSpeechRecognitionSupported: vi.fn(),
    createSpeechRecognition: vi.fn(),
    speakText: vi.fn(),
  };
});

let lastCallbacks: VoiceRecognitionCallbacks | null = null;

beforeEach(() => {
  vi.mocked(isSpeechRecognitionSupported).mockReset();
  vi.mocked(createSpeechRecognition).mockReset();
  vi.mocked(speakText).mockReset();
  vi.mocked(sendChatMessage).mockReset();
  lastCallbacks = null;
});

describe('ChatWidget voice input/output', () => {
  it('captures voice transcript into the input and speaks assistant replies', async () => {
    vi.mocked(isSpeechRecognitionSupported).mockReturnValue(true);
    vi.mocked(createSpeechRecognition).mockImplementation((callbacks) => {
      lastCallbacks = callbacks;
      return {
        supported: true,
        start: vi.fn(),
        stop: vi.fn(),
      };
    });
    vi.mocked(speakText).mockReturnValue(true);
    vi.mocked(sendChatMessage).mockResolvedValue({
      sessionId: 'session-1',
      reply: 'Chỉ số WBC giúp đánh giá tình trạng viêm nhiễm.',
    });

    render(
      <MemoryRouter>
        <ChatWidget />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Mở chatbot' }));
    const mic = screen.getByRole('button', { name: 'Nhập bằng giọng nói' });
    fireEvent.click(mic);

    expect(lastCallbacks).not.toBeNull();
    lastCallbacks!.onResult('WBC là gì?', true);
    lastCallbacks!.onEnd();

    const input = screen.getByPlaceholderText('Nhập câu hỏi...');
    await waitFor(() => {
      expect((input as HTMLInputElement).value).toBe('WBC là gì?');
    });

    fireEvent.submit(input.closest('form')!);
    await waitFor(() => {
      expect(screen.getByText('Chỉ số WBC giúp đánh giá tình trạng viêm nhiễm.')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Đọc câu trả lời' }));
    expect(speakText).toHaveBeenCalledWith('Chỉ số WBC giúp đánh giá tình trạng viêm nhiễm.');
  });

  it('disables the microphone button when speech recognition is unsupported', () => {
    vi.mocked(isSpeechRecognitionSupported).mockReturnValue(false);
    render(
      <MemoryRouter>
        <ChatWidget />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Mở chatbot' }));
    expect(screen.getByRole('button', { name: 'Nhập bằng giọng nói' })).toBeDisabled();
  });
});

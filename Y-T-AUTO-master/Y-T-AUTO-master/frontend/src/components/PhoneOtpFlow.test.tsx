import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { requestPhoneLinkOtp, requestPhoneLoginOtp, requestPhoneRegisterOtp } from '../services/api';
import { PhoneOtpFlow } from './PhoneOtpFlow';

vi.mock('../services/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/api')>();
  return {
    ...actual,
    requestPhoneLinkOtp: vi.fn(),
    requestPhoneLoginOtp: vi.fn(),
    requestPhoneRegisterOtp: vi.fn(),
  };
});

const CHALLENGE = {
  challengeToken: 'a'.repeat(43),
  expiresAt: '2026-08-13T10:05:00.000Z',
  resendAvailableAt: '2026-08-13T10:01:00.000Z',
};

function apiFailure(code: string, message: string, retryAfter?: string) {
  return {
    response: {
      data: { error: { code, message } },
      headers: retryAfter ? { 'retry-after': retryAfter } : {},
    },
  };
}

beforeEach(() => {
  vi.mocked(requestPhoneLoginOtp).mockReset();
  vi.mocked(requestPhoneRegisterOtp).mockReset();
  vi.mocked(requestPhoneLinkOtp).mockReset();
});

describe('PhoneOtpFlow', () => {
  it('requests a login challenge and shows an accessible OTP step', async () => {
    vi.mocked(requestPhoneLoginOtp).mockResolvedValue(CHALLENGE);
    render(<PhoneOtpFlow mode="login" onVerify={vi.fn()} />);

    fireEvent.change(screen.getByRole('textbox', { name: 'Số điện thoại' }), {
      target: { value: '0912 345 678' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Gửi mã OTP' }));

    expect(await screen.findByRole('heading', { name: 'Nhập mã xác minh' })).toBeInTheDocument();
    expect(requestPhoneLoginOtp).toHaveBeenCalledWith('0912 345 678');
    expect(screen.getByRole('textbox', { name: 'Mã OTP' })).toHaveAttribute('inputmode', 'numeric');
    expect(screen.getByText(/0912 345 678/)).toBeInTheDocument();
  });

  it('uses the authenticated link request endpoint in link mode', async () => {
    vi.mocked(requestPhoneLinkOtp).mockResolvedValue(CHALLENGE);
    render(<PhoneOtpFlow mode="link" onVerify={vi.fn()} />);

    fireEvent.change(screen.getByRole('textbox', { name: 'Số điện thoại' }), {
      target: { value: '0912345678' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Gửi mã xác minh' }));

    await waitFor(() => expect(requestPhoneLinkOtp).toHaveBeenCalledWith('0912345678'));
    expect(requestPhoneLoginOtp).not.toHaveBeenCalled();
  });

  it('uses the registration request endpoint and registration wording in register mode', async () => {
    vi.mocked(requestPhoneRegisterOtp).mockResolvedValue(CHALLENGE);
    const onVerify = vi.fn().mockResolvedValue({ hasProfile: false });

    render(<PhoneOtpFlow mode="register" onVerify={onVerify} />);
    fireEvent.change(screen.getByRole('textbox', { name: 'Số điện thoại' }), {
      target: { value: '0912345678' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Gửi mã OTP' }));

    await waitFor(() => expect(requestPhoneRegisterOtp).toHaveBeenCalledWith('0912345678'));
    expect(requestPhoneLoginOtp).not.toHaveBeenCalled();
    expect(requestPhoneLinkOtp).not.toHaveBeenCalled();
    fireEvent.change(screen.getByRole('textbox', { name: 'Mã OTP' }), {
      target: { value: '012345' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Xác minh và đăng ký' }));

    await waitFor(() => expect(onVerify).toHaveBeenCalledWith(CHALLENGE.challengeToken, '012345'));
  });

  it('guides a verified unknown login identity to registration without exposing provider details', async () => {
    vi.mocked(requestPhoneLoginOtp).mockResolvedValue(CHALLENGE);
    const onVerify = vi.fn().mockRejectedValue(apiFailure('REGISTRATION_REQUIRED', 'Internal account result'));

    render(<PhoneOtpFlow mode="login" onVerify={onVerify} />);
    fireEvent.change(screen.getByRole('textbox', { name: 'Số điện thoại' }), {
      target: { value: '0912345678' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Gửi mã OTP' }));
    fireEvent.change(await screen.findByRole('textbox', { name: 'Mã OTP' }), {
      target: { value: '012345' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Xác minh và đăng nhập' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Bạn chưa có tài khoản. Hãy đăng ký.');
    expect(screen.getByRole('link', { name: 'Đăng ký' })).toHaveAttribute('href', '/register');
    expect(screen.queryByText('Internal account result')).not.toBeInTheDocument();
  });

  it('guides a verified existing registration identity to login without exposing provider details', async () => {
    vi.mocked(requestPhoneRegisterOtp).mockResolvedValue(CHALLENGE);
    const onVerify = vi.fn().mockRejectedValue(apiFailure('LOGIN_REQUIRED', 'Internal account result'));

    render(<PhoneOtpFlow mode="register" onVerify={onVerify} />);
    fireEvent.change(screen.getByRole('textbox', { name: 'Số điện thoại' }), {
      target: { value: '0912345678' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Gửi mã OTP' }));
    fireEvent.change(await screen.findByRole('textbox', { name: 'Mã OTP' }), {
      target: { value: '012345' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Xác minh và đăng ký' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Tài khoản này đã được đăng ký. Vui lòng đăng nhập.',
    );
    expect(screen.getByRole('link', { name: 'Đăng nhập' })).toHaveAttribute('href', '/login');
    expect(screen.queryByText('Internal account result')).not.toBeInTheDocument();
  });

  it('verifies the six-digit OTP and reports success', async () => {
    vi.mocked(requestPhoneLoginOtp).mockResolvedValue(CHALLENGE);
    const onVerify = vi.fn().mockResolvedValue(true);
    const onSuccess = vi.fn();

    render(<PhoneOtpFlow mode="login" onVerify={onVerify} onSuccess={onSuccess} />);
    fireEvent.change(screen.getByRole('textbox', { name: 'Số điện thoại' }), {
      target: { value: '0912345678' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Gửi mã OTP' }));
    fireEvent.change(await screen.findByRole('textbox', { name: 'Mã OTP' }), {
      target: { value: '012345' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Xác minh và đăng nhập' }));

    await waitFor(() => expect(onVerify).toHaveBeenCalledWith(CHALLENGE.challengeToken, '012345'));
    expect(onSuccess).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['OTP_INVALID', 'Mã OTP không đúng. Vui lòng kiểm tra và thử lại.'],
    ['OTP_EXPIRED', 'Mã OTP đã hết hạn. Vui lòng gửi mã mới.'],
    ['OTP_ATTEMPTS_EXCEEDED', 'Bạn đã nhập sai quá số lần cho phép. Vui lòng gửi mã mới.'],
    ['PHONE_RATE_LIMITED', 'Bạn thao tác quá nhiều lần. Vui lòng chờ rồi thử lại.'],
    ['OTP_DELIVERY_UNAVAILABLE', 'Chưa thể gửi mã OTP lúc này. Vui lòng thử lại sau.'],
    ['PHONE_IDENTITY_CONFLICT', 'Số điện thoại này không thể liên kết với tài khoản hiện tại.'],
  ])('shows safe Vietnamese guidance for %s', async (code, expectedMessage) => {
    vi.mocked(requestPhoneLoginOtp).mockResolvedValue(CHALLENGE);
    const onVerify = vi.fn().mockRejectedValue(apiFailure(code, 'Unsafe provider detail'));

    render(<PhoneOtpFlow mode="login" onVerify={onVerify} />);
    fireEvent.change(screen.getByRole('textbox', { name: 'Số điện thoại' }), {
      target: { value: '0912345678' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Gửi mã OTP' }));
    fireEvent.change(await screen.findByRole('textbox', { name: 'Mã OTP' }), {
      target: { value: '999999' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Xác minh và đăng nhập' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(expectedMessage);
    expect(screen.queryByText('Unsafe provider detail')).not.toBeInTheDocument();
  });

  it('shows a safe provider error when requesting the challenge fails', async () => {
    vi.mocked(requestPhoneLoginOtp).mockRejectedValue(
      apiFailure('OTP_DELIVERY_UNAVAILABLE', 'Twilio private response'),
    );

    render(<PhoneOtpFlow mode="login" onVerify={vi.fn()} />);
    fireEvent.change(screen.getByRole('textbox', { name: 'Số điện thoại' }), {
      target: { value: '0912345678' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Gửi mã OTP' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Chưa thể gửi mã OTP lúc này. Vui lòng thử lại sau.',
    );
    expect(screen.queryByText('Twilio private response')).not.toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Số điện thoại' })).toBeEnabled();
  });

  it('enforces Retry-After before allowing another OTP request', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-13T10:00:00.000Z'));
    vi.mocked(requestPhoneLoginOtp).mockRejectedValue(
      apiFailure('PHONE_RATE_LIMITED', 'Unsafe detail', '3'),
    );

    render(<PhoneOtpFlow mode="login" onVerify={vi.fn()} />);
    fireEvent.change(screen.getByRole('textbox', { name: 'Số điện thoại' }), {
      target: { value: '0912345678' },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Gửi mã OTP' }));
      await Promise.resolve();
    });

    expect(screen.getByRole('button', { name: 'Thử lại sau 3 giây' })).toBeDisabled();
    await act(async () => vi.advanceTimersByTime(3_000));
    expect(screen.getByRole('button', { name: 'Gửi mã OTP' })).toBeEnabled();
    vi.useRealTimers();
  });

  it('enforces Retry-After before another verify or resend attempt', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-13T10:00:00.000Z'));
    vi.mocked(requestPhoneLoginOtp).mockResolvedValue({
      ...CHALLENGE,
      resendAvailableAt: '2026-08-13T10:00:00.000Z',
    });
    const onVerify = vi.fn().mockRejectedValue(
      apiFailure('PHONE_RATE_LIMITED', 'Unsafe detail', '4'),
    );

    render(<PhoneOtpFlow mode="login" onVerify={onVerify} />);
    fireEvent.change(screen.getByRole('textbox', { name: 'Số điện thoại' }), {
      target: { value: '0912345678' },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Gửi mã OTP' }));
      await Promise.resolve();
    });
    fireEvent.change(screen.getByRole('textbox', { name: 'Mã OTP' }), {
      target: { value: '123456' },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Xác minh và đăng nhập' }));
      await Promise.resolve();
    });

    expect(screen.getByRole('button', { name: 'Thử xác minh lại sau 4 giây' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Gửi lại sau 4 giây' })).toBeDisabled();
    await act(async () => vi.advanceTimersByTime(4_000));
    expect(screen.getByRole('button', { name: 'Xác minh và đăng nhập' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Gửi lại mã' })).toBeEnabled();
    vi.useRealTimers();
  });

  it('keeps Retry-After active after a resend failure and changing phone', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-13T10:00:00.000Z'));
    vi.mocked(requestPhoneLoginOtp)
      .mockResolvedValueOnce({
        ...CHALLENGE,
        resendAvailableAt: '2026-08-13T10:00:00.000Z',
      })
      .mockRejectedValueOnce(apiFailure('PHONE_RATE_LIMITED', 'Unsafe detail', '3'));

    render(<PhoneOtpFlow mode="login" onVerify={vi.fn()} />);
    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: '0912345678' },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Gửi mã OTP' }));
      await Promise.resolve();
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Gửi lại mã' }));
      await Promise.resolve();
    });
    fireEvent.click(screen.getByRole('button', { name: 'Đổi số điện thoại' }));

    const requestButton = screen.getByRole('button', { name: 'Thử lại sau 3 giây' });
    expect(requestButton).toBeDisabled();
    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: '0987654321' },
    });
    fireEvent.click(requestButton);
    expect(requestPhoneLoginOtp).toHaveBeenCalledTimes(2);

    await act(async () => vi.advanceTimersByTime(3_000));
    expect(screen.getByRole('button', { name: 'Gửi mã OTP' })).toBeEnabled();
    vi.useRealTimers();
  });

  it('counts down from the server resend timestamp and resends when available', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-13T10:00:00.000Z'));
    vi.mocked(requestPhoneLoginOtp)
      .mockResolvedValueOnce(CHALLENGE)
      .mockResolvedValueOnce({
        ...CHALLENGE,
        challengeToken: 'b'.repeat(43),
        resendAvailableAt: '2026-08-13T10:02:01.000Z',
      });

    render(<PhoneOtpFlow mode="login" onVerify={vi.fn()} />);
    fireEvent.change(screen.getByRole('textbox', { name: 'Số điện thoại' }), {
      target: { value: '0912345678' },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Gửi mã OTP' }));
      await Promise.resolve();
    });

    expect(screen.getByRole('button', { name: 'Gửi lại sau 60 giây' })).toBeDisabled();
    await act(async () => vi.advanceTimersByTime(60_000));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Gửi lại mã' }));
      await Promise.resolve();
    });

    expect(requestPhoneLoginOtp).toHaveBeenCalledTimes(2);
    expect(screen.getByRole('button', { name: 'Gửi lại sau 61 giây' })).toBeDisabled();
    vi.useRealTimers();
  });

  it('can change the phone number and clears the previous challenge', async () => {
    vi.mocked(requestPhoneLoginOtp).mockResolvedValue(CHALLENGE);
    render(<PhoneOtpFlow mode="login" onVerify={vi.fn()} />);

    fireEvent.change(screen.getByRole('textbox', { name: 'Số điện thoại' }), {
      target: { value: '0912345678' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Gửi mã OTP' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Đổi số điện thoại' }));

    expect(screen.getByRole('textbox', { name: 'Số điện thoại' })).toHaveValue('0912345678');
    expect(screen.queryByRole('textbox', { name: 'Mã OTP' })).not.toBeInTheDocument();
  });

  it('disables duplicate submission while a request is pending', async () => {
    let resolveRequest!: (value: typeof CHALLENGE) => void;
    vi.mocked(requestPhoneLoginOtp).mockReturnValue(new Promise((resolve) => {
      resolveRequest = resolve;
    }));

    render(<PhoneOtpFlow mode="login" onVerify={vi.fn()} />);
    fireEvent.change(screen.getByRole('textbox', { name: 'Số điện thoại' }), {
      target: { value: '0912345678' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Gửi mã OTP' }));

    expect(screen.getByRole('button', { name: 'Đang gửi mã...' })).toBeDisabled();
    resolveRequest(CHALLENGE);
    expect(await screen.findByRole('heading', { name: 'Nhập mã xác minh' })).toBeInTheDocument();
  });
});

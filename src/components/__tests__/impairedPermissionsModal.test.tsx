import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { ImpairedPermissionsModal } from '../permissions/ImpairedPermissionsModal';
import { readDevicePermissions } from '../../modules/permissions/devicePermissions';

describe('ImpairedPermissionsModal', () => {
  const stopTrack = vi.fn();
  const getUserMediaMock = vi.fn();
  const getCurrentPositionMock = vi.fn();
  const permissionsQueryMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    stopTrack.mockReset();

    getUserMediaMock.mockResolvedValue({
      getTracks: () => [{ stop: stopTrack }],
    });

    getCurrentPositionMock.mockImplementation((success: PositionCallback) => {
      success({
        coords: { latitude: 10.77, longitude: 106.7, accuracy: 10 },
        timestamp: Date.now(),
      } as GeolocationPosition);
    });

    permissionsQueryMock.mockResolvedValue({ state: 'prompt' });

    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: getUserMediaMock },
    });

    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: { getCurrentPosition: getCurrentPositionMock },
    });

    Object.defineProperty(navigator, 'permissions', {
      configurable: true,
      value: { query: permissionsQueryMock },
    });
  });

  it('renders interactive ON/OFF switches for camera, microphone, and geolocation', async () => {
    render(<ImpairedPermissionsModal isOpen onClose={vi.fn()} />);

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: /Quyền Camera/i })).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: /Quyền Micro/i })).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: /Quyền Vị trí \(GPS\)/i })).toBeInTheDocument();

    await waitFor(() => {
      expect(permissionsQueryMock).toHaveBeenCalledTimes(3);
    });
  });

  it('allows manually toggling settings OFF and ON even when browser permission is already granted', async () => {
    permissionsQueryMock.mockResolvedValue({ state: 'granted' });
    const onCameraToggle = vi.fn();
    const onClose = vi.fn();

    render(
      <ImpairedPermissionsModal
        isOpen
        userId="u1"
        cameraEnabled
        onCameraToggle={onCameraToggle}
        onClose={onClose}
      />
    );

    const cameraSwitch = screen.getByRole('switch', { name: /Quyền Camera/i });
    const micSwitch = screen.getByRole('switch', { name: /Quyền Micro/i });
    const gpsSwitch = screen.getByRole('switch', { name: /Quyền Vị trí \(GPS\)/i });

    await waitFor(() => {
      expect(screen.getAllByText('Trình duyệt: Đã cấp')).toHaveLength(3);
    });

    // Manually turn OFF Camera and Micro
    fireEvent.click(cameraSwitch);
    expect(cameraSwitch).toHaveAttribute('aria-checked', 'false');
    expect(onCameraToggle).toHaveBeenCalledWith(false);

    fireEvent.click(micSwitch);
    expect(micSwitch).toHaveAttribute('aria-checked', 'false');

    // Manually turn Camera back ON (no extra browser prompt needed since granted)
    fireEvent.click(cameraSwitch);
    expect(cameraSwitch).toHaveAttribute('aria-checked', 'true');
    expect(onCameraToggle).toHaveBeenLastCalledWith(true);

    // Turn GPS OFF and save
    fireEvent.click(gpsSwitch);
    fireEvent.click(screen.getByRole('button', { name: /Lưu & Tiếp tục/i }));

    await waitFor(() => {
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    expect(readDevicePermissions('u1')).toEqual({
      camera: true,
      microphone: false,
      geolocation: false,
    });
  });

  it('requests camera, microphone, and geolocation sequentially on confirm when enabled and prompt', async () => {
    const onClose = vi.fn();
    render(<ImpairedPermissionsModal isOpen userId="u2" onClose={onClose} />);

    fireEvent.click(screen.getByRole('button', { name: /Cấp quyền & Tiếp tục/i }));

    await waitFor(() => {
      expect(getUserMediaMock).toHaveBeenCalledWith({ video: true });
      expect(getUserMediaMock).toHaveBeenCalledWith({ audio: true });
      expect(getCurrentPositionMock).toHaveBeenCalledTimes(1);
      expect(stopTrack).toHaveBeenCalledTimes(2);
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  it('shows blocked guidance and switches item OFF when browser permission is denied', async () => {
    const onClose = vi.fn();
    getUserMediaMock.mockRejectedValueOnce({ name: 'NotAllowedError' });

    render(<ImpairedPermissionsModal isOpen userId="u3" onClose={onClose} />);

    fireEvent.click(screen.getByRole('button', { name: /Cấp quyền & Tiếp tục/i }));

    await waitFor(() => {
      expect(screen.getByText('Trình duyệt: Đã chặn')).toBeInTheDocument();
      expect(
        screen.getByText(/Một số quyền đã bị chặn trên trình duyệt/i)
      ).toBeInTheDocument();
    });
    expect(screen.getByRole('switch', { name: /Quyền Camera/i })).toHaveAttribute(
      'aria-checked',
      'false'
    );
    expect(onClose).not.toHaveBeenCalled();
  });

  it('allows dismissing the modal with "Để sau"', () => {
    const onClose = vi.fn();
    render(<ImpairedPermissionsModal isOpen onClose={onClose} />);

    fireEvent.click(screen.getByRole('button', { name: /Để sau/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

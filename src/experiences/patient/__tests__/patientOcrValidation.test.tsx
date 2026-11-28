import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import express from 'express';
import { validateAndNormalizeOcrPayload } from '../../../../server/patientOcrValidation';
import { createPatientRouter } from '../../../../server/patientBackend';
import * as patientService from '../../../services/patientService';
import { InvalidMedicalImageError } from '../../../services/patientService';
import { PatientScanPage } from '../pages/PatientScanPage';
import { supabase } from '../../../lib/supabase';

vi.mock('../../../modules/eye-control/useEyeTracking', () => ({
  useEyeTrackingSettings: () => ({
    settings: {
      eyeControlEnabled: false,
      dwellTimeMs: 1500,
      soundFeedback: false,
      simulatorMode: false,
      speakerEnabled: true,
      speechVolume: 1,
      speechRate: 1,
    },
    setEyeControlEnabled: vi.fn(),
  }),
}));

vi.mock('../../../modules/eye-control/EyeNavigationProvider', () => ({
  useEyeNavigationContext: () => ({
    activeFocusId: null,
    registerFocusNode: vi.fn(),
    unregisterFocusNode: vi.fn(),
    setFocusId: vi.fn(),
  }),
}));

describe('Patient Vision OCR Strict Validation (UNKNOWN override + Invalid Image UI)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('validateAndNormalizeOcrPayload forces UNKNOWN and clears results for non-medical images (e.g. human face)', () => {
    // 1. Explicit Vision rejection for human face
    const faceRejected = validateAndNormalizeOcrPayload({
      documentStatus: 'UNKNOWN',
      isValidMedicalDocument: false,
      detectedSubject: 'Ảnh khuôn mặt con người',
      results: [{ testCode: 'FACE', testName: 'Face', value: 1 }],
    });
    expect(faceRejected.valid).toBe(false);
    expect(faceRejected.documentStatus).toBe('UNKNOWN');
    expect(faceRejected.status).toBe('UNKNOWN');
    expect(faceRejected.isValidMedicalDocument).toBe(false);
    expect(faceRejected.results).toEqual([]);
    expect(faceRejected.error).toContain('Hình ảnh không hợp lệ');

    // 2. Model returned non-VALID status or detectedSubject indicating face without setting UNKNOWN
    const implicitFaceRejected = validateAndNormalizeOcrPayload({
      detectedSubject: 'Ảnh khuôn mặt con người (chân dung)',
      results: [{ testCode: 'SKIN', testName: 'Da', value: 'Bình thường' }],
    });
    expect(implicitFaceRejected.valid).toBe(false);
    expect(implicitFaceRejected.documentStatus).toBe('UNKNOWN');
    expect(implicitFaceRejected.results).toEqual([]);

    // 3. Model returned only placeholder/invalid rows
    const placeholderRejected = validateAndNormalizeOcrPayload({
      documentStatus: 'VALID',
      isValidMedicalDocument: true,
      results: [{ testCode: 'UNKNOWN', testName: 'N/A', value: 'UNKNOWN' }],
    });
    expect(placeholderRejected.valid).toBe(false);
    expect(placeholderRejected.documentStatus).toBe('UNKNOWN');
    expect(placeholderRejected.results).toEqual([]);

    // 4. Valid medical lab report (including qualitative blood group with flag UNKNOWN)
    const validLab = validateAndNormalizeOcrPayload({
      documentStatus: 'VALID',
      isValidMedicalDocument: true,
      detectedSubject: 'Phiếu kết quả xét nghiệm huyết học',
      hospitalOrLabName: 'Bệnh viện Bạch Mai',
      results: [
        {
          testCode: 'GLUCOSE',
          testName: 'Đường huyết',
          value: 5.4,
          valueType: 'NUMERIC',
          unit: 'mmol/L',
          referenceRange: { low: 3.9, high: 6.1, text: '3.9 - 6.1' },
          ocrConfidence: 0.96,
          isUncertain: false,
          flag: 'NORMAL',
        },
        {
          testCode: 'BLOOD_GROUP',
          testName: 'Nhóm máu ABO',
          value: 'O',
          valueType: 'QUALITATIVE',
          unit: '',
          referenceRange: { low: null, high: null, text: null },
          ocrConfidence: 0.95,
          isUncertain: false,
          flag: 'UNKNOWN',
        },
      ],
    });
    expect(validLab.valid).toBe(true);
    expect(validLab.documentStatus).toBe('VALID');
    expect(validLab.results).toHaveLength(2);
    expect(validLab.hospitalOrLabName).toBe('Bệnh viện Bạch Mai');
  });

  it('Express /api/patient/ocr returns 422 with documentStatus UNKNOWN when Vision detects a human face', async () => {
    const generateContent = vi.fn(async () => ({
      text: JSON.stringify({
        documentStatus: 'UNKNOWN',
        isValidMedicalDocument: false,
        detectedSubject: 'Ảnh khuôn mặt con người',
        hospitalOrLabName: null,
        patientName: null,
        sampleDate: null,
        results: [],
      }),
    }));

    const mockAi = { models: { generateContent } } as any;
    const mockVerify = vi.fn(async () => ({
      ok: true as const,
      status: 200 as const,
      identity: {
        userId: 'pat-val-1',
        email: 'pat@eyetalk.vn',
        accountType: 'patient' as const,
        roleVerified: true,
        requiresRoleReview: false,
        displayName: 'Bệnh nhân Test',
        aal: 'aal2' as const,
        hasVerifiedMfa: true,
        mfaRequired: true,
      },
    }));

    const app = express();
    app.use(express.json({ limit: '5mb' }));
    app.use('/api/patient', createPatientRouter(mockAi, 'srv-key', mockVerify));

    const server = await new Promise<ReturnType<typeof app.listen>>((resolve) => {
      const s = app.listen(0, '127.0.0.1', () => resolve(s));
    });

    try {
      const addr = server.address() as any;
      const res = await fetch(`http://127.0.0.1:${addr.port}/api/patient/ocr`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer tok' },
        body: JSON.stringify({
          fileBase64: 'data:image/jpeg;base64,/9j/4AAQ',
          mimeType: 'image/jpeg',
          fileName: 'selfie.jpg',
        }),
      });

      expect(res.status).toBe(422);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.documentStatus).toBe('UNKNOWN');
      expect(json.status).toBe('UNKNOWN');
      expect(json.isValidMedicalDocument).toBe(false);
      expect(json.detectedSubject).toBe('Ảnh khuôn mặt con người');
      expect(json.results).toEqual([]);
      expect(json.error).toContain('Hình ảnh không hợp lệ');
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('patientService.scanOcr throws InvalidMedicalImageError (UNKNOWN) and skips history persistence on 422', async () => {
    vi.spyOn(supabase.auth, 'getSession').mockResolvedValue({
      data: { session: { access_token: 'tok-pat', user: { id: 'pat-cli-val' } } },
      error: null,
    } as any);
    vi.spyOn(supabase.auth, 'getUser').mockResolvedValue({
      data: { user: { id: 'pat-cli-val' } },
      error: null,
    } as any);

    const origImage = globalThis.Image;
    class ImmediateErrorImage {
      onerror: ((err?: any) => void) | null = null;
      onload: (() => void) | null = null;
      set src(_v: string) {
        setTimeout(() => this.onerror?.(new Error('skip resize in jsdom')), 0);
      }
    }
    vi.stubGlobal('Image', ImmediateErrorImage as any);

    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            success: false,
            documentStatus: 'UNKNOWN',
            status: 'UNKNOWN',
            isValidMedicalDocument: false,
            detectedSubject: 'Ảnh khuôn mặt con người',
            results: [],
            errorCode: 'INVALID_MEDICAL_IMAGE',
            error: 'Hình ảnh không hợp lệ. Ảnh tải lên không phải phiếu khám bệnh.',
          }),
          { status: 422, headers: { 'Content-Type': 'application/json' } }
        )
      )
    );

    const faceFile = new File([new Uint8Array([1, 2, 3])], 'face.jpg', { type: 'image/jpeg' });
    let caught: unknown = null;
    try {
      await patientService.scanOcr(faceFile);
    } catch (err) {
      caught = err;
    } finally {
      vi.stubGlobal('Image', origImage);
    }

    expect(caught).toBeInstanceOf(InvalidMedicalImageError);
    const typedErr = caught as InvalidMedicalImageError;
    expect(typedErr.documentStatus).toBe('UNKNOWN');
    expect(typedErr.detectedSubject).toBe('Ảnh khuôn mặt con người');
    expect(typedErr.message).toContain('Hình ảnh không hợp lệ');
    expect(localStorage.getItem('eyetalk_patient_v2_pat-cli-val_reports')).toBeNull();
  });

  it('PatientScanPage displays UNKNOWN badge and "Hình ảnh không hợp lệ" when an invalid image is uploaded', async () => {
    const scanSpy = vi
      .spyOn(patientService, 'scanOcr')
      .mockRejectedValueOnce(
        new InvalidMedicalImageError(
          'Hình ảnh không hợp lệ. Ảnh tải lên không phải phiếu khám bệnh hoặc không chứa chỉ số xét nghiệm y khoa.',
          'Ảnh khuôn mặt con người'
        )
      );
    const onScanComplete = vi.fn();

    const { container } = render(
      <PatientScanPage onBack={vi.fn()} onScanComplete={onScanComplete} />
    );

    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    expect(fileInput).not.toBeNull();

    const faceFile = new File([new Uint8Array([1, 2, 3])], 'portrait.jpg', { type: 'image/jpeg' });
    fireEvent.change(fileInput, { target: { files: [faceFile] } });

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });

    const alert = screen.getByRole('alert');
    expect(alert).toHaveAttribute('data-validation-status', 'UNKNOWN');
    expect(alert.textContent).toContain('Hình ảnh không hợp lệ');
    expect(alert.textContent).toContain('UNKNOWN');
    expect(alert.textContent).toContain('Ảnh khuôn mặt con người');
    expect(scanSpy).toHaveBeenCalledTimes(1);
    expect(onScanComplete).not.toHaveBeenCalled();
  });
});

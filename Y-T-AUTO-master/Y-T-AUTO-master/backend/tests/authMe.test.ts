import type { Response } from 'express';
import { beforeEach, expect, it, jest } from '@jest/globals';
import type { AuthedRequest } from '../src/middleware/auth';

const authRepository = {
  getProfile: jest.fn(),
};
const phoneStatus = {
  getPhoneAccountStatus: jest.fn(),
};
const phoneRuntime = {
  getPhoneAuthRuntime: jest.fn(),
};

jest.mock('../src/repositories/authRepository', () => authRepository);
jest.mock('../src/repositories/phoneAuthRepository', () => phoneStatus);
jest.mock('../src/services/phone/phoneAuthRuntime', () => phoneRuntime);

import { getMe } from '../src/controllers/authController';

type MockResponse = Response & {
  status: jest.Mock;
  json: jest.Mock;
  set: jest.Mock;
};

function response(): MockResponse {
  const res = {} as MockResponse;
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  res.set = jest.fn(() => res);
  return res;
}

beforeEach(() => {
  authRepository.getProfile.mockReset();
  phoneStatus.getPhoneAccountStatus.mockReset();
  phoneRuntime.getPhoneAuthRuntime.mockReset();
});

it('returns profile and phone status without constructing the SMS runtime', async () => {
  authRepository.getProfile.mockResolvedValue(null);
  phoneStatus.getPhoneAccountStatus.mockResolvedValue({
    phoneVerified: false,
    maskedPhone: null,
  });
  const res = response();

  await getMe({ userId: 'authenticated-user' } as AuthedRequest, res);

  expect(authRepository.getProfile).toHaveBeenCalledWith('authenticated-user');
  expect(phoneStatus.getPhoneAccountStatus).toHaveBeenCalledWith('authenticated-user');
  expect(phoneRuntime.getPhoneAuthRuntime).not.toHaveBeenCalled();
  expect(res.set).toHaveBeenCalledWith('Cache-Control', 'no-store');
  expect(res.json).toHaveBeenCalledWith({
    success: true,
    data: {
      userId: 'authenticated-user',
      hasProfile: false,
      profile: null,
      phone: { phoneVerified: false, maskedPhone: null },
    },
    error: null,
  });
});

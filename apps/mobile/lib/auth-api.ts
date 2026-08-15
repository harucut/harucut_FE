import { apiEnvelopeData, apiRequest } from '@/lib/api-client';

export type UserStatus = 'ACTIVE' | 'DELETED' | 'DELETED_REQUESTED' | 'BLOCKED';

type LoginResponse = {
  userStatus: UserStatus;
};

type AuthStatusResponse = {
  userStatus: UserStatus;
};

type PasswordResetVerificationResponse = {
  resetToken: string;
};

export async function loginWithEmail(email: string, password: string) {
  return apiEnvelopeData<LoginResponse>(
    '/api/harucut/login',
    {
      body: { email, password },
      method: 'POST',
    },
  );
}

export async function getAuthStatus() {
  return apiEnvelopeData<AuthStatusResponse>(
    '/api/auth/status',
    {
      cache: 'no-store',
    },
  );
}

export async function signupWithEmail(args: {
  email: string;
  password: string;
  username: string;
}) {
  await apiRequest(
    '/api/harucut/register',
    {
      body: args,
      method: 'POST',
    },
  );
}

export async function sendEmailAuthCode(email: string) {
  await apiRequest(
    '/api/email-auth/code',
    {
      body: { email },
      method: 'POST',
    },
  );
}

export async function verifyEmailAuthCode(email: string, code: string) {
  await apiRequest(
    '/api/email-auth/verification',
    {
      body: { email, code },
      method: 'POST',
    },
  );
}

export async function requestPasswordResetCode(email: string) {
  // 회원가입용(/api/email-auth/code)이 아닌 비밀번호 재설정 전용 코드 발송 엔드포인트.
  await apiRequest(
    '/api/harucut/reset/password/code',
    {
      body: { email },
      method: 'POST',
    },
  );
}

export async function verifyPasswordResetCode(email: string, code: string) {
  const data = await apiEnvelopeData<PasswordResetVerificationResponse>(
    '/api/harucut/reset/password/verification',
    {
      body: { email, code },
      method: 'POST',
    },
  );

  if (!data?.resetToken) {
    throw new Error('비밀번호 재설정 토큰을 받지 못했어요.');
  }

  return data.resetToken;
}

export async function resetPassword(resetToken: string, newPassword: string) {
  await apiRequest(
    '/api/harucut/reset/password',
    {
      body: { newPassword, resetToken },
      method: 'PATCH',
    },
  );
}

export async function changePassword(oldPassword: string, newPassword: string) {
  await apiRequest(
    '/api/harucut/change/password',
    {
      body: { newPassword, oldPassword },
      method: 'PATCH',
    },
  );
}

export async function logout() {
  await apiRequest(
    '/api/harucut/logout',
    {
      method: 'DELETE',
    },
  );
}

export async function exitAccount() {
  await apiRequest(
    '/api/harucut/exit',
    {
      method: 'DELETE',
    },
  );
}

export async function reactivateAccount() {
  await apiRequest(
    '/api/harucut/reactivate',
    {
      method: 'POST',
    },
  );
}

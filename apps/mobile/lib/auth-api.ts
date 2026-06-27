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
    {
      direct: '/api/harucut/login',
      proxy: '/api/client/auth/login',
    },
    {
      body: { email, password },
      method: 'POST',
    },
  );
}

export async function getAuthStatus() {
  return apiEnvelopeData<AuthStatusResponse>(
    {
      direct: '/api/auth/status',
      proxy: '/api/auth/status',
    },
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
    {
      direct: '/api/harucut/register',
      proxy: '/api/client/auth/register',
    },
    {
      body: args,
      method: 'POST',
    },
  );
}

export async function sendEmailAuthCode(email: string) {
  await apiRequest(
    {
      direct: '/api/email-auth/code',
      proxy: '/api/client/auth/email/code',
    },
    {
      body: { email },
      method: 'POST',
    },
  );
}

export async function verifyEmailAuthCode(email: string, code: string) {
  await apiRequest(
    {
      direct: '/api/email-auth/verification',
      proxy: '/api/client/auth/email/verification',
    },
    {
      body: { email, code },
      method: 'POST',
    },
  );
}

export async function requestPasswordResetCode(email: string) {
  // 회원가입용(/api/email-auth/code)이 아닌 비밀번호 재설정 전용 코드 발송 엔드포인트.
  await apiRequest(
    {
      direct: '/api/harucut/reset/password/code',
      proxy: '/api/client/auth/password/reset/code',
    },
    {
      body: { email },
      method: 'POST',
    },
  );
}

export async function verifyPasswordResetCode(email: string, code: string) {
  const data = await apiEnvelopeData<PasswordResetVerificationResponse>(
    {
      direct: '/api/harucut/reset/password/verification',
      proxy: '/api/client/auth/password/reset/verification',
    },
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
    {
      direct: '/api/harucut/reset/password',
      proxy: '/api/client/auth/password/reset',
    },
    {
      body: { newPassword, resetToken },
      method: 'PATCH',
    },
  );
}

export async function changePassword(oldPassword: string, newPassword: string) {
  await apiRequest(
    {
      direct: '/api/harucut/change/password',
      proxy: '/api/client/auth/password/change',
    },
    {
      body: { newPassword, oldPassword },
      method: 'PATCH',
    },
  );
}

export async function logout() {
  await apiRequest(
    {
      direct: '/api/harucut/logout',
      proxy: '/api/client/logout',
    },
    {
      method: 'DELETE',
    },
  );
}

export async function exitAccount() {
  await apiRequest(
    {
      direct: '/api/harucut/exit',
      proxy: '/api/client/exit',
    },
    {
      method: 'DELETE',
    },
  );
}

export async function reactivateAccount() {
  await apiRequest(
    {
      direct: '/api/harucut/reactivate',
      proxy: '/api/client/reactivate',
    },
    {
      method: 'POST',
    },
  );
}

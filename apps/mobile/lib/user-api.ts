import type { UserProfile } from '@/constants/harucut-data';
import { apiEnvelopeData, apiRequest } from '@/lib/api-client';

type RemoteUserInfo = {
  email: string;
  id: number;
  loginPlatform?: string | null;
  monthlyPrice?: number | null;
  planTier?: string | null;
  profileUrl?: string | null;
  username: string;
};

export function toUserProfile(user: RemoteUserInfo): UserProfile {
  return {
    email: user.email,
    loginPlatform: user.loginPlatform ?? 'HARUCUT',
    monthlyPrice: user.monthlyPrice ?? null,
    planTier: user.planTier ?? 'BASIC',
    profileUrl: user.profileUrl ?? null,
    username: user.username,
  };
}

export async function getMyUserProfile() {
  const user = await apiEnvelopeData<RemoteUserInfo>(
    '/api/auth/user/info',
    {
      cache: 'no-store',
    },
  );

  return toUserProfile(user);
}

export async function updateUsername(username: string) {
  const nextUsername = username.trim();

  if (!nextUsername) {
    throw new Error('닉네임을 입력해 주세요.');
  }

  await apiRequest(`/api/auth/user/change/username?username=${encodeURIComponent(nextUsername)}`, {
    method: 'PATCH',
  });
}

export async function updateProfileImage(s3Key: string) {
  await apiRequest(
    '/api/auth/user/change/profile-image',
    {
      body: { s3Key },
      method: 'PATCH',
    },
  );
}

// GET /api/auth/user/subscription/usage 응답.
// *Limit/*RemainingCount 가 -1 이거나 *Unlimited === true 이면 무제한.
export type SubscriptionUsage = {
  planTier: string;
  frameRetentionLimit: number;
  frameRetentionUsedCount: number;
  frameRetentionRemainingCount: number;
  frameRetentionUnlimited: boolean;
  // 아래 두 필드는 월 단위 한도(폐기된 영상 변환)의 결제 주기 값이다.
  // 서버는 여전히 내려주지만 앱은 쓰지 않는다 — 계약 문서용으로만 남긴다.
  currentCycleStartAt: string;
  currentCycleEndAt: string;
};

export async function getSubscriptionUsage() {
  return apiEnvelopeData<SubscriptionUsage>(
    '/api/auth/user/subscription/usage',
    {
      cache: 'no-store',
    },
  );
}

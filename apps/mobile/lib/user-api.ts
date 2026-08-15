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

// GET /api/auth/user/subscription/usage 응답(스웨거 SubscriptionUsageResponse, 5개 필드 전부 required).
// *Limit/*RemainingCount 가 -1 이거나 *Unlimited === true 이면 무제한.
// 결제 주기 정보는 이 응답에 없다. 필요해지면 GET /api/auth/subscriptions 의
// SubscriptionResponse.currentPeriodStart / currentPeriodEnd 를 써야 한다.
export type SubscriptionUsage = {
  planTier: string;
  frameRetentionLimit: number;
  frameRetentionUsedCount: number;
  frameRetentionRemainingCount: number;
  frameRetentionUnlimited: boolean;
};

export async function getSubscriptionUsage() {
  return apiEnvelopeData<SubscriptionUsage>(
    '/api/auth/user/subscription/usage',
    {
      cache: 'no-store',
    },
  );
}

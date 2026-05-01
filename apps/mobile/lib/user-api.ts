import type { UserProfile } from '@/constants/harucut-data';
import { apiEnvelopeData, apiRequest, isUsingWebProxy } from '@/lib/api-client';

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
    {
      direct: '/api/auth/user/info',
      proxy: '/api/client/user-info',
    },
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

  if (isUsingWebProxy()) {
    await apiRequest(
      {
        direct: '/api/auth/user/change/username',
        proxy: '/api/client/user/username',
      },
      {
        body: { username: nextUsername },
        method: 'PATCH',
      },
    );
    return;
  }

  await apiRequest(`/api/auth/user/change/username?username=${encodeURIComponent(nextUsername)}`, {
    method: 'PATCH',
  });
}

export async function updateProfileImage(s3Key: string) {
  await apiRequest(
    {
      direct: '/api/auth/user/change/profile-image',
      proxy: '/api/client/user/change/profile-image',
    },
    {
      body: { s3Key },
      method: 'PATCH',
    },
  );
}

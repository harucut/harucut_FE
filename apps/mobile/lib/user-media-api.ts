import type { FrameId, HistoryItem, MediaAsset } from '@/constants/harucut-data';
import { apiEnvelopeData, apiRequest } from '@/lib/api-client';
import {
  fourcutUploadType,
  resolveUploadContentType,
  uploadLocalFileWithPresigned,
} from '@/lib/file-storage-api';

export type UserMediaType = 'PHOTO' | 'VIDEO';

export type UserMedia = {
  createdAt?: string;
  displayName?: string | null;
  displayname?: string | null;
  downloadUrl?: string;
  mediaId: number;
  mediaType: UserMediaType;
  originalFileName?: string;
  originalS3Key?: string;
  s3Key: string;
  transcodeJobId?: string;
};

type HistoryItemOptions = {
  frameId?: FrameId;
  source?: HistoryItem['source'];
  title?: string;
};

function getUserMediaTitle(item: UserMedia) {
  const preferredName = item.displayName?.trim() || item.displayname?.trim();
  if (preferredName) return preferredName;

  const originalName = item.originalFileName?.trim();
  if (originalName) return originalName.replace(/\.[^.]+$/, '');

  return item.s3Key.split('/').pop()?.replace(/\.[^.]+$/, '') || '저장한 기록';
}

function getCreatedAt(item: UserMedia) {
  const createdAt = item.createdAt ? new Date(item.createdAt) : null;

  return createdAt && !Number.isNaN(createdAt.getTime()) ? createdAt.toISOString() : '';
}

function normalizeUserMediaTitle(value: string) {
  return value
    .trim()
    .replace(/\.[^.]+$/, '')
    .toLowerCase();
}

function findSameNamePhoto(item: UserMedia, items: UserMedia[]) {
  if (item.mediaType !== 'VIDEO') {
    return null;
  }

  const titleKey = normalizeUserMediaTitle(getUserMediaTitle(item));

  return (
    items.find((candidate) => {
      if (candidate.mediaType !== 'PHOTO') return false;
      if (candidate.mediaId === item.mediaId) return false;

      return normalizeUserMediaTitle(getUserMediaTitle(candidate)) === titleKey;
    }) ?? null
  );
}

function mediaToAsset(item: UserMedia): MediaAsset | null {
  if (!item.downloadUrl) {
    return null;
  }

  return {
    id: `remote-media-${item.mediaId}`,
    kind: item.mediaType === 'VIDEO' ? 'video' : 'image',
    label: getUserMediaTitle(item),
    previewKind: item.mediaType === 'VIDEO' ? 'video' : 'image',
    remoteMediaId: item.mediaId,
    uri: item.downloadUrl,
  };
}

function mediaToPreviewAsset(item: UserMedia, items: UserMedia[]) {
  const matchedPhoto = findSameNamePhoto(item, items);

  if (!matchedPhoto?.downloadUrl) {
    return mediaToAsset(item);
  }

  return {
    id: `remote-media-${item.mediaId}-preview`,
    kind: 'video' as const,
    label: getUserMediaTitle(item),
    previewKind: 'image' as const,
    remoteMediaId: item.mediaId,
    uri: matchedPhoto.downloadUrl,
  };
}

export function mediaToHistoryItem(
  item: UserMedia,
  options: HistoryItemOptions = {},
  items: UserMedia[] = [item],
): HistoryItem {
  const asset = mediaToPreviewAsset(item, items);
  const title = options.title?.trim() || getUserMediaTitle(item);

  return {
    createdAt: getCreatedAt(item),
    frameId: options.frameId ?? 'classic-4',
    id: `remote-history-${item.mediaId}`,
    kind: item.mediaType === 'VIDEO' ? 'video' : 'photo',
    mediaId: item.mediaId,
    previewMedia: asset ? [asset] : [],
    remoteS3Key: item.s3Key,
    source: options.source ?? 'upload',
    title,
  };
}

export async function listMyMedia(type?: UserMediaType) {
  const query = type ? `?type=${encodeURIComponent(type)}` : '';
  const media = await apiEnvelopeData<UserMedia[]>(
    {
      direct: `/api/auth/user/media${query}`,
      proxy: `/api/client/user/media${query}`,
    },
    {
      cache: 'no-store',
    },
  );

  return Array.isArray(media) ? media : [];
}

export async function listRemoteHistoryItems() {
  const media = await listMyMedia();

  return media
    .sort((a, b) => {
      const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;

      return bTime - aTime;
    })
    .map((item) => mediaToHistoryItem(item, {}, media));
}

export async function registerUserMedia(args: {
  displayName?: string;
  mediaType: UserMediaType;
  s3Key: string;
}) {
  return apiEnvelopeData<UserMedia>(
    {
      direct: '/api/auth/user/media',
      proxy: '/api/client/user/media',
    },
    {
      body: args,
      method: 'POST',
    },
  );
}

export async function getMediaDownloadUrl(mediaId: number) {
  return apiEnvelopeData<string>(
    {
      direct: `/api/auth/user/media/${mediaId}/download-url`,
      proxy: `/api/client/user/media/${mediaId}/download-url`,
    },
    {
      cache: 'no-store',
    },
  );
}

export async function updateMediaDisplayName(mediaId: number, displayName: string) {
  return apiEnvelopeData<UserMedia>(
    {
      direct: `/api/auth/user/media/${mediaId}/display-name`,
      proxy: `/api/client/user/media/${mediaId}/display-name`,
    },
    {
      body: { displayName },
      method: 'PATCH',
    },
  );
}

export async function uploadFourcutResult(args: {
  displayName: string;
  frameId: FrameId;
  source: HistoryItem['source'];
  uri: string;
}) {
  const contentType = resolveUploadContentType({
    filename: `${args.displayName}.jpg`,
    uri: args.uri,
  });
  const uploaded = await uploadLocalFileWithPresigned({
    contentType,
    filename: `${args.displayName}.jpg`,
    type: fourcutUploadType(contentType),
    uri: args.uri,
  });
  const media = await registerUserMedia({
    displayName: args.displayName,
    mediaType: uploaded.contentType === 'MOV' || uploaded.contentType === 'MP4' || uploaded.contentType === 'WEBM'
      ? 'VIDEO'
      : 'PHOTO',
    s3Key: uploaded.key,
  });

  return mediaToHistoryItem(media, {
    frameId: args.frameId,
    source: args.source,
    title: args.displayName,
  });
}

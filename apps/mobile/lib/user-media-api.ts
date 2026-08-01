import type { FrameId, HistoryItem, MediaAsset } from '@/constants/harucut-data';
import { apiEnvelopeData } from '@/lib/api-client';
import { resolveUploadContentType, uploadLocalFileWithPresigned } from '@/lib/file-storage-api';

// 서비스는 사진 전용이라 미디어 타입은 PHOTO 하나뿐이다.
export type UserMediaType = 'PHOTO';

export type UserMedia = {
  createdAt?: string;
  displayName?: string | null;
  displayname?: string | null;
  downloadUrl?: string | null;
  mediaId: number;
  mediaType: UserMediaType;
  originalFileName?: string;
  s3Key: string;
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

function mediaToAsset(item: UserMedia): MediaAsset | null {
  if (!item.downloadUrl) {
    return null;
  }

  return {
    id: `remote-media-${item.mediaId}`,
    label: getUserMediaTitle(item),
    uri: item.downloadUrl,
  };
}

export function mediaToHistoryItem(
  item: UserMedia,
  options: HistoryItemOptions = {},
): HistoryItem {
  const asset = mediaToAsset(item);
  const title = options.title?.trim() || getUserMediaTitle(item);

  return {
    createdAt: getCreatedAt(item),
    frameId: options.frameId ?? 'classic-4',
    id: `remote-history-${item.mediaId}`,
    mediaId: item.mediaId,
    previewMedia: asset ? [asset] : [],
    source: options.source ?? 'upload',
    title,
  };
}

export async function listMyMedia() {
  // 백엔드 GET /api/auth/user/media는 page(0부터)/size(기본 10) 기반 페이지네이션이고,
  // data는 페이지 객체({ content, totalPages, number })다. 이전엔 data를 배열로 가정해
  // Array.isArray가 항상 false였고 저장 미디어 목록이 늘 비어 있었다. 모든 페이지를 순회한다.
  const out: UserMedia[] = [];
  let page = 0;
  for (let guard = 0; guard < 100; guard += 1) {
    const query = `?page=${page}&size=100`;
    const data = await apiEnvelopeData<
      | { content?: UserMedia[]; number?: number; totalPages?: number }
      | UserMedia[]
      | null
    >(
      `/api/auth/user/media${query}`,
      {
        cache: 'no-store',
      },
    );

    if (Array.isArray(data)) return data;
    out.push(...(data?.content ?? []));
    const current = data?.number ?? page;
    const totalPages = data?.totalPages ?? current + 1;
    if (current + 1 >= totalPages) break;
    page = current + 1;
  }

  return out;
}

export async function listRemoteHistoryItems() {
  const media = await listMyMedia();

  return media
    .sort((a, b) => {
      const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;

      return bTime - aTime;
    })
    .map((item) => mediaToHistoryItem(item));
}

export async function registerUserMedia(args: {
  displayName?: string;
  mediaType: UserMediaType;
  s3Key: string;
}) {
  return apiEnvelopeData<UserMedia>(
    '/api/auth/user/media',
    {
      body: args,
      method: 'POST',
    },
  );
}

export async function getMediaDownloadUrl(mediaId: number) {
  return apiEnvelopeData<string>(
    `/api/auth/user/media/${mediaId}/download-url`,
    {
      cache: 'no-store',
    },
  );
}

export async function updateMediaDisplayName(mediaId: number, displayName: string) {
  return apiEnvelopeData<UserMedia>(
    `/api/auth/user/media/${mediaId}/display-name`,
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
    type: 'FOURCUT_PHOTO',
    uri: args.uri,
  });
  const media = await registerUserMedia({
    displayName: args.displayName,
    mediaType: 'PHOTO',
    s3Key: uploaded.key,
  });

  return mediaToHistoryItem(media, {
    frameId: args.frameId,
    source: args.source,
    title: args.displayName,
  });
}

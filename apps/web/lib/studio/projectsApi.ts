import type { ApiEnvelope } from "@/lib/api-types";
import { requireData } from "@/lib/apiEnvelope";
import { clientApi } from "@/lib/clientApi";
import type { EventSettings } from "@/lib/studio/studioApi";

/**
 * 프로젝트와 브랜드 기본값 상속(ADR-0009 §2, 백엔드 P3-1).
 *
 * 유효 설정 = 공간 기본값 ⊕ 프로젝트 기본값 ⊕ 행사 설정(경로 단위로 뒤가 이김). 게시할 때 발행본에 굳힌다 —
 * 상위 기본값을 바꿔도 운영 중 행사는 다시 게시하기 전까지 그대로다. 프로젝트는 선택이다.
 */

/** 상속 가능한 행사 설정. 공간·프로젝트 기본값과 행사의 직접 값이 같은 모양이다. 목록은 통째로 대체된다. */
export type BrandDefaults = Pick<
  EventSettings,
  | "timezone"
  | "byodEnabled"
  | "boothEnabled"
  | "resultRetentionDays"
  | "allowedLayouts"
  | "frames"
  | "consentItems"
  | "theme"
>;

/** 상속 가능한 최상위 필드. 행사 PATCH 에서 null 로 보내면 직접 값을 지우고 위 단계 값을 따른다. */
export const INHERITABLE_FIELDS = [
  "timezone",
  "byodEnabled",
  "boothEnabled",
  "resultRetentionDays",
  "allowedLayouts",
  "frames",
  "consentItems",
  "theme",
] as const satisfies ReadonlyArray<keyof BrandDefaults>;

export type Project = {
  projectId: string;
  workspaceId: string;
  name: string;
  archived: boolean;
  brandDefaults?: BrandDefaults | null;
  createdAt: string;
};

export type SettingSource = "WORKSPACE" | "PROJECT" | "EVENT";

/** sources 는 값이 있는 경로(테마는 `theme.colors.bg` 처럼 하위 키까지)마다 출처. 키가 없으면 어디에도 값이 없다. */
export type EffectiveSettings = { settings: EventSettings; sources: Record<string, SettingSource> };

export async function listProjects(workspaceId: string): Promise<Project[]> {
  const res = await clientApi.get<ApiEnvelope<Project[]>>(
    `/api/client/workspaces/${encodeURIComponent(workspaceId)}/projects`,
  );
  return res.data.data ?? [];
}

/** brandDefaults 가 없으면 JSON 에서 빠진다(undefined). */
export async function createProject(workspaceId: string, name: string, brandDefaults?: BrandDefaults): Promise<Project> {
  const res = await clientApi.post<ApiEnvelope<Project>>(
    `/api/client/workspaces/${encodeURIComponent(workspaceId)}/projects`,
    { name, brandDefaults },
  );
  return requireData(res.data, "프로젝트");
}

/** 보낸 것만 바뀐다. brandDefaults 는 키마다 머지 패치(null 이면 그 키를 지운다). */
export async function updateProject(
  projectId: string,
  patch: { name?: string; archived?: boolean; brandDefaults?: Partial<Record<keyof BrandDefaults, unknown>> },
): Promise<Project> {
  const res = await clientApi.patch<ApiEnvelope<Project>>(`/api/client/projects/${encodeURIComponent(projectId)}`, patch);
  return requireData(res.data, "프로젝트");
}

export async function getWorkspaceBrandDefaults(workspaceId: string): Promise<BrandDefaults> {
  const res = await clientApi.get<ApiEnvelope<{ workspaceId: string; brandDefaults?: BrandDefaults | null }>>(
    `/api/client/workspaces/${encodeURIComponent(workspaceId)}/brand-defaults`,
  );
  return requireData(res.data, "공간 기본값").brandDefaults ?? {};
}

/** 본문이 곧 머지 패치 — 보낸 키만 바뀌고 null 이면 그 키를 지운다. */
export async function updateWorkspaceBrandDefaults(
  workspaceId: string,
  patch: Partial<Record<keyof BrandDefaults, unknown>>,
): Promise<BrandDefaults> {
  const res = await clientApi.patch<ApiEnvelope<{ workspaceId: string; brandDefaults?: BrandDefaults | null }>>(
    `/api/client/workspaces/${encodeURIComponent(workspaceId)}/brand-defaults`,
    patch,
  );
  return requireData(res.data, "공간 기본값").brandDefaults ?? {};
}

export async function getEffectiveSettings(eventId: string): Promise<EffectiveSettings> {
  const res = await clientApi.get<ApiEnvelope<EffectiveSettings>>(
    `/api/client/events/${encodeURIComponent(eventId)}/effective-settings`,
  );
  const data = requireData(res.data, "유효 설정");
  return { settings: data.settings ?? {}, sources: data.sources ?? {} };
}

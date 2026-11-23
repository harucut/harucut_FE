import type { PageTheme } from "@/lib/event/pageTheme";
import type { SettingSource } from "@/lib/studio/projectsApi";
import type { EventSettings } from "@/lib/studio/studioApi";

/**
 * Studio 설정 저장 본문(PATCH)을 만든다 — 바뀐 필드만 보낸다(ADR-0009 §2-3).
 *
 * 행사 응답의 settings 는 상속까지 합친 유효값이다. 그걸 통째로 보내면 저장 한 번에 공간·프로젝트에서 받은
 * 값이 행사의 직접 값으로 굳어, 상위 기본값을 바꿔도 이 행사가 따라가지 않는다. 그래서
 *  - 최상위 필드: 저장된 값과 다른 것만 보낸다.
 *  - 「기본값 따르기」를 고른 상속 가능 필드: null(직접 값을 지우고 위 단계 값을 따른다).
 *  - 테마: 객체째 바뀌고 그 안에서 빠진 키는 상속이므로, 행사가 직접 정한 키(출처 EVENT)와 이번에 바꾼 키만 담는다.
 * 출처(sources)를 모르면(옛 서버·권한) 테마는 지금 값 전체를 보낸다 — 예전 동작과 같다.
 */
export function settingsPatch(
  next: EventSettings,
  base: EventSettings,
  options: { sources: Record<string, SettingSource> | null; inherit?: ReadonlySet<keyof EventSettings> } = { sources: null },
): EventSettings {
  const patch: Record<string, unknown> = {};
  for (const key of Object.keys(next) as Array<keyof EventSettings>) {
    if (options.inherit?.has(key)) continue;
    if (key === "theme") continue;
    if (JSON.stringify(next[key] ?? null) !== JSON.stringify(base[key] ?? null)) patch[key] = next[key];
  }
  if (!options.inherit?.has("theme")) {
    const theme = themePatch(next.theme as PageTheme | null, base.theme as PageTheme | null, options.sources);
    if (theme !== undefined) patch.theme = theme;
  }
  for (const key of options.inherit ?? []) patch[key] = null;
  return patch as EventSettings;
}

type Leaves = Record<string, unknown>;

function leavesOf(theme: PageTheme | null | undefined): Leaves {
  const out: Leaves = {};
  if (!theme) return out;
  for (const group of ["colors", "copy", "branding"] as const) {
    const record = theme[group] as Record<string, unknown> | undefined;
    for (const [k, v] of Object.entries(record ?? {})) if (v !== undefined) out[`${group}.${k}`] = v;
  }
  for (const k of ["font", "logoAssetId", "backgroundAssetId"] as const) if (theme[k] !== undefined) out[k] = theme[k];
  return out;
}

function themeOf(leaves: Leaves): PageTheme | null {
  if (Object.keys(leaves).length === 0) return null;
  const theme: Record<string, unknown> = { schemaVersion: 1 };
  for (const [path, value] of Object.entries(leaves)) {
    const [head, tail] = path.split(".");
    if (tail) theme[head] = { ...(theme[head] as object | undefined), [tail]: value };
    else theme[head] = value;
  }
  return theme as PageTheme;
}

/** 바뀐 게 없으면 undefined(보내지 않음). 담을 키가 없으면 null(테마 전체를 상속). */
export function themePatch(
  next: PageTheme | null | undefined,
  base: PageTheme | null | undefined,
  sources: Record<string, SettingSource> | null,
): PageTheme | null | undefined {
  const nextLeaves = leavesOf(next);
  const baseLeaves = leavesOf(base);
  if (JSON.stringify(sortKeys(nextLeaves)) === JSON.stringify(sortKeys(baseLeaves))) return undefined;
  if (!sources) return themeOf(nextLeaves);
  const kept: Leaves = {};
  for (const [path, value] of Object.entries(nextLeaves)) {
    const changed = JSON.stringify(value) !== JSON.stringify(baseLeaves[path]);
    if (changed || sources[`theme.${path}`] === "EVENT") kept[path] = value;
  }
  return themeOf(kept);
}

function sortKeys(record: Leaves): Leaves {
  return Object.fromEntries(Object.keys(record).sort().map((k) => [k, record[k]]));
}

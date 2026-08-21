"use client";

import { getImageUrlByKey } from "@/lib/presignedUploadApi";
import type { ThemeExportJson } from "@/lib/types/themeEditor";

/**
 * 저장된 프레임을 화면에 그릴 수 있게 만든다.
 *
 * 서버에는 자산 위치가 **S3 key** 로 저장돼 있다(그래야 합성이 통과한다). key 는 그대로
 * 이미지 주소가 아니므로, 불러온 뒤 조회용 서명 URL 을 받아 `renderUrl` 에 붙인다.
 * 배경이 이미 쓰던 방식(`ThemeBackground.url`)을 컴포넌트까지 넓힌 것이다.
 *
 * 해석에 실패한 자산은 그냥 둔다 — 그 레이어만 안 보이고 나머지는 그려진다.
 * 같은 key 는 한 번만 물어본다.
 */
export async function resolveThemeAssetUrls(
  theme: ThemeExportJson,
): Promise<ThemeExportJson> {
  const keys = Array.from(
    new Set(
      theme.components
        .filter(
          (component) =>
            component.type !== "TEXT" &&
            !component.renderUrl &&
            component.source.startsWith("uploads/"),
        )
        .map((component) => component.source),
    ),
  );

  if (keys.length === 0) return theme;

  const resolved = new Map<string, string>();
  await Promise.all(
    keys.map(async (key) => {
      const url = await getImageUrlByKey(key);
      if (url) resolved.set(key, url);
    }),
  );

  if (resolved.size === 0) return theme;

  return {
    ...theme,
    components: theme.components.map((component) => {
      const url = resolved.get(component.source);
      return url ? { ...component, renderUrl: url } : component;
    }),
  };
}

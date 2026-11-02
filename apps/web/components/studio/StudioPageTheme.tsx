"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronRight } from "lucide-react";
import { getUserFacingApiErrorMessage } from "@/lib/apiError";
import { getAsset, uploadAsset } from "@/lib/assetUploadApi";
import { eventFontClassName } from "@/lib/event/eventFonts";
import {
  DEFAULT_PAGE_THEME_COLORS,
  PAGE_THEME_COLOR_KEYS,
  PAGE_THEME_COPY_KEYS,
  PAGE_THEME_COPY_MAX,
  PAGE_THEME_FONTS,
  isHexColor,
  lowContrastPairs,
  pageThemeStyle,
  type PageTheme,
  type PageThemeColorKey,
  type PageThemeCopyKey,
  type PageThemeFont,
} from "@/lib/event/pageTheme";
import type { EntitlementFeature } from "@/lib/studio/usageApi";

const COLOR_LABEL: Record<PageThemeColorKey, string> = {
  bg: "바탕",
  card: "카드",
  text: "글자",
  muted: "보조 글자",
  border: "테두리",
  accent: "버튼",
  accentContrast: "버튼 글자",
};

const FONT_LABEL: Record<PageThemeFont, string> = {
  SYSTEM: "기본 서체",
  PRETENDARD: "프리텐다드",
  NANUM_MYEONGJO: "나눔명조",
  GOWUN_DODUM: "고운돋움",
  BLACK_HAN_SANS: "검은고딕",
};

const COPY_LABEL: Record<PageThemeCopyKey, string> = {
  welcome: "처음 화면 · 부스 대기 화면",
  consentIntro: "동의 안내",
  captureGuide: "촬영 안내",
  composing: "사진을 만드는 동안",
  done: "사진이 완성됐을 때",
  expired: "받을 기간이 지났을 때",
  closed: "촬영 시간이 아닐 때",
  error: "사진을 만들지 못했을 때",
};

/** 칸을 비워 두면 참가 화면이 쓰는 기본 문구. 비운 칸이 무슨 뜻인지 바로 보이게 한다. */
const COPY_PLACEHOLDER: Record<PageThemeCopyKey, string> = {
  welcome: "휴대폰 카메라로 네 컷을 찍어 행사 사진을 만들어요.",
  consentIntro: "사진을 받는 곳과 쓰는 목적, 보관 기간을 확인해 주세요.",
  captureGuide: "버튼을 한 번 누르면 3초마다 한 장씩, 네 장을 찍어요.",
  composing: "사진을 만들고 있어요. 이 화면을 열어 두면 준비되는 대로 보여 드려요.",
  done: "사진이 완성됐어요.",
  expired: "사진을 받을 수 있는 기간이 지났어요.",
  closed: "지금은 촬영 시간이 아니에요.",
  error: "사진을 만들지 못했어요. 행사 담당자에게 문의해 주세요.",
};

type Preset = { id: string; label: string; colors: Record<PageThemeColorKey, string>; font: PageThemeFont };

/** 처음 꾸미는 사람의 출발점. 일곱 색을 하나씩 고르지 않아도 되게 한다. 모든 글자 짝이 4.5 : 1 을 넘는다(테스트가 본다). */
export const PAGE_THEME_PRESETS: Preset[] = [
  {
    id: "wedding",
    label: "웨딩 아이보리",
    font: "NANUM_MYEONGJO",
    colors: {
      bg: "#FBF7EF",
      card: "#FFFFFF",
      text: "#2B2622",
      muted: "#655C53",
      border: "#E4DCCF",
      accent: "#7A5F2E",
      accentContrast: "#FFFFFF",
    },
  },
  {
    id: "mono",
    label: "모던 모노",
    font: "PRETENDARD",
    colors: {
      bg: "#F6F6F4",
      card: "#FFFFFF",
      text: "#111111",
      muted: "#5E5E5E",
      border: "#D9D9D6",
      accent: "#111111",
      accentContrast: "#FFFFFF",
    },
  },
  {
    id: "autumn",
    label: "가을",
    font: "GOWUN_DODUM",
    colors: {
      bg: "#F7EFE6",
      card: "#FFF9F2",
      text: "#33241A",
      muted: "#6A5546",
      border: "#E5D3C0",
      accent: "#A23E1A",
      accentContrast: "#FFFFFF",
    },
  },
  {
    id: "fan",
    label: "팬 이벤트 다크",
    font: "PRETENDARD",
    colors: {
      bg: "#101014",
      card: "#1B1B22",
      text: "#FFFFFF",
      muted: "#B4B4C0",
      border: "#33333D",
      accent: "#FF4D8D",
      accentContrast: "#14040A",
    },
  },
];

type AssetField = "logoAssetId" | "backgroundAssetId";

/**
 * 행사 화면 꾸미기(R5 18절, ADR-0008 §5). 참가 · 부스 · 결과 화면의 색 · 글꼴 · 로고 · 배경 · 문구를 정한다.
 * 자유 CSS 는 없다 — 색 7개와 허용 글꼴, 이 공간에 올린 이미지, 일반 텍스트 문구만이다. 게시 때 서버가 다시 본다.
 */
export function StudioPageTheme({
  workspaceId,
  value,
  onChange,
  features = null,
  onUploadingChange,
  showBranding = true,
  onAssetPreview,
  showSample = true,
}: {
  workspaceId: string;
  value: PageTheme;
  /**
   * 이전 테마를 받아 다음 테마를 돌려주는 함수로 바꾼다. 업로드처럼 기다리는 동안 다른 칸을 고칠 수 있어서,
   * 그때의 `value` 로 통째로 덮으면 그사이 고친 것이 되돌아간다(Codex #544).
   */
  onChange: (apply: (prev: PageTheme) => PageTheme) => void;
  /** 이 행사에 적용된 이용권 기능. null 이면 아직 모른다(안내를 띄우지 않는다). */
  features?: EntitlementFeature[] | null;
  /** 로고·배경을 올리는 중인지. 부모가 그동안 저장을 막는다 — 저장 응답이 업로드 결과를 덮지 않게(Codex #544). */
  onUploadingChange?: (uploading: boolean) => void;
  /** 브랜딩 칸을 그릴지. 공간·프로젝트 기본값 편집은 「정하지 않음」이 있는 자기 칸을 쓴다. */
  showBranding?: boolean;
  /** 고른 로고·배경의 조회 주소를 알려 준다 — 행사 화면 미리보기가 저장 전 그림을 쓴다. */
  onAssetPreview?: (urls: { logoUrl?: string; backgroundUrl?: string }) => void;
  /** 색 견본 카드를 그릴지. 행사 화면은 실제 화면 미리보기가 따로 있어 끈다. 공간·프로젝트 기본값 편집에는 그것뿐이다. */
  showSample?: boolean;
}) {
  // 자산 ID → 짧은 조회 URL. 칸이 아니라 ID 로 기억해야, 다시 불러온 테마의 로고·배경이 바뀌면 옛 그림을 쓰지 않는다.
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const requestedRef = useRef(new Set<string>());
  const [uploading, setUploading] = useState<AssetField | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // 프리셋·「기본 색으로」는 일곱 칸을 한 번에 덮는다. 한 번은 되돌릴 수 있게 앞 값을 들고 있는다.
  const [undo, setUndo] = useState<{ colors: PageTheme["colors"]; font: PageTheme["font"] } | null>(null);

  // 고른 로고 · 배경을 미리 보여 준다(짧은 조회 URL). ID 가 바뀌면(다시 불러오기 등) 그 ID 로 새로 받는다.
  // 못 받아도 편집은 된다. 같은 ID 는 한 번만 묻는다.
  const { logoAssetId, backgroundAssetId } = value;
  useEffect(() => {
    for (const assetId of [logoAssetId, backgroundAssetId]) {
      if (!assetId || requestedRef.current.has(assetId)) continue;
      requestedRef.current.add(assetId);
      getAsset(assetId)
        .then((asset) => {
          const url = asset.url;
          if (url) setPreviews((prev) => ({ ...prev, [assetId]: url }));
        })
        .catch(() => requestedRef.current.delete(assetId));
    }
  }, [logoAssetId, backgroundAssetId]);
  const previewOf = (field: AssetField) => {
    const assetId = value[field];
    return assetId ? previews[assetId] : undefined;
  };

  const logoPreviewUrl = previewOf("logoAssetId");
  const backgroundPreviewUrl = previewOf("backgroundAssetId");
  useEffect(() => {
    onAssetPreview?.({ logoUrl: logoPreviewUrl, backgroundUrl: backgroundPreviewUrl });
  }, [onAssetPreview, logoPreviewUrl, backgroundPreviewUrl]);

  const colors = { ...DEFAULT_PAGE_THEME_COLORS, ...value.colors };
  // 화면 문구는 기능 없이 쓸 수 있다. 색 · 글꼴 · 로고 · 배경은 이용권 기능 CUSTOM_THEME 이 있어야 게시된다.
  const designed =
    Object.values(value.colors ?? {}).some(Boolean) ||
    (value.font !== undefined && value.font !== "SYSTEM") ||
    Boolean(value.logoAssetId || value.backgroundAssetId);
  const designBlocked = features !== null && !features.includes("CUSTOM_THEME") && designed;
  const whiteLabelBlocked =
    features !== null && !features.includes("WHITE_LABEL") && Boolean(value.branding?.hideHarucutBranding);
  const lowContrast = lowContrastPairs(value.colors ?? {});

  const setColor = (key: PageThemeColorKey, color: string) => {
    setUndo(null);
    onChange((prev) => ({ ...prev, colors: { ...prev.colors, [key]: color } }));
  };

  const replaceColors = (next: Pick<PageTheme, "colors"> & Partial<Pick<PageTheme, "font">>) => {
    setUndo({ colors: value.colors, font: value.font });
    onChange((prev) => ({ ...prev, ...next }));
  };
  const activePreset = PAGE_THEME_PRESETS.find(
    (preset) =>
      preset.font === value.font && PAGE_THEME_COLOR_KEYS.every((key) => value.colors?.[key] === preset.colors[key]),
  );

  const setCopy = (key: PageThemeCopyKey, text: string) =>
    onChange((prev) => ({ ...prev, copy: { ...prev.copy, [key]: text } }));

  const upload = async (field: AssetField, file: File | undefined) => {
    if (!file) return;
    setUploading(field);
    onUploadingChange?.(true);
    setNotice(null);
    try {
      const asset = await uploadAsset({ file, purpose: "PAGE_THEME_ASSET", workspaceId });
      // 업로드를 기다리는 사이 고친 다른 칸은 그대로 두고 이 칸의 자산 ID 만 바꾼다.
      onChange((prev) => ({ ...prev, [field]: asset.assetId }));
      requestedRef.current.add(asset.assetId);
      const url = asset.url;
      if (url) setPreviews((prev) => ({ ...prev, [asset.assetId]: url }));
    } catch (cause) {
      setNotice(getUserFacingApiErrorMessage(cause, "이미지를 올리지 못했어요. PNG·JPG 파일로 다시 올려 주세요."));
    } finally {
      setUploading(null);
      onUploadingChange?.(false);
    }
  };

  const removeAsset = (field: AssetField) => {
    onChange((prev) => ({ ...prev, [field]: undefined }));
  };

  return (
    <div className="flex flex-col gap-5">
      {designBlocked ? (
        <p role="status" className="rounded-2xl border border-(--hc-danger-border) p-3 text-[13px]">
          지금 이용권에는 행사 화면 디자인 기능이 없어요. 색 · 글꼴 · 로고 · 배경을 바꾸면 게시할 수 없어요. 화면 문구는 그대로
          쓸 수 있어요.
        </p>
      ) : null}
      {showSample ? (
        <div
          role="group"
          aria-label="행사 화면 미리보기"
          className={["ev-surface flex flex-col gap-3 rounded-2xl border border-(--hc-border) p-4", eventFontClassName(value.font)]
            .filter(Boolean)
            .join(" ")}
          style={pageThemeStyle({ colors: value.colors, backgroundUrl: previewOf("backgroundAssetId") })}
        >
          {previewOf("logoAssetId") ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={previewOf("logoAssetId")} alt="" referrerPolicy="no-referrer" className="h-10 w-auto self-start object-contain" />
          ) : null}
          <p className="text-[18px] font-extrabold">행사 이름</p>
          <p className="text-[14px] text-(--ev-muted)">
            {value.copy?.welcome?.trim() || "휴대폰 카메라로 네 컷을 찍어 행사 사진을 만들어요."}
          </p>
          <div className="rounded-xl border border-(--ev-border) bg-(--ev-card) p-3 text-[13px]">사진을 받는 곳과 쓰는 목적</div>
          <span className="flex h-12 items-center justify-center rounded-full bg-(--ev-accent) text-[15px] font-extrabold text-(--ev-accent-contrast)">
            사진 찍기
          </span>
        </div>
      ) : null}

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-2 text-[14px] font-semibold">색</legend>
        <div className="flex flex-wrap gap-2">
          {PAGE_THEME_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              aria-pressed={activePreset?.id === preset.id}
              onClick={() => replaceColors({ colors: preset.colors, font: preset.font })}
              className="flex h-11 items-center gap-2 rounded-full border border-(--hc-border) px-4 text-[13px] font-semibold transition hover:border-(--hc-border-strong) aria-pressed:border-(--hc-text)"
            >
              <span aria-hidden className="flex">
                <span className="size-3.5 rounded-full border border-(--hc-border)" style={{ background: preset.colors.bg }} />
                <span className="-ml-1 size-3.5 rounded-full border border-(--hc-border)" style={{ background: preset.colors.accent }} />
              </span>
              {preset.label}
            </button>
          ))}
        </div>
        <details className="group">
          <summary className="flex h-11 w-fit cursor-pointer list-none items-center gap-1.5 text-[13px] font-semibold text-(--hc-muted) transition hover:text-(--hc-text) [&::-webkit-details-marker]:hidden">
            <ChevronRight aria-hidden className="size-4 transition-transform group-open:rotate-90" />
            세부 색 바꾸기
          </summary>
          <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {PAGE_THEME_COLOR_KEYS.map((key) => {
              const typed = value.colors?.[key] ?? "";
              const invalid = typed !== "" && !isHexColor(typed);
              return (
                <label key={key} className="flex flex-col gap-1 text-[13px]">
                  {COLOR_LABEL[key]}
                  <span className="flex items-center gap-2">
                    <input
                      type="color"
                      aria-label={`${COLOR_LABEL[key]} 색 고르기`}
                      value={isHexColor(colors[key]) ? colors[key].toLowerCase() : "#000000"}
                      onChange={(e) => setColor(key, e.target.value.toUpperCase())}
                      className="size-11 shrink-0 rounded-lg border border-(--hc-border)"
                    />
                    <input
                      name={`themeColor-${key}`}
                      aria-label={`${COLOR_LABEL[key]} 색 값`}
                      aria-invalid={invalid || undefined}
                      value={typed}
                      placeholder={DEFAULT_PAGE_THEME_COLORS[key]}
                      maxLength={7}
                      spellCheck={false}
                      autoComplete="off"
                      translate="no"
                      onChange={(e) => setColor(key, e.target.value)}
                      className="hc-input h-11 w-full min-w-0 rounded-xl border px-2 font-mono text-[13px]"
                    />
                  </span>
                  {invalid ? <span className="text-[12px] text-(--hc-danger)">#RRGGBB 로 적어 주세요.</span> : null}
                </label>
              );
            })}
          </div>
        </details>
        {lowContrast.length > 0 ? (
          <div role="status" className="rounded-2xl border border-(--hc-danger-border) p-3 text-[13px]">
            <p className="font-semibold">글자가 잘 안 읽힐 수 있어요.</p>
            <ul className="mt-1 list-disc pl-5">
              {lowContrast.map((pair) => (
                <li key={pair.label}>
                  {pair.label} 대비 {pair.ratio.toFixed(1)} : 1. 4.5 : 1 이상을 권해요.
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => replaceColors({ colors: {} })}
            className="h-11 rounded-full border border-(--hc-border) px-4 text-[13px] font-semibold transition hover:border-(--hc-border-strong)"
          >
            기본 색으로
          </button>
          {undo ? (
            <button
              type="button"
              onClick={() => {
                onChange((prev) => ({ ...prev, colors: undo.colors, font: undo.font }));
                setUndo(null);
              }}
              className="h-11 rounded-full px-3 text-[13px] font-semibold underline underline-offset-4"
            >
              되돌리기
            </button>
          ) : null}
        </div>
      </fieldset>

      <label className="flex flex-col gap-1 text-[14px] font-semibold">
        글꼴
        <select
          name="themeFont"
          value={value.font ?? "SYSTEM"}
          onChange={(e) => {
            const font = e.target.value as PageThemeFont;
            onChange((prev) => ({ ...prev, font }));
          }}
          className="hc-input h-11 rounded-xl border px-2 text-[14px] font-normal"
        >
          {PAGE_THEME_FONTS.map((font) => (
            <option key={font} value={font}>
              {FONT_LABEL[font]}
            </option>
          ))}
        </select>
      </label>

      <div className="grid gap-3 sm:grid-cols-2">
        {(
          [
            ["logoAssetId", "로고"],
            ["backgroundAssetId", "배경 이미지"],
          ] as const
        ).map(([field, label]) => (
          <div key={field} className="flex flex-col gap-2 text-[14px]">
            <span className="font-semibold">{label}</span>
            {value[field] ? (
              <span className="flex items-center gap-2">
                {previewOf(field) ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={previewOf(field)} alt={`고른 ${label}`} referrerPolicy="no-referrer" className="h-12 w-auto max-w-32 rounded-lg object-contain" />
                ) : (
                  <span className="text-[13px] text-(--hc-muted)">고른 이미지가 있어요</span>
                )}
                <button
                  type="button"
                  onClick={() => removeAsset(field)}
                  className="h-11 rounded-full px-3 text-[13px] text-(--hc-danger)"
                >
                  빼기
                </button>
              </span>
            ) : null}
            <label className="hc-button-secondary flex h-11 cursor-pointer items-center justify-center self-start rounded-full px-4 text-[13px] font-semibold">
              {uploading === field ? "올리는 중…" : value[field] ? `${label} 바꾸기` : `${label} 올리기`}
              <input
                type="file"
                name={field}
                accept="image/png,image/jpeg"
                className="sr-only"
                disabled={uploading !== null}
                onChange={(e) => {
                  void upload(field, e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
            </label>
          </div>
        ))}
      </div>
      {notice ? (
        <p role="alert" className="text-[13px] text-(--hc-danger)">
          {notice}
        </p>
      ) : null}

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 text-[14px] font-semibold">화면 문구</legend>
        <p className="text-[12px] text-(--hc-muted)">비워 두면 칸에 보이는 기본 문구를 써요. 화면마다 {PAGE_THEME_COPY_MAX}자까지예요.</p>
        {PAGE_THEME_COPY_KEYS.map((key) => (
          <label key={key} className="flex flex-col gap-1 text-[13px]">
            {COPY_LABEL[key]}
            <textarea
              name={`themeCopy-${key}`}
              rows={2}
              maxLength={PAGE_THEME_COPY_MAX}
              placeholder={COPY_PLACEHOLDER[key]}
              value={value.copy?.[key] ?? ""}
              onChange={(e) => setCopy(key, e.target.value)}
              className="hc-input rounded-xl border px-3 py-2 text-[14px]"
            />
          </label>
        ))}
      </fieldset>

      {showBranding ? (
      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 text-[14px] font-semibold">브랜딩</legend>
        <label className="flex min-h-11 items-center gap-2 text-[14px]">
          <input
            type="checkbox"
            name="themeHideHarucutBranding"
            className="size-5"
            checked={Boolean(value.branding?.hideHarucutBranding)}
            onChange={(e) => {
              const hideHarucutBranding = e.target.checked;
              onChange((prev) => ({ ...prev, branding: { ...prev.branding, hideHarucutBranding } }));
            }}
          />
          하루컷 표시 숨기기
        </label>
        <p className={whiteLabelBlocked ? "text-[12px] text-(--hc-danger)" : "text-[12px] text-(--hc-muted)"}>
          {whiteLabelBlocked
            ? "지금 이용권에는 이 기능이 없어요. 켜 두면 게시할 수 없어요."
            : "화이트라벨 이용권이 있어야 게시할 수 있어요."}
        </p>
        <label className="flex flex-col gap-1 text-[14px] font-semibold">
          완성 사진의 로고
          <select
            name="themeOutputLogo"
            value={value.branding?.outputLogo ?? "NONE"}
            onChange={(e) => {
              const outputLogo = e.target.value as "NONE" | "ORGANIZER_LOGO";
              onChange((prev) => ({ ...prev, branding: { ...prev.branding, outputLogo } }));
            }}
            className="hc-input h-11 rounded-xl border px-2 text-[14px] font-normal"
          >
            <option value="NONE">넣지 않기</option>
            <option value="ORGANIZER_LOGO">행사 로고 넣기</option>
          </select>
        </label>
        <p className="text-[12px] text-(--hc-muted)">
          참가자가 받는 완성 사진의 오른쪽 아래에 위 로고를 넣어요. 로고를 올려야 게시할 수 있어요.
        </p>
      </fieldset>
      ) : null}
    </div>
  );
}

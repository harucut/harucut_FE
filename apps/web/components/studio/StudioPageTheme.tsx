"use client";

import { useEffect, useState } from "react";
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
}: {
  workspaceId: string;
  value: PageTheme;
  onChange: (next: PageTheme) => void;
  /** 이 행사에 적용된 이용권 기능. null 이면 아직 모른다(안내를 띄우지 않는다). */
  features?: EntitlementFeature[] | null;
}) {
  const [previews, setPreviews] = useState<Partial<Record<AssetField, string>>>({});
  const [uploading, setUploading] = useState<AssetField | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // 이미 고른 로고 · 배경을 미리 보여 준다(짧은 조회 URL). 못 받아도 편집은 된다.
  useEffect(() => {
    for (const field of ["logoAssetId", "backgroundAssetId"] as const) {
      const assetId = value[field];
      if (!assetId || previews[field]) continue;
      getAsset(assetId)
        .then((asset) => {
          if (asset.url) setPreviews((prev) => ({ ...prev, [field]: asset.url }));
        })
        .catch(() => {});
    }
    // 처음 열 때만 — 새로 올린 것은 업로드 결과로 바로 채운다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  const setColor = (key: PageThemeColorKey, color: string) =>
    onChange({ ...value, colors: { ...value.colors, [key]: color } });

  const setCopy = (key: PageThemeCopyKey, text: string) => onChange({ ...value, copy: { ...value.copy, [key]: text } });

  const upload = async (field: AssetField, file: File | undefined) => {
    if (!file) return;
    setUploading(field);
    setNotice(null);
    try {
      const asset = await uploadAsset({ file, purpose: "PAGE_THEME_ASSET", workspaceId });
      onChange({ ...value, [field]: asset.assetId });
      setPreviews((prev) => ({ ...prev, [field]: asset.url }));
    } catch (cause) {
      setNotice(getUserFacingApiErrorMessage(cause, "이미지를 올리지 못했어요."));
    } finally {
      setUploading(null);
    }
  };

  const removeAsset = (field: AssetField) => {
    onChange({ ...value, [field]: undefined });
    setPreviews((prev) => ({ ...prev, [field]: undefined }));
  };

  return (
    <div className="flex flex-col gap-5">
      {designBlocked ? (
        <p role="status" className="rounded-2xl border border-(--hc-danger-border) p-3 text-[13px]">
          지금 이용권에는 행사 화면 디자인 기능이 없어요. 색 · 글꼴 · 로고 · 배경을 바꾸면 게시할 수 없어요. 화면 문구는 그대로
          쓸 수 있어요.
        </p>
      ) : null}
      <div
        aria-label="행사 화면 미리보기"
        className={["ev-surface flex flex-col gap-3 rounded-2xl border border-(--hc-border) p-4", eventFontClassName(value.font)]
          .filter(Boolean)
          .join(" ")}
        style={pageThemeStyle({ colors: value.colors, backgroundUrl: previews.backgroundAssetId })}
      >
        {previews.logoAssetId ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={previews.logoAssetId} alt="" referrerPolicy="no-referrer" className="h-10 w-auto self-start object-contain" />
        ) : null}
        <p className="text-[18px] font-extrabold">행사 이름</p>
        <p className="text-[14px] text-(--ev-muted)">
          {value.copy?.welcome?.trim() || "휴대폰 카메라로 네 컷을 찍어 행사 사진을 만들어요."}
        </p>
        <div className="rounded-xl border border-(--ev-border) bg-(--ev-card) p-3 text-[13px]">사진을 받는 곳과 쓰는 목적</div>
        <span className="flex h-12 items-center justify-center rounded-full bg-(--ev-accent) text-[15px] font-extrabold text-(--ev-accent-contrast)">
          촬영 시작
        </span>
      </div>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-2 text-[14px] font-semibold">색</legend>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {PAGE_THEME_COLOR_KEYS.map((key) => (
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
                  aria-label={`${COLOR_LABEL[key]} 색 값`}
                  value={value.colors?.[key] ?? ""}
                  placeholder={DEFAULT_PAGE_THEME_COLORS[key]}
                  maxLength={7}
                  spellCheck={false}
                  onChange={(e) => setColor(key, e.target.value)}
                  className="hc-input h-11 w-full min-w-0 rounded-xl border px-2 font-mono text-[13px]"
                />
              </span>
            </label>
          ))}
        </div>
        {lowContrast.length > 0 ? (
          <div role="status" className="rounded-2xl border border-(--hc-danger-border) p-3 text-[13px]">
            <p className="font-semibold">글자가 잘 안 읽힐 수 있어요.</p>
            <ul className="mt-1 list-disc pl-5">
              {lowContrast.map((pair) => (
                <li key={pair.label}>
                  {pair.label} 대비 {pair.ratio.toFixed(1)} : 1 — 4.5 : 1 이상을 권해요.
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        <button
          type="button"
          onClick={() => onChange({ ...value, colors: {} })}
          className="h-11 self-start rounded-full border border-(--hc-border) px-4 text-[13px] font-semibold"
        >
          기본 색으로
        </button>
      </fieldset>

      <label className="flex flex-col gap-1 text-[14px] font-semibold">
        글꼴
        <select
          value={value.font ?? "SYSTEM"}
          onChange={(e) => onChange({ ...value, font: e.target.value as PageThemeFont })}
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
                {previews[field] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={previews[field]} alt={`고른 ${label}`} referrerPolicy="no-referrer" className="h-12 w-auto max-w-32 rounded-lg object-contain" />
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
        <p className="text-[12px] text-(--hc-muted)">비워 두면 하루컷 기본 문구를 써요. 화면마다 {PAGE_THEME_COPY_MAX}자까지예요.</p>
        {PAGE_THEME_COPY_KEYS.map((key) => (
          <label key={key} className="flex flex-col gap-1 text-[13px]">
            {COPY_LABEL[key]}
            <textarea
              rows={2}
              maxLength={PAGE_THEME_COPY_MAX}
              value={value.copy?.[key] ?? ""}
              onChange={(e) => setCopy(key, e.target.value)}
              className="hc-input rounded-xl border px-3 py-2 text-[14px]"
            />
          </label>
        ))}
      </fieldset>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 text-[14px] font-semibold">브랜딩</legend>
        <label className="flex items-center gap-2 text-[14px]">
          <input
            type="checkbox"
            className="size-5"
            checked={Boolean(value.branding?.hideHarucutBranding)}
            onChange={(e) => onChange({ ...value, branding: { ...value.branding, hideHarucutBranding: e.target.checked } })}
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
            value={value.branding?.outputLogo ?? "NONE"}
            onChange={(e) =>
              onChange({
                ...value,
                branding: { ...value.branding, outputLogo: e.target.value as "NONE" | "ORGANIZER_LOGO" },
              })
            }
            className="hc-input h-11 rounded-xl border px-2 text-[14px] font-normal"
          >
            <option value="NONE">넣지 않기</option>
            <option value="ORGANIZER_LOGO">행사 로고 넣기</option>
          </select>
        </label>
        <p className="text-[12px] text-(--hc-muted)">완성 사진에 로고를 넣는 기능은 준비 중이에요. 지금은 설정만 저장돼요.</p>
      </fieldset>
    </div>
  );
}

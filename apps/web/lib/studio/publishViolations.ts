import { getFrameConfig } from "@/constants/frames";
import { frameIdFromFrameType } from "@/lib/frameApi";
import type { StudioSectionId } from "@/lib/studio/eventSections";
import type { EventLayout, PublishViolation } from "@/lib/studio/studioApi";

/**
 * 게시 검증 위반(400 EVENT-003)을 화면 문구로 묶는다.
 *
 * 서버 사유는 한국어지만 개발자 말투고 필드 이름이 섞여 온다(`완성 이미지에 넣을 로고(theme.logoAssetId)가 없다`,
 * `기본 카탈로그로 대체하지 않는다`). 그래서 설정 묶음마다 운영자가 할 일을 FE 가 말하고, 무엇이 걸렸는지도
 * 번역해서 보여 준다. 번역이 없는 사유에 영문 식별자가 있으면 그대로 내보내지 않고 묶음 문구에 맡긴다.
 * field 는 `frames[2]` · `theme.colors.bg` 처럼 첨자·하위 이름이 붙어 온다 — 앞 이름으로 묶는다.
 */
const GROUPS: Array<{ key: string; message: string; anchor: StudioSectionId }> = [
  {
    key: "captureEndsAt",
    message: "촬영 종료 시각을 확인해 주세요. 상시 캠페인은 종료 시각을 비워야 해요.",
    anchor: "basics",
  },
  { key: "byodEnabled", message: "참가 방식을 하나 이상 켜 주세요. 개인 휴대폰이나 현장 부스예요.", anchor: "participation" },
  {
    key: "allowedLayouts",
    message: "허용할 레이아웃을 하나 이상 고르고, 고른 레이아웃마다 프레임을 연결해 주세요.",
    anchor: "frames",
  },
  { key: "frames", message: "제공 프레임을 확인해 주세요. 허용한 레이아웃마다 하나 이상, 기본 프레임은 하나여야 해요.", anchor: "frames" },
  {
    key: "consentItems",
    message: "참가 동의 항목을 확인해 주세요. 사진을 받는 주체·목적·보관 기간을 적은 필수 항목이 하나 이상 있어야 해요.",
    anchor: "consent",
  },
  { key: "theme", message: "행사 화면 꾸미기를 확인해 주세요.", anchor: "design" },
  { key: "resultRetentionDays", message: "결과 보관 일수를 확인해 주세요.", anchor: "consent" },
  { key: "status", message: "이용권 조건을 확인해 주세요.", anchor: "entitlement" },
];

function layoutLabel(layout: string) {
  return getFrameConfig(frameIdFromFrameType(layout as EventLayout)).name;
}

/** 서버 사유 → 운영자가 읽는 문구. null 이면 보여 주지 않는다(묶음 문구로 충분하다). */
const REASONS: Array<[RegExp, (match: RegExpMatchArray) => string | null]> = [
  [/개인 휴대폰·부스 중 하나 이상/, () => null],
  [/상시 캠페인은 종료 시각을 두지 않는다/, () => null],
  [/허용 레이아웃이 하나 이상/, () => null],
  [/^(CLASSIC|WIDE|GRID|POLAROID) 에 연결된 프레임이 없다/, (m) => `${layoutLabel(m[1])}에 연결된 프레임이 없어요.`],
  [/frameVersionId·layoutType/, () => "프레임 정보가 빠진 항목이 있어요. 빼고 다시 골라 주세요."],
  [/같은 발행본을 두 번/, () => "같은 프레임을 두 번 골랐어요."],
  [/없는 프레임 발행본/, () => "지금은 없는 프레임이 들어 있어요. 빼고 다시 골라 주세요."],
  [/발행본의 레이아웃/, () => "레이아웃과 맞지 않는 프레임이 들어 있어요."],
  [/허용하지 않은 레이아웃의 프레임/, () => "허용하지 않은 레이아웃의 프레임이 들어 있어요."],
  [/이 공간의 프레임이나 시스템 프레임/, () => "이 공간의 프레임이나 기본 제공 프레임만 쓸 수 있어요."],
  [/제공 프레임이 하나 이상/, () => "제공 프레임을 하나 이상 골라 주세요."],
  [/기본 프레임은 정확히 하나여야 한다\(지금 (\d+)개\)/, (m) => `기본 프레임은 하나여야 해요. 지금 ${m[1]}개예요.`],
  [/사진 수신 주체·목적·보관을 안내/, () => "사진을 받는 곳·목적·보관 기간을 적은 항목을 넣어 주세요."],
  [/code·title·body/, () => "제목이나 본문이 빈 동의 항목이 있어요."],
  [/같은 code 가 두 번/, () => "같은 동의 항목이 두 번 들어 있어요."],
  [/필수 동의 항목이 하나 이상/, () => "필수 동의 항목을 하나 이상 정해 주세요."],
  [/CUSTOM_THEME/, () => "지금 이용권에는 행사 화면 디자인 기능이 없어요. 색·글꼴·로고·배경을 기본으로 되돌려 주세요."],
  [/지원하는 버전은/, () => null],
  [/#RRGGBB/, () => "색은 #RRGGBB 형식으로 적어 주세요."],
  [/허용 글꼴이 아니다/, () => "고를 수 없는 글꼴이에요."],
  [/PAGE_THEME_ASSET/, () => "로고나 배경 이미지를 다시 올려 주세요."],
  [/(\d+)자 이내여야 한다/, (m) => `화면 문구는 ${m[1]}자까지 쓸 수 있어요.`],
  [/NONE · ORGANIZER_LOGO/, () => null],
  [/완성 이미지에 넣을 로고/, () => "완성 사진에 넣을 로고를 올려 주세요."],
  [/WHITE_LABEL/, () => "지금 이용권으로는 하루컷 표시를 숨길 수 없어요."],
  [/동시 운영 행사 수\((\d+)\)/, (m) => `이용권으로 동시에 운영할 수 있는 행사는 ${m[1]}개까지예요.`],
  [/보관 일수 상한\((\d+)일\)/, (m) => `이 이용권으로 정할 수 있는 보관 일수는 ${m[1]}일까지예요.`],
];

export function friendlyViolationReason(reason: string): string | null {
  for (const [pattern, toCopy] of REASONS) {
    const match = reason.match(pattern);
    if (match) return toCopy(match);
  }
  return /[A-Za-z_]{2,}/.test(reason) ? null : reason;
}

export type ViolationGroup = {
  key: string;
  message: string;
  reasons: string[];
  /** 고치러 갈 구역. 모르는 묶음은 없다. */
  anchor?: StudioSectionId;
};

export function groupViolations(violations: PublishViolation[]): ViolationGroup[] {
  const groups = new Map<string, ViolationGroup>();
  for (const v of violations) {
    const base = v.field.replace(/[[.].*$/, "");
    const known = GROUPS.find((g) => g.key === base);
    const key = known?.key ?? base;
    const group = groups.get(key) ?? {
      key,
      message: known?.message ?? "설정을 다시 확인해 주세요.",
      reasons: [],
      anchor: known?.anchor,
    };
    const reason = friendlyViolationReason(v.reason);
    if (reason && !group.reasons.includes(reason)) group.reasons.push(reason);
    groups.set(key, group);
  }
  // 화면의 설정 순서와 같게 보여 준다. 모르는 묶음은 뒤로.
  const order = (key: string) => {
    const i = GROUPS.findIndex((g) => g.key === key);
    return i < 0 ? GROUPS.length : i;
  };
  return Array.from(groups.values()).sort((a, b) => order(a.key) - order(b.key));
}

import type { PublishViolation } from "@/lib/studio/studioApi";

/**
 * 게시 검증 위반(400 EVENT-003)을 화면 문구로 묶는다.
 *
 * 서버 사유는 한국어지만 개발자 말투다(`frameVersionId·layoutType 이 필요하다`). 그래서 설정 묶음마다
 * 운영자가 할 일을 FE 가 말하고, 서버 사유는 무엇이 걸렸는지 보조로 붙인다.
 * field 는 `frames[2]` 처럼 첨자가 붙어 온다 — 앞 이름으로 묶는다.
 */
const GROUPS: Array<{ key: string; message: string }> = [
  { key: "byodEnabled", message: "참가 방식을 하나 이상 켜 주세요. 개인 휴대폰이나 현장 부스예요." },
  { key: "allowedLayouts", message: "허용할 레이아웃을 하나 이상 고르고, 고른 레이아웃마다 프레임을 연결해 주세요." },
  { key: "frames", message: "제공 프레임을 확인해 주세요. 허용한 레이아웃마다 하나 이상, 기본 프레임은 하나여야 해요." },
  {
    key: "consentItems",
    message: "참가 동의 항목을 확인해 주세요. 사진을 받는 주체·목적·보관 기간을 적은 필수 항목이 하나 이상 있어야 해요.",
  },
];

export type ViolationGroup = { key: string; message: string; reasons: string[] };

export function groupViolations(violations: PublishViolation[]): ViolationGroup[] {
  const groups = new Map<string, ViolationGroup>();
  for (const v of violations) {
    const base = v.field.replace(/\[.*$/, "");
    const known = GROUPS.find((g) => g.key === base);
    const key = known?.key ?? base;
    const group = groups.get(key) ?? {
      key,
      message: known?.message ?? "설정을 다시 확인해 주세요.",
      reasons: [],
    };
    if (!group.reasons.includes(v.reason)) group.reasons.push(v.reason);
    groups.set(key, group);
  }
  // 화면의 설정 순서와 같게 보여 준다. 모르는 묶음은 뒤로.
  const order = (key: string) => {
    const i = GROUPS.findIndex((g) => g.key === key);
    return i < 0 ? GROUPS.length : i;
  };
  return Array.from(groups.values()).sort((a, b) => order(a.key) - order(b.key));
}

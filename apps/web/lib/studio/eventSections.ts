import type { EventUsage } from "@/lib/studio/usageApi";

/**
 * 행사 화면의 구역과, 게시 전에 확인할 것을 계산하는 순수 함수들.
 *
 * 구역 id 는 목차·체크리스트·게시 위반이 같이 쓴다 — 어디서 눌러도 같은 자리로 간다.
 */
export type StudioSectionId =
  | "overview"
  | "basics"
  | "participation"
  | "frames"
  | "consent"
  | "design"
  | "booth"
  | "people"
  | "entitlement";

export const STUDIO_SECTION_LABEL: Record<StudioSectionId, string> = {
  overview: "개요",
  basics: "기본·일정",
  participation: "참가 방식",
  frames: "프레임",
  consent: "동의",
  design: "디자인",
  booth: "부스",
  people: "사람",
  entitlement: "이용권",
};

/** 결과 보관 일수의 기본값. 확정된 상품 정책이 아니다 — 운영자가 정한다(R5 8절). */
export const DEFAULT_RETENTION_DAYS = 30;

/** 새 행사에 미리 넣는 동의 항목. 주최자가 읽고 고치는 초안이다 — 받는 곳·목적·보관 기간을 빠뜨리지 않게 한다. */
export function defaultConsentTemplate(organizer: string) {
  return {
    code: "photo-consent",
    title: "사진 수집·이용 안내",
    body: `찍은 사진은 ${organizer}에서 이 행사 기록으로 받아요. 결과 링크로 ${DEFAULT_RETENTION_DAYS}일 동안 다시 받을 수 있고, 그 뒤에는 지워져요.`,
    required: true,
    version: 1,
  };
}

/**
 * 동의문에 적힌 「N일」과 실제 보관 일수가 어긋나면 그 숫자들을 돌려준다. 참가자는 동의문을 믿고 동의한다 —
 * 90일이라고 읽었는데 30일에 지워지면 안 된다. 본문에 일수가 없거나 하나라도 맞으면 어긋난 것으로 보지 않는다.
 */
export function retentionMismatch(bodies: string[], retentionDays: number): number[] {
  const mentioned = new Set<number>();
  for (const body of bodies) {
    for (const match of body.matchAll(/(\d{1,4})\s*일/g)) mentioned.add(Number(match[1]));
  }
  if (mentioned.size === 0 || mentioned.has(retentionDays)) return [];
  return [...mentioned];
}

/** 동의문의 「from일」을 「to일」로 바꾼다. 다른 일수(「7일 전에 안내」 등)는 건드리지 않는다. */
export function replaceRetentionDays(body: string, from: number, to: number): string {
  return body.replace(/(\d{1,4})(\s*일)/g, (whole, days: string, unit: string) => (Number(days) === from ? `${to}${unit}` : whole));
}

export type ChecklistState = "done" | "todo" | "optional";

export type ChecklistRow = {
  key: "participation" | "frames" | "consent" | "schedule" | "design" | "entitlement";
  anchor: StudioSectionId;
  label: string;
  state: ChecklistState;
  detail: string;
};

export type ChecklistInput = {
  byod: boolean;
  booth: boolean;
  layouts: string[];
  frames: Array<{ layoutType: string; isDefault: boolean }>;
  consents: Array<{ title: string; body: string; required: boolean }>;
  kind: "SCHEDULED" | "ALWAYS_ON";
  /** datetime-local 값. 비었으면 정하지 않은 것이다. */
  startsAt: string;
  endsAt: string;
  designed: boolean;
  /** undefined 는 아직 받는 중. */
  usage: EventUsage | undefined;
};

function formatLocal(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString("ko-KR", { month: "long", day: "numeric", hour: "numeric", minute: "2-digit" });
}

/** 게시 전 체크리스트 여섯 줄. 저장 전 입력값으로 계산한다 — 고치는 동안 바로 바뀐다. 서버 검사를 대신하지 않는다. */
export function draftChecklist(input: ChecklistInput): ChecklistRow[] {
  const covered = new Set(input.frames.map((f) => f.layoutType));
  const defaults = input.frames.filter((f) => f.isDefault).length;
  const framesOk =
    input.layouts.length > 0 && input.layouts.every((layout) => covered.has(layout)) && defaults === 1;
  const channels = [input.byod ? "개인 휴대폰" : null, input.booth ? "현장 부스" : null].filter(Boolean).join(" · ");
  const requiredConsents = input.consents.filter((c) => c.required && c.title.trim() && c.body.trim());
  const endsBeforeStart =
    Boolean(input.startsAt && input.endsAt) && new Date(input.endsAt).getTime() <= new Date(input.startsAt).getTime();

  const schedule: Pick<ChecklistRow, "state" | "detail"> =
    input.kind === "ALWAYS_ON"
      ? input.endsAt
        ? { state: "todo", detail: "상시 캠페인은 종료 시각을 비워야 해요" }
        : { state: "done", detail: "상시 캠페인이에요" }
      : endsBeforeStart
        ? { state: "todo", detail: "종료가 시작보다 앞이에요" }
        : {
            state: "done",
            detail: input.startsAt ? `${formatLocal(input.startsAt)} 시작` : "게시하면 바로 시작해요",
          };

  return [
    {
      key: "participation",
      anchor: "participation",
      label: "참가 방식",
      state: channels ? "done" : "todo",
      detail: channels || "개인 휴대폰이나 현장 부스를 켜 주세요",
    },
    {
      key: "frames",
      anchor: "frames",
      label: "프레임",
      state: framesOk ? "done" : "todo",
      detail: framesOk ? `${input.frames.length}개 골랐어요` : "고른 레이아웃마다 프레임을 하나 이상 골라 주세요",
    },
    {
      key: "consent",
      anchor: "consent",
      label: "동의",
      state: requiredConsents.length > 0 ? "done" : "todo",
      detail:
        requiredConsents.length > 0
          ? `필수 항목 ${requiredConsents.length}개`
          : "사진을 받는 곳·목적·보관 기간을 적어 주세요",
    },
    { key: "schedule", anchor: "basics", label: "일정", ...schedule },
    {
      key: "design",
      anchor: "design",
      label: "디자인",
      state: input.designed ? "done" : "optional",
      detail: input.designed ? "행사에 맞게 꾸몄어요" : "안 꾸미면 기본 디자인으로 열려요",
    },
    {
      key: "entitlement",
      anchor: "entitlement",
      label: "이용권",
      state: input.usage === undefined ? "optional" : input.usage.entitlement ? "done" : "todo",
      detail:
        input.usage === undefined
          ? "확인하는 중이에요"
          : input.usage.entitlement
            ? `남은 촬영 ${input.usage.remaining.toLocaleString("ko-KR")}장`
            : "이용권이 있어야 게시할 수 있어요",
    },
  ];
}

"use client";

import Link from "next/link";
import type { EntitlementFeature, EventUsage } from "@/lib/studio/usageApi";

const FEATURE_LABEL: Record<EntitlementFeature, string> = {
  CUSTOM_THEME: "행사 화면 디자인",
  WHITE_LABEL: "하루컷 표시 숨기기",
  BULK_DOWNLOAD: "사진 묶음 받기",
};

/** 남은 합성이 이 비율 아래면, 이용권이 이 날수 안에 끝나면 미리 알린다(R5 「만료 전 안내」). */
const LOW_REMAINING_RATIO = 0.1;
const ENDING_SOON_DAYS = 7;

function formatDate(iso: string) {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? ""
    : date.toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" });
}

function formatDateTime(iso: string) {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? ""
    : date.toLocaleString("ko-KR", { month: "long", day: "numeric", hour: "numeric", minute: "2-digit" });
}

/**
 * 이 행사에 적용된 이용권과 합성 사용량(ADR-0008 §6-3). 합성 1건 = 성공한 네컷 1장.
 * 금액 · 계약 내용은 싣지 않는다 — 행사 고객도 볼 수 있는 화면이다.
 */
export function StudioEventUsage({
  usage,
  error,
  now,
  onRefresh,
}: {
  /** undefined 면 불러오는 중. */
  usage: EventUsage | undefined;
  error: string | null;
  now: number;
  onRefresh: () => void;
}) {
  if (error) {
    return (
      <div className="flex flex-col gap-2">
        <p role="alert" className="text-[13px] text-(--hc-danger)">
          {error}
        </p>
        <button
          type="button"
          onClick={onRefresh}
          className="h-11 self-start rounded-full border border-(--hc-border) px-4 text-[13px] font-semibold"
        >
          다시 불러오기
        </button>
      </div>
    );
  }
  if (!usage) return <p className="text-[13px] text-(--hc-muted)">불러오는 중…</p>;

  if (!usage.entitlement) {
    return (
      <div role="status" className="hc-surface-well flex flex-col gap-2 rounded-2xl p-4 text-[13px]">
        <p className="text-[14px] font-semibold">아직 이 행사에 적용된 이용권이 없어요.</p>
        <p className="text-(--hc-muted)">이용권이 있어야 게시하고 촬영을 받을 수 있어요. 설정은 먼저 해 둘 수 있어요.</p>
        <Link href="/enterprise#inquiry" className="hc-button-secondary inline-flex h-11 items-center self-start rounded-full px-4 font-semibold">
          도입 문의하기
        </Link>
      </div>
    );
  }

  const { entitlement } = usage;
  const quota = Math.max(0, usage.composeQuota);
  const usedRatio = quota > 0 ? Math.min(1, (usage.used + usage.reserved) / quota) : 1;
  const endsInDays = (new Date(entitlement.validTo).getTime() - now) / 86_400_000;
  // 배분을 받은 행사는 기업 총량이 먼저 끝나도 촬영이 마감된다.
  const parentShort = usage.parent ? usage.parent.remaining < usage.remaining : false;
  const available = usage.parent ? Math.min(usage.remaining, usage.parent.remaining) : usage.remaining;
  const lowRemaining = quota > 0 && available <= Math.ceil(quota * LOW_REMAINING_RATIO);
  const endingSoon = Number.isFinite(endsInDays) && endsInDays >= 0 && endsInDays <= ENDING_SOON_DAYS;
  const ended = Number.isFinite(endsInDays) && endsInDays < 0;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2">
        <p className="text-[14px]">
          남은 촬영 <strong className="text-[18px] font-extrabold tabular-nums">{usage.remaining.toLocaleString("ko-KR")}</strong>
          <span className="text-(--hc-muted)"> / {quota.toLocaleString("ko-KR")}장</span>
        </p>
        <div
          role="meter"
          aria-label="합성 사용량"
          aria-valuemin={0}
          aria-valuemax={quota}
          aria-valuenow={usage.used + usage.reserved}
          className="h-2 overflow-hidden rounded-full bg-(--hc-surface-well)"
        >
          <div className="h-full rounded-full bg-(--hc-primary)" style={{ width: `${usedRatio * 100}%` }} />
        </div>
        <p className="text-[12px] text-(--hc-muted)">
          완성 {usage.used.toLocaleString("ko-KR")}장 · 만드는 중 {usage.reserved.toLocaleString("ko-KR")}장. 만들지 못한 사진은 세지 않아요.
        </p>
      </div>

      {lowRemaining || endingSoon || ended ? (
        <p role="status" className="rounded-2xl border border-(--hc-danger-border) p-3 text-[13px]">
          {ended
            ? "이용권 기간이 끝났어요. 새 촬영을 받으려면 연장이 필요해요."
            : lowRemaining
              ? "남은 촬영이 얼마 없어요. 다 쓰면 참가자 화면에 촬영 마감으로 보여요."
              : `이용권이 ${formatDate(entitlement.validTo)}에 끝나요.`}{" "}
          <Link href="/enterprise#inquiry" className="font-semibold underline">
            증설·연장 문의
          </Link>
        </p>
      ) : null}

      {usage.parent ? (
        <p className="text-[13px]">
          기업 총량 남은 촬영{" "}
          <strong className="tabular-nums">{usage.parent.remaining.toLocaleString("ko-KR")}</strong>
          <span className="text-(--hc-muted)"> / {usage.parent.composeQuota.toLocaleString("ko-KR")}장</span>
          {parentShort ? (
            <span className="block text-[12px] text-(--hc-muted)">
              기업 총량이 이 행사 배분보다 적게 남았어요. 총량을 다 쓰면 이 행사도 촬영이 마감돼요.
            </span>
          ) : null}
        </p>
      ) : null}

      {usage.alerts?.length ? (
        <div className="flex flex-col gap-1 text-[13px]">
          <p className="font-semibold">한도 알림</p>
          <ul className="flex flex-col gap-0.5">
            {usage.alerts.map((alert) => (
              <li key={alert.threshold}>
                완성 사진이 한도의 {alert.threshold}%에 닿았어요
                <span className="text-(--hc-muted)"> · {formatDateTime(alert.reachedAt)}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-[13px]">
        <dt className="text-(--hc-muted)">기간</dt>
        <dd>
          {formatDate(entitlement.validFrom)} ~ {formatDate(entitlement.validTo)}
        </dd>
        <dt className="text-(--hc-muted)">적용 범위</dt>
        <dd>{usage.parent ? "기업 총량에서 이 행사에 배분" : entitlement.scope === "EVENT" ? "이 행사" : "이 공간의 모든 행사"}</dd>
        {usage.retentionDays ? (
          <>
            <dt className="text-(--hc-muted)">결과 보관</dt>
            <dd>최대 {usage.retentionDays}일</dd>
          </>
        ) : null}
        {usage.maxBoothDevices ? (
          <>
            <dt className="text-(--hc-muted)">부스 기기</dt>
            <dd>최대 {usage.maxBoothDevices}대</dd>
          </>
        ) : null}
        <dt className="text-(--hc-muted)">기능</dt>
        <dd>
          {entitlement.features?.length
            ? entitlement.features.map((f) => FEATURE_LABEL[f] ?? f).join(" · ")
            : "기본 기능"}
        </dd>
      </dl>

      <button
        type="button"
        onClick={onRefresh}
        className="h-11 self-start rounded-full border border-(--hc-border) px-4 text-[13px] font-semibold"
      >
        사용량 새로 보기
      </button>
    </div>
  );
}

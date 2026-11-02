"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** 서버 AuditLogPage.Item. 시스템·탈퇴 사용자가 한 일이면 actorName 키가 없다. */
export type AuditLogItem = {
  action: string;
  actorName?: string | null;
  eventId?: string | null;
  targetType?: string | null;
  targetId?: string | null;
  /** 행동별 세부(JSON 문자열). */
  detail?: string | null;
  createdAt: string;
};

export type AuditLogPage = { items: AuditLogItem[]; nextCursor?: string | null };

const ACTION_LABEL: Record<string, string> = {
  EVENT_CREATED: "행사를 만들었어요",
  EVENT_CLONED: "행사를 복제했어요",
  EVENT_SETTINGS_CHANGED: "행사 설정을 바꿨어요",
  EVENT_PUBLISHED: "행사를 게시했어요",
  EVENT_PAUSED: "촬영을 일시 중지했어요",
  EVENT_RESUMED: "촬영을 다시 열었어요",
  EVENT_CAPTURE_CLOSED: "촬영을 종료했어요",
  PHOTO_DELETED: "사진을 지웠어요",
  EXPORT_CREATED: "사진 묶음을 만들었어요",
  EXPORT_DOWNLOADED: "사진 묶음을 받았어요",
  MEMBER_INVITED: "멤버를 초대했어요",
  MEMBER_JOINED: "멤버가 들어왔어요",
  MEMBER_LEFT: "멤버가 나갔어요",
  MEMBER_REMOVED: "멤버를 내보냈어요",
  MEMBER_ROLE_CHANGED: "멤버 역할을 바꿨어요",
  CUSTOMER_INVITED: "행사 고객을 초대했어요",
  CUSTOMER_JOINED: "행사 고객이 들어왔어요",
  INVITATION_REVOKED: "초대를 취소했어요",
  GRANT_CHANGED: "행사 권한을 바꿨어요",
  GRANT_REVOKED: "행사 권한을 거뒀어요",
  OPERATOR_ASSIGNED: "운영 담당을 맡겼어요",
  PROJECT_CREATED: "프로젝트를 만들었어요",
  PROJECT_CHANGED: "프로젝트를 바꿨어요",
  PROJECT_MEMBER_CHANGED: "프로젝트 담당을 바꿨어요",
  PROJECT_MEMBER_REMOVED: "프로젝트 담당을 뺐어요",
  WORKSPACE_BRAND_DEFAULTS_CHANGED: "공간 기본값을 바꿨어요",
  BOOTH_DEVICE_CREATED: "부스 기기를 추가했어요",
  BOOTH_DEVICE_REVOKED: "부스 기기 연결을 끊었어요",
  BOOTH_CODE_REISSUED: "부스 연결 코드를 다시 만들었어요",
  BOOTH_PAIRED: "부스 기기를 연결했어요",
  BOOTH_PAIRING_LOCKED: "틀린 시도가 많아 부스 연결 코드를 잠갔어요",
  CONTRACT_CREATED: "계약을 만들었어요",
  CONTRACT_DRAFT: "계약을 초안으로 되돌렸어요",
  CONTRACT_ACTIVE: "계약을 시작했어요",
  CONTRACT_ENDED: "계약을 끝냈어요",
  CONTRACT_CANCELLED: "계약을 취소했어요",
  CONTRACT_PAYMENT_VERIFIED: "계약 결제를 확인했어요",
  ENTITLEMENT_GRANTED: "이용권을 열었어요",
  ENTITLEMENT_ALLOCATED: "행사에 사용량을 배분했어요",
  ENTITLEMENT_RESIZED: "행사 배분량을 바꿨어요",
  ENTITLEMENT_REVOKED: "이용권을 회수했어요",
  ENTITLEMENT_USAGE_ALERT: "이용권 사용량이 알림 기준을 넘었어요",
};

function formatTime(iso: string) {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? "-"
    : date.toLocaleString("ko-KR", { year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit" });
}

/** 모르는 행동은 코드 그대로 보인다 — 기록을 숨기는 것보다 낫다. */
function actionLabel(action: string) {
  return ACTION_LABEL[action] ?? action;
}

/**
 * 감사 로그(누가 언제 무엇을 했나). CMS 전체 기록과 Studio 공간 기록이 같은 모양을 쓴다.
 * 고치는 기능은 없다 — 읽기 전용 장부다. 첫 쪽은 나타날 때 받고, 나머지는 「더 보기」로 잇는다.
 */
export function AuditLogList({
  load,
  errorMessage,
  emptyCopy = "아직 기록이 없어요.",
  eventNames,
}: {
  load: (cursor: string | null) => Promise<AuditLogPage>;
  errorMessage: (cause: unknown) => string;
  emptyCopy?: string;
  /** 행사 id → 이름. 아는 행사는 이름으로 보여 준다. 모르는 행사(지운 행사 등)는 id 그대로다. */
  eventNames?: ReadonlyMap<string, string>;
}) {
  const [items, setItems] = useState<AuditLogItem[] | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  // 첫 쪽을 다시 받으면 그 전에 시작한 응답은 버린다.
  const generationRef = useRef(0);

  const loadFirst = useCallback(async () => {
    const generation = ++generationRef.current;
    try {
      const page = await load(null);
      if (generation !== generationRef.current) return;
      setItems(page.items);
      setNextCursor(page.nextCursor ?? null);
      setError(null);
    } catch (cause) {
      if (generation === generationRef.current) setError(errorMessage(cause));
    }
  }, [load, errorMessage]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 마운트 시 1회 원격 조회
    void loadFirst();
  }, [loadFirst]);

  const loadMore = async () => {
    if (!nextCursor) return;
    const generation = generationRef.current;
    setLoadingMore(true);
    try {
      const page = await load(nextCursor);
      if (generation !== generationRef.current) return;
      setItems((prev) => [...(prev ?? []), ...page.items]);
      setNextCursor(page.nextCursor ?? null);
      setError(null);
    } catch (cause) {
      if (generation === generationRef.current) setError(errorMessage(cause));
    } finally {
      setLoadingMore(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      {error ? (
        <div className="flex flex-col items-start gap-3">
          <p role="alert" className="text-[14px] text-(--hc-danger)">
            {error}
          </p>
          <button
            type="button"
            onClick={() => void (items ? loadMore() : loadFirst())}
            className="hc-button-secondary h-11 rounded-full px-4 text-[13px] font-semibold"
          >
            다시 시도
          </button>
        </div>
      ) : null}
      {items === null && !error ? (
        <p role="status" className="text-[14px] text-(--hc-muted)">
          기록을 불러오는 중…
        </p>
      ) : null}
      {items?.length === 0 ? <p className="text-[14px] text-(--hc-muted)">{emptyCopy}</p> : null}
      {items && items.length > 0 ? (
        <ol className="flex flex-col divide-y divide-(--hc-border)">
          {items.map((item, index) => (
            <li key={`${item.createdAt}:${item.action}:${index}`} className="flex flex-col gap-0.5 py-3">
              <p className="text-[14px] font-semibold">{actionLabel(item.action)}</p>
              <p className="text-[12px] text-(--hc-muted)">
                <span className="font-mono tabular-nums">{formatTime(item.createdAt)}</span>
                {" · "}
                {item.actorName?.trim() || "시스템"}
                {item.eventId ? (
                  eventNames?.get(item.eventId) ? (
                    <>{` · ${eventNames.get(item.eventId)}`}</>
                  ) : (
                    <>
                      {" · "}행사 <span className="font-mono">{item.eventId}</span>
                    </>
                  )
                ) : null}
              </p>
              {item.detail ? (
                <details className="text-[12px] text-(--hc-muted)">
                  <summary className="flex min-h-9 cursor-pointer items-center">자세히</summary>
                  <p className="break-all font-mono leading-relaxed">{item.detail}</p>
                </details>
              ) : null}
            </li>
          ))}
        </ol>
      ) : null}
      {nextCursor && !error ? (
        <button
          type="button"
          disabled={loadingMore}
          onClick={() => void loadMore()}
          className="hc-button-secondary h-11 self-start rounded-full px-4 text-[13px] font-semibold disabled:opacity-50"
        >
          {loadingMore ? "불러오는 중…" : "더 보기"}
        </button>
      ) : null}
    </div>
  );
}

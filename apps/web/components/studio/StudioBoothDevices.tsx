"use client";

import { useCallback, useEffect, useState } from "react";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { getUserFacingApiErrorMessage } from "@/lib/apiError";
import { withRequestDeadline } from "@/lib/requestDeadline";
import {
  BOOTH_DEVICE_NAME_MAX,
  MAX_BOOTH_DEVICES,
  createBoothDevice,
  listBoothDevices,
  reissuePairingCode,
  revokeBoothDevice,
  type BoothDevice,
} from "@/lib/studio/studioApi";

const STATUS_LABEL: Record<BoothDevice["status"], string> = {
  PENDING_PAIRING: "연결 대기",
  ACTIVE: "연결됨",
  REVOKED: "해제됨",
};

/**
 * 확인 창에서 보내는 교체·해제의 종료 상한. 확인 창은 도는 동안 닫히지 않으므로(ConfirmDialog), 회선이 응답 없이
 * 멈추면 운영자가 화면에서 빠져나올 길이 없다. 넘기면 결과를 모른다고 말하고 목록을 다시 받는다.
 */
const ACTION_DEADLINE_MS = 20_000;
/** 연결 대기 중인 기기에 코드를 띄워 둔 동안, 다른 기기에서 그 코드를 쓴 것을 알아채는 간격. */
const PAIRING_POLL_MS = 5_000;

function isAbort(cause: unknown) {
  return cause instanceof DOMException && cause.name === "AbortError";
}

/** 방금 받은 연결 코드. 목록 응답에는 코드가 없어서(서버는 해시만 둔다) 받은 자리에서만 보여 준다. */
type IssuedCode = {
  code: string;
  expiresAt: number;
  /** 연결 대기 기기에 받은 코드인가 — 그 기기가 연결되면 코드를 걷는다. 교체용 코드는 연결된 기기에서 받는다. */
  pending: boolean;
};

function remainingText(expiresAt: number, now: number) {
  const seconds = Math.max(0, Math.round((expiresAt - now) / 1000));
  if (seconds === 0) return "만료됐어요";
  return `${Math.floor(seconds / 60)}분 ${String(seconds % 60).padStart(2, "0")}초 남음`;
}

/**
 * Studio 「부스 관리」(R5 9절, 백엔드 fork #19). 기기 등록 → 연결 코드를 부스 화면(`/booth`)에 입력 → 연결됨.
 *
 * 코드는 10분짜리 일회용이고 운영자만 본다 — 참가자에게 나눠 주는 행사 링크와 다르다(R5 「서로 다른 세 링크·코드」).
 */
export function StudioBoothDevices({ eventId, boothUrl }: { eventId: string; boothUrl: string }) {
  const [devices, setDevices] = useState<BoothDevice[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [codes, setCodes] = useState<Record<string, IssuedCode>>({});
  const [confirm, setConfirm] = useState<null | { kind: "revoke" | "replace"; device: BoothDevice }>(null);
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(async () => {
    try {
      const list = await listBoothDevices(eventId);
      setDevices(list);
      // 연결 대기일 때 받은 코드는 기기가 연결되면(다른 상태가 되면) 더 쓸 데가 없다.
      setCodes((prev) => {
        const next = { ...prev };
        for (const device of list) {
          if (next[device.deviceId]?.pending && device.status !== "PENDING_PAIRING") delete next[device.deviceId];
        }
        return next;
      });
      setError(null);
    } catch (cause) {
      setError(getUserFacingApiErrorMessage(cause, "부스 기기 목록을 불러오지 못했어요."));
    }
  }, [eventId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 마운트 시 1회 원격 조회
    void load();
  }, [load]);

  // 코드가 떠 있을 때만 남은 시간을 1초마다 다시 그린다.
  const hasCode = Object.keys(codes).length > 0;
  useEffect(() => {
    if (!hasCode) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [hasCode]);

  // 연결 대기 기기에 코드가 떠 있는 동안만 다시 묻는다 — 다른 태블릿에서 코드를 쓰면 여기서 알아챈다.
  const waitingPairing = Object.values(codes).some((c) => c.pending);
  useEffect(() => {
    if (!waitingPairing) return;
    const timer = window.setInterval(() => void load(), PAIRING_POLL_MS);
    return () => window.clearInterval(timer);
  }, [waitingPairing, load]);

  const remember = (device: BoothDevice) => {
    if (!device.pairingCode || !device.pairingExpiresAt) return;
    const expiresAt = Date.parse(device.pairingExpiresAt);
    setCodes((prev) => ({
      ...prev,
      [device.deviceId]: { code: device.pairingCode!, expiresAt, pending: device.status === "PENDING_PAIRING" },
    }));
    // 받은 순간의 남은 시간을 바로 보인다(다음 1초 틱을 기다리지 않는다).
    setNow(() => Date.now());
  };

  const replaceInList = (device: BoothDevice) =>
    setDevices((prev) => {
      const list = prev ?? [];
      const found = list.some((d) => d.deviceId === device.deviceId);
      // 응답의 코드는 목록에 두지 않는다 — 코드는 codes 가 따로 들고, 목록은 서버 목록과 같은 모양을 지킨다.
      const plain = { ...device, pairingCode: undefined };
      return found ? list.map((d) => (d.deviceId === device.deviceId ? plain : d)) : [...list, plain];
    });

  const run = async (key: string, task: () => Promise<void>, fallback: string) => {
    setBusy(key);
    setNotice(null);
    try {
      await task();
    } catch (cause) {
      if (isAbort(cause)) {
        // 서버가 이미 처리했을 수도 있다 — 실패라고 단정하지 않고 지금 상태를 다시 받는다.
        setNotice("응답이 늦어 결과를 확인하지 못했어요. 목록을 다시 불러왔어요.");
        void load();
      } else {
        setNotice(getUserFacingApiErrorMessage(cause, fallback));
      }
    } finally {
      setBusy(null);
    }
  };

  const add = () =>
    run(
      "add",
      async () => {
        const device = await createBoothDevice(eventId, name.trim());
        replaceInList(device);
        remember(device);
        setName("");
      },
      "부스 기기를 추가하지 못했어요.",
    );

  const reissue = (device: BoothDevice) =>
    run(
      device.deviceId,
      async () => {
        const next = await withRequestDeadline(ACTION_DEADLINE_MS, (signal) => reissuePairingCode(device.deviceId, signal));
        replaceInList(next);
        remember(next);
      },
      "연결 코드를 다시 받지 못했어요.",
    );

  const revoke = (device: BoothDevice) =>
    run(
      device.deviceId,
      async () => {
        replaceInList(await withRequestDeadline(ACTION_DEADLINE_MS, (signal) => revokeBoothDevice(device.deviceId, signal)));
        setCodes((prev) => {
          const next = { ...prev };
          delete next[device.deviceId];
          return next;
        });
      },
      "기기를 해제하지 못했어요.",
    );

  if (error) {
    return (
      <div className="flex flex-col gap-2">
        <p role="alert" className="text-[13px] text-(--hc-danger)">
          {error}
        </p>
        <button type="button" onClick={() => void load()} className="hc-button-secondary h-11 self-start rounded-full px-4 text-[13px] font-semibold">
          다시 불러오기
        </button>
      </div>
    );
  }
  if (!devices) return <p className="text-[13px] text-(--hc-muted)">부스 기기를 불러오는 중…</p>;

  const live = devices.filter((d) => d.status !== "REVOKED");
  const nameOk = name.trim().length > 0 && name.trim().length <= BOOTH_DEVICE_NAME_MAX;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => void load()}
          className="h-11 rounded-full border border-(--hc-border) px-3 text-[13px] font-semibold"
        >
          새로고침
        </button>
      </div>
      <p className="text-[13px] text-(--hc-muted)">
        부스로 쓸 태블릿이나 PC 에서 <span className="font-semibold text-(--hc-text)">{boothUrl}</span> 를 열고 아래 연결
        코드를 입력해요. 코드는 10분 동안 한 번만 쓸 수 있고, 참가자에게 나눠 주는 링크가 아니에요.
      </p>

      {notice ? (
        <p role="alert" className="text-[13px] text-(--hc-danger)">
          {notice}
        </p>
      ) : null}

      {devices.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {devices.map((device) => {
            const issued = codes[device.deviceId];
            const revoked = device.status === "REVOKED";
            return (
              <li key={device.deviceId} className="hc-surface-well flex flex-col gap-2 rounded-2xl p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="min-w-0">
                    <span className="block truncate text-[14px] font-semibold">{device.name}</span>
                    <span className="block text-[12px] text-(--hc-muted)">{STATUS_LABEL[device.status]}</span>
                  </span>
                  {revoked ? null : (
                    <span className="flex gap-2">
                      <button
                        type="button"
                        disabled={busy !== null}
                        onClick={() =>
                          device.status === "ACTIVE" ? setConfirm({ kind: "replace", device }) : void reissue(device)
                        }
                        className="h-11 rounded-full border border-(--hc-border) px-3 text-[13px] font-semibold disabled:opacity-50"
                      >
                        {device.status === "ACTIVE" ? "다른 기기로 바꾸기" : "코드 다시 받기"}
                      </button>
                      <button
                        type="button"
                        disabled={busy !== null}
                        onClick={() => setConfirm({ kind: "revoke", device })}
                        className="h-11 rounded-full border border-(--hc-danger-border) px-3 text-[13px] font-semibold text-(--hc-danger) disabled:opacity-50"
                      >
                        해제
                      </button>
                    </span>
                  )}
                </div>
                {issued && !revoked ? (
                  <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1" aria-live="polite">
                    <span className="font-mono text-[24px] font-extrabold tracking-[0.2em]">{issued.code}</span>
                    <span className="text-[12px] text-(--hc-muted)">{remainingText(issued.expiresAt, now)}</span>
                  </p>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-[13px] text-(--hc-muted)">아직 연결한 부스 기기가 없어요.</p>
      )}

      {live.length < MAX_BOOTH_DEVICES ? (
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (nameOk && busy === null) void add();
          }}
        >
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <label htmlFor="studio-booth-name" className="text-[13px] font-semibold">
              기기 이름
            </label>
            <input
              id="studio-booth-name"
              className="hc-input h-11 rounded-xl border px-3 text-[14px]"
              value={name}
              maxLength={BOOTH_DEVICE_NAME_MAX}
              onChange={(e) => setName(e.target.value)}
              placeholder="예: 입구 부스"
            />
          </div>
          <button
            type="submit"
            disabled={!nameOk || busy !== null}
            className="hc-button-secondary h-11 rounded-full px-4 text-[13px] font-semibold disabled:opacity-50"
          >
            {busy === "add" ? "추가하는 중…" : "기기 추가"}
          </button>
        </form>
      ) : (
        <p className="text-[13px] text-(--hc-muted)">
          이 행사에는 부스 기기를 {MAX_BOOTH_DEVICES}대까지 연결할 수 있어요. 쓰지 않는 기기를 해제하면 자리가 나요.
        </p>
      )}

      {confirm ? (
        <ConfirmDialog
          title={confirm.kind === "revoke" ? `「${confirm.device.name}」 기기를 해제할까요?` : "다른 기기로 바꿀까요?"}
          description={
            confirm.kind === "revoke"
              ? "이 기기는 더 이상 이 행사에 연결되지 않고, 진행 중인 촬영도 끝나요. 다시 쓰려면 기기를 새로 추가해야 해요."
              : "새 연결 코드를 받아요. 새 기기에서 그 코드를 입력하는 순간 지금 연결된 기기는 끊겨요."
          }
          confirmLabel={confirm.kind === "revoke" ? "해제" : "새 코드 받기"}
          runningLabel="처리하는 중…"
          running={busy === confirm.device.deviceId}
          destructive={confirm.kind === "revoke"}
          onClose={() => setConfirm(null)}
          onConfirm={async () => {
            const { kind, device } = confirm;
            if (kind === "revoke") await revoke(device);
            else await reissue(device);
            setConfirm(null);
          }}
        />
      ) : null}
    </div>
  );
}

"use client";

/**
 * 행사 자격을 기기에 보관하는 곳(ADR-0007 §1: 자격은 헤더로만, 쿠키 없음).
 *
 *  - 개인 휴대폰 참가자(BYOD): 행사마다 따로 localStorage 에 둔다. 같은 브라우저의 두 탭이 서로
 *    다른 행사에 참여해도 덮어쓰지 않는다(R5 14절). 새로고침·재방문 때 세션 복원 API 로 확인한다.
 *  - 부스 기기: 기기 자격 하나를 localStorage 에 둔다. 연결 코드로 받은 것이다.
 *  - 부스 손님의 참가자 자격은 **여기 두지 않는다** — 메모리에만 둔다. 다음 손님에게 넘어가면
 *    안 되고, 새로고침·재시작 뒤 이전 손님의 회차를 이어 가지 않는다(R5 4절).
 *
 * 개인 서비스의 초안·로그인 상태와 섞지 않는다. 여기를 지워도 그쪽은 남고, 그 반대도 같다.
 */
const PARTICIPANT_PREFIX = "harucut:event:participant:";
const BOOTH_KEY = "harucut:event:booth-device";

export type StoredParticipant = { token: string; participantId: string; expiresAt: string };
export type StoredBoothDevice = { token: string; deviceId: string; eventId: string };

function read<T>(key: string): T | null {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // 저장소가 막힌 브라우저(비공개 모드 등) — 이번 방문 동안만 메모리 자격으로 이어 간다.
  }
}

function remove(key: string) {
  try {
    window.localStorage.removeItem(key);
  } catch {}
}

export function readParticipant(eventId: string, now = Date.now()): StoredParticipant | null {
  const stored = read<StoredParticipant>(`${PARTICIPANT_PREFIX}${eventId}`);
  if (!stored?.token || !stored.expiresAt) return null;
  if (Date.parse(stored.expiresAt) <= now) {
    remove(`${PARTICIPANT_PREFIX}${eventId}`);
    return null;
  }
  return stored;
}

export function saveParticipant(eventId: string, value: StoredParticipant) {
  write(`${PARTICIPANT_PREFIX}${eventId}`, value);
}

export function forgetParticipant(eventId: string) {
  remove(`${PARTICIPANT_PREFIX}${eventId}`);
}

export function readBoothDevice(): StoredBoothDevice | null {
  const stored = read<StoredBoothDevice>(BOOTH_KEY);
  return stored?.token ? stored : null;
}

export function saveBoothDevice(value: StoredBoothDevice) {
  write(BOOTH_KEY, value);
}

export function forgetBoothDevice() {
  remove(BOOTH_KEY);
}

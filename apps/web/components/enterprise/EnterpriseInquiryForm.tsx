"use client";

import { useMemo, useState } from "react";
import { Check, Copy, Mail, Send } from "lucide-react";
import { withJosa } from "@harucut/shared";
import { COMPANY } from "@/constants/company";
import { getUserFacingApiErrorMessage } from "@/lib/apiError";
import { INQUIRY_MESSAGE_MAX, submitInquiry, type InquiryRequest } from "@/lib/inquiryApi";

const TEXT_FIELDS = [
  { id: "org", label: "단체·회사 이름", placeholder: "예: 하루컷 팬미팅 준비위원회", required: true, maxLength: 100, type: "text" },
  { id: "eventName", label: "행사 이름", placeholder: "예: 2026 여름 팬미팅", required: true, maxLength: 100, type: "text" },
  { id: "contactName", label: "담당자 이름", placeholder: "예: 김하루", required: true, maxLength: 50, type: "text" },
  { id: "email", label: "회신받을 이메일", placeholder: "you@example.com", required: true, maxLength: 120, type: "email" },
  { id: "phone", label: "전화번호", placeholder: "예: 010-1234-5678", required: false, maxLength: 30, type: "tel" },
  { id: "place", label: "장소", placeholder: "예: 서울 성수동 ○○홀", required: false, maxLength: 100, type: "text" },
] as const;

type FieldId = (typeof TEXT_FIELDS)[number]["id"];
type Channel = InquiryRequest["channels"][number];

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const ORGANIZER_LABEL: Record<InquiryRequest["organizerType"], string> = {
  BUSINESS: "기업·단체 행사",
  PERSONAL: "개인 행사(결혼식·돌잔치 등)",
};
const CHANNEL_LABEL: Record<Channel, string> = { BYOD: "참가자 휴대폰(QR)", BOOTH: "현장 부스(태블릿)" };

/**
 * 예상 인원 칸 값 → 정수. `type="number"` 는 `1e3` 같은 지수 표기도 받으므로 parseInt 가 아니라 Number 로 통째로
 * 바꾼다(parseInt 는 1 로 읽는다, Codex #545). 비었거나 0 이상의 안전한 정수가 아니면 undefined.
 */
function parseCount(text: string): number | undefined {
  if (!text.trim()) return undefined;
  const n = Number(text);
  return Number.isSafeInteger(n) && n >= 0 ? n : undefined;
}

/**
 * 행사 도입 문의.
 *
 * 문의는 서버에 저장한다(ADR-0008 §6-1) — 하루컷 운영 CMS 가 상담 상태를 남기고 계약 · 이용권으로 잇는다.
 * 메일 본문 만들기 · 복사는 저장과 다른 기능이라 그대로 둔다. 저장이 막혀도(빈도 초과 · 연결 실패) 문의할 길이 남는다.
 * 행사 이름은 계약 전 상담용이다 — 행사 참가 링크를 만들지 않는다(R5 D01).
 */
export function EnterpriseInquiryForm() {
  const [values, setValues] = useState<Record<FieldId, string>>({
    org: "",
    eventName: "",
    contactName: "",
    email: "",
    phone: "",
    place: "",
  });
  const [organizerType, setOrganizerType] = useState<InquiryRequest["organizerType"]>("BUSINESS");
  const [channels, setChannels] = useState<Channel[]>(["BYOD"]);
  const [date, setDate] = useState("");
  const [people, setPeople] = useState("");
  const [memo, setMemo] = useState("");
  const [copied, setCopied] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);

  const missing = [
    ...TEXT_FIELDS.filter((field) => field.required && !values[field.id].trim()).map((field) => field.label),
    ...(channels.length === 0 ? ["참가 방식"] : []),
  ];
  const emailInvalid = values.email.trim() !== "" && !EMAIL.test(values.email.trim());
  const canSend = missing.length === 0 && !emailInvalid;

  const message = useMemo(() => {
    const lines = [
      `단체·회사 이름: ${values.org.trim() || "-"}`,
      `행사 이름: ${values.eventName.trim() || "-"}`,
      `장소: ${values.place.trim() || "-"}`,
    ];
    if (memo.trim()) lines.push("", "하고 싶은 말:", memo.trim());
    return lines.join("\n").slice(0, INQUIRY_MESSAGE_MAX);
  }, [memo, values.eventName, values.org, values.place]);

  const subject = `[하루컷 행사 도입 문의] ${values.org.trim() || "단체명 미기재"} · ${values.eventName.trim() || "행사명 미기재"}`;
  const mailBody = [
    message,
    "",
    `담당자: ${values.contactName.trim() || "-"}`,
    `이메일: ${values.email.trim() || "-"}`,
    `전화번호: ${values.phone.trim() || "-"}`,
    // 저장이 막혀 메일·복사로 보내도 고른 값이 담당자에게 가야 한다(Codex #545).
    `행사 형태: ${ORGANIZER_LABEL[organizerType]}`,
    `참가 방식: ${channels.map((c) => CHANNEL_LABEL[c]).join(", ") || "-"}`,
    `행사 날짜: ${date || "-"}`,
    `예상 참가 인원: ${parseCount(people) ?? (people.trim() || "-")}`,
  ].join("\n");
  const mailtoHref = `mailto:${COMPANY.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(mailBody)}`;

  const handleSubmit = async () => {
    if (!canSend || sending) return;
    setSending(true);
    setError(null);
    const count = parseCount(people);
    try {
      const { inquiryId } = await submitInquiry({
        contactName: values.contactName.trim(),
        email: values.email.trim(),
        ...(values.phone.trim() ? { phone: values.phone.trim() } : {}),
        organizerType,
        channels,
        ...(date ? { expectedDate: date } : {}),
        ...(count !== undefined ? { expectedCount: count } : {}),
        message,
      });
      setSent(inquiryId);
    } catch (cause) {
      setError(getUserFacingApiErrorMessage(cause, "문의를 남기지 못했어요. 잠시 후 다시 시도하거나 메일로 보내 주세요."));
    } finally {
      setSending(false);
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(`받는 사람: ${COMPANY.email}\n제목: ${subject}\n\n${mailBody}`);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2400);
    } catch {
      // 클립보드가 막힌 환경에서는 아래 메일 주소를 직접 쓰면 된다.
      setCopied(false);
    }
  };

  if (sent) {
    return (
      <div role="status" className="flex flex-col gap-2">
        <p className="text-[18px] font-extrabold">문의를 받았어요.</p>
        <p className="text-[14px] leading-[1.7] text-(--hc-muted)">
          {COMPANY.hours} 안에 {values.email.trim()} 로 연락드릴게요. 접수 번호는 {sent} 이에요.
        </p>
      </div>
    );
  }

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        void handleSubmit();
      }}
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {TEXT_FIELDS.map((field) => (
          <label key={field.id} className="flex min-w-0 flex-col gap-1.5">
            <span className="text-[12px] font-bold text-(--hc-text)">
              {field.label}
              {field.required ? (
                <span className="ml-1 text-(--hc-danger)">*</span>
              ) : (
                <span className="ml-1 font-medium text-(--hc-muted)">(선택)</span>
              )}
            </span>
            <input
              type={field.type}
              value={values[field.id]}
              onChange={(event) => setValues((prev) => ({ ...prev, [field.id]: event.target.value }))}
              placeholder={field.placeholder}
              required={field.required}
              maxLength={field.maxLength}
              className="hc-input h-11 w-full rounded-xl border px-3.5 text-[14px]"
            />
          </label>
        ))}
        <label className="flex min-w-0 flex-col gap-1.5">
          <span className="text-[12px] font-bold text-(--hc-text)">
            행사 날짜<span className="ml-1 font-medium text-(--hc-muted)">(선택)</span>
          </span>
          <input
            type="date"
            value={date}
            onChange={(event) => setDate(event.target.value)}
            className="hc-input h-11 w-full rounded-xl border px-3.5 text-[14px]"
          />
        </label>
        <label className="flex min-w-0 flex-col gap-1.5">
          <span className="text-[12px] font-bold text-(--hc-text)">
            예상 참가 인원<span className="ml-1 font-medium text-(--hc-muted)">(선택)</span>
          </span>
          <input
            type="number"
            min={0}
            inputMode="numeric"
            value={people}
            onChange={(event) => setPeople(event.target.value)}
            placeholder="예: 200"
            className="hc-input h-11 w-full rounded-xl border px-3.5 text-[14px]"
          />
        </label>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <fieldset className="flex flex-col gap-1.5">
          <legend className="mb-1.5 text-[12px] font-bold text-(--hc-text)">
            행사 형태<span className="ml-1 text-(--hc-danger)">*</span>
          </legend>
          {(
            [
              ["BUSINESS", "기업·단체 행사"],
              ["PERSONAL", "개인 행사(결혼식·돌잔치 등)"],
            ] as const
          ).map(([value, label]) => (
            <label key={value} className="flex min-h-11 items-center gap-2 text-[14px]">
              <input
                type="radio"
                name="organizerType"
                className="size-5"
                checked={organizerType === value}
                onChange={() => setOrganizerType(value)}
              />
              {label}
            </label>
          ))}
        </fieldset>
        <fieldset className="flex flex-col gap-1.5">
          <legend className="mb-1.5 text-[12px] font-bold text-(--hc-text)">
            참가 방식<span className="ml-1 text-(--hc-danger)">*</span>
          </legend>
          {(
            [
              ["BYOD", "참가자 휴대폰(QR)"],
              ["BOOTH", "현장 부스(태블릿)"],
            ] as const
          ).map(([value, label]) => (
            <label key={value} className="flex min-h-11 items-center gap-2 text-[14px]">
              <input
                type="checkbox"
                className="size-5"
                checked={channels.includes(value)}
                onChange={(event) =>
                  setChannels((prev) => (event.target.checked ? [...prev, value] : prev.filter((c) => c !== value)))
                }
              />
              {label}
            </label>
          ))}
        </fieldset>
      </div>

      <label className="flex flex-col gap-1.5">
        <span className="text-[12px] font-bold text-(--hc-text)">
          하고 싶은 말
          <span className="ml-1 font-medium text-(--hc-muted)">(선택)</span>
        </span>
        <textarea
          value={memo}
          onChange={(event) => setMemo(event.target.value)}
          rows={4}
          maxLength={1500}
          placeholder="원하는 프레임 분위기, 브랜드 로고 사용 여부, 현장 상황 등 무엇이든 적어 주세요."
          className="hc-input w-full rounded-xl border px-3.5 py-3 text-[14px] leading-[1.6]"
        />
      </label>

      {error ? (
        <p role="alert" className="text-[13px] text-(--hc-danger)">
          {error}
        </p>
      ) : null}

      <div className="flex flex-col gap-2 sm:flex-row">
        <button
          type="submit"
          disabled={!canSend || sending}
          className="hc-button-primary inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-full px-6 text-[15px] font-extrabold transition disabled:opacity-40"
        >
          <Send aria-hidden className="h-4 w-4" />
          {sending ? "보내는 중…" : "문의 남기기"}
        </button>
        <a
          href={canSend ? mailtoHref : undefined}
          aria-disabled={!canSend}
          onClick={(event) => {
            if (!canSend) event.preventDefault();
          }}
          className={[
            "hc-button-secondary inline-flex h-12 items-center justify-center gap-2 rounded-full border px-6 text-[14px] font-semibold transition",
            canSend ? "" : "pointer-events-none opacity-40",
          ].join(" ")}
        >
          <Mail aria-hidden className="h-4 w-4" />
          메일로 보내기
        </a>
        <button
          type="button"
          onClick={() => void handleCopy()}
          className="hc-button-secondary inline-flex h-12 items-center justify-center gap-2 rounded-full border px-6 text-[14px] font-semibold transition"
        >
          {copied ? <Check aria-hidden className="h-4 w-4" /> : <Copy aria-hidden className="h-4 w-4" />}
          {copied ? "복사했어요" : "내용 복사"}
        </button>
      </div>

      <p role="status" className="text-[12px] leading-[1.6] text-(--hc-muted)">
        {emailInvalid
          ? "이메일 주소를 확인해 주세요."
          : canSend
            ? `${COMPANY.hours} 안에 연락드려요. 메일이 편하면 ${COMPANY.email} 로 보내 주셔도 돼요.`
            : `${withJosa(missing.join(", "), "을/를")} 채우면 문의를 남길 수 있어요.`}
      </p>
    </form>
  );
}

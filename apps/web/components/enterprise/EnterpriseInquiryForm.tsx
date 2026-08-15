"use client";

import { useMemo, useState } from "react";
import { Check, Copy, Mail } from "lucide-react";
import { COMPANY } from "@/constants/company";

const FIELDS = [
  {
    id: "org",
    label: "단체·회사 이름",
    placeholder: "예: 하루컷 팬미팅 준비위원회",
    required: true,
  },
  {
    id: "eventName",
    label: "행사 이름",
    placeholder: "예: 2026 여름 팬미팅",
    required: true,
  },
  { id: "date", label: "행사 일시", placeholder: "예: 2026년 9월 12일 14:00~18:00", required: true },
  { id: "place", label: "장소", placeholder: "예: 서울 성수동 ○○홀", required: false },
  { id: "people", label: "예상 참가 인원", placeholder: "예: 200명", required: false },
  { id: "contact", label: "회신받을 연락처", placeholder: "이메일 또는 전화번호", required: true },
] as const;

type FieldId = (typeof FIELDS)[number]["id"];

/**
 * 행사 도입 문의.
 *
 * 예전에는 `mailto:` 링크 하나였다. 눌러도 빈 메일 창이 열려서, 문의하는 쪽은 무엇을
 * 적어야 할지 몰랐고 받는 쪽은 매번 같은 것을 되물어야 했다(행사가 언제인지, 몇 명인지).
 * 필요한 것을 미리 묻고, 메일 본문까지 채워서 연다. 메일 앱이 없을 수 있으니
 * 같은 내용을 복사하는 길도 함께 둔다.
 */
export function EnterpriseInquiryForm() {
  const [values, setValues] = useState<Record<FieldId, string>>({
    org: "",
    eventName: "",
    date: "",
    place: "",
    people: "",
    contact: "",
  });
  const [memo, setMemo] = useState("");
  const [copied, setCopied] = useState(false);

  const missing = FIELDS.filter((field) => field.required && !values[field.id].trim());
  const canSend = missing.length === 0;

  const subject = useMemo(
    () =>
      `[하루컷 행사 도입 문의] ${values.org.trim() || "단체명 미기재"} · ${
        values.eventName.trim() || "행사명 미기재"
      }`,
    [values.org, values.eventName],
  );

  const body = useMemo(() => {
    const lines = FIELDS.map(
      (field) => `${field.label}: ${values[field.id].trim() || "-"}`,
    );
    if (memo.trim()) lines.push("", "하고 싶은 말:", memo.trim());
    return lines.join("\n");
  }, [memo, values]);

  const mailtoHref = `mailto:${COMPANY.email}?subject=${encodeURIComponent(
    subject,
  )}&body=${encodeURIComponent(body)}`;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(`받는 사람: ${COMPANY.email}\n제목: ${subject}\n\n${body}`);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2400);
    } catch {
      // 클립보드가 막힌 환경에서는 아래 메일 주소를 직접 쓰면 된다.
      setCopied(false);
    }
  };

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => event.preventDefault()}
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {FIELDS.map((field) => (
          <label key={field.id} className="flex min-w-0 flex-col gap-1.5">
            <span className="text-[12px] font-bold text-[color:var(--hc-text)]">
              {field.label}
              {field.required ? (
                <span className="ml-1 text-[color:var(--hc-danger)]">*</span>
              ) : (
                <span className="ml-1 font-medium text-[color:var(--hc-muted)]">
                  (선택)
                </span>
              )}
            </span>
            <input
              value={values[field.id]}
              onChange={(event) =>
                setValues((prev) => ({ ...prev, [field.id]: event.target.value }))
              }
              placeholder={field.placeholder}
              required={field.required}
              className="hc-input h-11 w-full rounded-xl border px-3.5 text-[14px]"
            />
          </label>
        ))}
      </div>

      <label className="flex flex-col gap-1.5">
        <span className="text-[12px] font-bold text-[color:var(--hc-text)]">
          하고 싶은 말
          <span className="ml-1 font-medium text-[color:var(--hc-muted)]">(선택)</span>
        </span>
        <textarea
          value={memo}
          onChange={(event) => setMemo(event.target.value)}
          rows={4}
          placeholder="원하는 프레임 분위기, 브랜드 로고 사용 여부, 현장 상황 등 무엇이든 적어 주세요."
          className="hc-input w-full rounded-xl border px-3.5 py-3 text-[14px] leading-[1.6]"
        />
      </label>

      <div className="flex flex-col gap-2 sm:flex-row">
        <a
          href={canSend ? mailtoHref : undefined}
          aria-disabled={!canSend}
          onClick={(event) => {
            if (!canSend) event.preventDefault();
          }}
          className={[
            "hc-button-primary inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-full px-6 text-[15px] font-extrabold transition",
            canSend ? "" : "pointer-events-none opacity-40",
          ].join(" ")}
        >
          <Mail aria-hidden className="h-4 w-4" />
          문의 메일 열기
        </a>
        <button
          type="button"
          onClick={() => void handleCopy()}
          className="hc-button-secondary inline-flex h-12 items-center justify-center gap-2 rounded-full border px-6 text-[14px] font-semibold transition"
        >
          {copied ? (
            <Check aria-hidden className="h-4 w-4" />
          ) : (
            <Copy aria-hidden className="h-4 w-4" />
          )}
          {copied ? "복사했어요" : "내용 복사"}
        </button>
      </div>

      {/*
        메일이 실제로 나가는지는 사용자의 메일 앱에 달려 있다. 보냈다고 단정하지 않고,
        받는 주소를 그대로 보여 준다.
      */}
      <p role="status" className="text-[12px] leading-[1.6] text-[color:var(--hc-muted)]">
        {canSend
          ? `메일 앱이 열리지 않으면 ${COMPANY.email} 로 직접 보내 주세요. ${COMPANY.hours} 안에 답장드려요.`
          : `${missing.map((field) => field.label).join(", ")}을(를) 채우면 메일을 열 수 있어요.`}
      </p>
    </form>
  );
}

import type { ApiEnvelope } from "@/lib/api-types";
import { requireData } from "@/lib/apiEnvelope";
import { clientApi } from "@/lib/clientApi";

/** 행사·기업 도입 문의(백엔드 InquiryRequest). 저장된 문의는 하루컷 운영 CMS 가 계약·이용권으로 잇는다. */
export type InquiryRequest = {
  contactName: string;
  email: string;
  phone?: string;
  organizerType: "PERSONAL" | "BUSINESS";
  channels: Array<"BYOD" | "BOOTH">;
  /** YYYY-MM-DD */
  expectedDate?: string;
  expectedCount?: number;
  message: string;
};

export const INQUIRY_MESSAGE_MAX = 2000;

export async function submitInquiry(body: InquiryRequest): Promise<{ inquiryId: string }> {
  const res = await clientApi.post<ApiEnvelope<{ inquiryId: string }>>("/api/client/public/inquiries", body);
  return requireData(res.data, "문의");
}

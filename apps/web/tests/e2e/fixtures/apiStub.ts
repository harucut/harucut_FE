import type { Page } from "@playwright/test";

/**
 * 인증 라우트를 결정적으로 렌더하기 위한 BFF 스텁.
 *
 * 왜 필요한가: 인증 게이트가 미들웨어가 아니라 클라이언트(SessionExpiryBridge)에 있어서,
 * 백엔드가 401을 주면 화면이 /login으로 갈아탄다. 그래서 가짜 쿠키만 심어 두면
 * **백엔드가 떠 있는 개발 머신에서는 인증 라우트 검사가 전부 /login을 검사**하고,
 * 백엔드가 없는 CI에서는(요청이 네트워크 오류로 죽어서) 화면이 그대로 렌더된다.
 * 같은 스펙이 환경에 따라 다른 것을 검사하는 셈이라, 통과가 아무것도 보장하지 못했다.
 *
 * 여기서는 `/api/client/**`를 전부 가로채 고정 응답을 준다. 백엔드 유무와 무관하게
 * 늘 같은 화면을 검사하고, 빈 화면이 아니라 실제 콘텐츠가 있는 상태를 검사한다.
 */

const ENVELOPE = (data: unknown) => ({
  code: "GEN-000",
  status: 200,
  data,
});

const USER_INFO = {
  id: 1,
  email: "a11y@harucut.test",
  username: "접근성점검",
  profileUrl: null,
  loginPlatform: "HARUCUT",
  planTier: "PLUS",
  monthlyPrice: 3900,
};

// 한도를 다 쓰지 않은 상태. 게이지·잔여 문구가 실제로 그려진다.
const SUBSCRIPTION_USAGE = {
  planTier: "PLUS",
  frameRetentionLimit: 3,
  frameRetentionUsedCount: 1,
  frameRetentionRemainingCount: 2,
  frameRetentionUnlimited: false,
};

const FRAMES = [
  {
    frameId: 101,
    title: "여름 바다 4컷",
    description: "파란 배경에 조개 스티커",
    frameType: "CLASSIC",
    background: { type: "COLOR", value: "111827" },
    components: [],
    isSystem: false,
    canvasWidth: 2000,
    canvasHeight: 6000,
  },
];

// createdAt은 서버와 같은 "오프셋 없는 UTC" 형식으로 둔다(parseServerDateTime 경로를 그대로 태운다).
const MEDIA = [
  {
    mediaId: 9001,
    s3Key: "uploads/users/a11y/one.jpg",
    displayName: "동아리 엠티",
    createdAt: "2026-08-14T02:11:00.000000",
  },
  {
    mediaId: 9002,
    s3Key: "uploads/users/a11y/two.jpg",
    displayName: "카페에서",
    createdAt: "2026-08-13T09:40:00.000000",
  },
  /*
    아래 열 건은 "한 화면에 다 안 들어오는 목록"을 만들기 위한 것이다.
    두 건만 있으면 어떤 기록이든 첫 화면에 보여서, 딥링크가 실제로 그 자리로 옮겼는지와
    아무것도 안 하고 맨 위에 머문 것을 구분할 수 없다.
  */
  ...Array.from({ length: 10 }, (_, index) => ({
    mediaId: 9100 + index,
    s3Key: `uploads/users/a11y/fill-${index}.jpg`,
    displayName: `지난 기록 ${index + 1}`,
    createdAt: `2026-07-${String(20 - index).padStart(2, "0")}T04:00:00.000000`,
  })),
];

/** 화면이 실제로 이미지를 그리도록, 로컬 정적 자산을 조회 URL로 돌려준다. */
const PRESIGNED_IMAGE_URL = "/hero-image.png";

/**
 * S3 PUT 자리. 실제 버킷 대신 같은 오리진의 가짜 주소를 주고 아래에서 200으로 받는다.
 * 이게 없으면 업로드가 네트워크 오류로 끝나고, 결과 화면이 영영 만들어지지 않는다.
 */
const S3_STUB_PATH = "/__a11y-s3-put";

export async function stubAuthenticatedApi(page: Page) {
  await page.route("**/api/client/**", async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;

    const json = (data: unknown) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(ENVELOPE(data)),
      });

    const method = route.request().method();

    if (path.endsWith("/user-info")) return json(USER_INFO);
    // 완성된 네컷 업로드: presigned 발급 → S3 PUT → 미디어 등록.
    if (path.endsWith("/files/presigned-upload")) {
      return json({
        key: "uploads/users/a11y/generated.png",
        uploadUrl: `${url.origin}${S3_STUB_PATH}`,
        contentType: "image/png",
      });
    }
    if (path.includes("/user/media") && method === "POST") {
      return json({
        mediaId: 9100,
        s3Key: "uploads/users/a11y/generated.png",
        displayName: "방금 만든 네컷",
        downloadUrl: PRESIGNED_IMAGE_URL,
        createdAt: "2026-08-15T02:11:00.000000",
      });
    }
    if (path.endsWith("/subscription/usage")) return json(SUBSCRIPTION_USAGE);
    if (path.endsWith("/files/presigned-img")) return json(PRESIGNED_IMAGE_URL);
    if (path.endsWith("/download-url")) return json(PRESIGNED_IMAGE_URL);
    if (path.includes("/user/frame")) return json(FRAMES);
    if (path.includes("/user/media")) return json(MEDIA);

    // 그 밖의 호출(로그아웃·재발급 등)은 성공한 셈 치고 비운다.
    return json(null);
  });

  await page.route(`**${S3_STUB_PATH}`, (route) =>
    route.fulfill({ status: 200, body: "" }),
  );
}

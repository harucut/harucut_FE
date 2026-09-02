import "@testing-library/jest-dom";
import { toHaveNoViolations } from "jest-axe";
import { server } from "./tests/msw/server";

expect.extend(toHaveNoViolations);

/*
  jsdom 의 `Blob` 에는 `arrayBuffer()` 가 없다. 브라우저에는 전부 있다
  (Chrome 76+ / Safari 14+ — 우리가 지원하는 범위 안이다).

  이걸 안 채우면 **제품 코드에 없어도 되는 분기를 넣게 된다.** 파일 앞부분을 바이트로 읽는
  자리(`lib/imageDecode.ts` 의 HEIF 판정)가 실제로 그랬다. 환경이 모자란 것을 제품 코드에서
  메우면, 그 분기는 브라우저에서 영원히 안 도는 채로 남는다.
*/
if (typeof Blob !== "undefined" && !Blob.prototype.arrayBuffer) {
  Blob.prototype.arrayBuffer = function arrayBuffer(this: Blob) {
    return new Promise<ArrayBuffer>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.onerror = () => reject(reader.error);
      reader.readAsArrayBuffer(this);
    });
  };
}

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

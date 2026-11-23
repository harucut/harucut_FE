/**
 * 앱은 세로 고정이고 촬영 화면만 기기를 돌리는 대로 돈다(2026-11-15 「앱 회전 촬영 때만 해주는 건? 가로로 찍는 사람도
 * 많으니깐」). 화면에 들어오면 셸에 free, 떠나면 portrait 를 보낸다 — 떠난 뒤 돌아간 채로 남으면 다른 화면이 가로로 깨진다.
 * 짝은 apps/mobile/components/harucut-web-shell.tsx 의 `orientation` 분기다.
 */
import { render } from "@testing-library/react";
import { useRotatableScreen } from "@/hooks/useRotatableScreen";

type Posted = { type: string; mode?: string };

function Rotatable() {
  useRotatableScreen();
  return null;
}

function enterShell() {
  const posted: Posted[] = [];
  window.__HARUCUT_NATIVE__ = { version: 4, platform: "ios" };
  window.ReactNativeWebView = { postMessage: (raw: string) => posted.push(JSON.parse(raw) as Posted) };
  return posted;
}

afterEach(() => {
  delete window.__HARUCUT_NATIVE__;
  delete window.ReactNativeWebView;
});

test("들어오면 회전을 풀고, 떠나면 세로로 잠근다", () => {
  const posted = enterShell();
  const view = render(<Rotatable />);
  expect(posted).toEqual([{ type: "orientation", mode: "free" }]);

  view.unmount();
  expect(posted).toEqual([
    { type: "orientation", mode: "free" },
    { type: "orientation", mode: "portrait" },
  ]);
});

test("브라우저에서는 아무것도 보내지 않는다 — 폰 브라우저는 원래 돈다", () => {
  const postMessage = jest.fn();
  // 표식 없이 postMessage 만 있는 것은 셸이 아니다(lib/nativeBridge.ts 의 getNativeShell).
  window.ReactNativeWebView = { postMessage };
  const view = render(<Rotatable />);
  view.unmount();
  expect(postMessage).not.toHaveBeenCalled();
});

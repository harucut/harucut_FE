#!/usr/bin/env python3
"""check_backend_contract.py 가 **검사한 것만** 말하고, D 가 실제로 잡는지 본다.

왜 있나 — 이 스크립트는 한동안 필수 요청 필드를 **검사하지 않았다.** 그 한계가 독스트링·
--help·소스 주석·문서에만 적혀 있던 동안, 기본 실행 화면에는 "계약 일치 ✓" 한 줄만 남았다.
필수 필드를 빠뜨린 채로도 통과처럼 읽혔다. 그래서 원래 이 파일이 본 것은 **판정 화면에
한계가 같이 찍히는가** 하나였다.

지금은 D 가 진짜 검사다(FE 가 보내는 본문 ↔ 스웨거 required). 그래서 보는 것이 바뀌었다:
  1. 필수 필드가 빠지면 **실패**로 잡는가 — 검사기가 실패를 못 잡으면 없는 것과 같다.
  2. 다 보내면 통과하는가.
  3. 본문을 읽지 못한 경우를 **조용히 통과시키지 않고** 경고로 남기는가.
  4. 판정 문구가 검사 범위(A·B·C·D)를 정확히 말하는가.

레포에 pytest 가 없고 scripts/ 에도 테스트 하네스가 없어서, 표준 라이브러리만 쓰고
직접 돌리는 형태로 둔다:

    python3 scripts/check_backend_contract_test.py

백엔드도 도커도 필요 없다 — 스펙·에러코드·라우트·본문 수집을 전부 가짜로 갈아 끼운다.
"""
from __future__ import annotations

import contextlib
import importlib.util
import io
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
TARGET = os.path.join(HERE, "check_backend_contract.py")

_spec = importlib.util.spec_from_file_location("check_backend_contract", TARGET)
cbc = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(cbc)

COMPOSE = "/api/auth/user/media/compose"
FE_ROUTE = "/api/client/user/media/compose"


def spec_with(required: list[str]) -> dict:
    return {
        "paths": {
            COMPOSE: {
                "post": {
                    "responses": {"200": {"description": "ok"}},
                    "requestBody": {
                        "content": {
                            "application/json": {
                                "schema": {"$ref": "#/components/schemas/ComposeRequest"}
                            }
                        }
                    },
                }
            }
        },
        "components": {
            "schemas": {"ComposeRequest": {"type": "object", "required": required}}
        },
    }


FAKE_SPEC = spec_with(["frameId", "sourceKeys"])


def run(
    argv: list[str],
    spec: dict = FAKE_SPEC,
    called: bool = True,
    payload: set[str] | None = frozenset({"frameId", "sourceKeys", "idempotencyKey"}),
) -> tuple[int, str]:
    """실제 main() 을 돌리되 백엔드·도커·파일 스캔은 전부 가짜로 채운다.

    payload=None 이면 "본문을 못 읽었다" 를 흉내 낸다.
    """
    cbc.problems.clear()
    cbc.warnings.clear()
    cbc.fetch_spec = lambda _base_url: spec
    cbc.collect_fe_routes = lambda: [("POST", COMPOSE, FE_ROUTE)]
    cbc.has_caller = lambda _route: called
    cbc.collect_fe_payloads = lambda: {("POST", FE_ROUTE): set(payload) if payload is not None else None}
    # C 를 깨끗하게 통과시켜 A·B·C 가 전부 OK 인 상태를 만든다.
    cbc.jar_error_codes = lambda: {"GEN-001"}
    cbc.fe_error_codes = lambda: {"GEN-001"} | cbc.CLIENT_ONLY_CODES

    sys.argv = ["check_backend_contract.py", *argv]
    buf = io.StringIO()
    with contextlib.redirect_stdout(buf):
        code = cbc.main()
    return code, buf.getvalue()


def last_line(out: str) -> str:
    return [l for l in out.splitlines() if l.strip()][-1]


def test_missing_required_field_fails() -> None:
    """서버가 요구하는데 FE 가 안 보내면 **실패**다. 이 검사의 존재 이유다."""
    code, out = run([], spec=spec_with(["frameId", "sourceKeys", "layers"]))
    assert code == 1, out
    assert "빠진 필수 필드" in out and "layers" in out, out


def test_all_fields_present_passes() -> None:
    """다 보내면 통과한다 — 아무거나 실패시키는 검사가 아니다."""
    code, out = run([])
    assert code == 0, out
    assert "빠진 필수 필드 없음" in out, out


def test_unreadable_body_is_not_silently_passed() -> None:
    """본문을 못 읽으면 조용히 통과시키지 않고 경고로 남긴다."""
    code, out = run([], payload=None)
    assert code == 0, out
    assert "본문의 타입을 따라가지 못함" in out, out
    assert "경고" in out, out


def test_verdict_names_what_it_checked() -> None:
    """맨 마지막 줄이 사람이 읽는 판정이다. 검사 범위를 정확히 말해야 한다."""
    _code, out = run([])
    tail = last_line(out)
    assert tail != "계약 일치 ✓", tail
    assert tail.startswith("A·B·C·D 일치 ✓"), tail


def test_warning_verdict_is_scoped_too() -> None:
    """경고만 있는 경로(아무도 안 부르는 프록시)도 같은 범위 표시를 단다."""
    code, out = run([], called=False)
    tail = last_line(out)
    assert code == 0, out
    assert tail.startswith("A·B·C·D 치명적 불일치 없음 ✓"), tail


def test_show_required_still_prints_the_list() -> None:
    """참고 목록 자체는 그대로 나온다 — 검사로 바꿨다고 목록을 없앤 게 아니다."""
    _code, out = run(["--show-required"], spec=spec_with(["frameId", "sourceKeys"]))
    assert "frameId" in out and "sourceKeys" in out, out


def test_missing_backend_path_still_fails() -> None:
    """D 를 붙였다고 A 실패 판정이 무뎌지지 않는다."""
    code, out = run([], spec={"paths": {}, "components": {"schemas": {}}})
    assert code == 1, out
    assert "가 백엔드에 없다" in out, out


if __name__ == "__main__":
    tests = [v for k, v in sorted(globals().items()) if k.startswith("test_")]
    for t in tests:
        t()
    print(f"{len(tests)}개 통과")

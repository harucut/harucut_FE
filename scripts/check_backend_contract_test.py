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
  5. 한 경로를 여러 곳에서 부를 때 **호출부를 전부** 대조하는가 — 하나만 보면 순회 순서에
     따라 누락이 가려진다.
  6. 그 '전부' 를 **수집기가** 실제로 쌓는가 — 5 는 수집기를 목으로 갈아 끼우므로
     덮어쓰기가 되돌아와도 못 잡는다.
  7. 본문이 **최상위 배열**인 경로(`POST /api/auth/terms/consents`)도 검사에 드는가 —
     필수 필드가 `items` 의 항목 스키마에 있어서, 거기까지 안 따라가면 그 경로만
     통째로 빠진 채 "A·B·C·D 일치" 가 찍힌다.

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
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
TARGET = os.path.join(HERE, "check_backend_contract.py")

_spec = importlib.util.spec_from_file_location("check_backend_contract", TARGET)
cbc = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(cbc)

# run() 이 cbc.collect_fe_payloads 를 목으로 갈아 끼우므로, 진짜 수집기를 여기서 붙잡아 둔다.
REAL_COLLECT_FE_PAYLOADS = cbc.collect_fe_payloads

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


def array_spec_with(required: list[str]) -> dict:
    """최상위가 **배열**인 요청 본문. `POST /api/auth/terms/consents` 가 이 모양이다.

    필수 필드가 `schema.required` 가 아니라 `items` 가 가리키는 항목 스키마에 있다.
    하네스의 경로 이름은 그대로 두고 **본문 모양만** 그 엔드포인트와 같게 만든다.
    """
    spec = spec_with([])
    spec["paths"][COMPOSE]["post"]["requestBody"]["content"]["application/json"]["schema"] = {
        "type": "array",
        "items": {"$ref": "#/components/schemas/ComposeRequest"},
    }
    spec["components"]["schemas"]["ComposeRequest"] = {"type": "object", "required": required}
    return spec


FAKE_SPEC = spec_with(["frameId", "sourceKeys"])


SITE = "apps/web/lib/composeApi.ts:42"


def run(
    argv: list[str],
    spec: dict = FAKE_SPEC,
    called: bool = True,
    payload: set[str] | None = frozenset({"frameId", "sourceKeys", "idempotencyKey"}),
    sites: list[tuple[str, set[str] | None]] | None = None,
) -> tuple[int, str]:
    """실제 main() 을 돌리되 백엔드·도커·파일 스캔은 전부 가짜로 채운다.

    payload=None 이면 "본문을 못 읽었다" 를 흉내 낸다.
    sites 를 주면 같은 경로를 여러 곳에서 부르는 상황을 그대로 넣는다.
    """
    call_sites = sites if sites is not None else [
        (SITE, set(payload) if payload is not None else None)
    ]
    cbc.problems.clear()
    cbc.warnings.clear()
    cbc.fetch_spec = lambda _base_url: spec
    cbc.collect_fe_routes = lambda: [("POST", COMPOSE, FE_ROUTE)]
    cbc.has_caller = lambda _route: called
    cbc.collect_fe_payloads = lambda: {("POST", FE_ROUTE): call_sites}
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


def test_every_call_site_of_one_endpoint_is_checked() -> None:
    """같은 경로를 두 곳에서 부르면 **둘 다** 본다.

    본문을 경로마다 하나만 들고 있으면 나중에 순회한 것이 앞을 덮는다. 그러면 순서에 따라
    누락이 통째로 가려지거나(빠뜨린 쪽이 먼저) 멀쩡한 호출부가 대신 걸린다.
    그래서 두 순서 모두에서 빠뜨린 쪽만 이름이 찍혀야 한다.
    """
    ok = ("apps/web/lib/composeApi.ts:42", {"frameId", "sourceKeys"})
    missing = ("apps/web/app/shoot/result/page.tsx:310", {"frameId"})
    for order in ([ok, missing], [missing, ok]):
        code, out = run([], sites=list(order))
        assert code == 1, out
        assert "sourceKeys" in out, out
        assert missing[0] in out, out          # 어느 호출부인지 출력만 보고 안다
        assert ok[0] not in out, out           # 멀쩡한 쪽을 같이 걸지 않는다


def test_collector_keeps_every_call_site_of_one_endpoint() -> None:
    """수집기가 키마다 본문을 **전부** 쌓는가.

    바로 위 테스트는 `collect_fe_payloads` 를 목으로 갈아 끼우므로 소비자 쪽 루프만
    고정한다. 수집기가 `out[key] = ...` 로 덮어쓰기로 되돌아가도 그 테스트는 녹색이다.
    그래서 여기서는 진짜 수집기를 임시 트리에 돌린다 — 가려진 누락이 이 검사가 있는 이유다.
    """
    with tempfile.TemporaryDirectory() as tmp:
        lib = os.path.join(tmp, "apps", "web", "lib")
        os.makedirs(lib)
        # 같은 경로를 두 곳에서 부르고, 한쪽만 sourceKeys 를 뺀다.
        with open(os.path.join(lib, "a_full.ts"), "w", encoding="utf-8") as fh:
            fh.write('clientApi.post("%s", { frameId, sourceKeys });\n' % FE_ROUTE)
        with open(os.path.join(lib, "b_missing.ts"), "w", encoding="utf-8") as fh:
            fh.write('clientApi.post("%s", { frameId });\n' % FE_ROUTE)

        original_root = cbc.ROOT
        cbc.ROOT = tmp
        try:
            payloads = REAL_COLLECT_FE_PAYLOADS()
        finally:
            cbc.ROOT = original_root

    sites = payloads[("POST", FE_ROUTE)]
    assert len(sites) == 2, sites
    by_file = {site.split(":")[0]: keys for site, keys in sites}
    assert by_file["apps/web/lib/a_full.ts"] == {"frameId", "sourceKeys"}, by_file
    assert by_file["apps/web/lib/b_missing.ts"] == {"frameId"}, by_file
    # 줄 번호가 붙어야 출력만 보고 찾아갈 수 있다.
    assert all(site.endswith(":1") for site, _ in sites), sites


def test_array_body_item_required_field_is_checked() -> None:
    """최상위가 배열인 본문도 **항목**의 필수 필드로 검사한다.

    `schema.required` 만 보면 이런 경로는 필수 필드가 없는 것으로 읽혀 D 에서 통째로
    빠진다 — 항목 필드를 빠뜨려도 종료코드 0 에 "A·B·C·D 일치 ✓" 가 찍혔다.
    """
    code, out = run(
        [],
        spec=array_spec_with(["code", "agreed"]),
        sites=[(SITE, {"code", "...array"})],
    )
    assert code == 1, out
    assert "빠진 필수 필드" in out and "agreed" in out, out
    # 표식은 대조용이지 FE 가 보내는 필드가 아니다. 출력에 새어 나오면 안 된다.
    assert "...array" not in out, out


def test_array_body_with_all_item_fields_passes() -> None:
    """항목 필드를 다 보내면 통과한다 — 배열이라고 무조건 걸리는 검사가 아니다."""
    code, out = run(
        [],
        spec=array_spec_with(["code", "agreed"]),
        sites=[(SITE, {"code", "agreed", "...array"})],
    )
    assert code == 0, out
    assert "빠진 필수 필드 없음" in out, out


def test_array_schema_against_object_body_is_not_silently_passed() -> None:
    """스웨거는 배열인데 FE 에서 읽은 본문이 객체면 **비교 자체가 틀린다.**

    항목 필수 필드를 배열의 최상위 키와 맞대는 대신 사람에게 넘긴다. 통과도 실패도 아니다.
    """
    code, out = run(
        [],
        spec=array_spec_with(["code", "agreed"]),
        sites=[(SITE, {"code", "agreed"})],
    )
    assert code == 0, out
    assert "본문 모양이 다르다" in out, out
    assert "경고" in out, out


def test_collector_reads_item_keys_of_an_array_body() -> None:
    """수집기가 배열 본문의 **항목** 키를 읽는가.

    위 세 개는 `collect_fe_payloads` 를 목으로 갈아 끼우므로 소비자 쪽만 고정한다.
    실제 `submitTermsConsents` 는 `TermsAgreementItem[]` 를 걸러 만든 변수를 넘긴다 —
    수집기가 거기까지 못 따라가면 소비자가 아무리 옳아도 "타입을 따라가지 못함" 만 남는다.
    """
    route = "/api/client/auth/terms/consents"
    with tempfile.TemporaryDirectory() as tmp:
        lib = os.path.join(tmp, "apps", "web", "lib")
        os.makedirs(lib)
        with open(os.path.join(lib, "termsApi.ts"), "w", encoding="utf-8") as fh:
            fh.write(
                "export type TermsAgreementItem = {\n"
                "  code: string;\n"
                "  agreed: boolean;\n"
                "};\n"
                "\n"
                "export async function submitTermsConsents(\n"
                "  items: TermsAgreementItem[],\n"
                "): Promise<void> {\n"
                "  const payload = items.filter((item) => item.code.length > 0);\n"
                '  await clientApi.post("%s", payload);\n'
                "}\n" % route
            )

        original_root = cbc.ROOT
        cbc.ROOT = tmp
        try:
            payloads = REAL_COLLECT_FE_PAYLOADS()
        finally:
            cbc.ROOT = original_root

    sites = payloads[("POST", route)]
    assert len(sites) == 1, sites
    _site, keys = sites[0]
    assert keys == {"code", "agreed", "...array"}, keys


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

/**
 * Tailwind 임의값 클래스 중 **정규형이 있는 것**을 찾아 실패시킨다.
 *
 * 왜 필요한가: v4 는 두 가지를 새로 준다.
 *   1) CSS 변수 축약형 — `text-[color:var(--hc-muted)]` 대신 `text-(--hc-muted)`.
 *   2) 동적 간격 스케일 — `--spacing: .25rem` 의 배수라면 `h-[30px]` 대신 `h-7.5`.
 * 편집기(Tailwind IntelliSense)는 이 둘을 경고로 띄우는데, 사람 눈에는 안 보이는 곳까지
 * 퍼지면 경고가 배경 소음이 되어 진짜 문제를 덮는다. 그래서 기계가 막는다.
 *
 * **추측하지 않는다.** 후보를 만들어 실제로 Tailwind 로 컴파일하고, 만들어진 선언을
 * 테마 변수까지 풀어서 값으로 비교한다. 값이 같은 것만 "정규형이 있다"고 말한다.
 * (그래서 `text-[13px]` 은 지적하지 않는다 — `text-sm` 은 line-height 도 함께 바꾼다.)
 *
 * 실행: pnpm --dir apps/web check:classes
 */
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const WEB = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ROOT = resolve(WEB, "../..");

/** postcss 는 pnpm 에서 apps/web 에 hoist 되지 않을 수 있다. 몇 군데를 순서대로 시도한다. */
function loadPostcss() {
  const tries = [
    () => require("postcss"),
    () => createRequire(require.resolve("@tailwindcss/postcss/package.json"))("postcss"),
    () => createRequire(require.resolve("next/package.json"))("postcss"),
  ];
  for (const t of tries) {
    try {
      return t();
    } catch {}
  }
  throw new Error("postcss 를 찾지 못했다 — pnpm install 을 확인할 것.");
}

const postcss = loadPostcss();
const tailwind = require("@tailwindcss/postcss");

// ── 1. 저장소에서 임의값·임의속성 클래스를 모은다 ────────────────────────
const files = execFileSync("git", ["ls-files"], { cwd: ROOT, encoding: "utf8" })
  .split("\n")
  .filter(
    (f) =>
      (f.endsWith(".ts") || f.endsWith(".tsx")) &&
      !f.includes("/node_modules/") &&
      !f.startsWith(".claude/") &&
      !f.startsWith(".github/skills/"),
  );

const VALUE_RE = /(?<![\w-])([a-z][a-z0-9-]*)-\[([^\]\s"`]+)\]/g;
const PROP_RE = /(?<![\w:-])\[([a-z-]+):([^\]\s"`]+)\]/g;
/** 색/불투명도의 임의 표기 — `border-white/[0.08]`. `/` 뒤라서 VALUE_RE 에 안 걸린다. */
const ALPHA_RE = /(?<![\w-])([a-z][a-z0-9-]*(?:-[a-z0-9]+)*)\/\[([0-9.]+)\]/g;
/** v3 식 앞자리 important — `!h-full`. v4 는 뒤에 붙인다(`h-full!`). */
const BANG_RE = /(?<![\w$.])!([a-z][a-z0-9:./-]*(?:\[[^\]\s"`]+\])?)(?=[\s"'`]|$)/g;

/**
 * **문자열 리터럴 안만 본다.** 예전에는 줄 전체를 훑어서 `if (!cancelled)` 의 부정 연산자가
 * `!cancelled` 클래스로 잡혔다(컴파일 단계에서 걸러지긴 하지만 목록이 지저분해진다).
 * 클래스는 언제나 따옴표나 백틱 안에 있다.
 */
function stringChunks(line) {
  const out = [];
  const re = /"([^"\\]*(?:\\.[^"\\]*)*)"|'([^'\\]*(?:\\.[^'\\]*)*)'|`([^`\\]*(?:\\.[^`\\]*)*)`/g;
  for (const m of line.matchAll(re)) out.push(m[1] ?? m[2] ?? m[3] ?? "");
  return out;
}

/** class -> [{file, line}] */
const found = new Map();
function note(cls, f, i) {
  if (!found.has(cls)) found.set(cls, []);
  const uses = found.get(cls);
  if (!uses.some((u) => u.file === f && u.line === i)) uses.push({ file: f, line: i });
}
for (const f of files) {
  const text = readFileSync(join(ROOT, f), "utf8");
  text.split("\n").forEach((line, idx) => {
    const i = idx + 1;
    for (const chunk of stringChunks(line)) {
      for (const m of chunk.matchAll(VALUE_RE)) note(`${m[1]}-[${m[2]}]`, f, i);
      for (const m of chunk.matchAll(PROP_RE)) note(`[${m[1]}:${m[2]}]`, f, i);
      for (const m of chunk.matchAll(ALPHA_RE)) note(`${m[1]}/[${m[2]}]`, f, i);
      for (const m of chunk.matchAll(BANG_RE)) note(`!${m[1]}`, f, i);
    }
  });
}

// ── 2. 각 클래스의 정규형 후보를 만든다 ──────────────────────────────────
const SPACING = new Set([
  "h","w","min-h","min-w","max-w","max-h","size","gap","gap-x","gap-y",
  "p","px","py","pt","pb","pl","pr","ps","pe",
  "m","mx","my","mt","mb","ml","mr","ms","me",
  "top","bottom","left","right","inset","inset-x","inset-y",
  "translate-x","translate-y","basis","indent","scroll-m","scroll-p","space-x","space-y",
]);
const NAMED = {
  leading: ["none", "tight", "snug", "normal", "relaxed", "loose"],
  rounded: ["none", "xs", "sm", "md", "lg", "xl", "2xl", "3xl", "4xl", "full"],
  tracking: ["tighter", "tight", "normal", "wide", "wider", "widest"],
  blur: ["xs", "sm", "md", "lg", "xl", "2xl", "3xl"],
};
const PROP_UTIL = { "scrollbar-width:none": ["scrollbar-none"] };

function px(v) {
  const m = /^(-?\d+(?:\.\d+)?)px$/.exec(v);
  return m ? Number(m[1]) : null;
}

const pairs = [];
for (const cls of found.keys()) {
  if (cls.startsWith("[")) {
    for (const c of PROP_UTIL[cls.slice(1, -1)] ?? []) pairs.push([cls, c]);
    continue;
  }
  if (cls.startsWith("!")) {
    // v3 앞자리 important -> v4 뒷자리. 컴파일 비교가 진짜 유틸리티인지까지 걸러 준다.
    pairs.push([cls, `${cls.slice(1)}!`]);
    continue;
  }
  const alpha = /^([a-z][a-z0-9-]*(?:-[a-z0-9]+)*)\/\[([0-9.]+)\]$/.exec(cls);
  if (alpha) {
    // `/[0.08]` 은 알파 0.08 = 8%. 정규형은 퍼센트 숫자다.
    const pct = Number(alpha[2]) * 100;
    if (Number.isFinite(pct)) {
      const text = Number(pct.toFixed(4)).toString();
      pairs.push([cls, `${alpha[1]}/${text}`]);
    }
    continue;
  }
  const m = /^([a-z][a-z0-9-]*)-\[(.+)\]$/.exec(cls);
  if (!m) continue;
  const [, util, val] = m;
  const cands = [];
  const varOnly = /^(?:color:)?var\((--[a-zA-Z0-9-]+)\)$/.exec(val);
  if (varOnly) cands.push(`${util}-(${varOnly[1]})`);
  const n = px(val);
  if (n !== null && SPACING.has(util)) cands.push(`${util}-${n / 4}`);
  if (n !== null && (util === "underline-offset" || util === "border")) cands.push(`${util}-${n}`);
  if (NAMED[util]) cands.push(...NAMED[util].map((k) => `${util}-${k}`));
  if (util === "z" && /^\d+$/.test(val)) cands.push(`z-${val}`);
  if (util === "aspect" && /^\d+\/\d+$/.test(val)) cands.push(`aspect-${val}`);
  if (util === "leading" && /^\d+(\.\d+)?$/.test(val)) cands.push(`leading-${val}`);
  for (const c of cands) pairs.push([cls, c]);
}

if (pairs.length === 0) {
  console.log("[classes] 임의값 클래스가 없다.");
  process.exit(0);
}

// ── 3. 한 번에 컴파일해 선언을 비교한다 ─────────────────────────────────
const TMP = join(WEB, ".canonical-check");
mkdirSync(TMP, { recursive: true });
const all = [...new Set(pairs.flat())];
writeFileSync(join(TMP, "probe.html"), all.map((c) => `<div class="${c}"></div>`).join("\n"));

let cssOut;
try {
  const src = '@import "tailwindcss" source(none);\n@source "./.canonical-check/probe.html";\n';
  const result = await postcss([tailwind()]).process(src, { from: join(WEB, "canonical.css") });
  cssOut = result;
} finally {
  // probe.html 은 남겨 두면 다음 실행에서 옛 후보가 섞인다.
  rmSync(TMP, { recursive: true, force: true });
}

const theme = Object.fromEntries(
  [...cssOut.css.matchAll(/(--[a-z0-9-]+):\s*([^;{}]+)/g)].map((m) => [m[1], m[2].trim()]),
);
function resolveVars(v, depth = 0) {
  if (depth > 8) return v;
  return v
    .trim()
    .replace(/var\(\s*(--[a-z0-9-]+)\s*(?:,[^)]*)?\)/g, (whole, key) =>
      key in theme ? resolveVars(theme[key], depth + 1) : whole,
    );
}
function normalize(v) {
  const s = resolveVars(v).trim().toLowerCase();
  let m = /^calc\(\s*([\d.]+)rem\s*\*\s*([\d.]+)\s*\)$/.exec(s);
  if (m) return `${(Number(m[1]) * Number(m[2]) * 16).toFixed(4)}px`;
  m = /^([\d.]+)rem$/.exec(s);
  if (m) return `${(Number(m[1]) * 16).toFixed(4)}px`;
  m = /^(-?[\d.]+)px$/.exec(s);
  if (m) return `${Number(m[1]).toFixed(4)}px`;
  m = /^(-?[\d.]+)em$/.exec(s);
  if (m) return `${Number(m[1]).toFixed(5)}em`;
  m = /^(-?[\d.]+)$/.exec(s);
  if (m) return Number(m[1]).toFixed(4);
  return s.replace(/\s+/g, " ");
}

/*
  선택자에서 클래스 이름을 되찾는다. 임의값 클래스는 이름 안에 `[`·`(`·`.` 를 품어서
  구분자로 자를 수 없다 — `.h-\[30px\]` 를 `[` 에서 자르면 `h-` 가 된다.
  우리가 넣은 후보 이름 중 **가장 긴 접두사**를 찾는 방식이 안전하다.
*/
const KNOWN = [...all].sort((a, b) => b.length - a.length);
function classOf(sel) {
  if (!sel.startsWith(".")) return null;
  const body = sel.slice(1).replace(/\\(.)/g, "$1");
  for (const name of KNOWN) {
    if (!body.startsWith(name)) continue;
    const next = body[name.length];
    if (next === undefined || next === " " || next === ">" || next === ":" || next === ",")
      return name;
  }
  return null;
}

const declsByClass = new Map();
cssOut.root.walkRules((rule) => {
  for (const sel of rule.selectors) {
    const name = classOf(sel);
    if (!name) continue;
    const map = declsByClass.get(name) ?? {};
    for (const node of rule.nodes) {
      if (node.type === "decl") map[node.prop] = normalize(node.value);
    }
    declsByClass.set(name, map);
  }
});

const canonical = new Map();
for (const [oldCls, newCls] of pairs) {
  if (canonical.has(oldCls)) continue;
  const a = declsByClass.get(oldCls);
  const b = declsByClass.get(newCls);
  if (!a || !b) continue;
  const ka = Object.keys(a).sort();
  const kb = Object.keys(b).sort();
  if (ka.length !== kb.length || ka.some((k, i) => k !== kb[i])) continue;
  if (ka.every((k) => a[k] === b[k])) canonical.set(oldCls, newCls);
}

// ── 4. 보고 ──────────────────────────────────────────────────────────────
if (canonical.size === 0) {
  console.log(`[classes] 임의값 클래스 ${found.size}종 확인 — 정규형으로 바꿀 것 없음.`);
  process.exit(0);
}

let count = 0;
console.error("[classes] 같은 CSS 를 만드는 정규형이 있다. 아래를 바꿀 것:\n");
for (const [oldCls, newCls] of canonical) {
  const uses = found.get(oldCls);
  count += uses.length;
  console.error(`  ${oldCls}  ->  ${newCls}   (${uses.length}곳)`);
  for (const u of uses.slice(0, 5)) console.error(`      ${u.file}:${u.line}`);
  if (uses.length > 5) console.error(`      … 외 ${uses.length - 5}곳`);
}
console.error(`\n총 ${canonical.size}종 ${count}곳. 근거는 이 스크립트 주석에 있다.`);
process.exit(1);

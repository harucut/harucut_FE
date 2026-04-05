---
name: recorday-workflow
description: Recorday route, auth, and multi-step flow guardrails for OMX sessions
---

<Purpose>
Use this skill when work touches Recorday routing, authentication, session recovery, or release validation. It keeps OMX workers aligned with the repo's protected-route and multistep-flow invariants before they claim completion.
</Purpose>

<Use_When>
- Editing `proxy.ts`, `lib/redirect.ts`, or `/login`, `/signup`, `/forgot-password`
- Changing protected routes under `/home`, `/shoot/*`, `/upload/*`, `/theme/*`, `/history`, or `/mypage`
- Modifying `lib/shootSessionStore.ts`, `lib/uploadSessionStore.ts`, `lib/themeSessionStore.ts`, or `lib/themeEditorStore.ts`
- Preparing a PR, review pass, or release sweep for this repository
</Use_When>

<Core_Guardrails>
- Protected routes are `/home`, `/shoot/*`, `/upload/*`, `/theme/*`, `/history`, and `/mypage`.
- Unauthenticated access must redirect to `/login?redirectTo=...`.
- `redirectTo` must preserve the original query string.
- Auth-page brand links go to `/`, never `/home`.
- `PageHeader` contract:
  - `brandHref` for the left brand link
  - `rightHref` for icon navigation such as `/home -> /mypage`
  - `rightSlot` only for real buttons like refresh
  - `backHref` plus `backLabel` for text back links
- These flows are not recoverable from URL alone by default:
  - `lib/shootSessionStore.ts`
  - `lib/uploadSessionStore.ts`
  - `lib/themeSessionStore.ts`
  - `lib/themeEditorStore.ts`
- If a user lands on a late step without required session state, send them to the earliest valid step.
</Core_Guardrails>

<Verification_Order>
1. Verify middleware protection behavior first.
2. Verify page-level session guards second.
3. Re-read `AGENTS.md`, `docs/auth-routing.md`, and `docs/route-flows.md` before final claims when routing or multistep logic changed.
4. Prefer targeted tests before broad sweeps.
</Verification_Order>

<Repo_Commands>
- `pnpm lint`
- `pnpm test`
- `pnpm test:e2e`
</Repo_Commands>

<Release_Checklist>
- No auth page brand link points to `/home`.
- Protected-route redirects keep `redirectTo` and the original query string.
- Late-step pages recover to the earliest valid step when state is missing.
- `PageHeader` props match the repo contract.
- Any unrun test, missing auth context, or E2E gap is stated explicitly.
</Release_Checklist>

# agent.log

## 2026-04-08 autonomous product pass

### Goal
- Turn the app into a more polished **record-first life-four-cuts service**
- Improve the product UX without breaking protected-route, redirect, and multistep invariants

### References
- Backend Swagger: `https://api.harucut.com/swagger-ui/index.html#/`
- Design reference repo: `https://github.com/uxjoseph/supanova-design-skill`
- User-provided YouTube inspiration from chat

## Implemented frontend changes

### Home
- Upgraded `/home` into a dashboard
- Added:
  - recent media highlights
  - saved frame preview
  - curated frame recommendation cards
  - richer action grid including account management

### History
- Upgraded `/history` into an archive experience
- Added:
  - search
  - all/photo/video filters
  - summary stats
  - inline rename
  - clearer download/share actions

### Result pages
- Added share-link actions to generated result cards
- Kept:
  - rename
  - download
  - guarded multistep result flow

### Routing
- Added safe `frame` query support for:
  - `/shoot`
  - `/upload`
  - `/theme`
- Added saved-frame deep-link support from home into theme editing

### Supporting modules
- `lib/frameCatalog.ts`
- `lib/userApi.ts`

## Backend change requests
1. Frame catalog metadata endpoint
2. Media records should include originating frame metadata
3. Download/share URL expiry metadata
4. Server-driven config endpoint for quotas and defaults
5. Album/group metadata for history

## API / payload review

### Good with current Swagger
- media register
- media display-name update
- media download URL
- frame CRUD
- user info
- presigned upload + transcode

### Needs joint FE/BE review
- frontend login sends `remember`, but Swagger login request does not document it
- background schema suggests `GRADIENT`, but frontend runtime currently models `COLOR | IMAGE | VIDEO`

## Hardcoded values audit
- default frame: `classic-4`
- shot count: `8`
- selected final cuts: `4`
- generated video seconds: `8`
- conversion quota fallback: `3`
- default output filter: `NONE`

## Verification
- `pnpm lint` ✅
- `pnpm test` ✅
- `pnpm test:e2e` ✅

## Release note
- This scope is release-ready for frontend behavior
- Biggest limitations are backend metadata gaps, not current UI/flow stability

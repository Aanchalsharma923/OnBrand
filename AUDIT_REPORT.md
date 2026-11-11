# OnBrand Round 2 Audit

Audit date: 10 November 2026 (IST)
Scope: public judge build, current GitHub heads, local checkout, primary review workflow, and confirmed identity/evidence defects.

## Source of truth and checkout status

- Public product: [https://outcoded.xyz/](https://outcoded.xyz/)
- Fork and upstream `master` both resolved to `2c4601754b9cbf547804081a28b9482c3bf191c3` during this audit.
- The supplied checkout at `C:\Users\aanch\OneDrive\Desktop\Documents\We Code Coders hackathon\OnBrand` is on `master` at `e041c9a`. It is six commits ahead and 34 behind the current fork/upstream head. Its app is a separate authentication/PostgreSQL implementation; it is not the judge app currently shown at the public domain.
- The supplied checkout had four pre-existing uncommitted changes. They were left untouched. The actual fork-head app and fixes are in the isolated `codex/round2-review` worktree at `C:\Users\aanch\OneDrive\Desktop\Documents\We Code Coders hackathon\OnBrand-round2`.
- The local Git config has no `origin` or `upstream` entries. The two remotes were read by URL and matched. The isolated review branch was pushed to the fork at `b7a90fe56bc1d6448402f4b85f4d7356013e182a` (`codex/round2-review`). Fork/upstream `master` and production were not changed; this is for review before merge/deployment.

## Test results

| Check | Result | Evidence and boundary |
|---|---|---|
| Public homepage | PASS | `https://outcoded.xyz/` returned HTTP 200. Browser showed the account-free start screen and review workspace. |
| Public health endpoint | PASS, rechecked 10 Nov | `GET /api/health` returned ready, `browser-demo-storage`, database not configured, and deterministic demo mode. |
| Public review API | PASS, partial workflow | A synthetic Sample Foods review returned HTTP 200, 8 findings, 5 supported items and 3 blocking findings (one source conflict and two policy contradictions). The API disclosed that it made no model call. This did not modify server-side content. |
| Public browser workflow | PARTIAL | The live page was inspected. The current browser profile already had OnBrand state; its first-run notice says switching replaces that browser's saved workspace. The existing public-domain workspace was not reset or edited. |
| Local production-browser flow | PASS | On the isolated fork-head build, opened the sample workspace without sign-in, ran review, selected a finding and verified the textarea selection exactly matched `helps children grow smarter.`, manually edited the draft, saved immutable version 2, re-reviewed (5 findings, zero blockers), and recorded human approval. This changed only the isolated `127.0.0.1:3001` demo storage. |
| Local document extraction | PASS, refreshed 10 Nov 2026 | A generated DOCX paragraph and table cell, and a generated selectable-text PDF, were uploaded through Brave's file picker. Both originals persisted in IndexedDB. DOCX paragraph and table highlights linked to the finding detail; clicking the table-cell highlight selected its corresponding finding. PDF rendered its page with page navigation/zoom controls; selecting the child-development finding navigated to page 1 and highlighted the source text. |
| PDF/DOCX review loop after viewer changes | PASS, synthetic fixtures | Re-ran review against the uploaded PDF and confirmed the contradicted phrase was highlighted at its source location. Manually changed the draft to an approved product statement; the previous review became stale, and a fresh review reported 1/1 evidence-aligned with zero items needing attention. Recorded a human approval and confirmed it appeared in the decision audit. The original PDF remained visible after the text edit. |
| Local identity migration and finding details | PASS | Reopened stored demo state after the patch; the rendered page contained no team names. The child-development finding showed its exact approved policy source and selected the exact draft span. |
| Local findings filters | PASS | On the production build in a clean browser session, `Blocking review` showed 3 of 8 findings (all three blocking findings); `Evidence aligned` showed 5 of 8 findings (all five supported findings). |
| Isolated fork-head unit tests | PASS | 43 tests across 7 files. Includes role-only identity, source quotations, draft original-reference retention, repeated/Unicode location mapping, and finding-filter behavior. |
| Isolated fork-head lint | PASS | `npm.cmd run lint`. |
| Isolated fork-head TypeScript | PASS | `npx.cmd tsc --noEmit`. |
| Isolated fork-head production build | PASS | `npm.cmd run build`; Next.js emitted `/`, `/api/health`, and `/api/reviews`. |
| Production dependency audit | PASS | `npm.cmd audit --omit=dev --json`: 0 production vulnerabilities. `npm ci` reported 8 moderate advisories across the full dependency tree; development-only advisories were not investigated. |
| Supplied-checkout unit tests | PASS | 42 tests across 12 files on the supplied, older local `master`. |
| Supplied-checkout typecheck/build | PASS | `npm.cmd run typecheck` and `npm.cmd run build` on the supplied checkout. |
| Supplied-checkout Playwright suite | BLOCKED | All three tests failed before launch because the configured Chromium executable is not installed. This is an environment limitation, not a product assertion failure. The production-browser flow was instead exercised on the isolated fork-head build through the available browser. |

The fork-head package requires Node 24, while the available environment is Node 22.23.2. `npm ci`, lint, tests, typecheck and build succeeded under Node 22, with an engine warning. Re-run under Node 24 before release.

## Confirmed defects and limitations

### D-01 — Personal identities exposed in the public demo UI (P1)

**Reproduction:** inspect the current fork-head `src/app/page.tsx` profile, assignment, comment and decision paths. The live UI showed `AS` initials; source inspection found names hard-coded in the profile, assignment options, comment attribution and decisions. Previously saved browser reviews could retain those values.

**Expected:** neutral role labels throughout the public demo.

**Actual before fix:** personal names and initials appeared in visible UI and saved review attribution.

**Root cause:** demo roles were modeled as real named people in UI strings and newly written review records.

**Fix in review branch:** role labels and role initials; neutralized attribution when old browser state is restored; new comments and decisions use role labels.

**Verification:** `src/lib/identity.test.ts` and local production-browser check found no personal names in rendered text.

### D-02 — Policy contradiction lacked its supporting policy quote (P1)

**Reproduction:** POST the starter demo draft to the live `/api/reviews` endpoint and inspect the `helps children grow smarter.` finding. Before the fix it was `CONTRADICTED`, blocking, and had no `source_evidence`, despite an approved source containing the child-development restriction. The detail therefore asserted a policy finding without showing its source.

**Expected:** show the exact applicable approved restriction, version and quote; otherwise clearly state that no approved policy quotation is available.

**Actual before fix:** “Do not make child-development promises” with no retrieved source quote.

**Root cause:** deterministic seeded rules and approved avoided-wording matches returned a label/severity but did not attach the matching approved source fact.

**Fix in review branch:** attach an eligible, exact approved source fact when it matches a policy rule or avoided term; show an explicit missing-quote explanation when no policy quote is available.

**Verification:** regressions check exact quotes and C1–C4 citation checks for policy restrictions and approved avoided wording; local browser displayed the child-development quote beside the finding.

### D-03 — Source locations are unavailable for OCR-only or layout-dependent text (P1, core PDF/DOCX path fixed)

The review branch stores uploaded originals in browser IndexedDB and associates each with its draft versions. Selectable-text PDF pages render locally with navigation and zoom; exact extracted-text matches map findings to the page and text-layer highlight. DOCX opens in a locally parsed reading view that preserves paragraph and table-cell order; matching findings scroll to and highlight their paragraph or cell. Both were verified in a production build using synthetic files. Manual editing invalidated the earlier report; full re-review returned 1/1 supported, and a human approval was recorded. The original PDF remained available after editing. Scanned/OCR-only PDF text has no dependable coordinates, and DOCX pagination, typography, embedded images and complex layout are not reproduced. These limits are shown in the UI and README.

### D-04 — Demo persistence and permissions are browser-local (P1 limitation, disclosed)

`/api/health` reports `browser-demo-storage` and database integration is not configured. The demo role switch is simulated, so comments, assignments and decisions are not shared or server-enforced. The account-free judge flow works, but this build is not suitable for confidential content or durable multi-user approvals. The README discloses this boundary.

### D-09 — Findings filter control did not filter the report (P2, fixed)

**Reproduction:** run the sample review and activate the `All findings` control. Before the fix, it only displayed a toast and left all findings visible.

**Fix and verification:** replaced it with an accessible native filter for all, needs attention, blockers and evidence-aligned findings. On the production build, selecting blockers showed 3 of 8 and all three cards were blocking; selecting evidence-aligned showed 5 of 8 and every card was supported. Unit regressions cover all, attention, blocking and supported filters.

## Suspected issues and untested cases

- Full PDF, DOCX, scanned-PDF and image test matrices were not repeated in this audit. The supplied brief's corruption, password-protection, MIME spoofing, large-file, Unicode, page-break and multilingual cases remain unverified here. The DOCX table test covered one generated sample only.
- MP4/WebM frame extraction and OCR quality were not manually re-tested. Product copy explicitly says speech, layout, colors and logos are not analysed.
- Keyboard/screen-reader review, tablet breakpoints, and cross-browser behavior remain untested.
- The production deployment's exact Vercel commit and project settings were not available through the connected tools. The homepage, health endpoint and review API were reachable; no deployment change was made.
- The optional model provider was not configured or called. Production behavior is deterministic, as disclosed.

## Delivery notes

Review the changes in the isolated `codex/round2-review` branch/worktree before merging or deploying. The branch was pushed to the fork and verified at `b7a90fe56bc1d6448402f4b85f4d7356013e182a`; fork/upstream `master` remains `2c4601754b9cbf547804081a28b9482c3bf191c3`, and production was not deployed. The supplied local `master` checkout and its pre-existing changes remain intact. D-03 is verified for selectable-text PDF and basic DOCX body/table content; D-04 remains an open prototype limitation.

## 10 Nov emergency OCR stabilization follow-up

### Confirmed P0 root cause and response

The browser OCR path previously made a single Tesseract pass over the source-size canvas with default page segmentation. Image preprocessing was absent, and a nonempty string under the character limit was treated as successful extraction; OCR confidence and text coherence were discarded. On the supplied readable 1536×1024 poster, this produced 169 tokenized words of symbol-heavy fragments and 29 findings, of which only 1 was supported. The claim engine then interpreted fragments as independent assertions. This was reproduced in the browser before the repair.

The current extractor uses grayscale/contrast preprocessing, upscaling (within the pixel cap), sparse-text and automatic-layout OCR passes, and confidence/readability/noise scoring. This did not make the source poster perfectly legible: a fresh production-browser extraction still returned rough copy at 73% confidence. It is therefore classified `NEEDS_PROOFREAD`; text remains editable, the original image persists, and both the button and API reject review until the user corrects the text and acknowledges proofreading. Unreadable/empty output is classified `UNREADABLE`, remains editable, and cannot generate a report before correction. No image coordinates are fabricated.

### Regression fixtures and fresh browser evidence

- Added the supplied source poster as `test-fixtures/sample-foods-oat-bites-ad.png` and a severely downsampled/compressed image as `test-fixtures/poor-quality-oat-bites-ad.jpg`.
- On the original image, OCR returned 71 words at 73% confidence. The app kept the original visible and exposed the extraction in the editor; review remained disabled until correction and explicit confirmation.
- On the poor-quality image, OCR returned no text (0 words) with a misleadingly high 95% engine confidence. The token/empty-text gate correctly labelled it `UNREADABLE`, preserved the original, disabled the review action and showed zero findings. This demonstrates why engine confidence alone is insufficient.
- After manual correction, the seeded product facts showed supported status; the starter bundle showed a conflict with both approved 2-jar and 3-jar quotes; sugar-free and child-development claims showed their exact approved restriction quotes. These bundle/child claims were typed into the edited demo text for the review test; they are not asserted to be visible in the poster pixels. The grounded sugar correction passed its local recheck and created a new version. Removing the remaining conflict and restricted claim, confirming the changed OCR text, and re-running review produced 5 supported findings and enabled a separate human approval. Nothing was published.
- A standalone product-name sentence no longer creates a claim finding. The demo seed includes an unsupported “improves focus” statement; it remains `NO_APPROVED_EVIDENCE`, with no invented quote and a distinct approval explanation.

### Latest verification and remaining gaps

- `npm test -- --run`: **49/49 passed** across 7 files, including the existing 100-case development-set assertion.
- `npx tsc --noEmit`: passed.
- `npm run lint`: passed after excluding the isolated Next build output from ESLint.
- `npm run build`: passed with temporary isolated `.next-review` output; the temporary `next.config.ts` and generated `tsconfig.json` changes were reverted. A standard `.next` build attempt separately failed at cleanup with Windows `EPERM` unlinking an existing `.next/static` file; whether OneDrive or a running process held it was not proven. The isolated build emits `/`, `/api/health` and `/api/reviews`.
- Browser verification used the local application at `127.0.0.1:3005` and the supplied exact poster plus degraded derivative. The exact text selection remains a text annotation only; OCR image-region coordinates are unavailable.
- Minimal synthetic PPTX and XLSX fixtures were smoke-tested in the local browser: slide text, shared strings, inline strings and numeric worksheet values appeared in the editable draft and original download link remained available. This does not prove compatibility with complex production Office files. Video speech, complex visual layout, non-English OCR, page coordinates for OCR-only content, and all-format/mobile/accessibility matrices remain unverified.
- Current branch is `codex/round2-review`, HEAD `81846b0` (`Make evidence report filters functional`). These follow-up changes are local and uncommitted; no push or production deployment was made.

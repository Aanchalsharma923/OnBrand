# OnBrand Round 2 Audit

Audit date: 10 November 2026 (IST)
Scope: public judge build, current GitHub heads, local checkout, primary review workflow, and confirmed identity/evidence defects.

## Source of truth and checkout status

- Public product: [https://outcoded.xyz/](https://outcoded.xyz/)
- Fork and upstream `master` both resolved to `2c4601754b9cbf547804081a28b9482c3bf191c3` during this audit.
- The supplied checkout at `C:\Users\aanch\OneDrive\Desktop\Documents\We Code Coders hackathon\OnBrand` is on `master` at `e041c9a`. It is six commits ahead and 34 behind the current fork/upstream head. Its app is a separate authentication/PostgreSQL implementation; it is not the judge app currently shown at the public domain.
- The supplied checkout had four pre-existing uncommitted changes. They were left untouched. The actual fork-head app and fixes are in the isolated `codex/round2-review` worktree at `C:\Users\aanch\OneDrive\Desktop\Documents\We Code Coders hackathon\OnBrand-round2`.
- The local Git config has no `origin` or `upstream` entries. The two remotes were read by URL and matched. No push or deployment was performed; the isolated work is for review first.

## Test results

| Check | Result | Evidence and boundary |
|---|---|---|
| Public homepage | PASS | `https://outcoded.xyz/` returned HTTP 200. Browser showed the account-free start screen and review workspace. |
| Public health endpoint | PASS | `GET /api/health` returned ready, `browser-demo-storage`, database not configured, and deterministic demo mode. |
| Public review API | PASS, partial workflow | A synthetic Sample Foods review returned HTTP 200, 8 findings, 5 supported items and 3 blocking findings (one source conflict and two policy contradictions). The API disclosed that it made no model call. This did not modify server-side content. |
| Public browser workflow | PARTIAL | The live page was inspected. The current browser profile already had OnBrand state; its first-run notice says switching replaces that browser's saved workspace. The existing public-domain workspace was not reset or edited. |
| Local production-browser flow | PASS | On the isolated fork-head build, opened the sample workspace without sign-in, ran review, selected a finding and verified the textarea selection exactly matched `helps children grow smarter.`, manually edited the draft, saved immutable version 2, re-reviewed (5 findings, zero blockers), and recorded human approval. This changed only the isolated `127.0.0.1:3001` demo storage. |
| Local identity migration and finding details | PASS | Reopened stored demo state after the patch; the rendered page contained no team names. The child-development finding showed its exact approved policy source and selected the exact draft span. |
| Isolated fork-head unit tests | PASS | 38 tests across 5 files. Includes regressions for role-only public identity and the approved policy quotation. |
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

**Root cause:** deterministic seeded rules returned a label/severity but did not attach the matching approved source fact.

**Fix in review branch:** attach an eligible, exact `claim restriction` fact when it matches the rule; show an explicit missing-quote explanation when it does not.

**Verification:** added a regression checking the exact quote and C1–C4 citation checks; local browser displayed the quote beside the finding.

### D-03 — Uploaded originals are not preserved in a document viewer (P1, open)

The public app extracts text into an editable draft. Its own upload guidance says files are read in the browser and extracted text becomes the draft; the README says the original file is not uploaded or retained. The review editor can select an exact text span, but there is no original PDF/DOCX page viewer, page navigation, or source-page coordinates. This does not meet the requested original-document review experience. No viewer implementation was added because a plain-text or generic preview would misrepresent location accuracy.

### D-04 — Demo persistence and permissions are browser-local (P1 limitation, disclosed)

`/api/health` reports `browser-demo-storage` and database integration is not configured. The demo role switch is simulated, so comments, assignments and decisions are not shared or server-enforced. The account-free judge flow works, but this build is not suitable for confidential content or durable multi-user approvals. The README discloses this boundary.

## Suspected issues and untested cases

- Full PDF, DOCX, scanned-PDF and image test matrices were not repeated in this audit. The supplied brief's corruption, password-protection, MIME spoofing, large-file, Unicode, table, page-break and multilingual cases remain unverified here.
- MP4/WebM frame extraction and OCR quality were not manually re-tested. Product copy explicitly says speech, layout, colors and logos are not analysed.
- Keyboard/screen-reader review, tablet breakpoints, and cross-browser behavior remain untested.
- The production deployment's exact Vercel commit and project settings were not available through the connected tools. The homepage, health endpoint and review API were reachable; no deployment change was made.
- The optional model provider was not configured or called. Production behavior is deterministic, as disclosed.

## Delivery notes

Review the changes in the isolated `codex/round2-review` worktree before merging or deploying. The local `master` checkout and its pre-existing changes remain intact. Do not treat D-03 or D-04 as fixed.

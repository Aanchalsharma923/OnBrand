# OnBrand Defect Register

Updated: 10 November 2026 (IST). Status describes the isolated `codex/round2-review` branch unless noted.

| ID | Priority | Defect / limitation | Root cause | Status | Regression or evidence |
|---|---|---|---|---|---|
| D-01 | P1 | Demo UI exposed personal names and initials in profiles, assignments, comments and decisions; old local records retained names. | Hard-coded people were used as simulated accounts and attribution. | **Fixed in review branch.** New UI uses role labels; saved review attribution is normalized on restore. | `src/lib/identity.test.ts`; local browser body-text check returned no names. |
| D-02 | P1 | Policy and approved avoided-wording findings could show no supporting approved source quote. | Rule and profile matching returned a label and severity without linking an eligible source fact. | **Fixed in review branch.** Matching approved source quote is attached and validated; missing policy quotes are stated. | `src/lib/onbrand.test.ts`; local browser displayed exact source quote. |
| D-03 | P1 | Document location links can be unavailable when extraction has no reliable source text. | OCR output and formats whose rendering differs from extraction do not provide dependable source coordinates. | **Core PDF/DOCX path fixed and browser-verified.** Selectable PDF text navigates by page and highlights the matching span; DOCX opens a structured paragraph/table reading view with matching highlights. Originals persist locally per draft version. Scanned PDF/OCR-only text and Word pagination, styling and embedded images remain unsupported and are disclosed. | `src/lib/document-locations.test.ts`; `src/lib/onbrand.test.ts`; production-build browser smoke on synthetic one-page PDF and paragraph/table DOCX; audit below. |
| D-04 | P1 limitation | Demo roles, reviews and decisions use browser-local storage, without verified identity or shared persistence. | The public build is intentionally an account-free prototype. | **Open, disclosed.** Suitable for synthetic judging only; not durable multi-user governance. | `GET /api/health`; README disclosure. |
| D-05 | P1 delivery risk | Supplied local `master` is not the code currently at fork/upstream `master` and differs from the public application. | Local branch is 6 commits ahead and 34 behind; the supplied checkout has no configured remotes. | **Contained for review.** Current fork-head changes are isolated on `codex/round2-review`; fork and upstream `master` still match at `2c460175`. No changes have been pushed or deployed. | GitHub API branch check; local branch graph; see `AUDIT_REPORT.md`. |
| D-06 | P2 verification gap | Playwright tests on the supplied checkout could not start. | Chromium binary missing from the machine. | **Open environment item.** Install the pinned Playwright browser and rerun. | `npm.cmd run test:e2e`: 3 launch failures before assertions. |
| D-07 | P2 verification gap | Broad file and accessibility matrix was not repeated end to end. | Limited audit time; several formats rely on browser OCR and specific adapters. | **Open.** Test the exact format/page/Unicode/table and mobile cases before claiming broad compatibility. | See untested-case list in `AUDIT_REPORT.md`. |
| D-08 | P2 deployment verification gap | Exact Vercel commit, environment configuration and latest deployment state were not inspected. | No connected Vercel dashboard/tool access in this session. | **Open.** Verify Vercel project and deployment after review; no deployment action was taken. | Public homepage/API checks only. |

## Priority order

1. Resolve D-05 before merging or deploying: choose the intended codebase and reconcile the divergent local branch without discarding its four uncommitted changes.
2. Review and accept D-01 and D-02 fixes.
3. Broaden D-03 validation for multi-page/scanned PDFs, page breaks and complex DOCX tables; current limits are disclosed.
4. Keep D-04 visible as a prototype limitation and use only synthetic content.
5. Install Playwright Chromium and run format/accessibility regression cases, then verify the actual Vercel deployment.

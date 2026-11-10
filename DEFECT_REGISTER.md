# OnBrand Defect Register

Updated: 10 November 2026 (IST). Status describes the isolated `codex/round2-review` branch unless noted.

| ID | Priority | Defect / limitation | Root cause | Status | Regression or evidence |
|---|---|---|---|---|---|
| D-01 | P1 | Demo UI exposed personal names and initials in profiles, assignments, comments and decisions; old local records retained names. | Hard-coded people were used as simulated accounts and attribution. | **Fixed in review branch.** New UI uses role labels; saved review attribution is normalized on restore. | `src/lib/identity.test.ts`; local browser body-text check returned no names. |
| D-02 | P1 | Policy and approved avoided-wording findings could show no supporting approved source quote. | Rule and profile matching returned a label and severity without linking an eligible source fact. | **Fixed in review branch.** Matching approved source quote is attached and validated; missing policy quotes are stated. | `src/lib/onbrand.test.ts`; local browser displayed exact source quote. |
| D-03 | P1 | Original PDF/DOCX is not preserved or shown with page/paragraph navigation and native location highlights. | Current flow extracts text into a draft and discards the original after local parsing. | **Open.** Requires a format-specific viewer and location-aware extraction; plain text is not an acceptable substitute. | Public upload copy, README format table, and UI behavior. |
| D-04 | P1 limitation | Demo roles, reviews and decisions use browser-local storage, without verified identity or shared persistence. | The public build is intentionally an account-free prototype. | **Open, disclosed.** Suitable for synthetic judging only; not durable multi-user governance. | `GET /api/health`; README disclosure. |
| D-05 | P1 delivery risk | Supplied local `master` is not the code currently at fork/upstream `master` and differs from the public application. | Local branch is 6 commits ahead and 34 behind; Git config has no remotes. | **Contained for review.** Current fork-head changes are isolated on `codex/round2-review`; nothing was merged, pushed or deployed. | Fork/upstream both `2c460175`; local head `e041c9a`; see `AUDIT_REPORT.md`. |
| D-06 | P2 verification gap | Playwright tests on the supplied checkout could not start. | Chromium binary missing from the machine. | **Open environment item.** Install the pinned Playwright browser and rerun. | `npm.cmd run test:e2e`: 3 launch failures before assertions. |
| D-07 | P2 verification gap | Broad file and accessibility matrix was not repeated end to end. | Limited audit time; several formats rely on browser OCR and specific adapters. | **Open.** Test the exact format/page/Unicode/table and mobile cases before claiming broad compatibility. | See untested-case list in `AUDIT_REPORT.md`. |
| D-08 | P2 deployment verification gap | Exact Vercel commit, environment configuration and latest deployment state were not inspected. | No connected Vercel dashboard/tool access in this session. | **Open.** Verify Vercel project and deployment after review; no deployment action was taken. | Public homepage/API checks only. |

## Priority order

1. Resolve D-05 before merging or deploying: choose the intended codebase and reconcile the divergent local branch without discarding its four uncommitted changes.
2. Review and accept D-01 and D-02 fixes.
3. Decide whether the judge build must preserve and render original documents; if yes, complete D-03 with honest page/paragraph mappings.
4. Keep D-04 visible as a prototype limitation and use only synthetic content.
5. Install Playwright Chromium and run format/accessibility regression cases, then verify the actual Vercel deployment.

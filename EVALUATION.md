# OnBrand Round 2 evaluation

## Automated deterministic regression set

Run `npm run test`. The current set has thirty-four focused checks, including atomic-clause spans, SHA-256 fingerprinting, citation validation, two-pass semantic checks, suggestion grounding, API-side source quarantine, text-file import limits and route-level model-boundary fault injections:

| Evaluation case | Expected result |
| --- | --- |
| Seeded review baseline | Supported claims, a contradicted claim and an equal-authority conflict are surfaced |
| Evidence omission | Claim is labelled `NO_APPROVED_EVIDENCE`; explanation says unverified, not false |
| Prompt injection in submitted copy | Claim is labelled `NEEDS_HUMAN` and blocks approval |
| Contradictory sources | Higher-authority active evidence takes precedence; lower authority does not create a tie |
| Source version precedence | A newer version wins when authority and effective date match |
| Finite validity periods | Equal-precedence sources still conflict when both are within their effective dates |
| Finding offsets | Each reported Unicode code-point span maps back to the exact claim text, including a non-BMP character before the finding; suggestion replacement preserves the prefix |
| Compound sentence coverage | Independent factual clauses are reviewed separately; only subject context is inherited, exact clause offsets are retained, and neighboring clause evidence cannot support the claim |
| Multi-metric coverage gap | With multiple numeric claims plus another factual predicate, the predicate becomes a blocking `NEEDS_HUMAN` finding with its original span |
| Citation C1–C4 validation | Every retrieved quote is checked against source identity, approved version/effective date, channel and exact source text; failures are excluded and block review |
| Two-pass C5 verification | Independent differently worded, reordered passes must agree and return exact passage quotations; disagreement, provider failure or fabricated quotes route to human review |
| Insufficient evidence | When both passes find the passages related but insufficient, no source is shown as proof and the status remains `NO_APPROVED_EVIDENCE` |
| Suggested revision | Candidate is accepted only after a fresh complete review and cannot pass if it remains blocking |
| Suggestion grounding gate | A freshly reviewed but unsupported replacement is rejected even when its finding is nonblocking |
| Unsupported benefit | Mentioning the product name alone does not retrieve an unrelated product fact as evidence |
| Evidence topic match | A claim that matches an approved fact's attribute and value still retrieves the supporting quote |
| Brand profile rule | An approved profile's avoided terms are checked in new reviews |
| Knowledge snapshot change | Changing an approved fact changes the report snapshot and invalidates a prior decision |
| HTML accessibility sample | Missing image alternative, heading jump, vague link, missing document language and low inline contrast are found |
| Version fingerprints | Draft and source snapshots use 64-character SHA-256 hashes; digest matches the standard `abc` test vector |
| Model omission attack | An advisory response that says “no issues” cannot remove or downgrade code findings |
| Provider outage | A configured provider failure adds a blocking `NEEDS_HUMAN` finding and retains deterministic findings |
| Imported prompt injection | The API independently quarantines an instruction-bearing source, even if the client marks it approved, excludes it from retrieval, and adds a blocking finding |
| Browser text imports | TXT, Markdown and HTML content is retained as editable draft text; empty, unsupported, oversized and overlong files are rejected |

**Latest run:** 35/35 automated checks passed on 8 Nov 2026. Thirty-four focused checks cover the behaviors above; one additional test evaluates the 20-draft synthetic development set. Semantic-verifier tests stub the provider and prove output-contract behavior, not model accuracy. These are builder-authored regression checks, not an independent benchmark or a claim of real-world accuracy.

## 20-draft synthetic development set

`src/lib/dev-set.test.ts` composes 20 synthetic drafts across social, web and email channels, with five labelled findings per draft (100 claim instances total). Its fixture bank covers supported facts, numeric contradictions, unsupported benefits, restricted claims, equal-authority bundle conflicts and injection text. The test checks expected status agreement, exact draft-span mapping, exact source quotation/version membership in the approved fixture, and blocking of expected high-risk findings.

**Latest run:** 100/100 expected statuses; 100/100 exact span and approved source quote/version checks; 0/60 missed blocks on contradicted, conflict and injection instances. The 100 claim instances reuse a small set of controlled templates, so this verifies deterministic behavior against the seeded domain and must not be presented as general accuracy. The B0 comparison below uses this same development set; it does not replace an independently adjudicated set.

## B0 single-call RAG baseline

`node scripts/run-b0-baseline.mjs` evaluates a plain single-call checker with simple lexical top-4 snippets. It has no structured fact matching, source-precedence resolution, mandatory code findings or separate citation verification. The run used the same local Ollama `qwen2.5:3b` model as the advisory panel. Raw inputs, outputs and measurements are saved in [`evaluation-results/b0-baseline-2026-11-08.json`](evaluation-results/b0-baseline-2026-11-08.json).

| Measure | B0 baseline | OnBrand deterministic regression |
| --- | ---: | ---: |
| Claims with expected statuses | 100 | 100 |
| Status agreement with builder-authored labels | 51/100 (51%) | 100/100 (100%) |
| Expected blocking claims flagged as blocking | 24/60 (40%) | 60/60 (100%) |
| Missed expected blocks | 36/60 | 0/60 |
| Exact quote strings among nonempty quotes | 44/47 (93.6%); no code validation | 100/100 exact approved source quote/version membership |
| Valid outputs / processed drafts | 20/20 valid JSON responses | 20/20 drafts processed |
| Median / maximum latency per draft | 6.2 s / 7.7 s locally | Not directly comparable; deterministic engine only |

The B0 set and expected labels are the same builder-authored, repeated-template development set used by the OnBrand regression test. This is a controlled engineering comparison, not an independent benchmark or proof of general accuracy. The latency is local-model-only and not a production service target. The baseline script intentionally allows a model-only review path so its omission and misclassification behavior can be observed; do not use it to approve real content.

## Round 1 M1–M8 delivery audit (8 Nov 2026)

The statuses below describe the actual prototype against the submitted Round 1 must-build list. “Prototype complete” means demonstrable in this browser-based preview; it does not imply production controls.

| Milestone | Current evidence | Status and remaining gap |
| --- | --- | --- |
| M1 — Tenants, roles, brand profile and versioned knowledge | Maintainer-only demo import; approved profile edit creates a version and archives the previous profile; sources carry authority, validity, channel and lifecycle fields; imported instruction-like text is quarantined | **Partial.** No verified sign-in, server-enforced roles, tenant isolation or shared persistence. |
| M2 — Draft submission with versioning | Draft metadata/content, immutable local version history, SHA-256 content hash and version-bound review | **Prototype complete.** Records live in this browser; this is not shared or tamper-resistant storage. |
| M3 — Claim extraction, spans and coverage | Sentence segmentation, separate numeric-claim extraction, predicate-clause splitting, subject-only retrieval context, half-open Unicode code-point spans against the unchanged original draft, and a regression-checked detector that routes an extra factual predicate after multiple numeric claims to human review | **Partial.** The prototype does not transform the draft before extraction, so offsets reference the original directly; no separately versioned normalization/offset-map layer exists. Broader linguistic coverage, multilingual text and diverse real-world drafts remain unvalidated. |
| M4 — Hybrid retrieval, precedence and semantic verification | Structured fact lookup, lexical/trigram ranking with reciprocal-rank fusion, date/channel eligibility, authority/date/version precedence, explicit conflict outcome, C1–C4 checks, and an optional two-pass C5 verifier for free-text claims | **Partial.** Retrieval remains in memory rather than PostgreSQL FTS; the semantic model has not been independently accuracy-tested and is not configured in Vercel production. |
| M5 — Mandatory findings, rules and explainable report | Code-generated claim findings, exact quotes/spans, C1–C4 mechanical citation checks, optional two-pass C5 relation checks, deterministic risk/disclosure rules and five selected HTML checks | **Partial.** No human-labelled citation-entailment benchmark or browser-level WCAG validation. |
| M6 — Verified suggestions | Eligible suggestion is re-run through the full review pipeline; it must return `SUPPORTED` with an approved citation; a new draft version is created | **Prototype complete.** Grounding gate is limited to the present structured evidence fixtures and rules. |
| M7 — Human review workflow | Demo role switch, reviewer assignment, comments, change request, hash-bound approval, reopen and audit history | **Prototype complete.** The role switch and audit state are browser-local and are not security or durable audit controls. |
| M8 — Evaluation and security tests | 20-draft/100-claim synthetic set; B0 one-call comparison; client-import and API-boundary source-injection quarantine; model omission and provider-outage fault injection | **Partial.** Labels are not independent; no tenant-isolation test or persistent-service fault tests. |

The target remains **10 Nov 2026**. The latest code commit deployed successfully to Vercel production on 8 Nov 2026. Both [outcoded.xyz](https://outcoded.xyz) and the [Vercel fallback](https://on-brand-zeta.vercel.app) return HTTP 200 for the homepage, health endpoint and PDF worker; the homepage includes the latest OCR disclosure. Public Google and Cloudflare DNS resolvers return Vercel's assigned apex A record `216.198.79.1`. Production currently uses browser-local demo storage and deterministic review mode; verified sign-in, PostgreSQL persistence and a hosted model provider are not configured.

## Manual workflow observations

- Browser import flow was checked with a generated DOCX (paragraphs), selectable-text PDF, and PNG image. DOCX paragraphs and PDF lines appeared as editable draft text; OCR output appeared as editable text and the UI now asks reviewers to proofread imported content before analysis. These are smoke checks of those exact sample files, not broad compatibility testing across office/PDF/image variants.
- Review produced claim-level supported, source-conflict and contradicted statuses with source quotes.
- A risky suggestion was rechecked, applied as a new draft version and reported as supported.
- Review comments could be added and resolved.
- Approval remained disabled while a blocking conflict remained.
- Prompt-injection text was reported as `NEEDS_HUMAN` and treated as untrusted content.
- The demo title, navigation and workspace identify the product as **OnBrand**; Sample Foods is labelled synthetic client data.
- The local build completed one two-claim review through the configured model and returned all four advisory roles; this is a single smoke run, not evidence of model accuracy or dependable latency.
- A temporary Cloudflare preview is also available at [OnBrand](https://indices-cradle-thirty-quarter.trycloudflare.com). It stops when the tunnel or demo host stops and is not the production deployment.
- The local app is configured to use locally hosted Ollama `qwen2.5:3b` for two semantic-verification passes and the four-role advisory panel. Semantic-pass regression tests stub the provider; model accuracy is not independently measured, and the one smoke run is not a latency benchmark. The Vercel production deployment uses deterministic mode because it has no hosted model credentials; draft text is not sent to an external model provider there.

## Targets for a larger labelled set

These are targets for future benchmark data, not current measured results:

| Measure | Target |
| --- | ---: |
| Exact citation/source quote validity | 100% |
| Finding span alignment | 100% |
| Seeded expected status agreement | 100% |
| False automatic approvals on seeded blocking cases | 0 |
| Human-review routing for prompt-injection cases | 100% |
| Reviewer agreement with evidence statuses on a labelled domain set | ≥90% |

Before claiming benchmark accuracy, assemble a domain-labelled set with approved source snapshots, draft claims, expected statuses and adjudicated conflict outcomes; report per-status precision/recall and false-approval rate. Review cases that miss targets and update rules/retrieval before release.

The planned 20-draft synthetic development set and a measured B0 single-call baseline are implemented. Independent labels and tenant-isolation tests are not yet complete. Model omission and provider-outage behavior have route-level fault-injection coverage, but multi-tenant database isolation cannot be tested until server-side identity and database persistence are connected. These checks verify prototype behavior only. No user-interview or reviewer-study results are claimed.

## Boundaries

Tenant-isolation tests, authenticated role enforcement, concurrent multi-user persistence, provider-failure simulation and production-scale latency remain unverified because the current demo has no connected database, verified identity provider or model key. The UI role switch and localStorage are demonstration features, not production security controls. Add those tests when the corresponding server-side services are connected.

# OnBrand

**Evidence-led review for people who publish.** OnBrand checks draft content against approved brand knowledge, identifies supported claims, gaps, conflicts, policy risks and selected accessibility issues, then offers a rechecked revision for a human to consider.

**Live judge preview:** [Open OnBrand](https://indices-cradle-thirty-quarter.trycloudflare.com). This is a temporary preview link and remains available only while the demo host and tunnel are running. The team's `outcoded.xyz` domain is not connected yet.

OnBrand analyses and recommends. It does **not** publish content or execute external actions. A human reviewer retains approval authority. The current Round 2 build is a judge-ready prototype: demo records use browser-local storage, the role switch is simulated, and there is no production login or shared database connected.

## Three improvements visible in the build

1. **Evidence is inspectable.** Findings show the retrieved approved source, version and quotation. Retrieval combines lexical/trigram ranking with a separate attribute/value topic gate, so a product-name match alone cannot substantiate an unrelated benefit. Semantic citation entailment has not been independently validated.
2. **Uncertainty stays distinct.** OnBrand separates unsupported claims, contradictions and same-precedence source conflicts on single-value facts; list-valued facts such as ingredients do not conflict merely because several approved values exist. Unresolved high-risk items keep approval blocked.
3. **A suggestion must earn acceptance.** A proposed edit is checked against the complete review pipeline again, saved as a new version, and remains subject to a human decision tied to the reviewed draft and source snapshot.

## Try the core flow

1. Open the demo and inspect the draft, channel and review findings.
2. Select a finding to see its precise draft span, status, explanation and approved source quote.
3. Edit the draft or select **Recheck & apply** on an eligible suggestion. OnBrand creates a new content version and runs a fresh review.
4. Add or resolve a human review comment. Switch to the demo maintainer role to import a JSON or CSV knowledge source; imported material stays pending until approved. In the Knowledge base, maintainers can also edit the synthetic brand voice, audience, avoided wording and palette. Saving creates an approved knowledge version, archives the previous one and invalidates existing review decisions; profile-specific avoided wording is checked in new reviews.
5. Review the current version as a reviewer. Approval stays disabled while the report is stale or blocking findings remain.
6. Use **Reset demo** to return to the initial workspace.

The demo fixture includes supported claims, an unsupported claim, a contradictory claim, a same-authority source conflict, an omission check, and an instruction-injection example. The product identity is **OnBrand** throughout; “Sample Foods” and its oat-bites product are synthetic client data used only to demonstrate the workflow.

For a ready-to-import CSV example, use [`examples/source-import-template.csv`](examples/source-import-template.csv). CSV columns are `subject`, `attribute`, `value`, `unit`, and `statement`. Imports are limited to 1 MB, validated, forced into `PENDING_REVIEW`, and only enter retrieval after the demo maintainer explicitly approves them.

## Architecture

```text
Browser editor and review workspace
  ├─ draft versions, comments, demo role, source register (localStorage)
  └─ POST /api/reviews
       ├─ validate bounded request with Zod
       ├─ recompute draft hash; filter approved and active sources
       ├─ hybrid lexical + character-trigram retrieval
       ├─ resolve by source authority, effective date, version and channel
       ├─ deterministic claim, omission, risk and HTML accessibility checks
       └─ optional four-call panel: independent Advocate, Challenger and Policy/Risk
            └─ Judge synthesizes those notes; advisory only
            └─ statuses, quotations and approval gates remain code-controlled
```

`src/lib/onbrand.ts` contains the finding contract, demo source/fact model, retrieval, precedence, status assignment, injection detection, accessibility checks, and suggestion recheck. Retrieval first requires overlap with fact attributes/values after removing product-subject terms, then uses lexical/trigram ranking to order relevant approved sources. Each finding carries a stable ID, source draft/version/hash, exact character offsets, evidence status, severity, blocking flag, explanation, source IDs/versions/quotes, and optional suggestion state. `src/app/api/reviews/route.ts` validates incoming data and recomputes the draft fingerprint before analysis. `db/0001_initial.sql` and `src/lib/schema.ts` document the planned PostgreSQL schema and row-scope policies; they are **not connected to the demo UI** without a verified authentication layer and database setup.

### Evidence and precedence

Only approved, unrevoked sources effective for the selected date and channel enter retrieval. Candidate facts are ranked by lexical overlap and trigram similarity; a bounded candidate set is then ordered by configured source authority, effective date and version. A source snapshot hash makes changes invalidate the review. If equally authoritative applicable sources disagree on a single-value fact, OnBrand reports a conflict and requires a human to resolve ownership or effective dates instead of guessing. List-valued attributes such as ingredients, allergens and approved claims can contain multiple valid entries without being treated as contradictions. A weaker source cannot override a higher-authority approved source. The demo's source register shows owner, type, version, scope and lifecycle status.

### Safety and decision boundary

Drafts and imported source text are untrusted data. The API schema bounds fields and file size; imported files are parsed as structured JSON/CSV, never executed. Prompt-injection patterns are flagged, and optional model instructions explicitly treat draft/evidence as data. The model cannot write findings, citations, statuses or decisions. Model errors fail closed into a blocking human-review finding. The UI offers no publishing connector or external action tool. Browser role selection is a demonstration aid, **not access control**; do not use this prototype with confidential company material.

## Technology choices

| Area | Choice | Why it fits this build |
| --- | --- | --- |
| User interface | Next.js App Router, React, TypeScript | Fast interactive review workspace with a typed application boundary |
| Styling | CSS and Tailwind tooling | Responsive, consistent interface without a component-library dependency |
| Request validation | Zod | Reject malformed or oversized review requests before analysis |
| Review engine | Deterministic TypeScript rules + hybrid lexical/trigram retrieval | Reproducible evidence status, citations, source precedence and demo behavior |
| Optional advisory panel | OpenAI-compatible API through the official OpenAI SDK | Three independent perspectives run concurrently; a fourth Judge call synthesizes them. Notes are advisory and never the source of verdicts |
| Planned persistence | PostgreSQL + Drizzle ORM | Versioned, tenant-scoped records when verified auth and database credentials are available |
| Current demo persistence | Browser `localStorage` | Lets judges use the full prototype without account setup; data stays in that browser |

## Run locally

Requirements: Node.js 20.9+ and npm.

```bash
npm install
npm run dev
```

Open `http://localhost:3000`. Optional model settings are in `.env.example`. Without `OPENAI_API_KEY`, reviews run in disclosed deterministic mode. `OPENAI_BASE_URL` and `OPENAI_MODEL` are optional. Do not commit secrets. `DATABASE_URL` is only a reserved configuration for the planned database path and does not activate persistence in this prototype.

## Team responsibilities

| Member | Primary ownership | Shared work |
| --- | --- | --- |
| Siddhesh Songare | Evidence model, retrieval/precedence, risk and injection controls, evaluation cases | Product decisions, integration, end-to-end checks and demo |
| Aanchal Sharma | Review interface, draft/version workflow, knowledge and reviewer experience | Product decisions, integration, end-to-end checks and demo |

The work is intentionally split across technical and product responsibilities; both members contribute to integration, validation and the final demonstration.

## Round 2 scope and next steps

The functional slice prioritizes the complete review loop: edit or submit a draft → retrieve approved evidence → inspect claim-level findings → revise and recheck → human review decision. The next production steps are verified sign-in and server-enforced membership, connected PostgreSQL persistence with tenant isolation, richer document ingestion/embedding retrieval, stronger accessibility validation, and deployment on the team's confirmed hosting account/domain. No external credentials are included in this repository.

## AI and third-party disclosure

This prototype was built on the official Next.js starter. The current public preview uses the locally hosted Ollama `qwen2.5:3b` model for its advisory panel, so draft text is not sent to an external model provider. Other installations can use an OpenAI-compatible endpoint. When configured, the current draft text, generated findings and limited source metadata/quotes are sent in four calls: Advocate, Challenger and Policy/Risk run independently, followed by a Judge synthesis. Any failed or malformed call makes the panel unavailable and the route adds a blocking human-review finding. The model cannot change code statuses, source quotes or human decisions; the deterministic engine remains authoritative. The local model can take longer on its first cold start; the client is allowed up to 75 seconds per provider call.

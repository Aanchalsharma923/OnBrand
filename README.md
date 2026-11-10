# OnBrand

**Evidence-led review for people who publish.** OnBrand checks draft content against approved brand knowledge, identifies supported claims, gaps, conflicts, policy risks and selected accessibility issues, then offers a rechecked revision for a human to consider.

**Live judge build:** [Open OnBrand at outcoded.xyz](https://outcoded.xyz). [Vercel fallback](https://on-brand-zeta.vercel.app) is also available.

OnBrand analyses and recommends. It does **not** publish content or execute external actions. A human reviewer retains approval authority. The current Round 2 build is a judge-ready prototype: demo records use browser-local storage, the role switch is simulated, and there is no production login or shared database connected. Public demo attribution uses role labels rather than team-member names; older saved review records are normalized when restored.

## Three improvements visible in the build

1. **Evidence is inspectable.** Findings show the retrieved source, version and quotation. Retrieval combines lexical/trigram ranking with a separate attribute/value topic gate. Code checks source identity, version/date, channel scope and exact quote (C1–C4). When a model provider is configured, two independent semantic passes must agree on a free-text claim and cite exact passage text (C5); disagreement or a fabricated quote routes to human review. The semantic model has not been independently benchmarked, and production runs without it in disclosed deterministic mode.
2. **Uncertainty stays distinct.** OnBrand separates unsupported claims, contradictions and same-precedence source conflicts on single-value facts; list-valued facts such as ingredients do not conflict merely because several approved values exist. Unresolved high-risk items keep approval blocked.
3. **A suggestion must earn acceptance.** A proposed edit is checked against the complete review pipeline again, saved as a new version, and remains subject to a human decision tied to the reviewed draft and source snapshot.

## Try the core flow

1. Open the demo and inspect the draft, channel and review findings.
2. Select a finding to see its precise draft span, status, explanation and approved source quote.
3. Edit the draft or select **Recheck & apply** on an eligible suggestion. OnBrand creates a new content version and runs a fresh review.
4. Add or resolve a human review comment. Switch to the demo maintainer role to import a JSON or CSV knowledge source; imported material stays pending until approved. In the Knowledge base, maintainers can also edit the synthetic brand voice, audience, avoided wording and palette. Saving creates an approved knowledge version, archives the previous one and invalidates existing review decisions; profile-specific avoided wording is checked in new reviews.
5. Review the current version as a reviewer. Approval stays disabled while the report is stale or blocking findings remain.
6. Use **Reset demo** to return to the initial workspace.

### Draft formats accepted in Round 2

| Format | What OnBrand reads | Current limit |
| --- | --- | --- |
| Plain text, Markdown and HTML | Text content; HTML also receives the selected accessibility checks | 20,000 extracted characters |
| Word DOCX | Paragraph and table text from the document body | 10 MB file; formatting and embedded images are not analyzed |
| PDF | Selectable text; scanned pages without a text layer use browser OCR | 10 MB and 20 pages per file |
| PNG, JPG, WebP, BMP and TIFF | Visible text through English OCR, processed in the browser | 10 MB; OCR quality depends on image clarity |
| MP4 and WebM reels | Visible text from up to six sampled video frames through English OCR; the frame text becomes editable draft text | 50 MB and 3 minutes per file; spoken audio, colors, logos, layout and visual consistency are not analysed |

Files are parsed in the browser, and uploaded originals are stored in this browser's IndexedDB for local preview/download; they are not uploaded by the file-import step. Extracted text and the original-file reference are saved in this browser's demo workspace. Clearing browser site data or changing browsers can remove access to local originals. **Proofread imported text before review**, especially OCR output, because characters can be missed or misread. A configured external model may receive the draft text during review, as described in the AI disclosure below. OCR does not check image layout, palette, logo use or visual consistency. Video speech is not transcribed. Findings select extracted draft text and do not map to PDF pages or DOCX paragraphs. PDF/DOCX files with complex layouts, handwriting and non-English OCR are not claimed as supported.

The demo fixture includes supported claims, an unsupported claim, a contradictory claim, a same-authority source conflict, an omission check, and an instruction-injection example. The product identity is **OnBrand** throughout; “Sample Foods” and its oat-bites product are synthetic client data used only to demonstrate the workflow.

For a ready-to-import CSV example, use [`examples/source-import-template.csv`](examples/source-import-template.csv). CSV columns are `subject`, `attribute`, `value`, `unit`, and `statement`. Imports are limited to 1 MB, validated, forced into `PENDING_REVIEW`, and only enter retrieval after the demo maintainer explicitly approves them.

## Architecture

```text
Browser editor and review workspace
  ├─ local file extraction: TXT/MD/HTML, DOCX/PDF text, image OCR and sampled MP4/WebM frame OCR
  ├─ draft versions, comments, demo role, source register (localStorage)
  └─ POST /api/reviews
       ├─ validate bounded request with Zod
       ├─ recompute draft hash; filter approved and active sources
       ├─ hybrid lexical + character-trigram retrieval
       ├─ resolve by source authority, effective date, version and channel
       ├─ deterministic claim, omission, risk, citation C1–C4 and HTML accessibility checks
       ├─ optional two-pass semantic citation verifier for eligible free-text claims
       └─ optional four-call panel: independent Advocate, Challenger and Policy/Risk
            └─ Judge synthesizes those notes; advisory only
            └─ statuses, quotations and approval gates remain code-controlled
```

`src/lib/onbrand.ts` contains the finding contract, demo source/fact model, retrieval, precedence, status assignment, injection detection, accessibility checks, and suggestion recheck. Retrieval first requires overlap with fact attributes/values after removing product-subject terms, then uses lexical/trigram ranking to order relevant approved sources. Each finding carries a stable ID, source draft/version/hash, exact half-open Unicode code-point offsets into the original draft, evidence status, severity, blocking flag, explanation, source IDs/versions/quotes, and optional suggestion state. Suggested edits convert those offsets to JavaScript's UTF-16 indexing only when replacing text. `src/app/api/reviews/route.ts` validates incoming data and recomputes the draft fingerprint before analysis. `db/0001_initial.sql` and `src/lib/schema.ts` document the planned PostgreSQL schema and row-scope policies; they are **not connected to the demo UI** without a verified authentication layer and database setup.

### Evidence and precedence

Only approved, unrevoked sources effective for the selected date and channel enter retrieval. Candidate facts are ranked by lexical overlap and trigram similarity; a bounded candidate set is then ordered by configured source authority, effective date and version. A source snapshot hash makes changes invalidate the review. If equally authoritative applicable sources disagree on a single-value fact, OnBrand reports a conflict and requires a human to resolve ownership or effective dates instead of guessing. List-valued attributes such as ingredients, allergens and approved claims can contain multiple valid entries without being treated as contradictions. A weaker source cannot override a higher-authority approved source. The demo's source register shows owner, type, version, scope and lifecycle status.

### Safety and decision boundary

Drafts and imported source text are untrusted data. The browser limits review-file size and extracted text; knowledge files are parsed as structured JSON/CSV, never executed. Prompt-injection patterns are flagged, and optional model instructions explicitly treat draft/evidence as data. Semantic verifier failure or disagreement sends the affected claim to human review. The advisory panel is optional and can be unavailable without suppressing deterministic findings. The model cannot write findings, citations, statuses or decisions. The UI offers no publishing connector or external action tool. Browser role selection is a demonstration aid, **not access control**; do not use this prototype with confidential company material.

## Technology choices

| Area | Choice | Why it fits this build |
| --- | --- | --- |
| User interface | Next.js App Router, React, TypeScript | Fast interactive review workspace with a typed application boundary |
| Styling | CSS and Tailwind tooling | Responsive, consistent interface without a component-library dependency |
| Request validation | Zod | Reject malformed or oversized review requests before analysis |
| Review engine | Deterministic TypeScript rules + hybrid lexical/trigram retrieval | Reproducible evidence status, citations, source precedence and demo behavior |
| Optional semantic verifier and advisory panel | OpenAI-compatible API through the official OpenAI SDK | Two differently worded, reordered verifier passes must agree on relation and exact quote; three independent advisory perspectives run concurrently, then a fourth Judge call synthesizes them. Code composes evidence status and humans decide |
| Planned persistence | PostgreSQL + Drizzle ORM | Versioned, tenant-scoped records when verified auth and database credentials are available |
| Current demo persistence | Browser `localStorage` | Lets judges use the full prototype without account setup; data stays in that browser |

## Run locally

Requirements: Node.js 24.x and npm.

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

The functional slice prioritizes the complete review loop: write or import a draft → retrieve approved evidence → inspect claim-level findings → revise and recheck → human review decision. Round 2 accepts text, Markdown, HTML, DOCX, text/scanned PDFs, common image files and MP4/WebM reels through local extraction. Reel extraction samples 3 to 6 evenly spaced frames for text OCR; it does not transcribe speech or inspect visual design. Remaining production steps are verified sign-in and server-enforced membership, connected PostgreSQL persistence with tenant isolation, broader semantic retrieval, complete visual-consistency analysis, stronger accessibility validation, and hosted model configuration. No external credentials are included in this repository.

## AI and third-party disclosure

This prototype was built on the official Next.js starter. The Vercel judge build uses deterministic review mode because no hosted model key is configured; it does not send draft content to an external model provider. The temporary Cloudflare preview uses locally hosted Ollama `qwen2.5:3b`. Other installations can use an OpenAI-compatible endpoint. When configured, eligible free-text claims and their limited evidence quotes are sent to two independent semantic-verification passes. The draft, code findings and limited source metadata/quotes are also sent in four advisory calls: Advocate, Challenger and Policy/Risk run independently, followed by a Judge synthesis. A verifier disagreement, invalid quote or unavailable verifier routes affected claims to human review. The advisory panel is optional. The model cannot change source facts, human decisions or approval gates; code composes final evidence statuses. The semantic model's accuracy has not been independently benchmarked. Local models can take longer on a cold start; each provider call is allowed up to 75 seconds. Image and scanned-page OCR uses Tesseract.js in the browser; its worker, WebAssembly engine and English language data are fetched from the jsDelivr CDN on demand. The image/PDF bytes stay in the browser and are not sent to that CDN. OCR output is editable and should be proofread before review.

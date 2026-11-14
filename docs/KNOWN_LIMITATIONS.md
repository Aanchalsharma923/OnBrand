# OnBrand — Known Limitations & Operational Considerations

## 1. Hosted LLM & AI Gateway Status

- **Default Execution Mode**: Production runs by default in **disclosed deterministic mode**. The review engine generates 100% code-grounded findings against approved brand sources and statutory regulations without calling external model providers.
- **Honest Mode Disclosure**: When no external API key is configured or when hosted model mode is disabled, the UI and API explicitly state:
  > *"Deterministic mode is active. No model call was made."*
  OnBrand never simulates fake model thinking, token meters, or artificial processing delays.
- **Hosted Model Prerequisites**: To enable the optional two-pass semantic verifier (C5) and four-perspective advisory panel (Advocate, Challenger, Policy, Judge):
  - A valid OpenAI-compatible API key (`OPENAI_API_KEY`) must be configured.
  - The feature flag `ENABLE_HOSTED_MODEL=true` must be set in server environment variables.
- **Semantic Model Latency**: External model calls can introduce 3–15 seconds of latency per review, subject to provider availability and rate limits. If a model call times out or throws, the system degrades gracefully to deterministic mode without dropping code findings.

---

## 2. Document Format & Extraction Boundaries

| Document Type | Ingestion Method | Supported Scope | Known Limitations |
| :--- | :--- | :--- | :--- |
| **Plain Text / Markdown** | Native browser | Full text extraction & claim analysis | 30,000 character maximum. |
| **Word (.docx)** | Client Mammoth.js | Body paragraphs, headings, and table cells | Embedded images, headers/footers, complex macros, and Word shapes are not extracted. |
| **PowerPoint (.pptx)** | Client JSZip XML parse | Slide text boxes in slide presentation order | Slide visuals, speaker notes, embedded charts, and animations are not analyzed. |
| **Excel (.xlsx, .csv)** | Client JSZip / PapaParse | Cell text values in tabular sequence | Cell formulas, pivot tables, chart graphics, and hidden sheets are not rendered. |
| **PDF Documents** | PDF.js + Canvas OCR | Selectable text layer with page numbering; scanned pages use client OCR | Complex multi-column newspaper layouts, handwriting, and vectorized text paths may produce misaligned offsets. |
| **Images (.png, .jpg, .webp)** | Tesseract.js WASM | English visible typography | Dependent on image resolution, contrast, and font clarity. Non-English scripts and stylized logo marks are not supported. |
| **Video Reels (.mp4, .webm)** | HTML5 Video + Canvas | Up to 6 sampled frames for visible on-screen text OCR | Spoken audio is **not** transcribed; voiceover compliance, audio disclosures, and rapid video transitions are not analyzed. |

---

## 3. Visual & Packaging Analysis Boundaries

- **Logo Matching & Round 1 Precision Gate**: 
  - Exact binary identity is strictly cryptographically verified via server-side SHA-256 (`confidence: 1.0`).
  - Perceptual near-variant matching uses a 64-bit 2D difference hash (`dHash`) with a Hamming distance threshold $\le 12$ bits.
  - **Empirical Measurement**: While isolated scaling and recompression pass within 8 bits, complex transformations (rotation $\ge 45^\circ$, cropping $> 30\%$, heavy poster embedding) shift Hamming distances to $> 16$ bits, failing the 95% automated precision gate required for unassisted blocking.
  - **Governance Invariant**: Automated blocking for near-variant logos is **disabled**. All near-variant matches and unregistered marks are labeled `isExperimental: true`, assigned non-accusatory neutral finding language (*"Asset not found in approved registry"*), and routed to `NEEDS_HUMAN` review for human confirmation.
- **Sampled-Pixel Contrast Estimation**:
  - Contrast sampling partitions bounding-box pixels using 2-means clustering with border perimeter analysis.
  - Findings are transparently tagged `[ESTIMATE]` and never claim certified WCAG conformance.
  - When border perimeter distribution is balanced (difference $< 15\%$, such as split-tone or gradient backgrounds), foreground and background cannot be separated reliably and the check escalates safely to `NEEDS_HUMAN`.
- **Brand Palette & Delta-E Tolerance**:
  - Dominant color extraction uses CIE L\*a\*b\* clustering with CIE76 Delta-E distance calculation ($\Delta E \le 15.0$ tolerance).
  - Photographic and lifestyle assets are explicitly exempted from blocking palette violations; natural photographic colors are reported as non-blocking informational advisories.
- **Packaging Artwork Dielines**: OnBrand analyzes extracted text and primary packaging copy. It does not inspect physical package fold lines, cutter guides, or tactile embossing.
- **Barcode & QR Code Verification**: Barcode symbology (UPC, EAN, GS1-128) and QR destination URL validation are not currently supported.

---

## 4. Accessibility (A11y) Scope

- **HTML Content**: When reviewing HTML drafts, OnBrand identifies common accessibility flaws including missing image `alt` attributes, non-sequential heading hierarchy (e.g. `<h1>` followed directly by `<h4>`), vague link anchor text (*"click here"*), missing document `lang` attributes, and low inline color contrast.
- **Word (.docx) OpenXML AST**:
  - Embedded drawings: Flags missing `<wp:docPr descr="" title=""/>`, raw filename placeholders (`image1.png`, `chart_final.PNG`), and generic non-meaningful text (*"image"*, *"photo"*, *"figure"*). Explicitly decorative graphics (`<w14:decorative/>`) are exempted.
  - Heading hierarchy: Flags non-sequential heading jumps (e.g. Heading 1 directly to Heading 3).
  - Data tables: Flags tables lacking defined header rows (`<w:tblHeader>`).
  - Hyperlinks: Flags non-descriptive anchor text (*"click here"*, *"read more"*, *"more"*).
- **PDF Structure Inspection**:
  - Logical structure tree: Untagged PDFs lacking `/StructTreeRoot` emit a transparent `NEEDS_HUMAN` disclosure: *"Document structure cannot be assessed (untagged PDF)"*. The engine never guesses or invents semantic tags from visual layouts.
  - Tagged PDFs: Inspects structure elements; flags `/Figure` elements lacking `/Alt` alternative text.
  - **No False Conformance Claims**: Automated structural inspection never claims official PDF/UA or WCAG certification.

---

## 5. Deployment & Infrastructure Considerations

### 1. Public Self-Service Email Confirmation (Supabase SMTP)
- In the default Supabase project configuration, user signups require email verification.
- **Rate Limit Consideration**: Supabase's default built-in SMTP service imposes a strict rate limit (`email rate limit exceeded`) when multiple accounts register in rapid succession.
- **Production Recommendation**: Enterprise deployments intended for unthrottled public self-registration must configure an external custom SMTP provider (e.g., Resend, SendGrid, Amazon SES, or Postmark) in the Supabase Dashboard under *Project Settings -> Authentication -> SMTP Settings*.

### 2. Database Connection Pooling
- OnBrand connects to PostgreSQL 17 using the Supabase Transaction Pooler (port 6543) via PgBouncer.
- For high-concurrency enterprise workloads, ensure the database pool size is scaled to accommodate expected serverless function concurrency without exhausting PostgreSQL connections.

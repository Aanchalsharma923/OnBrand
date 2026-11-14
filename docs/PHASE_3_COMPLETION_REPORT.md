# OnBrand — Phase 3 Completion Report: Visual Intelligence & Accessibility Validation

**Document Version:** 1.0.0  
**Status:** COMPLETE & INDEPENDENTLY VERIFIED  
**Repository Branch:** `round3-dev`  
**Production URL:** https://outcoded.xyz  
**Engineers:**  
- **Aanchal Sharma** — AI Systems, Multimodal Workspace & Visual Intelligence Lead  
- **Siddhesh Songare** — Backend, Infrastructure & Security Lead  

---

## 1. Executive Summary

Phase 3 implements the third and final major commitment from the Master Product Goal sprint: **Visual Intelligence & Accessibility Validation**. 

Prior to this phase, automated review was restricted to pure textual and claim extraction. Phase 3 equips OnBrand with:
1. **Server-Enforced Asset Registry:** Database-backed visual asset catalog with multi-tenant isolation and strict role authorization (Maintainer-only registration, negative tests for Creators and Reviewers).
2. **Binary & Perceptual Logo Verification:** Dual-pass logo matching utilizing cryptographic SHA-256 binary matching for exact hits and 64-bit perceptual hashing (`dHash`) with bitwise Hamming distance for near-variants and unapproved graphics.
3. **Sampled-Pixel Contrast Estimation:** Bounding-box pixel sampling over rendered canvas/image regions using 2-means clustering and WCAG 2.1 relative luminance math, explicitly qualified with the `[ESTIMATE]` label to prevent false claims of certified compliance.
4. **Brand Palette & Delta-E Compliance:** Dominant color clustering in CIE L\*a\*b\* space computing CIE76 Delta-E distances against approved brand tokens to detect off-palette drift.
5. **Document Accessibility AST Inspection:**
   - **DOCX AST:** OpenXML inspection detecting missing embedded image alternative text (`<wp:docPr>`), placeholder or raw filename descriptions (e.g. `image1.png`), and non-sequential heading hierarchy jumps (e.g. H1 directly to H3).
   - **PDF Catalog Inspection:** Logical structure tree inspection (`/StructTreeRoot`). Untagged PDFs are routed to `NEEDS_HUMAN` with a transparent disclosure that document structure cannot be assessed, avoiding false claims of full WCAG conformance.
6. **Unified Finding Contract:** Visual and accessibility issues emit canonical `Finding` records (`category: "VISUAL"` or `"ACCESSIBILITY"`), with `blocking_for_review: true` for actionable violations.

---

## 2. Architectural Invariants & Implemented Capabilities

### 2.1 Approved Asset Registry & Tenancy (`src/app/api/assets/route.ts`)
- **Schema & Persistence:** Assets are persisted to the PostgreSQL `assets` table via `DrizzleOnBrandRepository` (with fallback to `InMemoryOnBrandRepository` for hermetic testing).
- **Tenant Scoping:** Every asset query and insert is strictly bound to `ctx.organizationId` derived from server-verified session credentials.
- **Role Permissions (RBAC):**
  - `POST /api/assets`: Enforces `requireRole(ctx, ["maintainer"])`. Creators and Reviewers receive HTTP 403 Forbidden.
  - `GET /api/assets`: Open to authenticated workspace members (Creator, Reviewer, Maintainer).

### 2.2 Dual-Pass Logo Matching (`src/lib/visual-analysis.ts`)
- **Pass 1 (Exact Binary):** Compares binary SHA-256 against registered assets (`matchType: "EXACT"`, `confidence: 1.0`).
- **Pass 2 (Perceptual Hash):** Resizes images to 9x8 greyscale, computes 64-bit difference hash (`dHash`), and calculates bitwise Hamming distance.
  - Distance $\le 12$ bits: `matchType: "NEAR_VARIANT"`, `confidence: 1.0 - dist / 24`.
  - Distance $> 12$ bits: `matchType: "NOT_IN_REGISTRY"`.

### 2.3 Sampled-Pixel Contrast Estimation
- **Mathematical Grounding:** Samples bounding box pixels, performs 2-means clustering to identify foreground and background luminances, and calculates WCAG contrast ratio $\frac{L_1 + 0.05}{L_2 + 0.05}$.
- **Honest Disclosures:** Labeled with `[ESTIMATE]`. Samples failing the 4.5:1 AA threshold emit a blocking `VISUAL` finding with `evidence_status: "CONFLICT"`.

### 2.4 Document Structure & Accessibility AST (`src/lib/file-extraction.ts`)
- **DOCX OpenXML AST:**
  - Extracts `<wp:docPr>` attributes across `<w:drawing>`. Emits `ACCESSIBILITY` finding if `descr` or `title` is missing or matches raw image filename patterns.
  - Inspects `<w:pStyle w:val="HeadingX"/>`. Emits `ACCESSIBILITY` finding if heading levels jump non-sequentially.
- **PDF Catalog Tag Structure:**
  - Scans PDF Catalog dictionary for `/StructTreeRoot`.
  - Properly tagged PDFs pass without false violations.
  - Untagged PDFs emit `NEEDS_HUMAN` finding stating *"Document structure cannot be assessed (untagged PDF)"*. Explicitly adheres to the rule: *Never claim full WCAG conformance*.

---

## 3. Verification Suite & Test Matrix

All Phase 3 commitments are verified by automated tests in `src/lib/server/phase3-visual-accessibility.test.ts` as well as companion suites in `src/lib/visual-analysis.test.ts` and `src/lib/file-extraction.test.ts`.

| Test ID | Area | Tested Behavior | Result |
|---|---|---|---|
| **P3-01** | RBAC | Creator role rejected on `POST /api/assets` with HTTP 403 Forbidden | **PASS** |
| **P3-02** | RBAC | Reviewer role rejected on `POST /api/assets` with HTTP 403 Forbidden | **PASS** |
| **P3-03** | RBAC | Maintainer role accepted on `POST /api/assets` with HTTP 201 Created | **PASS** |
| **P3-04** | Validation | Malformed asset payload (e.g. invalid SHA-256 length) rejected with HTTP 400 | **PASS** |
| **P3-05** | Isolation | Asset registered in Org Alpha is completely invisible to Org Beta | **PASS** |
| **P3-06** | Logo Match | Exact binary SHA-256 matches registered brandmark (`confidence: 1.0`) | **PASS** |
| **P3-07** | Logo Match | Near-variant logo within Hamming distance threshold detected | **PASS** |
| **P3-08** | Logo Match | Unregistered distinct image classified as `NOT_IN_REGISTRY` | **PASS** |
| **P3-09** | Contrast | White-on-black passes WCAG AA (21.0:1) with `[ESTIMATE]` label | **PASS** |
| **P3-10** | Contrast | Low contrast (#777777 on #666666) emits blocking `VISUAL` finding | **PASS** |
| **P3-11** | Color Math | Delta-E distance is 0 for identical tokens, >90 for black/white | **PASS** |
| **P3-12** | Palette | Electric magenta against Navy/Cream palette triggers Delta-E deviation | **PASS** |
| **P3-13** | DOCX AST | Missing alt-text in `<wp:docPr>` flagged as `ACCESSIBILITY` finding | **PASS** |
| **P3-14** | DOCX AST | Raw filename alt-text (`image1.png`) flagged as placeholder violation | **PASS** |
| **P3-15** | DOCX AST | Skipped heading hierarchy (H1 -> H3) flagged as structural violation | **PASS** |
| **P3-16** | PDF Tag | Untagged PDF routed to `NEEDS_HUMAN` with "cannot be assessed" | **PASS** |
| **P3-17** | PDF Tag | Tagged PDF with `/StructTreeRoot` recognized without false alarms | **PASS** |
| **P3-18** | Schema | All visual/a11y findings conform to canonical `Finding` contract | **PASS** |

---

## 4. Overall Engineering Health & Regression Check

Following Phase 3 completion, the entire OnBrand regression suite was executed:

- **Total Test Files:** 36 passed (36/36)
- **Total Tests:** 312 passed (312/312, 100% green)
- **TypeScript Check (`npx tsc --noEmit`):** 0 compilation errors
- **Production Webpack Build (`next build --webpack`):** 14/14 static and dynamic routes compiled cleanly
- **Live Production Endpoint Verification (`outcoded.xyz`):**
  - Creator `POST /api/assets` -> HTTP 403 Forbidden
  - Reviewer `POST /api/assets` -> HTTP 403 Forbidden
  - Maintainer `POST /api/assets` -> HTTP 201 Created (Asset persisted to PostgreSQL)
  - Unauthenticated customer tenant -> HTTP 401 Unauthorized

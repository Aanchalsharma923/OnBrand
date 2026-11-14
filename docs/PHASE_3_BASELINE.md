# OnBrand — Phase 3 Architecture Baseline & Inspection Report

**Document Version:** 1.0.0  
**Phase:** Round 3 — Phase 3: Visual Brand Governance, Logo Validation and Document Accessibility  
**Status:** ACTIVE BASELINE AUDIT  
**Deployment Target:** https://outcoded.xyz  
**Engineers:** Aanchal Sharma (Computer Vision, Visual Intelligence & UX Lead), Siddhesh Songare (Backend, Infrastructure & Security Lead)  

---

## 1. Executive Summary

This baseline document audits OnBrand's visual, multimodal, and accessibility subsystems prior to the full execution of Phase 3. 

While Phase 1 established multi-tenant PostgreSQL persistence with server-enforced role matrices, and Phase 2 delivered evidence-grounded hosted verification with double-blind evaluation, Phase 3 extends OnBrand into a comprehensive multimodal brand governance platform.

Phase 3 introduces:
1. **Organization-Scoped Approved Asset Registry (`src/app/api/assets/route.ts`):** Database-backed asset store with strict Maintainer-only upload/approval permissions and multi-tenant isolation.
2. **Dual-Pass Logo Matching (`src/lib/visual-analysis.ts`):** Binary SHA-256 for exact matches and 64-bit perceptual difference hashing (`dHash`) with bitwise Hamming distance for near-variants and unapproved graphics.
3. **Sampled-Pixel Contrast Estimation (`sampleBoundingBoxContrast`):** 2-means clustering over bounding-box pixel buffers calculating WCAG relative luminance ratios, transparently tagged with `[ESTIMATE]` to prevent false claims of full certification.
4. **Brand Palette & Delta-E Compliance (`extractDominantPalette`):** Dominant color extraction in CIE L\*a\*b\* space computing CIE76 Delta-E distances against approved brand tokens.
5. **Document Accessibility AST Inspection (`src/lib/file-extraction.ts`):**
   - **DOCX OpenXML AST:** Missing embedded image alt-text, raw filename placeholders (`image1.png`), and non-sequential heading hierarchy jumps (e.g. H1 to H3).
   - **PDF Catalog Tag Structure:** Tagged PDF inspection via `/StructTreeRoot`; untagged PDFs routed to `NEEDS_HUMAN` with a transparent disclosure: *"Document structure cannot be assessed (untagged PDF)"*.
6. **Unified Finding Contract:** Visual and accessibility findings conform to the canonical `Finding` interface (`category: "VISUAL" | "ACCESSIBILITY"`), ensuring zero schema drift or UI disconnection.

---

## 2. Existing Functionality vs Missing Components

| Capability | Baseline State | Gap / Planned Deliverable in Phase 3 |
|---|---|---|
| **Asset Registry** | Schema written in `db/0001_initial.sql` (`assets` table). API route created in `src/app/api/assets/route.ts`. | Add full audit-event tracking (`ASSET_REGISTERED`), maintainer role checks, negative tests for Creator/Reviewer. |
| **Exact Logo Match** | SHA-256 binary hashing implemented in `src/lib/visual-analysis.ts`. | Add comprehensive test fixtures: original, resized, compressed, modified, transparent, and light/dark variants. |
| **Near-Variant Match** | 64-bit dHash and Hamming distance implemented with threshold $\le 12$ bits. | Calibrate distance thresholds, ensure `NEAR_VARIANT` requires human review, and `NOT_IN_REGISTRY` uses neutral, non-accusatory language. |
| **Pixel Contrast** | Sharp-based 2-means clustering implemented in `sampleBoundingBoxContrast`. | Enforce mandatory `[ESTIMATE]` label on all findings, calculate relative luminance $(L_1+0.05)/(L_2+0.05)$, disclaim WCAG certification. |
| **Brand Palette** | Color distance math in `checkBrandPalette` and CIE76 Delta-E in `calculateDeltaE`. | Standardize Delta-E tolerance $\le 15.0$ in CIE L\*a\*b\* space; emit blocking `VISUAL` findings for off-palette deviations. |
| **DOCX Accessibility** | Text extraction via Mammoth; raw XML parsing in `inspectDocxAccessibility`. | Inspect `<wp:docPr>` for missing/placeholder alt text; inspect `<w:pStyle>` for skipped heading levels. |
| **PDF Tag Inspection** | PDF text extracted via `pdfjs-dist`; catalog tree inspection in `inspectPdfTagStructure`. | Scan catalog for `/StructTreeRoot`. For untagged PDFs, emit `NEEDS_HUMAN` disclosure and never claim full WCAG compliance. |
| **Multimodal UI** | `ContentViewer.tsx` and `original-document.tsx` handle bounding box rendering. | Integrate visual and accessibility findings seamlessly into `FindingsPanel.tsx` with filtering and occurrence navigation. |
| **Action Tracking** | Informal task logs. | Author formal `docs/PHASE_3_ACTION_TRACKER.md` separating autonomous tasks from user-required actions. |

---

## 3. Reusable Modules and Dependencies

### 3.1 Existing Reusable Modules
- `src/lib/visual-analysis.ts`: Perceptual hashing, Hamming distance, 2-means pixel clustering, relative luminance, Delta-E color math.
- `src/lib/file-extraction.ts`: DOCX XML extraction, PDF tag structure inspection, image/video extraction pipelines.
- `src/lib/multimodal-workspace.ts`: BoundingBox coordinate types, ContentAnnotation interfaces, slide/sheet/transcript mappers.
- `src/app/original-document.tsx`: Interactive SVG canvas overlays, format-aware renderers, annotation tooltips.
- `src/lib/server/repository.ts`: `DrizzleOnBrandRepository` with PostgreSQL `assets` table and audit logging.
- `src/lib/server/auth.ts`: Server-side JWT / session validation and `requireRole(ctx, ["maintainer"])`.

### 3.2 External Dependencies
- `sharp` (v0.34.5): Image resizing, format normalization, and raw pixel buffer extraction for 2-means contrast sampling.
- `pdfjs-dist` (v4.10.38): PDF catalog loading and structure tree inspection.
- `jszip` (v3.10.1): ZIP container extraction for OpenXML `.docx` documents.
- `zod` (v3.24.2): Asset registration payload validation.

---

## 4. Key Architectural Decisions

1. **No Separate Visual Findings Schema:**
   Visual and accessibility findings must NOT create an alien reporting format. All findings implement the canonical `Finding` interface from `src/lib/onbrand.ts`, with `category: "VISUAL"` or `"ACCESSIBILITY"`.
2. **Honest Accessibility Disclosures:**
   OnBrand performs automated heuristic checks, not certified compliance audits. Automated checks must **never** claim "WCAG compliant" or "certified accessible". Contrast findings are explicitly labeled `[ESTIMATE]`.
3. **Untagged PDF Neutrality:**
   If a PDF lacks `/StructTreeRoot`, the engine returns: *"Document structure cannot be assessed (untagged PDF)"* with `evidence_status: "NEEDS_HUMAN"`. It does not guess or assume accessibility from visual layout.
4. **Non-Accusatory Registry Language:**
   When an uploaded logo does not match registered assets, it is classified as `NOT_IN_REGISTRY`. The system explicitly states *"Asset not found in approved registry"* rather than using punitive labels like "Counterfeit" or "Illegal".
5. **Multi-Tenant Asset Storage:**
   Assets are stored in tenant-isolated paths and queried with `organizationId` matching `ctx.organizationId`. A Maintainer in Organization Alpha cannot view or modify Organization Beta assets.

---

## 5. Implementation & Verification Sequence

1. **Step 1: Baseline Audit & Action Tracking (`docs/PHASE_3_BASELINE.md`, `docs/PHASE_3_ACTION_TRACKER.md`)**
   Document current capabilities, missing components, and action items.
2. **Step 2: Approved Asset Registry & Server RBAC (`src/app/api/assets/route.ts`)**
   Enforce Maintainer role on `POST /api/assets`, verify tenant isolation, and record audit events.
3. **Step 3: Logo Matching & Perceptual Hashing (`src/lib/visual-analysis.ts`)**
   Validate EXACT, NEAR_VARIANT, and NOT_IN_REGISTRY matching across synthetic test fixtures.
4. **Step 4: Sampled-Pixel Contrast Estimation & Palette Compliance**
   Validate 2-means pixel clustering with `[ESTIMATE]` label, WCAG relative luminance, and CIE76 Delta-E.
5. **Step 5: Document AST Inspection (DOCX & PDF)**
   Validate OpenXML alt-text / heading hierarchy checks and PDF `/StructTreeRoot` tag tree inspection.
6. **Step 6: Dedicated Test Suite (`src/lib/server/phase3-visual-accessibility.test.ts`)**
   18 automated tests validating all MUST requirements.
7. **Step 7: Production Build & Deployment Verification**
   Verify TypeScript (`npx tsc --noEmit`), full test suite (`npm test`), and live Vercel production deployment (`https://outcoded.xyz`).

---

## 6. Risk Analysis & Mitigations

| Risk | Probability | Impact | Mitigation Strategy |
|---|---|---|---|
| **Sharp Native Binary Failure on Vercel** | Low | High | Sharp is bundled with platform-specific prebuilts. Test production API routes to ensure image buffers process cleanly without crashing. |
| **False Contrast Violations on Complex Imagery** | Medium | Medium | Bounding-box sampling uses 2-means clustering rather than whole-image averages. All contrast findings are labeled `[ESTIMATE]` and uncertain samples route to `NEEDS_HUMAN`. |
| **DOCX XML Malformed / Zip Bomb Attack** | Low | High | Enforce 10 MB file size limits and validate zip container structure prior to decompression. |
| **Untagged PDF False Accusations** | Medium | Medium | Clear, neutral message: *"Document structure cannot be assessed (untagged PDF)"*. Do not report false WCAG failures for unassessed documents. |
| **Cross-Tenant Asset Tampering** | Low | Critical | Server-derived tenant context strictly prevents cross-tenant reads or writes. Negative tests verify isolation between Org Alpha and Org Beta. |

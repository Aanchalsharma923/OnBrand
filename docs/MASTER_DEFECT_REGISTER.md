# OnBrand — Master Defect Register

**Target Branch**: `round3-dev`  
**Latest Audit Base**: `6a6803142fdd5c1e72fcc74631df8bb08c548324`  
**Status**: Open & Under Hardening  

---

## 1. Summary of Defects by Severity

| Severity | Total | Resolved | Open | Description |
| :---: | :---: | :---: | :---: | :--- |
| **P0 (Critical)** | 0 | 0 | 0 | Critical data loss, remote code execution, or unauthenticated full-database compromise. |
| **P1 (High)** | 2 | 0 | 2 | Flawed review decision fallback; unconstrained file upload size and filename path traversal. |
| **P2 (Medium)** | 3 | 0 | 3 | Asset registry unvalidated metadata; decision version race check; unauthenticated demo role fallback in edge cases. |
| **P3 (Low)** | 1 | 0 | 1 | UI review staleness badge clarity when draft version is incremented. |

---

## 2. Detailed Defect Registry

### DEFECT-SEC-01 (P1): Decision Recording Fallback to Arbitrary Review
- **Severity**: P1 (High)
- **Component**: `src/lib/server/repository.ts` (`DrizzleOnBrandRepository.recordDecision`)
- **Description**: If a caller supplied a non-UUID reviewId and no review row matched `schema.reviews.draftHash == decision.draftHash`, lines 996–1006 fell back to querying `anyRevRows` (the most recent review in the organization regardless of draft or hash) and associated the decision with it.
- **Root Cause**: Overly permissive legacy fallback logic intended to facilitate mock testing when review IDs were synthetic.
- **Security & Integrity Impact**: A review decision (approval or rejection) could be erroneously recorded against an unrelated draft review within the same organization if a malformed review ID was submitted.
- **Repair**:
  1. Remove lines 996–1006 entirely.
  2. If the review cannot be located by UUID or draftHash within the tenant, throw an explicit `Error("Review not found for this organization")`.
  3. Ensure `POST /api/decisions` returns HTTP 404.
- **Verification Criteria**: Test with invalid review ID and mismatched draft hash; verify HTTP 404 is returned and no decision is inserted.

---

### DEFECT-SEC-02 (P1): File Upload Missing Size Cap and Filename Traversal Protection
- **Severity**: P1 (High)
- **Component**: `src/app/api/files/route.ts`
- **Description**: In `POST /api/files`, the server read `await file.arrayBuffer()` without first checking `Content-Length` or `file.size` against a maximum allowed threshold. Additionally, `file.name` was stored without sanitizing directory traversal characters (`../` or `\`).
- **Root Cause**: Missing input bounds validation before memory allocation and storage.
- **Security & Integrity Impact**: Memory exhaustion (DoS) via multi-gigabyte uploads; filename pollution with control characters or directory traversal strings.
- **Repair**:
  1. Enforce strict 50 MB hard limit on incoming files (`file.size > 50 * 1024 * 1024` $\rightarrow$ HTTP 413 Payload Too Large).
  2. Sanitize filename using `path.basename()` and strip null bytes and directory traversal patterns (`..`, `/`, `\`).
  3. Validate MIME type against allowed format registry magic bytes.
- **Verification Criteria**: Upload >50MB dummy file $\rightarrow$ 413; upload `../../etc/passwd` $\rightarrow$ stored as `passwd`.

---

### DEFECT-SEC-03 (P2): Asset Registration Lacks Binary Verification Option and Strict Size Bounds
- **Severity**: P2 (Medium)
- **Component**: `src/app/api/assets/route.ts`
- **Description**: `POST /api/assets` accepted `sha256`, `mimeType`, and `byteSize` directly from client JSON. While schema validated types, it did not enforce maximum byte size limits ($\le 50\text{MB}$) or provide server-side computation if a binary/base64 payload is provided.
- **Root Cause**: Metadata-only REST endpoint design.
- **Security & Integrity Impact**: A malicious maintainer could record invalid asset records with negative or gigabyte byte sizes or mismatched MIME types.
- **Repair**:
  1. Enforce `byteSize: z.number().int().min(1).max(50 * 1024 * 1024)`.
  2. Sanitize `name: z.string().min(1).max(255).regex(/^[a-zA-Z0-9_\- .]+$/)`.
  3. If base64 content is provided in `content`, compute actual SHA-256 and pHash server-side.
- **Verification Criteria**: Test registering asset with invalid byteSize or invalid characters in name $\rightarrow$ HTTP 400.

---

### DEFECT-SEC-04 (P2): Approval Does Not Explicitly Verify Draft Has Not Advanced to Newer Version
- **Severity**: P2 (Medium)
- **Component**: `src/app/api/decisions/route.ts`
- **Description**: `POST /api/decisions` verified that `review.draftHash === body.draftHash`, but did not check if the draft in the repository had already been modified to a newer version (e.g. `draft.currentVersion > review.draftVersion`).
- **Root Cause**: Decision route checked review hash but not draft parent record's `currentVersion`.
- **Security & Integrity Impact**: A reviewer approving a stale review v1 could believe they approved the draft when the author had already authored and saved draft v2 with different claims.
- **Repair**:
  1. Retrieve parent draft from repository via `repo.getDrafts(ctx)` or `repo.getDraftVersion(ctx, review.draftId)`.
  2. If a newer draft version exists with a different hash than `body.draftHash`, return HTTP 409 Conflict with message *"Stale draft: A newer version of this draft has already been created. Review and approve the latest version."*
- **Verification Criteria**: Save draft v1; run review; save draft v2; attempt to approve v1 review $\rightarrow$ HTTP 409 Conflict.

---

### DEFECT-SEC-05 (P2): Edge-Case Fallback for Unauthenticated Requests to Alpha Workspace
- **Severity**: P2 (Medium)
- **Component**: `src/lib/server/auth.ts` (`resolveTenantContext`)
- **Description**: When `process.env.STRICT_AUTH` is not set and `NODE_ENV !== "production"`, requests without any token that target `alpha` workspace fall through and honor `x-onbrand-role: maintainer`.
- **Root Cause**: Backward-compatibility fallback for offline unit tests that omitted mock demo tokens.
- **Security & Integrity Impact**: In local test environments or if misconfigured, unauthenticated requests could escalate to maintainer on Org Alpha.
- **Repair**:
  1. Require that even for demo organizations, requests must provide either a signed demo token, a verified Supabase JWT, or run in test environment with explicit test role headers.
  2. In production or strict auth mode, reject all unauthenticated requests regardless of organization.
- **Verification Criteria**: Unauthenticated request with `x-onbrand-role: maintainer` in production $\rightarrow$ HTTP 401.

---

### DEFECT-UX-01 (P3): Review Staleness UI Indicator on Version Advancement
- **Severity**: P3 (Low)
- **Component**: `src/app/page.tsx`
- **Description**: While `hasCurrentReview` and `hasCurrentDecision` correctly evaluate false when `draft.hash !== review.draftHash`, the UI badge could more prominently warn the user *"Stale review: Copy was modified after review was run"*.
- **Repair**: Enhance UI notice in Review pane when a review exists but does not match current draft hash.
- **Verification Criteria**: User edits copy; prominent amber banner appears indicating review is stale.

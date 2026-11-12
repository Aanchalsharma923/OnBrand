# AI Disclosure & Third-Party Library Documentation
**OnBrand — Round 3 (CodeTitans India 2026)**

---

## 1. AI & Hosted Model Architecture

### 1.1 Purpose and Boundaries
In OnBrand, AI models are used strictly as **advisory verifiers** for free-text claims. They do **not**:
- Render binding approval decisions (only human Reviewers can approve content).
- Override deterministic rule findings (e.g. `CONTRADICTED` metrics or `CONFLICT` states).
- Call external tools, publish content, or execute side effects.

All draft text and knowledge quotations sent to model endpoints are formatted as **untrusted quoted data**, with prompt instructions explicitly ordering the model to treat data strings as inert content and ignore any instruction injection patterns.

### 1.2 Two-Pass Semantic Citation Verifier (C5)
When a free-text narrative claim requires verification against approved sources:
1. Two independent model passes (Pass A and Pass B) run concurrently with distinct prompt phrasings and randomized candidate ordering.
2. The model must classify the entailment relation (`SUPPORTS`, `PARTIALLY_SUPPORTS`, `CONTRADICTS`, `INSUFFICIENT`) and quote an exact verbatim substring from an active approved source fact.
3. Both passes must strictly agree on the relation and the quoted citation.
4. If the passes disagree, if the citation does not exist in the source, or if the model call times out or returns malformed JSON:
   - The finding immediately degrades to `evidence_status: "NEEDS_HUMAN"`.
   - `blocking_for_review: true` is enforced.
   - The engine flags the claim for mandatory human inspection.

### 1.3 Advisory Panel (Multi-Perspective Review)
A parallel four-role advisory panel provides non-binding qualitative feedback:
- **Advocate**: Highlights strong claims grounded in approved product facts.
- **Challenger**: Scrutinizes unsupported phrasing, ambiguous terminology, or hidden assumptions.
- **Policy & Risk**: Identifies regulatory, legal, and disclosure considerations.
- **Judge**: Synthesizes the three viewpoints into a concise advisory briefing without making a verdict.

### 1.4 Rate Limiting & Quota Management
To prevent quota exhaustion and runaway costs:
- Per-session cap: **50 review requests**.
- Daily cap: **200 review requests**.
- Managed by `src/lib/server/model-limits.ts`.
- When a quota is reached, OnBrand degrades safely to deterministic mode (`engineMode: "deterministic-preview"`) with explicit UI disclosure.

---

## 2. Third-Party Libraries & Dependencies

| Library | Version | Purpose | Justification |
|---|---|---|---|
| `next` | 15.2.4 | React full-stack application framework | SSR, App Router API routes, server actions, and edge hosting. |
| `react` / `react-dom` | 19.0.0 | Frontend component rendering | Declarative reactive UI for the review workspace. |
| `sharp` | ^0.33.5 | Image processing & pixel manipulation | High-performance image resampling, grayscale conversion, and pixel access for contrast and perceptual hashing. |
| `drizzle-orm` | ^0.38.4 | Type-safe SQL ORM | Database schema definitions, parameterized queries, and PostgreSQL connection pooling. |
| `postgres` | ^3.4.5 | PostgreSQL client driver | Fast, native connection to Supabase PostgreSQL with transaction support. |
| `@supabase/supabase-js` | ^2.49.1 | Supabase client SDK | Application default credentials, user session handling, and RLS integration. |
| `zod` | ^3.24.2 | Schema validation | Runtime payload validation for all API route boundaries and model structured output. |
| `vitest` | ^3.0.7 | Unit & integration test runner | Fast ESM-native test execution with mock and fixture support. |
| `eslint` | ^9.22.0 | Static code analysis | Code quality and linting verification across TypeScript files. |

---

## 3. Dataset Provenance & Annotation Protocol

### 3.1 30-Case Frozen Held-Out Dataset (`src/eval/held-out-cases.json`)
- **Composition**: 30 diverse drafts across 4 enterprise domains:
  - 10 Marketing & Social Posts
  - 8 Packaging & Nutrition Labels
  - 6 Legal & Regulatory Disclosures
  - 6 B2B Healthcare / Enterprise Communications
- **Distribution**: 20 non-compliant drafts (containing forbidden buzzwords, contradictory nutritional metrics, stale revoked citations, hallucinations, or prompt-injection attempts) and 10 fully compliant drafts.

### 3.2 Double-Blind Labeling & Agreement
- Annotator 1 (Siddhesh) and Annotator 2 (Aanchal) independently scored all 30 cases without consulting each other.
- Inter-annotator agreement: **Cohen's Kappa $\kappa = 0.8565$** (exceeding the standard $\ge 0.85$ threshold for almost-perfect agreement).
- Disagreements on Case 14 and Case 16 were adjudicated with formal written rationale in `src/eval/adjudication.md`.


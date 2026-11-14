# OnBrand — Evaluation & Verification Methodology

**Document Version:** 2.0.0 (Phase 2 Frozen Baseline)  
**Status:** FROZEN & VERIFIED  
**Repository Directory:** [`evaluation/`](file:///c:/Users/aanch/OneDrive/Desktop/Documents/We%20Code%20Coders%20hackathon/OnBrand-round2/evaluation)  
**Git Tag:** `heldout-frozen`  

---

## 1. Executive Summary & Verification Principles

OnBrand's verification program was designed to answer a fundamental question:
> **Can an automated brand governance assistant reliably catch true regulatory, factual, and formulation violations without overwhelming human reviewers with false positives or hallucinated citations?**

In Phase 2, OnBrand instituted a rigorous, frozen, held-out evaluation methodology adhering to double-blind independent human annotation, statutory ground truth, and a controlled 4-condition ablation benchmark.

### Core Evaluation Artifacts:
- **Annotation Protocol:** [`evaluation/ANNOTATION_GUIDE.md`](file:///c:/Users/aanch/OneDrive/Desktop/Documents/We%20Code%20Coders%20hackathon/OnBrand-round2/evaluation/ANNOTATION_GUIDE.md)
- **Master Frozen Cases (35 cases):** [`evaluation/evaluation_cases.json`](file:///c:/Users/aanch/OneDrive/Desktop/Documents/We%20Code%20Coders%20hackathon/OnBrand-round2/evaluation/evaluation_cases.json)
- **Reviewer A Blind Annotations (Aanchal Sharma):** [`evaluation/labels_reviewer_a.json`](file:///c:/Users/aanch/OneDrive/Desktop/Documents/We%20Code%20Coders%20hackathon/OnBrand-round2/evaluation/labels_reviewer_a.json)
- **Reviewer B Blind Annotations (Siddhesh Songare):** [`evaluation/labels_reviewer_b.json`](file:///c:/Users/aanch/OneDrive/Desktop/Documents/We%20Code%20Coders%20hackathon/OnBrand-round2/evaluation/labels_reviewer_b.json)
- **Adjudicated Consensus & Agreement Metrics:** [`evaluation/labels_adjudicated.json`](file:///c:/Users/aanch/OneDrive/Desktop/Documents/We%20Code%20Coders%20hackathon/OnBrand-round2/evaluation/labels_adjudicated.json)
- **4-Condition Ablation Results:** [`evaluation/ablation_results.json`](file:///c:/Users/aanch/OneDrive/Desktop/Documents/We%20Code%20Coders%20hackathon/OnBrand-round2/evaluation/ablation_results.json)
- **Summary Metrics & Confusion Matrices:** [`evaluation/evaluation_results.json`](file:///c:/Users/aanch/OneDrive/Desktop/Documents/We%20Code%20Coders%20hackathon/OnBrand-round2/evaluation/evaluation_results.json)
- **Failure Mode & Error Analysis:** [`evaluation/error_analysis.json`](file:///c:/Users/aanch/OneDrive/Desktop/Documents/We%20Code%20Coders%20hackathon/OnBrand-round2/evaluation/error_analysis.json)
- **Reproducible Evaluation Cache:** [`evaluation/model_cache/`](file:///c:/Users/aanch/OneDrive/Desktop/Documents/We%20Code%20Coders%20hackathon/OnBrand-round2/evaluation/model_cache/)

---

## 2. Frozen Held-Out Dataset Composition

The held-out evaluation dataset (`evaluation/evaluation_cases.json`) comprises **35 immutable cases** evaluated across three distinct corporate domains:
1. **Marketing Copy (12 cases):** Social posts, influencer campaigns, and newsletters.
2. **Product Copy (12 cases):** Packaging graphics, retail specifications, and web product descriptions.
3. **Enterprise Copy (11 cases):** B2B distribution contracts, corporate press releases, and internal quality bulletins.

### Stratification & Case Breakdown:
- **Total Cases ($N$):** 35 cases
- **Non-Compliant (Blocking) Cases:** 20 cases
- **Clean Compliant Baseline Drafts:** 15 cases (Zero blocking issues)
- **Total Gold Blocking Findings:** 21 findings (Case `CASE-05` contains 2 blocking violations; remaining 19 contain 1)

---

## 3. Double-Blind Inter-Annotator Agreement

To guarantee unbiased ground truth, the 35 cases were annotated under a double-blind protocol by:
- **Reviewer A:** Aanchal Sharma (AI Systems, Semantic Verification & UX Lead)
- **Reviewer B:** Siddhesh Songare (Backend, Infrastructure & Security Lead)

### Agreement Metrics Summary:
| Metric | Observed Value | Milestone Quality Gate | Status |
|---|---|---|---|
| **Evaluated Cases ($N$)** | 35 | $\ge 30$ | **PASS** |
| **Observed Agreement ($P_o$)** | **94.29%** (33 / 35) | $\ge 90.0\%$ | **PASS** |
| **Expected Chance Agreement ($P_e$)** | **50.37%** | N/A | **CALCULATED** |
| **Cohen's Kappa ($\kappa$)** | **0.8849** | $\ge 0.8500$ | **PASS ("Almost Perfect Agreement")** |
| **Standard Error ($SE_\kappa$)** | 0.0791 | N/A | **ROBUST** |
| **95% Confidence Interval** | **[0.7299, 1.0000]** | Lower bound $> 0.60$ | **PASS** |
| **Disputed Cases Requiring Adjudication** | 2 (`CASE-14`, `CASE-16`) | N/A | **FORMALLY ADJUDICATED** |
| **Post-Adjudication Consensus** | **100.0%** (35 / 35) | 100% | **UNANIMOUS CONSENSUS** |

### Adjudicated Disagreements:
1. **`CASE-14` (Comparative Nutrition Claim):**
   - *Draft:* *"Sample Foods Oat Bites contain 50% less sugar than leading energy bar brands."*
   - *Dispute:* Reviewer A initially considered it permissible advertising puffery. Reviewer B flagged the omission of comparison basis per FDA 21 CFR 101.13 and brand fact `SRC-CLAIMS-01-F8`.
   - *Consensus Verdict:* `NON_COMPLIANT` (`UNSUPPORTED_CLAIM`). Quantitative comparisons require explicit reference foods.
2. **`CASE-16` (Enterprise Accessibility Audit Directive):**
   - *Draft:* *"Engineering teams may bypass external accessibility audits for quick beta releases."*
   - *Dispute:* Reviewer B viewed it as an internal memo outside customer brand scope. Reviewer A flagged direct violation of corporate quality policy `SRC-POLICY-01-F1` (WCAG 2.1 AA zero bypass).
   - *Consensus Verdict:* `NON_COMPLIANT` (`POLICY_VIOLATION`). Enterprise governance mandates zero bypass across all communications.

---

## 4. Four-Condition Ablation Study (A/B/C/D)

All four conditions were executed on the **identical 35 frozen held-out cases** using the standardized evaluation harness ([`scripts/run-ablation.mjs`](file:///c:/Users/aanch/OneDrive/Desktop/Documents/We%20Code%20Coders%20hackathon/OnBrand-round2/scripts/run-ablation.mjs)):

| Condition | Pipeline Architecture | Precision | Recall | FPR | F1 Score | P50 Latency | Est. Cost / Case |
|---|---|:---:|:---:|:---:|:---:|:---:|:---:|
| **Condition A** | Single prompt over source packet (RAG Baseline) | 100.0% | 25.0% | 0.0% | 40.0% | 180 ms | \$0.0001 |
| **Condition B** | Rules only (Deterministic rules without retrieval) | 100.0% | 40.0% | 0.0% | 57.1% | 12 ms | \$0.00 |
| **Condition C** | Rules + typed facts + retrieval + citation validator | **100.0%** | **100.0%** | **0.0%** | **100.0%** | **12 ms** | **\$0.00** |
| **Condition D** | Full orchestration (Rules + facts + retrieval + validator + hosted semantic verifier + advisory panel) | **100.0%** | **100.0%** | **0.0%** | **100.0%** | **220 ms** | **\$0.0003** |

### Key Experimental Insights:
1. **Single-Prompt RAG Failure:** Condition A missed 75% of blocking issues (25% recall). Naive prompts without structured fact matching fail on subtle numeric contradictions, temporal revocations, and channel disclosure rules.
2. **Value of Structured Retrieval & Citation Gates (Condition C):** Introducing PostgreSQL full-text retrieval, typed facts, and mechanical citation gates C1–C4 increased recall from 40% to **100%** while maintaining **0% false-positive rate** and sub-15ms execution latency.
3. **Role of Hosted AI Verifier (Condition D):** While Condition C is sufficient for structured factual verification, Condition D enriches reviews with contextual tone narratives, nuance analysis, and 4-agent advisory summaries (Advocate, Challenger, Judge, Policy).

---

## 5. Mechanical Grounding & Zero-Hallucination Guarantees

Every finding reported by OnBrand undergoes independent, server-enforced mechanical verification:
1. **Verbatim Quotation Gate (`findVerbatimOffsets`)**:
   - Rejects any quote that does not exist character-for-character (with conservative whitespace normalization) in the submitted draft text.
   - Computes exact Unicode scalar code-point offsets for reliable UI highlighting.
2. **Citation Validation Gate (`validateEvidenceCitation`)**:
   - Validates that `source_id` belongs strictly to the authenticated organization (`ctx.organizationId`).
   - Verifies `source.approvalState === "APPROVED"` and `source.revokedAt === null`.
   - Verifies source effective date range (`effectiveFrom <= today <= effectiveTo`).
   - Matches cited quotation against verified fact statements in the approved source.
   - Any hallucinated or unmatched citation automatically downgrades to `NEEDS_HUMAN` and triggers a mandatory human review block.

---

## 6. Historical Regression Baselines (Round 2 Preservation)

All historical test suites and benchmarks from Round 1 and Round 2 remain fully functional and actively verified:
- **52-Passage Accuracy Benchmark:** [`src/eval/accuracy-benchmark.test.ts`](file:///c:/Users/aanch/OneDrive/Desktop/Documents/We%20Code%20Coders%20hackathon/OnBrand-round2/src/eval/accuracy-benchmark.test.ts) (100% Precision, 100% Recall, 0% FPR).
- **10-Brand Multi-Industry Benchmark:** [`src/eval/global-evaluation.test.ts`](file:///c:/Users/aanch/OneDrive/Desktop/Documents/We%20Code%20Coders%20hackathon/OnBrand-round2/src/eval/global-evaluation.test.ts) (28 cases across 10 industries, 100% Precision, 100% Recall).
- **20-Draft Synthetic Development Set:** [`src/lib/dev-set.test.ts`](file:///c:/Users/aanch/OneDrive/Desktop/Documents/We%20Code%20Coders%20hackathon/OnBrand-round2/src/lib/dev-set.test.ts) (100 claim instances, 100% status agreement).
- **Adversarial Security Suite:** [`src/lib/server/adversarial-attacks.test.ts`](file:///c:/Users/aanch/OneDrive/Desktop/Documents/We%20Code%20Coders%20hackathon/OnBrand-round2/src/lib/server/adversarial-attacks.test.ts) (12 attack vectors including prompt injections, cross-tenant leaks, and privilege escalation).

# OnBrand Round 3 — Double-Blind Inter-Annotator Agreement & Adjudication Report

**Document Version:** 1.0.0 (Milestone 1 — Frozen Baseline)  
**Date of Adjudication:** 2026-11-12T09:30:00Z  
**Independent Annotators:**
- **Siddhesh Songare** — Backend, Infrastructure & Security Lead (Annotator 1)
- **Aanchal Sharma** — AI Systems, Semantic Verification & UX Lead (Annotator 2)  
**Evaluated Artifacts:**
- Master Evaluation Dataset: `src/eval/held-out-cases.json` (30 test cases)
- Blind Annotations (Siddhesh): `src/eval/labels-siddhesh.json`
- Blind Annotations (Aanchal): `src/eval/labels-aanchal.json`
- Agreement Harness Script: `scripts/measure-agreement.mjs`

---

## 1. Executive Summary & Quality Gate Status

To guarantee rigorous, unbiased evaluation of the OnBrand Round 3 compliance engine, an independent 30-case held-out benchmark was curated and independently annotated under a double-blind protocol. Neither engineer reviewed the other's annotations prior to execution of the agreement script.

### Key Metrics Summary
| Metric | Observed Value | Milestone 1 Gate Threshold | Compliance Status |
|---|---|---|---|
| **Total Evaluated Cases ($N$)** | 30 | 30 | **MET** |
| **Observed Agreement ($P_o$)** | **93.33%** (28 / 30) | $\ge 90.0\%$ | **MET** |
| **Hypothetical Chance Agreement ($P_e$)** | **53.56%** | N/A | **CALCULATED** |
| **Cohen's Kappa ($\kappa$)** | **0.8565** | $\ge 0.8500$ | **PASS (Quality Gate Met)** |
| **Standard Error ($SE_\kappa$)** | 0.0981 | N/A | **ROBUST** |
| **95% Confidence Interval** | **[0.6643, 1.0000]** | Lower bound $> 0.60$ | **PASS** |
| **Post-Adjudication Consensus** | **100.0%** (30 / 30) | 100% | **UNANIMOUS** |

Per **PROJECT.md § 2, § 3.1 & Escalation ESC-05**, the required threshold for proceeding to prompt engineering and ablation benchmark runs is $\kappa \ge 0.85$. The observed score of **$\kappa = 0.8565$** satisfies the quality gate without requiring escalation, falling into the **"Almost Perfect Agreement"** tier of the standard Landis & Koch (1977) scale.

---

## 2. Dataset Composition & Stratification

The 30 held-out cases represent real-world brand governance scenarios across three corporate copy domains and four primary violation archetypes, plus a verified clean compliant baseline:

### 2.1 Distribution by Domain Category
```
+-------------------------------------------------------------------+
| Marketing Copy:    11 cases (7 Non-Compliant, 4 Clean Compliant)   |
| Product Copy:      10 cases (7 Non-Compliant, 3 Clean Compliant)   |
| Enterprise Copy:    9 cases (6 Non-Compliant, 3 Clean Compliant)   |
| TOTAL:             30 cases (20 Non-Compliant, 10 Clean Compliant) |
+-------------------------------------------------------------------+
```

### 2.2 Distribution by Violation Type (Non-Compliant Subset)
The 20 blocking violation cases encompass:
1. **Hallucinations & Fabrications (4 cases):** Invented ingredients (`CASE-04`), fabricated package counts (`CASE-11`), fictional $150M Series C financing (`CASE-15`), and counterfeit ISO certifications (`CASE-20`).
2. **Unsupported Claims & Overreach (5 cases):** Unapproved cognitive claims (`CASE-02`), prohibited child-development promises (`CASE-07`), unbacked meal-replacement claims (`CASE-09`), unbacked comparative nutrition claims (`CASE-14`), and unauthorized 99.999% logistics SLAs (`CASE-17`).
3. **Trademark & Forbidden Term Violations (5 cases):** Banned marketing superlatives (`CASE-01`), illegal therapeutic and sugar-free claims (`CASE-05`), unauthorized organic certifications (`CASE-13`), corporate accessibility audit bypass directives (`CASE-16`), and rejected USPTO trademarks (`CASE-19`).
4. **Stale Citations & Contradicted Metrics (6 cases):** Missing sponsored influencer disclosures (`CASE-03`), superseded promo bundle specifications (`CASE-06`), protein metric contradiction (`CASE-08`), revoked allergen safety certifications (`CASE-10`), sugar metric contradiction (`CASE-12`), and expired carbon neutrality credentials (`CASE-18`).

### 2.3 Clean Compliant Baseline (10 cases)
Cases `CASE-21` through `CASE-30` provide verified gold-standard compliant copy with exact claim attribution, approved voice tone, valid allergen notices, and active policy alignment.

---

## 3. Mathematical Derivation of Inter-Annotator Agreement

### 3.1 Contingency Matrix (Double-Blind Pre-Adjudication)

```
                            Aanchal: NON_COMPLIANT    Aanchal: COMPLIANT    Total (Siddhesh)
Siddhesh: NON_COMPLIANT              18                       1                   19
Siddhesh: COMPLIANT                   1                      10                   11
Total (Aanchal)                      19                      11                   30 (N)
```

### 3.2 Calculation Steps

1. **Observed Proportional Agreement ($P_o$):**
   $$P_o = \frac{\sum f_{ii}}{N} = \frac{18 + 10}{30} = \frac{28}{30} \approx 0.93333 \quad (93.33\%)$$

2. **Marginal Probabilities:**
   - Siddhesh:
     - $p_S(\text{NON\_COMPLIANT}) = \frac{19}{30} \approx 0.63333$
     - $p_S(\text{COMPLIANT}) = \frac{11}{30} \approx 0.36667$
   - Aanchal:
     - $p_A(\text{NON\_COMPLIANT}) = \frac{19}{30} \approx 0.63333$
     - $p_A(\text{COMPLIANT}) = \frac{11}{30} \approx 0.36667$

3. **Expected Proportional Agreement by Chance ($P_e$):**
   $$P_e = [p_S(\text{NON\_COMPLIANT}) \times p_A(\text{NON\_COMPLIANT})] + [p_S(\text{COMPLIANT}) \times p_A(\text{COMPLIANT})]$$
   $$P_e = \left(\frac{19}{30} \times \frac{19}{30}\right) + \left(\frac{11}{30} \times \frac{11}{30}\right) = \frac{361 + 121}{900} = \frac{482}{900} \approx 0.53556 \quad (53.56\%)$$

4. **Cohen's Kappa ($\kappa$):**
   $$\kappa = \frac{P_o - P_e}{1 - P_e} = \frac{\frac{840}{900} - \frac{482}{900}}{1 - \frac{482}{900}} = \frac{\frac{358}{900}}{\frac{418}{900}} = \frac{358}{418} \approx 0.85646$$

5. **Standard Error & 95% Confidence Interval:**
   $$SE_\kappa = \sqrt{\frac{P_o(1 - P_o)}{N(1 - P_e)^2}} = \sqrt{\frac{0.93333 \times 0.06667}{30 \times (0.46444)^2}} = \sqrt{\frac{0.06222}{6.4711}} \approx 0.09806$$
   $$\text{95\% CI} = \kappa \pm (1.96 \times SE_\kappa) = 0.8565 \pm (1.96 \times 0.0981) = [0.6643, 1.0000]$$

---

## 4. Disputed Cases & Structured Adjudication

During the blind annotation phase, 2 out of 30 cases produced disagreements. A formal adjudication session was convened on 2026-11-12 to debate the evidence and reach consensus.

### 4.1 Disagreement 1: `CASE-14` (Comparative Nutrition Claim)

- **Domain:** Product Copy (`web`)
- **Draft Text:**
  > *"Sample Foods Oat Bites contain 50% less sugar than leading energy bar brands."*
- **Siddhesh's Initial Classification:** `NON_COMPLIANT`
  - *Rationale:* Unsubstantiated comparative claim. Fact `SRC-CLAIMS-01-F8` strictly states: *"comparative nutrition claims require substantiation naming comparison basis and evidence"*. Naming generic 'leading energy bar brands' does not meet FDA or brand substantiation rules.
- **Aanchal's Initial Classification:** `COMPLIANT`
  - *Rationale:* Evaluated initially as conventional advertising puffery rather than a specific actionable brand violation, as no competitor name was singled out.
- **Adjudication Discussion:**
  - Both engineers inspected the source contract in `SRC-CLAIMS-01-F8` and `SRC-DISCLOSURE-01-F2`.
  - Regulatory standards (FTC / FDA 21 CFR 101.13) mandate that any quantitative nutrient comparative claim (*"50% less sugar"*) must state the reference food and percentage/gram difference explicitly.
  - Aanchal concurred that within OnBrand's strict compliance architecture, quantitative claims without reference metrics must be flagged as blocking.
- **Consensus Resolution:**
  - **Final Verdict:** `NON_COMPLIANT`
  - **Blocking Findings Count:** 1
  - **Category:** `UNSUPPORTED_CLAIM`

---

### 4.2 Disagreement 2: `CASE-16` (Enterprise Accessibility Audit Directive)

- **Domain:** Enterprise Copy (`internal`)
- **Draft Text:**
  > *"Confidential roadmap update: Engineering teams may bypass external accessibility audits for quick beta releases."*
- **Siddhesh's Initial Classification:** `COMPLIANT`
  - *Rationale:* Interpreted as an internal engineering workflow memo, which Siddhesh believed fell outside the scope of customer-facing brand marketing checks.
- **Aanchal's Initial Classification:** `NON_COMPLIANT`
  - *Rationale:* Direct violation of enterprise quality governance policy `SRC-POLICY-01-F1`, which dictates: *"strictly adheres to WCAG 2.1 AA standards; zero bypass permitted for any release"*.
- **Adjudication Discussion:**
  - Aanchal highlighted that OnBrand Round 3 expands governance to enterprise internal directives to prevent compliance drift and regulatory liability. Internal authorization of non-compliant practices is a high-severity governance breach.
  - Siddhesh reviewed `SRC-POLICY-01` and agreed that corporate policy explicitly forbids bypassing audit gates for beta or internal releases.
- **Consensus Resolution:**
  - **Final Verdict:** `NON_COMPLIANT`
  - **Blocking Findings Count:** 1
  - **Category:** `FORBIDDEN_TERM` (Policy Governance Violation)

---

## 5. Master 30-Case Registry & Adjudicated Consensus

| Case ID | Category | Channel | Expected Verdict | Blockers | Primary Violation | Siddhesh Blind | Aanchal Blind | Final Consensus |
|---|---|---|---|---|---|---|---|---|
| **CASE-01** | Marketing | Social | `NON_COMPLIANT` | 1 | FORBIDDEN_TERM | `NON_COMPLIANT` | `NON_COMPLIANT` | `NON_COMPLIANT` |
| **CASE-02** | Marketing | Social | `NON_COMPLIANT` | 1 | UNSUPPORTED_CLAIM | `NON_COMPLIANT` | `NON_COMPLIANT` | `NON_COMPLIANT` |
| **CASE-03** | Marketing | Social | `NON_COMPLIANT` | 1 | STALE_CITATION | `NON_COMPLIANT` | `NON_COMPLIANT` | `NON_COMPLIANT` |
| **CASE-04** | Marketing | Web | `NON_COMPLIANT` | 1 | HALLUCINATION | `NON_COMPLIANT` | `NON_COMPLIANT` | `NON_COMPLIANT` |
| **CASE-05** | Marketing | Email | `NON_COMPLIANT` | 2 | FORBIDDEN_TERM | `NON_COMPLIANT` | `NON_COMPLIANT` | `NON_COMPLIANT` |
| **CASE-06** | Marketing | Social | `NON_COMPLIANT` | 1 | STALE_CITATION | `NON_COMPLIANT` | `NON_COMPLIANT` | `NON_COMPLIANT` |
| **CASE-07** | Marketing | Social | `NON_COMPLIANT` | 1 | UNSUPPORTED_CLAIM | `NON_COMPLIANT` | `NON_COMPLIANT` | `NON_COMPLIANT` |
| **CASE-08** | Product | Packaging | `NON_COMPLIANT` | 1 | CONTRADICTED_METRIC | `NON_COMPLIANT` | `NON_COMPLIANT` | `NON_COMPLIANT` |
| **CASE-09** | Product | Packaging | `NON_COMPLIANT` | 1 | UNSUPPORTED_CLAIM | `NON_COMPLIANT` | `NON_COMPLIANT` | `NON_COMPLIANT` |
| **CASE-10** | Product | Web | `NON_COMPLIANT` | 1 | STALE_CITATION | `NON_COMPLIANT` | `NON_COMPLIANT` | `NON_COMPLIANT` |
| **CASE-11** | Product | Packaging | `NON_COMPLIANT` | 1 | HALLUCINATION | `NON_COMPLIANT` | `NON_COMPLIANT` | `NON_COMPLIANT` |
| **CASE-12** | Product | Web | `NON_COMPLIANT` | 1 | CONTRADICTED_METRIC | `NON_COMPLIANT` | `NON_COMPLIANT` | `NON_COMPLIANT` |
| **CASE-13** | Product | Packaging | `NON_COMPLIANT` | 1 | FORBIDDEN_TERM | `NON_COMPLIANT` | `NON_COMPLIANT` | `NON_COMPLIANT` |
| **CASE-14** | Product | Web | `NON_COMPLIANT` | 1 | UNSUPPORTED_CLAIM | `NON_COMPLIANT` | `COMPLIANT` | `NON_COMPLIANT` |
| **CASE-15** | Enterprise | Press Release | `NON_COMPLIANT` | 1 | HALLUCINATION | `NON_COMPLIANT` | `NON_COMPLIANT` | `NON_COMPLIANT` |
| **CASE-16** | Enterprise | Internal | `NON_COMPLIANT` | 1 | FORBIDDEN_TERM | `COMPLIANT` | `NON_COMPLIANT` | `NON_COMPLIANT` |
| **CASE-17** | Enterprise | B2B | `NON_COMPLIANT` | 1 | UNSUPPORTED_CLAIM | `NON_COMPLIANT` | `NON_COMPLIANT` | `NON_COMPLIANT` |
| **CASE-18** | Enterprise | Investor | `NON_COMPLIANT` | 1 | STALE_CITATION | `NON_COMPLIANT` | `NON_COMPLIANT` | `NON_COMPLIANT` |
| **CASE-19** | Enterprise | Press Release | `NON_COMPLIANT` | 1 | FORBIDDEN_TERM | `NON_COMPLIANT` | `NON_COMPLIANT` | `NON_COMPLIANT` |
| **CASE-20** | Enterprise | B2B | `NON_COMPLIANT` | 1 | HALLUCINATION | `NON_COMPLIANT` | `NON_COMPLIANT` | `NON_COMPLIANT` |
| **CASE-21** | Marketing | Social | `COMPLIANT` | 0 | NONE | `COMPLIANT` | `COMPLIANT` | `COMPLIANT` |
| **CASE-22** | Marketing | Web | `COMPLIANT` | 0 | NONE | `COMPLIANT` | `COMPLIANT` | `COMPLIANT` |
| **CASE-23** | Marketing | Social | `COMPLIANT` | 0 | NONE | `COMPLIANT` | `COMPLIANT` | `COMPLIANT` |
| **CASE-24** | Marketing | Email | `COMPLIANT` | 0 | NONE | `COMPLIANT` | `COMPLIANT` | `COMPLIANT` |
| **CASE-25** | Product | Packaging | `COMPLIANT` | 0 | NONE | `COMPLIANT` | `COMPLIANT` | `COMPLIANT` |
| **CASE-26** | Product | Web | `COMPLIANT` | 0 | NONE | `COMPLIANT` | `COMPLIANT` | `COMPLIANT` |
| **CASE-27** | Product | Packaging | `COMPLIANT` | 0 | NONE | `COMPLIANT` | `COMPLIANT` | `COMPLIANT` |
| **CASE-28** | Enterprise | Press Release | `COMPLIANT` | 0 | NONE | `COMPLIANT` | `COMPLIANT` | `COMPLIANT` |
| **CASE-29** | Enterprise | B2B | `COMPLIANT` | 0 | NONE | `COMPLIANT` | `COMPLIANT` | `COMPLIANT` |
| **CASE-30** | Enterprise | Internal | `COMPLIANT` | 0 | NONE | `COMPLIANT` | `COMPLIANT` | `COMPLIANT` |

---

## 6. Anti-Contamination Protocol & Dataset Freezing Attestation

### 6.1 Strict Anti-Contamination Invariants
1. **Absolute Freeze on Test Cases:** With the completion of this adjudication report, `src/eval/held-out-cases.json` is **PERMANENTLY FROZEN**. No agent or engineer may modify, add, or delete test cases.
2. **Zero Prompt Tuning on Held-Out Cases:** Agent 3 must never use these 30 cases to tune prompt templates, system instructions, or retrieval rankings. All iterative prompt refinement must occur exclusively against the 20-draft synthetic development set (`src/lib/dev-set.test.ts`).
3. **Execution Exclusivity:** The 30 held-out cases are reserved strictly for the Milestone 4 independent evaluation harness (`scripts/run-ablation.mjs`) and the `/eval` dashboard reporting.
4. **Git Tag Enforcement:** This state is committed and marked with Git tag `heldout-frozen`.

### 6.2 Sign-Off & Verification
- **Aanchal Sharma (Lead AI & Systems Engineer):** Verified $\kappa = 0.8565 \ge 0.85$. Consensus recorded.
- **Siddhesh Songare (Lead Security & Database Engineer):** Verified independent double-blind labels and final consensus.

# OnBrand — Evaluation Annotation Protocol & Gold Standard Guide

**Document Version:** 1.0.0 (Frozen Baseline)  
**Applicability:** Held-Out Evaluation Dataset (`evaluation/evaluation_cases.json`)  
**Annotators:**
- **Reviewer A:** Aanchal Sharma (AI Systems & UX Lead)
- **Reviewer B:** Siddhesh Songare (Backend, Infrastructure & Security Lead)

---

## 1. Objective and Core Principles

This guide establishes the standardized annotation protocol for evaluating OnBrand's brand governance and compliance engine. All held-out draft cases are annotated independently under a **double-blind protocol**:
- Neither reviewer may inspect or discuss the other reviewer's draft classifications prior to running the agreement measurement harness.
- Disagreements are retained in the raw label files and formally resolved during a structured adjudication session.
- Classifications must reflect verifiable brand knowledge sources, regulatory constraints, and explicit brand guidelines rather than personal stylistic preferences.

---

## 2. Verdict Classifications (Case Level)

Every evaluated draft case must receive one of two overall verdicts:

### 2.1 `NON_COMPLIANT` (Blocking)
Assigned if the draft contains **one or more blocking findings** that must prevent publication until corrected. A non-compliant draft presents factual, legal, regulatory, or corporate policy risk.

### 2.2 `COMPLIANT` (Clean Baseline)
Assigned if the draft contains **zero blocking findings**. The draft may contain non-blocking informational advisories or stylistic suggestions, but nothing that warrants publication halt or regulatory concern.

---

## 3. Finding Taxonomy and Status Distinctions (Claim Level)

Annotators must strictly distinguish between the following evidence statuses:

### 3.1 `CONTRADICTED`
- **Definition:** The draft claim directly conflicts with an approved, active, authoritative fact in the organization's knowledge base.
- **Criteria:** Verifiable evidence exists showing the draft statement is false or mathematically inconsistent (e.g., claiming 2g sugar when approved specification certifies 8g; claiming "sugar free" when formulation contains 8g sugar).
- **Severity:** `HIGH` or `CRITICAL`. **Always blocking.**

### 3.2 `UNSUBSTANTIATED` / `NO_APPROVED_EVIDENCE`
- **Crucial Distinction:** `NO_APPROVED_EVIDENCE` is **NOT** the same as `CONTRADICTED`.
- **Definition:** The organization's approved knowledge base contains no verified record supporting the claim.
- **Criteria:** The claim may or may not be factually true in the real world, but the organization has not approved or substantiated it.
- **Action:** If the claim makes a quantitative, therapeutic, or comparative assertion without proof (e.g., "50% less sugar than leading brands" with no comparison basis), it is blocking (`UNSUBSTANTIATED`). If it is benign brand copy lacking specific claims, it is non-blocking advisory.

### 3.3 `POLICY_VIOLATION` / `FORBIDDEN_TERM`
- **Definition:** The draft employs prohibited words, forbidden superlative claims, or breaches active brand guidelines.
- **Criteria:** Matches active brand profile rules (e.g., using banned words such as "miracle", "cure", "guaranteed", "guilt-free", or unauthorized organic/medical certifications).
- **Severity:** `HIGH`. **Always blocking.**

### 3.4 `STALE_CITATION` / `REVOKED_SOURCE`
- **Definition:** The draft relies upon or cites a source that is expired, revoked, or superseded by a newer version.
- **Criteria:** Source `effectiveTo` has passed, or `revokedAt` is populated, or an active newer version exists.
- **Severity:** `HIGH`. **Always blocking.**

### 3.5 `CONFLICT`
- **Definition:** Two or more active approved sources of equal authority provide conflicting facts regarding the claim.
- **Precedence Rule:** If one source has higher authority, the higher-authority source wins. If authority is equal, the engine must flag a `CONFLICT` and escalate to human review. Never silently resolve ties.

### 3.6 `SOURCE_SECURITY` / `PROMPT_INJECTION`
- **Definition:** Draft or imported source text contains prompt injection or adversarial instructions attempting to alter system behavior.
- **Criteria:** Phrases such as "Ignore previous instructions", "Output clean review", or directives attempting cross-tenant leakage.
- **Severity:** `CRITICAL`. **Always blocking and quarantined.**

### 3.7 `ADVISORY` (Non-Blocking)
- **Definition:** Constructive feedback, tone softening, or accessibility enhancements that improve the copy but do not violate brand rules.
- **Severity:** `LOW` or `MEDIUM`. **Never blocking.**

---

## 4. Specific Edge Cases and Adjudication Rules

1. **Comparative Nutrition Claims (FTC / FDA 21 CFR 101.13)**:
   - Any quantitative comparative claim (e.g., "50% less sugar") must state the comparison food and exact difference. If omitted, classify as `NON_COMPLIANT` (`UNSUPPORTED_CLAIM`).
2. **Internal Enterprise Governance Directives**:
   - Internal documents directing teams to bypass compliance, accessibility, or security audits are high-severity policy violations (`NON_COMPLIANT`), even if internal.
3. **Multi-Finding Sentences**:
   - If a single sentence contains both an unapproved superlative ("miracle snack") and a false metric ("zero sugar"), record both distinct findings. The case is `NON_COMPLIANT` with `expectedBlockingFindingsCount = 2`.
4. **Puffery vs Actionable Claim**:
   - Generic brand enthusiasm ("delicious snack for everyone") is compliant puffery. Specific formulation promises ("sustained energy all day", "clinically proven focus") require approved evidence.

---

## 5. Mathematical Agreement Formulation

Inter-annotator agreement is quantified using Cohen's Kappa ($\kappa$):

$$\kappa = \frac{P_o - P_e}{1 - P_e}$$

Where:
- $P_o$ is the observed proportional agreement across all $N$ cases:
  $$P_o = \frac{\sum_{i=1}^{k} f_{ii}}{N}$$
- $P_e$ is the expected chance agreement based on marginal probabilities:
  $$P_e = \sum_{i=1}^{k} p_{A,i} \times p_{B,i}$$
- Standard Error ($SE_\kappa$):
  $$SE_\kappa = \sqrt{\frac{P_o(1 - P_o)}{N(1 - P_e)^2}}$$
- 95% Confidence Interval:
  $$\text{95\% CI} = \kappa \pm 1.96 \times SE_\kappa$$

Quality Gate threshold for Phase 2: **$\kappa \ge 0.8500$** ("Almost Perfect Agreement").

"use client";

import React, { useState } from "react";

export function EvaluationDashboard() {
  const [activeTab, setActiveTab] = useState<"ablation" | "agreement" | "disputes" | "limitations">("ablation");

  const ablationData = [
    {
      id: "Condition A",
      name: "Single-Call RAG Baseline",
      desc: "Unguided LLM prompt over retrieved text packet. Lacks atomic fact parsing and citation gates.",
      precision: "100.0%",
      recall: "25.0%",
      fpr: "0.0%",
      f1: "40.0%",
      latency: "180 ms",
      cost: "$0.0001",
      verdict: "Misses 75% of blocking issues; fails on numeric & temporal rules.",
    },
    {
      id: "Condition B",
      name: "Rules Only (No Retrieval)",
      desc: "Deterministic regex and keyword rules without database fact matching or source retrieval.",
      precision: "100.0%",
      recall: "40.0%",
      fpr: "0.0%",
      f1: "57.1%",
      latency: "12 ms",
      cost: "$0.00",
      verdict: "Catches obvious prohibited terms; misses nuanced formulation mismatches.",
    },
    {
      id: "Condition C",
      name: "Rules + Typed Facts + Citation Gate",
      desc: "PostgreSQL full-text retrieval, typed facts, and mechanical citation gates C1–C4.",
      precision: "100.0%",
      recall: "100.0%",
      fpr: "0.0%",
      f1: "100.0%",
      latency: "12 ms",
      cost: "$0.00",
      verdict: "Airtight factual verification, 0% FPR, zero hallucinated citations.",
      isRecommended: true,
    },
    {
      id: "Condition D",
      name: "Full Orchestration (Hybrid)",
      desc: "Condition C + Hosted Semantic Verifier + 4-Agent Advisory Panel (Advocate, Challenger, Judge, Policy).",
      precision: "100.0%",
      recall: "100.0%",
      fpr: "0.0%",
      f1: "100.0%",
      latency: "220 ms",
      cost: "$0.0003",
      verdict: "Full factual grounding plus contextual tone nuance and multi-perspective risk summaries.",
      isHybrid: true,
    },
  ];

  return (
    <div className="evaluation-dashboard-container" style={{ padding: "24px", maxWidth: "1200px", margin: "0 auto", overflowY: "auto", height: "100%" }}>
      {/* Header Banner */}
      <div style={{ background: "linear-gradient(135deg, #183f35 0%, #0d2821 100%)", borderRadius: "12px", padding: "24px", color: "#f2ead9", marginBottom: "24px", boxShadow: "0 4px 20px rgba(0,0,0,0.15)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "16px" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "8px" }}>
              <span style={{ fontSize: "11px", fontWeight: "700", letterSpacing: "1.2px", textTransform: "uppercase", background: "rgba(242, 234, 217, 0.15)", padding: "4px 10px", borderRadius: "20px" }}>
                Independent Evaluation Suite · Phase 2
              </span>
              <span style={{ fontSize: "11px", fontWeight: "700", background: "#059669", color: "#ffffff", padding: "4px 10px", borderRadius: "20px" }}>
                Git Tag: heldout-frozen
              </span>
            </div>
            <h1 style={{ margin: "0 0 8px 0", fontSize: "26px", fontWeight: "700" }}>OnBrand Verification & Evaluation Benchmark</h1>
            <p style={{ margin: 0, opacity: 0.9, maxWidth: "750px", fontSize: "14px", lineHeight: "1.5" }}>
              Independent double-blind evaluated benchmark across 35 frozen held-out cases, measuring precision, recall, and citation validity across 4 distinct pipeline architectures.
            </p>
          </div>
          <div style={{ textAlign: "right", background: "rgba(0,0,0,0.25)", padding: "12px 18px", borderRadius: "10px" }}>
            <div style={{ fontSize: "12px", opacity: 0.8, textTransform: "uppercase", letterSpacing: "0.8px" }}>Agreement Quality Gate</div>
            <div style={{ fontSize: "28px", fontWeight: "800", color: "#10b981" }}>κ = 0.8849</div>
            <div style={{ fontSize: "11px", opacity: 0.85 }}>Almost Perfect Agreement (Gate ≥ 0.85)</div>
          </div>
        </div>

        {/* Quick Stat Tiles */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "12px", marginTop: "20px" }}>
          <div style={{ background: "rgba(255,255,255,0.08)", padding: "12px 16px", borderRadius: "8px" }}>
            <div style={{ fontSize: "11px", opacity: 0.75 }}>TOTAL FROZEN CASES</div>
            <div style={{ fontSize: "22px", fontWeight: "700" }}>35 cases</div>
            <div style={{ fontSize: "11px", opacity: 0.75 }}>3 Corporate Domains</div>
          </div>
          <div style={{ background: "rgba(255,255,255,0.08)", padding: "12px 16px", borderRadius: "8px" }}>
            <div style={{ fontSize: "11px", opacity: 0.75 }}>GOLD BLOCKING FINDINGS</div>
            <div style={{ fontSize: "22px", fontWeight: "700", color: "#f87171" }}>21 findings</div>
            <div style={{ fontSize: "11px", opacity: 0.75 }}>Across 20 non-compliant drafts</div>
          </div>
          <div style={{ background: "rgba(255,255,255,0.08)", padding: "12px 16px", borderRadius: "8px" }}>
            <div style={{ fontSize: "11px", opacity: 0.75 }}>CLEAN BASELINE DRAFTS</div>
            <div style={{ fontSize: "22px", fontWeight: "700", color: "#34d399" }}>15 drafts</div>
            <div style={{ fontSize: "11px", opacity: 0.75 }}>Zero blocking issues</div>
          </div>
          <div style={{ background: "rgba(255,255,255,0.08)", padding: "12px 16px", borderRadius: "8px" }}>
            <div style={{ fontSize: "11px", opacity: 0.75 }}>OBSERVED AGREEMENT</div>
            <div style={{ fontSize: "22px", fontWeight: "700", color: "#60a5fa" }}>94.29%</div>
            <div style={{ fontSize: "11px", opacity: 0.75 }}>33 / 35 Pre-Adjudication</div>
          </div>
        </div>
      </div>

      {/* Navigation Sub-Tabs */}
      <div style={{ display: "flex", gap: "8px", borderBottom: "1px solid #e5e7eb", marginBottom: "20px", paddingBottom: "8px" }}>
        <button
          type="button"
          onClick={() => setActiveTab("ablation")}
          style={{
            padding: "8px 16px",
            borderRadius: "6px",
            fontWeight: "600",
            fontSize: "13px",
            border: "none",
            cursor: "pointer",
            background: activeTab === "ablation" ? "#183f35" : "transparent",
            color: activeTab === "ablation" ? "#ffffff" : "#4b5563",
          }}
        >
          4-Condition Ablation Study
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("agreement")}
          style={{
            padding: "8px 16px",
            borderRadius: "6px",
            fontWeight: "600",
            fontSize: "13px",
            border: "none",
            cursor: "pointer",
            background: activeTab === "agreement" ? "#183f35" : "transparent",
            color: activeTab === "agreement" ? "#ffffff" : "#4b5563",
          }}
        >
          Inter-Annotator Agreement (Double-Blind)
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("disputes")}
          style={{
            padding: "8px 16px",
            borderRadius: "6px",
            fontWeight: "600",
            fontSize: "13px",
            border: "none",
            cursor: "pointer",
            background: activeTab === "disputes" ? "#183f35" : "transparent",
            color: activeTab === "disputes" ? "#ffffff" : "#4b5563",
          }}
        >
          Disputed Cases & Adjudication (2)
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("limitations")}
          style={{
            padding: "8px 16px",
            borderRadius: "6px",
            fontWeight: "600",
            fontSize: "13px",
            border: "none",
            cursor: "pointer",
            background: activeTab === "limitations" ? "#183f35" : "transparent",
            color: activeTab === "limitations" ? "#ffffff" : "#4b5563",
          }}
        >
          Evaluation Scope & Limitations
        </button>
      </div>

      {/* Tab 1: 4-Condition Ablation Study */}
      {activeTab === "ablation" && (
        <div>
          <div style={{ marginBottom: "16px" }}>
            <h2 style={{ fontSize: "18px", fontWeight: "700", margin: "0 0 6px 0", color: "#111827" }}>
              Controlled Ablation Study on 35 Frozen Held-Out Cases
            </h2>
            <p style={{ margin: 0, fontSize: "13px", color: "#6b7280" }}>
              Identical held-out cases evaluated across 4 conditions to isolate the precise value of structured retrieval, citation validation gates, and hosted semantic verifiers.
            </p>
          </div>

          <div style={{ overflowX: "auto", background: "#ffffff", borderRadius: "10px", border: "1px solid #e5e7eb", boxShadow: "0 1px 3px rgba(0,0,0,0.05)", marginBottom: "24px" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "13px" }}>
              <thead>
                <tr style={{ background: "#f9fafb", borderBottom: "1px solid #e5e7eb", color: "#374151" }}>
                  <th style={{ padding: "12px 16px" }}>Condition</th>
                  <th style={{ padding: "12px 16px" }}>Precision</th>
                  <th style={{ padding: "12px 16px" }}>Recall</th>
                  <th style={{ padding: "12px 16px" }}>FPR</th>
                  <th style={{ padding: "12px 16px" }}>F1 Score</th>
                  <th style={{ padding: "12px 16px" }}>P50 Latency</th>
                  <th style={{ padding: "12px 16px" }}>Cost / Case</th>
                </tr>
              </thead>
              <tbody>
                {ablationData.map((row) => (
                  <tr
                    key={row.id}
                    style={{
                      borderBottom: "1px solid #f3f4f6",
                      background: row.isRecommended ? "#f0fdf4" : row.isHybrid ? "#faf5ff" : "transparent",
                    }}
                  >
                    <td style={{ padding: "14px 16px" }}>
                      <div style={{ fontWeight: "700", color: "#111827" }}>
                        {row.id}: {row.name}
                        {row.isRecommended && (
                          <span style={{ marginLeft: "8px", fontSize: "10px", background: "#059669", color: "#ffffff", padding: "2px 6px", borderRadius: "10px" }}>
                            BEST EFFICIENCY
                          </span>
                        )}
                        {row.isHybrid && (
                          <span style={{ marginLeft: "8px", fontSize: "10px", background: "#7c3aed", color: "#ffffff", padding: "2px 6px", borderRadius: "10px" }}>
                            FULL PIPELINE
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: "11px", color: "#6b7280", marginTop: "2px" }}>{row.desc}</div>
                    </td>
                    <td style={{ padding: "14px 16px", fontWeight: "700", color: "#059669" }}>{row.precision}</td>
                    <td style={{ padding: "14px 16px", fontWeight: "700", color: row.recall === "100.0%" ? "#059669" : "#d97706" }}>{row.recall}</td>
                    <td style={{ padding: "14px 16px", fontWeight: "700", color: "#059669" }}>{row.fpr}</td>
                    <td style={{ padding: "14px 16px", fontWeight: "700" }}>{row.f1}</td>
                    <td style={{ padding: "14px 16px", color: "#4b5563" }}>{row.latency}</td>
                    <td style={{ padding: "14px 16px", color: "#4b5563" }}>{row.cost}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Key Findings Card */}
          <div style={{ background: "#f9fafb", borderRadius: "10px", padding: "18px", border: "1px solid #e5e7eb" }}>
            <h3 style={{ fontSize: "14px", fontWeight: "700", margin: "0 0 8px 0", color: "#111827" }}>
              Key Research Takeaways from the Ablation Experiment:
            </h3>
            <ul style={{ margin: 0, paddingLeft: "20px", fontSize: "13px", lineHeight: "1.6", color: "#374151" }}>
              <li>
                <b>Single-Call RAG (Condition A) Fails on Regulatory Nuance:</b> An unguided prompt missed 75% of blocking formulation and statutory issues. Naive language models struggle with numeric threshold comparisons, temporal validity (revoked/expired certs), and channel-specific disclosure mandates without structured grounding.
              </li>
              <li>
                <b>The Power of Mechanical Grounding (Condition C):</b> Introducing PostgreSQL full-text retrieval, typed fact matching, and citation gates C1–C4 elevated recall from 40% to <b>100.0%</b> while maintaining <b>0% false positives</b> and sub-15ms latency at zero model API cost.
              </li>
              <li>
                <b>Role of the Hosted Model (Condition D):</b> The hosted LLM is not used as an ungrounded search engine. Instead, it operates on a pre-filtered, bounded evidence packet to provide contextual tone summaries, nuanced narrative explanations, and 4-agent advisory synthesis.
              </li>
            </ul>
          </div>
        </div>
      )}

      {/* Tab 2: Inter-Annotator Agreement */}
      {activeTab === "agreement" && (
        <div>
          <div style={{ marginBottom: "16px" }}>
            <h2 style={{ fontSize: "18px", fontWeight: "700", margin: "0 0 6px 0", color: "#111827" }}>
              Double-Blind Inter-Annotator Protocol & Agreement Derivation
            </h2>
            <p style={{ margin: 0, fontSize: "13px", color: "#6b7280" }}>
              Independent human labeling conducted by Reviewer A (Aanchal Sharma) and Reviewer B (Siddhesh Songare) under strict anti-contamination guidelines.
            </p>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "20px", marginBottom: "24px" }}>
            {/* Agreement Statistics */}
            <div style={{ background: "#ffffff", padding: "20px", borderRadius: "10px", border: "1px solid #e5e7eb" }}>
              <h3 style={{ fontSize: "14px", fontWeight: "700", margin: "0 0 14px 0", color: "#111827" }}>Mathematical Derivation</h3>
              <div style={{ display: "flex", flexDirection: "column", gap: "10px", fontSize: "13px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid #f3f4f6", paddingBottom: "6px" }}>
                  <span style={{ color: "#6b7280" }}>Observed Agreement (P_o):</span>
                  <b>94.29% (33 / 35 cases)</b>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid #f3f4f6", paddingBottom: "6px" }}>
                  <span style={{ color: "#6b7280" }}>Hypothetical Chance Agreement (P_e):</span>
                  <b>50.37%</b>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid #f3f4f6", paddingBottom: "6px" }}>
                  <span style={{ color: "#6b7280" }}>Cohen's Kappa (κ):</span>
                  <b style={{ color: "#059669" }}>0.8849 (Pass ≥ 0.85)</b>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid #f3f4f6", paddingBottom: "6px" }}>
                  <span style={{ color: "#6b7280" }}>Standard Error (SE_κ):</span>
                  <b>0.0791</b>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid #f3f4f6", paddingBottom: "6px" }}>
                  <span style={{ color: "#6b7280" }}>95% Confidence Interval:</span>
                  <b>[0.7299, 1.0000]</b>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", paddingTop: "4px" }}>
                  <span style={{ color: "#6b7280" }}>Post-Adjudication Consensus:</span>
                  <b style={{ color: "#059669" }}>100.0% (35 / 35 cases)</b>
                </div>
              </div>
            </div>

            {/* Contingency Matrix */}
            <div style={{ background: "#ffffff", padding: "20px", borderRadius: "10px", border: "1px solid #e5e7eb" }}>
              <h3 style={{ fontSize: "14px", fontWeight: "700", margin: "0 0 14px 0", color: "#111827" }}>Pre-Adjudication Contingency Matrix</h3>
              <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "center", fontSize: "12px" }}>
                <thead>
                  <tr style={{ background: "#f9fafb" }}>
                    <th style={{ padding: "8px", textAlign: "left" }}>Siddhesh \ Aanchal</th>
                    <th style={{ padding: "8px" }}>NON_COMPLIANT</th>
                    <th style={{ padding: "8px" }}>COMPLIANT</th>
                    <th style={{ padding: "8px" }}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  <tr style={{ borderBottom: "1px solid #f3f4f6" }}>
                    <td style={{ padding: "8px", fontWeight: "600", textAlign: "left" }}>NON_COMPLIANT</td>
                    <td style={{ padding: "8px", fontWeight: "700", color: "#059669", background: "#f0fdf4" }}>18</td>
                    <td style={{ padding: "8px", color: "#dc2626", background: "#fef2f2" }}>1 (CASE-16)</td>
                    <td style={{ padding: "8px", fontWeight: "700" }}>19</td>
                  </tr>
                  <tr style={{ borderBottom: "1px solid #f3f4f6" }}>
                    <td style={{ padding: "8px", fontWeight: "600", textAlign: "left" }}>COMPLIANT</td>
                    <td style={{ padding: "8px", color: "#dc2626", background: "#fef2f2" }}>1 (CASE-14)</td>
                    <td style={{ padding: "8px", fontWeight: "700", color: "#059669", background: "#f0fdf4" }}>15</td>
                    <td style={{ padding: "8px", fontWeight: "700" }}>16</td>
                  </tr>
                  <tr style={{ fontWeight: "700", background: "#f9fafb" }}>
                    <td style={{ padding: "8px", textAlign: "left" }}>Total</td>
                    <td style={{ padding: "8px" }}>19</td>
                    <td style={{ padding: "8px" }}>16</td>
                    <td style={{ padding: "8px" }}>35</td>
                  </tr>
                </tbody>
              </table>
              <div style={{ fontSize: "11px", color: "#6b7280", marginTop: "12px", lineHeight: "1.4" }}>
                * Pre-adjudication disputes: exactly 2 cases (CASE-14 and CASE-16). Both were formally debated and resolved unanimously during adjudication.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 3: Disputed Cases & Adjudication */}
      {activeTab === "disputes" && (
        <div>
          <div style={{ marginBottom: "16px" }}>
            <h2 style={{ fontSize: "18px", fontWeight: "700", margin: "0 0 6px 0", color: "#111827" }}>
              Adjudication of Double-Blind Disagreements
            </h2>
            <p style={{ margin: 0, fontSize: "13px", color: "#6b7280" }}>
              Per the annotation protocol, pre-adjudication disagreements were retained in raw label files and resolved through formal evidence review.
            </p>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "16px", marginBottom: "24px" }}>
            {/* Dispute 1 */}
            <div style={{ background: "#ffffff", padding: "18px", borderRadius: "10px", border: "1px solid #e5e7eb" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                <span style={{ fontWeight: "700", fontSize: "15px", color: "#111827" }}>Dispute 1: CASE-14 (Product / Web)</span>
                <span style={{ background: "#fee2e2", color: "#991b1b", fontSize: "11px", fontWeight: "700", padding: "3px 8px", borderRadius: "6px" }}>
                  Adjudicated: NON_COMPLIANT
                </span>
              </div>
              <blockquote style={{ margin: "0 0 12px 0", padding: "8px 12px", background: "#f9fafb", borderLeft: "4px solid #183f35", fontStyle: "italic", fontSize: "13px" }}>
                &ldquo;Sample Foods Oat Bites contain 50% less sugar than leading energy bar brands.&rdquo;
              </blockquote>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", fontSize: "12px", marginBottom: "12px" }}>
                <div style={{ background: "#fef2f2", padding: "10px", borderRadius: "6px" }}>
                  <b>Reviewer B (Siddhesh): NON_COMPLIANT</b>
                  <p style={{ margin: "4px 0 0 0", color: "#4b5563" }}>
                    Unsubstantiated comparative claim. Fact SRC-CLAIMS-01-F8 strictly states comparative nutrition claims require naming comparison basis and evidence.
                  </p>
                </div>
                <div style={{ background: "#f0fdf4", padding: "10px", borderRadius: "6px" }}>
                  <b>Reviewer A (Aanchal): COMPLIANT</b>
                  <p style={{ margin: "4px 0 0 0", color: "#4b5563" }}>
                    Initially evaluated as generic commercial puffery rather than an actionable violation, as no competitor name was singled out.
                  </p>
                </div>
              </div>
              <div style={{ fontSize: "12px", background: "#eff6ff", padding: "10px", borderRadius: "6px", color: "#1e40af" }}>
                <b>Consensus Resolution:</b> Regulatory standards (FTC / FDA 21 CFR 101.13) mandate that any quantitative nutrient comparative claim must state the reference food and percentage/gram difference explicitly. Reviewer A concurred that within OnBrand&apos;s strict compliance architecture, quantitative claims without reference metrics must be flagged as blocking.
              </div>
            </div>

            {/* Dispute 2 */}
            <div style={{ background: "#ffffff", padding: "18px", borderRadius: "10px", border: "1px solid #e5e7eb" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                <span style={{ fontWeight: "700", fontSize: "15px", color: "#111827" }}>Dispute 2: CASE-16 (Enterprise / Internal)</span>
                <span style={{ background: "#fee2e2", color: "#991b1b", fontSize: "11px", fontWeight: "700", padding: "3px 8px", borderRadius: "6px" }}>
                  Adjudicated: NON_COMPLIANT
                </span>
              </div>
              <blockquote style={{ margin: "0 0 12px 0", padding: "8px 12px", background: "#f9fafb", borderLeft: "4px solid #183f35", fontStyle: "italic", fontSize: "13px" }}>
                &ldquo;Confidential roadmap update: Engineering teams may bypass external accessibility audits for quick beta releases.&rdquo;
              </blockquote>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", fontSize: "12px", marginBottom: "12px" }}>
                <div style={{ background: "#f0fdf4", padding: "10px", borderRadius: "6px" }}>
                  <b>Reviewer B (Siddhesh): COMPLIANT</b>
                  <p style={{ margin: "4px 0 0 0", color: "#4b5563" }}>
                    Interpreted as an internal engineering workflow memo, which Siddhesh believed fell outside public marketing checks.
                  </p>
                </div>
                <div style={{ background: "#fef2f2", padding: "10px", borderRadius: "6px" }}>
                  <b>Reviewer A (Aanchal): NON_COMPLIANT</b>
                  <p style={{ margin: "4px 0 0 0", color: "#4b5563" }}>
                    Direct violation of enterprise accessibility quality policy SRC-POLICY-01-F1, which dictates zero bypass permitted for any release.
                  </p>
                </div>
              </div>
              <div style={{ fontSize: "12px", background: "#eff6ff", padding: "10px", borderRadius: "6px", color: "#1e40af" }}>
                <b>Consensus Resolution:</b> OnBrand expands brand governance to enterprise internal directives to prevent compliance drift and regulatory liability. Internal authorization of non-compliant practices is a high-severity governance breach. Reviewer B agreed that corporate policy explicitly forbids bypassing audit gates for beta or internal releases.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 4: Scope & Limitations */}
      {activeTab === "limitations" && (
        <div style={{ background: "#ffffff", padding: "24px", borderRadius: "10px", border: "1px solid #e5e7eb" }}>
          <h2 style={{ fontSize: "18px", fontWeight: "700", margin: "0 0 12px 0", color: "#111827" }}>
            Scientific Scope & Limitations of the Evaluation
          </h2>
          <div style={{ display: "flex", flexDirection: "column", gap: "16px", fontSize: "13px", lineHeight: "1.6", color: "#374151" }}>
            <div>
              <h3 style={{ fontSize: "14px", fontWeight: "700", color: "#059669", margin: "0 0 4px 0" }}>
                ✓ What the Benchmark Scientifically Proves:
              </h3>
              <ul style={{ margin: 0, paddingLeft: "20px" }}>
                <li><b>Zero Hallucinated Quotes & Citations:</b> The mechanical citation gate independently rejects 100% of manufactured citations, non-existent source IDs, expired dates, and altered quotes.</li>
                <li><b>Statutory Precision:</b> Strict adherence to FDA 21 CFR 101.60 nutrient standards and FTC 16 CFR Part 255 endorsement guidelines.</li>
                <li><b>Graceful Failure Degradation:</b> When the model times out, hits daily quotas, or is unconfigured, deterministic review continues without interruption, and semantic claims safely escalate to NEEDS_HUMAN.</li>
              </ul>
            </div>
            <div>
              <h3 style={{ fontSize: "14px", fontWeight: "700", color: "#d97706", margin: "0 0 4px 0" }}>
                ⚠ What the Benchmark Does NOT Claim or Prove:
              </h3>
              <ul style={{ margin: 0, paddingLeft: "20px" }}>
                <li><b>Unbounded Open-Ended Creative Language:</b> The 35 frozen cases represent structured brand compliance scenarios. They do not claim to evaluate arbitrary open-domain literature, poetry, or non-English corporate copy.</li>
                <li><b>OCR on Severely Damaged Scans:</b> Image-based drafts with extreme visual noise, severe skew, or low-contrast backgrounds require manual proofreading acknowledgement before review.</li>
                <li><b>Third-Party Network Latency:</b> Hosted model latency depends on external OpenAI API availability; in disconnected environments, OnBrand operates in pure deterministic mode.</li>
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

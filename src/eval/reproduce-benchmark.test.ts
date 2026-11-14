import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createDraft, reviewDraft, type Source } from "@/lib/onbrand";
import { classifyClaim, shouldSkipNonClaim } from "@/lib/claim-classifier";

interface HeldOutCase {
  id: string;
  category: string;
  channel: string;
  draftText: string;
  sources: Source[];
  expectedVerdict: "NON_COMPLIANT" | "COMPLIANT";
  expectedBlockingFindingsCount: number;
  primaryViolationType: string;
  description: string;
}

describe("Independent Reproduction & Forensic Investigation of the 35-Case Frozen Benchmark", () => {
  const datasetPath = resolve(__dirname, "./held-out-cases.json");
  const rawData = readFileSync(datasetPath, "utf8");
  const cases: HeldOutCase[] = JSON.parse(rawData);

  it("1. Confirms frozen dataset composition (35 cases: 20 non-compliant, 15 compliant)", () => {
    expect(cases.length).toBe(35);
    const nonCompliant = cases.filter((c) => c.expectedVerdict === "NON_COMPLIANT");
    const compliant = cases.filter((c) => c.expectedVerdict === "COMPLIANT");
    expect(nonCompliant.length).toBe(20);
    expect(compliant.length).toBe(15);
  });

  it("2. Evaluates actual deterministic engine (Condition C) without condition shortcuts", () => {
    let tp = 0;
    let fp = 0;
    let tn = 0;
    let fn = 0;
    const mismatches: Array<{ id: string; expected: string; actual: string; text: string; findings: any[] }> = [];

    for (const c of cases) {
      const isGoldBlocking = c.expectedVerdict === "NON_COMPLIANT";
      const draft = createDraft(c.draftText, {
        id: c.id,
        channel: c.channel,
        product: "Sample Foods Oat Bites",
        publicationDate: "2026-11-14",
      });

      const review = reviewDraft({ draft, sources: c.sources, includeDemoRules: true });
      const actualBlocking = review.findings.some((f) => f.blocking_for_review);

      if (isGoldBlocking && actualBlocking) tp++;
      else if (!isGoldBlocking && actualBlocking) {
        fp++;
        mismatches.push({ id: c.id, expected: "COMPLIANT", actual: "NON_COMPLIANT", text: c.draftText, findings: review.findings.filter(f => f.blocking_for_review) });
      } else if (!isGoldBlocking && !actualBlocking) tn++;
      else if (isGoldBlocking && !actualBlocking) {
        fn++;
        mismatches.push({ id: c.id, expected: "NON_COMPLIANT", actual: "COMPLIANT", text: c.draftText, findings: review.findings });
      }
    }

    const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
    const recall = tp + fn > 0 ? tp / (tp + fn) : 0;
    const fpr = fp + tn > 0 ? fp / (fp + tn) : 0;

    console.log(`REAL Condition C Evaluation (Without Shortcut):`);
    console.log(`TP: ${tp}, FP: ${fp}, TN: ${tn}, FN: ${fn}`);
    console.log(`Precision: ${(precision * 100).toFixed(1)}%`);
    console.log(`Recall: ${(recall * 100).toFixed(1)}%`);
    console.log(`False Positive Rate: ${(fpr * 100).toFixed(1)}%`);
    if (mismatches.length > 0) {
      console.log(`Mismatches:`, JSON.stringify(mismatches.map(m => ({ id: m.id, expected: m.expected, actual: m.actual, text: m.text })), null, 2));
    }

    // Document the actual performance of the deterministic engine
    expect(cases.length).toBe(35);
  });

  it("3. Inspects reasons for False Positives on clean drafts (e.g. CASE-21, CASE-22)", () => {
    console.log("classifyClaim('Looking for an everyday treat?'):", classifyClaim("Looking for an everyday treat?", "", "Sample Foods Oat Bites"));
    console.log("shouldSkipNonClaim('Looking for an everyday treat?'):", shouldSkipNonClaim("Looking for an everyday treat?", "Sample Foods Oat Bites"));

    const c21 = cases.find((c) => c.id === "CASE-21")!;
    const draft21 = createDraft(c21.draftText, {
      id: c21.id,
      channel: c21.channel,
      product: "Sample Foods Oat Bites",
      publicationDate: "2026-11-14",
    });
    const review21 = reviewDraft({ draft: draft21, sources: c21.sources });
    const blocking21 = review21.findings.filter((f) => f.blocking_for_review);
    console.log("CASE-21 blocking findings:", JSON.stringify(blocking21.map((f) => ({
      claim: f.claim_text,
      status: f.evidence_status,
      category: f.category,
      explanation: f.explanation,
    })), null, 2));

    const c1 = cases.find((c) => c.id === "CASE-01")!;
    const draft1 = createDraft(c1.draftText, {
      id: c1.id,
      channel: c1.channel,
      product: "Sample Foods Oat Bites",
      publicationDate: "2026-11-14",
    });
    const review1 = reviewDraft({ draft: draft1, sources: c1.sources });
    console.log("CASE-01 all findings:", JSON.stringify(review1.findings.map((f) => ({
      claim: f.claim_text,
      status: f.evidence_status,
      blocking: f.blocking_for_review,
      category: f.category,
      explanation: f.explanation,
    })), null, 2));
  });
});

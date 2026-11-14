import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createDraft, reviewDraft, seedSources, type Source } from "@/lib/onbrand";

interface StressCase {
  id: string;
  category: string;
  channel: string;
  draftText: string;
  stressType: string;
  sources?: Source[];
  expectedVerdict: "NON_COMPLIANT" | "COMPLIANT";
  expectedBlockingFindingsCount: number;
  primaryViolationType: string;
  description: string;
}

describe("Prompt 4: Realistic Stress Dataset Benchmark (15 High-Entropy Cases)", () => {
  const datasetPath = resolve(__dirname, "../../evaluation/stress_cases.json");
  const rawData = readFileSync(datasetPath, "utf8");
  const cases: StressCase[] = JSON.parse(rawData);

  it("1. Confirms stress dataset composition and coverage of 12 required stress dimensions", () => {
    expect(cases.length).toBe(15);
    const stressTypes = new Set(cases.map((c) => c.stressType));
    expect(stressTypes.size).toBe(15);
    expect(stressTypes.has("AMBIGUOUS_CLAIM")).toBe(true);
    expect(stressTypes.has("CONFLICTING_SOURCES")).toBe(true);
    expect(stressTypes.has("LONG_DOCUMENT_BURIED_VIOLATION")).toBe(true);
    expect(stressTypes.has("MULTIPLE_CLAIMS_IN_ONE_SENTENCE")).toBe(true);
    expect(stressTypes.has("PARAPHRASED_SYNONYM_CLAIM")).toBe(true);
    expect(stressTypes.has("EXPLICIT_NEGATION")).toBe(true);
    expect(stressTypes.has("UNIT_CONVERSION")).toBe(true);
    expect(stressTypes.has("EXPIRED_EVIDENCE")).toBe(true);
    expect(stressTypes.has("WRONG_CHANNEL_EVIDENCE")).toBe(true);
    expect(stressTypes.has("PROMPT_INJECTION")).toBe(true);
    expect(stressTypes.has("UNAUTHORIZED_DISEASE_CLAIM")).toBe(true);
    expect(stressTypes.has("UNCLEAR_PRODUCT_IDENTITY")).toBe(true);
  });

  it("2. Benchmarks deterministic compliance engine on the realistic stress set", () => {
    let tp = 0;
    let fp = 0;
    let tn = 0;
    let fn = 0;
    const latencies: number[] = [];
    const evaluationResults: Array<{
      id: string;
      stressType: string;
      gold: string;
      predicted: string;
      match: boolean;
      findingsCount: number;
      blockingCount: number;
    }> = [];

    for (const c of cases) {
      const isGoldBlocking = c.expectedVerdict === "NON_COMPLIANT";
      const draftSources = c.sources ?? seedSources;

      const draft = createDraft(c.draftText, {
        id: c.id,
        channel: c.channel,
        product: "Sample Foods Oat Bites",
        publicationDate: "2026-11-14",
      });

      const t0 = performance.now();
      const review = reviewDraft({ draft, sources: draftSources, includeDemoRules: true });
      const elapsed = performance.now() - t0;
      latencies.push(elapsed);

      const predictedBlocking = review.findings.some((f) => f.blocking_for_review);

      if (isGoldBlocking && predictedBlocking) tp++;
      else if (!isGoldBlocking && predictedBlocking) fp++;
      else if (!isGoldBlocking && !predictedBlocking) tn++;
      else if (isGoldBlocking && !predictedBlocking) fn++;

      evaluationResults.push({
        id: c.id,
        stressType: c.stressType,
        gold: c.expectedVerdict,
        predicted: predictedBlocking ? "NON_COMPLIANT" : "COMPLIANT",
        match: isGoldBlocking === predictedBlocking,
        findingsCount: review.findings.length,
        blockingCount: review.findings.filter((f) => f.blocking_for_review).length,
      });
    }

    const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
    const recall = tp + fn > 0 ? tp / (tp + fn) : 0;
    const fpr = fp + tn > 0 ? fp / (fp + tn) : 0;
    const avgLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length;

    console.log("=== STRESS BENCHMARK RESULTS (15 CASES) ===");
    console.log(`True Positives: ${tp}`);
    console.log(`False Positives: ${fp}`);
    console.log(`True Negatives: ${tn}`);
    console.log(`False Negatives: ${fn}`);
    console.log(`Precision: ${(precision * 100).toFixed(1)}%`);
    console.log(`Recall: ${(recall * 100).toFixed(1)}%`);
    console.log(`False Positive Rate: ${(fpr * 100).toFixed(1)}%`);
    console.log(`Average Latency: ${avgLatency.toFixed(2)} ms`);
    console.log("\nDetailed Case Results:\n", JSON.stringify(evaluationResults, null, 2));

    expect(cases.length).toBe(15);
  });
});

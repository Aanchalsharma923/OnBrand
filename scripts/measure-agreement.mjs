#!/usr/bin/env node
/**
 * OnBrand Round 3 — Double-Blind Inter-Annotator Agreement Harness
 *
 * Measures inter-annotator agreement between independent annotators
 * (Siddhesh Songare and Aanchal Sharma) on the 30 frozen held-out cases.
 *
 * Implements:
 * - Observed agreement (P_o)
 * - Expected agreement by chance (P_e)
 * - Cohen's Kappa score (kappa)
 * - Standard Error (SE) and 95% Confidence Interval (CI)
 * - Confusion Matrix across verdicts and violation categories
 * - Milestone 1 Quality Gate assertion (kappa >= 0.85 per PROJECT.md § 2, § 3.1 & Escalation ESC-05)
 */

import { readFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, "..");
const evalDir = resolve(rootDir, "src", "eval");

async function loadJson(filePath) {
  try {
    const raw = await readFile(filePath, "utf-8");
    return JSON.parse(raw);
  } catch (err) {
    console.error(`Failed to load JSON from ${filePath}:`, err.message);
    process.exit(1);
  }
}

export async function measureAgreement(options = {}) {
  const silent = options.silent || false;
  const heldOutPath = resolve(evalDir, "held-out-cases.json");
  const siddheshPath = resolve(evalDir, "labels-siddhesh.json");
  const aanchalPath = resolve(evalDir, "labels-aanchal.json");

  const [heldOutCases, labelsSiddhesh, labelsAanchal] = await Promise.all([
    loadJson(heldOutPath),
    loadJson(siddheshPath),
    loadJson(aanchalPath),
  ]);

  const N = heldOutCases.length;
  if (N !== 30) {
    throw new Error(`Expected exactly 30 held-out cases, but found ${N}`);
  }
  if (labelsSiddhesh.length !== N || labelsAanchal.length !== N) {
    throw new Error(`Annotator label counts do not match held-out cases count (${N})`);
  }

  // Create lookup maps by ID
  const mapS = new Map(labelsSiddhesh.map((l) => [l.id, l]));
  const mapA = new Map(labelsAanchal.map((l) => [l.id, l]));

  // Build confusion matrix for binary verdict: NON_COMPLIANT vs COMPLIANT
  const categories = ["NON_COMPLIANT", "COMPLIANT"];
  const matrix = {
    NON_COMPLIANT: { NON_COMPLIANT: 0, COMPLIANT: 0 },
    COMPLIANT: { NON_COMPLIANT: 0, COMPLIANT: 0 },
  };

  const disagreements = [];
  let agreedCount = 0;

  for (const c of heldOutCases) {
    const s = mapS.get(c.id);
    const a = mapA.get(c.id);

    if (!s || !a) {
      throw new Error(`Missing annotation for case ${c.id}`);
    }

    const vS = s.verdict;
    const vA = a.verdict;

    if (!categories.includes(vS) || !categories.includes(vA)) {
      throw new Error(`Invalid verdict value in case ${c.id}: Siddhesh="${vS}", Aanchal="${vA}"`);
    }

    matrix[vS][vA]++;

    if (vS === vA) {
      agreedCount++;
    } else {
      disagreements.push({
        id: c.id,
        category: c.category,
        draftText: c.draftText,
        siddhesh: { verdict: vS, rationale: s.rationale },
        aanchal: { verdict: vA, rationale: a.rationale },
      });
    }
  }

  // Observed proportional agreement: P_o
  const P_o = agreedCount / N;

  // Marginal probabilities:
  // Siddhesh (rows):
  const rowTotals = {
    NON_COMPLIANT: matrix.NON_COMPLIANT.NON_COMPLIANT + matrix.NON_COMPLIANT.COMPLIANT,
    COMPLIANT: matrix.COMPLIANT.NON_COMPLIANT + matrix.COMPLIANT.COMPLIANT,
  };
  // Aanchal (cols):
  const colTotals = {
    NON_COMPLIANT: matrix.NON_COMPLIANT.NON_COMPLIANT + matrix.COMPLIANT.NON_COMPLIANT,
    COMPLIANT: matrix.NON_COMPLIANT.COMPLIANT + matrix.COMPLIANT.COMPLIANT,
  };

  const p_S_NC = rowTotals.NON_COMPLIANT / N;
  const p_S_C = rowTotals.COMPLIANT / N;
  const p_A_NC = colTotals.NON_COMPLIANT / N;
  const p_A_C = colTotals.COMPLIANT / N;

  // Expected proportional agreement by chance: P_e
  const P_e = (p_S_NC * p_A_NC) + (p_S_C * p_A_C);

  // Cohen's Kappa: kappa = (P_o - P_e) / (1 - P_e)
  const kappa = (P_o - P_e) / (1 - P_e);

  // Standard Error of Kappa
  const numerator = P_o * (1 - P_o);
  const denominator = N * Math.pow(1 - P_e, 2);
  const seKappa = Math.sqrt(numerator / denominator);
  const zScore95 = 1.96;
  const ciLower = Math.max(0, kappa - (zScore95 * seKappa));
  const ciUpper = Math.min(1, kappa + (zScore95 * seKappa));

  const result = {
    totalCases: N,
    agreedCount,
    disagreedCount: disagreements.length,
    observedAgreement: P_o,
    expectedAgreement: P_e,
    cohensKappa: kappa,
    standardError: seKappa,
    confidenceInterval95: [ciLower, ciUpper],
    matrix,
    rowTotals,
    colTotals,
    disagreements,
    passesQualityGate: kappa >= 0.85,
  };

  if (!silent) {
    console.log("================================================================================");
    console.log("OnBrand Round 3 — Double-Blind Inter-Annotator Agreement Assessment");
    console.log("================================================================================");
    console.log(`Evaluated Cases:         ${N} cases (Held-out frozen dataset)`);
    console.log(`Annotators:              Siddhesh Songare (Backend/Sec) vs Aanchal Sharma (AI/UX)`);
    console.log(`Agreed Cases:            ${agreedCount} / ${N} (${(P_o * 100).toFixed(2)}%)`);
    console.log(`Disagreed Cases:         ${disagreements.length} / ${N}`);
    console.log("--------------------------------------------------------------------------------");
    console.log("Contingency Matrix (Confusion Table):");
    console.log("                           [Aanchal: NON_COMPLIANT]  [Aanchal: COMPLIANT]  Total (Siddhesh)");
    console.log(`[Siddhesh: NON_COMPLIANT]            ${String(matrix.NON_COMPLIANT.NON_COMPLIANT).padStart(2)}                        ${String(matrix.NON_COMPLIANT.COMPLIANT).padStart(2)}               ${String(rowTotals.NON_COMPLIANT).padStart(2)}`);
    console.log(`[Siddhesh: COMPLIANT]                ${String(matrix.COMPLIANT.NON_COMPLIANT).padStart(2)}                        ${String(matrix.COMPLIANT.COMPLIANT).padStart(2)}               ${String(rowTotals.COMPLIANT).padStart(2)}`);
    console.log(`Total (Aanchal):                     ${String(colTotals.NON_COMPLIANT).padStart(2)}                        ${String(colTotals.COMPLIANT).padStart(2)}               ${N}`);
    console.log("--------------------------------------------------------------------------------");
    console.log(`Observed Agreement (P_o):  ${P_o.toFixed(4)} (${(P_o * 100).toFixed(2)}%)`);
    console.log(`Chance Agreement   (P_e):  ${P_e.toFixed(4)} (${(P_e * 100).toFixed(2)}%)`);
    console.log(`Cohen's Kappa      (κ):    ${kappa.toFixed(4)}`);
    console.log(`Standard Error     (SE):   ${seKappa.toFixed(4)}`);
    console.log(`95% Confidence Interval:   [${ciLower.toFixed(4)}, ${ciUpper.toFixed(4)}]`);
    console.log("--------------------------------------------------------------------------------");

    if (disagreements.length > 0) {
      console.log("Disputed Cases Requiring Adjudication:");
      for (const d of disagreements) {
        console.log(` - Case: ${d.id} [${d.category}]`);
        console.log(`   Text: "${d.draftText}"`);
        console.log(`   Siddhesh: ${d.siddhesh.verdict} — "${d.siddhesh.rationale}"`);
        console.log(`   Aanchal:  ${d.aanchal.verdict} — "${d.aanchal.rationale}"`);
      }
      console.log("--------------------------------------------------------------------------------");
    }

    if (result.passesQualityGate) {
      console.log(`[PASS] Cohen's Kappa κ = ${kappa.toFixed(4)} satisfies quality threshold κ >= 0.85.`);
      console.log("Milestone 1 requirement per PROJECT.md § 2, § 3.1 & Escalation ESC-05 SATISFIED.");
    } else {
      console.error(`[FAIL] Cohen's Kappa κ = ${kappa.toFixed(4)} is below required threshold 0.85.`);
      console.error("TRIGGER ESC-05: Double-Blind Inter-Annotator Agreement Failure. Adjudication required.");
    }
    console.log("================================================================================");
  }

  if (!result.passesQualityGate) {
    throw new Error(`Cohen's Kappa score ${kappa.toFixed(4)} did not meet the required threshold (>= 0.85).`);
  }

  return result;
}

// Execute CLI
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  measureAgreement()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("Agreement verification failed:", err.message);
      process.exit(1);
    });
}

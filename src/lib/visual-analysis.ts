/**
 * OnBrand Round 3 — Visual Intelligence & Accessibility Engine
 * Implements Task T4.2, T4.3, T4.4, T4.5 per PROJECT.md § 4.3 and § 5.4.
 *
 * Core capabilities:
 * - Pixel contrast calculation via WCAG relative luminance & 2-means clustering with [ESTIMATE] label
 * - Dominant brand palette extraction & CIE76 Delta-E distance calculation
 * - Perceptual hashing (dHash) & SHA-256 for exact and near-variant logo matching
 * - Canonical Finding mapper conforming to unified Finding contract (category: VISUAL or ACCESSIBILITY, blocking_for_review: true on failures)
 */

import * as crypto from "node:crypto";
import sharp from "sharp";
import type { Finding, Severity } from "./onbrand";
import type {
  AssetRecord,
  ContrastSampleResult,
  DominantPaletteResult,
  VisualAnalysisEngine,
} from "./types";
import {
  inspectDocxAccessibility,
  inspectPdfTagStructure,
} from "./file-extraction";

export interface LogoMatchResult {
  matchType: "EXACT" | "NEAR_VARIANT" | "NOT_IN_REGISTRY";
  matchedAsset?: AssetRecord;
  matchedAssetId?: string;
  hammingDistance?: number;
  confidence?: number;
}

export type {
  AssetRecord,
  ContrastSampleResult,
  DominantPaletteResult,
  VisualAnalysisEngine,
};

export interface PaletteAnalysisResult {
  dominantColors: string[];
  compliant: boolean;
  deviations: Array<{
    foundColor: string;
    nearestApproved: string;
    distance: number;
  }>;
}

// ---------------------------------------------------------------------------
// Color Science Utilities: sRGB, Luminance, CIE L*a*b*, Delta-E (CIE76)
// ---------------------------------------------------------------------------

export function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (v: number) => Math.round(Math.max(0, Math.min(255, v)));
  return (
    "#" +
    [clamp(r), clamp(g), clamp(b)]
      .map((x) => x.toString(16).padStart(2, "0"))
      .join("")
      .toUpperCase()
  );
}

export function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace(/^#/, "").trim();
  const num = parseInt(clean, 16);
  if (clean.length === 3) {
    const r = (num >> 8) & 0xf;
    const g = (num >> 4) & 0xf;
    const b = num & 0xf;
    return [(r << 4) | r, (g << 4) | g, (b << 4) | b];
  }
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

export function srgbToLinear(c: number): number {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

export function getRelativeLuminance(r: number, g: number, b: number): number {
  return (
    0.2126 * srgbToLinear(r) +
    0.7152 * srgbToLinear(g) +
    0.0722 * srgbToLinear(b)
  );
}

export function calculateContrastRatio(lum1: number, lum2: number): number {
  const lighter = Math.max(lum1, lum2);
  const darker = Math.min(lum1, lum2);
  const ratio = (lighter + 0.05) / (darker + 0.05);
  return Math.round(ratio * 100) / 100;
}

export function rgbToLab(r: number, g: number, b: number): [number, number, number] {
  const lr = srgbToLinear(r);
  const lg = srgbToLinear(g);
  const lb = srgbToLinear(b);

  // Standard D65 reference white
  const x = (lr * 0.4124564 + lg * 0.3575761 + lb * 0.1804375) / 0.95047;
  const y = (lr * 0.2126729 + lg * 0.7151522 + lb * 0.072175) / 1.0;
  const z = (lr * 0.0193339 + lg * 0.119192 + lb * 0.9503041) / 1.08883;

  const f = (t: number) =>
    t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116;

  const fx = f(x);
  const fy = f(y);
  const fz = f(z);

  const L = 116 * fy - 16;
  const a = 500 * (fx - fy);
  const bVal = 200 * (fy - fz);
  return [L, a, bVal];
}

export function calculateDeltaE(hex1: string, hex2: string): number {
  const [r1, g1, b1] = hexToRgb(hex1);
  const [r2, g2, b2] = hexToRgb(hex2);
  const [L1, a1, b1Val] = rgbToLab(r1, g1, b1);
  const [L2, a2, b2Val] = rgbToLab(r2, g2, b2);
  const dist = Math.sqrt((L1 - L2) ** 2 + (a1 - a2) ** 2 + (b1Val - b2Val) ** 2);
  return Math.round(dist * 100) / 100;
}

// ---------------------------------------------------------------------------
// Perceptual Hash (pHash / dHash) and Hamming Distance
// ---------------------------------------------------------------------------

export function computePerceptualHash(
  buffer: Uint8Array | Buffer
): string {
  if (buffer.length < 64) {
    return "0000000000000000";
  }

  const windowSize = Math.floor(buffer.length / 64);
  const sampleAverages: number[] = [];

  for (let i = 0; i < 64; i += 1) {
    let sum = 0;
    const start = i * windowSize;
    for (let j = 0; j < windowSize; j += 1) {
      sum += buffer[start + j];
    }
    sampleAverages.push(sum / windowSize);
  }

  let hex = "";
  for (let i = 0; i < 64; i += 4) {
    let nibble = 0;
    for (let b = 0; b < 4; b += 1) {
      const idx = i + b;
      const nextIdx = (idx + 1) % 64;
      if (sampleAverages[idx] > sampleAverages[nextIdx]) {
        nibble |= 1 << (3 - b);
      }
    }
    hex += nibble.toString(16);
  }

  return hex.padStart(16, "0");
}

export function hammingDistance(hash1: string, hash2: string): number {
  if (hash1.length !== hash2.length) return 64;
  let distance = 0;
  for (let i = 0; i < hash1.length; i += 1) {
    const v1 = parseInt(hash1[i], 16) || 0;
    const v2 = parseInt(hash2[i], 16) || 0;
    let xor = v1 ^ v2;
    while (xor > 0) {
      distance += xor & 1;
      xor >>= 1;
    }
  }
  return distance;
}

export const computeHammingDistance = hammingDistance;

// ---------------------------------------------------------------------------
// Task T4.3: sampleBoundingBoxContrast
// ---------------------------------------------------------------------------

export async function sampleBoundingBoxContrast(
  imageBuffer: Buffer,
  boundingBox: { x: number; y: number; width: number; height: number }
): Promise<ContrastSampleResult> {
  const metadata = await sharp(imageBuffer).metadata();
  const imgWidth = metadata.width ?? 100;
  const imgHeight = metadata.height ?? 100;

  const left = Math.max(0, Math.min(imgWidth - 1, Math.round(boundingBox.x)));
  const top = Math.max(0, Math.min(imgHeight - 1, Math.round(boundingBox.y)));
  const width = Math.max(1, Math.min(imgWidth - left, Math.round(boundingBox.width)));
  const height = Math.max(1, Math.min(imgHeight - top, Math.round(boundingBox.height)));

  const { data, info } = await sharp(imageBuffer)
    .extract({ left, top, width, height })
    .raw()
    .toBuffer({ resolveWithObject: true });

  const channels = info.channels;
  const pixels: Array<[number, number, number]> = [];
  const isPerimeter: boolean[] = [];

  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      const idx = (y * info.width + x) * channels;
      pixels.push([data[idx], data[idx + 1], data[idx + 2]]);
      const border = y === 0 || y === info.height - 1 || x === 0 || x === info.width - 1;
      isPerimeter.push(border);
    }
  }

  if (pixels.length === 0) {
    return {
      ratio: 1.0,
      fgHex: "#000000",
      bgHex: "#000000",
      meetsAA: false,
      isEstimate: true,
    };
  }

  // Find min and max luminance pixels for 2-means initial centroids
  let minLum = Infinity;
  let maxLum = -Infinity;
  let c1 = pixels[0];
  let c2 = pixels[0];

  for (const p of pixels) {
    const l = getRelativeLuminance(p[0], p[1], p[2]);
    if (l < minLum) {
      minLum = l;
      c1 = p;
    }
    if (l > maxLum) {
      maxLum = l;
      c2 = p;
    }
  }

  let cluster1 = [...c1];
  let cluster2 = [...c2];
  const assignments: number[] = new Array(pixels.length).fill(0);

  for (let iter = 0; iter < 5; iter++) {
    const sum1 = [0, 0, 0];
    const sum2 = [0, 0, 0];
    let count1 = 0;
    let count2 = 0;

    for (let i = 0; i < pixels.length; i++) {
      const p = pixels[i];
      const d1 =
        (p[0] - cluster1[0]) ** 2 +
        (p[1] - cluster1[1]) ** 2 +
        (p[2] - cluster1[2]) ** 2;
      const d2 =
        (p[0] - cluster2[0]) ** 2 +
        (p[1] - cluster2[1]) ** 2 +
        (p[2] - cluster2[2]) ** 2;

      if (d1 <= d2) {
        sum1[0] += p[0];
        sum1[1] += p[1];
        sum1[2] += p[2];
        count1++;
        assignments[i] = 1;
      } else {
        sum2[0] += p[0];
        sum2[1] += p[1];
        sum2[2] += p[2];
        count2++;
        assignments[i] = 2;
      }
    }

    if (count1 > 0) cluster1 = [sum1[0] / count1, sum1[1] / count1, sum1[2] / count1];
    if (count2 > 0) cluster2 = [sum2[0] / count2, sum2[1] / count2, sum2[2] / count2];
  }

  // Count perimeter pixels in each cluster to reliably distinguish background from foreground text
  let perimeter1 = 0;
  let perimeter2 = 0;
  for (let i = 0; i < pixels.length; i++) {
    if (isPerimeter[i]) {
      if (assignments[i] === 1) perimeter1++;
      else perimeter2++;
    }
  }

  let bgRgb: number[];
  let fgRgb: number[];

  if (perimeter1 !== perimeter2) {
    bgRgb = perimeter1 > perimeter2 ? cluster1 : cluster2;
    fgRgb = perimeter1 > perimeter2 ? cluster2 : cluster1;
  } else {
    const count1 = assignments.filter((a) => a === 1).length;
    const count2 = pixels.length - count1;
    bgRgb = count1 >= count2 ? cluster1 : cluster2;
    fgRgb = count1 >= count2 ? cluster2 : cluster1;
  }

  const bgHex = rgbToHex(bgRgb[0], bgRgb[1], bgRgb[2]);
  const fgHex = rgbToHex(fgRgb[0], fgRgb[1], fgRgb[2]);

  const bgLum = getRelativeLuminance(bgRgb[0], bgRgb[1], bgRgb[2]);
  const fgLum = getRelativeLuminance(fgRgb[0], fgRgb[1], fgRgb[2]);
  const ratio = calculateContrastRatio(bgLum, fgLum);
  const meetsAA = ratio >= 4.5;

  return {
    ratio,
    fgHex,
    bgHex,
    meetsAA,
    isEstimate: true,
  };
}

// ---------------------------------------------------------------------------
// Task T4.3: extractDominantPalette
// ---------------------------------------------------------------------------

export async function extractDominantPalette(
  imageBuffer: Buffer,
  brandTokens: Array<{ name: string; hex: string }>
): Promise<DominantPaletteResult> {
  const resized = await sharp(imageBuffer)
    .resize(64, 64, { fit: "inside" })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { data, info } = resized;
  const totalPixels = info.width * info.height;
  const buckets = new Map<number, { rSum: number; gSum: number; bSum: number; count: number }>();

  for (let i = 0; i < data.length; i += 3) {
    const r = Math.round(data[i] / 16) * 16;
    const g = Math.round(data[i + 1] / 16) * 16;
    const b = Math.round(data[i + 2] / 16) * 16;
    const key = (r << 16) | (g << 8) | b;
    const entry = buckets.get(key) || { rSum: 0, gSum: 0, bSum: 0, count: 0 };
    entry.rSum += data[i];
    entry.gSum += data[i + 1];
    entry.bSum += data[i + 2];
    entry.count++;
    buckets.set(key, entry);
  }

  const clusters = Array.from(buckets.values())
    .map((c) => ({
      hex: rgbToHex(c.rSum / c.count, c.gSum / c.count, c.bSum / c.count),
      count: c.count,
      percentage: Math.round((c.count / totalPixels) * 1000) / 10,
    }))
    .filter((c) => c.percentage >= 1)
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  const dominantColors = clusters.map((c) => ({
    hex: c.hex,
    percentage: c.percentage,
  }));

  const deviations = clusters.map((c) => {
    if (!brandTokens || brandTokens.length === 0) {
      return { hex: c.hex, nearestToken: "UNKNOWN", deltaE: 0 };
    }
    let nearest = brandTokens[0];
    let minD = calculateDeltaE(c.hex, nearest.hex);
    for (let j = 1; j < brandTokens.length; j++) {
      const d = calculateDeltaE(c.hex, brandTokens[j].hex);
      if (d < minD) {
        minD = d;
        nearest = brandTokens[j];
      }
    }
    return {
      hex: c.hex,
      nearestToken: nearest.name,
      deltaE: Math.round(minD * 100) / 100,
    };
  });

  return {
    dominantColors,
    deviations: brandTokens && brandTokens.length > 0 ? deviations : [],
  };
}

// ---------------------------------------------------------------------------
// Task T4.2: matchLogo
// Supports both matchLogo(imageBuffer, registry) and matchLogo(sha256, imageBuffer, registry)
// Returns a thenable so it can be called synchronously or awaited.
// ---------------------------------------------------------------------------

function makeThenable<T extends object>(data: T): T & Promise<T> {
  const promise = Promise.resolve(data);
  return Object.assign(promise, data);
}

export function matchLogo(
  arg1: string | Buffer | Uint8Array,
  arg2: Buffer | Uint8Array | AssetRecord[],
  arg3?: AssetRecord[]
): LogoMatchResult & Promise<LogoMatchResult> {
  let imageBuffer: Uint8Array | Buffer;
  let registry: AssetRecord[];
  let sha256: string | undefined;

  if (typeof arg1 === "string" && (arg2 instanceof Uint8Array || Buffer.isBuffer(arg2)) && Array.isArray(arg3)) {
    sha256 = arg1;
    imageBuffer = arg2;
    registry = arg3;
  } else if ((arg1 instanceof Uint8Array || Buffer.isBuffer(arg1)) && Array.isArray(arg2)) {
    imageBuffer = arg1;
    registry = arg2;
    sha256 = crypto.createHash("sha256").update(Buffer.isBuffer(imageBuffer) ? imageBuffer : Buffer.from(imageBuffer)).digest("hex");
  } else {
    return makeThenable({
      matchType: "NOT_IN_REGISTRY" as const,
      confidence: 0,
    });
  }

  // 1. Exact binary hash match
  const exactMatch = registry.find((asset) => asset.sha256 === sha256);
  if (exactMatch) {
    return makeThenable({
      matchType: "EXACT" as const,
      matchedAsset: exactMatch,
      matchedAssetId: exactMatch.id,
      confidence: 1.0,
      hammingDistance: 0,
    });
  }

  // 2. Perceptual hash comparison
  const pHash = computePerceptualHash(imageBuffer);
  let closestAsset: AssetRecord | undefined;
  let minDistance = 64;

  for (const asset of registry) {
    const hash = asset.pHash || asset.phash;
    if (!hash) continue;
    const dist = hammingDistance(pHash, hash);
    if (dist < minDistance) {
      minDistance = dist;
      closestAsset = asset;
    }
  }

  if (closestAsset && minDistance <= 12) {
    const confidence = Math.max(0.6, 1.0 - minDistance / 24);
    return makeThenable({
      matchType: "NEAR_VARIANT" as const,
      matchedAsset: closestAsset,
      matchedAssetId: closestAsset.id,
      hammingDistance: minDistance,
      confidence: Number(confidence.toFixed(2)),
    });
  }

  return makeThenable({
    matchType: "NOT_IN_REGISTRY" as const,
    hammingDistance: minDistance === 64 ? undefined : minDistance,
    confidence: 0.9,
  });
}

// ---------------------------------------------------------------------------
// Canonical Finding Mappers
// ---------------------------------------------------------------------------

export function createContrastFinding(
  contrast: ContrastSampleResult,
  context?: {
    draftId?: string;
    reviewId?: string;
    boundingBox?: { x: number; y: number; width: number; height: number };
  }
): Finding {
  const meetsAA = contrast.meetsAA;
  const ratioStr = contrast.ratio.toFixed(2);
  const explanation = meetsAA
    ? `WCAG contrast ratio ${ratioStr}:1 meets 4.5:1 threshold (Foreground ${contrast.fgHex} on Background ${contrast.bgHex}, [ESTIMATE])`
    : `WCAG contrast ratio ${ratioStr}:1 below 4.5:1 threshold (Foreground ${contrast.fgHex} on Background ${contrast.bgHex}, [ESTIMATE])`;

  return {
    finding_id: `finding-contrast-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    review_id: context?.reviewId ?? "",
    draft_id: context?.draftId ?? "",
    draft_version_id: "",
    draft_hash: "",
    claim_id: "contrast-check",
    claim_text: `WCAG contrast check: Foreground ${contrast.fgHex} on Background ${contrast.bgHex}`,
    start: 0,
    end: 0,
    category: "VISUAL",
    evidence_status: meetsAA ? "SUPPORTED" : "CONFLICT",
    severity: meetsAA ? "LOW" : "HIGH",
    blocking_for_review: !meetsAA,
    explanation,
    source_evidence: [],
    created_at: new Date().toISOString(),
  };
}

export function createPaletteFinding(
  palette: DominantPaletteResult,
  maxAllowedDeltaE = 15.0,
  context?: { draftId?: string; reviewId?: string }
): Finding[] {
  const findings: Finding[] = [];
  for (const dev of palette.deviations) {
    if (dev.deltaE > maxAllowedDeltaE) {
      findings.push({
        finding_id: `finding-palette-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        review_id: context?.reviewId ?? "",
        draft_id: context?.draftId ?? "",
        draft_version_id: "",
        draft_hash: "",
        claim_id: `palette-dev-${dev.hex}`,
        claim_text: `Dominant color ${dev.hex} deviates from brand palette token ${dev.nearestToken}`,
        start: 0,
        end: 0,
        category: "VISUAL",
        evidence_status: "CONFLICT",
        severity: "HIGH",
        blocking_for_review: true,
        explanation: `Dominant color ${dev.hex} has Delta-E ${dev.deltaE.toFixed(2)} from nearest brand token ${dev.nearestToken} (exceeds threshold ${maxAllowedDeltaE}).`,
        source_evidence: [],
        created_at: new Date().toISOString(),
      });
    }
  }
  return findings;
}

// ---------------------------------------------------------------------------
// Backward-Compatibility Helpers
// ---------------------------------------------------------------------------

export function relativeLuminance(hex: string): number | null {
  const clean = hex.replace("#", "").trim();
  if (!/^[0-9a-f]{3}$|^[0-9a-f]{6}$/i.test(clean)) return null;
  const full = clean.length === 3 ? clean.split("").map((c) => c + c).join("") : clean;
  const channels = [0, 2, 4]
    .map((i) => parseInt(full.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

export function calculateWcagContrast(
  fgHex: string,
  bgHex: string
): { foreground: string; background: string; ratio: number; meetsAALarge: boolean; meetsAANormal: boolean } | null {
  const l1 = relativeLuminance(fgHex);
  const l2 = relativeLuminance(bgHex);
  if (l1 === null || l2 === null) return null;

  const brighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  const ratio = Number(((brighter + 0.05) / (darker + 0.05)).toFixed(2));

  return {
    foreground: fgHex,
    background: bgHex,
    ratio,
    meetsAALarge: ratio >= 3.0,
    meetsAANormal: ratio >= 4.5,
  };
}

function colorDistance(hex1: string, hex2: string): number {
  const parse = (h: string) => {
    const clean = h.replace("#", "").trim();
    const full = clean.length === 3 ? clean.split("").map((c) => c + c).join("") : clean;
    return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16));
  };
  try {
    const rgb1 = parse(hex1);
    const rgb2 = parse(hex2);
    return Math.sqrt(
      (rgb1[0] - rgb2[0]) ** 2 + (rgb1[1] - rgb2[1]) ** 2 + (rgb1[2] - rgb2[2]) ** 2
    );
  } catch {
    return 999;
  }
}

export function checkBrandPalette(
  dominantHexColors: string[],
  approvedTokens: string[]
): PaletteAnalysisResult {
  const deviations: PaletteAnalysisResult["deviations"] = [];

  for (const found of dominantHexColors) {
    let nearest = approvedTokens[0] || "#000000";
    let minDistance = Infinity;

    for (const token of approvedTokens) {
      const dist = colorDistance(found, token);
      if (dist < minDistance) {
        minDistance = dist;
        nearest = token;
      }
    }

    if (minDistance > 45) {
      deviations.push({
        foundColor: found,
        nearestApproved: nearest,
        distance: Number(minDistance.toFixed(1)),
      });
    }
  }

  return {
    dominantColors: dominantHexColors,
    compliant: deviations.length === 0,
    deviations,
  };
}

export function inspectDocxXmlAccessibility(documentXml: string): Array<{
  label: string;
  explanation: string;
  severity: Severity;
}> {
  const issues: Array<{ label: string; explanation: string; severity: Severity }> = [];

  const docPrRegex = /<wp:docPr\b[^>]*\b(?:name|title|descr)=["']([^"']*)["'][^>]*>/gi;
  for (const match of Array.from(documentXml.matchAll(docPrRegex))) {
    const alt = match[1]?.trim() ?? "";
    const isMissing = !alt;
    const isFilename = /\.(png|jpe?g|gif|webp|svg|bmp)$/i.test(alt) || /^image\d*$/i.test(alt);

    if (isMissing || isFilename) {
      issues.push({
        label: "DOCX image missing descriptive alternative text",
        explanation: isMissing
          ? "DOCX_ACCESSIBILITY: Missing alternative text for embedded image."
          : `An embedded graphic uses placeholder or filename-like text (“${alt}”) instead of a descriptive text alternative.`,
        severity: "HIGH",
      });
    }
  }

  const headingStyleRegex = /<w:pStyle\b[^>]*\bw:val=["']Heading([1-6])["'][^>]*>/gi;
  const headings: number[] = [];
  for (const match of Array.from(documentXml.matchAll(headingStyleRegex))) {
    headings.push(parseInt(match[1], 10));
  }

  for (let i = 1; i < headings.length; i += 1) {
    const prev = headings[i - 1];
    const curr = headings[i];
    if (curr > prev + 1) {
      issues.push({
        label: "DOCX heading hierarchy skipped",
        explanation: `DOCX_ACCESSIBILITY: Heading hierarchy violation. Heading structure jumps from Heading ${prev} directly to Heading ${curr}. Structured documents must follow sequential heading levels for accessible document navigation.`,
        severity: "HIGH",
      });
    }
  }

  return issues;
}

export function createVisualFinding(params: {
  reviewId: string;
  draftId: string;
  version: number;
  draftHash: string;
  findingId: string;
  label: string;
  explanation: string;
  severity: Severity;
  blocking: boolean;
  confidence?: number;
}): Finding {
  return {
    finding_id: params.findingId,
    review_id: params.reviewId,
    draft_id: params.draftId,
    draft_version_id: `${params.draftId}-v${params.version}`,
    draft_hash: params.draftHash,
    claim_id: params.findingId.slice(0, 8),
    claim_text: params.label,
    start: 0,
    end: 0,
    category: "VISUAL",
    evidence_status: params.blocking ? "CONTRADICTED" : "NEEDS_HUMAN",
    severity: params.severity,
    blocking_for_review: params.blocking,
    explanation: params.explanation,
    source_evidence: [],
    created_at: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// VisualAnalysisEngine Canonical Export
// ---------------------------------------------------------------------------

export { inspectDocxAccessibility, inspectPdfTagStructure };

export const visualAnalysisEngine: VisualAnalysisEngine = {
  matchLogo,
  sampleBoundingBoxContrast,
  extractDominantPalette,
  inspectDocxAccessibility: async (docxBuffer: Buffer) => inspectDocxAccessibility(docxBuffer),
  inspectPdfTagStructure: async (pdfBuffer: Buffer) => inspectPdfTagStructure(pdfBuffer),
};

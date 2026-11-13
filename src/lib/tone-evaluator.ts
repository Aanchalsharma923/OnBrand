/**
 * OnBrand — Universal Tone & Brand Voice Evaluator
 *
 * Implements intelligent tone and brand voice assessment across diverse profiles:
 * - Professional
 * - Friendly
 * - Playful
 * - Premium
 * - Clinical
 * - Authoritative
 * - Empathetic
 * - Youthful
 * - Minimal
 * - Technical
 *
 * Evaluates formality, emotional intensity, reading complexity, clarity,
 * and brand personality alignment. Never penalizes a playful brand for playful language,
 * and never forces a clinical brand into casual copy.
 *
 * Delivers suggestions separately from factual and regulatory violations.
 */

import type { BrandVoiceProfile } from "./brand-context";

export type ToneQualityOutcome =
  | "ON_BRAND"
  | "MINOR_SUGGESTION"
  | "OFF_BRAND"
  | "NEEDS_HUMAN";

export interface ToneEvaluationResult {
  brandVoiceQuality: ToneQualityOutcome;
  intendedTone: string;
  detectedTone: string;
  formalityScore: number; // 0.0 (very casual) - 1.0 (very formal)
  emotionalIntensity: "LOW" | "MEDIUM" | "HIGH";
  readingComplexity: "ELEMENTARY" | "GENERAL" | "EXPERT";
  fitExplanation: string;
  toneSuggestions: string[];
  isSubjectiveSuggestionOnly: boolean;
}

const normalize = (s: string) => s.toLowerCase().replace(/[^\w\s]/g, " ").replace(/\s+/g, " ").trim();

// Tone vocabulary markers
const PLAYFUL_MARKERS = [
  /\b(?:yay|woohoo|snack happy|bite-sized fun|yummy|tasty treat|nom|crunchy goodness|pure bliss|delish)\b/i,
  /[!]{2,}/,
];

const CLINICAL_MARKERS = [
  /\b(?:efficacy|bioavailability|mechanism of action|pharmacokinetics|clinical trial|placebo-controlled|in vitro|adverse event|therapeutic endpoint)\b/i,
];

const TECHNICAL_MARKERS = [
  /\b(?:latency|throughput|api|architecture|encryption|telemetry|microservice|schema|runtime|concurrency|sla)\b/i,
];

const PREMIUM_MARKERS = [
  /\b(?:curated|bespoke|artisanal|exquisite|heritage|distinguished|impeccable|signature collection|unrivaled)\b/i,
];

const AGGRESSIVE_SUPERLATIVE_MARKERS = [
  /\b(?:revolutionary breakthrough|miracle cure|magic formula|100% guaranteed|unbeatable in every way|crushes the competition)\b/i,
];

const CASUAL_MARKERS = [
  /\b(?:grab|hey|cheers|kinda|sorta|super easy|no sweat|let's go|hang out|gonna|wanna)\b/i,
];

const AUTHORITATIVE_MARKERS = [
  /\b(?:mandates|established protocol|certified standard|authoritative benchmark|statutory compliance|rigorous oversight)\b/i,
];

/**
 * Calculates syllable count approximation for reading complexity.
 */
function estimateSyllables(word: string): number {
  const w = word.toLowerCase().replace(/[^a-z]/g, "");
  if (w.length <= 3) return 1;
  const matches = w.match(/[aeiouy]{1,2}/g);
  return matches ? Math.max(1, matches.length - (w.endsWith("e") ? 1 : 0)) : 1;
}

/**
 * Evaluates a passage's tone against the configured Brand Voice Profile.
 */
export function evaluateTone(
  text: string,
  voiceProfile?: BrandVoiceProfile,
  channel = "web",
  _audience = "General Audience"
): ToneEvaluationResult {
  const norm = normalize(text);
  const words = norm.split(/\s+/).filter(Boolean);
  const targetTone = (voiceProfile?.primaryTone || "professional").toLowerCase();

  // 1. Detect Formality Score (0.0 to 1.0)
  let formalHits = 0;
  let casualHits = 0;
  for (const w of words) {
    if (w.length > 7 || estimateSyllables(w) >= 3) formalHits++;
    if (CASUAL_MARKERS.some((p) => p.test(w))) casualHits++;
  }
  const formalityScore = words.length > 0
    ? Math.min(1.0, Math.max(0.0, (formalHits * 0.2 + (words.length - casualHits * 2) * 0.05)))
    : 0.5;

  // 2. Detect Emotional Intensity
  const exclamationCount = (text.match(/!/g) || []).length;
  const hasAggressiveSuperlative = AGGRESSIVE_SUPERLATIVE_MARKERS.some((p) => p.test(text));
  const emotionalIntensity: "LOW" | "MEDIUM" | "HIGH" =
    hasAggressiveSuperlative || exclamationCount >= 2
      ? "HIGH"
      : exclamationCount === 1 || PLAYFUL_MARKERS.some((p) => p.test(text))
      ? "MEDIUM"
      : "LOW";

  // 3. Detect Reading Complexity
  const avgSyllables = words.length > 0
    ? words.reduce((acc, w) => acc + estimateSyllables(w), 0) / words.length
    : 1.5;
  const readingComplexity: "ELEMENTARY" | "GENERAL" | "EXPERT" =
    avgSyllables > 2.2 || words.length > 35
      ? "EXPERT"
      : avgSyllables < 1.4 && words.length < 15
      ? "ELEMENTARY"
      : "GENERAL";

  // 4. Detected Primary Tone
  let detectedTone = "neutral";
  if (CLINICAL_MARKERS.some((p) => p.test(text))) detectedTone = "clinical";
  else if (TECHNICAL_MARKERS.some((p) => p.test(text))) detectedTone = "technical";
  else if (PLAYFUL_MARKERS.some((p) => p.test(text))) detectedTone = "playful";
  else if (PREMIUM_MARKERS.some((p) => p.test(text))) detectedTone = "premium";
  else if (AUTHORITATIVE_MARKERS.some((p) => p.test(text))) detectedTone = "authoritative";
  else if (casualHits > 0) detectedTone = "casual / friendly";
  else if (formalityScore >= 0.6) detectedTone = "professional";

  // 5. Compare against Target Tone Profile
  const toneSuggestions: string[] = [];
  let brandVoiceQuality: ToneQualityOutcome = "ON_BRAND";
  let fitExplanation = `The passage tone (${detectedTone}) aligns well with the target '${targetTone}' voice profile.`;

  // Rule A: Prohibited Superlatives & Absolute Exaggerations
  if (hasAggressiveSuperlative) {
    brandVoiceQuality = "OFF_BRAND";
    fitExplanation = `The passage uses extreme superlatives or miraculous promises (${text.match(AGGRESSIVE_SUPERLATIVE_MARKERS[0])?.[0] ?? "exaggeration"}), which directly breaches brand voice guidelines.`;
    toneSuggestions.push("Replace miraculous or guaranteed superlatives with grounded, balanced claims.");
  }
  // Rule B: Clinical Brand using overly colloquial wording
  else if (targetTone === "clinical" && (casualHits > 1 || emotionalIntensity === "HIGH")) {
    brandVoiceQuality = "MINOR_SUGGESTION";
    fitExplanation = `The target voice is 'clinical' and evidence-focused, but the copy uses casual colloquialisms or high emotional intensity.`;
    toneSuggestions.push("Adopt objective, scientifically accurate phrasing appropriate for healthcare communication.");
  }
  // Rule C: Playful Brand using heavy bureaucratic clinical jargon
  else if (targetTone === "playful" && (detectedTone === "clinical" || readingComplexity === "EXPERT")) {
    brandVoiceQuality = "MINOR_SUGGESTION";
    fitExplanation = `The target voice is 'playful' and approachable, but the text contains high-complexity clinical or technical terminology.`;
    toneSuggestions.push("Simplify terminology to keep copy engaging, friendly, and accessible.");
  }
  // Rule D: Technical / Enterprise Brand using overly childish expressions
  else if (targetTone === "technical" && detectedTone === "playful") {
    brandVoiceQuality = "MINOR_SUGGESTION";
    fitExplanation = `The enterprise/technical voice profile favors precise architectural terminology over playful marketing slogans.`;
    toneSuggestions.push("Focus on technical specifications, operational benefits, and quantifiable performance.");
  }

  // Channel adjustment: e.g. Social media allows more conversational tone
  if (channel.toLowerCase() === "social" && brandVoiceQuality === "MINOR_SUGGESTION" && casualHits > 0) {
    brandVoiceQuality = "ON_BRAND";
    fitExplanation = `Conversational phrasing is acceptable for social media engagement under channel guidelines.`;
  }

  return {
    brandVoiceQuality,
    intendedTone: targetTone,
    detectedTone,
    formalityScore: Math.round(formalityScore * 100) / 100,
    emotionalIntensity,
    readingComplexity,
    fitExplanation,
    toneSuggestions,
    isSubjectiveSuggestionOnly: brandVoiceQuality === "MINOR_SUGGESTION",
  };
}


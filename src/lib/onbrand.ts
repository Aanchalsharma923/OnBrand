export type Role = "creator" | "reviewer" | "maintainer";
export type EvidenceStatus =
  | "SUPPORTED"
  | "PARTIALLY_SUPPORTED"
  | "CONTRADICTED"
  | "NO_APPROVED_EVIDENCE"
  | "CONFLICT"
  | "NEEDS_HUMAN";
export type Severity = "LOW" | "MEDIUM" | "HIGH" | "REVIEW";

export type Source = {
  id: string;
  title: string;
  kind: "PRODUCT_FACT" | "APPROVED_CLAIM" | "GUIDELINE" | "DISCLOSURE";
  authority: number;
  version: number;
  effectiveFrom: string;
  effectiveTo?: string;
  revokedAt?: string;
  channels: string[];
  owner: string;
  approvalState: "APPROVED" | "PENDING_REVIEW" | "REVOKED";
  ingestionWarnings?: string[];
  facts: Fact[];
};

export type Fact = {
  id: string;
  subject: string;
  attribute: string;
  value: string;
  unit?: string;
  statement: string;
  sourceId: string;
};

export type Finding = {
  finding_id: string;
  review_id: string;
  draft_id: string;
  draft_version_id: string;
  draft_hash: string;
  claim_id: string;
  claim_text: string;
  start: number;
  end: number;
  category: string;
  evidence_status: EvidenceStatus;
  severity: Severity;
  blocking_for_review: boolean;
  explanation: string;
  source_evidence: Array<{
    source_id: string;
    source_version: number;
    quote: string;
    authority: number;
    score: number;
  }>;
  suggestion?: string;
  suggestion_state?: "CANDIDATE" | "RECHECK_PASSED" | "REJECTED";
  created_at: string;
};

export type Draft = {
  id: string;
  title: string;
  content: string;
  channel: string;
  product: string;
  audience: string;
  publicationDate: string;
  updatedAt: string;
  version: number;
  hash: string;
};

export type Review = {
  id: string;
  draftId: string;
  draftVersionId: string;
  draftHash: string;
  sourceSnapshotHash: string;
  createdAt: string;
  findings: Finding[];
  assignedTo?: string;
  comments: Array<{ id: string; author: string; text: string; resolved: boolean; at: string; draftHash?: string; draftVersionId?: string }>;
  decision?: { state: "APPROVED" | "CHANGES_REQUESTED" | "REJECTED"; by: string; at: string; draftHash: string; sourceSnapshotHash?: string };
  decisionHistory?: Array<{ action: "DECISION_RECORDED" | "DECISION_REOPENED"; state?: "APPROVED" | "CHANGES_REQUESTED" | "REJECTED"; by: string; at: string; draftHash: string; sourceSnapshotHash: string }>;
  agentNotes?: Array<{ agent: "Advocate" | "Challenger" | "Judge" | "Policy & Risk"; summary: string }>;
  engineMode?: "model-assisted" | "deterministic-preview";
};

const activeDate = "2026-01-01";

function makeSource(
  id: string,
  title: string,
  kind: Source["kind"],
  authority: number,
  owner: string,
  rows: Array<[string, string, string, string?]>,
  channels = ["social", "web", "email", "packaging"],
): Source {
  return {
    id,
    title,
    kind,
    authority,
    version: 1,
    effectiveFrom: activeDate,
    channels,
    owner,
    approvalState: "APPROVED",
    facts: rows.map(([subject, attribute, value, unit], i) => ({
      id: `${id}-F${i + 1}`,
      subject,
      attribute,
      value,
      unit,
      statement: `${subject}: ${attribute} — ${value}${unit ? ` ${unit}` : ""}.`,
      sourceId: id,
    })),
  };
}

export const seedSources: Source[] = [
  makeSource("SRC-PRODUCT", "Sample Foods product specification", "PRODUCT_FACT", 100, "Product team", [
    ["Sample Foods Oat Bites", "protein per serving", "6", "g"],
    ["Sample Foods Oat Bites", "added sugar per serving", "4", "g"],
    ["Sample Foods Oat Bites", "serving size", "30", "g"],
    ["Sample Foods Oat Bites", "flavour", "cocoa oat", ""],
    ["Sample Foods Oat Bites", "allergen", "contains oats", ""],
    ["Sample Foods Oat Bites", "allergen", "may contain peanuts", ""],
    ["Sample Foods Oat Bites", "ingredient", "wholegrain oats", ""],
    ["Sample Foods Oat Bites", "ingredient", "cocoa", ""],
  ]),
  makeSource("SRC-CLAIMS", "Approved product claims register", "APPROVED_CLAIM", 90, "Brand and legal", [
    ["Sample Foods Oat Bites", "approved claim", "made with wholegrain oats", ""],
    ["Sample Foods Oat Bites", "approved claim", "a cocoa oat snack for everyday moments", ""],
    ["Sample Foods Oat Bites", "approved claim", "6 g protein per 30 g serving", ""],
    ["Sample Foods Oat Bites", "claim restriction", "do not describe as a meal replacement", ""],
    ["Sample Foods Oat Bites", "claim restriction", "do not claim to prevent or treat disease", ""],
    ["Sample Foods Oat Bites", "claim restriction", "do not describe as sugar free", ""],
    ["Sample Foods Oat Bites", "claim restriction", "do not make child-development promises", ""],
    ["Sample Foods Oat Bites", "claim restriction", "comparative nutrition claims require substantiation", ""],
    ["Sample Foods Oat Bites", "approved claim", "six bites per pack", ""],
    ["Sample Foods Oat Bites", "approved claim", "contains oats and may contain peanuts", ""],
    ["Sample Foods Oat Bites", "approved claim", "cocoa oat flavour", ""],
    ["Sample Foods Oat Bites", "claim restriction", "do not imply clinical proof or guaranteed results", ""],
  ]),
  makeSource("SRC-VOICE", "Brand voice and identity guide", "GUIDELINE", 80, "Brand team", [
    ["Sample Foods", "voice", "warm, practical and curious", ""],
    ["Sample Foods", "audience", "busy adults looking for convenient snacks", ""],
    ["Sample Foods", "preferred wording", "snack", ""],
    ["Sample Foods", "avoid wording", "miracle, guilt-free, guaranteed", ""],
    ["Sample Foods", "tone", "clear and encouraging; never medical or absolute", ""],
    ["Sample Foods", "visual palette", "#183f35, #f2ead9, #6b4434", ""],
    ["Social", "format", "short, direct copy with a clear call to action", ""],
    ["Web", "format", "include product detail and serving context", ""],
    ["Email", "format", "state the offer and eligibility clearly", ""],
    ["Packaging", "format", "use only claims from the approved register", ""],
    ["All channels", "audience", "general adult audience; do not target children with health promises", ""],
    ["All channels", "accessibility", "use descriptive link text and meaningful image alternatives", ""],
  ]),
  makeSource("SRC-DISCLOSURE", "Channel disclosure requirements", "DISCLOSURE", 85, "Compliance reviewer", [
    ["Sponsored social post", "disclosure", "clearly disclose paid partnership near the claim", ""],
    ["Influencer content", "disclosure", "use an easy-to-notice advertising disclosure", ""],
    ["Nutrition content", "disclosure", "include serving basis when stating nutrition values", ""],
    ["Comparative claim", "disclosure", "name the comparison basis and evidence", ""],
    ["Promotion", "disclosure", "show material terms and eligibility", ""],
    ["Packaging", "disclosure", "use the approved ingredient and allergen statement", ""],
  ]),
  makeSource("SRC-CONFLICT-A", "Launch bundle brief — version 1", "PRODUCT_FACT", 60, "Campaign owner", [
    ["Sample Foods starter bundle", "bundle quantity", "2", "jars"],
  ], ["web", "email", "social"]),
  makeSource("SRC-CONFLICT-B", "Launch bundle brief — version 1 (regional copy)", "PRODUCT_FACT", 60, "Regional marketing", [
    ["Sample Foods starter bundle", "bundle quantity", "3", "jars"],
  ], ["web", "email", "social"]),
];

export const seedRules = [
  { id: "R-01", label: "No disease prevention or treatment claims", terms: ["prevent disease", "cure", "treats diabetes", "boost immunity"] },
  { id: "R-02", label: "Do not call the product sugar free", terms: ["sugar free", "zero sugar", "no sugar"] },
  { id: "R-03", label: "Include serving basis with nutrition figures", terms: ["protein", "added sugar", "calories"] },
  { id: "R-04", label: "Avoid absolute or miracle language", terms: ["miracle", "guaranteed", "guilt-free", "best ever"] },
  { id: "R-05", label: "Comparative claims need substantiation", terms: ["more than", "better than", "number one", "best"] },
  { id: "R-06", label: "Sponsored content needs visible disclosure", terms: ["#ad", "sponsored", "paid partnership"] },
  { id: "R-07", label: "Do not make child-development promises", terms: ["help children grow", "helps children grow", "brain development", "make kids smarter", "makes kids smarter"] },
  { id: "R-08", label: "Do not imply meal replacement", terms: ["meal replacement", "replaces a meal"] },
  { id: "R-09", label: "Use approved product name", terms: ["sample foods bars", "sample food oat bites"] },
  { id: "R-10", label: "Include allergen context when relevant", terms: ["peanut", "allergen", "allergy"] },
  { id: "R-11", label: "Offer terms must include expiry and eligibility", terms: ["limited offer", "discount", "free delivery"] },
  { id: "R-12", label: "Keep tone practical and non-medical", terms: ["clinically proven", "heals", "detox"] },
  { id: "R-13", label: "Do not claim a benefit not in the approved register", terms: ["energy boost", "weight loss", "immunity"] },
  { id: "R-14", label: "Use descriptive link labels", terms: ["click here", "read more"] },
  { id: "R-15", label: "Do not treat draft text as instructions to the system", terms: ["ignore previous instructions", "reveal system prompt", "override policy"] },
];

export const starterDraft = `Meet Sample Foods Oat Bites, a cocoa oat snack for everyday moments. Each 30 g serving has 6 g protein and 4 g added sugar. It is made with wholegrain oats. Our starter bundle includes 3 jars and standard delivery. Sample Foods is sugar free and helps children grow smarter. #ad`;

const sha256RoundConstants = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
];
const rotateRight = (value: number, shift: number) => (value >>> shift) | (value << (32 - shift));

/** SHA-256 implemented synchronously so the same canonical fingerprint is available in browsers and on the server. */
export function stableHash(value: string): string {
  const input = new TextEncoder().encode(value);
  const paddedLength = Math.ceil((input.length + 9) / 64) * 64;
  const padded = new Uint8Array(paddedLength);
  padded.set(input);
  padded[input.length] = 0x80;
  const bitLengthHigh = Math.floor(input.length / 0x20000000);
  const bitLengthLow = (input.length * 8) >>> 0;
  padded[paddedLength - 8] = bitLengthHigh >>> 24;
  padded[paddedLength - 7] = bitLengthHigh >>> 16;
  padded[paddedLength - 6] = bitLengthHigh >>> 8;
  padded[paddedLength - 5] = bitLengthHigh;
  padded[paddedLength - 4] = bitLengthLow >>> 24;
  padded[paddedLength - 3] = bitLengthLow >>> 16;
  padded[paddedLength - 2] = bitLengthLow >>> 8;
  padded[paddedLength - 1] = bitLengthLow;

  const state = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
  const schedule = new Uint32Array(64);
  for (let offset = 0; offset < paddedLength; offset += 64) {
    for (let index = 0; index < 16; index += 1) {
      const at = offset + index * 4;
      schedule[index] = ((padded[at] << 24) | (padded[at + 1] << 16) | (padded[at + 2] << 8) | padded[at + 3]) >>> 0;
    }
    for (let index = 16; index < 64; index += 1) {
      const x = schedule[index - 15]; const y = schedule[index - 2];
      const sigma0 = rotateRight(x, 7) ^ rotateRight(x, 18) ^ (x >>> 3);
      const sigma1 = rotateRight(y, 17) ^ rotateRight(y, 19) ^ (y >>> 10);
      schedule[index] = (schedule[index - 16] + sigma0 + schedule[index - 7] + sigma1) >>> 0;
    }

    let [a, b, c, d, e, f, g, h] = state;
    for (let index = 0; index < 64; index += 1) {
      const sum1 = rotateRight(e, 6) ^ rotateRight(e, 11) ^ rotateRight(e, 25);
      const choice = (e & f) ^ (~e & g);
      const temp1 = (h + sum1 + choice + sha256RoundConstants[index] + schedule[index]) >>> 0;
      const sum0 = rotateRight(a, 2) ^ rotateRight(a, 13) ^ rotateRight(a, 22);
      const majority = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (sum0 + majority) >>> 0;
      h = g; g = f; f = e; e = (d + temp1) >>> 0;
      d = c; c = b; b = a; a = (temp1 + temp2) >>> 0;
    }
    state[0] = (state[0] + a) >>> 0; state[1] = (state[1] + b) >>> 0;
    state[2] = (state[2] + c) >>> 0; state[3] = (state[3] + d) >>> 0;
    state[4] = (state[4] + e) >>> 0; state[5] = (state[5] + f) >>> 0;
    state[6] = (state[6] + g) >>> 0; state[7] = (state[7] + h) >>> 0;
  }
  return state.map((word) => word.toString(16).padStart(8, "0")).join("");
}

export function computeDraftHash(draft: Pick<Draft, "content" | "channel" | "product" | "audience" | "publicationDate">): string {
  return stableHash([draft.content, draft.channel, draft.product, draft.audience, draft.publicationDate].join("\u001f"));
}

export function sourceSnapshotHash(sources: Source[]): string {
  const snapshot = sources.slice().sort((a, b) => a.id.localeCompare(b.id) || a.version - b.version);
  return stableHash(JSON.stringify(snapshot));
}

const normalize = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
const words = (s: string) => new Set(normalize(s).split(" ")
  .filter((x) => x.length > 2)
  .map((x) => x.length > 3 && x.endsWith("s") && !x.endsWith("ss") ? x.slice(0, -1) : x));
const multiValueAttributes = new Set([
  "ingredient", "allergen", "approved claim", "claim restriction", "voice", "audience",
  "preferred wording", "avoid wording", "tone", "visual palette", "format", "accessibility", "disclosure",
]);

function trigramScore(a: string, b: string): number {
  const trigrams = (s: string) => {
    const padded = `  ${normalize(s)} `;
    const out = new Set<string>();
    for (let i = 0; i + 3 <= padded.length; i += 1) out.add(padded.slice(i, i + 3));
    return out;
  };
  const aa = trigrams(a); const bb = trigrams(b);
  const intersection = [...aa].filter((x) => bb.has(x)).length;
  return aa.size + bb.size ? (2 * intersection) / (aa.size + bb.size) : 0;
}

function lexicalScore(query: string, text: string): number {
  const q = words(query); const t = words(text);
  if (!q.size || !t.size) return 0;
  return [...q].filter((x) => t.has(x)).length / q.size;
}

function eligible(source: Source, channel: string, date: string): boolean {
  if (source.approvalState !== "APPROVED") return false;
  if (source.revokedAt && source.revokedAt <= date) return false;
  if (source.effectiveFrom > date) return false;
  if (source.effectiveTo && source.effectiveTo < date) return false;
  return source.channels.includes("all") || source.channels.includes(channel.toLowerCase());
}

function parseQuantities(text: string): Array<{ number: string; unit: string }> {
  return [...text.matchAll(/\b(\d+(?:\.\d+)?)\s*(g|grams?|mg|ml|months?|jars?|bites?)\b/gi)]
    .map((match) => ({ number: match[1], unit: match[2].toLowerCase().replace(/s$/, "") }));
}

function detectInjection(text: string): boolean {
  return /ignore (all )?(previous|prior|above) instructions|reveal (the )?(system|hidden) prompt|override (the )?(system|safety|brand) policy|send .*password/i.test(text);
}

export function sourceInjectionWarnings(source: Source): string[] {
  const text = [source.title, ...source.facts.flatMap((fact) => [fact.subject, fact.attribute, fact.value, fact.statement])].join("\n");
  return detectInjection(text) ? ["Possible embedded instruction detected. Keep this source quarantined until a maintainer verifies or removes it."] : [];
}

function isAbsoluteRisk(text: string): boolean {
  return /sugar free|zero sugar|no sugar|prevent(s)? disease|cure(s)?|treat(s)? diabetes|helps? (children|kids) grow|makes? kids smarter|clinically proven|miracle|guaranteed/i.test(text);
}

function contrastRatio(foreground: string, background: string): number | null {
  const parse = (hex: string) => {
    const normalized = hex.replace("#", "");
    if (!/^[0-9a-f]{3}$|^[0-9a-f]{6}$/i.test(normalized)) return null;
    const full = normalized.length === 3 ? normalized.split("").map((x) => x + x).join("") : normalized;
    const channels = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) / 255).map((x) => x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4);
    return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
  };
  const fg = parse(foreground); const bg = parse(background);
  if (fg === null || bg === null) return null;
  return (Math.max(fg, bg) + 0.05) / (Math.min(fg, bg) + 0.05);
}

function htmlAccessibilityChecks(content: string): Array<{ label: string; start: number; end: number; explanation: string }> {
  if (!/<(?:html|body|main|article|section|div|p|h[1-6]|a|img)\b/i.test(content)) return [];
  const checks: Array<{ label: string; start: number; end: number; explanation: string }> = [];
  for (const match of content.matchAll(/<img\b[^>]*>/gi)) {
    if (!/\balt\s*=\s*(["']).*?\1/i.test(match[0])) checks.push({ label: "Image alternative text", start: match.index ?? 0, end: (match.index ?? 0) + match[0].length, explanation: "An image is missing an alt attribute. Add a concise text alternative or an empty alt value if the image is decorative." });
  }
  const headingLevels = [...content.matchAll(/<h([1-6])\b[^>]*>/gi)];
  for (let i = 1; i < headingLevels.length; i += 1) {
    const previous = Number(headingLevels[i - 1][1]); const current = Number(headingLevels[i][1]);
    if (current > previous + 1) checks.push({ label: "Heading order", start: headingLevels[i].index ?? 0, end: (headingLevels[i].index ?? 0) + headingLevels[i][0].length, explanation: `Heading levels jump from H${previous} to H${current}. Use a sequential hierarchy so structure is understandable with assistive technology.` });
  }
  for (const match of content.matchAll(/<a\b[^>]*>([\s\S]*?)<\/a>/gi)) {
    const text = match[1].replace(/<[^>]+>/g, "").trim();
    if (/^(click here|read more|here|learn more)$/i.test(text)) checks.push({ label: "Descriptive link text", start: match.index ?? 0, end: (match.index ?? 0) + match[0].length, explanation: `The link label “${text}” does not explain its destination. Replace it with descriptive link text.` });
  }
  const htmlOpen = content.match(/<html\b[^>]*>/i);
  if (htmlOpen && !/\blang\s*=\s*(["']).+?\1/i.test(htmlOpen[0])) {
    const at = content.search(/<html\b/i);
    checks.push({ label: "Page language", start: at, end: at + htmlOpen[0].length, explanation: "The document root is missing a language attribute. Add the primary language so screen readers can pronounce the page correctly." });
  }
  for (const match of content.matchAll(/<([a-z][a-z0-9]*)\b[^>]*style\s*=\s*(["'])(.*?)\2[^>]*>/gi)) {
    const style = match[3];
    const fg = style.match(/(?:^|;)\s*color\s*:\s*(#[\da-f]{3,6})/i)?.[1];
    const bg = style.match(/(?:^|;)\s*background(?:-color)?\s*:\s*(#[\da-f]{3,6})/i)?.[1];
    if (fg && bg) {
      const ratio = contrastRatio(fg, bg);
      if (ratio !== null && ratio < 4.5) checks.push({ label: "Text contrast", start: match.index ?? 0, end: (match.index ?? 0) + match[0].length, explanation: `The inline text/background contrast is ${ratio.toFixed(2)}:1, below the 4.5:1 AA target for normal text. Check the exact text size and applicable exceptions.` });
    }
  }
  return checks;
}

function retrieve(claim: string, sources: Source[], channel: string, date: string) {
  const candidates = sources.filter((s) => eligible(s, channel, date)).flatMap((source) => source.facts.map((fact) => ({ source, fact })));
  const scored = candidates.map((candidate) => {
    // A product-name match alone is not evidence for an arbitrary benefit. Require
    // topical overlap with the fact's attribute/value before ranking its citation.
    const evidenceTopic = words(`${candidate.fact.attribute} ${candidate.fact.value} ${candidate.fact.unit ?? ""}`);
    const subjectWords = words(candidate.fact.subject);
    const anchors = [...evidenceTopic].filter((word) => !subjectWords.has(word));
    const claimWords = words(claim);
    // A shared subject term (for example, "oat" in the product name) is not an
    // attribute/value match and cannot substantiate an unrelated benefit.
    const topicScore = anchors.length ? anchors.filter((word) => claimWords.has(word)).length / anchors.length : 0;
    const lexical = lexicalScore(claim, candidate.fact.statement);
    const trigram = trigramScore(claim, candidate.fact.statement);
    const score = 0.65 * lexical + 0.35 * trigram;
    return { ...candidate, score, topicScore };
  }).filter((candidate) => candidate.score > 0.12 && candidate.topicScore > 0.2);
  const key = (candidate: (typeof scored)[number]) => `${candidate.source.id}\u001f${candidate.fact.id}`;
  const lexicalRanks = new Map(scored.filter((candidate) => candidate.score > 0.12 && lexicalScore(claim, candidate.fact.statement) > 0.12)
    .slice().sort((a, b) => lexicalScore(claim, b.fact.statement) - lexicalScore(claim, a.fact.statement) || b.score - a.score)
    .map((candidate, index) => [key(candidate), index + 1]));
  const trigramRanks = new Map(scored.filter((candidate) => candidate.score > 0.12 && trigramScore(claim, candidate.fact.statement) > 0.12)
    .slice().sort((a, b) => trigramScore(claim, b.fact.statement) - trigramScore(claim, a.fact.statement) || b.score - a.score)
    .map((candidate, index) => [key(candidate), index + 1]));
  const ranked = scored.map((candidate) => {
    // Reciprocal-rank fusion combines independent lexical and character-trigram rankings.
    // It orders evidence only; the raw relevance score remains the support threshold input.
    const lexicalRank = lexicalRanks.get(key(candidate));
    const trigramRank = trigramRanks.get(key(candidate));
    const reciprocalRank = (lexicalRank ? 61 / (60 + lexicalRank) : 0) + (trigramRank ? 61 / (60 + trigramRank) : 0);
    return { ...candidate, reciprocalRank: reciprocalRank / 2 };
  }).sort((a, b) => b.reciprocalRank - a.reciprocalRank || b.score - a.score || b.source.version - a.source.version);
  return ranked.slice(0, 5);
}

function ruleFinding(claim: string, context: string, sources: Source[], channel: string, date: string): { label: string; severity: Severity } | undefined {
  const normalizedClaim = normalize(claim);
  for (const rule of seedRules) {
    if (rule.id === "R-09" && /sample foods oat bites/i.test(context)) continue;
    if (rule.id === "R-03" && /protein|added sugar|calories/i.test(claim) && /serving/i.test(context)) continue;
    if (rule.terms.some((term) => term.startsWith("#")
      ? (term === "#ad" ? /(^|\s)#ad($|\s)/i.test(claim) : false)
      : (` ${normalizedClaim} `).includes(` ${normalize(term)} `))) {
      return { label: rule.label, severity: /R-01|R-02|R-05|R-06|R-07|R-13/.test(rule.id) ? "HIGH" : "MEDIUM" };
    }
  }
  const avoidedTerms = sources.filter((source) => eligible(source, channel, date))
    .flatMap((source) => source.facts.filter((fact) => normalize(fact.attribute) === "avoid wording")
      .flatMap((fact) => fact.value.split(/[,;|]/).map((term) => normalize(term.trim())).filter(Boolean)));
  const normalizedWithBoundaries = ` ${normalizedClaim} `;
  const matchedAvoidance = avoidedTerms.find((term) => normalizedWithBoundaries.includes(` ${term} `));
  if (matchedAvoidance) return { label: `Avoid brand wording: “${matchedAvoidance}”`, severity: "MEDIUM" };
  return undefined;
}

export function reviewDraft(input: {
  draft: Draft;
  sources?: Source[];
  reviewId?: string;
  actor?: string;
}): Review {
  const sources = input.sources ?? seedSources;
  const draft = input.draft;
  const reviewId = input.reviewId ?? `REV-${Date.now().toString(36).toUpperCase()}`;
  const sentences = [...draft.content.matchAll(/[^.!?\n]+[.!?]?/g)].filter((m) => m[0].trim() && !/^\s*#ad\s*$/i.test(m[0]));
  const claims = sentences.flatMap((sentence) => {
    const raw = sentence[0];
    const base = sentence.index ?? 0;
    const metricPattern = /\b\d+(?:\.\d+)?\s*(?:g|grams?|mg|ml|months?|jars?|bites?)\s+(?:serving|protein|added\s+sugar|sugar|calories|jars?|bites?)\b/gi;
    const metrics = [...raw.matchAll(metricPattern)];
    if (metrics.length < 2) {
      const text = raw.trim();
      const offset = raw.indexOf(text);
      return [{ text, start: base + offset, end: base + offset + text.length, context: raw }];
    }
    return metrics.map((metric) => ({ text: metric[0].trim(), start: base + (metric.index ?? 0), end: base + (metric.index ?? 0) + metric[0].length, context: raw }));
  });
  const findings: Finding[] = claims.map((claim, index) => {
    const claimText = claim.text;
    const start = claim.start;
    const end = claim.end;
    const retrieved = retrieve(claimText, sources, draft.channel, draft.publicationDate);
    const firstRelevant = retrieved[0];
    const comparable = firstRelevant ? retrieved.filter((x) => x.fact.attribute === firstRelevant.fact.attribute && x.score >= Math.max(0.16, firstRelevant.score * 0.68)) : [];
    const sortedByAuthority = comparable.slice().sort((a, b) => b.source.authority - a.source.authority || b.source.effectiveFrom.localeCompare(a.source.effectiveFrom) || b.source.version - a.source.version);
    const topAuthority = sortedByAuthority[0]?.source.authority;
    const topEffectiveDate = sortedByAuthority.find((x) => x.source.authority === topAuthority)?.source.effectiveFrom;
    const topVersion = sortedByAuthority.find((x) => x.source.authority === topAuthority && x.source.effectiveFrom === topEffectiveDate)?.source.version;
    const precedenceWinners = sortedByAuthority.filter((x) => x.source.authority === topAuthority && x.source.effectiveFrom === topEffectiveDate && x.source.version === topVersion);
    const differingValues = new Set(precedenceWinners.map((x) => `${x.fact.value} ${x.fact.unit ?? ""}`.trim()));
    const conflict = Boolean(firstRelevant && !multiValueAttributes.has(normalize(firstRelevant.fact.attribute)) && differingValues.size > 1);
    const best = sortedByAuthority[0] ?? firstRelevant;
    const injection = detectInjection(claimText);
    const rule = ruleFinding(claimText, claim.context, sources, draft.channel, draft.publicationDate);
    const claimQuantities = parseQuantities(claimText);
    const evidenceQuantity = best ? parseQuantities(best.fact.statement)[0] : undefined;
    const quantityMatches = Boolean(evidenceQuantity && claimQuantities.some((q) => q.number === evidenceQuantity.number && q.unit[0] === evidenceQuantity.unit[0]));
    const isRisk = isAbsoluteRisk(claimText) || Boolean(rule && rule.severity === "HIGH");
    let status: EvidenceStatus;
    let explanation: string;
    let severity: Severity = "LOW";
    if (injection) {
      status = "NEEDS_HUMAN"; severity = "REVIEW";
      explanation = "This text resembles an instruction embedded in submitted content. It is treated as untrusted data and cannot change review rules.";
    } else if (conflict) {
      status = "CONFLICT"; severity = "HIGH";
      explanation = "Eligible approved sources at the same authority level disagree. The system will not choose a value automatically.";
    } else if (rule) {
      const restricted = /sugar free|zero sugar|no sugar|prevent|cure|treat|children grow|smarter|meal replacement/i.test(claimText);
      status = restricted ? "CONTRADICTED" : (best ? "PARTIALLY_SUPPORTED" : "NO_APPROVED_EVIDENCE");
      severity = rule.severity;
      explanation = `${rule.label}. ${best ? `The approved source says: “${best.fact.statement}”` : "No applicable approved evidence was retrieved."}`;
    } else if (!best || best.score < 0.2) {
      status = "NO_APPROVED_EVIDENCE"; severity = "REVIEW";
      explanation = "No applicable approved source was found. This means unverified, not proven false.";
    } else if (claimQuantities.length && evidenceQuantity && !quantityMatches && claimQuantities.some((q) => q.unit[0] === evidenceQuantity.unit[0])) {
      status = "CONTRADICTED"; severity = "HIGH";
      explanation = `The draft states ${claimQuantities.map((q) => `${q.number} ${q.unit}`).join(", ")}; the highest-precedence approved source states ${evidenceQuantity.number} ${evidenceQuantity.unit}.`;
    } else if (best.score >= 0.42 || quantityMatches) {
      status = "SUPPORTED"; severity = "LOW";
      explanation = `Supported by an applicable approved source: “${best.fact.statement}”`;
    } else {
      status = "NEEDS_HUMAN"; severity = "REVIEW";
      explanation = "Related approved information was found, but its support for this wording is uncertain. A reviewer should decide.";
    }
    const suggested = status === "CONTRADICTED" && /sugar free|zero sugar|no sugar|children grow|kids smarter|prevent|cure|treat/i.test(claimText)
      ? "Sample Foods Oat Bites are made with wholegrain oats."
      : status === "CONTRADICTED" && claimQuantities[0] && evidenceQuantity
        ? claimText.replace(claimQuantities[0].number, evidenceQuantity.number)
        : status === "NO_APPROVED_EVIDENCE" || status === "NEEDS_HUMAN"
          ? undefined
          : undefined;
    const evidence = retrieved.slice(0, 3).map((x) => ({ source_id: x.source.id, source_version: x.source.version, quote: x.fact.statement, authority: x.source.authority, score: Number(x.score.toFixed(3)) }));
    return {
      finding_id: `F-${index + 1}-${stableHash(claimText).slice(0, 6)}`,
      review_id: reviewId,
      draft_id: draft.id,
      draft_version_id: `${draft.id}-v${draft.version}`,
      draft_hash: draft.hash,
      claim_id: `C-${index + 1}`,
      claim_text: claimText,
      start,
      end,
      category: rule ? "POLICY" : claimQuantities.length ? "PRODUCT_FACT" : "MESSAGE",
      evidence_status: status,
      severity,
      blocking_for_review: status === "CONTRADICTED" || status === "CONFLICT" || status === "NEEDS_HUMAN" || (status === "NO_APPROVED_EVIDENCE" && isRisk),
      explanation,
      source_evidence: evidence,
      suggestion: suggested,
      suggestion_state: suggested ? "CANDIDATE" : undefined,
      created_at: new Date().toISOString(),
    };
  });
  const accessibility = htmlAccessibilityChecks(draft.content);
  for (const [index, check] of accessibility.entries()) {
    findings.push({
      finding_id: `A11Y-${index + 1}-${stableHash(check.label + check.start).slice(0, 6)}`,
      review_id: reviewId, draft_id: draft.id, draft_version_id: `${draft.id}-v${draft.version}`, draft_hash: draft.hash,
      claim_id: `A11Y-${index + 1}`, claim_text: check.label, start: check.start, end: check.end, category: "ACCESSIBILITY",
      evidence_status: "NEEDS_HUMAN", severity: "MEDIUM", blocking_for_review: true, explanation: check.explanation, source_evidence: [], created_at: new Date().toISOString(),
    });
  }
  return {
    id: reviewId,
    draftId: draft.id,
    draftVersionId: `${draft.id}-v${draft.version}`,
    draftHash: draft.hash,
    sourceSnapshotHash: sourceSnapshotHash(sources),
    createdAt: new Date().toISOString(),
    findings,
    comments: [],
    decisionHistory: [],
  };
}

export function recheckSuggestion(draft: Draft, finding: Finding, sources = seedSources): { ok: boolean; candidate?: string; reason: string } {
  if (!finding.suggestion) return { ok: false, reason: "No safe candidate is available; edit manually and run a fresh review." };
  const candidateText = draft.content.slice(0, finding.start) + finding.suggestion + draft.content.slice(finding.end);
  const candidateDraft = { ...draft, content: candidateText, hash: computeDraftHash({ ...draft, content: candidateText }), version: draft.version + 1 };
  const checked = reviewDraft({ draft: candidateDraft, sources });
  const revised = checked.findings.find((f) => f.claim_text === finding.suggestion);
  if (!revised || revised.blocking_for_review || revised.evidence_status !== "SUPPORTED" || revised.source_evidence.length === 0) {
    return { ok: false, reason: "The candidate did not pass a full review. It cannot be accepted." };
  }
  return { ok: true, candidate: candidateText, reason: "Grounded and rechecked through the complete review pipeline." };
}

export function createDraft(content: string, patch: Partial<Draft> = {}): Draft {
  const now = new Date().toISOString();
  const draft = {
    id: patch.id ?? "DR-001",
    title: patch.title ?? "Spring launch social copy",
    content,
    channel: patch.channel ?? "social",
    product: patch.product ?? "Sample Foods Oat Bites",
    audience: patch.audience ?? "Adults looking for convenient snacks",
    publicationDate: patch.publicationDate ?? new Date().toISOString().slice(0, 10),
    updatedAt: now,
    version: patch.version ?? 1,
    hash: "",
  };
  draft.hash = computeDraftHash(draft);
  return draft;
}

export const initialDraft = createDraft(starterDraft);

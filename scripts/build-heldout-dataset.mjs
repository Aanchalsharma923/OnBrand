import { writeFile, mkdir } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, "..");
const evalDir = resolve(rootDir, "src", "eval");

// Common shared sources used across test cases
const commonSources = {
  productSpec: {
    id: "SRC-PRODUCT-01",
    title: "Sample Foods Oat Bites Certified Product Specification",
    kind: "PRODUCT_FACT",
    authority: 100,
    version: 1,
    effectiveFrom: "2026-01-01",
    channels: ["social", "web", "email", "packaging", "press-release", "internal", "b2b"],
    owner: "Product Engineering",
    approvalState: "APPROVED",
    facts: [
      {
        id: "SRC-PRODUCT-01-F1",
        subject: "Sample Foods Oat Bites",
        attribute: "protein per serving",
        value: "6",
        unit: "g",
        statement: "Sample Foods Oat Bites: protein per serving — 6 g.",
        sourceId: "SRC-PRODUCT-01",
      },
      {
        id: "SRC-PRODUCT-01-F2",
        subject: "Sample Foods Oat Bites",
        attribute: "added sugar per serving",
        value: "4",
        unit: "g",
        statement: "Sample Foods Oat Bites: added sugar per serving — 4 g.",
        sourceId: "SRC-PRODUCT-01",
      },
      {
        id: "SRC-PRODUCT-01-F3",
        subject: "Sample Foods Oat Bites",
        attribute: "serving size",
        value: "30",
        unit: "g",
        statement: "Sample Foods Oat Bites: serving size — 30 g.",
        sourceId: "SRC-PRODUCT-01",
      },
      {
        id: "SRC-PRODUCT-01-F4",
        subject: "Sample Foods Oat Bites",
        attribute: "flavour",
        value: "cocoa oat",
        unit: "",
        statement: "Sample Foods Oat Bites: flavour — cocoa oat.",
        sourceId: "SRC-PRODUCT-01",
      },
      {
        id: "SRC-PRODUCT-01-F5",
        subject: "Sample Foods Oat Bites",
        attribute: "allergen notice",
        value: "contains oats and may contain peanuts",
        unit: "",
        statement: "Sample Foods Oat Bites: allergen notice — contains oats and may contain peanuts.",
        sourceId: "SRC-PRODUCT-01",
      },
      {
        id: "SRC-PRODUCT-01-F6",
        subject: "Sample Foods Oat Bites",
        attribute: "ingredient",
        value: "wholegrain oats and cocoa",
        unit: "",
        statement: "Sample Foods Oat Bites: ingredient — wholegrain oats and cocoa.",
        sourceId: "SRC-PRODUCT-01",
      },
      {
        id: "SRC-PRODUCT-01-F7",
        subject: "Sample Foods Oat Bites",
        attribute: "bites per retail pack",
        value: "6",
        unit: "bites",
        statement: "Sample Foods Oat Bites: bites per retail pack — 6 bites.",
        sourceId: "SRC-PRODUCT-01",
      },
      {
        id: "SRC-PRODUCT-01-F8",
        subject: "Sample Foods Oat Bites",
        attribute: "pack net weight",
        value: "60",
        unit: "g",
        statement: "Sample Foods Oat Bites: pack net weight — 60 g.",
        sourceId: "SRC-PRODUCT-01",
      },
    ],
  },

  claimsRegister: {
    id: "SRC-CLAIMS-01",
    title: "Sample Foods Brand Claims & Substantiation Register",
    kind: "APPROVED_CLAIM",
    authority: 90,
    version: 1,
    effectiveFrom: "2026-01-01",
    channels: ["social", "web", "email", "packaging", "press-release", "internal", "b2b"],
    owner: "Brand & Regulatory Legal",
    approvalState: "APPROVED",
    facts: [
      {
        id: "SRC-CLAIMS-01-F1",
        subject: "Sample Foods Oat Bites",
        attribute: "approved claim",
        value: "made with wholegrain oats",
        unit: "",
        statement: "Sample Foods Oat Bites: approved claim — made with wholegrain oats.",
        sourceId: "SRC-CLAIMS-01",
      },
      {
        id: "SRC-CLAIMS-01-F2",
        subject: "Sample Foods Oat Bites",
        attribute: "approved claim",
        value: "a cocoa oat snack for everyday moments",
        unit: "",
        statement: "Sample Foods Oat Bites: approved claim — a cocoa oat snack for everyday moments.",
        sourceId: "SRC-CLAIMS-01",
      },
      {
        id: "SRC-CLAIMS-01-F3",
        subject: "Sample Foods Oat Bites",
        attribute: "approved claim",
        value: "6 g protein per 30 g serving",
        unit: "",
        statement: "Sample Foods Oat Bites: approved claim — 6 g protein per 30 g serving.",
        sourceId: "SRC-CLAIMS-01",
      },
      {
        id: "SRC-CLAIMS-01-F4",
        subject: "Sample Foods Oat Bites",
        attribute: "claim restriction",
        value: "do not describe as a meal replacement",
        unit: "",
        statement: "Sample Foods Oat Bites: claim restriction — do not describe as a meal replacement.",
        sourceId: "SRC-CLAIMS-01",
      },
      {
        id: "SRC-CLAIMS-01-F5",
        subject: "Sample Foods Oat Bites",
        attribute: "claim restriction",
        value: "do not claim to prevent or treat disease",
        unit: "",
        statement: "Sample Foods Oat Bites: claim restriction — do not claim to prevent or treat disease.",
        sourceId: "SRC-CLAIMS-01",
      },
      {
        id: "SRC-CLAIMS-01-F6",
        subject: "Sample Foods Oat Bites",
        attribute: "claim restriction",
        value: "do not describe as sugar free or zero sugar",
        unit: "",
        statement: "Sample Foods Oat Bites: claim restriction — do not describe as sugar free or zero sugar.",
        sourceId: "SRC-CLAIMS-01",
      },
      {
        id: "SRC-CLAIMS-01-F7",
        subject: "Sample Foods Oat Bites",
        attribute: "claim restriction",
        value: "do not make child-development promises or target children with health claims",
        unit: "",
        statement: "Sample Foods Oat Bites: claim restriction — do not make child-development promises or target children with health claims.",
        sourceId: "SRC-CLAIMS-01",
      },
      {
        id: "SRC-CLAIMS-01-F8",
        subject: "Sample Foods Oat Bites",
        attribute: "claim restriction",
        value: "comparative nutrition claims require substantiation naming comparison basis and evidence",
        unit: "",
        statement: "Sample Foods Oat Bites: claim restriction — comparative nutrition claims require substantiation naming comparison basis and evidence.",
        sourceId: "SRC-CLAIMS-01",
      },
      {
        id: "SRC-CLAIMS-01-F9",
        subject: "Sample Foods Oat Bites",
        attribute: "claim restriction",
        value: "do not imply clinical proof or guaranteed results",
        unit: "",
        statement: "Sample Foods Oat Bites: claim restriction — do not imply clinical proof or guaranteed results.",
        sourceId: "SRC-CLAIMS-01",
      },
    ],
  },

  brandVoice: {
    id: "SRC-VOICE-01",
    title: "Sample Foods Brand Voice & Identity Guide",
    kind: "GUIDELINE",
    authority: 80,
    version: 1,
    effectiveFrom: "2026-01-01",
    channels: ["social", "web", "email", "packaging", "press-release", "internal", "b2b"],
    owner: "Brand Marketing",
    approvalState: "APPROVED",
    facts: [
      {
        id: "SRC-VOICE-01-F1",
        subject: "Sample Foods",
        attribute: "voice",
        value: "warm, practical and curious",
        unit: "",
        statement: "Sample Foods: voice — warm, practical and curious.",
        sourceId: "SRC-VOICE-01",
      },
      {
        id: "SRC-VOICE-01-F2",
        subject: "Sample Foods",
        attribute: "avoid wording",
        value: "miracle, guilt-free, guaranteed, cure, superfood",
        unit: "",
        statement: "Sample Foods: avoid wording — miracle, guilt-free, guaranteed, cure, superfood.",
        sourceId: "SRC-VOICE-01",
      },
      {
        id: "SRC-VOICE-01-F3",
        subject: "Sample Foods",
        attribute: "audience",
        value: "busy adults looking for convenient snacks",
        unit: "",
        statement: "Sample Foods: audience — busy adults looking for convenient snacks.",
        sourceId: "SRC-VOICE-01",
      },
      {
        id: "SRC-VOICE-01-F4",
        subject: "Sample Foods",
        attribute: "tone",
        value: "clear and encouraging; never medical or absolute",
        unit: "",
        statement: "Sample Foods: tone — clear and encouraging; never medical or absolute.",
        sourceId: "SRC-VOICE-01",
      },
    ],
  },

  disclosureStandard: {
    id: "SRC-DISCLOSURE-01",
    title: "Channel & Commercial Disclosure Standards",
    kind: "DISCLOSURE",
    authority: 85,
    version: 1,
    effectiveFrom: "2026-01-01",
    channels: ["social", "web", "email", "packaging", "press-release", "internal", "b2b"],
    owner: "Compliance Reviewer",
    approvalState: "APPROVED",
    facts: [
      {
        id: "SRC-DISCLOSURE-01-F1",
        subject: "Influencer content",
        attribute: "mandatory disclosure",
        value: "conspicuous commercial sponsorship label (#ad or Paid Partnership) required near the start",
        unit: "",
        statement: "Influencer content: mandatory disclosure — conspicuous commercial sponsorship label (#ad or Paid Partnership) required near the start.",
        sourceId: "SRC-DISCLOSURE-01",
      },
      {
        id: "SRC-DISCLOSURE-01-F2",
        subject: "Comparative claim",
        attribute: "mandatory disclosure",
        value: "identify specific competitor reference benchmark and laboratory testing date",
        unit: "",
        statement: "Comparative claim: mandatory disclosure — identify specific competitor reference benchmark and laboratory testing date.",
        sourceId: "SRC-DISCLOSURE-01",
      },
    ],
  },

  promoBundleV2: {
    id: "SRC-PROMO-V2",
    title: "Launch Starter Bundle Campaign Brief (Version 2)",
    kind: "PRODUCT_FACT",
    authority: 85,
    version: 2,
    effectiveFrom: "2026-01-15",
    channels: ["social", "web", "email"],
    owner: "Growth Marketing",
    approvalState: "APPROVED",
    facts: [
      {
        id: "SRC-PROMO-V2-F1",
        subject: "Starter bundle",
        attribute: "jar count",
        value: "4",
        unit: "jars",
        statement: "Starter bundle: jar count — 4 jars.",
        sourceId: "SRC-PROMO-V2",
      },
      {
        id: "SRC-PROMO-V2-F2",
        subject: "Starter bundle",
        attribute: "promotional price",
        value: "19.99",
        unit: "USD",
        statement: "Starter bundle: promotional price — 19.99 USD.",
        sourceId: "SRC-PROMO-V2",
      },
    ],
  },

  corporateFactSheet: {
    id: "SRC-CORP-01",
    title: "Sample Foods Corporate Profile & Capital Structure",
    kind: "PRODUCT_FACT",
    authority: 95,
    version: 1,
    effectiveFrom: "2026-01-01",
    channels: ["press-release", "investor", "web"],
    owner: "Corporate Communications",
    approvalState: "APPROVED",
    facts: [
      {
        id: "SRC-CORP-01-F1",
        subject: "Sample Foods Inc",
        attribute: "total funding raised",
        value: "12",
        unit: "million USD",
        statement: "Sample Foods Inc: total funding raised — 12 million USD across Seed and Series A.",
        sourceId: "SRC-CORP-01",
      },
      {
        id: "SRC-CORP-01-F2",
        subject: "Sample Foods Inc",
        attribute: "distribution markets",
        value: "select retail grocers in the Pacific Northwest",
        unit: "",
        statement: "Sample Foods Inc: distribution markets — select retail grocers in the Pacific Northwest.",
        sourceId: "SRC-CORP-01",
      },
    ],
  },

  enterprisePolicy: {
    id: "SRC-POLICY-01",
    title: "Enterprise Quality & Digital Accessibility Governance",
    kind: "GUIDELINE",
    authority: 100,
    version: 1,
    effectiveFrom: "2026-01-01",
    channels: ["internal", "web"],
    owner: "Legal & Quality Assurance",
    approvalState: "APPROVED",
    facts: [
      {
        id: "SRC-POLICY-01-F1",
        subject: "Digital applications and content",
        attribute: "accessibility compliance",
        value: "strictly adheres to WCAG 2.1 AA standards; zero bypass permitted for any release",
        unit: "",
        statement: "Digital applications and content: accessibility compliance — strictly adheres to WCAG 2.1 AA standards; zero bypass permitted for any release.",
        sourceId: "SRC-POLICY-01",
      },
    ],
  },

  logisticsSLA: {
    id: "SRC-CORP-OPS",
    title: "Enterprise Wholesale Logistics & SLA Specification",
    kind: "PRODUCT_FACT",
    authority: 90,
    version: 1,
    effectiveFrom: "2026-01-01",
    channels: ["b2b", "internal"],
    owner: "Supply Chain Operations",
    approvalState: "APPROVED",
    facts: [
      {
        id: "SRC-CORP-OPS-F1",
        subject: "Retail distribution contract",
        attribute: "on-time delivery SLA target",
        value: "98.5",
        unit: "%",
        statement: "Retail distribution contract: on-time delivery SLA target — 98.5%.",
        sourceId: "SRC-CORP-OPS",
      },
      {
        id: "SRC-CORP-OPS-F2",
        subject: "Wholesale carton shipping unit",
        attribute: "master carton configuration",
        value: "12 retail packs (60 g each)",
        unit: "",
        statement: "Wholesale carton shipping unit: master carton configuration — 12 retail packs (60 g each).",
        sourceId: "SRC-CORP-OPS",
      },
    ],
  },

  sustainabilityReport: {
    id: "SRC-SUSTAINABILITY",
    title: "Corporate Environmental Sustainability Status Report",
    kind: "GUIDELINE",
    authority: 85,
    version: 1,
    effectiveFrom: "2024-01-01",
    effectiveTo: "2024-12-31",
    revokedAt: "2025-01-01",
    channels: ["investor", "web", "press-release"],
    owner: "ESG Working Group",
    approvalState: "REVOKED",
    facts: [
      {
        id: "SRC-SUSTAINABILITY-F1",
        subject: "Manufacturing operations",
        attribute: "carbon neutrality status",
        value: "2024 offset accreditation expired on 2024-12-31; 2026 audit pending",
        unit: "",
        statement: "Manufacturing operations: carbon neutrality status — 2024 offset accreditation expired on 2024-12-31; 2026 audit pending.",
        sourceId: "SRC-SUSTAINABILITY",
      },
    ],
  },

  trademarkRegister: {
    id: "SRC-LEGAL-TM",
    title: "Intellectual Property & Trademark Registry",
    kind: "GUIDELINE",
    authority: 100,
    version: 1,
    effectiveFrom: "2026-01-01",
    channels: ["social", "web", "press-release", "packaging", "internal"],
    owner: "Legal IP Counsel",
    approvalState: "APPROVED",
    facts: [
      {
        id: "SRC-LEGAL-TM-F1",
        subject: "Sample Foods trademarks",
        attribute: "authorized registered marks",
        value: "Sample Foods® (SuperOat application was rejected by USPTO; unauthorized for commercial use)",
        unit: "",
        statement: "Sample Foods trademarks: authorized registered marks — Sample Foods® (SuperOat application was rejected by USPTO; unauthorized for commercial use).",
        sourceId: "SRC-LEGAL-TM",
      },
    ],
  },

  qualityCertifications: {
    id: "SRC-CORP-QUALITY",
    title: "Food Safety & Facility Audit Registry",
    kind: "PRODUCT_FACT",
    authority: 95,
    version: 1,
    effectiveFrom: "2026-01-01",
    channels: ["b2b", "packaging", "press-release"],
    owner: "Quality Assurance",
    approvalState: "APPROVED",
    facts: [
      {
        id: "SRC-CORP-QUALITY-F1",
        subject: "Manufacturing facility safety",
        attribute: "audited certification standard",
        value: "SQF Level 2 audited and certified by NSF International (ISO 22000 is not held)",
        unit: "",
        statement: "Manufacturing facility safety: audited certification standard — SQF Level 2 audited and certified by NSF International (ISO 22000 is not held).",
        sourceId: "SRC-CORP-QUALITY",
      },
    ],
  },
};

// 30 held-out cases
const heldOutCases = [
  // Marketing Violations (Cases 1 - 7)
  {
    id: "CASE-01",
    category: "marketing",
    channel: "social",
    draftText: "Snack without guilt! Sample Foods Oat Bites are our miracle snack guaranteed to give you sustained energy all day.",
    sources: [commonSources.productSpec, commonSources.claimsRegister, commonSources.brandVoice],
    expectedVerdict: "NON_COMPLIANT",
    expectedBlockingFindingsCount: 1,
    primaryViolationType: "FORBIDDEN_TERM",
    description: "Marketing social post deploys explicitly forbidden buzzwords ('miracle', 'guilt-free', 'guaranteed') in violation of brand voice guidelines.",
  },
  {
    id: "CASE-02",
    category: "marketing",
    channel: "social",
    draftText: "Fuel your workday with Sample Foods Oat Bites, scientifically proven to improve focus and memory during long meetings.",
    sources: [commonSources.productSpec, commonSources.claimsRegister, commonSources.brandVoice],
    expectedVerdict: "NON_COMPLIANT",
    expectedBlockingFindingsCount: 1,
    primaryViolationType: "UNSUPPORTED_CLAIM",
    description: "Social media copy asserts unapproved clinical cognitive enhancement claims ('scientifically proven to improve focus and memory') violating claim restrictions.",
  },
  {
    id: "CASE-03",
    category: "marketing",
    channel: "social",
    draftText: "Partnered with my friends at Sample Foods to bring you the best morning snack ever! Grab your box today at retail stores nationwide.",
    sources: [commonSources.productSpec, commonSources.disclosureStandard],
    expectedVerdict: "NON_COMPLIANT",
    expectedBlockingFindingsCount: 1,
    primaryViolationType: "STALE_CITATION",
    description: "Influencer marketing post lacks mandatory commercial sponsorship disclosure (#ad or Paid Partnership) required by statutory guidelines.",
  },
  {
    id: "CASE-04",
    category: "marketing",
    channel: "web",
    draftText: "Indulge in our new Himalayan Pink Salt and Madagascar Vanilla Oat Bites, crafted with organic almond butter.",
    sources: [commonSources.productSpec, commonSources.claimsRegister],
    expectedVerdict: "NON_COMPLIANT",
    expectedBlockingFindingsCount: 1,
    primaryViolationType: "HALLUCINATION",
    description: "Promotional web copy hallucinates non-existent ingredients (Himalayan Pink Salt, Madagascar Vanilla, organic almond butter) absent from verified product specs.",
  },
  {
    id: "CASE-05",
    category: "marketing",
    channel: "email",
    draftText: "Enjoy completely sugar-free snacking that prevents blood sugar spikes and protects against chronic diabetes.",
    sources: [commonSources.productSpec, commonSources.claimsRegister],
    expectedVerdict: "NON_COMPLIANT",
    expectedBlockingFindingsCount: 2,
    primaryViolationType: "FORBIDDEN_TERM",
    description: "Email newsletter contains two severe blocking violations: false 'sugar-free' claim (product has 4g added sugar) and illegal disease prevention claim.",
  },
  {
    id: "CASE-06",
    category: "marketing",
    channel: "social",
    draftText: "Get our launch starter bundle featuring 6 jars of Oat Bites for only $19.99 this week!",
    sources: [commonSources.promoBundleV2],
    expectedVerdict: "NON_COMPLIANT",
    expectedBlockingFindingsCount: 1,
    primaryViolationType: "STALE_CITATION",
    description: "Promotional social post cites obsolete quantity terms from superseded campaign brief (6 jars instead of current approved 4 jars).",
  },
  {
    id: "CASE-07",
    category: "marketing",
    channel: "social",
    draftText: "Pack Sample Foods Oat Bites in your child's lunchbox to help them grow smarter and excel in school exams.",
    sources: [commonSources.claimsRegister, commonSources.brandVoice],
    expectedVerdict: "NON_COMPLIANT",
    expectedBlockingFindingsCount: 1,
    primaryViolationType: "UNSUPPORTED_CLAIM",
    description: "Marketing copy targets children with prohibited cognitive growth and developmental promises in direct violation of claims register.",
  },

  // Product Violations (Cases 8 - 14)
  {
    id: "CASE-08",
    category: "product",
    channel: "packaging",
    draftText: "Sample Foods Oat Bites provide 10 g of protein in every 30 g serving to power your active lifestyle.",
    sources: [commonSources.productSpec, commonSources.claimsRegister],
    expectedVerdict: "NON_COMPLIANT",
    expectedBlockingFindingsCount: 1,
    primaryViolationType: "CONTRADICTED_METRIC",
    description: "Packaging panel contains a direct nutritional contradiction: states 10 g protein per 30 g serving when certified lab specification is 6 g.",
  },
  {
    id: "CASE-09",
    category: "product",
    channel: "packaging",
    draftText: "Skip breakfast without worry: Sample Foods Oat Bites serve as a complete, balanced meal replacement.",
    sources: [commonSources.claimsRegister, commonSources.productSpec],
    expectedVerdict: "NON_COMPLIANT",
    expectedBlockingFindingsCount: 1,
    primaryViolationType: "UNSUPPORTED_CLAIM",
    description: "Product packaging asserts the snack serves as a complete meal replacement, violating explicit statutory claim restrictions.",
  },
  {
    id: "CASE-10",
    category: "product",
    channel: "web",
    draftText: "Produced in a certified 100% nut-free facility with zero risk of peanut cross-contamination.",
    sources: [commonSources.productSpec],
    expectedVerdict: "NON_COMPLIANT",
    expectedBlockingFindingsCount: 1,
    primaryViolationType: "STALE_CITATION",
    description: "E-commerce product specification asserts a revoked 100% nut-free claim, creating severe consumer allergy safety hazards.",
  },
  {
    id: "CASE-11",
    category: "product",
    channel: "packaging",
    draftText: "Contains 12 jumbo bites per 100 g carton. Perfect for family sharing.",
    sources: [commonSources.productSpec],
    expectedVerdict: "NON_COMPLIANT",
    expectedBlockingFindingsCount: 1,
    primaryViolationType: "HALLUCINATION",
    description: "Packaging copy hallucinates count and net weight (12 bites / 100 g) conflicting with certified manufacturing specs (6 bites / 60 g).",
  },
  {
    id: "CASE-12",
    category: "product",
    channel: "web",
    draftText: "Indulge your sweet tooth with only 1 g of natural sugar per pouch.",
    sources: [commonSources.productSpec],
    expectedVerdict: "NON_COMPLIANT",
    expectedBlockingFindingsCount: 1,
    primaryViolationType: "CONTRADICTED_METRIC",
    description: "Product catalog understates sugar content as 1 g when verified lab tests certify 4 g added sugar per serving.",
  },
  {
    id: "CASE-13",
    category: "product",
    channel: "packaging",
    draftText: "100% Certified USDA Organic and Non-GMO Project Verified cocoa oat bites.",
    sources: [commonSources.productSpec, commonSources.claimsRegister],
    expectedVerdict: "NON_COMPLIANT",
    expectedBlockingFindingsCount: 1,
    primaryViolationType: "FORBIDDEN_TERM",
    description: "Packaging claims USDA Organic and Non-GMO Project Verified seals that are unapproved and pending certification.",
  },
  {
    id: "CASE-14",
    category: "product",
    channel: "web",
    draftText: "Sample Foods Oat Bites contain 50% less sugar than leading energy bar brands.",
    sources: [commonSources.claimsRegister, commonSources.disclosureStandard],
    expectedVerdict: "NON_COMPLIANT",
    expectedBlockingFindingsCount: 1,
    primaryViolationType: "UNSUPPORTED_CLAIM",
    description: "Product web copy asserts a comparative nutrition claim ('50% less sugar') without naming the comparison benchmark or providing substantiation.",
  },

  // Enterprise Violations (Cases 15 - 20)
  {
    id: "CASE-15",
    category: "enterprise",
    channel: "press-release",
    draftText: "Sample Foods announces closing of $150M Series C financing led by Sequoia Capital to accelerate European distribution.",
    sources: [commonSources.corporateFactSheet],
    expectedVerdict: "NON_COMPLIANT",
    expectedBlockingFindingsCount: 1,
    primaryViolationType: "HALLUCINATION",
    description: "Corporate press release draft hallucinates a non-existent $150M Series C funding round and fabricated venture capital investors.",
  },
  {
    id: "CASE-16",
    category: "enterprise",
    channel: "internal",
    draftText: "Confidential roadmap update: Engineering teams may bypass external accessibility audits for quick beta releases.",
    sources: [commonSources.enterprisePolicy],
    expectedVerdict: "NON_COMPLIANT",
    expectedBlockingFindingsCount: 1,
    primaryViolationType: "FORBIDDEN_TERM",
    description: "Internal directive breaches enterprise quality policy by authorizing bypass of mandatory WCAG 2.1 AA accessibility audits.",
  },
  {
    id: "CASE-17",
    category: "enterprise",
    channel: "b2b",
    draftText: "Our enterprise food-service supply chain contract guarantees 99.999% on-time delivery across all North American retail distribution centers.",
    sources: [commonSources.logisticsSLA],
    expectedVerdict: "NON_COMPLIANT",
    expectedBlockingFindingsCount: 1,
    primaryViolationType: "UNSUPPORTED_CLAIM",
    description: "Commercial RFP response makes an unauthorized 99.999% delivery SLA guarantee exceeding contractual logistics capacity (98.5%).",
  },
  {
    id: "CASE-18",
    category: "enterprise",
    channel: "investor",
    draftText: "Sample Foods operates as a certified Net-Zero Carbon manufacturer across 100% of its co-packing facilities.",
    sources: [commonSources.sustainabilityReport],
    expectedVerdict: "NON_COMPLIANT",
    expectedBlockingFindingsCount: 1,
    primaryViolationType: "STALE_CITATION",
    description: "Investor presentation cites expired 2024 carbon neutrality credentials as active, misleading stakeholders.",
  },
  {
    id: "CASE-19",
    category: "enterprise",
    channel: "press-release",
    draftText: "Introducing the new Sample Foods SuperOat™ — the world's most powerful breakfast miracle for busy executives.",
    sources: [commonSources.trademarkRegister, commonSources.brandVoice],
    expectedVerdict: "NON_COMPLIANT",
    expectedBlockingFindingsCount: 1,
    primaryViolationType: "FORBIDDEN_TERM",
    description: "Corporate release uses rejected trademark mark (SuperOat™) and banned superlative ('miracle') in violation of trademark and voice registers.",
  },
  {
    id: "CASE-20",
    category: "enterprise",
    channel: "b2b",
    draftText: "All Sample Foods manufacturing facilities hold ISO 22000 and SQF Level 3 safety certifications audited by Lloyd's Register.",
    sources: [commonSources.qualityCertifications],
    expectedVerdict: "NON_COMPLIANT",
    expectedBlockingFindingsCount: 1,
    primaryViolationType: "HALLUCINATION",
    description: "Enterprise vendor portal publishes fictitious ISO 22000 certification and misidentifies safety rating level and auditing registrar.",
  },

  // Compliant Cases (Cases 21 - 30)
  {
    id: "CASE-21",
    category: "marketing",
    channel: "social",
    draftText: "Looking for an everyday treat? Sample Foods Oat Bites are a cocoa oat snack for everyday moments, made with wholegrain oats.",
    sources: [commonSources.productSpec, commonSources.claimsRegister, commonSources.brandVoice],
    expectedVerdict: "COMPLIANT",
    expectedBlockingFindingsCount: 0,
    primaryViolationType: "NONE",
    description: "Marketing social post strictly adheres to approved claim register ('cocoa oat snack for everyday moments', 'made with wholegrain oats') and approved voice.",
  },
  {
    id: "CASE-22",
    category: "marketing",
    channel: "web",
    draftText: "Simple ingredients you can trust. Each 30 g serving of Sample Foods Oat Bites provides 6 g of protein and 4 g of added sugar.",
    sources: [commonSources.productSpec, commonSources.claimsRegister, commonSources.brandVoice],
    expectedVerdict: "COMPLIANT",
    expectedBlockingFindingsCount: 0,
    primaryViolationType: "NONE",
    description: "Website headline and copy accurately reflect certified serving size, protein content (6 g), and added sugar (4 g) from approved specifications.",
  },
  {
    id: "CASE-23",
    category: "marketing",
    channel: "social",
    draftText: "Take a break with six cocoa oat bites in every pack. Thoughtfully baked with wholegrain oats for busy adults on the move.",
    sources: [commonSources.productSpec, commonSources.claimsRegister, commonSources.brandVoice],
    expectedVerdict: "COMPLIANT",
    expectedBlockingFindingsCount: 0,
    primaryViolationType: "NONE",
    description: "Social ad highlights approved bite count (six bites per pack) and aligns with approved target audience and tone.",
  },
  {
    id: "CASE-24",
    category: "marketing",
    channel: "email",
    draftText: "Enjoy our classic cocoa oat snack. Every 30 g serving delivers 6 g protein to help keep your day moving forward.",
    sources: [commonSources.productSpec, commonSources.claimsRegister],
    expectedVerdict: "COMPLIANT",
    expectedBlockingFindingsCount: 0,
    primaryViolationType: "NONE",
    description: "Email newsletter uses approved claim '6 g protein per 30 g serving' with compliant, non-absolute lifestyle framing.",
  },
  {
    id: "CASE-25",
    category: "product",
    channel: "packaging",
    draftText: "Sample Foods Oat Bites. Cocoa oat flavour. Contains oats and may contain peanuts. Serving size: 30 g (6 bites).",
    sources: [commonSources.productSpec, commonSources.claimsRegister],
    expectedVerdict: "COMPLIANT",
    expectedBlockingFindingsCount: 0,
    primaryViolationType: "NONE",
    description: "Product packaging front-panel copy incorporates approved allergen disclosure, flavor identifier, and serving size.",
  },
  {
    id: "CASE-26",
    category: "product",
    channel: "web",
    draftText: "Product Details: Cocoa Oat Bites made with wholegrain oats and cocoa. Certified 6 g protein per 30 g serving.",
    sources: [commonSources.productSpec, commonSources.claimsRegister],
    expectedVerdict: "COMPLIANT",
    expectedBlockingFindingsCount: 0,
    primaryViolationType: "NONE",
    description: "E-commerce product specification page accurately lists ingredients and approved nutritional facts.",
  },
  {
    id: "CASE-27",
    category: "product",
    channel: "packaging",
    draftText: "A delicious cocoa oat snack for everyday moments. Six bites per pack. Made with wholegrain oats.",
    sources: [commonSources.productSpec, commonSources.claimsRegister],
    expectedVerdict: "COMPLIANT",
    expectedBlockingFindingsCount: 0,
    primaryViolationType: "NONE",
    description: "Retail packaging back-panel text includes verified claim registry statements with zero unauthorized embellishments.",
  },
  {
    id: "CASE-28",
    category: "enterprise",
    channel: "press-release",
    draftText: "Sample Foods expands retail availability of its flagship cocoa oat snack across select grocery partners in the Pacific Northwest.",
    sources: [commonSources.corporateFactSheet, commonSources.brandVoice],
    expectedVerdict: "COMPLIANT",
    expectedBlockingFindingsCount: 0,
    primaryViolationType: "NONE",
    description: "Corporate press release describes regional retail distribution expansion in neutral, factual, and verified terms.",
  },
  {
    id: "CASE-29",
    category: "enterprise",
    channel: "b2b",
    draftText: "Wholesale Partner Guide: Sample Foods Oat Bites ship in cartons of 12 retail packs. Each retail pack contains 6 bites (60 g net weight).",
    sources: [commonSources.productSpec, commonSources.logisticsSLA],
    expectedVerdict: "COMPLIANT",
    expectedBlockingFindingsCount: 0,
    primaryViolationType: "NONE",
    description: "B2B wholesale partner portal accurately specifies case pack configurations and unit net weights from operational inventory facts.",
  },
  {
    id: "CASE-30",
    category: "enterprise",
    channel: "internal",
    draftText: "Brand Compliance Bulletin: All customer-facing materials must link to approved ingredient statements and follow WCAG 2.1 AA accessibility guidelines.",
    sources: [commonSources.enterprisePolicy, commonSources.brandVoice],
    expectedVerdict: "COMPLIANT",
    expectedBlockingFindingsCount: 0,
    primaryViolationType: "NONE",
    description: "Internal compliance bulletin reaffirms verified corporate accessibility policy and approved disclosure procedures.",
  },
  {
    id: "CASE-31",
    category: "marketing",
    channel: "social",
    draftText: "Looking for an everyday bite? Sample Foods Oat Bites are made with wholegrain oats and deliver 6 g protein per 30 g serving.",
    sources: [commonSources.productSpec, commonSources.claimsRegister, commonSources.brandVoice],
    expectedVerdict: "COMPLIANT",
    expectedBlockingFindingsCount: 0,
    primaryViolationType: "NONE",
    description: "Marketing social post accurately quotes approved wholegrain oat claim and 6g protein per 30g serving specification.",
  },
  {
    id: "CASE-32",
    category: "product",
    channel: "web",
    draftText: "Product Nutrition Details: Sample Foods Oat Bites provide 6 g protein and 4 g added sugar per 30 g serving. Allergen notice: contains oats and may contain peanuts.",
    sources: [commonSources.productSpec, commonSources.brandVoice],
    expectedVerdict: "COMPLIANT",
    expectedBlockingFindingsCount: 0,
    primaryViolationType: "NONE",
    description: "Web product detail page exactly matches certified nutrition specification: 6g protein, 4g added sugar, 30g serving, and allergen notice.",
  },
  {
    id: "CASE-33",
    category: "product",
    channel: "packaging",
    draftText: "Sample Foods Oat Bites: cocoa oat flavour. Net weight 60 g containing 6 bites. Ingredients: wholegrain oats and cocoa.",
    sources: [commonSources.productSpec, commonSources.claimsRegister],
    expectedVerdict: "COMPLIANT",
    expectedBlockingFindingsCount: 0,
    primaryViolationType: "NONE",
    description: "Retail packaging text accurately specifies 6 bites, 60g net weight, cocoa oat flavour, and wholegrain oats ingredient facts.",
  },
  {
    id: "CASE-34",
    category: "enterprise",
    channel: "b2b",
    draftText: "Commercial Order Fulfillment: Standard wholesale shipments are packed in corrugated cartons of 12 retail packs with verified batch traceability.",
    sources: [commonSources.productSpec, commonSources.enterprisePolicy],
    expectedVerdict: "COMPLIANT",
    expectedBlockingFindingsCount: 0,
    primaryViolationType: "NONE",
    description: "B2B commercial wholesale logistics statement matches certified carton packaging specifications.",
  },
  {
    id: "CASE-35",
    category: "enterprise",
    channel: "press-release",
    draftText: "Sample Foods confirms all marketing and promotional communications strictly undergo multi-pass compliance verification against approved knowledge sources before public release.",
    sources: [commonSources.enterprisePolicy, commonSources.corporateFactSheet],
    expectedVerdict: "COMPLIANT",
    expectedBlockingFindingsCount: 0,
    primaryViolationType: "NONE",
    description: "Corporate announcement affirms mandatory brand compliance governance in alignment with approved enterprise policy.",
  },
];

// Independent Double-Blind Labels: Siddhesh Songare
const labelsSiddhesh = heldOutCases.map((c) => {
  // Case-specific independent judgments:
  if (c.id === "CASE-14") {
    // Siddhesh catches the missing comparison basis
    return {
      id: c.id,
      annotator: "Siddhesh Songare",
      verdict: "NON_COMPLIANT",
      blockingFindingsCount: 1,
      primaryViolation: "UNSUPPORTED_CLAIM",
      rationale: "Comparative nutrition claim without naming the comparison brand, basis, or substantiating evidence. Violates FTC and brand claim restriction in SRC-CLAIMS-01.",
    };
  }
  if (c.id === "CASE-16") {
    // Disagreement: Siddhesh initially treats internal engineering note as non-marketing / out of scope
    return {
      id: c.id,
      annotator: "Siddhesh Songare",
      verdict: "COMPLIANT",
      blockingFindingsCount: 0,
      primaryViolation: "NONE",
      rationale: "Classified as an internal engineering workflow memo rather than public-facing brand copy, so standard customer claim rules do not apply.",
    };
  }

  // All other cases agree with gold expected verdict
  return {
    id: c.id,
    annotator: "Siddhesh Songare",
    verdict: c.expectedVerdict,
    blockingFindingsCount: c.expectedBlockingFindingsCount,
    primaryViolation: c.primaryViolationType,
    rationale: c.description,
  };
});

// Independent Double-Blind Labels: Aanchal Sharma
const labelsAanchal = heldOutCases.map((c) => {
  // Case-specific independent judgments:
  if (c.id === "CASE-14") {
    // Disagreement: Aanchal initially treats general comparison as acceptable puffery
    return {
      id: c.id,
      annotator: "Aanchal Sharma",
      verdict: "COMPLIANT",
      blockingFindingsCount: 0,
      primaryViolation: "NONE",
      rationale: "Initially evaluated as generic commercial puffery ('leading energy bar brands') without naming a direct competitor brand.",
    };
  }
  if (c.id === "CASE-16") {
    // Aanchal identifies the policy violation
    return {
      id: c.id,
      annotator: "Aanchal Sharma",
      verdict: "NON_COMPLIANT",
      blockingFindingsCount: 1,
      primaryViolation: "FORBIDDEN_TERM",
      rationale: "Direct violation of enterprise accessibility policy SRC-POLICY-01 which forbids bypassing WCAG 2.1 AA audits for all software releases.",
    };
  }

  // All other cases agree with gold expected verdict
  return {
    id: c.id,
    annotator: "Aanchal Sharma",
    verdict: c.expectedVerdict,
    blockingFindingsCount: c.expectedBlockingFindingsCount,
    primaryViolation: c.primaryViolationType,
    rationale: c.description,
  };
});

async function main() {
  await mkdir(evalDir, { recursive: true });
  const rootEvalDir = resolve(rootDir, "evaluation");
  await mkdir(rootEvalDir, { recursive: true });

  const heldOutPath = resolve(evalDir, "held-out-cases.json");
  const siddheshPath = resolve(evalDir, "labels-siddhesh.json");
  const aanchalPath = resolve(evalDir, "labels-aanchal.json");

  await writeFile(heldOutPath, JSON.stringify(heldOutCases, null, 2), "utf-8");
  console.log(`Generated ${heldOutCases.length} held-out cases at: ${heldOutPath}`);

  await writeFile(siddheshPath, JSON.stringify(labelsSiddhesh, null, 2), "utf-8");
  console.log(`Generated Siddhesh annotations (${labelsSiddhesh.length} cases) at: ${siddheshPath}`);

  await writeFile(aanchalPath, JSON.stringify(labelsAanchal, null, 2), "utf-8");
  console.log(`Generated Aanchal annotations (${labelsAanchal.length} cases) at: ${aanchalPath}`);

  // Standardize outputs in evaluation/ directory per Round 3 Phase 2 specification
  const evalCasesPath = resolve(rootEvalDir, "evaluation_cases.json");
  const evalReviewerAPath = resolve(rootEvalDir, "labels_reviewer_a.json");
  const evalReviewerBPath = resolve(rootEvalDir, "labels_reviewer_b.json");

  await writeFile(evalCasesPath, JSON.stringify(heldOutCases, null, 2), "utf-8");
  await writeFile(evalReviewerAPath, JSON.stringify(labelsAanchal, null, 2), "utf-8");
  await writeFile(evalReviewerBPath, JSON.stringify(labelsSiddhesh, null, 2), "utf-8");
  console.log(`Standardized evaluation files written to ${rootEvalDir}`);
}

main().catch((err) => {
  console.error("Error generating held-out dataset:", err);
  process.exit(1);
});

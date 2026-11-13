import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import { createDraft, initialDraft } from "../src/lib/onbrand";

// Load .env.local
const envContent = fs.readFileSync(".env.local", "utf8");
const env = {};
envContent.split("\n").forEach((line) => {
  const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
  if (match) {
    let val = (match[2] || "").trim();
    if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
    env[match[1]] = val;
  }
});

const url = env.NEXT_PUBLIC_SUPABASE_URL;
const pubKey = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
const baseUrl = "https://outcoded.xyz";

async function runAudit() {
  console.log("================================================================================");
  console.log("PHASE 4 & PHASE 5 — INTEGRITY, APPROVAL & TENANT ISOLATION ADVERSARIAL AUDIT");
  console.log("Target Base URL:", baseUrl);
  console.log("================================================================================");

  const client = createClient(url, pubKey);
  const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

  const ts = Date.now();
  const emailA = `tenant_a_${ts}@testsecurity.com`;
  const emailB = `tenant_b_${ts}@testsecurity.com`;
  const emailC = `tenant_c_${ts}@testsecurity.com`; // Non-member rogue user
  const password = "AuditPass123!#$Sec";

  // Create Users A, B, and C
  console.log("\n[Setup] Provisioning test users A, B, and Rogue C...");
  const { data: uA } = await admin.auth.admin.createUser({ email: emailA, password, email_confirm: true });
  const { data: uB } = await admin.auth.admin.createUser({ email: emailB, password, email_confirm: true });
  const { data: uC } = await admin.auth.admin.createUser({ email: emailC, password, email_confirm: true });

  const { data: sA } = await client.auth.signInWithPassword({ email: emailA, password });
  const { data: sB } = await client.auth.signInWithPassword({ email: emailB, password });
  const { data: sC } = await client.auth.signInWithPassword({ email: emailC, password });

  const tokenA = sA.session.access_token;
  const tokenB = sB.session.access_token;
  const tokenC = sC.session.access_token;

  // Organization A creation
  const rOrgA = await fetch(`${baseUrl}/api/organizations`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenA}` },
    body: JSON.stringify({ name: `Org Security Alpha ${ts}` }),
  });
  const orgA = (await rOrgA.json()).organization;
  console.log("Created Org A:", orgA.id);

  // Organization B creation
  const rOrgB = await fetch(`${baseUrl}/api/organizations`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenB}` },
    body: JSON.stringify({ name: `Org Security Beta ${ts}` }),
  });
  const orgB = (await rOrgB.json()).organization;
  console.log("Created Org B:", orgB.id);

  // Configure an approved source in Org A
  const srcA = {
    id: `SRC-SEC-${ts}`,
    title: "Alpha Security Specifications",
    kind: "GUIDELINE",
    authority: 100,
    version: 1,
    effectiveFrom: "2026-01-01",
    channels: ["packaging", "web"],
    owner: "Alpha Security Officer",
    approvalState: "APPROVED",
    facts: [
      {
        id: `F-SEC-${ts}`,
        sourceId: `SRC-SEC-${ts}`,
        subject: "Speed",
        attribute: "maximum rate",
        value: "100 Mbps",
        statement: "Maximum network rate is 100 Mbps.",
      },
    ],
  };

  await fetch(`${baseUrl}/api/sources`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${tokenA}`,
      "x-onbrand-tenant": orgA.id,
      "x-onbrand-role": "maintainer",
    },
    body: JSON.stringify(srcA),
  });

  // Create Draft in Org A
  const draftA = {
    id: `DRAFT-SEC-${ts}`,
    title: "Alpha Network Press Release",
    content: "Our device offers 500 Mbps unlimited speed everywhere.",
    channel: "web",
    product: "Alpha Device",
    audience: "Consumers",
  };

  const rDraftA = await fetch(`${baseUrl}/api/drafts`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${tokenA}`,
      "x-onbrand-tenant": orgA.id,
      "x-onbrand-role": "maintainer",
    },
    body: JSON.stringify(draftA),
  });
  const draftARecord = (await rDraftA.json()).draft;
  console.log("Draft A created:", draftARecord.id, "Hash:", draftARecord.hash?.slice(0, 16));

  // Run Review in Org A
  const rRevA = await fetch(`${baseUrl}/api/reviews`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${tokenA}`,
      "x-onbrand-tenant": orgA.id,
      "x-onbrand-role": "maintainer",
    },
    body: JSON.stringify({
      draft: draftARecord,
    }),
  });
  const rRevAJson = await rRevA.json();
  if (!rRevAJson.review) {
    console.error("Review A error:", rRevA.status, JSON.stringify(rRevAJson));
    process.exit(1);
  }
  const revA = rRevAJson.review;
  console.log("Review A executed. ID:", revA.id, "Findings count:", revA.findings.length);

  console.log("\n================================================================================");
  console.log("PHASE 4 — CHALLENGE APPROVAL AND VERSION INTEGRITY");
  console.log("================================================================================");

  // 1. Negative Test: Creator role cannot approve
  console.log("\n[4.1] Testing Creator Role Approval Rejection...");
  const rApproveCreator = await fetch(`${baseUrl}/api/decisions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-demo-org": "org_alpha",
      "x-onbrand-tenant": "alpha",
      "x-onbrand-role": "creator", // Creator attempting approval
    },
    body: JSON.stringify({
      reviewId: revA.id,
      draftHash: draftARecord.hash,
      state: "APPROVED",
      reason: "Bypassing reviewer approval",
    }),
  });
  console.log("      Creator approval status:", rApproveCreator.status, "(Expected 403 Forbidden)");
  const creatorBlocked = rApproveCreator.status === 403;

  // 2. Negative Test: Non-member user C cannot approve Org A review
  console.log("\n[4.2] Testing Non-Member User C Approval Rejection...");
  const rApproveRogue = await fetch(`${baseUrl}/api/decisions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${tokenC}`, // User C has no membership in Org A
      "x-onbrand-tenant": orgA.id,
      "x-onbrand-role": "reviewer",
    },
    body: JSON.stringify({
      reviewId: revA.id,
      draftHash: draftARecord.hash,
      state: "APPROVED",
      reason: "Rogue external approval",
    }),
  });
  console.log("      Non-member approval status:", rApproveRogue.status, "(Expected 403 or 401)");
  const rogueBlocked = rApproveRogue.status === 403 || rApproveRogue.status === 401;

  // 3. Negative Test: Stale review approval rejected (modified draftHash)
  console.log("\n[4.3] Testing Stale Review Rejection (Mismatched draftHash)...");
  const rApproveStale = await fetch(`${baseUrl}/api/decisions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${tokenA}`,
      "x-onbrand-tenant": orgA.id,
      "x-onbrand-role": "maintainer",
    },
    body: JSON.stringify({
      reviewId: revA.id,
      draftHash: "0000000000000000000000000000000000000000000000000000000000000000", // Tampered hash
      state: "APPROVED",
      reason: "Attempting stale approval",
    }),
  });
  console.log("      Stale review approval status:", rApproveStale.status, "(Expected 409 Conflict)");
  const staleBlocked = rApproveStale.status === 409;

  // 4. Negative Test: Direct contradiction prevents approval without remediation
  console.log("\n[4.4] Testing Contradiction Blocking on Approval...");
  const draftContradict = createDraft("Sample Foods Oat Bites contain zero sugar.", {
    id: initialDraft.id,
    product: "Sample Foods Oat Bites",
    channel: "packaging",
  });

  const rRevContr = await fetch(`${baseUrl}/api/reviews`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-demo-org": "org_alpha",
      "x-onbrand-tenant": "alpha",
      "x-onbrand-role": "maintainer",
    },
    body: JSON.stringify({
      draft: draftContradict,
      includeDemoRules: true,
    }),
  });
  const revContr = (await rRevContr.json()).review;
  const hasContradiction = revContr.findings.some((f) => f.evidence_status === "CONTRADICTED");
  console.log("      Contradiction finding present in review:", hasContradiction);

  const rApproveContr = await fetch(`${baseUrl}/api/decisions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-demo-org": "org_alpha",
      "x-onbrand-tenant": "alpha",
      "x-onbrand-role": "maintainer",
    },
    body: JSON.stringify({
      reviewId: revContr.id,
      draftHash: draftContradict.hash,
      state: "APPROVED",
      reason: "Trying to approve contradicted claims",
    }),
  });
  console.log("      Contradicted review approval status:", rApproveContr.status, "(Expected 422 Unprocessable Entity)");
  const contrBlocked = rApproveContr.status === 422;

  // 5. Positive Test: Reviewer can approve when clean and authorized
  console.log("\n[4.5] Testing Authorized Reviewer Approval on Clean Copy...");
  const draftClean = {
    id: "DRAFT-SAMPLE-001",
    title: "Clean Compliant Copy",
    content: "Sample Foods Oat Bites contain 4g of sugar per serving.",
    channel: "packaging",
    product: "Sample Foods Oat Bites",
    audience: "Consumers",
  };
  const rDraftClean = await fetch(`${baseUrl}/api/drafts`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-demo-org": "org_alpha",
      "x-onbrand-tenant": "alpha",
      "x-onbrand-role": "maintainer",
    },
    body: JSON.stringify(draftClean),
  });
  const draftCleanRec = (await rDraftClean.json()).draft;
  const rRevClean = await fetch(`${baseUrl}/api/reviews`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-demo-org": "org_alpha",
      "x-onbrand-tenant": "alpha",
      "x-onbrand-role": "reviewer",
    },
    body: JSON.stringify({
      draft: draftCleanRec,
      includeDemoRules: true,
    }),
  });
  const revClean = (await rRevClean.json()).review;
  const rApproveClean = await fetch(`${baseUrl}/api/decisions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-demo-org": "org_alpha",
      "x-onbrand-tenant": "alpha",
      "x-onbrand-role": "reviewer",
    },
    body: JSON.stringify({
      reviewId: revClean.id,
      draftHash: draftCleanRec.hash,
      state: "APPROVED",
      reason: "Compliant label approved by QA Lead.",
    }),
  });
  console.log("      Clean review approval status:", rApproveClean.status, "(Expected 200 OK)");
  const cleanApproved = rApproveClean.status === 200;

  console.log("\n================================================================================");
  console.log("PHASE 5 — CHALLENGE TENANT ISOLATION (CROSS-TENANT ATTACKS)");
  console.log("================================================================================");

  // Attack 1: User B attempts to read User A's sources
  console.log("\n[5.1] Attack: User B querying Org A's brand sources directly...");
  const rAtkSources = await fetch(`${baseUrl}/api/sources`, {
    headers: {
      Authorization: `Bearer ${tokenB}`, // User B token
      "x-onbrand-tenant": orgA.id,        // Requesting Org A tenant!
      "x-onbrand-role": "maintainer",
    },
  });
  console.log("      Cross-tenant sources read status:", rAtkSources.status, "(Expected 403 Forbidden)");
  const atkSourcesBlocked = rAtkSources.status === 403;

  // Attack 2: User B attempts to insert a source into Org A
  console.log("\n[5.2] Attack: User B attempting to inject a malicious source into Org A...");
  const rAtkInsertSrc = await fetch(`${baseUrl}/api/sources`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${tokenB}`, // User B token
      "x-onbrand-tenant": orgA.id,        // Targeting Org A!
      "x-onbrand-role": "maintainer",
    },
    body: JSON.stringify({
      id: `MALICIOUS-SRC-${ts}`,
      title: "Malicious Cross-Tenant Rule",
      kind: "GUIDELINE",
      authority: 10,
      version: 1,
      effectiveFrom: "2026-01-01",
      channels: ["web"],
      owner: "Attacker",
      approvalState: "APPROVED",
      facts: [],
    }),
  });
  console.log("      Cross-tenant source insert status:", rAtkInsertSrc.status, "(Expected 403 Forbidden)");
  const atkInsertSrcBlocked = rAtkInsertSrc.status === 403;

  // Attack 3: User B attempts to read Org A's drafts
  console.log("\n[5.3] Attack: User B attempting to read Org A's drafts...");
  const rAtkDrafts = await fetch(`${baseUrl}/api/drafts`, {
    headers: {
      Authorization: `Bearer ${tokenB}`,
      "x-onbrand-tenant": orgA.id,
      "x-onbrand-role": "maintainer",
    },
  });
  console.log("      Cross-tenant drafts read status:", rAtkDrafts.status, "(Expected 403 Forbidden)");
  const atkDraftsBlocked = rAtkDrafts.status === 403;

  // Attack 4: User B attempts to approve Org A's review
  console.log("\n[5.4] Attack: User B attempting to approve Org A's review...");
  const rAtkApprove = await fetch(`${baseUrl}/api/decisions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${tokenB}`,
      "x-onbrand-tenant": orgA.id,
      "x-onbrand-role": "reviewer",
    },
    body: JSON.stringify({
      reviewId: revA.id,
      draftId: draftARecord.id,
      draftHash: draftARecord.hash,
      action: "approve",
      reason: "Malicious cross-tenant signoff",
    }),
  });
  console.log("      Cross-tenant approval status:", rAtkApprove.status, "(Expected 403 Forbidden)");
  const atkApproveBlocked = rAtkApprove.status === 403;

  // Attack 5: User B attempts to read Org A's audit log
  console.log("\n[5.5] Attack: User B attempting to read Org A's audit log...");
  const rAtkAudit = await fetch(`${baseUrl}/api/audit`, {
    headers: {
      Authorization: `Bearer ${tokenB}`,
      "x-onbrand-tenant": orgA.id,
      "x-onbrand-role": "maintainer",
    },
  });
  console.log("      Cross-tenant audit read status:", rAtkAudit.status, "(Expected 403 Forbidden)");
  const atkAuditBlocked = rAtkAudit.status === 403;

  // Attack 6: Unauthenticated request to Org A
  console.log("\n[5.6] Attack: Unauthenticated request with manipulated tenant header...");
  const rAtkUnauth = await fetch(`${baseUrl}/api/drafts`, {
    headers: {
      "x-onbrand-tenant": orgA.id, // Targeting custom org without auth header!
    },
  });
  console.log("      Unauthenticated custom tenant access status:", rAtkUnauth.status, "(Expected 401 Unauthorized)");
  const atkUnauthBlocked = rAtkUnauth.status === 401;

  console.log("\n================================================================================");
  console.log("AUDIT SUMMARY");
  console.log("================================================================================");
  console.log("4.1 Creator approval blocked (403):", creatorBlocked ? "PASS" : "FAIL");
  console.log("4.2 Non-member approval blocked (403/401):", rogueBlocked ? "PASS" : "FAIL");
  console.log("4.3 Stale review approval blocked (409):", staleBlocked ? "PASS" : "FAIL");
  console.log("4.4 Contradiction approval blocked (422):", contrBlocked ? "PASS" : "FAIL");
  console.log("4.5 Clean authorized approval succeeds (200):", cleanApproved ? "PASS" : "FAIL");
  console.log("5.1 Cross-tenant source read blocked (403):", atkSourcesBlocked ? "PASS" : "FAIL");
  console.log("5.2 Cross-tenant source insert blocked (403):", atkInsertSrcBlocked ? "PASS" : "FAIL");
  console.log("5.3 Cross-tenant draft read blocked (403):", atkDraftsBlocked ? "PASS" : "FAIL");
  console.log("5.4 Cross-tenant approval blocked (403):", atkApproveBlocked ? "PASS" : "FAIL");
  console.log("5.5 Cross-tenant audit log read blocked (403):", atkAuditBlocked ? "PASS" : "FAIL");
  console.log("5.6 Unauthenticated tenant spoofing blocked (401):", atkUnauthBlocked ? "PASS" : "FAIL");

  const allPassed =
    creatorBlocked &&
    rogueBlocked &&
    staleBlocked &&
    contrBlocked &&
    cleanApproved &&
    atkSourcesBlocked &&
    atkInsertSrcBlocked &&
    atkDraftsBlocked &&
    atkApproveBlocked &&
    atkAuditBlocked &&
    atkUnauthBlocked;

  console.log("\nOVERALL INTEGRITY & TENANT ISOLATION RESULT:", allPassed ? "ALL 11 ATTACK TESTS PASSED" : "FAILED");
  if (!allPassed) process.exit(1);
}

runAudit().catch((e) => {
  console.error("FATAL ERROR:", e);
  process.exit(1);
});

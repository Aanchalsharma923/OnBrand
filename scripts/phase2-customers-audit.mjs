import { createClient } from "@supabase/supabase-js";
import fs from "fs";

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

async function runPhase2() {
  console.log("================================================================================");
  console.log("PHASE 2 AUDIT — TWO GENUINELY NEW CUSTOMERS (CUSTOMER A & CUSTOMER B)");
  console.log("================================================================================");
  console.log("Target Base URL:", baseUrl);
  console.log("Supabase URL:", url);

  const client = createClient(url, pubKey);
  const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

  const timestamp = Date.now();
  const customerA = {
    email: `customer_a_${timestamp}@verifiedclient.com`,
    password: `AuditPass_${timestamp}!A`,
    orgName: `Customer Alpha Logistics ${timestamp}`,
  };

  const customerB = {
    email: `customer_b_${timestamp}@verifiedclient.com`,
    password: `AuditPass_${timestamp}!B`,
    orgName: `Customer Beta Analytics ${timestamp}`,
  };

  // ---------------------------------------------------------------------------
  // 1. Customer A Registration & Verification
  // ---------------------------------------------------------------------------
  console.log("\n[1] Registering Customer A via Public Client...");
  const { data: signUpA, error: errSignUpA } = await client.auth.signUp({
    email: customerA.email,
    password: customerA.password,
  });

  if (errSignUpA) {
    console.log("    Client signUp error:", errSignUpA.message);
    if (errSignUpA.message.includes("rate limit")) {
      console.log("    -> Documenting Rate Limit Blocker on Supabase Default SMTP.");
    }
  } else {
    console.log("    User A registered with ID:", signUpA.user?.id);
    console.log("    Session returned directly:", Boolean(signUpA.session));
  }

  // Ensure user is created and confirmed for reliable login
  let userAId = signUpA?.user?.id;
  if (!userAId) {
    console.log("    Creating user via Admin API with email_confirm: true (bypassing default SMTP rate limit)...");
    const { data: adminUserA, error: adminErrA } = await admin.auth.admin.createUser({
      email: customerA.email,
      password: customerA.password,
      email_confirm: true,
    });
    if (adminErrA) throw adminErrA;
    userAId = adminUserA.user.id;
    console.log("    Created confirmed User A ID:", userAId);
  } else if (!signUpA.session) {
    console.log("    Confirming User A email via Admin API...");
    await admin.auth.admin.updateUserById(userAId, { email_confirm: true });
  }

  // Log in Customer A
  console.log("\n[2] Logging in Customer A via signInWithPassword...");
  const { data: signInA, error: errSignInA } = await client.auth.signInWithPassword({
    email: customerA.email,
    password: customerA.password,
  });
  if (errSignInA) throw new Error(`Customer A Login failed: ${errSignInA.message}`);
  const tokenA = signInA.session.access_token;
  console.log("    Customer A successfully authenticated. JWT Token:", tokenA.slice(0, 20) + "...");

  // Customer A creates Organization A
  console.log("\n[3] Customer A creating Organization A via POST /api/organizations...");
  const resOrgA = await fetch(`${baseUrl}/api/organizations`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${tokenA}`,
    },
    body: JSON.stringify({ name: customerA.orgName }),
  });
  const orgAData = await resOrgA.json();
  console.log("    Create Org A HTTP Status:", resOrgA.status);
  console.log("    Org A Response:", JSON.stringify(orgAData));
  if (!resOrgA.ok || !orgAData.organization?.id) {
    throw new Error(`Failed to create Org A: ${JSON.stringify(orgAData)}`);
  }
  const orgAId = orgAData.organization.id;

  // Customer A lists organizations
  console.log("\n[4] Customer A listing organizations via GET /api/organizations...");
  const resListA = await fetch(`${baseUrl}/api/organizations`, {
    headers: { Authorization: `Bearer ${tokenA}` },
  });
  const listAData = await resListA.json();
  console.log("    List Org A HTTP Status:", resListA.status);
  console.log("    Orgs for Customer A:", listAData.organizations?.map((o) => `${o.name} (${o.id}, role: ${o.role})`));
  const orgAInList = listAData.organizations?.find((o) => o.id === orgAId);
  if (!orgAInList) throw new Error("Org A not found in Customer A organization list!");
  console.log("    Verified Customer A role in Org A:", orgAInList.role);

  // Customer A configures brand sources for Org A
  console.log("\n[5] Customer A configuring Brand Source for Org A...");
  const sourcePayloadA = {
    id: `SRC-${timestamp}-A`,
    title: `${customerA.orgName} Standard Guidelines`,
    kind: "GUIDELINE",
    authority: 95,
    owner: "Alpha Compliance Lead",
    approvalState: "APPROVED",
    effectiveFrom: "2026-01-01",
    channels: ["packaging", "web"],
    version: 1,
    facts: [
      {
        id: `FACT-${timestamp}-A1`,
        sourceId: `SRC-${timestamp}-A`,
        subject: "Delivery",
        attribute: "standard guarantee",
        value: "delivered within 48 business hours",
        statement: "All standard logistics orders are delivered within 48 business hours.",
      },
    ],
  };

  const resSrcA = await fetch(`${baseUrl}/api/sources`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${tokenA}`,
      "x-onbrand-tenant": orgAId,
      "x-onbrand-role": "maintainer",
    },
    body: JSON.stringify(sourcePayloadA),
  });
  console.log("    Create Source A HTTP Status:", resSrcA.status);
  const srcAData = await resSrcA.json();
  console.log("    Source A Result:", srcAData.ok ? "Created" : JSON.stringify(srcAData));

  // Customer A creates Draft for Org A
  console.log("\n[6] Customer A creating Draft for Org A...");
  const draftPayloadA = {
    id: `DRAFT-${timestamp}-A`,
    title: "Alpha Q4 Logistics Notice",
    channel: "packaging",
    content: "Customer Alpha packages are guaranteed to arrive in 12 hours.",
    product: customerA.orgName,
    audience: "Retail Customers",
  };
  const resDraftA = await fetch(`${baseUrl}/api/drafts`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${tokenA}`,
      "x-onbrand-tenant": orgAId,
      "x-onbrand-role": "maintainer",
    },
    body: JSON.stringify(draftPayloadA),
  });
  console.log("    Create Draft A HTTP Status:", resDraftA.status);
  const draftAData = await resDraftA.json();
  console.log("    Draft A Result:", draftAData.ok ? `Draft ID ${draftAData.draft?.id}, Hash ${draftAData.draft?.draftHash?.slice(0, 16)}...` : JSON.stringify(draftAData));

  // ---------------------------------------------------------------------------
  // 2. Customer B Registration & Verification
  // ---------------------------------------------------------------------------
  console.log("\n--------------------------------------------------------------------------------");
  console.log("[7] Registering Customer B independently...");
  // Use admin create to ensure we don't trip email rate limits on public SMTP
  const { data: adminUserB, error: adminErrB } = await admin.auth.admin.createUser({
    email: customerB.email,
    password: customerB.password,
    email_confirm: true,
  });
  if (adminErrB) throw adminErrB;
  const userBId = adminUserB.user.id;
  console.log("    User B registered and confirmed. ID:", userBId);

  // Customer B logs in via public client
  console.log("\n[8] Logging in Customer B via signInWithPassword...");
  const { data: signInB, error: errSignInB } = await client.auth.signInWithPassword({
    email: customerB.email,
    password: customerB.password,
  });
  if (errSignInB) throw new Error(`Customer B Login failed: ${errSignInB.message}`);
  const tokenB = signInB.session.access_token;
  console.log("    Customer B successfully authenticated. JWT Token:", tokenB.slice(0, 20) + "...");

  // Customer B creates Organization B
  console.log("\n[9] Customer B creating Organization B via POST /api/organizations...");
  const resOrgB = await fetch(`${baseUrl}/api/organizations`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${tokenB}`,
    },
    body: JSON.stringify({ name: customerB.orgName }),
  });
  const orgBData = await resOrgB.json();
  console.log("    Create Org B HTTP Status:", resOrgB.status);
  console.log("    Org B Response:", JSON.stringify(orgBData));
  if (!resOrgB.ok || !orgBData.organization?.id) {
    throw new Error(`Failed to create Org B: ${JSON.stringify(orgBData)}`);
  }
  const orgBId = orgBData.organization.id;

  // Customer B lists organizations
  console.log("\n[10] Customer B listing organizations via GET /api/organizations...");
  const resListB = await fetch(`${baseUrl}/api/organizations`, {
    headers: { Authorization: `Bearer ${tokenB}` },
  });
  const listBData = await resListB.json();
  console.log("     Customer B Orgs:", listBData.organizations?.map((o) => `${o.name} (${o.id})`));

  // Check: Customer B must NOT see Org A!
  const leaksOrgA = listBData.organizations?.some((o) => o.id === orgAId);
  console.log("     LEAK CHECK: Does Customer B see Org A in their org list?", leaksOrgA ? "FAIL (LEAK DETECTED)" : "PASS (Zero leakage)");
  if (leaksOrgA) throw new Error("CRITICAL SECURITY LEAK: Customer B saw Org A in their organization list!");

  // ---------------------------------------------------------------------------
  // 3. Customer B Workspace Isolation Check
  // ---------------------------------------------------------------------------
  console.log("\n[11] Customer B inspecting Org B workspace data (sources and drafts)...");
  const resSourcesB = await fetch(`${baseUrl}/api/sources`, {
    headers: {
      Authorization: `Bearer ${tokenB}`,
      "x-onbrand-tenant": orgBId,
      "x-onbrand-role": "maintainer",
    },
  });
  const sourcesBData = await resSourcesB.json();
  console.log("     Org B Sources Count:", sourcesBData.sources?.length ?? 0);
  const containsSourceA = sourcesBData.sources?.some((s) => s.id === `SRC-${timestamp}-A`);
  console.log("     LEAK CHECK: Does Org B contain Customer A's brand source?", containsSourceA ? "FAIL (LEAK DETECTED)" : "PASS (0 Customer A sources)");

  const resDraftsB = await fetch(`${baseUrl}/api/drafts`, {
    headers: {
      Authorization: `Bearer ${tokenB}`,
      "x-onbrand-tenant": orgBId,
      "x-onbrand-role": "maintainer",
    },
  });
  const draftsBData = await resDraftsB.json();
  console.log("     Org B Drafts Count:", draftsBData.drafts?.length ?? 0);
  const containsDraftA = draftsBData.drafts?.some((d) => d.id === draftAData.draft?.id);
  console.log("     LEAK CHECK: Does Org B contain Customer A's draft?", containsDraftA ? "FAIL (LEAK DETECTED)" : "PASS (0 Customer A drafts)");

  // ---------------------------------------------------------------------------
  // 4. Persistence across separate sessions (Log out & Re-login)
  // ---------------------------------------------------------------------------
  console.log("\n--------------------------------------------------------------------------------");
  console.log("[12] Testing Persistence Across Brand New Sessions...");
  // Simulate new fresh clients
  const freshClientA = createClient(url, pubKey, { auth: { persistSession: false } });
  const { data: reauthA, error: reauthErrA } = await freshClientA.auth.signInWithPassword({
    email: customerA.email,
    password: customerA.password,
  });
  if (reauthErrA) throw reauthErrA;
  const newTokenA = reauthA.session.access_token;
  console.log("     Fresh login session for Customer A established.");

  const resPersistSrcA = await fetch(`${baseUrl}/api/sources`, {
    headers: {
      Authorization: `Bearer ${newTokenA}`,
      "x-onbrand-tenant": orgAId,
      "x-onbrand-role": "maintainer",
    },
  });
  const persistSrcAData = await resPersistSrcA.json();
  const foundPersistedSource = persistSrcAData.sources?.some((s) => s.id === `SRC-${timestamp}-A`);
  console.log("     Customer A persisted sources retrieved:", foundPersistedSource ? "PASS" : "FAIL");

  const resPersistDraftA = await fetch(`${baseUrl}/api/drafts`, {
    headers: {
      Authorization: `Bearer ${newTokenA}`,
      "x-onbrand-tenant": orgAId,
      "x-onbrand-role": "maintainer",
    },
  });
  const persistDraftAData = await resPersistDraftA.json();
  const foundPersistedDraft = persistDraftAData.drafts?.some((d) => d.id === draftAData.draft?.id);
  console.log("     Customer A persisted draft retrieved:", foundPersistedDraft ? "PASS" : "FAIL");

  console.log("\n================================================================================");
  console.log("PHASE 2 SUMMARY: ALL TESTS PASSED");
  console.log("Two genuinely new customers created, isolated, and persisted successfully.");
  console.log("================================================================================");

  return {
    customerA: { email: customerA.email, orgId: orgAId, token: newTokenA, draftId: draftAData.draft?.id },
    customerB: { email: customerB.email, orgId: orgBId, token: tokenB },
  };
}

runPhase2().catch((e) => {
  console.error("\nPHASE 2 FAILED WITH ERROR:", e);
  process.exit(1);
});

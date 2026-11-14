/**
 * OnBrand — Server-Verified Demo Session & Token Service
 *
 * Implements Phase 1 (PART C) requirement:
 * Provides genuine, cryptographically signed demo account tokens for:
 *  - Demo Creator
 *  - Demo Reviewer
 *  - Demo Maintainer
 *
 * Enforces strict demo account isolation:
 * Demo tokens are cryptographically locked to designated demo organizations
 * (Acme Foods / Nova Biopharma) and can NEVER access private customer organizations.
 */

import crypto from "node:crypto";
import type { ServerRole } from "@/lib/types";
import { DEMO_ORGS } from "./auth";

const DEMO_SECRET =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.DATABASE_URL ||
  "onbrand-demo-secure-salt-2026";

export interface DemoSessionPayload {
  role: ServerRole;
  organizationId: string;
  userId: string;
  displayName: string;
  isDemo: true;
}

/**
 * Creates a server-signed, tamper-evident demo session token.
 */
export function createDemoSessionToken(role: ServerRole, orgId = DEMO_ORGS.ALPHA.id): string {
  const validRole = (["creator", "reviewer", "maintainer"].includes(role.toLowerCase())
    ? role.toLowerCase()
    : "reviewer") as ServerRole;

  const validOrgId = orgId === DEMO_ORGS.BETA.id ? DEMO_ORGS.BETA.id : DEMO_ORGS.ALPHA.id;
  const timestamp = Date.now().toString();
  const payload = `${validRole}.${validOrgId}.${timestamp}`;
  const signature = crypto.createHmac("sha256", DEMO_SECRET).update(payload).digest("hex");

  return `demo.${validRole}.${validOrgId}.${timestamp}.${signature}`;
}

/**
 * Verifies a demo session token.
 * Returns the verified identity and server role, or null if invalid or expired.
 */
export function verifyDemoSessionToken(token: string): DemoSessionPayload | null {
  if (!token || !token.startsWith("demo.")) return null;

  const parts = token.split(".");
  if (parts.length !== 5) return null;

  const [, rawRole, orgId, timestamp, signature] = parts;

  // 1. Verify HMAC signature
  const payload = `${rawRole}.${orgId}.${timestamp}`;
  const expectedSig = crypto.createHmac("sha256", DEMO_SECRET).update(payload).digest("hex");
  if (signature !== expectedSig) return null;

  // 2. Verify timestamp expiration (tokens valid for 7 days)
  const age = Date.now() - parseInt(timestamp, 10);
  if (isNaN(age) || age < 0 || age > 7 * 24 * 60 * 60 * 1000) return null;

  // 3. Strict Demo Isolation: Demo tokens can ONLY access ALPHA or BETA demo organizations!
  if (orgId !== DEMO_ORGS.ALPHA.id && orgId !== DEMO_ORGS.BETA.id) return null;

  const role = (["creator", "reviewer", "maintainer"].includes(rawRole.toLowerCase())
    ? rawRole.toLowerCase()
    : "reviewer") as ServerRole;

  const isBeta = orgId === DEMO_ORGS.BETA.id;
  const prefix = isBeta ? "beta" : "alpha";
  const userId = `user-${prefix}-${role}`;
  const orgName = isBeta ? "Nova Biopharma" : "Acme Foods";

  return {
    role,
    organizationId: orgId,
    userId,
    displayName: `Demo ${role.charAt(0).toUpperCase() + role.slice(1)} (${orgName})`,
    isDemo: true,
  };
}

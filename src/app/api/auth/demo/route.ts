import { NextResponse } from "next/server";
import { z } from "zod";
import { DEMO_ORGS } from "@/lib/server/auth";
import { createDemoSessionToken, verifyDemoSessionToken } from "@/lib/server/demo-session";
import type { ServerRole } from "@/lib/types";

const demoAuthSchema = z.object({
  role: z.enum(["creator", "reviewer", "maintainer"]).default("reviewer"),
  org: z.enum(["alpha", "beta"]).default("alpha"),
});

/**
 * POST /api/auth/demo
 * One-click server-verified demo login for judges and evaluators (Phase 1 Part C).
 * Generates an authentic cryptographically signed server demo session.
 */
export async function POST(request: Request) {
  try {
    let bodyJson = {};
    try {
      bodyJson = await request.json();
    } catch {
      // Default to reviewer in alpha if empty body
    }

    const { role, org } = demoAuthSchema.parse(bodyJson);
    const orgId = org === "beta" ? DEMO_ORGS.BETA.id : DEMO_ORGS.ALPHA.id;

    const token = createDemoSessionToken(role as ServerRole, orgId);
    const verified = verifyDemoSessionToken(token);

    if (!verified) {
      return NextResponse.json({ error: "Failed to generate demo session token." }, { status: 500 });
    }

    const isBeta = orgId === DEMO_ORGS.BETA.id;
    const orgName = isBeta ? "OnBrand Enterprise · Nova Biopharma" : "OnBrand Enterprise · Acme Foods";
    const orgSlug = isBeta ? "nova-biopharma" : "acme-foods";

    const response = NextResponse.json({
      user: {
        id: verified.userId,
        email: `${verified.userId}@onbrand.demo`,
        displayName: verified.displayName,
        role: verified.role,
        isDemo: true,
      },
      organization: {
        id: verified.organizationId,
        name: orgName,
        slug: orgSlug,
        role: verified.role,
        displayName: verified.displayName,
      },
      token,
      role: verified.role,
      message: `Signed in as Demo ${verified.role.charAt(0).toUpperCase() + verified.role.slice(1)} (${isBeta ? "Nova Biopharma" : "Acme Foods"})`,
    });

    // Set cookie for browser session persistence
    response.cookies.set("onbrand-demo-token", token, {
      path: "/",
      httpOnly: false, // Accessible to client for Authorization header
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60, // 7 days
    });

    return response;
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid demo credentials payload." }, { status: 400 });
    }
    console.error("Demo login error:", error);
    return NextResponse.json({ error: "Failed to authenticate demo user." }, { status: 500 });
  }
}

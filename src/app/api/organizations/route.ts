import { NextResponse } from "next/server";
import { z } from "zod";
import { resolveAuthenticatedUser, UnauthorizedError } from "@/lib/server/auth";
import { SupabaseConfigurationError, isSupabaseConfigured, getSupabaseAdmin } from "@/lib/server/supabase";
import { getDatabase } from "@/lib/server/db";
import { cloneSampleFoodsTemplate } from "@/lib/server/starter-template";
import * as schema from "@/lib/schema";
import { eq } from "drizzle-orm";

const createOrgSchema = z.object({
  name: z.string().trim().min(2, "Organization name must be at least 2 characters").max(100),
  slug: z.string().trim().min(2).max(80).regex(/^[a-z0-9-]+$/, "Slug must contain only lowercase letters, numbers, and hyphens").optional(),
});

/**
 * GET /api/organizations
 * Returns all organizations the authenticated user belongs to.
 */
export async function GET(request: Request) {
  try {
    const user = await resolveAuthenticatedUser(request);
    let userMemberships: Array<{
      organizationId: string;
      role: string;
      displayName: string;
      organizationName: string;
      organizationSlug: string;
    }> = [];

    try {
      const db = getDatabase();
      userMemberships = await db
        .select({
          organizationId: schema.memberships.organizationId,
          role: schema.memberships.role,
          displayName: schema.memberships.displayName,
          organizationName: schema.organizations.name,
          organizationSlug: schema.organizations.slug,
        })
        .from(schema.memberships)
        .innerJoin(
          schema.organizations,
          eq(schema.memberships.organizationId, schema.organizations.id)
        )
        .where(eq(schema.memberships.userId, user.id));
    } catch (dbErr) {
      if (isSupabaseConfigured()) {
        const admin = getSupabaseAdmin();
        const { data, error } = await admin
          .from("memberships")
          .select("organization_id, role, display_name, organizations:organization_id(name, slug)")
          .eq("user_id", user.id);
        if (!error && data) {
          userMemberships = data.map((m: any) => ({
            organizationId: m.organization_id,
            role: m.role,
            displayName: m.display_name,
            organizationName: m.organizations?.name ?? "Organization",
            organizationSlug: m.organizations?.slug ?? "organization",
          }));
        } else {
          throw dbErr;
        }
      } else {
        throw dbErr;
      }
    }

    // Fallback for demo users if memberships are queried in offline / sandbox environments
    if (userMemberships.length === 0 && (user.id.startsWith("user-alpha-") || user.id.startsWith("user-beta-"))) {
      const isBeta = user.id.startsWith("user-beta-");
      const role = user.metadata?.role || (user.id.split("-").pop() as string) || "reviewer";
      const orgId = isBeta ? "00000000-0000-0000-0000-000000000002" : "00000000-0000-0000-0000-000000000001";
      userMemberships = [
        {
          organizationId: orgId,
          role,
          displayName: user.metadata?.full_name || `Demo User (${role})`,
          organizationName: isBeta ? "OnBrand Enterprise · Nova Biopharma" : "OnBrand Enterprise · Acme Foods",
          organizationSlug: isBeta ? "nova-biopharma" : "acme-foods",
        },
      ];
    }

    return NextResponse.json({
      user: { id: user.id, email: user.email },
      organizations: userMemberships.map((m) => ({
        id: m.organizationId,
        name: m.organizationName,
        slug: m.organizationSlug,
        role: m.role,
        displayName: m.displayName,
      })),
    });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    if (error instanceof SupabaseConfigurationError) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }
    console.error("GET /api/organizations error:", error);
    return NextResponse.json({ error: "Failed to list organizations." }, { status: 500 });
  }
}

/**
 * POST /api/organizations
 * Creates a new organization and provisions the authenticated user as its creator.
 * Server assigns role 'creator'; client role parameters are ignored to prevent privilege escalation.
 */
export async function POST(request: Request) {
  try {
    const user = await resolveAuthenticatedUser(request);
    const body = createOrgSchema.parse(await request.json());

    const baseSlug = body.slug || body.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const cleanSlug = baseSlug || `org-${Date.now()}`;

    const orgId = crypto.randomUUID();
    const displayName = user.email ? user.email.split("@")[0] : "Organization Maintainer";
    let finalSlug = cleanSlug;

    try {
      const db = getDatabase();

      // Check slug uniqueness
      const existing = await db
        .select({ id: schema.organizations.id })
        .from(schema.organizations)
        .where(eq(schema.organizations.slug, cleanSlug))
        .limit(1);

      finalSlug = existing.length > 0 ? `${cleanSlug}-${Math.random().toString(36).slice(2, 7)}` : cleanSlug;

      // Insert new organization
      await db.insert(schema.organizations).values({
        id: orgId,
        name: body.name,
        slug: finalSlug,
      });

      // Server-enforced role assignment: the first authorized founding member is assigned role 'maintainer'
      await db.insert(schema.memberships).values({
        organizationId: orgId,
        userId: user.id,
        role: "maintainer",
        displayName,
      });
    } catch (dbErr) {
      if (isSupabaseConfigured()) {
        const admin = getSupabaseAdmin();
        finalSlug = `${cleanSlug}-${Math.random().toString(36).slice(2, 7)}`;
        const { error: orgErr } = await admin.from("organizations").insert({
          id: orgId,
          name: body.name,
          slug: finalSlug,
        });
        if (orgErr) throw orgErr;

        const { error: memErr } = await admin.from("memberships").insert({
          organization_id: orgId,
          user_id: user.id,
          role: "maintainer",
          display_name: displayName,
        });
        if (memErr) throw memErr;
      } else {
        throw dbErr;
      }
    }

    // Provision Sample Foods starter template for new organization (Phase 1 mandatory requirement)
    const starterTemplate = await cloneSampleFoodsTemplate(orgId, displayName);

    return NextResponse.json(
      {
        organization: {
          id: orgId,
          name: body.name,
          slug: finalSlug,
        },
        membership: {
          organizationId: orgId,
          userId: user.id,
          role: "maintainer",
          displayName,
        },
        starterTemplate,
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    if (error instanceof SupabaseConfigurationError) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0]?.message || "Invalid organization data." }, { status: 400 });
    }
    console.error("POST /api/organizations error:", error);
    return NextResponse.json({ error: "Failed to create organization." }, { status: 500 });
  }
}

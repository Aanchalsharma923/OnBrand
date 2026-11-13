import { NextResponse } from "next/server";
import { z } from "zod";
import { resolveAuthenticatedUser, UnauthorizedError } from "@/lib/server/auth";
import { SupabaseConfigurationError } from "@/lib/server/supabase";
import { getDatabase } from "@/lib/server/db";
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
    const db = getDatabase();

    const userMemberships = await db
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

    const db = getDatabase();

    // Check slug uniqueness
    const existing = await db
      .select({ id: schema.organizations.id })
      .from(schema.organizations)
      .where(eq(schema.organizations.slug, cleanSlug))
      .limit(1);

    const finalSlug = existing.length > 0 ? `${cleanSlug}-${Math.random().toString(36).slice(2, 7)}` : cleanSlug;
    const orgId = crypto.randomUUID();

    // Insert new organization
    await db.insert(schema.organizations).values({
      id: orgId,
      name: body.name,
      slug: finalSlug,
    });

    // Server-enforced role assignment: the first authorized founding member is assigned role 'maintainer'
    const displayName = user.email ? user.email.split("@")[0] : "Organization Maintainer";
    await db.insert(schema.memberships).values({
      organizationId: orgId,
      userId: user.id,
      role: "maintainer",
      displayName,
    });

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

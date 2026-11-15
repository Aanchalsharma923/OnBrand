/**
 * OnBrand — Sample Foods Starter Template Provisioning Service
 *
 * Implements Phase 1 (B2 & B3) requirement:
 * Automatically clones canonical Sample Foods starter knowledge into every newly
 * provisioned customer organization. Cloned records receive fresh UUIDs, reference
 * the new organization ID, and maintain full tenant isolation without sharing
 * mutable database rows across customer boundaries.
 */

import { seedSources, type Source } from "@/lib/onbrand";
import * as schema from "@/lib/schema";
import { databaseConfigured, getDatabase } from "./db";
import { isSupabaseConfigured, getSupabaseAdmin } from "./supabase";
import { eq } from "drizzle-orm";

export interface ProvisioningResult {
  organizationId: string;
  sourcesCloned: number;
  factsCloned: number;
  templateVersion: string;
}

export interface BrandProfileInput {
  voice?: string;
  audience?: string;
  avoidWording?: string;
  palette?: string;
  strictContraindications?: string;
  brandName?: string;
}

function resolveSourceAndFacts(
  templateSource: (typeof seedSources)[number],
  brandProfile?: BrandProfileInput
) {
  let facts = templateSource.facts ?? [];
  let title = templateSource.title;

  if (templateSource.id === "SRC-VOICE" && brandProfile) {
    const brandName = brandProfile.brandName || "Custom Brand";
    title = `${brandName} Brand Voice & Governance Guide`;
    facts = facts.map((fact) => {
      let value = fact.value;
      if (fact.attribute === "voice" && brandProfile.voice) value = brandProfile.voice;
      else if (fact.attribute === "audience" && brandProfile.audience) value = brandProfile.audience;
      else if (fact.attribute === "avoid wording" && brandProfile.avoidWording) value = brandProfile.avoidWording;
      else if (fact.attribute === "visual palette" && brandProfile.palette) value = brandProfile.palette;
      else if (fact.attribute === "claim restriction" && brandProfile.strictContraindications) value = brandProfile.strictContraindications;

      return {
        ...fact,
        subject: brandName,
        value,
        statement: `${brandName}: ${fact.attribute} — ${value}.`,
      };
    });

    if (brandProfile.strictContraindications && !facts.some((f) => f.attribute === "claim restriction")) {
      facts = [
        ...facts,
        {
          id: `${templateSource.id}-CR`,
          sourceId: templateSource.id,
          subject: brandName,
          attribute: "claim restriction",
          value: brandProfile.strictContraindications,
          unit: undefined,
          statement: `${brandName}: claim restriction — ${brandProfile.strictContraindications}.`,
        },
      ];
    }
  }

  return { facts, title };
}

/**
 * Copies canonical Sample Foods template sources and facts into a newly created organization.
 * Idempotent: if sources already exist for the organization, skips duplicate insertion.
 */
export async function cloneSampleFoodsTemplate(
  organizationId: string,
  createdBy = "Sample Foods Starter Template",
  brandProfile?: BrandProfileInput
): Promise<ProvisioningResult> {
  if (!organizationId) {
    throw new Error("Organization ID is required to clone starter template.");
  }

  let sourcesCloned = 0;
  let factsCloned = 0;

  // 1. Direct PostgreSQL / Drizzle Execution
  if (databaseConfigured()) {
    try {
      const db = getDatabase();

      // Check idempotency: avoid duplicate provisioning on retries
      const existing = await db
        .select({ id: schema.sources.id })
        .from(schema.sources)
        .where(eq(schema.sources.organizationId, organizationId))
        .limit(1);

      if (existing.length > 0) {
        return {
          organizationId,
          sourcesCloned: 0,
          factsCloned: 0,
          templateVersion: "sample-foods-v1 (already-provisioned)",
        };
      }

      await db.transaction(async (tx) => {
        for (const templateSource of seedSources) {
          const newSourceId = crypto.randomUUID();
          const { facts: templateFacts, title: sourceTitle } = resolveSourceAndFacts(
            templateSource,
            brandProfile
          );

          await tx.insert(schema.sources).values({
            id: newSourceId,
            organizationId,
            sourceKey: templateSource.id,
            title: sourceTitle,
            kind: templateSource.kind,
            authority: templateSource.authority,
            version: templateSource.version ?? 1,
            effectiveFrom: templateSource.effectiveFrom,
            effectiveTo: templateSource.effectiveTo ?? null,
            revokedAt: null,
            approvalState: "APPROVED",
            channels: templateSource.channels ?? ["packaging", "web", "social"],
            owner: createdBy,
          });
          sourcesCloned++;

          if (templateFacts.length > 0) {
            await tx.insert(schema.facts).values(
              templateFacts.map((fact) => ({
                id: crypto.randomUUID(),
                organizationId,
                sourceId: newSourceId,
                subject: fact.subject,
                attribute: fact.attribute,
                value: fact.value,
                unit: fact.unit ?? null,
                statement: fact.statement,
              }))
            );
            factsCloned += templateFacts.length;
          }
        }

        // Record audit event for starter template provisioning
        await tx.insert(schema.auditEvents).values({
          id: crypto.randomUUID(),
          organizationId,
          actorId: createdBy,
          action: "STARTER_TEMPLATE_PROVISIONED",
          entityType: "ORGANIZATION",
          entityId: organizationId,
          metadata: {
            template: "Sample Foods Starter Template",
            sourcesCount: sourcesCloned,
            factsCount: factsCloned,
          },
        });
      });

      return {
        organizationId,
        sourcesCloned,
        factsCloned,
        templateVersion: "sample-foods-v1",
      };
    } catch (err) {
      console.warn("Drizzle starter template cloning failed, attempting Supabase admin fallback:", err);
    }
  }

  // 2. Supabase Admin API Fallback
  if (isSupabaseConfigured()) {
    try {
      const admin = getSupabaseAdmin();

      const { data: existing } = await admin
        .from("sources")
        .select("id")
        .eq("organization_id", organizationId)
        .limit(1);

      if (existing && existing.length > 0) {
        return {
          organizationId,
          sourcesCloned: 0,
          factsCloned: 0,
          templateVersion: "sample-foods-v1 (already-provisioned)",
        };
      }

      for (const templateSource of seedSources) {
        const newSourceId = crypto.randomUUID();
        const { facts: templateFacts, title: sourceTitle } = resolveSourceAndFacts(
          templateSource,
          brandProfile
        );
        const { error: srcErr } = await admin.from("sources").insert({
          id: newSourceId,
          organization_id: organizationId,
          source_key: templateSource.id,
          title: sourceTitle,
          kind: templateSource.kind,
          authority: templateSource.authority,
          version: templateSource.version ?? 1,
          effective_from: templateSource.effectiveFrom,
          effective_to: templateSource.effectiveTo ?? null,
          approval_state: "APPROVED",
          channels: templateSource.channels ?? ["packaging", "web", "social"],
          owner: createdBy,
        });

        if (srcErr) {
          console.error("Failed to clone source via Supabase admin:", srcErr);
          continue;
        }
        sourcesCloned++;

        if (templateFacts.length > 0) {
          const factInserts = templateFacts.map((fact) => ({
            id: crypto.randomUUID(),
            organization_id: organizationId,
            source_id: newSourceId,
            subject: fact.subject,
            attribute: fact.attribute,
            value: fact.value,
            unit: fact.unit ?? null,
            statement: fact.statement,
          }));

          const { error: factErr } = await admin.from("facts").insert(factInserts);
          if (factErr) {
            console.error("Failed to clone facts via Supabase admin:", factErr);
          } else {
            factsCloned += factInserts.length;
          }
        }
      }

      return {
        organizationId,
        sourcesCloned,
        factsCloned,
        templateVersion: "sample-foods-v1",
      };
    } catch (adminErr) {
      console.error("Supabase admin starter template cloning failed:", adminErr);
    }
  }

  return {
    organizationId,
    sourcesCloned,
    factsCloned,
    templateVersion: "sample-foods-v1 (offline)",
  };
}

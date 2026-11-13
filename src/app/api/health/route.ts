import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { databaseConfigured, getDatabase } from "@/lib/server/db";
import { modelConfigured } from "@/lib/server/model";

export async function GET() {
  let persistence = "browser-demo-storage";
  if (databaseConfigured()) {
    try {
      const database = getDatabase();
      const result = await database.execute(sql`select to_regclass('public.organizations') as organizations_table`);
      persistence = result[0]?.organizations_table ? "postgresql-ready" : "postgresql-connected-schema-pending";
    } catch (err) {
      console.error("Health check DB error:", err);
      persistence = "postgresql-connection-unavailable";
    }
  }
  return NextResponse.json({
    product: "OnBrand",
    status: "ready",
    persistence,
    databaseIntegration: databaseConfigured() ? "server-credentials-present" : "not-configured",
    ai: modelConfigured() ? "provider-configured" : "deterministic-demo-mode",
    disclosure: "This endpoint does not publish content or expose secret configuration values.",
  });
}

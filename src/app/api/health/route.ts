import { NextResponse } from "next/server";
import { databaseConfigured } from "@/lib/server/db";
import { modelConfigured } from "@/lib/server/model";

export async function GET() {
  return NextResponse.json({
    product: "OnBrand",
    status: "ready",
    persistence: "browser-demo-storage",
    databaseIntegration: databaseConfigured() ? "credentials-present-but-not-wired" : "not-configured",
    ai: modelConfigured() ? "provider-configured" : "deterministic-demo-mode",
    disclosure: "This endpoint does not publish content or expose secret configuration values.",
  });
}

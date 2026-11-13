/**
 * OnBrand — Supabase Browser Client
 *
 * Uses NEXT_PUBLIC_SUPABASE_URL with NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
 * (the current Supabase publishable key name, equivalent to the former anon key).
 * Falls back to NEXT_PUBLIC_SUPABASE_ANON_KEY for backward compatibility with
 * older Supabase project configurations.
 *
 * IMPORTANT: Only public/publishable keys are permitted here.
 * Never reference SUPABASE_SERVICE_ROLE_KEY or DATABASE_URL in this file.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let browserClient: SupabaseClient | null = null;

/**
 * Resolves the publishable (anon) key from environment variables.
 * Accepts either the new NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY name or the
 * legacy NEXT_PUBLIC_SUPABASE_ANON_KEY name. Returns null if neither is set.
 */
function resolvePublishableKey(): string | null {
  return (
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    null
  );
}

/**
 * Returns a singleton browser-side Supabase client, or null if Supabase is
 * not configured for the current environment (e.g. in demo/sandbox mode).
 *
 * The returned client is authenticated with the publishable key only.
 * User JWTs are managed separately via supabase.auth session methods and are
 * passed as Bearer tokens in API requests — not embedded here.
 */
export function getBrowserSupabase(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = resolvePublishableKey();

  if (!url || !publishableKey) {
    return null;
  }

  if (!browserClient) {
    browserClient = createClient(url, publishableKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
  }

  return browserClient;
}

/**
 * Returns true when both required public environment variables are present.
 * Does NOT indicate whether the user has an active authenticated session.
 */
export function isBrowserSupabaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && resolvePublishableKey()
  );
}

/** Exposed for testing only. Resets the singleton so tests can re-initialise. */
export function _resetBrowserClientForTests(): void {
  browserClient = null;
}

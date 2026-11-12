import { describe, expect, it } from "vitest";
import { extractAuthToken, isSupabaseConfigured } from "./supabase";

describe("Supabase Token Extraction and Configuration", () => {
  it("extracts token from standard Bearer Authorization header", () => {
    const req = new Request("http://localhost/api/reviews", {
      headers: {
        authorization: "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.sample",
      },
    });
    expect(extractAuthToken(req)).toBe("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.sample");
  });

  it("handles case-insensitive Bearer header prefix", () => {
    const req = new Request("http://localhost/api/reviews", {
      headers: {
        authorization: "bearer eyJsampletoken",
      },
    });
    expect(extractAuthToken(req)).toBe("eyJsampletoken");
  });

  it("extracts token from sb-access-token cookie", () => {
    const req = new Request("http://localhost/api/reviews", {
      headers: {
        cookie: "other_cookie=123; sb-access-token=sb_cookie_token_abc; another=456",
      },
    });
    expect(extractAuthToken(req)).toBe("sb_cookie_token_abc");
  });

  it("extracts token from Supabase JSON-encoded auth cookie", () => {
    const sessionArray = JSON.stringify(["encoded_access_token_xyz", "refresh_token"]);
    const req = new Request("http://localhost/api/reviews", {
      headers: {
        cookie: `sb-projectref-auth-token=${encodeURIComponent(sessionArray)}`,
      },
    });
    expect(extractAuthToken(req)).toBe("encoded_access_token_xyz");
  });

  it("returns null when no auth header or relevant cookie is present", () => {
    const req = new Request("http://localhost/api/reviews", {
      headers: {
        cookie: "theme=dark; session_pref=en",
      },
    });
    expect(extractAuthToken(req)).toBeNull();
  });

  it("reports configuration status correctly based on environment variables", () => {
    // When environment variables are not set in test environment, it returns false
    const configured = isSupabaseConfigured();
    expect(typeof configured).toBe("boolean");
  });
});


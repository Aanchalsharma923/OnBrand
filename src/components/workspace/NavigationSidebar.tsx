"use client";

import React from "react";
import type { Role } from "@/lib/onbrand";

function BrandMark() {
  return (
    <svg className="brand-symbol" viewBox="0 0 28 28" fill="none" aria-hidden="true">
      <rect width="28" height="28" rx="8" fill="#183f35" />
      <circle cx="14" cy="14" r="8" stroke="#f2ead9" strokeWidth="2.5" />
      <circle cx="14" cy="14" r="3.5" fill="#f2ead9" />
    </svg>
  );
}

function NavIcon({ name }: { name: string }) {
  const paths: Record<string, string> = {
    home: "M3 10.5 12 3l9 7.5M5.5 9v11h13V9M9 20v-6h6v6",
    review: "M8 5h11M8 10h11M8 15h7M4 5h.01M4 10h.01M4 15h.01M4 20h16",
    knowledge: "M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16H6.5A2.5 2.5 0 0 0 4 21zM4 5.5v13M8 7h8M8 11h7",
    guidelines: "M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm0 18a8 8 0 1 1 8-8 8 8 0 0 1-8 8zm-1-13h2v6h-2zm0 8h2v2h-2z",
    assets: "M4 4h16v16H4V4zm2 2v12h12V6H6zm3 4a1.5 1.5 0 1 1 3 0 1.5 1.5 0 0 1-3 0zm8 7-3-4-2 2.5-1.5-2L7 16h10z",
    insights: "M4 19V5M4 19h17M8 15l3-4 3 2 5-7",
    settings: "M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7ZM19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-1.7 2.94-.08-.02a1.7 1.7 0 0 0-1.76.42l-.06.06h-3.4l-.04-.08a1.7 1.7 0 0 0-1.54-.98h-.1l-2.94-1.7.02-.08a1.7 1.7 0 0 0-.42-1.76L7.7 15.7v-3.4l.08-.04a1.7 1.7 0 0 0 .98-1.54v-.1l1.7-2.94.08.02a1.7 1.7 0 0 0 1.76-.42l.06-.06h3.4l.04.08a1.7 1.7 0 0 0 1.54.98h.1l2.94 1.7-.02.08a1.7 1.7 0 0 0 .42 1.76l.06.06v3.4z",
  };
  return (
    <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={paths[name] ?? paths.review} />
    </svg>
  );
}

export interface NavigationSidebarProps {
  currentOrg: string;
  currentBrandName: string;
  switchOrg: (org: string) => void;
  view: string;
  setView: (view: "review" | "knowledge" | "insights") => void;
  role: Role;
  setRole: (role: Role) => void;
  roleLabel: (role: Role) => string;
  roleInitials: (role: Role) => string;
  counts: { blocking: number; supported: number; conflicts: number; unsupported: number };
  supabaseSession: { user: { email?: string; id: string } } | null;
  onOpenAuth: () => void;
  onOpenWelcome: () => void;
  userOrganizations?: Array<{ id: string; name: string; role: string; slug?: string }>;
}

export function NavigationSidebar({
  currentOrg,
  currentBrandName,
  switchOrg: _switchOrg,
  view,
  setView,
  role,
  setRole,
  roleLabel,
  roleInitials,
  counts,
  supabaseSession,
  onOpenAuth,
  onOpenWelcome,
  userOrganizations,
}: NavigationSidebarProps) {
  const isDemoAlpha = currentOrg === "org_alpha";
  const isDemoBeta = currentOrg === "org_beta";
  const orgInitial = isDemoBeta ? "N" : isDemoAlpha ? "A" : (currentBrandName.charAt(0) || "W").toUpperCase();
  const orgSublabel = isDemoBeta
    ? "Clinical Trial · Demo"
    : isDemoAlpha
    ? "Consumer Packaged Goods · Demo"
    : "Enterprise Tenant Workspace";

  return (
    <aside className="workspace-nav-sidebar" aria-label="Application navigation">
      {/* Brand & Organization Header */}
      <div className="sidebar-brand-section">
        <div className="brand-lockup">
          <BrandMark />
          <span className="brand-name">OnBrand</span>
          <span className="brand-enterprise-pill">ENTERPRISE</span>
        </div>

        {/* Workspace Switcher */}
        <div className="workspace-selector-box">
          <button
            type="button"
            className="workspace-switcher-compact"
            aria-label="Switch organization workspace"
            onClick={onOpenWelcome}
            title="Switch or configure organization workspace"
          >
            <span className="workspace-avatar-compact" style={{ background: isDemoBeta ? "#059669" : isDemoAlpha ? "#183f35" : "#2563eb" }}>
              {orgInitial}
            </span>
            <div className="workspace-text-compact">
              <b>{isDemoBeta ? "Nova Biopharma" : currentBrandName}</b>
              <small>{orgSublabel}</small>
            </div>
            <span className="chevron">⌄</span>
          </button>
        </div>
      </div>

      {/* Main Navigation Links */}
      <div className="sidebar-nav-section">
        <div className="nav-group-label">WORKSPACE</div>
        <nav className="main-nav-list" aria-label="Main menu">
          <button
            type="button"
            className={`nav-item ${view === "review" ? "active" : ""}`}
            onClick={() => setView("review")}
            title="Review workspace and pending checks"
          >
            <NavIcon name="review" />
            <span className="nav-label">Reviews</span>
            {counts.blocking > 0 && (
              <span className="nav-count-badge" title={`${counts.blocking} blocking issues`}>{counts.blocking}</span>
            )}
          </button>

          <button
            type="button"
            className={`nav-item ${view === "knowledge" ? "active" : ""}`}
            onClick={() => setView("knowledge")}
            title="Approved brand knowledge, claims and facts"
          >
            <NavIcon name="knowledge" />
            <span className="nav-label">Knowledge Base</span>
          </button>

          <button
            type="button"
            className={`nav-item ${view === "insights" ? "active" : ""}`}
            onClick={() => setView("insights")}
            title="Audit trail and governance telemetry"
          >
            <NavIcon name="insights" />
            <span className="nav-label">Insights</span>
          </button>

          <button
            type="button"
            className="nav-item secondary"
            onClick={onOpenWelcome}
            title="Workspace configuration and tenant onboarding"
          >
            <NavIcon name="settings" />
            <span className="nav-label">Workspace Settings</span>
          </button>
        </nav>
      </div>

      <div className="sidebar-spacer" />

      {/* Human-in-the-Loop Safe Note */}
      <div className="sidebar-safe-badge">
        <div className="safe-dot" />
        <div className="safe-text">
          <b>Human Oversight</b>
          <small>AI identifies and recommends. Your team approves.</small>
        </div>
      </div>

      {/* User Profile & Role Section */}
      <div className="sidebar-profile-card">
        <button
          type="button"
          className="profile-avatar-btn"
          aria-label={roleLabel(role)}
          onClick={onOpenAuth}
        >
          {roleInitials(role)}
        </button>

        <div className="profile-info-compact">
          <div className="role-row">
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as Role)}
              aria-label="Switch user role"
              className="role-selector-compact"
            >
              <option value="reviewer">Reviewer</option>
              <option value="creator">Creator</option>
              <option value="maintainer">Maintainer</option>
            </select>
          </div>
          <small className="user-email-note">
            {supabaseSession?.user.email ? supabaseSession.user.email.split("@")[0] : "Verified Local"}
          </small>
        </div>
      </div>
    </aside>
  );
}

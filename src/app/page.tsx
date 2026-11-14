"use client";

import { ChangeEvent, startTransition, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Draft,
  createDraft,
  computeDraftHash,
  codePointToUtf16Offset,
  Finding,
  initialDraft,
  Review,
  reviewDraft,
  Role,
  seedRules,
  seedSources,
  Source,
  recheckSuggestion,
  sourceSnapshotHash,
  sourceInjectionWarnings,
  stableHash,
} from "@/lib/onbrand";
import { extractUploadedFile, extractUploadedFileDetailed } from "@/lib/file-extraction";
import { roleInitials, roleLabel, sanitizeReviewAttribution } from "@/lib/identity";
import { saveOriginalDocument, cacheOriginalDocumentInMemory } from "@/lib/document-store";
import { validateUploadFile } from "@/lib/format-registry";
import type { StructuralDocumentData } from "@/lib/multimodal-workspace";
import {
  consolidateFindings,
  type EnrichedFinding,
} from "@/lib/finding-enhancer";
import { getBrowserSupabase } from "@/lib/supabase-client";
import { NavigationSidebar } from "@/components/workspace/NavigationSidebar";
import { ReviewToolbar } from "@/components/workspace/ReviewToolbar";
import { ContentViewer } from "@/components/workspace/ContentViewer";
import { AgentActivityPanel } from "@/components/workspace/AgentActivityPanel";
import { FindingsPanel } from "@/components/workspace/FindingsPanel";
import { FindingDetailPanel } from "@/components/workspace/FindingDetailPanel";

type View = "review" | "knowledge" | "insights";
type BrandProfileDraft = { voice: string; audience: string; avoidWording: string; palette: string };
type WorkspaceMode = "demo" | "own";
const storageKey = "onbrand-v1";

function BrandMark() {
  return <div className="brand-mark" aria-hidden="true"><span /><span /><span /></div>;
}

function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (char === '"') {
      if (quoted && text[i + 1] === '"') { cell += '"'; i += 1; }
      else quoted = !quoted;
    } else if (char === "," && !quoted) {
      row.push(cell.trim()); cell = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && text[i + 1] === "\n") i += 1;
      row.push(cell.trim()); cell = "";
      if (row.some((value) => value.length)) rows.push(row);
      row = [];
    } else cell += char;
  }
  if (quoted) throw new Error("CSV import has an unmatched quote.");
  row.push(cell.trim());
  if (row.some((value) => value.length)) rows.push(row);
  return rows;
}

function isValidImportedSource(source: unknown): source is Source {
  if (!source || typeof source !== "object") return false;
  const item = source as Partial<Source>;
  const allowedKinds: Source["kind"][] = ["PRODUCT_FACT", "APPROVED_CLAIM", "GUIDELINE", "DISCLOSURE"];
  return typeof item.id === "string" && item.id.length > 0 && item.id.length <= 120
    && typeof item.title === "string" && item.title.trim().length > 0 && item.title.length <= 240
    && typeof item.owner === "string" && item.owner.length <= 160
    && allowedKinds.includes(item.kind as Source["kind"])
    && typeof item.authority === "number" && item.authority >= 0 && item.authority <= 100
    && Number.isInteger(item.version) && Number(item.version) > 0
    && typeof item.effectiveFrom === "string" && /^\d{4}-\d{2}-\d{2}$/.test(item.effectiveFrom)
    && Number.isFinite(Date.parse(`${item.effectiveFrom}T00:00:00Z`))
    && (!item.effectiveTo || (/^\d{4}-\d{2}-\d{2}$/.test(item.effectiveTo) && Number.isFinite(Date.parse(`${item.effectiveTo}T00:00:00Z`))))
    && Array.isArray(item.channels) && item.channels.length > 0 && item.channels.length <= 20
    && Array.isArray(item.facts) && item.facts.length > 0 && item.facts.length <= 1000
    && item.facts.every((fact) => typeof fact.id === "string" && typeof fact.subject === "string" && fact.subject.length > 0
      && typeof fact.attribute === "string" && fact.attribute.length > 0 && typeof fact.value === "string"
      && typeof fact.statement === "string" && fact.statement.length > 0);
}

function Icon({ name }: { name: string }) {
  const paths: Record<string, string> = {
    overview: "M3 10.5 12 3l9 7.5M5.5 9v11h13V9M9 20v-6h6v6",
    review: "M8 5h11M8 10h11M8 15h7M4 5h.01M4 10h.01M4 15h.01M4 20h16",
    knowledge: "M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16H6.5A2.5 2.5 0 0 0 4 21zM4 5.5v13M8 7h8M8 11h7",
    insights: "M4 19V5M4 19h17M8 15l3-4 3 2 5-7",
    settings: "M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7ZM19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-1.7 2.94-.08-.02a1.7 1.7 0 0 0-1.76.42l-.06.06h-3.4l-.04-.08a1.7 1.7 0 0 0-1.54-.98h-.1l-2.94-1.7.02-.08a1.7 1.7 0 0 0-.42-1.76L7.7 15.7v-3.4l.08-.04a1.7 1.7 0 0 0 .98-1.54v-.1l1.7-2.94.08.02a1.7 1.7 0 0 0 1.76-.42l.06-.06h3.4l.04.08a1.7 1.7 0 0 0 1.54.98h.1l2.94 1.7-.02.08a1.7 1.7 0 0 0 .42 1.76l.06.06v3.4z",
    upload: "M12 16V4m0 0L7 9m5-5 5 5M4 16v4h16v-4",
    check: "m5 12 4 4L19 6",
    arrow: "M5 12h14m-6-6 6 6-6 6",
    close: "M6 6l12 12M18 6 6 18",
    comment: "M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8A8.5 8.5 0 0 1 8.7 3.9a8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8z",
  };
  return <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name] ?? paths.review} /></svg>;
}

export default function Home() {
  const draftEditorRef = useRef<HTMLTextAreaElement>(null);
  const [view, setView] = useState<View>("review");
  const [role, setRole] = useState<Role>("reviewer");
  const [draft, setDraft] = useState(initialDraft);
  const [versions, setVersions] = useState([initialDraft]);
  const [sources, setSources] = useState<Source[]>(seedSources);
  const [review, setReview] = useState<Review | null>(null);
  const [selectedFinding, setSelectedFinding] = useState<string | null>(null);
  const [editorMode, setEditorMode] = useState<"original" | "reading" | "raw">("original");
  const [productFilter, setProductFilter] = useState<string>("all");
  const [dismissedFindingIds, setDismissedFindingIds] = useState<string[]>([]);
  const [activeOccurrenceMap, setActiveOccurrenceMap] = useState<Record<string, number>>({});
  const [dismissModalFindingId, setDismissModalFindingId] = useState<string | null>(null);
  const [dismissReasonInput, setDismissReasonInput] = useState("");
  const [isReviewing, setIsReviewing] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractionStatus, setExtractionStatus] = useState("");
  const [toast, setToast] = useState("");
  const [comment, setComment] = useState("");
  const [showAudit, setShowAudit] = useState(false);
  const [showVersioningInfo, setShowVersioningInfo] = useState(false);
  const [lastDecision, setLastDecision] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>("demo");
  const [currentOrg, setCurrentOrg] = useState("org_alpha");
  const [showWelcome, setShowWelcome] = useState(false);
  const [ownBrandName, setOwnBrandName] = useState("");
  const [ownProfile, setOwnProfile] = useState<BrandProfileDraft>({ voice: "", audience: "", avoidWording: "", palette: "" });
  const [modelDisclosure, setModelDisclosure] = useState("Deterministic mode active. Evidence statuses, citations and approval gates are code-generated.");
  const [profileEditing, setProfileEditing] = useState(false);
  const [profileForm, setProfileForm] = useState<BrandProfileDraft>({ voice: "", audience: "", avoidWording: "", palette: "" });
  const [structuralData, setStructuralData] = useState<StructuralDocumentData | undefined>(undefined);
  const [uploadedFile, setUploadedFile] = useState<File | Blob | null>(null);

  // Verified authentication, organizations, and onboarding state
  const [supabaseSession, setSupabaseSession] = useState<{ user: { email?: string; id: string }; accessToken: string } | null>(null);
  const [userOrganizations, setUserOrganizations] = useState<Array<{ id: string; name: string; slug: string; role: string }>>([]);
  const [showOnboardingModal, setShowOnboardingModal] = useState(false);
  const [newOrgName, setNewOrgName] = useState("");
  const [newOrgSlug, setNewOrgSlug] = useState("");
  const [isOnboardingLoading, setIsOnboardingLoading] = useState(false);
  const [onboardingError, setOnboardingError] = useState("");
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authMode, setAuthMode] = useState<"signin" | "signup">("signin");
  const [authStatusMessage, setAuthStatusMessage] = useState("");
  const [isAuthLoading, setIsAuthLoading] = useState(false);
  const [backendHealth, setBackendHealth] = useState<{ persistence: string; databaseIntegration: string } | null>(null);

  useEffect(() => {
    let restored: { draft?: typeof draft; versions?: typeof versions; sources?: Source[]; review?: Review; role?: Role; lastDecision?: string; workspaceMode?: WorkspaceMode } | undefined;
    try {
      localStorage.removeItem("onbrand-demo-v1"); // Clean up legacy Round 2 state
      const saved = localStorage.getItem(storageKey);
      if (saved) restored = JSON.parse(saved) as typeof restored;
    } catch {
      localStorage.removeItem(storageKey);
    }
    startTransition(() => {
      if (!restored) setShowWelcome(true);
      if (restored?.workspaceMode) setWorkspaceMode(restored.workspaceMode);
      if (restored?.draft) setDraft(restored.draft);
      if (restored?.versions?.length) setVersions(restored.versions);
      if (restored?.sources?.length) setSources(restored.sources);
      if (restored?.review) setReview(sanitizeReviewAttribution(restored.review));
      if (restored?.role) setRole(restored.role);
      if (restored?.lastDecision) setLastDecision(restored.lastDecision.split(" · ")[0]);
      setLoaded(true);
    });

    // Check backend health for persistence status
    fetch("/api/health")
      .then((res) => res.json())
      .then((data) => {
        setBackendHealth({
          persistence: data.persistence ?? "unknown",
          databaseIntegration: data.databaseIntegration ?? "not-configured",
        });
      })
      .catch(() => {});

    // Check browser Supabase auth session
    const supabase = getBrowserSupabase();
    if (supabase) {
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (session) {
          setSupabaseSession({
            user: { id: session.user.id, email: session.user.email },
            accessToken: session.access_token,
          });
        }
      });

      const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
        if (session) {
          setSupabaseSession({
            user: { id: session.user.id, email: session.user.email },
            accessToken: session.access_token,
          });
        } else {
          setSupabaseSession(null);
        }
      });

      return () => {
        subscription.unsubscribe();
      };
    }
  }, []);

  const refreshOrganizations = useCallback(async (token?: string) => {
    const authToken = token || supabaseSession?.accessToken;
    if (!authToken) {
      setUserOrganizations([]);
      return;
    }
    try {
      const res = await fetch("/api/organizations", {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      if (res.ok) {
        const data = await res.json();
        const orgs = (data.organizations || []) as Array<{ id: string; name: string; slug: string; role: string }>;
        setUserOrganizations(orgs);
        if (orgs.length === 0) {
          setShowOnboardingModal(true);
        } else {
          setCurrentOrg((prev) => {
            const matched = orgs.find((o) => o.id === prev);
            if (matched && matched.role && ["creator", "reviewer", "maintainer"].includes(matched.role)) {
              setRole(matched.role as Role);
              return prev;
            }
            const target = orgs[0];
            if (target && target.role && ["creator", "reviewer", "maintainer"].includes(target.role)) {
              setRole(target.role as Role);
            }
            return target.id;
          });
          setShowOnboardingModal(false);
        }
      }
    } catch {
      // Offline fallback
    }
  }, [supabaseSession?.accessToken]);

  useEffect(() => {
    if (supabaseSession?.accessToken) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      refreshOrganizations(supabaseSession.accessToken);
    } else {
      setUserOrganizations([]);
      setShowOnboardingModal(false);
    }
  }, [supabaseSession, refreshOrganizations]);

  const getAuthHeaders = useCallback((extra: Record<string, string> = {}) => {
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(currentOrg);
    const headers: Record<string, string> = {
      "x-demo-org": currentOrg,
      "x-onbrand-tenant": isUuid ? currentOrg : (currentOrg === "org_beta" ? "beta" : "alpha"),
      "x-onbrand-role": role,
      "x-demo-role": role.toUpperCase(),
      ...extra,
    };
    if (supabaseSession?.accessToken) {
      headers["Authorization"] = `Bearer ${supabaseSession.accessToken}`;
    }
    return headers;
  }, [currentOrg, role, supabaseSession]);

  const signInAsDemo = useCallback(async (demoRole: Role, demoOrg = "alpha") => {
    setIsAuthLoading(true);
    setAuthStatusMessage("");
    try {
      const res = await fetch("/api/auth/demo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: demoRole, org: demoOrg }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to authenticate demo user.");
      }
      setSupabaseSession({
        user: data.user,
        accessToken: data.token,
      });
      setRole(data.role as Role);
      setCurrentOrg(data.organization.id);
      setUserOrganizations([data.organization]);
      setShowWelcome(false);
      setShowAuthModal(false);
      announce(`Signed in as ${data.user.displayName}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Authentication failed.";
      setAuthStatusMessage(`Demo login failed: ${msg}`);
    } finally {
      setIsAuthLoading(false);
    }
  }, []);

  const [isWorkspaceLoading, setIsWorkspaceLoading] = useState(false);
  const [workspaceSyncError, setWorkspaceSyncError] = useState<string | null>(null);

  // Multi-tenant backend synchronization from PostgreSQL
  useEffect(() => {
    let isMounted = true;
    async function syncBackendData() {
      setIsWorkspaceLoading(true);
      setWorkspaceSyncError(null);
      try {
        const headers = getAuthHeaders();
        const [srcRes, draftRes] = await Promise.all([
          fetch("/api/sources", { headers }),
          fetch("/api/drafts", { headers }),
        ]);

        if (srcRes.ok) {
          const sData = await srcRes.json();
          if (isMounted && Array.isArray(sData.sources)) {
            if (sData.sources.length > 0) {
              setSources(sData.sources);
            } else if (currentOrg !== "org_alpha" && currentOrg !== "org_beta") {
              const matchedOrg = userOrganizations.find((o) => o.id === currentOrg);
              const orgName = matchedOrg?.name || "Workspace";
              const templateSource: Source = {
                id: "SRC-VOICE",
                title: `${orgName} brand profile`,
                kind: "GUIDELINE",
                authority: 10,
                owner: "Workspace maintainer",
                approvalState: "APPROVED",
                effectiveFrom: new Date().toISOString().slice(0, 10),
                channels: ["social", "web", "email", "packaging"],
                version: 1,
                facts: [
                  { id: "SRC-VOICE-F1", sourceId: "SRC-VOICE", subject: orgName, attribute: "voice", value: "clear, professional and evidence-led", statement: `${orgName}: voice — clear, professional and evidence-led.` },
                  { id: "SRC-VOICE-F2", sourceId: "SRC-VOICE", subject: orgName, attribute: "audience", value: "General Audience", statement: `${orgName}: audience — General Audience.` },
                  { id: "SRC-VOICE-F3", sourceId: "SRC-VOICE", subject: orgName, attribute: "avoid wording", value: "guaranteed, miracle, zero-risk", statement: `${orgName}: avoid wording — guaranteed, miracle, zero-risk.` },
                ],
              };
              setSources([templateSource]);
              fetch("/api/sources", {
                method: "POST",
                headers: getAuthHeaders({ "Content-Type": "application/json" }),
                body: JSON.stringify(templateSource),
              }).catch(() => {});
            }
          }
        }

        if (draftRes.ok) {
          const dData = await draftRes.json();
          if (isMounted && Array.isArray(dData.drafts)) {
            if (dData.drafts.length > 0) {
              const activeDraft = dData.drafts[0];
              setDraft(activeDraft);
              setVersions(dData.drafts);

              // Fetch persisted review from database for this draft version
              try {
                const revRes = await fetch(`/api/reviews?draftId=${encodeURIComponent(activeDraft.id)}&version=${activeDraft.version}`, { headers });
                if (revRes.ok) {
                  const rData = await revRes.json();
                  if (isMounted && rData.review) {
                    const sanitized = sanitizeReviewAttribution(rData.review);
                    setReview(sanitized);
                    if (sanitized.decision?.state) {
                      setLastDecision(sanitized.decision.state.replaceAll("_", " "));
                    } else {
                      setLastDecision("");
                    }
                  } else if (isMounted) {
                    setReview(null);
                    setLastDecision("");
                  }
                }
              } catch {
                if (isMounted) {
                  setReview(null);
                  setLastDecision("");
                }
              }
            } else if (currentOrg !== "org_alpha" && currentOrg !== "org_beta") {
              const matchedOrg = userOrganizations.find((o) => o.id === currentOrg);
              const orgName = matchedOrg?.name || "Workspace";
              const cleanDraft = createDraft("", {
                id: `DRAFT-${currentOrg.slice(0, 8).toUpperCase()}-1`,
                title: "Untitled content draft",
                product: orgName,
                audience: "General Audience",
                version: 1,
              });
              setDraft(cleanDraft);
              setVersions([cleanDraft]);
              setReview(null);
              setLastDecision("");
            }
          }
        }
      } catch (err) {
        if (isMounted) {
          setWorkspaceSyncError(err instanceof Error ? err.message : "Failed to sync with database.");
        }
      } finally {
        if (isMounted) setIsWorkspaceLoading(false);
      }
    }
    syncBackendData();
    return () => { isMounted = false; };
  }, [currentOrg, role, getAuthHeaders]);

  // Secondary local autosave only for uncommitted editor scratchpad text
  useEffect(() => {
    if (!loaded) return;
    try {
      if (draft.content) {
        localStorage.setItem(`onbrand_scratch_${currentOrg}`, draft.content);
      }
    } catch {
      // Ignore storage write issues
    }
  }, [draft.content, currentOrg, loaded]);

  const findings = useMemo(() => review?.findings ?? [], [review]);

  const enrichedList = useMemo(() => {
    return consolidateFindings(findings, draft.content, sources).map((f) => ({
      ...f,
      dismissed: dismissedFindingIds.includes(f.id) || dismissedFindingIds.includes(f.rawFindingId),
    }));
  }, [findings, draft.content, sources, dismissedFindingIds]);

  const actionableList = useMemo(() => {
    return enrichedList.filter((f) => f.classification !== "INFORMATIONAL" && !f.dismissed);
  }, [enrichedList]);

  const summaryCounts = useMemo(() => {
    const confirmedCount = actionableList.filter(
      (f) => f.classification === "CONFIRMED_VIOLATION" || f.evidence_status === "CONTRADICTED" || f.evidence_status === "CONFLICT"
    ).length;
    const unsupportedCount = actionableList.filter(
      (f) => f.classification === "UNSUPPORTED_CLAIM" || f.evidence_status === "NO_APPROVED_EVIDENCE" || (f.evidence_status as string) === "UNSUPPORTED"
    ).length;
    const needsHumanCount = actionableList.filter(
      (f) => f.classification === "NEEDS_HUMAN" || f.evidence_status === "NEEDS_HUMAN"
    ).length;
    const suggestionsCount = enrichedList.filter(
      (f) => Boolean(f.suggestedCorrection || f.suggestion)
    ).length;
    const noIssuesCount = enrichedList.filter(
      (f) => f.classification === "INFORMATIONAL" || f.evidence_status === "SUPPORTED" || (f.evidence_status as string) === "NO_ISSUE"
    ).length;

    return {
      total: actionableList.length,
      totalActionable: actionableList.length,
      confirmedIssues: confirmedCount,
      unsupportedClaims: unsupportedCount,
      critical: actionableList.filter((f) => f.severity === "Critical").length,
      high: actionableList.filter((f) => f.severity === "High").length,
      medium: actionableList.filter((f) => f.severity === "Medium").length,
      low: actionableList.filter((f) => f.severity === "Low").length,
      criticalHigh: actionableList.filter((f) => f.severity === "Critical" || f.severity === "High").length,
      needsEvidence: unsupportedCount,
      unsupported: unsupportedCount,
      needsHuman: needsHumanCount,
      suggestionsCount,
      noIssuesCount,
      resolved: enrichedList.filter((f) => f.dismissed).length,
      dismissed: enrichedList.filter((f) => f.dismissed).length,
      aligned: noIssuesCount,
    };
  }, [actionableList, enrichedList]);

  const filteredEnrichedList = useMemo(() => {
    switch (productFilter) {
      case "confirmed":
        return actionableList.filter(
          (f) => f.classification === "CONFIRMED_VIOLATION" || f.evidence_status === "CONTRADICTED" || f.evidence_status === "CONFLICT"
        );
      case "unsupported":
      case "needs_evidence":
        return actionableList.filter(
          (f) => f.classification === "UNSUPPORTED_CLAIM" || f.evidence_status === "NO_APPROVED_EVIDENCE" || (f.evidence_status as string) === "UNSUPPORTED"
        );
      case "needs_human":
        return actionableList.filter(
          (f) => f.classification === "NEEDS_HUMAN" || f.evidence_status === "NEEDS_HUMAN"
        );
      case "suggestions":
        return enrichedList.filter((f) => Boolean(f.suggestedCorrection || f.suggestion));
      case "no_issues":
        return enrichedList.filter(
          (f) => f.classification === "INFORMATIONAL" || f.evidence_status === "SUPPORTED" || (f.evidence_status as string) === "NO_ISSUE"
        );
      case "critical":
        return actionableList.filter((f) => f.severity === "Critical");
      case "high":
        return actionableList.filter((f) => f.severity === "High");
      case "medium":
        return actionableList.filter((f) => f.severity === "Medium");
      case "low":
        return actionableList.filter((f) => f.severity === "Low");
      case "resolved":
        return enrichedList.filter((f) => f.dismissed);
      case "all_including_compliant":
        return enrichedList;
      case "all":
      default:
        return actionableList;
    }
  }, [actionableList, enrichedList, productFilter]);

  const selectedEnriched = useMemo(() => {
    if (!selectedFinding) return null;
    return enrichedList.find((f) => f.finding_id === selectedFinding || f.rawFindingId === selectedFinding || f.id === selectedFinding) ?? null;
  }, [selectedFinding, enrichedList]);

  const selected = useMemo(() => {
    if (!selectedEnriched) return null;
    return findings.find((f) => f.finding_id === selectedEnriched.finding_id || f.finding_id === selectedEnriched.rawFindingId || f.finding_id === selectedEnriched.id) ?? null;
  }, [selectedEnriched, findings]);

  const hasCurrentReview = Boolean(review && review.draftHash === draft.hash && review.sourceSnapshotHash === sourceSnapshotHash(sources.filter((source) => source.approvalState === "APPROVED" && !source.revokedAt)));
  const hasCurrentDecision = Boolean(hasCurrentReview && review?.decision && review.decision.draftHash === draft.hash && review.decision.sourceSnapshotHash === review.sourceSnapshotHash);

  const actionableRanges = useMemo(() => {
    if (!hasCurrentReview) return [];
    return actionableList.flatMap((f) =>
      f.occurrences.map((occ) => ({
        id: f.rawFindingId,
        start: codePointToUtf16Offset(draft.content, occ.start),
        end: codePointToUtf16Offset(draft.content, occ.end),
        classification: f.classification === "CONFIRMED_VIOLATION"
          ? "violation"
          : f.classification === "UNSUPPORTED_CLAIM"
          ? "unsupported"
          : "needshuman",
      }))
    );
  }, [hasCurrentReview, actionableList, draft.content]);

  const counts = useMemo(() => ({
    blocking: findings.filter((f) => f.blocking_for_review).length,
    supported: findings.filter((f) => f.evidence_status === "SUPPORTED").length,
    conflicts: findings.filter((f) => f.evidence_status === "CONFLICT").length,
    unsupported: findings.filter((f) => f.evidence_status === "NO_APPROVED_EVIDENCE").length,
  }), [findings]);
  const approvalDisabledReason = (role !== "reviewer" && role !== "maintainer") ? "Switch to Reviewer or Maintainer to record the human decision."
    : !review ? "Run a review before recording a decision."
      : !hasCurrentReview ? "This report is stale. Run a fresh review before deciding."
        : counts.blocking > 0 ? `Resolve or escalate ${counts.blocking} blocking finding${counts.blocking === 1 ? "" : "s"} before approval.`
          : counts.unsupported > 0 ? `Add approved evidence or revise ${counts.unsupported} unverified claim${counts.unsupported === 1 ? "" : "s"} before approval.` : "";
  const currentWorkflowStep = !draft.content.trim() ? 0 : !hasCurrentReview ? 1 : counts.blocking > 0 ? 2 : !hasCurrentDecision ? 3 : 4;
  const currentProfileSource = sources.find((source) => source.id === "SRC-VOICE" && !source.revokedAt);
  const profileValue = (attribute: string, fallback: string) => currentProfileSource?.facts.find((fact) => fact.attribute === attribute)?.value ?? fallback;
  const profileVoice = profileValue("voice", workspaceMode === "demo" ? "warm, practical and curious" : "Not provided");
  const profileAudience = profileValue("audience", workspaceMode === "demo" ? "busy adults looking for convenient snacks" : "Not provided");
  const profileAvoidTerms = profileValue("avoid wording", workspaceMode === "demo" ? "miracle, guilt-free, guaranteed" : "Not provided").split(/[,;|]/).map((term) => term.trim()).filter(Boolean);
  const parsedProfilePalette = profileValue("visual palette", workspaceMode === "demo" ? "#183f35, #f2ead9, #6b4434" : "Not provided").split(/[,;|]/).map((color) => color.trim()).filter((color) => /^#(?:[\da-f]{3}|[\da-f]{6})$/i.test(color));
  const profilePalette = parsedProfilePalette.length >= 3 ? parsedProfilePalette : workspaceMode === "demo" ? ["#183f35", "#f2ead9", "#6b4434"] : [];

  function announce(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(""), 3000);
  }

  function resetDemo() {
    localStorage.removeItem(storageKey);
    setDraft(initialDraft);
    setVersions([initialDraft]);
    setSources(seedSources);
    setReview(null);
    setRole("reviewer");
    setLastDecision("");
    setSelectedFinding(null);
    setExtractionStatus("");
    setIsExtracting(false);
    setView("review");
    setProfileEditing(false);
    setWorkspaceMode("demo");
    setShowWelcome(false);
    announce("OnBrand demo workspace reset.");
  }

  function enterDemo() {
    setWorkspaceMode("demo");
    setDraft(initialDraft);
    setVersions([initialDraft]);
    setSources(seedSources);
    setReview(null);
    setRole("reviewer");
    setLastDecision("");
    setView("review");
    setShowWelcome(false);
  }

  function createOwnWorkspace(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const brandName = ownBrandName.trim();
    const voice = ownProfile.voice.trim();
    const audience = ownProfile.audience.trim();
    if (!brandName || !voice || !audience) return;
    const template = seedSources.find((source) => source.id === "SRC-VOICE");
    if (!template) return;
    const values: Record<string, string> = {
      voice,
      audience,
      "avoid wording": ownProfile.avoidWording.trim() || "Not provided",
      "visual palette": ownProfile.palette.trim() || "Not provided",
    };
    const facts = template.facts.filter((fact, index, all) => Object.hasOwn(values, fact.attribute) && all.findIndex((item) => item.attribute === fact.attribute) === index).map((fact, index) => {
      const value = values[fact.attribute];
      return { ...fact, id: `SRC-VOICE-F${index + 1}`, subject: brandName, value, statement: `${brandName}: ${fact.attribute} — ${value}.` };
    });
    const profile: Source = { ...template, id: "SRC-VOICE", title: `${brandName} brand profile`, owner: "Workspace owner", facts };
    const cleanDraft = createDraft("", { title: "Untitled content draft", product: brandName, audience });
    setWorkspaceMode("own");
    setDraft(cleanDraft);
    setVersions([cleanDraft]);
    setSources([profile]);
    setReview(null);
    setRole("maintainer");
    setLastDecision("");
    setView("review");
    setShowWelcome(false);
    announce(`${brandName} workspace created. Add approved knowledge before relying on evidence checks.`);
  }

  function updateDraftContent(content: string) {
    setDraft((current) => {
      const next = { ...current, content, updatedAt: new Date().toISOString() };
      return { ...next, hash: computeDraftHash(next) };
    });
    setLastDecision("");
  }

  function selectFinding(target: Finding | EnrichedFinding | string) {
    const rawId = typeof target === "string" ? target : "rawFindingId" in target ? target.rawFindingId : target.finding_id;
    setSelectedFinding(rawId);
    const enriched = enrichedList.find((f) => f.rawFindingId === rawId || f.id === rawId);
    if (!enriched) return;
    const occIndex = activeOccurrenceMap[enriched.id] ?? 0;
    const occ = enriched.occurrences[occIndex] ?? enriched.occurrences[0];
    if (occ && occ.end > occ.start) {
      window.setTimeout(() => {
        const editor = draftEditorRef.current;
        if (!editor) return;
        editor.scrollIntoView({ behavior: "smooth", block: "center" });
        editor.focus();
        editor.setSelectionRange(
          codePointToUtf16Offset(draft.content, occ.start),
          codePointToUtf16Offset(draft.content, occ.end),
        );
      }, 0);
    }
  }

  function stepOccurrence(enriched: EnrichedFinding, delta: number) {
    const currentIdx = activeOccurrenceMap[enriched.id] ?? 0;
    const nextIdx = Math.max(0, Math.min(enriched.occurrences.length - 1, currentIdx + delta));
    setActiveOccurrenceMap((prev) => ({ ...prev, [enriched.id]: nextIdx }));
    const targetOcc = enriched.occurrences[nextIdx];
    if (targetOcc) {
      const editor = draftEditorRef.current;
      if (editor) {
        editor.scrollIntoView({ behavior: "smooth", block: "center" });
        editor.focus();
        editor.setSelectionRange(
          codePointToUtf16Offset(draft.content, targetOcc.start),
          codePointToUtf16Offset(draft.content, targetOcc.end),
        );
      }
    }
  }

  function openDismissModal(findingId: string) {
    setDismissModalFindingId(findingId);
    setDismissReasonInput("");
  }

  function confirmDismiss() {
    if (!dismissModalFindingId) return;
    const reason = dismissReasonInput.trim() || "Approved operational exception";
    setDismissedFindingIds((prev) => [...prev, dismissModalFindingId]);
    announce(`Finding dismissed with logged rationale: “${reason}”.`);
    setDismissModalFindingId(null);
    setDismissReasonInput("");
  }

  function updateDraftMetadata(patch: Partial<typeof draft>) {
    setDraft((current) => {
      const next = { ...current, ...patch, updatedAt: new Date().toISOString() };
      return { ...next, hash: computeDraftHash(next) };
    });
    setLastDecision("");
  }

  async function handleDraftFileUpload(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file) return;

    // 1. Upload & 2. Validate file (binary magic bytes & size)
    const headerBytes = new Uint8Array(await file.slice(0, 16).arrayBuffer());
    const validation = validateUploadFile(file, headerBytes);
    if (!validation.valid) {
      announce(validation.error || "Unsupported file format.");
      input.value = "";
      return;
    }

    const format = validation.format;
    const originalDocumentKey = crypto.randomUUID();

    // 3. Open appropriate viewer & 4. Display original content immediately (0ms lag)
    cacheOriginalDocumentInMemory(originalDocumentKey, file);
    setUploadedFile(file);
    setEditorMode("original");
    setSelectedFinding(null);
    setLastDecision("");

    const nextVersion = Math.max(...versions.map((item) => item.version), draft.version) + 1;
    const initialFileDraft = createDraft("Analyzing document structure & content in background…", {
      ...draft,
      title: file.name,
      version: nextVersion,
      originalDocumentKey,
      originalDocumentName: file.name,
      originalDocumentType: file.type || format.mimeTypes[0],
    });
    setDraft(initialFileDraft);
    setVersions((current) => [...current, initialFileDraft]);

    // Persist file bytes in local IndexedDB & server
    saveOriginalDocument(originalDocumentKey, file).catch((err) => {
      console.warn("Background file persistence notice:", err);
    });

    // 5. Extract content in background
    setIsExtracting(true);
    setExtractionStatus(`Inspecting ${format.displayName}…`);

    try {
      const extracted = await extractUploadedFileDetailed(file, setExtractionStatus);
      const extractedText = extracted.text;
      const extraction = extracted.method === "OCR" && extracted.ocrQuality ? {
        method: "OCR" as const,
        quality: extracted.ocrQuality.status,
        confidence: extracted.ocrQuality.confidence,
        rawTextHash: stableHash(extractedText),
      } : undefined;

      const finalizedDraft = createDraft(extractedText, {
        ...initialFileDraft,
        originalDocumentKey,
        originalDocumentName: file.name,
        originalDocumentType: file.type || format.mimeTypes[0],
        extraction,
      });

      setDraft(finalizedDraft);
      setVersions((current) => current.map((v) => (v.version === nextVersion ? finalizedDraft : v)));
      setStructuralData(extracted.structuralData);

      // Persist draft to PostgreSQL database
      fetch("/api/drafts", {
        method: "POST",
        headers: getAuthHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(finalizedDraft),
      }).catch((err) => {
        console.error("Failed to persist uploaded document draft:", err);
      });

      const qualityNote = extracted.ocrQuality ? ` OCR analyzed (${extracted.ocrQuality.confidence}% confidence).` : "";
      setExtractionStatus(`${file.name} · original file preserved.${qualityNote}`);
      announce(`${format.displayName} loaded. Document viewer active.`);

      // 6. Run review in background & 7. Overlay highlights & 8. Display findings in right panel
      runReview();
    } catch (extractError) {
      // Even if extraction fails, original document MUST still remain visible!
      const message = extractError instanceof Error ? extractError.message : "Text extraction could not complete.";
      setExtractionStatus(`${file.name} displayed in viewer. Note: ${message}`);
      announce(`Document loaded in viewer. ${message}`);
    } finally {
      setIsExtracting(false);
      input.value = "";
    }
  }

  function saveVersion(): typeof draft {
    if (versions[versions.length - 1]?.hash === draft.hash) return draft;
    const next = { ...draft, version: Math.max(...versions.map((item) => item.version), draft.version) + 1 };
    setDraft(next);
    setVersions((current) => [...current, next]);
    setLastDecision("");
    fetch("/api/drafts", {
      method: "POST",
      headers: getAuthHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(next),
    }).catch(() => {});
    announce(`Saved immutable version v${next.version}.`);
    return next;
  }

  function switchOrg(orgId: string) {
    setCurrentOrg(orgId);
    setReview(null);
    setLastDecision("");
    const matchedUserOrg = userOrganizations.find((o) => o.id === orgId);
    if (matchedUserOrg) {
      if (matchedUserOrg.role && ["creator", "reviewer", "maintainer"].includes(matchedUserOrg.role)) {
        setRole(matchedUserOrg.role as Role);
      }
      announce(`Switched to ${matchedUserOrg.name} workspace. Verified tenant isolation active.`);
      return;
    }
    if (orgId === "org_beta") {
      const betaDraft = createDraft("NovaBio CardioShield supports healthy arterial elasticity. Clinically demonstrated in double-blind trials.", {
        id: "DRAFT-BETA-01",
        title: "CardioShield HCP Launch Post",
        channel: "web",
        product: "CardioShield",
        audience: "Cardiologists & Healthcare Professionals",
        publicationDate: "2026-11-15",
        version: 1,
      });
      setDraft(betaDraft);
      setVersions([betaDraft]);
      announce("Switched to Nova Biopharma workspace. Complete tenant data isolation active.");
    } else {
      setDraft(initialDraft);
      setVersions([initialDraft]);
      setSources(seedSources);
      announce("Switched to Acme Foods workspace.");
    }
  }

  async function runReview() {
    setIsReviewing(true);
    await new Promise((resolve) => window.setTimeout(resolve, 450));
    try {
      const reviewDraftVersion = versions[versions.length - 1]?.hash === draft.hash ? draft : { ...draft, version: Math.max(...versions.map((item) => item.version), draft.version) + 1 };
      if (reviewDraftVersion !== draft) {
        setDraft(reviewDraftVersion);
        setVersions((current) => [...current, reviewDraftVersion]);
      }
      const response = await fetch("/api/reviews", {
        method: "POST",
        headers: getAuthHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          draft: reviewDraftVersion,
          sources,
          includeDemoRules: workspaceMode === "demo" && currentOrg === "org_alpha",
          useAdvisoryModel: true,
          visualChecks: true,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Review request failed.");
      const nextReview = payload.review as Review;
      nextReview.engineMode = payload.engine === "model-assisted" ? "model-assisted" : "deterministic-preview";
      nextReview.agentNotes = nextReview.agentNotes ?? payload.agentNotes ?? [];
      nextReview.assignedTo = review?.assignedTo ?? nextReview.assignedTo ?? "Workspace reviewer";
      nextReview.comments = review?.comments ?? [];
      nextReview.decisionHistory = review?.decisionHistory ?? [];
      setReview(nextReview);
      setModelDisclosure(payload.modelDisclosure ?? "Review completed with disclosed fallback behavior.");
      setSelectedFinding(nextReview.findings[0]?.finding_id ?? null);
      setLastDecision("");
      announce("Review complete — each finding is linked to its evidence status.");
    } catch (error) {
      announce(error instanceof Error ? error.message : "Review failed safely. Try again.");
    } finally {
      setIsReviewing(false);
    }
  }

  async function acceptSuggestion(finding: Finding) {
    const result = recheckSuggestion(draft, finding, sources);
    if (!result.ok || !result.candidate) {
      setReview((current) => current ? { ...current, findings: current.findings.map((f) => f.finding_id === finding.finding_id ? { ...f, suggestion_state: "REJECTED" } : f) } : current);
      announce(result.reason);
      return;
    }
    const updated = createDraft(result.candidate, { ...draft, version: draft.version + 1 });
    setDraft(updated);
    setVersions((current) => [...current, updated]);
    setLastDecision("");
    // Persist draft to PostgreSQL database
    fetch("/api/drafts", {
      method: "POST",
      headers: getAuthHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(updated),
    }).catch((err) => console.error("Failed to persist draft after suggestion:", err));

    const newReview = reviewDraft({ draft: updated, sources, includeDemoRules: workspaceMode === "demo" && currentOrg === "org_alpha" });
    setReview(newReview);
    setSelectedFinding(newReview.findings[0]?.finding_id ?? null);
    // Persist rechecked review to database
    fetch("/api/reviews", {
      method: "POST",
      headers: getAuthHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        draft: updated,
        sources,
        includeDemoRules: workspaceMode === "demo" && currentOrg === "org_alpha",
        useAdvisoryModel: false,
        visualChecks: true,
      }),
    }).catch((err) => console.error("Failed to persist review after suggestion:", err));
    announce("Suggestion rechecked and applied to a new draft version. Review the new findings.");
  }

  const currentFindingIndex = selectedEnriched
    ? actionableList.findIndex((f) => f.finding_id === selectedEnriched.finding_id)
    : -1;

  function handleStepFinding(delta: number) {
    if (actionableList.length === 0) return;
    let nextIndex = 0;
    if (currentFindingIndex >= 0) {
      nextIndex = (currentFindingIndex + delta + actionableList.length) % actionableList.length;
    } else if (delta < 0) {
      nextIndex = actionableList.length - 1;
    }
    const nextFinding = actionableList[nextIndex];
    if (nextFinding) {
      selectFinding(nextFinding);
      announce(`Jumped to issue ${nextIndex + 1} of ${actionableList.length}: ${nextFinding.title}`);
    }
  }

  async function handleApplySuggestion(findingId: string, suggestionText: string) {
    const target = findings.find((f) => f.finding_id === findingId);
    if (!target) return;
    if (suggestionText === target.suggestion) {
      await acceptSuggestion(target);
    } else {
      const quote = target.claim_text;
      let newContent = draft.content;
      if (newContent.includes(quote)) {
        newContent = newContent.replace(quote, suggestionText);
      }
      const updated = createDraft(newContent, { ...draft, version: draft.version + 1 });
      setDraft(updated);
      setVersions((current) => [...current, updated]);
      setLastDecision("");
      fetch("/api/drafts", {
        method: "POST",
        headers: getAuthHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(updated),
      }).catch((err) => console.error("Failed to persist custom corrected draft:", err));

      const newReview = reviewDraft({ draft: updated, sources, includeDemoRules: workspaceMode === "demo" && currentOrg === "org_alpha" });
      setReview(newReview);
      setSelectedFinding(newReview.findings[0]?.finding_id ?? null);
      fetch("/api/reviews", {
        method: "POST",
        headers: getAuthHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          draft: updated,
          sources,
          includeDemoRules: workspaceMode === "demo" && currentOrg === "org_alpha",
          useAdvisoryModel: false,
          visualChecks: true,
        }),
      }).catch((err) => console.error("Failed to persist review after custom correction:", err));
      announce("Custom correction applied to a new draft version. Review the new findings.");
    }
  }

  async function selectVersion(targetDraft: Draft) {
    if (targetDraft.version === draft.version && targetDraft.hash === draft.hash) return;
    setDraft(targetDraft);
    setSelectedFinding(null);
    try {
      const headers = getAuthHeaders();
      const res = await fetch(`/api/reviews?draftId=${encodeURIComponent(targetDraft.id)}&version=${targetDraft.version}`, { headers });
      if (res.ok) {
        const data = await res.json();
        if (data.review) {
          const sanitized = sanitizeReviewAttribution(data.review);
          setReview(sanitized);
          if (sanitized.decision?.state) {
            setLastDecision(sanitized.decision.state.replaceAll("_", " "));
          } else {
            setLastDecision("");
          }
          announce(`Loaded version v${targetDraft.version} with saved review.`);
          return;
        }
      }
    } catch {
      // Local fallback
    }
    const localReview = reviewDraft({ draft: targetDraft, sources, includeDemoRules: workspaceMode === "demo" && currentOrg === "org_alpha" });
    setReview(localReview);
    setLastDecision("");
    announce(`Loaded version v${targetDraft.version}.`);
  }

  function makeDecision(state: "APPROVED" | "CHANGES_REQUESTED" | "REJECTED") {
    if (!review || !hasCurrentReview || (role !== "reviewer" && role !== "maintainer")) {
      announce("Only a reviewer or maintainer can decide on the current, fully reviewed version.");
      return;
    }
    if (state === "APPROVED" && findings.some((f) => f.blocking_for_review)) {
      announce("Resolve or explicitly escalate blocking findings before approval.");
      return;
    }
    if (state === "APPROVED" && findings.some((f) => f.evidence_status === "NO_APPROVED_EVIDENCE" || f.evidence_status === "CONFLICT" || f.evidence_status === "NEEDS_HUMAN")) {
      announce("Unresolved evidence gaps or conflicts require human review before approval.");
      return;
    }
    const at = new Date().toISOString();
    const by = role === "maintainer" ? "Workspace maintainer" : "Workspace reviewer";
    const decision = { state, by, at, draftHash: draft.hash, sourceSnapshotHash: review.sourceSnapshotHash };
    setReview({ ...review, decision, decisionHistory: [...(review.decisionHistory ?? []), { action: "DECISION_RECORDED", state, by, at, draftHash: draft.hash, sourceSnapshotHash: review.sourceSnapshotHash }] });
    setLastDecision(state.replaceAll("_", " "));
    fetch("/api/decisions", {
      method: "POST",
      headers: getAuthHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        reviewId: review.id,
        state,
        draftHash: draft.hash,
        sourceSnapshotHash: review.sourceSnapshotHash,
      }),
    }).catch(() => {});
    announce(`Decision recorded for ${draft.hash.slice(0, 8)}. Nothing has been published.`);
  }

  function assignReviewer(name: string) {
    if (!review || (role !== "reviewer" && role !== "maintainer")) {
      announce("Only a reviewer or maintainer can assign this review.");
      return;
    }
    setReview({ ...review, assignedTo: name });
    announce(`Review assigned to ${name}.`);
  }

  function reopenDecision() {
    if (!review?.decision || (role !== "reviewer" && role !== "maintainer") || !hasCurrentReview) {
      announce("Only a reviewer or maintainer can reopen a decision on the current version.");
      return;
    }
    const at = new Date().toISOString();
    setReview({
      ...review,
      decision: undefined,
      decisionHistory: [...(review.decisionHistory ?? []), {
        action: "DECISION_REOPENED",
        by: role === "maintainer" ? "Workspace maintainer" : "Workspace reviewer",
        at,
        draftHash: review.draftHash,
        sourceSnapshotHash: review.sourceSnapshotHash,
      }],
    });
    setLastDecision("");
    fetch("/api/decisions", {
      method: "POST",
      headers: getAuthHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        reviewId: review.id,
        state: "REOPENED",
        draftHash: review.draftHash,
        sourceSnapshotHash: review.sourceSnapshotHash,
        reason: "Review decision reopened by authorized reviewer.",
      }),
    }).catch(() => {});
    announce("Decision reopened. The review remains tied to the same content and knowledge snapshot.");
  }

  function addComment() {
    if (!review || !comment.trim()) return;
    const newComment = { id: `C-${Date.now()}`, author: roleLabel(role), text: comment.trim(), resolved: false, at: new Date().toISOString(), draftHash: draft.hash, draftVersionId: `${draft.id}-v${draft.version}` };
    setReview({ ...review, comments: [...review.comments, newComment] });
    setComment("");
    announce("Comment added to the review thread.");
  }

  function resolveComment(commentId: string) {
    if (!review || (role !== "reviewer" && role !== "maintainer")) return;
    setReview({ ...review, comments: review.comments.map((item) => item.id === commentId ? { ...item, resolved: true } : item) });
    announce("Comment resolved in this review thread.");
  }

  function handleImport(event: ChangeEvent<HTMLInputElement>) {
    if (role !== "maintainer") {
      announce("Only a knowledge maintainer can import or approve sources.");
      event.target.value = "";
      return;
    }
    const file = event.target.files?.[0];
    if (!file) return;
    if (!/\.(json|csv)$/i.test(file.name)) {
      announce("Choose a JSON or CSV source file.");
      event.target.value = "";
      return;
    }
    if (file.size > 1_000_000) {
      announce("Import files must be 1 MB or smaller.");
      event.target.value = "";
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const text = String(reader.result ?? "");
        let imported: Source[];
        if (file.name.toLowerCase().endsWith(".json")) {
          const parsed = JSON.parse(text);
          imported = Array.isArray(parsed) ? parsed : [parsed];
        } else {
          const rows = parseCsvRows(text);
          const header = rows.shift()?.map((x) => x.toLowerCase()) ?? [];
          const valueAt = (row: string[], key: string) => row[header.indexOf(key)] ?? "";
          const facts = rows.map((row, index) => ({ id: `IMP-${Date.now()}-${index}`, subject: valueAt(row, "subject"), attribute: valueAt(row, "attribute"), value: valueAt(row, "value"), unit: valueAt(row, "unit") || undefined, statement: valueAt(row, "statement") || `${valueAt(row, "subject")}: ${valueAt(row, "attribute")} — ${valueAt(row, "value")}`, sourceId: "SRC-IMPORT" }));
          imported = [{ id: `SRC-IMPORT-${Date.now()}`, title: file.name, kind: "PRODUCT_FACT", authority: 75, version: 1, effectiveFrom: new Date().toISOString().slice(0, 10), channels: ["social", "web", "email", "packaging"], owner: "Knowledge maintainer", approvalState: "PENDING_REVIEW", facts }];
        }
        if (!imported.every(isValidImportedSource)) throw new Error("Each source needs a valid owner, type, authority, effective date, channel and structured facts.");
        const ids = new Set(sources.map((source) => source.id));
        if (imported.some((source) => ids.has(source.id))) throw new Error("A source with the same ID already exists in this workspace.");
        imported = imported.map((source) => {
          const normalized = { ...source, revokedAt: undefined, approvalState: "PENDING_REVIEW" as const, facts: source.facts.map((fact) => ({ ...fact, sourceId: source.id })) };
          return { ...normalized, ingestionWarnings: sourceInjectionWarnings(normalized) };
        });
        setSources((current) => [...current, ...imported]);
        setReview(null);
        // Persist valid imported sources to PostgreSQL
        for (const s of imported) {
          if (!s.ingestionWarnings?.length) {
            fetch("/api/sources", {
              method: "POST",
              headers: getAuthHeaders({ "Content-Type": "application/json" }),
              body: JSON.stringify(s),
            }).catch((err) => console.error("Failed to persist imported source to database:", err));
          }
        }
        const quarantined = imported.filter((source) => source.ingestionWarnings?.length).length;
        announce(`${imported.length} knowledge source${imported.length === 1 ? "" : "s"} imported${quarantined ? `; ${quarantined} quarantined for embedded-instruction review` : ""}.`);
      } catch (error) {
        announce(error instanceof Error ? error.message : "Could not read this import.");
      }
    };
    reader.readAsText(file);
    event.target.value = "";
  }

  function approveSource(sourceId: string) {
    if (role !== "maintainer") {
      announce("Only a knowledge maintainer can approve a source.");
      return;
    }
    if (sources.find((source) => source.id === sourceId)?.ingestionWarnings?.length) {
      announce("This import is quarantined because it contains a possible embedded instruction. Remove it or resolve the content before approval.");
      return;
    }
    setSources((current) => current.map((source) => source.id === sourceId ? { ...source, approvalState: "APPROVED", version: source.version + 1 } : source));
    setReview(null);
    fetch("/api/sources", {
      method: "PATCH",
      headers: getAuthHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ id: sourceId, status: "APPROVED" }),
    }).catch(() => {});
    announce("Source approved as a new version. Previous review decisions are invalidated.");
  }

  function removeImportedSource(sourceId: string) {
    if (role !== "maintainer") return;
    setSources((current) => current.filter((source) => source.id !== sourceId));
    setReview(null);
    setLastDecision("");
    fetch("/api/sources", {
      method: "PATCH",
      headers: getAuthHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ id: sourceId, status: "REVOKED" }),
    }).catch(() => {});
    announce("Imported source removed from the workspace.");
  }

  async function handleKnowledgeDocument(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file) return;
    if (role !== "maintainer") {
      announce("Switch to Maintainer to add knowledge documents.");
      input.value = "";
      return;
    }
    setIsExtracting(true);
    setExtractionStatus("Reading knowledge document on this device…");
    try {
      const extracted = await extractUploadedFile(file, setExtractionStatus);
      const paragraphs = extracted.split(/\n{2,}/).map((part) => part.trim()).filter(Boolean);
      const chunks: string[] = [];
      let chunk = "";
      for (const paragraph of paragraphs) {
        if (chunk && `${chunk}\n\n${paragraph}`.length > 420) { chunks.push(chunk); chunk = ""; }
        chunk = chunk ? `${chunk}\n\n${paragraph}` : paragraph;
        while (chunk.length > 420) { const splitAt = chunk.lastIndexOf(" ", 420); const boundary = splitAt > 200 ? splitAt : 420; chunks.push(chunk.slice(0, boundary)); chunk = chunk.slice(boundary).trim(); }
      }
      if (chunk) chunks.push(chunk);
      if (!chunks.length || chunks.length > 48) throw new Error("This document needs to be split into smaller files (maximum 48 passages per upload).");
      const brand = currentProfileSource?.facts[0]?.subject ?? "Workspace";
      const sourceId = `SRC-DOC-${crypto.randomUUID()}`;
      const source: Source = {
        id: sourceId,
        title: file.name,
        kind: "GUIDELINE",
        authority: 60,
        version: 1,
        effectiveFrom: new Date().toISOString().slice(0, 10),
        channels: ["social", "web", "email", "packaging"],
        owner: "Knowledge maintainer",
        approvalState: "PENDING_REVIEW",
        facts: chunks.map((value, index) => ({ id: `${sourceId}-P${index + 1}`, subject: brand, attribute: "knowledge passage", value, statement: `Knowledge passage ${index + 1}: ${value}`, sourceId })),
      };
      const withWarnings = { ...source, ingestionWarnings: sourceInjectionWarnings(source) };
      setSources((current) => [...current, withWarnings]);
      setReview(null);
      if (!withWarnings.ingestionWarnings?.length) {
        fetch("/api/sources", {
          method: "POST",
          headers: getAuthHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify(source),
        }).catch((err) => console.error("Failed to persist source to database:", err));
      }
      setExtractionStatus(`${file.name} · ${chunks.length} passage${chunks.length === 1 ? "" : "s"} extracted. Pending maintainer review.`);
      announce(withWarnings.ingestionWarnings?.length ? "Document quarantined for a possible embedded instruction. Review or remove it before approval." : "Knowledge added as pending review. A maintainer must verify it before use.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "This document could not be read.";
      setExtractionStatus(message);
      announce(message);
    } finally {
      setIsExtracting(false);
      input.value = "";
    }
  }

  function beginProfileEdit() {
    if (role !== "maintainer") {
      announce("Switch the demo role to Maintainer to edit the brand profile.");
      return;
    }
    setProfileForm({
      voice: profileVoice,
      audience: profileAudience,
      avoidWording: profileAvoidTerms.join(", "),
      palette: profilePalette.join(", "),
    });
    setProfileEditing(true);
  }

  function saveBrandProfile() {
    if (role !== "maintainer" || !currentProfileSource) {
      announce("A maintainer role and current profile source are required.");
      return;
    }
    const voice = profileForm.voice.trim();
    const audience = profileForm.audience.trim();
    const avoidWording = profileForm.avoidWording.split(/[,;|]/).map((term) => term.trim()).filter(Boolean);
    const palette = profileForm.palette.split(/[,;|]/).map((color) => color.trim());
    if (!voice || voice.length > 200 || !audience || audience.length > 200 || avoidWording.length > 12 || avoidWording.some((term) => term.length > 60)) {
      announce("Add a voice and audience (200 characters max); list up to 12 avoided terms.");
      return;
    }
    if (palette.length < 3 || palette.length > 6 || palette.some((color) => !/^#(?:[\da-f]{3}|[\da-f]{6})$/i.test(color))) {
      announce("Enter 3 to 6 brand colors as hex codes, separated by commas.");
      return;
    }
    const values = new Map<string, string>([
      ["voice", voice],
      ["audience", audience],
      ["avoid wording", avoidWording.join(", ")],
      ["visual palette", palette.join(", ")],
    ]);
    const previous = currentProfileSource;
    const version = previous.version + 1;
    const now = new Date().toISOString();
    const archiveId = `${previous.id}-ARCHIVE-V${previous.version}`;
    const archived: Source = {
      ...previous,
      id: archiveId,
      title: `${previous.title} · archived v${previous.version}`,
      approvalState: "REVOKED",
      revokedAt: now,
      facts: previous.facts.map((fact, index) => ({ ...fact, id: `${archiveId}-F${index + 1}`, sourceId: archiveId })),
    };
    const nextSource: Source = {
      ...previous,
      version,
      effectiveFrom: now.slice(0, 10),
      approvalState: "APPROVED",
      revokedAt: undefined,
      facts: previous.facts.map((fact, index) => {
        const value = values.get(fact.attribute) ?? fact.value;
        return {
          ...fact,
          id: `${previous.id}-V${version}-F${index + 1}`,
          sourceId: previous.id,
          value,
          statement: `${fact.subject}: ${fact.attribute} — ${value}.`,
        };
      }),
    };
    setSources((current) => [...current.map((source) => source.id === previous.id ? nextSource : source), archived]);
    setReview(null);
    setLastDecision("");
    setProfileEditing(false);
    fetch("/api/sources", {
      method: "POST",
      headers: getAuthHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(nextSource),
    }).catch((err) => console.error("Failed to persist brand profile source:", err));
    announce(`Brand profile saved as approved version v${version}. Earlier reviews need a fresh check.`);
  }

  const activeSources = sources.filter((source) => source.approvalState === "APPROVED" && !source.revokedAt);
  const coverage = Math.round((activeSources.reduce((sum, source) => sum + source.facts.length, 0) / 40) * 100);
  const activeUserOrg = userOrganizations.find((o) => o.id === currentOrg);
  const currentBrandName = activeUserOrg ? activeUserOrg.name : (currentProfileSource?.facts[0]?.subject ?? (workspaceMode === "demo" ? "Sample Foods" : "Your brand"));

  return (
    <div className="app-shell">
      {showWelcome && (
        <div className="welcome-backdrop">
          <section className="welcome-card" role="dialog" aria-modal="true" aria-labelledby="welcome-title" style={{ position: "relative" }}>
            <button
              type="button"
              className="welcome-close-btn"
              onClick={() => setShowWelcome(false)}
              aria-label="Close workspace selector"
              title="Close"
              style={{
                position: "absolute",
                top: "16px",
                right: "16px",
                background: "rgba(255,255,255,0.08)",
                border: "1px solid rgba(255,255,255,0.15)",
                color: "#94a3b8",
                width: "28px",
                height: "28px",
                borderRadius: "50%",
                display: "grid",
                placeItems: "center",
                cursor: "pointer",
                fontSize: "13px",
                fontWeight: 600,
              }}
            >
              ✕
            </button>
            <div className="welcome-brand">
              <BrandMark />
              <span>OnBrand Enterprise</span>
              <span style={{ background: "#2563eb", color: "#fff", fontSize: "11px", fontWeight: "700", padding: "2px 8px", borderRadius: "4px", marginLeft: "8px" }}>ENTERPRISE</span>
            </div>
            <div className="eyebrow"><span className="eyebrow-dot" /> MULTI-TENANT BRAND GOVERNANCE</div>
            <h1 id="welcome-title">Select an Enterprise Workspace</h1>
            <p className="welcome-lead">
              OnBrand provides production-grade brand governance with multi-tenant data isolation, hosted semantic verification (C5), and automated visual &amp; accessibility checks. Select a workspace to explore:
            </p>

            {/* Phase 1 Part C: Judge Access Within 30 Seconds */}
            <div className="judge-access-card" style={{ marginBottom: "20px", padding: "16px", borderRadius: "10px", background: "rgba(56, 189, 248, 0.08)", border: "1px solid rgba(56, 189, 248, 0.25)" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <span style={{ fontSize: "16px" }}>⚡</span>
                  <b style={{ color: "#38bdf8", fontSize: "13px", letterSpacing: "0.02em" }}>JUDGE / EVALUATOR QUICK ACCESS (30s Entry)</b>
                </div>
                <span style={{ fontSize: "10px", background: "#0284c7", color: "#fff", padding: "2px 8px", borderRadius: "4px", fontWeight: "700" }}>SERVER-VERIFIED ROLES</span>
              </div>
              <p style={{ fontSize: "12px", opacity: 0.85, margin: "0 0 12px 0", lineHeight: 1.5 }}>
                One-click entry with genuine server-authenticated demo accounts and database-backed role permissions:
              </p>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "10px" }}>
                <button
                  type="button"
                  className="judge-role-btn"
                  onClick={() => signInAsDemo("creator")}
                  style={{ padding: "10px 14px", borderRadius: "8px", background: "#1e293b", border: "1px solid #334155", color: "#f8fafc", textAlign: "left", cursor: "pointer", display: "flex", flexDirection: "column", gap: "4px" }}
                >
                  <span style={{ fontWeight: "700", fontSize: "13px", color: "#38bdf8" }}>Sign in as Demo Creator →</span>
                  <span style={{ fontSize: "11px", opacity: 0.75 }}>Edit drafts &amp; submit reviews</span>
                </button>
                <button
                  type="button"
                  className="judge-role-btn"
                  onClick={() => signInAsDemo("reviewer")}
                  style={{ padding: "10px 14px", borderRadius: "8px", background: "#1e293b", border: "1px solid #334155", color: "#f8fafc", textAlign: "left", cursor: "pointer", display: "flex", flexDirection: "column", gap: "4px" }}
                >
                  <span style={{ fontWeight: "700", fontSize: "13px", color: "#34d399" }}>Sign in as Demo Reviewer →</span>
                  <span style={{ fontSize: "11px", opacity: 0.75 }}>Inspect findings &amp; approve</span>
                </button>
                <button
                  type="button"
                  className="judge-role-btn"
                  onClick={() => signInAsDemo("maintainer")}
                  style={{ padding: "10px 14px", borderRadius: "8px", background: "#1e293b", border: "1px solid #334155", color: "#f8fafc", textAlign: "left", cursor: "pointer", display: "flex", flexDirection: "column", gap: "4px" }}
                >
                  <span style={{ fontWeight: "700", fontSize: "13px", color: "#fbbf24" }}>Sign in as Demo Maintainer →</span>
                  <span style={{ fontSize: "11px", opacity: 0.75 }}>Import &amp; approve brand sources</span>
                </button>
              </div>
            </div>

            <div className="welcome-options">
              <button
                className="welcome-option"
                onClick={enterDemo}
                style={{ textAlign: "left", cursor: "pointer" }}
              >
                <span className="welcome-option-mark">✳</span>
                <b>Acme Foods (Enterprise Alpha)</b>
                <small>Consumer packaged goods workspace with multi-channel guidelines, FDA allergen disclosures, and brand color palette enforcement.</small>
                <span className="welcome-action">Launch Acme Workspace →</span>
              </button>
              <button
                className="welcome-option"
                onClick={() => {
                  switchOrg("org_beta");
                  setShowWelcome(false);
                }}
                style={{ textAlign: "left", cursor: "pointer" }}
              >
                <span className="welcome-option-mark" style={{ background: "#059669" }}>◈</span>
                <b>Nova Biopharma (Clinical Beta)</b>
                <small>Clinical trial claim governance, strict contraindication citations, and isolated tenant storage.</small>
                <span className="welcome-action">Launch NovaBio Workspace →</span>
              </button>
              <div className="welcome-option own-option">
                <span className="welcome-option-mark">＋</span>
                <b>Custom Enterprise Workspace</b>
                <small>Set brand voice, primary audience, and approved facts to provision a custom tenant workspace.</small>
                <form onSubmit={createOwnWorkspace}>
                  <label>Brand name<input required maxLength={100} value={ownBrandName} onChange={(event) => setOwnBrandName(event.target.value)} placeholder="e.g. Apex Health" /></label>
                  <label>Brand voice<input required maxLength={200} value={ownProfile.voice} onChange={(event) => setOwnProfile((current) => ({ ...current, voice: event.target.value }))} placeholder="e.g. clear, authoritative and warm" /></label>
                  <label>Who is your audience?<input required maxLength={200} value={ownProfile.audience} onChange={(event) => setOwnProfile((current) => ({ ...current, audience: event.target.value }))} placeholder="e.g. enterprise compliance teams" /></label>
                  <details>
                    <summary>Add optional guardrails</summary>
                    <label>Words to avoid<input value={ownProfile.avoidWording} onChange={(event) => setOwnProfile((current) => ({ ...current, avoidWording: event.target.value }))} placeholder="Comma-separated" /></label>
                    <label>Brand colors<input value={ownProfile.palette} onChange={(event) => setOwnProfile((current) => ({ ...current, palette: event.target.value }))} placeholder="#1A3D32, #F3EBDD, #C87552" /></label>
                  </details>
                  <button className="welcome-submit" type="submit">Create Workspace →</button>
                </form>
              </div>
            </div>
            <div className="welcome-capabilities" style={{ marginTop: "16px", padding: "12px", background: "rgba(255,255,255,0.04)", borderRadius: "8px" }}>
              <b style={{ color: "#38bdf8", display: "block", marginBottom: "4px" }}>Core Brand Verification Pipeline Active:</b>
              <span style={{ fontSize: "12px", opacity: 0.85, lineHeight: 1.5 }}>
                1. Document AST Ingestion · 2. Atomic Claim Segmentation · 3. Multi-Tenant Knowledge Retrieval · 4. Deterministic Precedence (C1–C4) · 5. Hosted Semantic Verifier (C5) · 6. Visual Intelligence &amp; WCAG Contrast · 7. Actionable Highlighting Engine · 8. Finding Consolidation · 9. Human Reviewer Decision Gate.
              </span>
            </div>
          </section>
        </div>
      )}
      {showOnboardingModal && (
        <div
          className="auth-modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="onboarding-modal-title"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.8)",
            backdropFilter: "blur(6px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
          }}
        >
          <div
            className="auth-modal-card"
            style={{
              background: "#161b22",
              border: "1px solid rgba(255,255,255,0.16)",
              borderRadius: "12px",
              padding: "28px",
              maxWidth: "460px",
              width: "90%",
              boxShadow: "0 24px 48px rgba(0,0,0,0.6)",
            }}
          >
            <div style={{ marginBottom: "20px" }}>
              <div style={{ display: "inline-flex", alignItems: "center", gap: "6px", background: "rgba(37,99,235,0.2)", color: "#60a5fa", padding: "3px 8px", borderRadius: "4px", fontSize: "11px", fontWeight: 600, marginBottom: "8px" }}>
                <span>◈</span> NEW WORKSPACE SETUP
              </div>
              <h3 id="onboarding-modal-title" style={{ margin: 0, fontSize: "20px", fontWeight: 600, color: "#fff" }}>
                Create Your Organization
              </h3>
              <p style={{ margin: "6px 0 0", fontSize: "13px", opacity: 0.75, color: "#cbd5e1", lineHeight: 1.5 }}>
                You are signed in as <strong>{supabaseSession?.user.email}</strong>. Create an organization workspace to start managing documents with verified tenant isolation.
              </p>
            </div>

            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (!newOrgName.trim()) return;
                setIsOnboardingLoading(true);
                setOnboardingError("");
                try {
                  const token = supabaseSession?.accessToken;
                  if (!token) throw new Error("Sign in required.");
                  const res = await fetch("/api/organizations", {
                    method: "POST",
                    headers: {
                      "Content-Type": "application/json",
                      Authorization: `Bearer ${token}`,
                    },
                    body: JSON.stringify({
                      name: newOrgName.trim(),
                      slug: newOrgSlug.trim() || undefined,
                    }),
                  });
                  const data = await res.json();
                  if (!res.ok) throw new Error(data.error || "Failed to create organization.");
                  const created = data.organization;
                  announce(`Organization ${created.name} created.`);
                  setNewOrgName("");
                  setNewOrgSlug("");
                  setShowOnboardingModal(false);
                  setCurrentOrg(created.id);
                  setRole("maintainer");
                  await refreshOrganizations(token);
                } catch (err) {
                  setOnboardingError(err instanceof Error ? err.message : "Failed to create organization.");
                } finally {
                  setIsOnboardingLoading(false);
                }
              }}
            >
              <div style={{ marginBottom: "14px" }}>
                <label style={{ display: "block", fontSize: "12px", fontWeight: 500, marginBottom: "4px", color: "#e2e8f0" }}>Organization Name *</label>
                <input
                  type="text"
                  required
                  value={newOrgName}
                  onChange={(e) => {
                    setNewOrgName(e.target.value);
                    if (!newOrgSlug || newOrgSlug === newOrgName.toLowerCase().replace(/[^a-z0-9]+/g, "-")) {
                      setNewOrgSlug(e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, "-"));
                    }
                  }}
                  placeholder="e.g. Apex Consumer Brands"
                  style={{
                    width: "100%",
                    background: "rgba(255,255,255,0.06)",
                    border: "1px solid rgba(255,255,255,0.15)",
                    borderRadius: "6px",
                    padding: "9px 12px",
                    color: "#fff",
                    fontSize: "13px",
                  }}
                />
              </div>

              <div style={{ marginBottom: "16px" }}>
                <label style={{ display: "block", fontSize: "12px", fontWeight: 500, marginBottom: "4px", color: "#e2e8f0" }}>Workspace Slug (URL Identifier)</label>
                <input
                  type="text"
                  value={newOrgSlug}
                  onChange={(e) => setNewOrgSlug(e.target.value)}
                  placeholder="e.g. apex-consumer-brands"
                  style={{
                    width: "100%",
                    background: "rgba(255,255,255,0.06)",
                    border: "1px solid rgba(255,255,255,0.15)",
                    borderRadius: "6px",
                    padding: "9px 12px",
                    color: "#fff",
                    fontSize: "13px",
                  }}
                />
                <small style={{ display: "block", fontSize: "11px", opacity: 0.6, marginTop: "4px" }}>
                  Used to generate your secure tenant partition and database scope.
                </small>
              </div>

              {onboardingError && (
                <div style={{ fontSize: "12px", color: "#f87171", background: "rgba(239,68,68,0.1)", padding: "8px 10px", borderRadius: "6px", marginBottom: "14px", border: "1px solid rgba(239,68,68,0.2)" }}>
                  {onboardingError}
                </div>
              )}

              <div style={{ display: "flex", gap: "10px", marginTop: "20px" }}>
                <button
                  type="submit"
                  disabled={isOnboardingLoading}
                  className="primary-button"
                  style={{ flex: 1, justifyContent: "center" }}
                >
                  {isOnboardingLoading ? "Creating Organization…" : "Create Organization & Workspace"}
                </button>
                <button
                  type="button"
                  className="quiet-button"
                  onClick={() => setShowOnboardingModal(false)}
                >
                  Skip for Now
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      <NavigationSidebar
        currentOrg={currentOrg}
        currentBrandName={currentBrandName}
        switchOrg={switchOrg}
        view={view}
        setView={setView}
        role={role}
        setRole={setRole}
        roleLabel={roleLabel}
        roleInitials={roleInitials}
        counts={counts}
        supabaseSession={supabaseSession}
        onOpenAuth={() => setShowAuthModal(true)}
        onOpenWelcome={() => setShowWelcome(true)}
        userOrganizations={userOrganizations}
      />

      <main className="main-area">
        <header className="topbar">
          <div className="breadcrumbs"><span>OnBrand</span><span className="crumb-slash">/</span><b>{view === "review" ? "Review queue" : view === "knowledge" ? "Knowledge base" : "Insights"}</b></div>
          <div className="topbar-right">
            <div className="tenant-selector" style={{ display: "inline-flex", alignItems: "center", gap: "6px", background: "rgba(255,255,255,0.06)", padding: "3px 8px", borderRadius: "6px", border: "1px solid rgba(255,255,255,0.1)" }}>
              <span style={{ fontSize: "11px", opacity: 0.7, fontWeight: 500 }}>TENANT:</span>
              <select
                value={currentOrg}
                onChange={(event) => switchOrg(event.target.value)}
                style={{ background: "transparent", color: "inherit", border: "none", fontSize: "12px", fontWeight: 600, cursor: "pointer", outline: "none" }}
                aria-label="Switch organization workspace"
              >
                {userOrganizations.length > 0 ? (
                  userOrganizations.map((org) => (
                    <option key={org.id} value={org.id} style={{ background: "#1c222c" }}>
                      {org.name} ({org.role})
                    </option>
                  ))
                ) : (
                  <>
                    <option value="org_alpha" style={{ background: "#1c222c" }}>Acme Foods (Demo)</option>
                    <option value="org_beta" style={{ background: "#1c222c" }}>Nova Biopharma (Demo)</option>
                  </>
                )}
              </select>
            </div>
            <div className="secure-indicator" title={backendHealth?.persistence ? `Database Status: ${backendHealth.persistence}` : undefined}>
              <span className="secure-dot" /> {backendHealth?.persistence === "postgresql-ready" ? "PostgreSQL Scoped" : currentOrg === "org_alpha" ? "Acme (PostgreSQL Scoped)" : "NovaBio (PostgreSQL Scoped)"}
            </div>
            {isWorkspaceLoading && (
              <span className="sync-chip" style={{ fontSize: "11px", color: "#60a5fa", display: "inline-flex", alignItems: "center", gap: "4px", background: "rgba(59,130,246,0.1)", padding: "2px 6px", borderRadius: "4px" }}>
                <span className="spinner" style={{ width: "8px", height: "8px", borderWidth: "1.5px" }} /> Syncing DB…
              </span>
            )}
            {workspaceSyncError && (
              <span className="sync-chip" style={{ fontSize: "11px", color: "#f87171", background: "rgba(239,68,68,0.1)", padding: "2px 6px", borderRadius: "4px" }} title={workspaceSyncError}>
                Sync Notice
              </span>
            )}
            {supabaseSession ? (
              <button
                type="button"
                className="auth-status-chip"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  background: "rgba(16,185,129,0.12)",
                  color: "#34d399",
                  border: "1px solid rgba(16,185,129,0.3)",
                  borderRadius: "6px",
                  padding: "4px 8px",
                  fontSize: "12px",
                  fontWeight: 500,
                  cursor: "pointer",
                }}
                onClick={() => setShowAuthModal(true)}
                title="Click to view verified session or sign out"
              >
                <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#10b981" }} />
                {supabaseSession.user.email ? supabaseSession.user.email.split("@")[0] : "Verified"}
              </button>
            ) : (
              <button
                type="button"
                className="auth-signin-chip"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  background: "rgba(79,143,255,0.12)",
                  color: "#70a6ff",
                  border: "1px solid rgba(79,143,255,0.3)",
                  borderRadius: "6px",
                  padding: "4px 10px",
                  fontSize: "12px",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
                onClick={() => setShowAuthModal(true)}
              >
                Sign In
              </button>
            )}
            <label className="role-select-label">Role <select value={role} onChange={(event) => setRole(event.target.value as Role)} aria-label="Switch user role"><option value="reviewer">Reviewer</option><option value="creator">Creator</option><option value="maintainer">Maintainer</option></select></label>
            <button className="avatar-button" aria-label={roleLabel(role)} onClick={() => setShowAuthModal(true)}>{roleInitials(role)}</button>
          </div>
        </header>

        {view === "review" ? <>
          <div className="page-heading">
            <div><div className="eyebrow"><span className="eyebrow-dot" /> PRE-PUBLICATION CHECK</div><h1>{review ? `Review: ${draft.title} v${draft.version}` : "Review workspace"}</h1><p>One calm, evidence-led pass before your content goes live.</p></div>
            <div className="heading-actions"><button className="quiet-button" onClick={() => setShowAudit((v) => !v)}><span className="history-icon">◷</span> {showAudit ? "Hide history" : "Version history"}</button><button className="primary-button" onClick={runReview} disabled={isReviewing}>{isReviewing ? <><span className="spinner" /> Checking evidence…</> : <><span className="sparkle">✳</span> Run review</>}</button></div>
          </div>
          <ol className="workflow-stepper" aria-label="Review progress">
            {["Draft", "Check evidence", "Fix & recheck", "Human decision"].map((label, index) => {
              const complete = index < currentWorkflowStep;
              const current = index === currentWorkflowStep;
              return <li key={label} className={`workflow-step ${complete ? "complete" : current ? "current" : "pending"}`} aria-current={current ? "step" : undefined}><span className="workflow-marker">{complete ? "✓" : index + 1}</span><span className="workflow-label">{label}</span></li>;
            })}
          </ol>
          {workspaceMode === "own" && activeSources.length <= 1 && <div className="next-step-banner"><span className="next-step-number">1</span><div><b>Start by adding your approved brand knowledge</b><small>Bring in your claims, product facts, policies or guidelines. Review each passage and approve it before running a content check.</small></div><button className="small-ghost" onClick={() => setView("knowledge")}>Set up knowledge <Icon name="arrow" /></button></div>}
          {!hasCurrentReview && review && <div className="stale-banner"><span>↻</span> This draft or its approved knowledge changed. The previous decision is no longer current. Run a fresh review.</div>}
          {showAudit && (
            <div className="history-strip">
              <b>Version history</b>
              {versions.slice().reverse().map((item) => (
                <button
                  key={`${item.id}-${item.version}-${item.hash}`}
                  type="button"
                  className={`history-chip ${item.hash === draft.hash && item.version === draft.version ? "history-current" : ""}`}
                  onClick={() => selectVersion(item)}
                  title={`Inspect version v${item.version} (${item.hash.slice(0, 10)})`}
                >
                  v{item.version} · {item.hash.slice(0, 10)}
                </button>
              ))}
              {review && <span>Last review · {new Date(review.createdAt).toLocaleString()}</span>}
            </div>
          )}

          <section className="summary-strip" aria-label="Review overview">
            <div className="summary-title"><span className="summary-icon">◉</span><div><b>{review ? hasCurrentReview ? "Review ready" : "Review out of date" : "Draft ready for review"}</b><small>{review ? hasCurrentReview ? `${findings.length} claims checked · evidence snapshot locked` : "Refresh the report before a decision" : "Add or edit content, then run an evidence check"}</small></div></div>
            <div className="summary-metric"><b>{findings.length || "—"}</b><small>CLAIMS CHECKED</small></div><div className="summary-metric"><b className={counts.blocking ? "metric-warn" : ""}>{review ? counts.blocking : "—"}</b><small>NEEDS ATTENTION</small></div><div className="summary-metric"><b>{review ? `${counts.supported}/${findings.length}` : "—"}</b><small>EVIDENCE-ALIGNED</small></div>
          </section>

          <section className="review-workspace-layout">
            {/* Centre Viewer Column (~65% width) */}
            <div className="centre-viewer-column">
              <ReviewToolbar
                documentTitle={draft.originalDocumentName || draft.title}
                documentType={draft.originalDocumentType}
                hasOriginalFile={Boolean(draft.originalDocumentKey && draft.originalDocumentName)}
                version={draft.version}
                isSavingVersion={versions[versions.length - 1]?.hash === draft.hash}
                onSaveVersion={saveVersion}
                editorMode={editorMode}
                setEditorMode={setEditorMode}
                actionableCount={actionableList.length}
                currentFindingIndex={currentFindingIndex}
                onStepFinding={handleStepFinding}
                isReviewing={isReviewing}
                onRunReview={runReview}
                onFileUpload={handleDraftFileUpload}
                isExtracting={isExtracting}
                extractionStatus={extractionStatus}
                showAudit={showAudit}
                onToggleAudit={() => setShowAudit((v) => !v)}
              />

              <ContentViewer
                draft={{
                  title: draft.title,
                  content: draft.content,
                  originalDocumentKey: draft.originalDocumentKey,
                  originalDocumentName: draft.originalDocumentName,
                  originalDocumentType: draft.originalDocumentType,
                }}
                editorMode={editorMode}
                findings={findings}
                selectedFindingId={selected?.finding_id ?? null}
                onSelectFindingId={(id) => {
                  const target = enrichedList.find((f) => f.finding_id === id || f.id === id || f.rawFindingId === id);
                  if (target) selectFinding(target);
                  else setSelectedFinding(id);
                }}
                hasCurrentReview={hasCurrentReview}
                structuralData={structuralData}
                onUpdateContent={(updated) => {
                  updateDraftContent(updated);
                  announce("Document content updated in interactive viewer.");
                }}
                actionableRanges={actionableRanges}
                enrichedList={enrichedList}
                directFile={uploadedFile ?? undefined}
                onSetEditorMode={setEditorMode}
              />

              {/* Review Context & Channel Metadata */}
              <details className="review-context-drawer">
                <summary className="review-context-summary">
                  <span>⚙ Review Context &amp; Channel Metadata</span>
                  <small>{draft.channel} · {draft.audience || "General audience"} · {draft.publicationDate || "No date"}</small>
                </summary>
                <div className="review-context-content">
                  <div className="context-row">
                    <span>Publication channel</span>
                    <select value={draft.channel} onChange={(event) => updateDraftMetadata({ channel: event.target.value })}>
                      <option value="social">Social media</option>
                      <option value="web">Website</option>
                      <option value="email">Email</option>
                      <option value="packaging">Packaging</option>
                    </select>
                  </div>
                  <div className="context-row">
                    <span>Audience</span>
                    <input value={draft.audience} onChange={(event) => updateDraftMetadata({ audience: event.target.value })} />
                  </div>
                  <div className="context-row">
                    <span>Publication date</span>
                    <input type="date" value={draft.publicationDate} onChange={(event) => updateDraftMetadata({ publicationDate: event.target.value })} />
                  </div>
                </div>
              </details>
            </div>

            {/* Right Intelligence Column (~35% width) */}
            <aside className="right-intelligence-column">
              {/* Compact Agent Activity */}
              <AgentActivityPanel
                isReviewing={isReviewing}
                hasCurrentReview={hasCurrentReview}
                hasCurrentDecision={hasCurrentDecision}
                blockingCount={counts.blocking}
                agentNotes={review?.agentNotes}
                modelDisclosure={modelDisclosure}
                engineMode={review?.engineMode}
              />

              {/* Findings Panel: Detail View when a finding is selected, List View otherwise */}
              {selectedEnriched ? (
                <FindingDetailPanel
                  finding={selectedEnriched}
                  onBack={() => setSelectedFinding(null)}
                  onApplySuggestion={handleApplySuggestion}
                  onDismissFinding={openDismissModal}
                  onEscalate={(fId) => announce(`Finding ${fId} marked for senior legal/medical escalation.`)}
                  activeOccurrenceIndex={activeOccurrenceMap[selectedEnriched.finding_id] ?? 0}
                  onStepOccurrence={(delta) => stepOccurrence(selectedEnriched, delta)}
                />
              ) : (
                <FindingsPanel
                  findings={enrichedList}
                  actionableList={actionableList}
                  filteredList={filteredEnrichedList}
                  selectedFindingId={selected?.finding_id ?? null}
                  onSelectFinding={(f) => selectFinding(f)}
                  activeFilter={productFilter}
                  onSetFilter={(filterId) => setProductFilter(filterId as typeof productFilter)}
                  hasRunReview={Boolean(review)}
                  onRunReview={runReview}
                  summaryCounts={summaryCounts}
                />
              )}

              {/* Human Reviewer Governance Gate */}
              <div className="decision-area">
                {review && (
                  <div className="assignment-row" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px", fontSize: "11px" }}>
                    <label htmlFor="review-assignee" style={{ fontWeight: 600, color: "#475569" }}>Assigned Reviewer:</label>
                    <select
                      id="review-assignee"
                      value={review.assignedTo ?? "Workspace reviewer"}
                      onChange={(event) => assignReviewer(event.target.value)}
                      disabled={role !== "reviewer"}
                      style={{ fontSize: "11px", padding: "2px 6px", borderRadius: "4px", border: "1px solid #cbd5e1", background: "#fff" }}
                    >
                      <option>Workspace reviewer</option>
                      <option>Backup reviewer</option>
                    </select>
                  </div>
                )}
                <div className="decision-boundary">
                  <span className="lock-icon">⌑</span>
                  <p>AI recommends. <b>People decide.</b><br />Nothing is published from this workspace.</p>
                </div>
                <div className="decision-actions">
                  <button className="request-button" onClick={() => makeDecision("CHANGES_REQUESTED")} disabled={!hasCurrentReview || (role !== "reviewer" && role !== "maintainer")}>
                    Request changes
                  </button>
                  <button
                    className="approve-button"
                    onClick={() => makeDecision("APPROVED")}
                    disabled={!hasCurrentReview || (role !== "reviewer" && role !== "maintainer") || counts.blocking > 0 || counts.unsupported > 0}
                    title={approvalDisabledReason || undefined}
                    aria-describedby={approvalDisabledReason ? "approval-disabled-reason" : undefined}
                  >
                    <Icon name="check" /> Approve version
                  </button>
                </div>
                {approvalDisabledReason && <div className="role-hint" id="approval-disabled-reason">{approvalDisabledReason}</div>}
                {review?.decision && (
                  <button className="reopen-button" onClick={reopenDecision} disabled={(role !== "reviewer" && role !== "maintainer") || !hasCurrentReview}>
                    Reopen {review.decision.state.replaceAll("_", " ").toLowerCase()}
                  </button>
                )}
                {review?.decisionHistory?.length ? (
                  <details className="decision-history">
                    <summary>Decision audit · {review.decisionHistory.length} event{review.decisionHistory.length === 1 ? "" : "s"}</summary>
                    {review.decisionHistory.slice().reverse().map((event, index) => (
                      <div className="audit-event" key={`${event.at}-${index}`}>
                        <b>{event.action === "DECISION_REOPENED" ? "Decision reopened" : event.state?.replaceAll("_", " ")}</b>
                        <span>{event.by} · {new Date(event.at).toLocaleString()}</span>
                        <small>Draft {event.draftHash.slice(0, 8)} · knowledge {event.sourceSnapshotHash.slice(0, 8)}</small>
                      </div>
                    ))}
                  </details>
                ) : null}
                {lastDecision && <div className="decision-record">Recorded: {lastDecision} · hash {draft.hash.slice(0, 8)}</div>}
              </div>

              {/* Review Thread Comments */}
              <div className="review-thread-section">
                <details className="comments-drawer" open={Boolean(review?.comments?.length)}>
                  <summary className="comments-drawer-summary">
                    <span>💬 Review Thread ({review?.comments.length ?? 0})</span>
                  </summary>
                  <div className="comments-body">
                    {review?.comments.map((item) => (
                      <div className="comment-item" key={item.id}>
                        <b>{item.author}</b>
                        {item.draftVersionId && <span className="comment-context">{item.draftVersionId} · {item.draftHash?.slice(0, 8)}</span>}
                        <small>{item.text}</small>
                        {item.resolved ? (
                          <span className="comment-resolved">Resolved</span>
                        ) : (
                          role === "reviewer" && <button className="comment-resolve" onClick={() => resolveComment(item.id)}>Resolve</button>
                        )}
                      </div>
                    ))}
                    <div className="comment-entry">
                      <input
                        value={comment}
                        onChange={(event) => setComment(event.target.value)}
                        onKeyDown={(event) => event.key === "Enter" && addComment()}
                        placeholder="Add a comment…"
                        aria-label="Add a review comment"
                      />
                      <button onClick={addComment} aria-label="Post comment">↗</button>
                    </div>
                  </div>
                </details>
              </div>
            </aside>
          </section>
          {dismissModalFindingId && (
            <div className="dismiss-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="dismiss-title">
              <div className="dismiss-modal">
                <h3 id="dismiss-title">Dismiss Finding with Justification</h3>
                <p>Enterprise governance requires an audit-logged reason before dismissing a non-compliant or ungrounded finding.</p>
                <input
                  type="text"
                  placeholder="Enter justification (e.g. Legal approved seasonal exception)..."
                  value={dismissReasonInput}
                  onChange={(e) => setDismissReasonInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && confirmDismiss()}
                  autoFocus
                />
                <div className="dismiss-modal-actions">
                  <button type="button" className="quiet-button" onClick={() => setDismissModalFindingId(null)}>
                    Cancel
                  </button>
                  <button type="button" className="primary-button" onClick={confirmDismiss}>
                    Confirm Dismiss
                  </button>
                </div>
              </div>
            </div>
          )}
        </> : view === "knowledge" ? <>
          <div className="page-heading"><div><div className="eyebrow"><span className="eyebrow-dot" /> APPROVED ORGANISATIONAL MEMORY</div><h1>Knowledge base</h1><p>Current, owned sources that ground this review.</p></div><div className="heading-actions"><label className={`quiet-button import-button ${role !== "maintainer" ? "disabled-label" : ""}`}><Icon name="upload" /> Add a knowledge document<input type="file" accept=".docx,.pdf,.png,.jpg,.jpeg,.webp,.bmp,.tif,.tiff,.txt,.md,.markdown,.html,.htm" onChange={handleKnowledgeDocument} disabled={role !== "maintainer" || isExtracting} /></label><label className={`primary-button import-button ${role !== "maintainer" ? "disabled-label" : ""}`}><Icon name="upload" /> Import JSON/CSV<input type="file" accept=".json,.csv" onChange={handleImport} disabled={role !== "maintainer"} /></label></div></div>
          {extractionStatus && <div className="knowledge-upload-status" aria-live="polite">{extractionStatus}<small>Uploaded knowledge is always pending review. Check its source and passages, then a maintainer may approve it. Embedded instructions are quarantined.</small></div>}
          <div className="knowledge-summary"><div className="knowledge-stat"><span className="stat-mark">▤</span><div><b>{activeSources.length}</b><small>ACTIVE SOURCES</small></div></div><div className="knowledge-stat"><span className="stat-mark">◈</span><div><b>{activeSources.reduce((sum, source) => sum + source.facts.length, 0)}</b><small>APPROVED PASSAGES / FACTS</small></div></div><div className="knowledge-stat"><span className="stat-mark">◎</span><div><b>{currentProfileSource ? "1" : "0"}</b><small>BRAND PROFILE</small></div></div><div className="coverage-card"><div><b>{workspaceMode === "demo" ? "Demo knowledge coverage" : "Approved knowledge"}</b><small>{workspaceMode === "demo" ? "Sample set indicator · not a quality score" : `${Math.max(0, activeSources.length - 1)} approved knowledge document${activeSources.length - 1 === 1 ? "" : "s"}; pending documents are excluded`}</small></div>{workspaceMode === "demo" ? <><div className="coverage-bar"><span style={{ width: `${Math.min(coverage, 100)}%` }} /></div><strong>{Math.min(coverage, 100)}%</strong></> : <strong>{activeSources.length > 1 ? "Ready" : "Add sources"}</strong>}</div></div>
          <section className="knowledge-layout"><div className="panel source-table-panel"><div className="panel-header"><div><span className="panel-kicker">SOURCE REGISTER</span><h2>Approved sources</h2></div><button type="button" className="quiet-button" onClick={() => setShowVersioningInfo((v) => !v)}>How versioning works {showVersioningInfo ? "▴" : "▾"}</button></div>{showVersioningInfo && <div className="versioning-help-card" style={{ margin: "0 15px 12px", padding: "10px 14px", background: "rgba(59,130,246,0.06)", border: "1px solid rgba(59,130,246,0.2)", borderRadius: "6px", fontSize: "12px", lineHeight: "1.5" }}><b style={{ color: "#60a5fa", display: "block", marginBottom: "3px" }}>Immutable Source Snapshot Policy:</b><span>Approved sources are cryptographically fingerprinted. When a source is modified or replaced, earlier review decisions are immediately marked out of date to prevent stale approvals. Imported sources enter a maintainer approval queue before they can substantiate claims.</span></div>}<div className="table-wrap"><table className="source-table"><thead><tr><th>SOURCE</th><th>TYPE</th><th>VERSION</th><th>OWNER</th><th>STATUS</th><th>ACCESS</th></tr></thead><tbody>{sources.length === 0 ? <tr><td colSpan={6} style={{ textAlign: "center", padding: "40px 16px" }}><div style={{ maxWidth: "420px", margin: "0 auto" }}><span style={{ fontSize: "32px", display: "block", marginBottom: "8px" }}>📚</span><b style={{ fontSize: "15px", color: "var(--foreground, #1e293b)", display: "block" }}>No Sources Registered Yet</b><p style={{ margin: "6px 0 14px", fontSize: "12px", opacity: 0.8, lineHeight: "1.5" }}>Approved sources form your organization’s grounded knowledge base. Claims in reviewed drafts are checked against these facts and guidelines.</p>{role === "maintainer" ? <label className="primary-button" style={{ display: "inline-flex", cursor: "pointer", padding: "6px 14px", fontSize: "12px" }}><Icon name="upload" /> Add Knowledge Document<input type="file" accept=".docx,.pdf,.png,.jpg,.jpeg,.webp,.txt,.md,.html,.csv,.json" onChange={handleKnowledgeDocument} style={{ display: "none" }} /></label> : <small style={{ color: "#d97706", display: "block" }}>Switch to Maintainer role to upload or approve sources.</small>}</div></td></tr> : sources.map((source) => { const approved = source.approvalState === "APPROVED" && !source.revokedAt; const revoked = source.approvalState === "REVOKED" || Boolean(source.revokedAt); const quarantined = Boolean(source.ingestionWarnings?.length); return <tr key={source.id}><td><span className="table-doc">▤</span><span className="source-name"><b>{source.title}</b><small>{quarantined ? "Possible embedded instruction · quarantined" : `${source.facts.length} ${source.kind === "GUIDELINE" ? "passages" : "structured facts"} · ${source.channels.slice(0, 2).join(", ")}`}</small><details className="source-preview"><summary>Preview {Math.min(3, source.facts.length)} of {source.facts.length} passages</summary>{source.facts.slice(0, 3).map((fact) => <blockquote key={fact.id}>{fact.value || fact.statement}</blockquote>)}{source.facts.length > 3 && <small>Showing first 3 passages. The full source is retained in this browser.</small>}</details></span></td><td><span className="kind-pill">{source.kind.replaceAll("_", " ")}</span></td><td>v{source.version}</td><td>{source.owner}</td><td><span className={approved ? "validity-active" : "validity-revoked"}><i />{approved ? "Approved" : quarantined ? "Quarantined" : revoked ? "Archived" : "Pending review"}</span></td><td>{source.approvalState === "PENDING_REVIEW" && role === "maintainer" ? quarantined ? <button className="comment-resolve" onClick={() => removeImportedSource(source.id)}>Remove</button> : <button className="table-approve" onClick={() => approveSource(source.id)}>Approve</button> : <span className="small-note">{revoked ? "Archived" : source.approvalState === "PENDING_REVIEW" ? "Maintainer only" : "In use"}</span>}</td></tr>; })}</tbody></table></div><div className="panel-footnote">Source updates invalidate earlier reviews. Revoked or out-of-date sources cannot support an automatic pass.</div></div>
            <aside className="panel profile-panel"><span className="panel-kicker">{workspaceMode === "demo" ? "SYNTHETIC CLIENT PROFILE" : "YOUR BRAND PROFILE"}</span><h2>{currentBrandName}</h2><p className="profile-intro">{workspaceMode === "demo" ? "Fictional demo brand used to demonstrate OnBrand’s review workflow." : "This profile stays in this browser and guides review context."}</p>{profileEditing ? <div className="profile-editor"><label>Brand voice<input value={profileForm.voice} onChange={(event) => setProfileForm((current) => ({ ...current, voice: event.target.value }))} maxLength={200} /></label><label>Primary audience<input value={profileForm.audience} onChange={(event) => setProfileForm((current) => ({ ...current, audience: event.target.value }))} maxLength={200} /></label><label>Words to avoid<input value={profileForm.avoidWording} onChange={(event) => setProfileForm((current) => ({ ...current, avoidWording: event.target.value }))} maxLength={400} /><small>Separate terms with commas. They are checked in each new review.</small></label><label>Brand palette<input value={profileForm.palette} onChange={(event) => setProfileForm((current) => ({ ...current, palette: event.target.value }))} maxLength={120} /><small>Enter 3–6 hex colors, separated by commas.</small></label><p className="profile-form-note">Saving creates a new approved knowledge version and archives the previous one. Brand palette colors and contrast are automatically inspected against uploaded drafts via the Visual Intelligence &amp; Multimodal Accessibility engine.</p><div className="profile-editor-actions"><button className="quiet-button" onClick={() => setProfileEditing(false)}>Cancel</button><button className="table-approve" onClick={saveBrandProfile}>Save version</button></div></div> : <><div className="profile-version">APPROVED KNOWLEDGE · V{currentProfileSource?.version ?? 1}</div><div className="profile-field"><small>VOICE</small><b>{profileVoice}</b></div><div className="profile-field"><small>AUDIENCE</small><b>{profileAudience}</b></div><div className="profile-field"><small>AVOID</small><div className="word-tags">{profileAvoidTerms.map((term) => <span key={term}>{term}</span>)}</div></div><div className="profile-field"><small>APPROVED PALETTE</small>{profilePalette.length ? <div className="palette-row">{profilePalette.map((color) => <span key={color} title={color} style={{ background: color }} />)}</div> : <b>Not provided</b>}</div><button className="small-ghost full-width" onClick={beginProfileEdit}>{role === "maintainer" ? "Edit profile" : "Edit profile · Maintainer role"} <Icon name="arrow" /></button></>}</aside>
          </section>
          <section className="panel rules-panel"><div className="panel-header"><div><span className="panel-kicker">{workspaceMode === "demo" ? "DEMO POLICY LAYER" : "YOUR REVIEW CONTROLS"}</span><h2>{workspaceMode === "demo" ? "Sample Foods review rules" : "How your own-brand review works"}</h2></div><span className="rules-count">{workspaceMode === "demo" ? `${seedRules.length} demo rules` : "Your approved knowledge"}</span></div>{workspaceMode === "demo" ? <div className="rules-grid">{seedRules.map((rule) => <div className="rule-row" key={rule.id}><span className="rule-check">✓</span><div><b>{rule.label}</b><small>{rule.id} · Sample Foods demo policy</small></div></div>)}</div> : <div className="own-policy-note"><p>Sample Foods rules are switched off in your workspace. OnBrand checks claims against the knowledge you add and approve, and checks your “words to avoid” list.</p><p>General claim meaning and design checks remain limited in this deterministic build. Review each suggestion and evidence passage yourself before approval.</p><button className="small-ghost" onClick={() => setView("review")}>Go to content review <Icon name="arrow" /></button></div>}</section>
        </> : <>
          <div className="page-heading">
            <div>
              <div className="eyebrow"><span className="eyebrow-dot" /> GOVERNANCE SIGNALS</div>
              <h1>Governance Analytics</h1>
              <p>Actionable patterns and category compliance across enterprise content.</p>
            </div>
            <span className="demo-badge">REAL-TIME SIGNALS</span>
          </div>
          <div className="insights-cards">
            <div className="insight-metric">
              <span>01 / COMPLIANCE HEALTH</span>
              <strong>{review ? Math.max(0, 100 - summaryCounts.critical * 25 - summaryCounts.high * 15 - summaryCounts.medium * 5) : "—"}<small>/100</small></strong>
              <p>Computed from active document findings and severity weightings.</p>
            </div>
            <div className="insight-metric">
              <span>02 / EVIDENCE GAPS</span>
              <strong>{summaryCounts.unsupported}</strong>
              <p>Claims lacking approved source evidence in this review.</p>
            </div>
            <div className="insight-metric">
              <span>03 / ACTIONABLE VIOLATIONS</span>
              <strong>{summaryCounts.totalActionable}</strong>
              <p>Confirmed rule breaches and unsupported statements requiring resolution.</p>
            </div>
          </div>
          <section className="panel insight-panel">
            <div className="panel-header">
              <div><span className="panel-kicker">GOVERNANCE BREAKDOWN</span><h2>Findings by Governance Category</h2></div>
              <span className="small-note">{enrichedList.length} total claims analyzed</span>
            </div>
            <div className="insight-list">
              {[
                { name: "Brand Consistency & Tone", count: enrichedList.filter((f) => f.category === "BRAND_CONSISTENCY").length, note: "Adherence to approved brand voice and prohibited vocabulary." },
                { name: "Factual Accuracy & Grounding", count: enrichedList.filter((f) => f.category === "FACTUAL_ACCURACY").length, note: "Product attributes and claims verified against approved knowledge." },
                { name: "Promotional & Regulatory Compliance", count: enrichedList.filter((f) => f.category === "PROMOTIONAL_COMPLIANCE").length, note: "Mandatory disclosures, disclaimers, and warranty terms." },
                { name: "Visual Identity & Palette", count: enrichedList.filter((f) => f.category === "VISUAL_IDENTITY").length, note: "Approved brand hex colors, logo usage, and styling rules." },
                { name: "Accessibility & WCAG Contrast", count: enrichedList.filter((f) => f.category === "ACCESSIBILITY").length, note: "WCAG 2.1 AA text-to-background contrast ratios and readability." },
                { name: "Security & Confidentiality", count: enrichedList.filter((f) => f.category === "SECURITY_CONFIDENTIALITY").length, note: "Protection against prompt injection and sensitive data exposure." },
              ].map((item) => (
                <div className="insight-row" key={item.name}>
                  <div className="insight-icon">◉</div>
                  <div className="insight-name"><b>{item.name}</b><small>{item.note}</small></div>
                  <span className="insight-number">{item.count}</span>
                </div>
              ))}
            </div>
            <div className="insight-disclaimer">Governance analytics reflect verified findings from active document scans and multi-tenant policy rules.</div>
          </section>
        </>}

        <footer className="app-footer"><span>OnBrand Enterprise · Intelligent AI Brand Governance Platform. <button onClick={resetDemo}>Reset workspace</button></span><span><span className="footer-lock">⌑</span> Human in Control · Enforced Pre-Publication Gate <span className="footer-sep">·</span> <button onClick={() => announce(modelDisclosure)}>AI disclosure</button></span></footer>
      </main>
      {toast && (
        <div className={`toast ${/error|fail|reject|invalid|stale|cannot/i.test(toast) ? "toast-warn" : "toast-success"}`} role="status">
          <span className="toast-mark">{/error|fail|reject|invalid|stale|cannot/i.test(toast) ? "⚠" : "✓"}</span>
          {toast}
        </div>
      )}

      {showAuthModal && (
        <div
          className="auth-modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="auth-modal-title"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.75)",
            backdropFilter: "blur(4px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
          }}
        >
          <div
            className="auth-modal-card"
            style={{
              background: "#161b22",
              border: "1px solid rgba(255,255,255,0.14)",
              borderRadius: "12px",
              padding: "24px",
              maxWidth: "420px",
              width: "90%",
              boxShadow: "0 20px 40px rgba(0,0,0,0.5)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "16px" }}>
              <div>
                <h3 id="auth-modal-title" style={{ margin: 0, fontSize: "18px", fontWeight: 600, color: "#fff" }}>
                  {supabaseSession ? "Active Session" : authMode === "signin" ? "Sign In to OnBrand" : "Create Enterprise Account"}
                </h3>
                <p style={{ margin: "4px 0 0", fontSize: "12px", opacity: 0.7, color: "#cbd5e1" }}>
                  {supabaseSession
                    ? "Your session is verified via Supabase Auth & PostgreSQL RLS."
                    : "Access verified organization workspaces with server-enforced RBAC."}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowAuthModal(false);
                  setAuthStatusMessage("");
                }}
                style={{ background: "transparent", border: "none", color: "#94a3b8", cursor: "pointer", fontSize: "20px" }}
                aria-label="Close"
              >
                ×
              </button>
            </div>

            {supabaseSession ? (
              <div>
                <div style={{ background: "rgba(255,255,255,0.04)", padding: "12px", borderRadius: "8px", marginBottom: "16px" }}>
                  <div style={{ fontSize: "12px", opacity: 0.6 }}>Signed in as</div>
                  <div style={{ fontSize: "14px", fontWeight: 600, marginTop: "2px" }}>{supabaseSession.user.email}</div>
                  <div style={{ fontSize: "11px", opacity: 0.6, marginTop: "6px" }}>User ID: {supabaseSession.user.id}</div>
                  <div style={{ fontSize: "11px", opacity: 0.6 }}>Active Org: {activeUserOrg ? activeUserOrg.name : currentOrg === "org_beta" ? "Nova Biopharma" : "Acme Foods"}</div>
                  {userOrganizations.length > 0 && (
                    <div style={{ marginTop: "10px", borderTop: "1px solid rgba(255,255,255,0.1)", paddingTop: "8px" }}>
                      <div style={{ fontSize: "11px", fontWeight: 600, color: "#94a3b8", marginBottom: "4px" }}>Your Organizations ({userOrganizations.length}):</div>
                      {userOrganizations.map((org) => (
                        <div key={org.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "4px 0", fontSize: "12px" }}>
                          <span>{org.name} <small style={{ opacity: 0.6 }}>({org.role})</small></span>
                          {currentOrg === org.id ? (
                            <span style={{ color: "#34d399", fontSize: "11px" }}>● Active</span>
                          ) : (
                            <button type="button" className="text-button" style={{ fontSize: "11px", padding: 0 }} onClick={() => switchOrg(org.id)}>Switch</button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                  <div style={{ marginTop: "10px", textAlign: "right" }}>
                    <button
                      type="button"
                      className="text-button"
                      style={{ fontSize: "11px", color: "#60a5fa" }}
                      onClick={() => {
                        setShowAuthModal(false);
                        setShowOnboardingModal(true);
                      }}
                    >
                      + Create another organization
                    </button>
                  </div>
                </div>
                <button
                  type="button"
                  className="primary-button"
                  style={{ width: "100%", justifyContent: "center", background: "#ef4444", borderColor: "#dc2626" }}
                  onClick={async () => {
                    const supabase = getBrowserSupabase();
                    if (supabase) await supabase.auth.signOut();
                    setSupabaseSession(null);
                    setShowAuthModal(false);
                    announce("Signed out successfully.");
                  }}
                >
                  Sign Out
                </button>
              </div>
            ) : (
              <div>
                {/* One-Click Demo Login for Judges and Evaluators */}
                <div style={{ marginBottom: "16px", padding: "12px", background: "rgba(37,99,235,0.08)", border: "1px solid rgba(37,99,235,0.25)", borderRadius: "8px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                    <span style={{ fontSize: "11px", fontWeight: "700", color: "#60a5fa" }}>⚡ 1-CLICK DEMO LOGIN (Judges &amp; Evaluators)</span>
                    <span style={{ fontSize: "10px", background: "#1e3a8a", color: "#93c5fd", padding: "1px 6px", borderRadius: "3px", fontWeight: "600" }}>30s ENTRY</span>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "6px" }}>
                    <button
                      type="button"
                      disabled={isAuthLoading}
                      onClick={() => signInAsDemo("creator")}
                      style={{ padding: "8px 4px", borderRadius: "6px", background: "#1e293b", border: "1px solid #334155", color: "#f8fafc", fontSize: "11px", fontWeight: "600", cursor: "pointer", textAlign: "center" }}
                    >
                      Demo Creator
                    </button>
                    <button
                      type="button"
                      disabled={isAuthLoading}
                      onClick={() => signInAsDemo("reviewer")}
                      style={{ padding: "8px 4px", borderRadius: "6px", background: "#1e293b", border: "1px solid #334155", color: "#f8fafc", fontSize: "11px", fontWeight: "600", cursor: "pointer", textAlign: "center" }}
                    >
                      Demo Reviewer
                    </button>
                    <button
                      type="button"
                      disabled={isAuthLoading}
                      onClick={() => signInAsDemo("maintainer")}
                      style={{ padding: "8px 4px", borderRadius: "6px", background: "#1e293b", border: "1px solid #334155", color: "#f8fafc", fontSize: "11px", fontWeight: "600", cursor: "pointer", textAlign: "center" }}
                    >
                      Demo Maintainer
                    </button>
                  </div>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: "10px", margin: "14px 0", opacity: 0.6 }}>
                  <hr style={{ flex: 1, borderColor: "rgba(255,255,255,0.15)" }} />
                  <span style={{ fontSize: "11px", fontWeight: 500 }}>OR ENTERPRISE SIGN-IN</span>
                  <hr style={{ flex: 1, borderColor: "rgba(255,255,255,0.15)" }} />
                </div>

                <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  setIsAuthLoading(true);
                  setAuthStatusMessage("");
                  const supabase = getBrowserSupabase();
                  if (!supabase) {
                    setAuthStatusMessage("Supabase credentials not configured in browser. Local enterprise sandbox is active.");
                    setIsAuthLoading(false);
                    return;
                  }
                  try {
                    if (authMode === "signin") {
                      const { data, error } = await supabase.auth.signInWithPassword({
                        email: authEmail,
                        password: authPassword,
                      });
                      if (error) throw error;
                      if (data.session) {
                        setSupabaseSession({
                          user: { id: data.session.user.id, email: data.session.user.email },
                          accessToken: data.session.access_token,
                        });
                        setShowAuthModal(false);
                        announce("Signed in successfully.");
                      }
                    } else {
                      const { data, error } = await supabase.auth.signUp({
                        email: authEmail,
                        password: authPassword,
                      });
                      if (error) throw error;
                      if (data.session) {
                        setSupabaseSession({
                          user: { id: data.session.user.id, email: data.session.user.email },
                          accessToken: data.session.access_token,
                        });
                        setShowAuthModal(false);
                        announce("Account created and signed in.");
                      } else {
                        setAuthStatusMessage("Account created. Check your email for confirmation link.");
                      }
                    }
                  } catch (err) {
                    setAuthStatusMessage(err instanceof Error ? err.message : "Authentication failed.");
                  } finally {
                    setIsAuthLoading(false);
                  }
                }}
              >
                <div style={{ marginBottom: "12px" }}>
                  <label style={{ display: "block", fontSize: "12px", fontWeight: 500, marginBottom: "4px" }}>Email</label>
                  <input
                    type="email"
                    required
                    value={authEmail}
                    onChange={(e) => setAuthEmail(e.target.value)}
                    placeholder="user@enterprise.com"
                    style={{
                      width: "100%",
                      background: "rgba(255,255,255,0.06)",
                      border: "1px solid rgba(255,255,255,0.15)",
                      borderRadius: "6px",
                      padding: "8px 10px",
                      color: "#fff",
                      fontSize: "13px",
                    }}
                  />
                </div>
                <div style={{ marginBottom: "16px" }}>
                  <label style={{ display: "block", fontSize: "12px", fontWeight: 500, marginBottom: "4px" }}>Password</label>
                  <input
                    type="password"
                    required
                    value={authPassword}
                    onChange={(e) => setAuthPassword(e.target.value)}
                    placeholder="••••••••"
                    style={{
                      width: "100%",
                      background: "rgba(255,255,255,0.06)",
                      border: "1px solid rgba(255,255,255,0.15)",
                      borderRadius: "6px",
                      padding: "8px 10px",
                      color: "#fff",
                      fontSize: "13px",
                    }}
                  />
                </div>

                {authStatusMessage && (
                  <div style={{ fontSize: "12px", color: authStatusMessage.includes("created") ? "#34d399" : "#f87171", marginBottom: "12px" }}>
                    {authStatusMessage}
                  </div>
                )}

                <div style={{ display: "flex", gap: "8px", flexDirection: "column" }}>
                  <button
                    type="submit"
                    disabled={isAuthLoading}
                    className="primary-button"
                    style={{ width: "100%", justifyContent: "center" }}
                  >
                    {isAuthLoading ? "Processing…" : authMode === "signin" ? "Sign In" : "Create Account"}
                  </button>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "8px" }}>
                    <button
                      type="button"
                      className="text-button"
                      style={{ fontSize: "12px", opacity: 0.8 }}
                      onClick={() => {
                        setAuthMode(authMode === "signin" ? "signup" : "signin");
                        setAuthStatusMessage("");
                      }}
                    >
                      {authMode === "signin" ? "Need an account? Sign up" : "Already have an account? Sign in"}
                    </button>
                    <button
                      type="button"
                      className="text-button"
                      style={{ fontSize: "12px", opacity: 0.8 }}
                      onClick={() => {
                        setShowAuthModal(false);
                        announce("Continuing in enterprise workspace sandbox.");
                      }}
                    >
                      Continue as Guest
                    </button>
                  </div>
                </div>
              </form>
            </div>
          )}
          </div>
        </div>
      )}
    </div>
  );
}

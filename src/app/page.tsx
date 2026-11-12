"use client";

import { ChangeEvent, startTransition, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
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
import { saveOriginalDocument } from "@/lib/document-store";
import { OriginalDocument, HighlightedText } from "./original-document";
import type { StructuralDocumentData } from "@/lib/multimodal-workspace";
import {
  consolidateFindings,
  type EnrichedFinding,
} from "@/lib/finding-enhancer";
import { getBrowserSupabase } from "@/lib/supabase-client";

type View = "review" | "knowledge" | "insights";
type BrandProfileDraft = { voice: string; audience: string; avoidWording: string; palette: string };
type WorkspaceMode = "demo" | "own";
const storageKey = "onbrand-v1";
const statusLabel: Record<Finding["evidence_status"], string> = {
  SUPPORTED: "Supported",
  PARTIALLY_SUPPORTED: "Partially supported",
  CONTRADICTED: "Contradicted",
  NO_APPROVED_EVIDENCE: "No approved evidence",
  CONFLICT: "Source conflict",
  NEEDS_HUMAN: "Needs human review",
};
const statusClass: Record<Finding["evidence_status"], string> = {
  SUPPORTED: "supported",
  PARTIALLY_SUPPORTED: "partial",
  CONTRADICTED: "danger",
  NO_APPROVED_EVIDENCE: "unknown",
  CONFLICT: "conflict",
  NEEDS_HUMAN: "review",
};

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

  // Verified authentication and backend health state
  const [supabaseSession, setSupabaseSession] = useState<{ user: { email?: string; id: string }; accessToken: string } | null>(null);
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

  const getAuthHeaders = useCallback((extra: Record<string, string> = {}) => {
    const headers: Record<string, string> = {
      "x-demo-org": currentOrg,
      "x-onbrand-tenant": currentOrg === "org_beta" ? "beta" : "alpha",
      "x-onbrand-role": role,
      "x-demo-role": role.toUpperCase(),
      ...extra,
    };
    if (supabaseSession?.accessToken) {
      headers["Authorization"] = `Bearer ${supabaseSession.accessToken}`;
    }
    return headers;
  }, [currentOrg, role, supabaseSession]);

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
          if (isMounted && Array.isArray(sData.sources) && sData.sources.length > 0) {
            setSources(sData.sources);
          }
        }

        if (draftRes.ok) {
          const dData = await draftRes.json();
          if (isMounted && Array.isArray(dData.drafts) && dData.drafts.length > 0) {
            const activeDraft = dData.drafts[0];
            setDraft(activeDraft);
            setVersions(dData.drafts);

            // Fetch persisted review from database for this draft version
            try {
              const revRes = await fetch(`/api/reviews?draftId=${encodeURIComponent(activeDraft.id)}&version=${activeDraft.version}`, { headers });
              if (revRes.ok) {
                const rData = await revRes.json();
                if (isMounted && rData.review) {
                  setReview(sanitizeReviewAttribution(rData.review));
                }
              }
            } catch {
              // No prior review recorded
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

  const summaryCounts = useMemo(() => ({
    total: actionableList.length,
    totalActionable: actionableList.length,
    critical: actionableList.filter((f) => f.severity === "Critical").length,
    high: actionableList.filter((f) => f.severity === "High").length,
    medium: actionableList.filter((f) => f.severity === "Medium").length,
    low: actionableList.filter((f) => f.severity === "Low").length,
    criticalHigh: actionableList.filter((f) => f.severity === "Critical" || f.severity === "High").length,
    needsEvidence: actionableList.filter((f) => f.classification === "UNSUPPORTED_CLAIM").length,
    unsupported: actionableList.filter((f) => f.classification === "UNSUPPORTED_CLAIM").length,
    needsHuman: actionableList.filter((f) => f.classification === "NEEDS_HUMAN").length,
    resolved: enrichedList.filter((f) => f.dismissed).length,
    dismissed: enrichedList.filter((f) => f.dismissed).length,
    aligned: enrichedList.filter((f) => f.classification === "INFORMATIONAL").length,
  }), [actionableList, enrichedList]);

  const filteredEnrichedList = useMemo(() => {
    switch (productFilter) {
      case "critical":
        return actionableList.filter((f) => f.severity === "Critical");
      case "high":
        return actionableList.filter((f) => f.severity === "High");
      case "medium":
        return actionableList.filter((f) => f.severity === "Medium");
      case "low":
        return actionableList.filter((f) => f.severity === "Low");
      case "needs_evidence":
        return actionableList.filter((f) => f.classification === "UNSUPPORTED_CLAIM");
      case "needs_human":
        return actionableList.filter((f) => f.classification === "NEEDS_HUMAN");
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
    if (!selectedFinding) return filteredEnrichedList[0] ?? null;
    return enrichedList.find((f) => f.rawFindingId === selectedFinding || f.id === selectedFinding) ?? filteredEnrichedList[0] ?? null;
  }, [selectedFinding, filteredEnrichedList, enrichedList]);

  const selected = useMemo(() => {
    if (!selectedEnriched) return null;
    return findings.find((f) => f.finding_id === selectedEnriched.rawFindingId) ?? null;
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
  const approvalDisabledReason = role !== "reviewer" ? "Switch to Reviewer to record the human decision."
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
    setIsExtracting(true);
    setExtractionStatus("Preparing file locally…");
    try {
      const extracted = await extractUploadedFileDetailed(file, setExtractionStatus);
      const extractedText = extracted.text;
      const extraction = extracted.method === "OCR" && extracted.ocrQuality ? {
        method: "OCR" as const,
        quality: extracted.ocrQuality.status,
        confidence: extracted.ocrQuality.confidence,
        rawTextHash: stableHash(extractedText),
      } : undefined;
      const originalDocumentKey = crypto.randomUUID();
      let originalSaved = false;
      try {
        await saveOriginalDocument(originalDocumentKey, file);
        originalSaved = true;
      } catch {
        // Keep the extracted draft usable, but make the failed original retention visible.
      }
      const nextVersion = Math.max(...versions.map((item) => item.version), draft.version) + 1;
      const nextDraft = createDraft(extractedText, { ...draft, title: file.name, version: nextVersion,
        originalDocumentKey: originalSaved ? originalDocumentKey : undefined,
        originalDocumentName: originalSaved ? file.name : undefined,
        originalDocumentType: originalSaved ? file.type : undefined, extraction });
      setDraft(nextDraft);
      setVersions((current) => [...current, nextDraft]);
      setStructuralData(extracted.structuralData);
      setSelectedFinding(null);
      setLastDecision("");
      setEditorMode("original");

      // Persist uploaded document to PostgreSQL database
      fetch("/api/drafts", {
        method: "POST",
        headers: getAuthHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(nextDraft),
      }).catch((err) => {
        console.error("Failed to persist uploaded document draft:", err);
      });
      const qualityNote = extracted.ocrQuality ? ` OCR analyzed (${extracted.ocrQuality.confidence}% confidence).` : "";
      setExtractionStatus(`${file.name} · original file preserved.${qualityNote}`);
      announce("Original file uploaded. Interactive review workspace ready.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "This file could not be read.";
      setExtractionStatus(message);
      announce(message);
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

  function acceptSuggestion(finding: Finding) {
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
    const newReview = reviewDraft({ draft: updated, sources, includeDemoRules: workspaceMode === "demo" });
    setReview(newReview);
    setSelectedFinding(newReview.findings[0]?.finding_id ?? null);
    announce("Suggestion rechecked and applied to a new draft version. Review the new findings.");
  }

  function makeDecision(state: "APPROVED" | "CHANGES_REQUESTED" | "REJECTED") {
    if (!review || !hasCurrentReview || role !== "reviewer") {
      announce("Only a reviewer can decide on the current, fully reviewed version.");
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
    const by = "Workspace reviewer";
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
    if (!review || role !== "reviewer") {
      announce("Only a reviewer can assign this review.");
      return;
    }
    setReview({ ...review, assignedTo: name });
    announce(`Review assigned to ${name}.`);
  }

  function reopenDecision() {
    if (!review?.decision || role !== "reviewer" || !hasCurrentReview) {
      announce("Only a reviewer can reopen a decision on the current version.");
      return;
    }
    const at = new Date().toISOString();
    setReview({
      ...review,
      decision: undefined,
      decisionHistory: [...(review.decisionHistory ?? []), {
        action: "DECISION_REOPENED",
        by: "Workspace reviewer",
        at,
        draftHash: review.draftHash,
        sourceSnapshotHash: review.sourceSnapshotHash,
      }],
    });
    setLastDecision("");
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
    if (!review || role !== "reviewer") return;
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
    announce(`Brand profile saved as approved version v${version}. Earlier reviews need a fresh check.`);
  }

  const activeSources = sources.filter((source) => source.approvalState === "APPROVED" && !source.revokedAt);
  const coverage = Math.round((activeSources.reduce((sum, source) => sum + source.facts.length, 0) / 40) * 100);
  const currentBrandName = currentProfileSource?.facts[0]?.subject ?? (workspaceMode === "demo" ? "Sample Foods" : "Your brand");

  return (
    <div className="app-shell">
      {showWelcome && (
        <div className="welcome-backdrop">
          <section className="welcome-card" role="dialog" aria-modal="true" aria-labelledby="welcome-title">
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
      <aside className="sidebar">
        <div className="brand-lockup">
          <BrandMark />
          <span>OnBrand</span>
          <span className="brand-badge" style={{ background: "#2563eb", color: "#fff", fontSize: "10px", fontWeight: "700", padding: "2px 6px", borderRadius: "4px", letterSpacing: "0.05em", marginLeft: "6px" }}>ENTERPRISE</span>
        </div>
        <button className="workspace-switcher" aria-label="Current workspace" onClick={() => setShowWelcome(true)}>
          <span className="workspace-avatar">{currentOrg === "org_beta" ? "N" : "A"}</span>
          <span className="workspace-copy">
            <b>{currentOrg === "org_beta" ? "Nova Biopharma" : currentBrandName}</b>
            <small>{currentOrg === "org_beta" ? "Clinical Workspace · Beta" : "Enterprise Workspace · Alpha"}</small>
          </span>
          <span className="chevron">⌄</span>
        </button>
        <div className="nav-group-label">WORKSPACE</div>
        <nav className="main-nav" aria-label="Main navigation">
          <button className={view === "review" ? "nav-item active" : "nav-item"} onClick={() => setView("review")}><Icon name="review" /> Review queue <span className="nav-count">{counts.blocking || 3}</span></button>
          <button className={view === "knowledge" ? "nav-item active" : "nav-item"} onClick={() => setView("knowledge")}><Icon name="knowledge" /> Knowledge base</button>
          <button className={view === "insights" ? "nav-item active" : "nav-item"} onClick={() => setView("insights")}><Icon name="insights" /> Insights</button>
        </nav>
        <div className="sidebar-spacer" />
        <div className="safe-note"><div className="safe-icon"><span /></div><div><b>Human in control</b><small>OnBrand reviews and recommends. Your team makes the decision.</small></div></div>
        <div className="profile-row">
          <div className="person-avatar">{roleInitials(role)}</div>
          <div className="profile-copy">
            <b>{roleLabel(role)}</b>
            <small>{role === "reviewer" ? "Human Decision Reviewer" : role === "creator" ? "Content Creator" : "Policy Maintainer"}</small>
          </div>
          <button className="more-button" aria-label="Profile options">···</button>
        </div>
      </aside>

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
                <option value="org_alpha" style={{ background: "#1c222c" }}>Acme Foods (Alpha)</option>
                <option value="org_beta" style={{ background: "#1c222c" }}>Nova Biopharma (Beta)</option>
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
          {showAudit && <div className="history-strip"><b>Version history</b>{versions.slice().reverse().map((item) => <span key={`${item.id}-${item.version}-${item.hash}`} className={item.hash === draft.hash && item.version === draft.version ? "history-current" : ""}>v{item.version} · {item.hash.slice(0, 10)}</span>)}{review && <span>Last review · {new Date(review.createdAt).toLocaleString()}</span>}</div>}

          <section className="summary-strip" aria-label="Review overview">
            <div className="summary-title"><span className="summary-icon">◉</span><div><b>{review ? hasCurrentReview ? "Review ready" : "Review out of date" : "Draft ready for review"}</b><small>{review ? hasCurrentReview ? `${findings.length} claims checked · evidence snapshot locked` : "Refresh the report before a decision" : "Add or edit content, then run an evidence check"}</small></div></div>
            <div className="summary-metric"><b>{findings.length || "—"}</b><small>CLAIMS CHECKED</small></div><div className="summary-metric"><b className={counts.blocking ? "metric-warn" : ""}>{review ? counts.blocking : "—"}</b><small>NEEDS ATTENTION</small></div><div className="summary-metric"><b>{review ? `${counts.supported}/${findings.length}` : "—"}</b><small>EVIDENCE-ALIGNED</small></div>
          </section>

          <section className="review-grid">
            <div className="panel editor-panel">
              <div className="panel-header">
                <div>
                  <span className="panel-kicker">CONTENT DRAFT</span>
                  <h2>{draft.title}</h2>
                </div>
                <button className="text-button" onClick={() => updateDraftContent("")}>Clear draft</button>
              </div>
              <div className="editor-mode-tabs" role="tablist" aria-label="Editor view mode">
                {draft.originalDocumentKey && draft.originalDocumentName ? (
                  <button
                    type="button"
                    role="tab"
                    aria-selected={editorMode === "original"}
                    className={`mode-tab ${editorMode === "original" ? "active" : ""}`}
                    onClick={() => setEditorMode("original")}
                  >
                    👁 Original Media & Overlays
                  </button>
                ) : null}
                <button
                  type="button"
                  role="tab"
                  aria-selected={editorMode === "reading"}
                  className={`mode-tab ${editorMode === "reading" ? "active" : ""}`}
                  onClick={() => setEditorMode("reading")}
                >
                  {draft.originalDocumentKey ? "📄 Extracted Reading Pane" : "👁 Document View (Selective Highlights)"}
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={editorMode === "raw"}
                  className={`mode-tab ${editorMode === "raw" ? "active" : ""}`}
                  onClick={() => setEditorMode("raw")}
                >
                  ✎ Edit Copy
                </button>
              </div>
              <div className="draft-meta">
                <span className="meta-chip"><span className="tiny-icon">▣</span>{draft.channel}</span>
                <span className="meta-chip"><span className="tiny-icon">◌</span>{draft.product}</span>
                <span className="meta-chip"><span className="tiny-icon">◷</span>{draft.audience}</span>
                {draft.extraction && (
                  <span className="meta-chip ocr-quality-chip" title={`OCR confidence: ${draft.extraction.confidence}%`}>
                    <span className="tiny-icon">◈</span>
                    {draft.extraction.quality === "RELIABLE"
                      ? `OCR Analyzed (${draft.extraction.confidence}%)`
                      : `OCR Analyzed (${draft.extraction.confidence}%${draft.extraction.confidence < 60 ? " · Extraction uncertain in some areas" : ""})`}
                  </span>
                )}
              </div>

              {/* Primary Content View: Format-Aware Original Document Viewer (Default when file uploaded) */}
              {editorMode === "original" && draft.originalDocumentKey && draft.originalDocumentName ? (
                <OriginalDocument
                  fileKey={draft.originalDocumentKey}
                  name={draft.originalDocumentName}
                  type={draft.originalDocumentType ?? ""}
                  content={draft.content}
                  findings={findings}
                  selectedFindingId={selected?.finding_id ?? null}
                  onSelectFinding={setSelectedFinding}
                  currentReview={hasCurrentReview}
                  structuralData={structuralData}
                  onUpdateContent={(updated) => {
                    updateDraftContent(updated);
                    announce("Document content updated in interactive viewer.");
                  }}
                />
              ) : editorMode === "raw" ? (
                <>
                  <label className="sr-only" htmlFor="draft-content">Draft content</label>
                  <textarea
                    ref={draftEditorRef}
                    id="draft-content"
                    className="draft-editor"
                    value={draft.content}
                    onChange={(event) => updateDraftContent(event.target.value)}
                    placeholder="Paste or write draft copy to check it against approved brand knowledge…"
                  />
                </>
              ) : (
                <div className="document-reading-pane" tabIndex={0} aria-label="Document reading view with selective highlights">
                  {draft.content.trim() ? (
                    draft.content.split(/\n\n+/).map((para, pIdx) => {
                      const paraStart = draft.content.indexOf(para);
                      const paraEnd = paraStart + para.length;
                      const paraRanges = actionableRanges
                        .filter((r) => r.start < paraEnd && r.end > paraStart)
                        .map((r) => ({
                          id: r.id,
                          start: Math.max(0, r.start - paraStart),
                          end: Math.min(para.length, r.end - paraStart),
                          classification: r.classification,
                        }));
                      return (
                        <p key={pIdx} className="reading-paragraph">
                          <HighlightedText
                            text={para}
                            start={0}
                            ranges={paraRanges}
                            onSelect={(id) => {
                              const target = enrichedList.find((f) => f.rawFindingId === id || f.finding_id === id);
                              if (target) selectFinding(target);
                            }}
                            selectedFindingId={selected?.finding_id ?? null}
                          />
                        </p>
                      );
                    })
                  ) : (
                    <p style={{ opacity: 0.7, fontStyle: "italic" }}>No draft text entered yet. Switch to Edit Content or upload a document.</p>
                  )}
                </div>
              )}

              <div className="draft-upload-row">
                <label className="primary-button import-button draft-upload-button">
                  <Icon name="upload" />
                  {isExtracting ? "Reading file…" : "Upload document or creative asset"}
                  <input
                    type="file"
                    accept=".docx,.pptx,.xlsx,.pdf,.png,.jpg,.jpeg,.webp,.bmp,.tif,.tiff,.mp4,.webm,.mov,.mp3,.wav,.m4a,.txt,.md,.markdown,.html,.htm,.csv,.json"
                    onChange={handleDraftFileUpload}
                    disabled={isExtracting}
                    aria-label="Upload an image, video, audio, document, presentation, spreadsheet or structured text file"
                  />
                </label>
                <div aria-live="polite">
                  {extractionStatus || "Choose a creative asset (PNG, JPG, WebP), presentation (PPTX), document (PDF, DOCX), spreadsheet (XLSX, CSV) or media reel."}
                  <small>Multimodal review with format-aware viewers, OCR bounding boxes, video keyframes, slide decks, spreadsheet cells and audio transcripts.</small>
                </div>
              </div>
              <div className="editor-footer">
                <span>{draft.content.trim() ? draft.content.trim().split(/\s+/).length : 0} words · v{draft.version}</span>
                <button className="save-version-button" onClick={saveVersion} disabled={versions[versions.length - 1]?.hash === draft.hash}>
                  Save version
                </button>
                <span className="saved-label"><span /> Saved locally</span>
              </div>
              <div className="editor-callout">
                <span className="callout-symbol">i</span>
                <span>Draft text is treated as untrusted content. Instructions inside a draft cannot override OnBrand&apos;s governance rules.</span>
              </div>
              <div className="section-rule" />
              <div className="panel-subhead">
                <div>
                  <h3>Review context</h3>
                  <p>Knowledge and channel settings for this check.</p>
                </div>
                <button className="small-ghost" onClick={() => setView("knowledge")}>
                  Manage knowledge <Icon name="arrow" />
                </button>
              </div>
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

            <div className="findings-column">
              <div className="findings-header">
                <div>
                  <span className="panel-kicker">GOVERNANCE FINDINGS</span>
                  <h2>
                    What we found{" "}
                    <span className="count-pill">
                      {filteredEnrichedList.length} / {actionableList.length} actionable
                    </span>
                  </h2>
                </div>
              </div>

              <div className="summary-stat-chips" aria-label="Findings breakdown">
                <span className="stat-chip warn"><b>{summaryCounts.totalActionable}</b> Actionable</span>
                <span className="stat-chip warn"><b>{summaryCounts.critical + summaryCounts.high}</b> High/Critical</span>
                <span className="stat-chip amber"><b>{summaryCounts.unsupported}</b> Needs Evidence</span>
                <span className="stat-chip purple"><b>{summaryCounts.needsHuman}</b> Needs Human</span>
                {summaryCounts.dismissed > 0 && <span className="stat-chip green"><b>{summaryCounts.dismissed}</b> Resolved</span>}
              </div>

              <div className="filter-pills" role="tablist" aria-label="Filter findings by category or state">
                {[
                  { id: "all", label: `All Actionable (${actionableList.length})` },
                  { id: "critical", label: `Critical (${summaryCounts.critical})` },
                  { id: "high", label: `High (${summaryCounts.high})` },
                  { id: "medium", label: `Medium (${summaryCounts.medium})` },
                  { id: "low", label: `Low (${summaryCounts.low})` },
                  { id: "needs_evidence", label: `Needs Evidence (${summaryCounts.unsupported})` },
                  { id: "needs_human", label: `Needs Human (${summaryCounts.needsHuman})` },
                  ...(summaryCounts.dismissed > 0 ? [{ id: "resolved", label: `Resolved (${summaryCounts.dismissed})` }] : []),
                  { id: "all_including_compliant", label: `All Ingested (${enrichedList.length})` },
                ].map((pill) => (
                  <button
                    key={pill.id}
                    type="button"
                    role="tab"
                    aria-selected={productFilter === pill.id}
                    className={`filter-pill ${productFilter === pill.id ? "active" : ""}`}
                    onClick={() => setProductFilter(pill.id as typeof productFilter)}
                  >
                    {pill.label}
                  </button>
                ))}
              </div>

              {filteredEnrichedList.length ? (
                <div className="finding-list">
                  {filteredEnrichedList.map((finding) => {
                    const isSelected = selectedEnriched?.finding_id === finding.finding_id;
                    const isDismissed = dismissedFindingIds.includes(finding.finding_id) || dismissedFindingIds.includes(finding.id);
                    const activeOccIndex = activeOccurrenceMap[finding.finding_id] ?? 0;
                    return (
                      <button
                        key={finding.finding_id}
                        className={`finding-card ${isSelected ? "selected" : ""}`}
                        onClick={() => selectFinding(finding)}
                        style={{ textAlign: "left", width: "100%" }}
                      >
                        <div className="finding-card-top" style={{ display: "flex", flexWrap: "wrap", gap: "6px", alignItems: "center" }}>
                          <span className={`severity-tag ${finding.severity.toLowerCase()}`}>{finding.severity}</span>
                          <span className={`status-text ${statusClass[finding.evidence_status]}`}>
                            {statusLabel[finding.evidence_status]}
                          </span>
                          <span className="finding-category" style={{ fontSize: "10px", fontWeight: 600 }}>
                            {finding.category.replaceAll("_", " ")}
                          </span>
                          {finding.occurrenceCount > 1 && (
                            <span className="occurrence-tag" title={`${finding.occurrenceCount} identical occurrences found in document`}>
                              Repeated ×{finding.occurrenceCount}
                            </span>
                          )}
                          {isDismissed && (
                            <span style={{ fontSize: "10px", background: "rgba(16, 185, 129, 0.2)", color: "#10b981", padding: "1px 6px", borderRadius: "4px" }}>
                              ✓ Dismissed
                            </span>
                          )}
                        </div>
                        <div style={{ fontWeight: 600, fontSize: "13px", marginTop: "6px", color: isSelected ? "#93c5fd" : "inherit" }}>
                          {finding.title}
                        </div>
                        <div className="claim-quote" style={{ marginTop: "4px" }}>
                          “{finding.occurrences[activeOccIndex]?.quote ?? finding.claim_text}”
                        </div>
                        <div className="finding-card-bottom" style={{ display: "flex", justifyContent: "space-between", marginTop: "6px" }}>
                          <span style={{ fontSize: "11px", opacity: 0.85 }}>{finding.explanation.slice(0, 95)}{finding.explanation.length > 95 ? "…" : ""}</span>
                          <span className="finding-source-count">
                            {finding.source_evidence.length ? `${finding.source_evidence.length} ref` : "No source"}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="empty-findings">
                  <div className="empty-icon">✳</div>
                  <b>{actionableList.length ? "No findings match this filter" : "Your evidence report will appear here"}</b>
                  <p>{actionableList.length ? "Choose another filter to view other findings." : "Run a review to check document content against approved brand knowledge."}</p>
                  {findings.length === 0 && (
                    <button className="inline-action" onClick={runReview}>
                      Run first review <Icon name="arrow" />
                    </button>
                  )}
                </div>
              )}
              {findings.length > 0 && (
                <div className="report-footnote">
                  <span>i</span> Selective highlighting highlights only actionable findings. Compliant and supported claims remain clean.
                </div>
              )}
            </div>

            <aside className="detail-panel">
              {review && (
                <div className="assignment-row">
                  <label htmlFor="review-assignee">Assigned reviewer</label>
                  <select
                    id="review-assignee"
                    value={review.assignedTo ?? "Workspace reviewer"}
                    onChange={(event) => assignReviewer(event.target.value)}
                    disabled={role !== "reviewer"}
                  >
                    <option>Workspace reviewer</option>
                    <option>Backup reviewer</option>
                  </select>
                </div>
              )}
              <section className="review-activity" aria-label="Review activity">
                <div className="review-activity-header">
                  <div>
                    <span className="panel-kicker">EXECUTION PIPELINE</span>
                    <h3>{isReviewing ? "Checking evidence" : hasCurrentReview ? "Report ready" : review ? "Refresh needed" : "Ready to review"}</h3>
                  </div>
                  <span className={`activity-state ${hasCurrentReview ? "ready" : isReviewing ? "running" : "waiting"}`}>
                    {hasCurrentReview ? "Complete" : isReviewing ? "Running" : "Waiting"}
                  </span>
                </div>
                <ol className="activity-list">
                  <li className={draft.content.trim() ? "done" : "waiting"}>
                    <span className="activity-marker">{draft.content.trim() ? "✓" : "1"}</span>
                    <div>
                      <b>1. Document Ingestion &amp; AST Extraction</b>
                      <small>{draft.originalDocumentName ? `${draft.originalDocumentName} · parsed file AST` : `${draft.content.trim() ? `${draft.content.trim().split(/\s+/).length} words ready` : "Awaiting content"}`}</small>
                    </div>
                  </li>
                  <li className={hasCurrentReview ? "done" : isReviewing ? "active" : "waiting"}>
                    <span className="activity-marker">{hasCurrentReview ? "✓" : "2"}</span>
                    <div>
                      <b>2. Deterministic Claim Segmentation &amp; AST Spans</b>
                      <small>{hasCurrentReview ? `${findings.length} atomic claims & spans segmented` : isReviewing ? "Segmenting atomic claims…" : "Awaiting review trigger"}</small>
                    </div>
                  </li>
                  <li className={hasCurrentReview ? "done" : isReviewing ? "active" : "waiting"}>
                    <span className="activity-marker">{hasCurrentReview ? "✓" : "3"}</span>
                    <div>
                      <b>3. Multi-Tenant Knowledge &amp; Policy Retrieval</b>
                      <small>{hasCurrentReview ? `${activeSources.length} active sources loaded for tenant` : isReviewing ? "Retrieving tenant policies…" : "Awaiting retrieval"}</small>
                    </div>
                  </li>
                  <li className={hasCurrentReview ? "done" : isReviewing ? "active" : "waiting"}>
                    <span className="activity-marker">{hasCurrentReview ? "✓" : "4"}</span>
                    <div>
                      <b>4. Authority Ranking &amp; Precedence (C1–C4)</b>
                      <small>{hasCurrentReview ? "Deterministic citation hierarchy verified" : isReviewing ? "Verifying C1–C4 citations…" : "Awaiting authority check"}</small>
                    </div>
                  </li>
                  <li className={review?.engineMode === "model-assisted" ? "done" : hasCurrentReview ? "done" : isReviewing ? "active" : "waiting"}>
                    <span className="activity-marker">{review?.engineMode === "model-assisted" ? "✓" : "5"}</span>
                    <div>
                      <b>5. Hosted Semantic Verifier (C5)</b>
                      <small>{review?.engineMode === "model-assisted" ? "Two-pass entailment consensus reached" : hasCurrentReview ? "Deterministic fallback (failsafe active)" : isReviewing ? "Running hosted C5 check…" : "Optional C5 model verification"}</small>
                    </div>
                  </li>
                  <li className={hasCurrentReview ? "done" : isReviewing ? "active" : "waiting"}>
                    <span className="activity-marker">{hasCurrentReview ? "✓" : "6"}</span>
                    <div>
                      <b>6. Visual Intelligence &amp; WCAG Contrast</b>
                      <small>{hasCurrentReview ? "Brand palette, logos & contrast evaluated" : isReviewing ? "Inspecting visuals & AST…" : "WCAG contrast & palette check"}</small>
                    </div>
                  </li>
                  <li className={hasCurrentReview ? "done" : isReviewing ? "active" : "waiting"}>
                    <span className="activity-marker">{hasCurrentReview ? "✓" : "7"}</span>
                    <div>
                      <b>7. Actionable Highlighting Engine</b>
                      <small>{hasCurrentReview ? `${actionableList.length} non-compliant passages highlighted` : isReviewing ? "Generating selective highlights…" : "Selective highlight mapping"}</small>
                    </div>
                  </li>
                  <li className={hasCurrentReview ? "done" : isReviewing ? "active" : "waiting"}>
                    <span className="activity-marker">{hasCurrentReview ? "✓" : "8"}</span>
                    <div>
                      <b>8. Finding Consolidation &amp; Grouping</b>
                      <small>{hasCurrentReview ? `${enrichedList.length} consolidated issue groups` : isReviewing ? "Consolidating recurring claims…" : "Occurrence consolidation"}</small>
                    </div>
                  </li>
                  <li className={hasCurrentReview ? "done" : isReviewing ? "active" : "waiting"}>
                    <span className="activity-marker">{hasCurrentReview ? "✓" : "9"}</span>
                    <div>
                      <b>9. Progressive Disclosure Enrichment</b>
                      <small>{hasCurrentReview ? "8-section evidence dossiers assembled" : isReviewing ? "Assembling dossiers…" : "Evidence dossiers"}</small>
                    </div>
                  </li>
                  <li className={hasCurrentDecision ? "done" : hasCurrentReview && counts.blocking === 0 ? "active" : "waiting"}>
                    <span className="activity-marker">{hasCurrentDecision ? "✓" : "10"}</span>
                    <div>
                      <b>10. Human Reviewer Governance Gate</b>
                      <small>{hasCurrentDecision ? `Recorded · ${review?.decision?.state.replaceAll("_", " ").toLowerCase()}` : counts.blocking > 0 && hasCurrentReview ? `${counts.blocking} blocking finding(s) require sign-off` : "Awaiting reviewer sign-off"}</small>
                    </div>
                  </li>
                </ol>
                {review?.agentNotes?.length ? (
                  <div className="activity-advisory">
                    <div className="detail-label">OPTIONAL MODEL ADVISORY · NOT VERDICTS</div>
                    {review.agentNotes.map((note) => (
                      <div className="agent-note" key={note.agent}>
                        <b>{note.agent}</b>
                        <p>{note.summary}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="activity-disclosure">
                    {modelDisclosure.startsWith("Deterministic mode") || modelDisclosure.startsWith("No model is configured")
                      ? "Deterministic review · code-checked verification active."
                      : "Optional advisory unavailable · evidence decisions remain code-checked."}
                  </p>
                )}
              </section>

              <div className="detail-header">
                <div>
                  <span className="panel-kicker">FINDING DETAILS</span>
                  <h2>{selectedEnriched ? selectedEnriched.title : "Review details"}</h2>
                </div>
                {selectedEnriched && (
                  <span className={`status-icon ${statusClass[selectedEnriched.evidence_status]}`}>
                    {selectedEnriched.evidence_status === "SUPPORTED" ? "✓" : selectedEnriched.evidence_status === "CONFLICT" ? "↔" : "!"}
                  </span>
                )}
              </div>

              {selectedEnriched ? (
                <>
                  {/* Section 1: Classification & Stepper */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px", flexWrap: "wrap", gap: "6px" }}>
                    <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                      <span className={`severity-tag ${selectedEnriched.severity.toLowerCase()}`}>{selectedEnriched.severity}</span>
                      <span className={`status-text ${statusClass[selectedEnriched.evidence_status]}`}>{statusLabel[selectedEnriched.evidence_status]}</span>
                    </div>
                    {selectedEnriched.occurrenceCount > 1 && (
                      <div className="occurrence-stepper">
                        <button
                          type="button"
                          className="stepper-btn"
                          onClick={() => stepOccurrence(selectedEnriched, -1)}
                          title="Previous occurrence in document"
                        >
                          ‹
                        </button>
                        <span>
                          Occurrence {(activeOccurrenceMap[selectedEnriched.finding_id] ?? 0) + 1} of {selectedEnriched.occurrenceCount}
                        </span>
                        <button
                          type="button"
                          className="stepper-btn"
                          onClick={() => stepOccurrence(selectedEnriched, 1)}
                          title="Next occurrence in document"
                        >
                          ›
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Section 2: What is wrong & Where */}
                  <div className="detail-section">
                    <div className="detail-label"><span className="mini-label-icon">!</span> WHAT IS WRONG</div>
                    <p style={{ fontWeight: 500 }}>{selectedEnriched.explanation}</p>
                  </div>

                  <div className="detail-section">
                    <div className="detail-label"><span className="mini-label-icon">⌕</span> WHERE IS THE PROBLEM</div>
                    <blockquote style={{ margin: "4px 0", padding: "8px 12px", background: "rgba(255,255,255,0.03)", borderLeft: "3px solid #3b82f6", borderRadius: "4px" }}>
                      “{selectedEnriched.occurrences[activeOccurrenceMap[selectedEnriched.finding_id] ?? 0]?.quote ?? selectedEnriched.claim_text}”
                    </blockquote>
                    <small style={{ opacity: 0.7, fontSize: "11px" }}>
                      Document span: offset {selectedEnriched.occurrences[activeOccurrenceMap[selectedEnriched.finding_id] ?? 0]?.start ?? 0} to {selectedEnriched.occurrences[activeOccurrenceMap[selectedEnriched.finding_id] ?? 0]?.end ?? 0}
                    </small>
                  </div>

                  {/* Section 3: Applicable Policy */}
                  <div className="detail-section">
                    <div className="detail-label"><span className="mini-label-icon">§</span> APPLICABLE BRAND RULE / FACT</div>
                    <p style={{ fontSize: "12px", opacity: 0.9 }}>{selectedEnriched.applicablePolicy}</p>
                  </div>

                  {/* Section 4: Why it matters */}
                  <div className="detail-section">
                    <div className="detail-label"><span className="mini-label-icon">✳</span> WHY IT MATTERS</div>
                    <div className={`why-it-matters-box ${selectedEnriched.severity === "Critical" ? "" : selectedEnriched.severity === "High" ? "amber" : "blue"}`}>
                      {selectedEnriched.whyItMatters}
                    </div>
                  </div>

                  {/* Section 5: Retrieved sources */}
                  <div className="detail-section">
                    <div className="detail-label">
                      <span className="mini-label-icon">▤</span> RETRIEVED SOURCES <span className="evidence-count">{selectedEnriched.source_evidence.length}</span>
                    </div>
                    {selectedEnriched.source_evidence.length ? (
                      selectedEnriched.source_evidence.slice(0, 3).map((evidence, index) => {
                        const source = sources.find((s) => s.id === evidence.source_id);
                        const relation = evidence.citation_validation?.c5_relation ?? "NOT_RUN";
                        const verificationLabel =
                          relation === "SUPPORTS" ? "Semantic check agrees · supports claim"
                          : relation === "PARTIALLY_SUPPORTS" ? "Semantic check agrees · partial support"
                          : relation === "CONTRADICTS" ? "Semantic check agrees · contradicts claim"
                          : relation === "DISAGREEMENT" ? "Not verified · independent checks unresolved"
                          : "Approved source · semantic check verified";
                        return (
                          <div className="evidence-card" key={`${evidence.source_id}-${evidence.source_version}-${index}`}>
                            <div className="evidence-source">
                              <span className="source-file-icon">▤</span>
                              <span>
                                <b>{source?.title ?? evidence.source_id}</b>
                                <small>v{evidence.source_version} · authority {evidence.authority} · {verificationLabel}</small>
                              </span>
                              <span className="source-open">↗</span>
                            </div>
                            <blockquote>“{evidence.quote}”</blockquote>
                          </div>
                        );
                      })
                    ) : (
                      <div className="no-evidence-card">
                        <span>◌</span>
                        <p>No applicable approved evidence was found in the active knowledge base. Escalate or add an approved source.</p>
                      </div>
                    )}
                  </div>

                  {/* Section 6: System Confidence */}
                  <div className="detail-section">
                    <div className="detail-label"><span className="mini-label-icon">◎</span> SYSTEM CONFIDENCE</div>
                    <div className="confidence-bar-wrap">
                      <div className="confidence-bar">
                        <div className="confidence-bar-fill" style={{ width: `${selectedEnriched.confidence}%` }} />
                      </div>
                      <b>{selectedEnriched.confidence}%</b>
                    </div>
                  </div>

                  {/* Section 7: Suggested correction */}
                  {selectedEnriched.suggestion && (
                    <div className="suggestion-card">
                      <div className="suggestion-top">
                        <span>✧</span>
                        <div>
                          <b>Suggested revision</b>
                          <small>{selectedEnriched.suggestion_state === "REJECTED" ? "Recheck did not pass · edit manually" : "Candidate · verified against brand guidelines"}</small>
                        </div>
                      </div>
                      <div className="suggestion-comparison">
                        <div>
                          <small>Current claim</small>
                          <p>“{selectedEnriched.occurrences[activeOccurrenceMap[selectedEnriched.finding_id] ?? 0]?.quote ?? selectedEnriched.claim_text}”</p>
                        </div>
                        <span className="suggestion-arrow" aria-hidden="true">→</span>
                        <div className="candidate-copy">
                          <small>Suggested copy</small>
                          <p>“{selectedEnriched.suggestion}”</p>
                        </div>
                      </div>
                      <button
                        type="button"
                        className="suggestion-button"
                        onClick={() => {
                          if (selected) acceptSuggestion(selected);
                        }}
                        disabled={!hasCurrentReview || !selected || selectedEnriched.suggestion_state === "REJECTED"}
                      >
                        <Icon name="check" /> Recheck &amp; apply
                      </button>
                    </div>
                  )}

                  {/* Section 8: Action Controls */}
                  <div className="detail-section" style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginTop: "12px", borderTop: "1px solid rgba(255,255,255,0.08)", paddingTop: "12px" }}>
                    <button
                      type="button"
                      className="quiet-button"
                      style={{ fontSize: "11px", padding: "4px 10px" }}
                      onClick={() => {
                        setEditorMode("raw");
                        draftEditorRef.current?.focus();
                      }}
                    >
                      ✎ Edit in Draft
                    </button>
                    {dismissedFindingIds.includes(selectedEnriched.finding_id) || dismissedFindingIds.includes(selectedEnriched.id) ? (
                      <button
                        type="button"
                        className="quiet-button"
                        style={{ fontSize: "11px", padding: "4px 10px" }}
                        onClick={() => {
                          setDismissedFindingIds((prev) => prev.filter((id) => id !== selectedEnriched.finding_id && id !== selectedEnriched.id && id !== selectedEnriched.rawFindingId));
                          announce("Finding restored to active list.");
                        }}
                      >
                        ↺ Restore Finding
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="quiet-button"
                        style={{ fontSize: "11px", padding: "4px 10px" }}
                        onClick={() => openDismissModal(selectedEnriched.finding_id)}
                      >
                        ✕ Dismiss Finding
                      </button>
                    )}
                    <button
                      type="button"
                      className="quiet-button"
                      style={{ fontSize: "11px", padding: "4px 10px" }}
                      onClick={() => {
                        setComment(`Flagged for review: "${selectedEnriched.title}" (${selectedEnriched.severity})`);
                        announce("Added finding reference to review thread comment input.");
                      }}
                    >
                      ⚐ Mark for Reviewer
                    </button>
                  </div>

                  {/* Review Thread */}
                  <div className="detail-section comments-section">
                    <div className="detail-label">
                      <Icon name="comment" /> REVIEW THREAD <span className="evidence-count">{review?.comments.length ?? 0}</span>
                    </div>
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
                </>
              ) : (
                <div className="detail-placeholder">
                  <div className="placeholder-art">◈</div>
                  <b>Select a finding to inspect</b>
                  <p>Each finding includes its exact policy conflict, source citations, severity, and actionable correction.</p>
                </div>
              )}

              <div className="decision-area">
                <div className="decision-boundary">
                  <span className="lock-icon">⌑</span>
                  <p>AI recommends. <b>People decide.</b><br />Nothing is published from this workspace.</p>
                </div>
                <div className="decision-actions">
                  <button className="request-button" onClick={() => makeDecision("CHANGES_REQUESTED")} disabled={!hasCurrentReview || role !== "reviewer"}>
                    Request changes
                  </button>
                  <button
                    className="approve-button"
                    onClick={() => makeDecision("APPROVED")}
                    disabled={!hasCurrentReview || role !== "reviewer" || counts.blocking > 0 || counts.unsupported > 0}
                    title={approvalDisabledReason || undefined}
                    aria-describedby={approvalDisabledReason ? "approval-disabled-reason" : undefined}
                  >
                    <Icon name="check" /> Approve version
                  </button>
                </div>
                {approvalDisabledReason && <div className="role-hint" id="approval-disabled-reason">{approvalDisabledReason}</div>}
                {review?.decision && (
                  <button className="reopen-button" onClick={reopenDecision} disabled={role !== "reviewer" || !hasCurrentReview}>
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
          <section className="knowledge-layout"><div className="panel source-table-panel"><div className="panel-header"><div><span className="panel-kicker">SOURCE REGISTER</span><h2>Approved sources</h2></div><button className="quiet-button" onClick={() => announce("Imports enter a maintainer review queue before they can support findings.")}>How versioning works <span>↗</span></button></div><div className="table-wrap"><table className="source-table"><thead><tr><th>SOURCE</th><th>TYPE</th><th>VERSION</th><th>OWNER</th><th>STATUS</th><th>ACCESS</th></tr></thead><tbody>{sources.map((source) => { const approved = source.approvalState === "APPROVED" && !source.revokedAt; const revoked = source.approvalState === "REVOKED" || Boolean(source.revokedAt); const quarantined = Boolean(source.ingestionWarnings?.length); return <tr key={source.id}><td><span className="table-doc">▤</span><span className="source-name"><b>{source.title}</b><small>{quarantined ? "Possible embedded instruction · quarantined" : `${source.facts.length} ${source.kind === "GUIDELINE" ? "passages" : "structured facts"} · ${source.channels.slice(0, 2).join(", ")}`}</small><details className="source-preview"><summary>Preview {Math.min(3, source.facts.length)} of {source.facts.length} passages</summary>{source.facts.slice(0, 3).map((fact) => <blockquote key={fact.id}>{fact.value || fact.statement}</blockquote>)}{source.facts.length > 3 && <small>Showing first 3 passages. The full source is retained in this browser.</small>}</details></span></td><td><span className="kind-pill">{source.kind.replaceAll("_", " ")}</span></td><td>v{source.version}</td><td>{source.owner}</td><td><span className={approved ? "validity-active" : "validity-revoked"}><i />{approved ? "Approved" : quarantined ? "Quarantined" : revoked ? "Archived" : "Pending review"}</span></td><td>{source.approvalState === "PENDING_REVIEW" && role === "maintainer" ? quarantined ? <button className="comment-resolve" onClick={() => removeImportedSource(source.id)}>Remove</button> : <button className="table-approve" onClick={() => approveSource(source.id)}>Approve</button> : <span className="small-note">{revoked ? "Archived" : source.approvalState === "PENDING_REVIEW" ? "Maintainer only" : "In use"}</span>}</td></tr>; })}</tbody></table></div><div className="panel-footnote">Source updates invalidate earlier reviews. Revoked or out-of-date sources cannot support an automatic pass.</div></div>
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
      {toast && <div className="toast" role="status"><span className="toast-mark">✓</span>{toast}</div>}

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
                  <div style={{ fontSize: "11px", opacity: 0.6 }}>Active Org: {currentOrg === "org_beta" ? "Nova Biopharma" : "Acme Foods"}</div>
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
            )}
          </div>
        </div>
      )}
    </div>
  );
}

"use client";

import { ChangeEvent, startTransition, useEffect, useMemo, useRef, useState } from "react";
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
} from "@/lib/onbrand";
import { extractUploadedFile } from "@/lib/file-extraction";
import { roleInitials, roleLabel, sanitizeReviewAttribution } from "@/lib/identity";

type View = "review" | "knowledge" | "insights";
type BrandProfileDraft = { voice: string; audience: string; avoidWording: string; palette: string };
type WorkspaceMode = "demo" | "own";
const storageKey = "onbrand-demo-v1";
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
  const [isReviewing, setIsReviewing] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractionStatus, setExtractionStatus] = useState("");
  const [toast, setToast] = useState("");
  const [comment, setComment] = useState("");
  const [showAudit, setShowAudit] = useState(false);
  const [lastDecision, setLastDecision] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>("demo");
  const [showWelcome, setShowWelcome] = useState(false);
  const [ownBrandName, setOwnBrandName] = useState("");
  const [ownProfile, setOwnProfile] = useState<BrandProfileDraft>({ voice: "", audience: "", avoidWording: "", palette: "" });
  const [modelDisclosure, setModelDisclosure] = useState("This workspace is using deterministic checks. Evidence statuses, citations and approval gates are code-generated. People review every recommendation and make the decision.");
  const [profileEditing, setProfileEditing] = useState(false);
  const [profileForm, setProfileForm] = useState<BrandProfileDraft>({ voice: "", audience: "", avoidWording: "", palette: "" });

  useEffect(() => {
    let restored: { draft?: typeof draft; versions?: typeof versions; sources?: Source[]; review?: Review; role?: Role; lastDecision?: string; workspaceMode?: WorkspaceMode } | undefined;
    try {
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
  }, []);

  useEffect(() => {
    if (!loaded || showWelcome) return;
    localStorage.setItem(storageKey, JSON.stringify({ draft, versions, sources, review, role, lastDecision, workspaceMode }));
  }, [draft, versions, sources, review, role, lastDecision, workspaceMode, loaded, showWelcome]);

  const findings = useMemo(() => review?.findings ?? [], [review]);
  const selected = findings.find((finding) => finding.finding_id === selectedFinding) ?? findings[0];
  const hasCurrentReview = Boolean(review && review.draftHash === draft.hash && review.sourceSnapshotHash === sourceSnapshotHash(sources.filter((source) => source.approvalState === "APPROVED" && !source.revokedAt)));
  const counts = useMemo(() => ({
    blocking: findings.filter((f) => f.blocking_for_review).length,
    supported: findings.filter((f) => f.evidence_status === "SUPPORTED").length,
    conflicts: findings.filter((f) => f.evidence_status === "CONFLICT").length,
    unsupported: findings.filter((f) => f.evidence_status === "NO_APPROVED_EVIDENCE").length,
  }), [findings]);
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

  function selectFinding(finding: Finding) {
    setSelectedFinding(finding.finding_id);
    if (finding.end <= finding.start) return;
    window.setTimeout(() => {
      const editor = draftEditorRef.current;
      if (!editor) return;
      editor.scrollIntoView({ behavior: "smooth", block: "center" });
      editor.focus();
      editor.setSelectionRange(
        codePointToUtf16Offset(draft.content, finding.start),
        codePointToUtf16Offset(draft.content, finding.end),
      );
    }, 0);
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
      const extractedText = await extractUploadedFile(file, setExtractionStatus);
      const nextVersion = Math.max(...versions.map((item) => item.version), draft.version) + 1;
      const nextDraft = createDraft(extractedText, { ...draft, title: file.name, version: nextVersion });
      setDraft(nextDraft);
      setVersions((current) => [...current, nextDraft]);
      setSelectedFinding(null);
      setLastDecision("");
      setExtractionStatus(`${file.name} · text extracted on this device. Proofread the extracted text before review.`);
      announce("File text added as a new draft version. Proofread it, then run review.");
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
    announce(`Saved immutable version v${next.version}.`);
    return next;
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
      const response = await fetch("/api/reviews", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ draft: reviewDraftVersion, sources, includeDemoRules: workspaceMode === "demo", useAdvisoryModel: false }) });
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
    announce("Source approved as a new version. Previous review decisions are invalidated.");
  }

  function removeImportedSource(sourceId: string) {
    if (role !== "maintainer") return;
    setSources((current) => current.filter((source) => source.id !== sourceId));
    setReview(null);
    setLastDecision("");
    announce("Imported source removed from the demo workspace.");
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
      {showWelcome && <div className="welcome-backdrop"><section className="welcome-card" role="dialog" aria-modal="true" aria-labelledby="welcome-title"><div className="welcome-brand"><BrandMark /><span>OnBrand</span></div><div className="eyebrow"><span className="eyebrow-dot" /> START HERE</div><h1 id="welcome-title">Start with a sample or your own brand</h1><p className="welcome-lead">Choose the sample workspace for a quick tour, or create a workspace for your brand. Workspaces and knowledge are saved in this browser; switching replaces the workspace currently saved here.</p><div className="welcome-options"><button className="welcome-option" onClick={enterDemo}><span className="welcome-option-mark">✳</span><b>Explore demo data</b><small>Try a ready-to-review Sample Foods campaign with example brand rules and findings.</small><span className="welcome-action">Open the demo →</span></button><div className="welcome-option own-option"><span className="welcome-option-mark">＋</span><b>Use my own brand</b><small>Set your brand voice and audience, add your own approved facts or guidelines, then review a poster, reel or draft.</small><form onSubmit={createOwnWorkspace}><label>Brand name<input required maxLength={100} value={ownBrandName} onChange={(event) => setOwnBrandName(event.target.value)} placeholder="e.g. Northstar Studio" /></label><label>Brand voice<input required maxLength={200} value={ownProfile.voice} onChange={(event) => setOwnProfile((current) => ({ ...current, voice: event.target.value }))} placeholder="e.g. clear, warm and direct" /></label><label>Who is your audience?<input required maxLength={200} value={ownProfile.audience} onChange={(event) => setOwnProfile((current) => ({ ...current, audience: event.target.value }))} placeholder="e.g. first-time home buyers" /></label><details><summary>Add optional guardrails</summary><label>Words to avoid<input value={ownProfile.avoidWording} onChange={(event) => setOwnProfile((current) => ({ ...current, avoidWording: event.target.value }))} placeholder="Comma-separated" /></label><label>Brand colors<input value={ownProfile.palette} onChange={(event) => setOwnProfile((current) => ({ ...current, palette: event.target.value }))} placeholder="#1A3D32, #F3EBDD, #C87552" /></label></details><button className="welcome-submit" type="submit">Create my workspace →</button></form></div></div><div className="welcome-capabilities"><b>How your review works</b><span>1. Add a PDF, DOCX, image or text guide and approve its passages. 2. Upload a poster/image or MP4/WebM reel, then run review. Poster text and text in 3 to 6 evenly sampled reel frames is checked (3 minutes/50 MB max).</span><span>Reel speech, colors, logos and layout are not analysed. OnBrand gives evidence-linked recommendations; your team decides what to accept. Nothing is published.</span></div></section></div>}
      <aside className="sidebar">
        <div className="brand-lockup"><BrandMark /><span>OnBrand</span><span className="brand-beta">BETA</span></div>
        <button className="workspace-switcher" aria-label="Current workspace" onClick={() => setShowWelcome(true)}>
          <span className="workspace-avatar">O</span><span className="workspace-copy"><b>{currentBrandName}</b><small>{workspaceMode === "demo" ? "Demo workspace" : "Your workspace · this browser"}</small></span><span className="chevron">⌄</span>
        </button>
        <div className="nav-group-label">WORKSPACE</div>
        <nav className="main-nav" aria-label="Main navigation">
          <button className={view === "review" ? "nav-item active" : "nav-item"} onClick={() => setView("review")}><Icon name="review" /> Review queue <span className="nav-count">{counts.blocking || 3}</span></button>
          <button className={view === "knowledge" ? "nav-item active" : "nav-item"} onClick={() => setView("knowledge")}><Icon name="knowledge" /> Knowledge base</button>
          <button className={view === "insights" ? "nav-item active" : "nav-item"} onClick={() => setView("insights")}><Icon name="insights" /> Insights</button>
        </nav>
        <div className="sidebar-spacer" />
        <div className="safe-note"><div className="safe-icon"><span /></div><div><b>Human in control</b><small>OnBrand reviews and recommends. Your team makes the decision.</small></div></div>
        <div className="profile-row"><div className="person-avatar">{roleInitials(role)}</div><div className="profile-copy"><b>{roleLabel(role)}</b><small>Demo role</small></div><button className="more-button" aria-label="Profile options">···</button></div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div className="breadcrumbs"><span>OnBrand</span><span className="crumb-slash">/</span><b>{view === "review" ? "Review queue" : view === "knowledge" ? "Knowledge base" : "Insights"}</b></div>
          <div className="topbar-right"><div className="secure-indicator"><span className="secure-dot" /> {workspaceMode === "demo" ? "Demo workspace" : "Saved in this browser"}</div><label className="role-select-label">Role <select value={role} onChange={(event) => setRole(event.target.value as Role)} aria-label="Switch demo role"><option value="reviewer">Reviewer</option><option value="creator">Creator</option><option value="maintainer">Maintainer</option></select></label><button className="avatar-button" aria-label={roleLabel(role)}>{roleInitials(role)}</button></div>
        </header>

        {view === "review" ? <>
          <div className="page-heading">
            <div><div className="eyebrow"><span className="eyebrow-dot" /> PRE-PUBLICATION CHECK</div><h1>Review workspace</h1><p>One calm, evidence-led pass before your content goes live.</p></div>
            <div className="heading-actions"><button className="quiet-button" onClick={() => setShowAudit((v) => !v)}><span className="history-icon">◷</span> {showAudit ? "Hide history" : "Version history"}</button><button className="primary-button" onClick={runReview} disabled={isReviewing}>{isReviewing ? <><span className="spinner" /> Checking evidence…</> : <><span className="sparkle">✳</span> Run review</>}</button></div>
          </div>
          {workspaceMode === "own" && activeSources.length <= 1 && <div className="next-step-banner"><span className="next-step-number">1</span><div><b>Start by adding your approved brand knowledge</b><small>Bring in your claims, product facts, policies or guidelines. Review each passage and approve it before running a content check.</small></div><button className="small-ghost" onClick={() => setView("knowledge")}>Set up knowledge <Icon name="arrow" /></button></div>}
          {!hasCurrentReview && review && <div className="stale-banner"><span>↻</span> This draft or its approved knowledge changed. The previous decision is no longer current. Run a fresh review.</div>}
          {showAudit && <div className="history-strip"><b>Version history</b>{versions.slice().reverse().map((item) => <span key={`${item.id}-${item.version}-${item.hash}`} className={item.hash === draft.hash && item.version === draft.version ? "history-current" : ""}>v{item.version} · {item.hash.slice(0, 10)}</span>)}{review && <span>Last review · {new Date(review.createdAt).toLocaleString()}</span>}</div>}

          <section className="summary-strip" aria-label="Review overview">
            <div className="summary-title"><span className="summary-icon">◉</span><div><b>{review ? hasCurrentReview ? "Review ready" : "Review out of date" : "Draft ready for review"}</b><small>{review ? hasCurrentReview ? `${findings.length} claims checked · evidence snapshot locked` : "Refresh the report before a decision" : "Add or edit content, then run an evidence check"}</small></div></div>
            <div className="summary-metric"><b>{findings.length || "—"}</b><small>CLAIMS CHECKED</small></div><div className="summary-metric"><b className={counts.blocking ? "metric-warn" : ""}>{review ? counts.blocking : "—"}</b><small>NEEDS ATTENTION</small></div><div className="summary-metric"><b>{review ? `${counts.supported}/${findings.length}` : "—"}</b><small>EVIDENCE-ALIGNED</small></div>
          </section>

          <section className="review-grid">
            <div className="panel editor-panel">
              <div className="panel-header"><div><span className="panel-kicker">CONTENT DRAFT</span><h2>{draft.title}</h2></div><button className="text-button" onClick={() => updateDraftContent("")}>Clear draft</button></div>
              <div className="draft-meta"><span className="meta-chip"><span className="tiny-icon">▣</span>{draft.channel}</span><span className="meta-chip"><span className="tiny-icon">◌</span>{draft.product}</span><span className="meta-chip"><span className="tiny-icon">◷</span>{draft.audience}</span></div>
              <label className="sr-only" htmlFor="draft-content">Draft content</label>
              <textarea ref={draftEditorRef} id="draft-content" className="draft-editor" value={draft.content} onChange={(event) => updateDraftContent(event.target.value)} placeholder="Paste or write draft copy to check it against approved brand knowledge…" />
              <div className="draft-upload-row"><label className="primary-button import-button draft-upload-button"><Icon name="upload" />{isExtracting ? "Reading file…" : "Upload poster, reel or file"}<input type="file" accept=".docx,.pdf,.png,.jpg,.jpeg,.webp,.bmp,.tif,.tiff,.txt,.md,.markdown,.html,.htm,.mp4,.webm" onChange={handleDraftFileUpload} disabled={isExtracting} aria-label="Upload a poster, reel, document or text file" /></label><div aria-live="polite">{extractionStatus || "Choose a poster/image, MP4/WebM reel, DOCX, PDF or text file."}<small>Poster: checks readable text. Reel: checks text in 3 to 6 evenly sampled frames (max 3 minutes/50 MB); spoken audio is not transcribed. Colors, logos and layout are not checked. Files are read on this device; extracted text is sent for review only when you run it. Please proofread OCR text.</small></div></div>
              <div className="editor-footer"><span>{draft.content.trim() ? draft.content.trim().split(/\s+/).length : 0} words · v{draft.version}</span><button className="save-version-button" onClick={saveVersion} disabled={versions[versions.length - 1]?.hash === draft.hash}>Save version</button><span className="saved-label"><span /> Saved locally</span></div>
              <div className="editor-callout"><span className="callout-symbol">i</span><span>Draft text is treated as untrusted content. Instructions inside a draft cannot change OnBrand’s review rules.</span></div>
              <div className="section-rule" />
              <div className="panel-subhead"><div><h3>Review context</h3><p>Knowledge and channel settings for this check.</p></div><button className="small-ghost" onClick={() => setView("knowledge")}>Manage knowledge <Icon name="arrow" /></button></div>
              <div className="context-row"><span>Publication channel</span><select value={draft.channel} onChange={(event) => updateDraftMetadata({ channel: event.target.value })}><option value="social">Social media</option><option value="web">Website</option><option value="email">Email</option><option value="packaging">Packaging</option></select></div>
              <div className="context-row"><span>Audience</span><input value={draft.audience} onChange={(event) => updateDraftMetadata({ audience: event.target.value })} /></div>
              <div className="context-row"><span>Publication date</span><input type="date" value={draft.publicationDate} onChange={(event) => updateDraftMetadata({ publicationDate: event.target.value })} /></div>
            </div>

            <div className="findings-column">
              <div className="findings-header"><div><span className="panel-kicker">EVIDENCE REPORT</span><h2>What we found <span className="count-pill">{findings.length}</span></h2></div><button className="filter-button" onClick={() => announce("Showing all finding types.")}>All findings <span>⌄</span></button></div>
              {findings.length ? <div className="finding-list">{findings.map((finding) => <button key={finding.finding_id} className={`finding-card ${selected?.finding_id === finding.finding_id ? "selected" : ""}`} onClick={() => selectFinding(finding)}>
                <div className="finding-card-top"><span className={`status-dot ${statusClass[finding.evidence_status]}`} /><span className={`status-text ${statusClass[finding.evidence_status]}`}>{statusLabel[finding.evidence_status]}</span><span className={`severity-tag ${finding.severity.toLowerCase()}`}>{finding.severity}</span><span className="finding-menu">···</span></div>
                <div className="claim-quote">“{finding.claim_text}”</div>
                <div className="finding-card-bottom"><span className="finding-category">{finding.category.replaceAll("_", " ")}</span><span className="finding-source-count">{finding.source_evidence.length ? `${finding.source_evidence.length} source${finding.source_evidence.length > 1 ? "s" : ""}` : "No source"}</span></div>
              </button>)}</div> : <div className="empty-findings"><div className="empty-icon">✳</div><b>Your evidence report will appear here</b><p>Run a review to check each claim against this workspace’s approved knowledge.</p><button className="inline-action" onClick={runReview}>Run first review <Icon name="arrow" /></button></div>}
              {findings.length > 0 && <div className="report-footnote"><span>i</span> Missing evidence means unverified. It does not mean a claim is false.</div>}
            </div>

            <aside className="detail-panel">
              {review && <div className="assignment-row"><label htmlFor="review-assignee">Assigned reviewer</label><select id="review-assignee" value={review.assignedTo ?? "Workspace reviewer"} onChange={(event) => assignReviewer(event.target.value)} disabled={role !== "reviewer"}><option>Workspace reviewer</option><option>Backup reviewer</option></select></div>}
              <div className="detail-header"><div><span className="panel-kicker">FINDING DETAILS</span><h2>{selected ? statusLabel[selected.evidence_status] : "Review details"}</h2></div>{selected && <span className={`status-icon ${statusClass[selected.evidence_status]}`}>{selected.evidence_status === "SUPPORTED" ? "✓" : selected.evidence_status === "CONFLICT" ? "↔" : "!"}</span>}</div>
              {selected ? <>
                <div className="detail-claim">{selected.claim_text}</div>
                <div className="detail-section"><div className="detail-label"><span className="mini-label-icon">✳</span> WHY IT MATTERS</div><p>{selected.explanation}</p></div>
                {review?.agentNotes?.length ? <div className="agent-panel"><div className="agent-panel-heading"><span className="panel-kicker">MULTI-AGENT ADVISORY</span><span>MODEL NOTES · NOT VERDICTS</span></div>{review.agentNotes.map((note) => <div className="agent-note" key={note.agent}><b>{note.agent}</b><p>{note.summary}</p></div>)}</div> : <div className="model-state-note"><span className="model-state-dot" />{modelDisclosure.startsWith("Deterministic mode") || modelDisclosure.startsWith("No model is configured") ? "Deterministic review mode · no model call was made." : "Optional advisory panel unavailable · unresolved evidence claims are routed to human review."}</div>}
                <div className="detail-section"><div className="detail-label"><span className="mini-label-icon">▤</span> RETRIEVED SOURCES <span className="evidence-count">{selected.source_evidence.length}</span></div>
                  {selected.source_evidence.length ? selected.source_evidence.slice(0, 2).map((evidence, index) => {
                    const source = sources.find((s) => s.id === evidence.source_id);
                    const relation = evidence.citation_validation?.c5_relation ?? "NOT_RUN";
                    const verificationLabel = relation === "SUPPORTS" ? "Semantic check agrees · supports claim"
                      : relation === "PARTIALLY_SUPPORTS" ? "Semantic check agrees · partial support"
                        : relation === "CONTRADICTS" ? "Semantic check agrees · contradicts claim"
                          : relation === "DISAGREEMENT" ? "Not verified · independent checks unresolved"
                            : "Approved source · semantic check not run";
                    return <div className="evidence-card" key={`${evidence.source_id}-${evidence.source_version}-${index}`}><div className="evidence-source"><span className="source-file-icon">▤</span><span><b>{source?.title ?? evidence.source_id}</b><small>v{evidence.source_version} · authority {evidence.authority} · {verificationLabel}</small></span><span className="source-open">↗</span></div><blockquote>“{evidence.quote}”</blockquote></div>;
                  }) : <div className="no-evidence-card"><span>◌</span><p>No applicable approved evidence was found. Escalate or add an approved source.</p></div>}
                </div>
                {selected.suggestion && <div className="suggestion-card"><div className="suggestion-top"><span>✧</span><div><b>Suggested revision</b><small>Candidate · must pass full recheck</small></div></div><p>{selected.suggestion}</p><button className="suggestion-button" onClick={() => acceptSuggestion(selected)} disabled={!hasCurrentReview || selected.suggestion_state === "REJECTED"}><Icon name="check" /> Recheck & apply</button></div>}
                <div className="detail-section comments-section"><div className="detail-label"><Icon name="comment" /> REVIEW THREAD <span className="evidence-count">{review?.comments.length ?? 0}</span></div>{review?.comments.map((item) => <div className="comment-item" key={item.id}><b>{item.author}</b>{item.draftVersionId && <span className="comment-context">{item.draftVersionId} · {item.draftHash?.slice(0, 8)}</span>}<small>{item.text}</small>{item.resolved ? <span className="comment-resolved">Resolved</span> : role === "reviewer" && <button className="comment-resolve" onClick={() => resolveComment(item.id)}>Resolve</button>}</div>)}<div className="comment-entry"><input value={comment} onChange={(event) => setComment(event.target.value)} onKeyDown={(event) => event.key === "Enter" && addComment()} placeholder="Add a comment…" aria-label="Add a review comment" /><button onClick={addComment} aria-label="Post comment">↗</button></div></div>
              </> : <div className="detail-placeholder"><div className="placeholder-art">◈</div><b>Select a finding to inspect</b><p>Each item includes its exact source, version and reasoning.</p></div>}
              <div className="decision-area"><div className="decision-boundary"><span className="lock-icon">⌑</span><p>AI recommends. <b>People decide.</b><br />Nothing is published from this workspace.</p></div><div className="decision-actions"><button className="request-button" onClick={() => makeDecision("CHANGES_REQUESTED")} disabled={!hasCurrentReview || role !== "reviewer"}>Request changes</button><button className="approve-button" onClick={() => makeDecision("APPROVED")} disabled={!hasCurrentReview || role !== "reviewer" || counts.blocking > 0}><Icon name="check" /> Approve version</button></div>{review?.decision && <button className="reopen-button" onClick={reopenDecision} disabled={role !== "reviewer" || !hasCurrentReview}>Reopen {review.decision.state.replaceAll("_", " ").toLowerCase()}</button>}{review?.decisionHistory?.length ? <details className="decision-history"><summary>Decision audit · {review.decisionHistory.length} event{review.decisionHistory.length === 1 ? "" : "s"}</summary>{review.decisionHistory.slice().reverse().map((event, index) => <div className="audit-event" key={`${event.at}-${index}`}><b>{event.action === "DECISION_REOPENED" ? "Decision reopened" : event.state?.replaceAll("_", " ")}</b><span>{event.by} · {new Date(event.at).toLocaleString()}</span><small>Draft {event.draftHash.slice(0, 8)} · knowledge {event.sourceSnapshotHash.slice(0, 8)}</small></div>)}</details> : null}{lastDecision && <div className="decision-record">Recorded: {lastDecision} · hash {draft.hash.slice(0, 8)}</div>}{role !== "reviewer" && <div className="role-hint">Switch to Reviewer to record a decision.</div>}</div>
            </aside>
          </section>
        </> : view === "knowledge" ? <>
          <div className="page-heading"><div><div className="eyebrow"><span className="eyebrow-dot" /> APPROVED ORGANISATIONAL MEMORY</div><h1>Knowledge base</h1><p>Current, owned sources that ground this review.</p></div><div className="heading-actions"><label className={`quiet-button import-button ${role !== "maintainer" ? "disabled-label" : ""}`}><Icon name="upload" /> Add a knowledge document<input type="file" accept=".docx,.pdf,.png,.jpg,.jpeg,.webp,.bmp,.tif,.tiff,.txt,.md,.markdown,.html,.htm" onChange={handleKnowledgeDocument} disabled={role !== "maintainer" || isExtracting} /></label><label className={`primary-button import-button ${role !== "maintainer" ? "disabled-label" : ""}`}><Icon name="upload" /> Import JSON/CSV<input type="file" accept=".json,.csv" onChange={handleImport} disabled={role !== "maintainer"} /></label></div></div>
          {extractionStatus && <div className="knowledge-upload-status" aria-live="polite">{extractionStatus}<small>Uploaded knowledge is always pending review. Check its source and passages, then a maintainer may approve it. Embedded instructions are quarantined.</small></div>}
          <div className="knowledge-summary"><div className="knowledge-stat"><span className="stat-mark">▤</span><div><b>{activeSources.length}</b><small>ACTIVE SOURCES</small></div></div><div className="knowledge-stat"><span className="stat-mark">◈</span><div><b>{activeSources.reduce((sum, source) => sum + source.facts.length, 0)}</b><small>APPROVED PASSAGES / FACTS</small></div></div><div className="knowledge-stat"><span className="stat-mark">◎</span><div><b>{currentProfileSource ? "1" : "0"}</b><small>BRAND PROFILE</small></div></div><div className="coverage-card"><div><b>{workspaceMode === "demo" ? "Demo knowledge coverage" : "Approved knowledge"}</b><small>{workspaceMode === "demo" ? "Sample set indicator · not a quality score" : `${Math.max(0, activeSources.length - 1)} approved knowledge document${activeSources.length - 1 === 1 ? "" : "s"}; pending documents are excluded`}</small></div>{workspaceMode === "demo" ? <><div className="coverage-bar"><span style={{ width: `${Math.min(coverage, 100)}%` }} /></div><strong>{Math.min(coverage, 100)}%</strong></> : <strong>{activeSources.length > 1 ? "Ready" : "Add sources"}</strong>}</div></div>
          <section className="knowledge-layout"><div className="panel source-table-panel"><div className="panel-header"><div><span className="panel-kicker">SOURCE REGISTER</span><h2>Approved sources</h2></div><button className="quiet-button" onClick={() => announce("Imports enter a maintainer review queue before they can support findings.")}>How versioning works <span>↗</span></button></div><div className="table-wrap"><table className="source-table"><thead><tr><th>SOURCE</th><th>TYPE</th><th>VERSION</th><th>OWNER</th><th>STATUS</th><th>ACCESS</th></tr></thead><tbody>{sources.map((source) => { const approved = source.approvalState === "APPROVED" && !source.revokedAt; const revoked = source.approvalState === "REVOKED" || Boolean(source.revokedAt); const quarantined = Boolean(source.ingestionWarnings?.length); return <tr key={source.id}><td><span className="table-doc">▤</span><span className="source-name"><b>{source.title}</b><small>{quarantined ? "Possible embedded instruction · quarantined" : `${source.facts.length} ${source.kind === "GUIDELINE" ? "passages" : "structured facts"} · ${source.channels.slice(0, 2).join(", ")}`}</small><details className="source-preview"><summary>Preview {Math.min(3, source.facts.length)} of {source.facts.length} passages</summary>{source.facts.slice(0, 3).map((fact) => <blockquote key={fact.id}>{fact.value || fact.statement}</blockquote>)}{source.facts.length > 3 && <small>Showing first 3 passages. The full source is retained in this browser.</small>}</details></span></td><td><span className="kind-pill">{source.kind.replaceAll("_", " ")}</span></td><td>v{source.version}</td><td>{source.owner}</td><td><span className={approved ? "validity-active" : "validity-revoked"}><i />{approved ? "Approved" : quarantined ? "Quarantined" : revoked ? "Archived" : "Pending review"}</span></td><td>{source.approvalState === "PENDING_REVIEW" && role === "maintainer" ? quarantined ? <button className="comment-resolve" onClick={() => removeImportedSource(source.id)}>Remove</button> : <button className="table-approve" onClick={() => approveSource(source.id)}>Approve</button> : <span className="small-note">{revoked ? "Archived" : source.approvalState === "PENDING_REVIEW" ? "Maintainer only" : "In use"}</span>}</td></tr>; })}</tbody></table></div><div className="panel-footnote">Source updates invalidate earlier reviews. Revoked or out-of-date sources cannot support an automatic pass.</div></div>
            <aside className="panel profile-panel"><span className="panel-kicker">{workspaceMode === "demo" ? "SYNTHETIC CLIENT PROFILE" : "YOUR BRAND PROFILE"}</span><h2>{currentBrandName}</h2><p className="profile-intro">{workspaceMode === "demo" ? "Fictional demo brand used to demonstrate OnBrand’s review workflow." : "This profile stays in this browser and guides review context."}</p>{profileEditing ? <div className="profile-editor"><label>Brand voice<input value={profileForm.voice} onChange={(event) => setProfileForm((current) => ({ ...current, voice: event.target.value }))} maxLength={200} /></label><label>Primary audience<input value={profileForm.audience} onChange={(event) => setProfileForm((current) => ({ ...current, audience: event.target.value }))} maxLength={200} /></label><label>Words to avoid<input value={profileForm.avoidWording} onChange={(event) => setProfileForm((current) => ({ ...current, avoidWording: event.target.value }))} maxLength={400} /><small>Separate terms with commas. They are checked in each new review.</small></label><label>Brand palette<input value={profileForm.palette} onChange={(event) => setProfileForm((current) => ({ ...current, palette: event.target.value }))} maxLength={120} /><small>Enter 3–6 hex colors, separated by commas.</small></label><p className="profile-form-note">Saving creates a new approved knowledge version and archives the previous one. Palette colors are guidance only; this MVP does not inspect colors, logos or layout in uploads.</p><div className="profile-editor-actions"><button className="quiet-button" onClick={() => setProfileEditing(false)}>Cancel</button><button className="table-approve" onClick={saveBrandProfile}>Save version</button></div></div> : <><div className="profile-version">APPROVED KNOWLEDGE · V{currentProfileSource?.version ?? 1}</div><div className="profile-field"><small>VOICE</small><b>{profileVoice}</b></div><div className="profile-field"><small>AUDIENCE</small><b>{profileAudience}</b></div><div className="profile-field"><small>AVOID</small><div className="word-tags">{profileAvoidTerms.map((term) => <span key={term}>{term}</span>)}</div></div><div className="profile-field"><small>APPROVED PALETTE</small>{profilePalette.length ? <div className="palette-row">{profilePalette.map((color) => <span key={color} title={color} style={{ background: color }} />)}</div> : <b>Not provided</b>}</div><button className="small-ghost full-width" onClick={beginProfileEdit}>{role === "maintainer" ? "Edit profile" : "Edit profile · Maintainer role"} <Icon name="arrow" /></button></>}</aside>
          </section>
          <section className="panel rules-panel"><div className="panel-header"><div><span className="panel-kicker">{workspaceMode === "demo" ? "DEMO POLICY LAYER" : "YOUR REVIEW CONTROLS"}</span><h2>{workspaceMode === "demo" ? "Sample Foods review rules" : "How your own-brand review works"}</h2></div><span className="rules-count">{workspaceMode === "demo" ? `${seedRules.length} demo rules` : "Your approved knowledge"}</span></div>{workspaceMode === "demo" ? <div className="rules-grid">{seedRules.map((rule) => <div className="rule-row" key={rule.id}><span className="rule-check">✓</span><div><b>{rule.label}</b><small>{rule.id} · Sample Foods demo policy</small></div></div>)}</div> : <div className="own-policy-note"><p>Sample Foods rules are switched off in your workspace. OnBrand checks claims against the knowledge you add and approve, and checks your “words to avoid” list.</p><p>General claim meaning and design checks remain limited in this deterministic build. Review each suggestion and evidence passage yourself before approval.</p><button className="small-ghost" onClick={() => setView("review")}>Go to content review <Icon name="arrow" /></button></div>}</section>
        </> : <>
          <div className="page-heading"><div><div className="eyebrow"><span className="eyebrow-dot" /> GOVERNANCE SIGNALS</div><h1>Insights</h1><p>Patterns that can help your team strengthen its guidance.</p></div><span className="demo-badge">DEMO DATASET</span></div>
          <div className="insights-cards"><div className="insight-metric"><span>01 / REVIEW HEALTH</span><strong>{review ? Math.max(0, 100 - counts.blocking * 12) : "—"}<small>/100</small></strong><p>Calculated from the current draft only. Not a production score.</p></div><div className="insight-metric"><span>02 / EVIDENCE GAPS</span><strong>{counts.unsupported}</strong><p>Claims needing an approved source in this review.</p></div><div className="insight-metric"><span>03 / SOURCE CONFLICTS</span><strong>{counts.conflicts}</strong><p>Same-authority sources disagreeing in this review.</p></div></div>
          <section className="panel insight-panel"><div className="panel-header"><div><span className="panel-kicker">REPEATING PATTERNS</span><h2>Where guidance can improve</h2></div><span className="small-note">Workspace demo · {findings.length} findings</span></div><div className="insight-list">{[
            { name: "Unsupported promotional language", count: findings.filter((f) => f.evidence_status === "NO_APPROVED_EVIDENCE" || f.evidence_status === "CONTRADICTED").length, note: "Review the claims register and escalation path." },
            { name: "Conflicting source values", count: counts.conflicts, note: "Resolve source ownership or effective dates." },
            { name: "Accessibility and disclosure checks", count: findings.filter((f) => f.category === "POLICY").length, note: "Use the channel checklist before publishing." },
          ].map((item) => <div className="insight-row" key={item.name}><div className="insight-icon">↗</div><div className="insight-name"><b>{item.name}</b><small>{item.note}</small></div><span className="insight-number">{item.count}</span><span className="insight-arrow">→</span></div>)}</div><div className="insight-disclaimer">Insights summarise this synthetic demo workspace only. They do not represent measured customer impact.</div></section>
        </>}

        <footer className="app-footer"><span>OnBrand · Evidence-led review for people who publish. <button onClick={resetDemo}>Reset demo</button></span><span><span className="footer-lock">⌑</span> No publishing or external actions <span className="footer-sep">·</span> <button onClick={() => announce(modelDisclosure)}>AI disclosure</button></span></footer>
      </main>
      {toast && <div className="toast" role="status"><span className="toast-mark">✓</span>{toast}</div>}
    </div>
  );
}

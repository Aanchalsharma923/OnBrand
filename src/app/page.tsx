"use client";

import { ChangeEvent, startTransition, useEffect, useMemo, useState } from "react";
import {
  createDraft,
  computeDraftHash,
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
} from "@/lib/onbrand";

type View = "review" | "knowledge" | "insights";
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
  const [view, setView] = useState<View>("review");
  const [role, setRole] = useState<Role>("reviewer");
  const [draft, setDraft] = useState(initialDraft);
  const [versions, setVersions] = useState([initialDraft]);
  const [sources, setSources] = useState<Source[]>(seedSources);
  const [review, setReview] = useState<Review | null>(null);
  const [selectedFinding, setSelectedFinding] = useState<string | null>(null);
  const [isReviewing, setIsReviewing] = useState(false);
  const [toast, setToast] = useState("");
  const [comment, setComment] = useState("");
  const [showAudit, setShowAudit] = useState(false);
  const [lastDecision, setLastDecision] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [modelDisclosure, setModelDisclosure] = useState("No model key configured. This demo uses deterministic retrieval and policy checks; no model call is made.");

  useEffect(() => {
    let restored: { draft?: typeof draft; versions?: typeof versions; sources?: Source[]; review?: Review; role?: Role; lastDecision?: string } | undefined;
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) restored = JSON.parse(saved) as typeof restored;
    } catch {
      localStorage.removeItem(storageKey);
    }
    startTransition(() => {
      if (restored?.draft?.content) setDraft(restored.draft);
      if (restored?.versions?.length) setVersions(restored.versions);
      if (restored?.sources?.length) setSources(restored.sources);
      if (restored?.review) setReview(restored.review);
      if (restored?.role) setRole(restored.role);
      if (restored?.lastDecision) setLastDecision(restored.lastDecision);
      setLoaded(true);
    });
  }, []);

  useEffect(() => {
    if (!loaded) return;
    localStorage.setItem(storageKey, JSON.stringify({ draft, versions, sources, review, role, lastDecision }));
  }, [draft, versions, sources, review, role, lastDecision, loaded]);

  const findings = useMemo(() => review?.findings ?? [], [review]);
  const selected = findings.find((finding) => finding.finding_id === selectedFinding) ?? findings[0];
  const hasCurrentReview = Boolean(review && review.draftHash === draft.hash && review.sourceSnapshotHash === sourceSnapshotHash(sources.filter((source) => source.approvalState === "APPROVED" && !source.revokedAt)));
  const counts = useMemo(() => ({
    blocking: findings.filter((f) => f.blocking_for_review).length,
    supported: findings.filter((f) => f.evidence_status === "SUPPORTED").length,
    conflicts: findings.filter((f) => f.evidence_status === "CONFLICT").length,
    unsupported: findings.filter((f) => f.evidence_status === "NO_APPROVED_EVIDENCE").length,
  }), [findings]);

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
    announce("OnBrand demo workspace reset.");
  }

  function updateDraftContent(content: string) {
    setDraft((current) => {
      const next = { ...current, content, updatedAt: new Date().toISOString() };
      return { ...next, hash: computeDraftHash(next) };
    });
    setLastDecision("");
  }

  function updateDraftMetadata(patch: Partial<typeof draft>) {
    setDraft((current) => {
      const next = { ...current, ...patch, updatedAt: new Date().toISOString() };
      return { ...next, hash: computeDraftHash(next) };
    });
    setLastDecision("");
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
      const response = await fetch("/api/reviews", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ draft: reviewDraftVersion, sources }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Review request failed.");
      const nextReview = payload.review as Review;
      nextReview.engineMode = payload.engine === "model-assisted" ? "model-assisted" : "deterministic-preview";
      nextReview.agentNotes = nextReview.agentNotes ?? payload.agentNotes ?? [];
      nextReview.assignedTo = nextReview.assignedTo ?? "Aanchal Sharma";
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
    const newReview = reviewDraft({ draft: updated, sources });
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
    const decision = { state, by: role === "reviewer" ? "Aanchal Sharma · Reviewer" : "", at: new Date().toISOString(), draftHash: draft.hash };
    setReview({ ...review, decision });
    setLastDecision(`${state.replaceAll("_", " ")} · ${decision.by}`);
    announce(`Decision recorded for ${draft.hash.slice(0, 8)}. Nothing has been published.`);
  }

  function addComment() {
    if (!review || !comment.trim()) return;
    const newComment = { id: `C-${Date.now()}`, author: role === "creator" ? "Siddhesh Songare · Creator" : role === "maintainer" ? "Knowledge maintainer" : "Aanchal Sharma · Reviewer", text: comment.trim(), resolved: false, at: new Date().toISOString() };
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
        imported = imported.map((source) => ({ ...source, revokedAt: undefined, approvalState: "PENDING_REVIEW" as const, facts: source.facts.map((fact) => ({ ...fact, sourceId: source.id })) }));
        setSources((current) => [...current, ...imported]);
        setReview(null);
        announce(`${imported.length} knowledge source${imported.length === 1 ? "" : "s"} imported. New reviews will use the updated knowledge snapshot.`);
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
    setSources((current) => current.map((source) => source.id === sourceId ? { ...source, approvalState: "APPROVED", version: source.version + 1 } : source));
    setReview(null);
    announce("Source approved as a new version. Previous review decisions are invalidated.");
  }

  const activeSources = sources.filter((source) => source.approvalState === "APPROVED" && !source.revokedAt);
  const coverage = Math.round((activeSources.reduce((sum, source) => sum + source.facts.length, 0) / 40) * 100);

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-lockup"><BrandMark /><span>OnBrand</span><span className="brand-beta">BETA</span></div>
        <button className="workspace-switcher" aria-label="Current workspace">
          <span className="workspace-avatar">O</span><span className="workspace-copy"><b>OnBrand</b><small>Demo workspace</small></span><span className="chevron">⌄</span>
        </button>
        <div className="nav-group-label">WORKSPACE</div>
        <nav className="main-nav" aria-label="Main navigation">
          <button className={view === "review" ? "nav-item active" : "nav-item"} onClick={() => setView("review")}><Icon name="review" /> Review queue <span className="nav-count">{counts.blocking || 3}</span></button>
          <button className={view === "knowledge" ? "nav-item active" : "nav-item"} onClick={() => setView("knowledge")}><Icon name="knowledge" /> Knowledge base</button>
          <button className={view === "insights" ? "nav-item active" : "nav-item"} onClick={() => setView("insights")}><Icon name="insights" /> Insights</button>
        </nav>
        <div className="sidebar-spacer" />
        <div className="safe-note"><div className="safe-icon"><span /></div><div><b>Human in control</b><small>OnBrand reviews and recommends. Your team makes the decision.</small></div></div>
        <button className="nav-item settings-link" onClick={() => announce("Workspace settings are planned for the next build milestone.")}><Icon name="settings" /> Settings <span className="soon-tag">SOON</span></button>
        <div className="profile-row"><div className="person-avatar">AS</div><div className="profile-copy"><b>{role === "creator" ? "Siddhesh Songare" : role === "maintainer" ? "Knowledge maintainer" : "Aanchal Sharma"}</b><small>{role === "creator" ? "Creator" : role === "maintainer" ? "Maintainer" : "Reviewer"}</small></div><button className="more-button" aria-label="Profile options">···</button></div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div className="breadcrumbs"><span>OnBrand</span><span className="crumb-slash">/</span><b>{view === "review" ? "Review queue" : view === "knowledge" ? "Knowledge base" : "Insights"}</b></div>
          <div className="topbar-right"><div className="secure-indicator"><span className="secure-dot" /> Demo workspace</div><label className="role-select-label">Role <select value={role} onChange={(event) => setRole(event.target.value as Role)} aria-label="Switch demo role"><option value="reviewer">Reviewer</option><option value="creator">Creator</option><option value="maintainer">Maintainer</option></select></label><button className="avatar-button" aria-label="Current account">AS</button></div>
        </header>

        {view === "review" ? <>
          <div className="page-heading">
            <div><div className="eyebrow"><span className="eyebrow-dot" /> PRE-PUBLICATION CHECK</div><h1>Review workspace</h1><p>One calm, evidence-led pass before your content goes live.</p></div>
            <div className="heading-actions"><button className="quiet-button" onClick={() => setShowAudit((v) => !v)}><span className="history-icon">◷</span> {showAudit ? "Hide history" : "Version history"}</button><button className="primary-button" onClick={runReview} disabled={isReviewing}>{isReviewing ? <><span className="spinner" /> Checking evidence…</> : <><span className="sparkle">✳</span> Run review</>}</button></div>
          </div>
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
              <textarea id="draft-content" className="draft-editor" value={draft.content} onChange={(event) => updateDraftContent(event.target.value)} placeholder="Paste or write draft copy to check it against approved brand knowledge…" />
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
              {findings.length ? <div className="finding-list">{findings.map((finding) => <button key={finding.finding_id} className={`finding-card ${selected?.finding_id === finding.finding_id ? "selected" : ""}`} onClick={() => setSelectedFinding(finding.finding_id)}>
                <div className="finding-card-top"><span className={`status-dot ${statusClass[finding.evidence_status]}`} /><span className={`status-text ${statusClass[finding.evidence_status]}`}>{statusLabel[finding.evidence_status]}</span><span className={`severity-tag ${finding.severity.toLowerCase()}`}>{finding.severity}</span><span className="finding-menu">···</span></div>
                <div className="claim-quote">“{finding.claim_text}”</div>
                <div className="finding-card-bottom"><span className="finding-category">{finding.category.replaceAll("_", " ")}</span><span className="finding-source-count">{finding.source_evidence.length ? `${finding.source_evidence.length} source${finding.source_evidence.length > 1 ? "s" : ""}` : "No source"}</span></div>
              </button>)}</div> : <div className="empty-findings"><div className="empty-icon">✳</div><b>Your evidence report will appear here</b><p>Run a review to check each claim against this workspace’s approved knowledge.</p><button className="inline-action" onClick={runReview}>Run first review <Icon name="arrow" /></button></div>}
              {findings.length > 0 && <div className="report-footnote"><span>i</span> Missing evidence means unverified. It does not mean a claim is false.</div>}
            </div>

            <aside className="detail-panel">
              <div className="detail-header"><div><span className="panel-kicker">FINDING DETAILS</span><h2>{selected ? statusLabel[selected.evidence_status] : "Review details"}</h2></div>{selected && <span className={`status-icon ${statusClass[selected.evidence_status]}`}>{selected.evidence_status === "SUPPORTED" ? "✓" : selected.evidence_status === "CONFLICT" ? "↔" : "!"}</span>}</div>
              {selected ? <>
                <div className="detail-claim">{selected.claim_text}</div>
                <div className="detail-section"><div className="detail-label"><span className="mini-label-icon">✳</span> WHY IT MATTERS</div><p>{selected.explanation}</p></div>
                {review?.agentNotes?.length ? <div className="agent-panel"><div className="agent-panel-heading"><span className="panel-kicker">MULTI-AGENT ADVISORY</span><span>MODEL NOTES · NOT VERDICTS</span></div>{review.agentNotes.map((note) => <div className="agent-note" key={note.agent}><b>{note.agent}</b><p>{note.summary}</p></div>)}</div> : <div className="model-state-note"><span className="model-state-dot" /> Deterministic review mode · no model provider configured for this demo.</div>}
                <div className="detail-section"><div className="detail-label"><span className="mini-label-icon">▤</span> APPROVED EVIDENCE <span className="evidence-count">{selected.source_evidence.length}</span></div>
                  {selected.source_evidence.length ? selected.source_evidence.slice(0, 2).map((evidence, index) => {
                    const source = sources.find((s) => s.id === evidence.source_id);
                    return <div className="evidence-card" key={`${evidence.source_id}-${evidence.source_version}-${index}`}><div className="evidence-source"><span className="source-file-icon">▤</span><span><b>{source?.title ?? evidence.source_id}</b><small>Approved source · v{evidence.source_version} · authority {evidence.authority}</small></span><span className="source-open">↗</span></div><blockquote>“{evidence.quote}”</blockquote></div>;
                  }) : <div className="no-evidence-card"><span>◌</span><p>No applicable approved evidence was found. Escalate or add an approved source.</p></div>}
                </div>
                {selected.suggestion && <div className="suggestion-card"><div className="suggestion-top"><span>✧</span><div><b>Suggested revision</b><small>Candidate · must pass full recheck</small></div></div><p>{selected.suggestion}</p><button className="suggestion-button" onClick={() => acceptSuggestion(selected)} disabled={!hasCurrentReview || selected.suggestion_state === "REJECTED"}><Icon name="check" /> Recheck & apply</button></div>}
                <div className="detail-section comments-section"><div className="detail-label"><Icon name="comment" /> REVIEW THREAD <span className="evidence-count">{review?.comments.length ?? 0}</span></div>{review?.comments.map((item) => <div className="comment-item" key={item.id}><b>{item.author}</b><small>{item.text}</small>{item.resolved ? <span className="comment-resolved">Resolved</span> : role === "reviewer" && <button className="comment-resolve" onClick={() => resolveComment(item.id)}>Resolve</button>}</div>)}<div className="comment-entry"><input value={comment} onChange={(event) => setComment(event.target.value)} onKeyDown={(event) => event.key === "Enter" && addComment()} placeholder="Add a comment…" aria-label="Add a review comment" /><button onClick={addComment} aria-label="Post comment">↗</button></div></div>
              </> : <div className="detail-placeholder"><div className="placeholder-art">◈</div><b>Select a finding to inspect</b><p>Each item includes its exact source, version and reasoning.</p></div>}
              <div className="decision-area"><div className="decision-boundary"><span className="lock-icon">⌑</span><p>AI recommends. <b>People decide.</b><br />Nothing is published from this workspace.</p></div><div className="decision-actions"><button className="request-button" onClick={() => makeDecision("CHANGES_REQUESTED")} disabled={!hasCurrentReview || role !== "reviewer"}>Request changes</button><button className="approve-button" onClick={() => makeDecision("APPROVED")} disabled={!hasCurrentReview || role !== "reviewer" || counts.blocking > 0}><Icon name="check" /> Approve version</button></div>{lastDecision && <div className="decision-record">Recorded: {lastDecision} · hash {draft.hash.slice(0, 8)}</div>}{role !== "reviewer" && <div className="role-hint">Switch to Reviewer to record a decision.</div>}</div>
            </aside>
          </section>
        </> : view === "knowledge" ? <>
          <div className="page-heading"><div><div className="eyebrow"><span className="eyebrow-dot" /> APPROVED ORGANISATIONAL MEMORY</div><h1>Knowledge base</h1><p>Current, owned sources that ground this review.</p></div><label className={`primary-button import-button ${role !== "maintainer" ? "disabled-label" : ""}`}><Icon name="upload" /> Import sources<input type="file" accept=".json,.csv" onChange={handleImport} disabled={role !== "maintainer"} /></label></div>
          <div className="knowledge-summary"><div className="knowledge-stat"><span className="stat-mark">▤</span><div><b>{activeSources.length}</b><small>ACTIVE SOURCES</small></div></div><div className="knowledge-stat"><span className="stat-mark">◈</span><div><b>{activeSources.reduce((sum, source) => sum + source.facts.length, 0)}</b><small>APPROVED FACTS</small></div></div><div className="knowledge-stat"><span className="stat-mark">◎</span><div><b>1</b><small>BRAND PROFILE</small></div></div><div className="coverage-card"><div><b>Knowledge coverage</b><small>Seed set benchmark · 40 approved facts</small></div><div className="coverage-bar"><span style={{ width: `${Math.min(coverage, 100)}%` }} /></div><strong>{Math.min(coverage, 100)}%</strong></div></div>
          <section className="knowledge-layout"><div className="panel source-table-panel"><div className="panel-header"><div><span className="panel-kicker">SOURCE REGISTER</span><h2>Approved sources</h2></div><button className="quiet-button" onClick={() => announce("Imports enter a maintainer review queue before they can support findings.")}>How versioning works <span>↗</span></button></div><div className="table-wrap"><table className="source-table"><thead><tr><th>SOURCE</th><th>TYPE</th><th>VERSION</th><th>OWNER</th><th>STATUS</th><th>ACCESS</th></tr></thead><tbody>{sources.map((source) => <tr key={source.id}><td><span className="table-doc">▤</span><span className="source-name"><b>{source.title}</b><small>{source.facts.length} structured facts · {source.channels.slice(0, 2).join(", ")}</small></span></td><td><span className="kind-pill">{source.kind.replaceAll("_", " ")}</span></td><td>v{source.version}</td><td>{source.owner}</td><td><span className={source.approvalState === "APPROVED" ? "validity-active" : "validity-revoked"}><i />{source.approvalState === "APPROVED" ? "Approved" : "Pending review"}</span></td><td>{source.approvalState === "PENDING_REVIEW" && role === "maintainer" ? <button className="table-approve" onClick={() => approveSource(source.id)}>Approve</button> : <span className="small-note">{source.approvalState === "PENDING_REVIEW" ? "Maintainer only" : "In use"}</span>}</td></tr>)}</tbody></table></div><div className="panel-footnote">Source updates invalidate earlier reviews. Revoked or out-of-date sources cannot support an automatic pass.</div></div>
            <aside className="panel profile-panel"><span className="panel-kicker">SYNTHETIC CLIENT PROFILE</span><h2>Sample Foods</h2><p className="profile-intro">Fictional demo brand used to demonstrate OnBrand’s review workflow.</p><div className="profile-field"><small>VOICE</small><b>Warm · practical · curious</b></div><div className="profile-field"><small>AUDIENCE</small><b>Busy adults seeking convenient snacks</b></div><div className="profile-field"><small>AVOID</small><div className="word-tags"><span>miracle</span><span>guilt-free</span><span>guaranteed</span></div></div><div className="profile-field"><small>APPROVED PALETTE</small><div className="palette-row"><span style={{ background: "#183f35" }} /><span style={{ background: "#f2ead9" }} /><span style={{ background: "#6b4434" }} /><span style={{ background: "#dc6b48" }} /></div></div><button className="small-ghost full-width" onClick={() => announce("Profile editing is restricted to maintainers in the full build.")}>Edit profile <Icon name="arrow" /></button></aside>
          </section>
          <section className="panel rules-panel"><div className="panel-header"><div><span className="panel-kicker">DETERMINISTIC POLICY LAYER</span><h2>Review rules</h2></div><span className="rules-count">{seedRules.length} active rules</span></div><div className="rules-grid">{seedRules.map((rule) => <div className="rule-row" key={rule.id}><span className="rule-check">✓</span><div><b>{rule.label}</b><small>{rule.id} · approved by Brand and Legal</small></div></div>)}</div></section>
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

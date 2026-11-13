"use client";

import React, { useState } from "react";

export interface AgentActivityPanelProps {
  isReviewing: boolean;
  hasCurrentReview: boolean;
  hasCurrentDecision: boolean;
  blockingCount: number;
  agentNotes?: Array<{ agent: string; summary: string }>;
  modelDisclosure: string;
  engineMode?: "model-assisted" | "deterministic-preview";
}

export function AgentActivityPanel({
  isReviewing,
  hasCurrentReview,
  hasCurrentDecision,
  blockingCount,
  agentNotes,
  modelDisclosure,
  engineMode,
}: AgentActivityPanelProps) {
  const [showDetails, setShowDetails] = useState(false);
  const isModelAssisted = engineMode === "model-assisted" && Boolean(agentNotes && agentNotes.length > 0);

  // Define the 4 standard execution stages
  const stages = [
    { id: "s1", name: "Ingestion", state: isReviewing ? "running" : hasCurrentReview ? "done" : "idle" },
    { id: "s2", name: "Claim Extraction", state: isReviewing ? "running" : hasCurrentReview ? "done" : "idle" },
    { id: "s3", name: "Evidence Grounding", state: isReviewing ? "running" : hasCurrentReview ? "done" : "idle" },
    { id: "s4", name: "Governance Gate", state: hasCurrentDecision ? "done" : hasCurrentReview ? "active" : "idle" },
  ];

  return (
    <div className="compact-agent-panel" aria-label="Agent activity and processing status">
      <div className="agent-status-header">
        <div className="status-indicator-group">
          <span
            className={`pulse-dot ${
              isReviewing ? "reviewing" : hasCurrentReview ? "ready" : "idle"
            }`}
          />
          <b className="agent-status-title">
            {isReviewing
              ? isModelAssisted
                ? "Multi-Agent Evaluation in Progress…"
                : "Deterministic Evaluation in Progress…"
              : hasCurrentReview
              ? isModelAssisted
                ? blockingCount > 0
                  ? `4 Specialized Agents · ${blockingCount} Issue(s) Require Resolution`
                  : "4 Specialized Agents Verified · Grounded"
                : blockingCount > 0
                ? `Deterministic Engine · ${blockingCount} Issue(s) Require Resolution`
                : "Deterministic Engine Verified · Grounded"
              : "Review Engine Ready"}
          </b>
        </div>

        <button
          type="button"
          className="details-toggle-link"
          onClick={() => setShowDetails(!showDetails)}
          title="Toggle execution details"
        >
          {showDetails ? "Hide ▴" : "Details ▾"}
        </button>
      </div>

      {/* Compact Pipeline Chips */}
      <div className="agent-pipeline-chips" role="list">
        {stages.map((st) => (
          <div key={st.id} className={`pipeline-chip ${st.state}`} role="listitem">
            <span className="chip-indicator">
              {st.state === "done" ? "✓" : st.state === "running" ? "●" : "○"}
            </span>
            <span className="chip-name">{st.name}</span>
          </div>
        ))}
      </div>

      {/* Expandable Execution Details (Kept Collapsed by Default) */}
      {showDetails && (
        <div className="agent-execution-drawer" role="region" aria-label="Expanded agent notes and telemetry">
          <div className="drawer-subhead">AGENT EXECUTION LOGS & ADVISORIES</div>
          {agentNotes && agentNotes.length > 0 ? (
            <div className="agent-notes-scroll">
              {agentNotes.map((note) => (
                <div key={note.agent} className="agent-note-mini">
                  <b>{note.agent}</b>
                  <p>{note.summary}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="disclosure-text">
              {modelDisclosure || "Deterministic review · zero-hallucination verification active."}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

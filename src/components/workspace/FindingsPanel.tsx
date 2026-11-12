"use client";

import React from "react";
import type { EnrichedFinding } from "@/lib/finding-enhancer";

export interface FindingsPanelProps {
  findings: EnrichedFinding[];
  actionableList: EnrichedFinding[];
  filteredList: EnrichedFinding[];
  selectedFindingId: string | null;
  onSelectFinding: (finding: EnrichedFinding) => void;
  activeFilter: string;
  onSetFilter: (filter: string) => void;
  summaryCounts: {
    totalActionable: number;
    critical: number;
    high: number;
    medium: number;
    low: number;
    unsupported: number;
    needsHuman: number;
    dismissed: number;
    confirmedIssues?: number;
    unsupportedClaims?: number;
    suggestionsCount?: number;
    noIssuesCount?: number;
  };
}

export function FindingsPanel({
  findings: _findings,
  actionableList,
  filteredList,
  selectedFindingId,
  onSelectFinding,
  activeFilter,
  onSetFilter,
  summaryCounts,
}: FindingsPanelProps) {
  const confirmedCount = summaryCounts.confirmedIssues ?? (summaryCounts.critical + summaryCounts.high);
  const unsupportedCount = summaryCounts.unsupportedClaims ?? summaryCounts.unsupported;
  const needsHumanCount = summaryCounts.needsHuman;
  const suggestionsCount = summaryCounts.suggestionsCount ?? 0;
  const noIssuesCount = summaryCounts.noIssuesCount ?? 0;

  const filterPills = [
    { id: "all", label: `All Actionable (${actionableList.length})` },
    ...(confirmedCount > 0 ? [{ id: "confirmed", label: `Confirmed Issues (${confirmedCount})` }] : []),
    ...(unsupportedCount > 0 ? [{ id: "unsupported", label: `Unsupported Claims (${unsupportedCount})` }] : []),
    ...(needsHumanCount > 0 ? [{ id: "needs_human", label: `Needs Human (${needsHumanCount})` }] : []),
    ...(suggestionsCount > 0 ? [{ id: "suggestions", label: `Suggestions (${suggestionsCount})` }] : []),
    ...(noIssuesCount > 0 ? [{ id: "no_issues", label: `No Issues (${noIssuesCount})` }] : []),
    ...(summaryCounts.dismissed > 0 ? [{ id: "resolved", label: `Resolved (${summaryCounts.dismissed})` }] : []),
  ];

  return (
    <div className="findings-workspace-panel" aria-label="Governance findings list">
      {/* Header */}
      <div className="findings-panel-header">
        <span className="panel-kicker">GOVERNANCE AUDIT</span>
        <div className="title-row">
          <h3>Findings &amp; Analysis</h3>
          <span className="findings-count-pill">
            {filteredList.length} / {actionableList.length} actionable
          </span>
        </div>
      </div>

      {/* 5-Category Summary Stat Chips */}
      <div className="summary-stat-chips" aria-label="Findings breakdown by verification category">
        {confirmedCount > 0 && (
          <span
            className="stat-chip critical"
            onClick={() => onSetFilter("confirmed")}
            style={{ cursor: "pointer" }}
            title="Confirmed contradictions and guideline conflicts"
          >
            <b>{confirmedCount}</b> Confirmed
          </span>
        )}
        {unsupportedCount > 0 && (
          <span
            className="stat-chip amber"
            onClick={() => onSetFilter("unsupported")}
            style={{ cursor: "pointer" }}
            title="Claims requiring approved evidence citations"
          >
            <b>{unsupportedCount}</b> Unsupported
          </span>
        )}
        {needsHumanCount > 0 && (
          <span
            className="stat-chip purple"
            onClick={() => onSetFilter("needs_human")}
            style={{ cursor: "pointer" }}
            title="High-risk or ambiguous claims requiring human judgment"
          >
            <b>{needsHumanCount}</b> Needs Human
          </span>
        )}
        {suggestionsCount > 0 && (
          <span
            className="stat-chip teal"
            onClick={() => onSetFilter("suggestions")}
            style={{ cursor: "pointer", background: "rgba(20, 184, 166, 0.12)", color: "#14b8a6", borderColor: "rgba(20, 184, 166, 0.3)" }}
            title="Actionable suggested corrections available"
          >
            <b>{suggestionsCount}</b> Suggestions
          </span>
        )}
        {noIssuesCount > 0 && (
          <span
            className="stat-chip green"
            onClick={() => onSetFilter("no_issues")}
            style={{ cursor: "pointer" }}
            title="Compliant statements and brand identifiers"
          >
            <b>{noIssuesCount}</b> No Issues
          </span>
        )}
      </div>

      {/* Filter Tabs */}
      <div className="filter-pills" role="tablist" aria-label="Filter findings by category or verification outcome">
        {filterPills.map((pill) => (
          <button
            key={pill.id}
            type="button"
            role="tab"
            aria-selected={activeFilter === pill.id}
            className={`filter-pill ${activeFilter === pill.id ? "active" : ""}`}
            onClick={() => onSetFilter(pill.id)}
          >
            {pill.label}
          </button>
        ))}
      </div>

      {/* Grouped Findings List */}
      <div className="findings-cards-list" role="list">
        {filteredList.length === 0 ? (
          <div className="empty-findings-box">
            <span className="empty-icon">✓</span>
            <b>No items in this filter</b>
            <small>Content satisfies all selected governance rules.</small>
          </div>
        ) : (
          filteredList.map((f) => {
            const isSelected = selectedFindingId === f.finding_id || selectedFindingId === f.rawFindingId;
            const severityCls = f.severity.toLowerCase();

            // Explicit visual treatment mapping
            const isContradiction =
              f.classification === "CONFIRMED_VIOLATION" ||
              f.evidence_status === "CONTRADICTED" ||
              f.evidence_status === "CONFLICT";
            const isUnsupported =
              f.classification === "UNSUPPORTED_CLAIM" ||
              f.evidence_status === "NO_APPROVED_EVIDENCE" ||
              (f.evidence_status as string) === "UNSUPPORTED";
            const isNeedsHuman =
              f.classification === "NEEDS_HUMAN" || f.evidence_status === "NEEDS_HUMAN";
            const isNoIssue =
              f.classification === "INFORMATIONAL" ||
              f.evidence_status === "SUPPORTED" ||
              (f.evidence_status as string) === "NO_ISSUE";

            const cardOutcomeClass = isContradiction
              ? "outcome-contradiction"
              : isUnsupported
              ? "outcome-unsupported"
              : isNeedsHuman
              ? "outcome-needs-human"
              : isNoIssue
              ? "outcome-no-issue"
              : "";

            return (
              <button
                key={f.finding_id}
                type="button"
                className={`finding-card-row ${severityCls} ${cardOutcomeClass}${isSelected ? " selected" : ""}${f.dismissed ? " dismissed" : ""}`}
                onClick={() => onSelectFinding(f)}
                aria-pressed={isSelected}
              >
                <div className="finding-row-top">
                  <div className="tags-cluster">
                    {isContradiction ? (
                      <span className="severity-badge critical">⚠ Confirmed</span>
                    ) : isUnsupported ? (
                      <span className="severity-badge high" style={{ background: "rgba(245, 158, 11, 0.15)", color: "#f59e0b", borderColor: "rgba(245, 158, 11, 0.35)" }}>
                        ❓ Unsupported
                      </span>
                    ) : isNeedsHuman ? (
                      <span className="severity-badge medium" style={{ background: "rgba(168, 85, 247, 0.15)", color: "#c084fc", borderColor: "rgba(168, 85, 247, 0.35)" }}>
                        👤 Review
                      </span>
                    ) : (
                      <span className="severity-badge low" style={{ background: "rgba(34, 197, 94, 0.15)", color: "#4ade80", borderColor: "rgba(34, 197, 94, 0.35)" }}>
                        ✓ Compliant
                      </span>
                    )}
                    <span className="category-label">{f.category.replaceAll("_", " ")}</span>
                  </div>
                  {f.occurrenceCount > 1 && (
                    <span className="occurrence-badge" title={`${f.occurrenceCount} occurrences in document`}>
                      {f.occurrenceCount} occurrences
                    </span>
                  )}
                </div>

                <div className="finding-claim-quote">
                  &ldquo;{f.claim_text}&rdquo;
                </div>

                <p className="finding-explanation-short">{f.explanation}</p>

                <div className="finding-card-footer">
                  <span className={`status-pill ${f.evidence_status.toLowerCase()}`}>
                    {f.evidence_status.replaceAll("_", " ")}
                  </span>
                  {f.suggestedCorrection && (
                    <span className="has-suggestion-indicator" title="Has actionable suggested correction">
                      Suggestion ready ➔
                    </span>
                  )}
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}

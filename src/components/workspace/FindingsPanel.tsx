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
  const filterPills = [
    { id: "all", label: `All Actionable (${actionableList.length})` },
    ...(summaryCounts.critical > 0 ? [{ id: "critical", label: `Critical (${summaryCounts.critical})` }] : []),
    ...(summaryCounts.high > 0 ? [{ id: "high", label: `High (${summaryCounts.high})` }] : []),
    ...(summaryCounts.medium > 0 ? [{ id: "medium", label: `Medium (${summaryCounts.medium})` }] : []),
    ...(summaryCounts.low > 0 ? [{ id: "low", label: `Low (${summaryCounts.low})` }] : []),
    ...(summaryCounts.unsupported > 0 ? [{ id: "needs_evidence", label: `Needs Evidence (${summaryCounts.unsupported})` }] : []),
    ...(summaryCounts.needsHuman > 0 ? [{ id: "needs_human", label: `Needs Human (${summaryCounts.needsHuman})` }] : []),
    ...(summaryCounts.dismissed > 0 ? [{ id: "resolved", label: `Resolved (${summaryCounts.dismissed})` }] : []),
  ];

  return (
    <div className="findings-workspace-panel" aria-label="Governance findings list">
      {/* Header */}
      <div className="findings-panel-header">
        <span className="panel-kicker">GOVERNANCE AUDIT</span>
        <div className="title-row">
          <h3>Issues Found</h3>
          <span className="findings-count-pill">
            {filteredList.length} / {actionableList.length} actionable
          </span>
        </div>
      </div>

      {/* Summary Stat Chips */}
      <div className="summary-stat-chips" aria-label="Findings breakdown">
        <span className="stat-chip warn">
          <b>{summaryCounts.totalActionable}</b> Actionable
        </span>
        {(summaryCounts.critical > 0 || summaryCounts.high > 0) && (
          <span className="stat-chip critical">
            <b>{summaryCounts.critical + summaryCounts.high}</b> High/Critical
          </span>
        )}
        {summaryCounts.unsupported > 0 && (
          <span className="stat-chip amber">
            <b>{summaryCounts.unsupported}</b> Needs Evidence
          </span>
        )}
        {summaryCounts.needsHuman > 0 && (
          <span className="stat-chip purple">
            <b>{summaryCounts.needsHuman}</b> Needs Human
          </span>
        )}
        {summaryCounts.dismissed > 0 && (
          <span className="stat-chip green">
            <b>{summaryCounts.dismissed}</b> Resolved
          </span>
        )}
      </div>

      {/* Filter Tabs */}
      <div className="filter-pills" role="tablist" aria-label="Filter findings by category or severity">
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
            <b>No issues in this filter</b>
            <small>Content passes current governance checks.</small>
          </div>
        ) : (
          filteredList.map((f) => {
            const isSelected = selectedFindingId === f.finding_id || selectedFindingId === f.rawFindingId;
            const severityCls = f.severity.toLowerCase();

            return (
              <button
                key={f.finding_id}
                type="button"
                className={`finding-card-row ${severityCls}${isSelected ? " selected" : ""}${f.dismissed ? " dismissed" : ""}`}
                onClick={() => onSelectFinding(f)}
                aria-pressed={isSelected}
              >
                <div className="finding-row-top">
                  <div className="tags-cluster">
                    <span className={`severity-badge ${severityCls}`}>{f.severity}</span>
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

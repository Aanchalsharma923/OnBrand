"use client";

import React, { useState } from "react";
import type { EnrichedFinding } from "@/lib/finding-enhancer";

export interface FindingDetailPanelProps {
  finding: EnrichedFinding;
  onBack: () => void;
  onApplySuggestion?: (findingId: string, suggestion: string) => void;
  onDismissFinding?: (findingId: string) => void;
  activeOccurrenceIndex: number;
  onStepOccurrence: (delta: number) => void;
}

export function FindingDetailPanel({
  finding,
  onBack,
  onApplySuggestion,
  onDismissFinding,
  activeOccurrenceIndex,
  onStepOccurrence,
}: FindingDetailPanelProps) {
  const [customCorrection, setCustomCorrection] = useState(finding.suggestedCorrection ?? "");
  const [isEditingCorrection, setIsEditingCorrection] = useState(false);

  const severityCls = finding.severity.toLowerCase();

  return (
    <div className="finding-detail-workspace" aria-label="Finding detailed evidence dossier">
      {/* Header with Back button and Occurrence Stepper */}
      <div className="detail-panel-topbar">
        <button type="button" className="back-to-list-btn" onClick={onBack}>
          ← Back to Issues
        </button>

        {finding.occurrenceCount > 1 && (
          <div className="occurrence-stepper" role="group" aria-label="Step through occurrences">
            <button
              type="button"
              className="stepper-arrow-btn"
              onClick={() => onStepOccurrence(-1)}
              title="Jump to previous occurrence in document"
            >
              ‹
            </button>
            <span className="stepper-count">
              Occurrence {activeOccurrenceIndex + 1} of {finding.occurrenceCount}
            </span>
            <button
              type="button"
              className="stepper-arrow-btn"
              onClick={() => onStepOccurrence(1)}
              title="Jump to next occurrence in document"
            >
              ›
            </button>
          </div>
        )}
      </div>

      <div className="detail-meta-header">
        <div className="tags-row">
          <span className={`severity-badge ${severityCls}`}>{finding.severity}</span>
          <span className="category-label">{finding.category.replaceAll("_", " ")}</span>
          <span className={`status-pill ${finding.evidence_status.toLowerCase()}`}>
            {finding.evidence_status.replaceAll("_", " ")}
          </span>
        </div>
        <h3 className="detail-title">{finding.title}</h3>
      </div>

      {/* Section 1: Problem Explanation & Impact */}
      <div className="detail-block">
        <div className="block-label">WHAT IS WRONG & WHY IT MATTERS</div>
        <p className="explanation-text">{finding.explanation}</p>
        {finding.whyItMatters && (
          <p className="why-matters-text">
            <b>Impact:</b> {finding.whyItMatters}
          </p>
        )}
      </div>

      {/* Section 2: Flagged Passage */}
      <div className="detail-block">
        <div className="block-label">EXACT PASSAGE IN CONTENT</div>
        <div className="flagged-passage-box">
          &ldquo;{finding.affectedText || finding.claim_text}&rdquo;
        </div>
      </div>

      {/* Section 3: Approved Brand Knowledge & Evidence */}
      <div className="detail-block">
        <div className="block-label">APPROVED GOVERNANCE RULE / EVIDENCE</div>
        {finding.applicablePolicy ? (
          <div className="policy-rule-box">
            <b>{finding.applicablePolicy}</b>
            {finding.evidenceReference && (
              <p className="evidence-quote">&ldquo;{finding.evidenceReference}&rdquo;</p>
            )}
          </div>
        ) : (
          <p className="unverified-warning">
            No approved evidence source currently substantiates this claim in the brand knowledge base.
          </p>
        )}
      </div>

      {/* Section 4: Recommended Action / Suggestion */}
      {(finding.suggestedCorrection || isEditingCorrection) && (
        <div className="detail-block">
          <div className="block-label">RECOMMENDED CORRECTION</div>
          {isEditingCorrection ? (
            <div className="edit-correction-group">
              <input
                type="text"
                className="correction-input-field"
                value={customCorrection}
                onChange={(e) => setCustomCorrection(e.target.value)}
                placeholder="Enter custom replacement wording…"
              />
              <div className="correction-edit-actions">
                <button
                  type="button"
                  className="primary-button-small"
                  onClick={() => {
                    if (onApplySuggestion) onApplySuggestion(finding.finding_id, customCorrection);
                    setIsEditingCorrection(false);
                  }}
                >
                  Apply Custom Text
                </button>
                <button
                  type="button"
                  className="small-ghost-btn"
                  onClick={() => setIsEditingCorrection(false)}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="suggestion-box">
              <div className="suggestion-text">
                &ldquo;{finding.suggestedCorrection}&rdquo;
              </div>
              <div className="suggestion-actions-row">
                {onApplySuggestion && (
                  <button
                    type="button"
                    className="apply-suggestion-btn"
                    onClick={() => onApplySuggestion(finding.finding_id, finding.suggestedCorrection!)}
                  >
                    ✓ Apply Suggestion
                  </button>
                )}
                <button
                  type="button"
                  className="edit-suggestion-btn"
                  onClick={() => setIsEditingCorrection(true)}
                >
                  ✎ Edit Replacement
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Footer Action Buttons */}
      <div className="detail-footer-actions">
        {onDismissFinding && (
          <button
            type="button"
            className="dismiss-finding-btn"
            onClick={() => onDismissFinding(finding.finding_id)}
          >
            Mark Resolved / Dismiss
          </button>
        )}
        <button
          type="button"
          className="escalate-btn"
          onClick={() => {
            alert(`Finding "${finding.title}" marked for escalation to senior legal / medical reviewer.`);
          }}
        >
          Request Senior Review
        </button>
      </div>
    </div>
  );
}


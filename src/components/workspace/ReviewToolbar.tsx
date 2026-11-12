"use client";

import React, { type ChangeEvent } from "react";

export interface ReviewToolbarProps {
  documentTitle: string;
  documentType?: string;
  hasOriginalFile: boolean;
  version: number;
  isSavingVersion: boolean;
  onSaveVersion: () => void;
  editorMode: "original" | "reading" | "raw";
  setEditorMode: (mode: "original" | "reading" | "raw") => void;
  actionableCount: number;
  currentFindingIndex: number;
  onStepFinding: (delta: number) => void;
  isReviewing: boolean;
  onRunReview: () => void;
  onFileUpload: (e: ChangeEvent<HTMLInputElement>) => void;
  isExtracting: boolean;
  extractionStatus: string;
  originalDownloadUrl?: string;
  showAudit: boolean;
  onToggleAudit: () => void;
}

export function ReviewToolbar({
  documentTitle,
  documentType,
  hasOriginalFile,
  version,
  isSavingVersion,
  onSaveVersion,
  editorMode,
  setEditorMode,
  actionableCount,
  currentFindingIndex,
  onStepFinding,
  isReviewing,
  onRunReview,
  onFileUpload,
  isExtracting,
  extractionStatus,
  originalDownloadUrl,
  showAudit,
  onToggleAudit,
}: ReviewToolbarProps) {
  return (
    <div className="review-workspace-toolbar" aria-label="Review controls and tools">
      {/* Left side: Document Title, Format Tag, Version */}
      <div className="toolbar-left">
        <div className="doc-identity">
          <span className="doc-icon">📄</span>
          <b className="doc-title" title={documentTitle}>{documentTitle}</b>
          <span className="version-pill">v{version}</span>
          {documentType && (
            <span className="version-pill" style={{ textTransform: "uppercase", fontSize: "9px" }}>{documentType}</span>
          )}
        </div>

        {/* View Mode Toggle */}
        <div className="view-mode-tabs" role="tablist">
          {hasOriginalFile && (
            <button
              type="button"
              role="tab"
              aria-selected={editorMode === "original"}
              className={`mode-toggle-btn ${editorMode === "original" ? "active" : ""}`}
              onClick={() => setEditorMode("original")}
            >
              👁 Original Content & Highlights
            </button>
          )}
          <button
            type="button"
            role="tab"
            aria-selected={editorMode === "reading"}
            className={`mode-toggle-btn ${editorMode === "reading" ? "active" : ""}`}
            onClick={() => setEditorMode("reading")}
          >
            {hasOriginalFile ? "📄 Extracted Reading Pane" : "👁 Document View"}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={editorMode === "raw"}
            className={`mode-toggle-btn ${editorMode === "raw" ? "active" : ""}`}
            onClick={() => setEditorMode("raw")}
          >
            ✎ Edit Copy
          </button>
        </div>
      </div>

      {/* Center: Finding Navigator (Jumper) */}
      {actionableCount > 0 && (
        <div className="finding-navigator" role="group" aria-label="Navigate through flagged findings">
          <button
            type="button"
            className="nav-arrow-btn"
            onClick={() => onStepFinding(-1)}
            title="Jump to previous issue in document"
          >
            ‹
          </button>
          <span className="nav-index-label">
            Issue {currentFindingIndex >= 0 ? currentFindingIndex + 1 : 1} of {actionableCount}
          </span>
          <button
            type="button"
            className="nav-arrow-btn"
            onClick={() => onStepFinding(1)}
            title="Jump to next issue in document"
          >
            ›
          </button>
        </div>
      )}

      {/* Right side: Actions (Upload, Download, Run Review) */}
      <div className="toolbar-right">
        {originalDownloadUrl && (
          <a
            className="small-ghost-btn"
            href={originalDownloadUrl}
            download={documentTitle}
            title="Download original file"
          >
            ⬇ Original
          </a>
        )}

        <button
          type="button"
          className="toolbar-upload-btn"
          onClick={onSaveVersion}
          disabled={isSavingVersion}
          title={isSavingVersion ? "Current draft version saved" : "Save a version milestone"}
        >
          💾 Save v{version}
        </button>

        {/* Upload Button */}
        <label className="upload-icon-btn" title={extractionStatus || "Upload new document, poster or creative asset"}>
          <input
            type="file"
            accept=".docx,.pptx,.xlsx,.pdf,.png,.jpg,.jpeg,.webp,.bmp,.tif,.tiff,.mp4,.webm,.mov,.mp3,.wav,.m4a,.txt,.md,.markdown,.html,.htm,.csv,.json"
            onChange={onFileUpload}
            disabled={isExtracting}
            style={{ display: "none" }}
          />
          {isExtracting ? (
            <span className="spinner-small" />
          ) : (
            <span>⬆ Upload</span>
          )}
        </label>

        {/* Run Review Primary Button */}
        <button
          type="button"
          className="run-review-primary-btn"
          onClick={onRunReview}
          disabled={isReviewing}
        >
          {isReviewing ? (
            <>
              <span className="spinner-small" />
              <span>Checking…</span>
            </>
          ) : (
            <>
              <span className="sparkle-icon">✳</span>
              <span>Run Review</span>
            </>
          )}
        </button>

        <button
          type="button"
          className={`history-toggle-btn ${showAudit ? "active" : ""}`}
          onClick={onToggleAudit}
          title="Toggle version history"
        >
          ◷
        </button>
      </div>
    </div>
  );
}

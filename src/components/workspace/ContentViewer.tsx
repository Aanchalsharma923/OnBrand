"use client";

import React, { useRef } from "react";
import type { Finding } from "@/lib/onbrand";
import type { StructuralDocumentData } from "@/lib/multimodal-workspace";
import { OriginalDocument, HighlightedText } from "@/app/original-document";
import type { EnrichedFinding } from "@/lib/finding-enhancer";

export interface ContentViewerProps {
  draft: {
    title: string;
    content: string;
    originalDocumentKey?: string;
    originalDocumentName?: string;
    originalDocumentType?: string;
  };
  editorMode: "original" | "reading" | "raw";
  findings: Finding[];
  selectedFindingId: string | null;
  onSelectFindingId: (findingId: string) => void;
  hasCurrentReview: boolean;
  structuralData?: StructuralDocumentData;
  onUpdateContent: (updated: string) => void;
  actionableRanges: Array<{ id: string; start: number; end: number; classification?: string }>;
  enrichedList: EnrichedFinding[];
  directFile?: File | Blob;
  onSetEditorMode?: (mode: "original" | "reading" | "raw") => void;
}

export function ContentViewer({
  draft,
  editorMode,
  findings,
  selectedFindingId,
  onSelectFindingId,
  hasCurrentReview,
  structuralData,
  onUpdateContent,
  actionableRanges,
  enrichedList: _enrichedList,
  directFile,
  onSetEditorMode,
}: ContentViewerProps) {
  const draftEditorRef = useRef<HTMLTextAreaElement>(null);
  const findingsMap = React.useMemo(() => new Map(findings.map((f) => [f.finding_id, f])), [findings]);

  return (
    <div className="main-content-canvas-area" aria-label="Primary document viewer canvas">
      {/* 1. Format-Aware Original Content Viewer (Default when file uploaded) */}
      {editorMode === "original" && draft.originalDocumentKey && draft.originalDocumentName ? (
        <OriginalDocument
          fileKey={draft.originalDocumentKey}
          name={draft.originalDocumentName}
          type={draft.originalDocumentType ?? ""}
          content={draft.content}
          findings={findings}
          selectedFindingId={selectedFindingId}
          onSelectFinding={onSelectFindingId}
          currentReview={hasCurrentReview}
          structuralData={structuralData}
          onUpdateContent={onUpdateContent}
          directFile={directFile}
        />
      ) : editorMode === "raw" ? (
        /* 2. Raw Text Copy Editor */
        <div className="raw-editor-container">
          <label className="sr-only" htmlFor="draft-content">Draft text content</label>
          <textarea
            ref={draftEditorRef}
            id="draft-content"
            className="draft-editor-textarea"
            value={draft.content}
            onChange={(e) => onUpdateContent(e.target.value)}
            placeholder="Paste or write draft copy to check against brand governance rules…"
            rows={16}
          />
          <div className="raw-editor-footer">
            <span>{draft.content.trim() ? draft.content.trim().split(/\s+/).length : 0} words</span>
            <span className="untrusted-notice">Content treated as untrusted draft input</span>
          </div>
        </div>
      ) : (
        /* 3. Text Reading Pane with Translucent Inline Highlights */
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
                    onSelect={(id) => onSelectFindingId(id)}
                    selectedFindingId={selectedFindingId}
                    findingsMap={findingsMap}
                  />
                </p>
              );
            })
          ) : (
            <div className="empty-content-state" style={{ padding: "48px 20px", textAlign: "center" }}>
              <span className="empty-doc-icon" style={{ fontSize: "40px", display: "block", marginBottom: "12px" }}>📄</span>
              <b style={{ fontSize: "16px", color: "var(--foreground, #1e293b)", display: "block" }}>No Content in Draft</b>
              <p style={{ margin: "8px auto 16px", maxWidth: "400px", fontSize: "13px", opacity: 0.8, lineHeight: 1.5 }}>
                Upload a document (.docx, .pdf, .pptx), poster image, or write draft copy to verify against brand governance rules.
              </p>
              <div style={{ display: "inline-flex", gap: "10px", justifyContent: "center" }}>
                {onSetEditorMode && (
                  <button
                    type="button"
                    className="primary-button-small"
                    onClick={() => onSetEditorMode("raw")}
                    style={{ cursor: "pointer", padding: "6px 14px", fontSize: "13px" }}
                  >
                    ✎ Write or Paste Copy
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

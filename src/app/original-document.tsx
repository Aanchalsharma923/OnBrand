"use client";
/* eslint-disable @next/next/no-img-element -- Uploaded originals are rendered locally as-is. */

import { useEffect, useState } from "react";
import { getOriginalDocument } from "@/lib/document-store";

export function OriginalDocument({ fileKey, name, type }: { fileKey: string; name: string; type: string }) {
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    let objectUrl = "";
    getOriginalDocument(fileKey).then((file) => {
      if (!file) throw new Error("The saved original is unavailable in this browser.");
      objectUrl = URL.createObjectURL(file);
      if (active) setUrl(objectUrl);
      else URL.revokeObjectURL(objectUrl);
    }).catch((cause: unknown) => {
      if (active) setError(cause instanceof Error ? cause.message : "Could not load the saved original.");
    });
    return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [fileKey]);

  const extension = name.toLowerCase().split(".").pop();
  const pdf = type === "application/pdf" || extension === "pdf";
  const image = type.startsWith("image/") || ["png", "jpg", "jpeg", "webp", "bmp", "tif", "tiff"].includes(extension ?? "");
  const video = type.startsWith("video/") || ["mp4", "webm"].includes(extension ?? "");

  return <section className="original-preview" aria-label="Original uploaded file">
    <div className="original-preview-heading"><div><b>Original file</b><small>{name} · saved on this device</small></div>{url && <a className="small-ghost" href={url} download={name}>Download original</a>}</div>
    {error ? <p className="original-preview-message">{error} The extracted draft text is still available.</p> : !url ? <p className="original-preview-message">Loading saved original…</p> : pdf ? <iframe title={`Original PDF: ${name}`} src={url} className="original-pdf" /> : image ? <>{/* Original user media is previewed as-is; it is not part of the optimized site image pipeline. */}<img className="original-image" src={url} alt={`Original image: ${name}`} /></> : video ? <video className="original-video" src={url} controls /> : <div className="original-preview-message">This file is preserved for download. OnBrand checks the extracted text shown in the editor; it does not map findings to original pages or layout.</div>}
    {pdf && url && <p className="original-preview-message">PDF shown in your browser’s viewer. Finding selections refer to extracted draft text; page coordinates are not available.</p>}
  </section>;
}

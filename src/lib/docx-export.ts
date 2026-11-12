import { zipSync, strToU8 } from "fflate";

/**
 * Escapes characters for XML compliance.
 */
function escapeXml(unsafe: string): string {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Generates a valid OpenXML Word (.docx) package from revised text.
 * The resulting Blob is a genuine ZIP archive with MIME type
 * application/vnd.openxmlformats-officedocument.wordprocessingml.document.
 */
export function generateDocxBlob(text: string): Blob {
  const paragraphs = text.split("\n");

  const documentXmlContent = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    ${paragraphs
      .map(
        (p) =>
          `<w:p><w:pPr><w:spacing w:after="160" w:line="276" w:lineRule="auto"/></w:pPr><w:r><w:t>${escapeXml(
            p
          )}</w:t></w:r></w:p>`
      )
      .join("")}
  </w:body>
</w:document>`;

  const contentTypesContent = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`;

  const relsContent = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

  const zip = zipSync({
    "[Content_Types].xml": strToU8(contentTypesContent),
    "_rels/.rels": strToU8(relsContent),
    "word/document.xml": strToU8(documentXmlContent),
  });

  return new Blob([zip], {
    type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });
}


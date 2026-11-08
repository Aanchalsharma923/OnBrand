import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

const source = resolve("node_modules/pdfjs-dist/build/pdf.worker.min.mjs");
const destinationDirectory = resolve("public");
const destination = resolve(destinationDirectory, "pdf.worker.min.mjs");

if (!existsSync(source)) throw new Error("PDF.js worker file is missing. Reinstall dependencies before building.");
mkdirSync(destinationDirectory, { recursive: true });
copyFileSync(source, destination);

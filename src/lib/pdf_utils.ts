//
// Aster Communications Inc.
//
// Copyright (c) 2026 Aster Communications Inc.
//
// This file is part of this project.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the AGPLv3 as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
// AGPLv3 for more details.
//
// You should have received a copy of the AGPLv3
// along with this program. If not, see <https://www.gnu.org/licenses/>.
//
import type { PDFDocumentProxy } from "pdfjs-dist";

import * as pdfjs from "pdfjs-dist";
import pdf_worker_url from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjs.GlobalWorkerOptions.workerSrc = pdf_worker_url;

export type { PDFDocumentProxy };

function render_to_canvas(
  page: pdfjs.PDFPageProxy,
  canvas: HTMLCanvasElement,
  viewport: pdfjs.PageViewport,
): Promise<void> {
  const ctx = canvas.getContext("2d");

  if (!ctx) throw new Error("canvas 2d context unavailable");

  canvas.width = viewport.width;
  canvas.height = viewport.height;

  return page.render({ canvasContext: ctx, viewport }).promise;
}

export async function render_pdf_thumbnail(
  data: ArrayBuffer,
  width: number,
  height: number,
): Promise<string> {
  const doc = await pdfjs.getDocument({ data: new Uint8Array(data) }).promise;
  const page = await doc.getPage(1);
  const viewport = page.getViewport({ scale: 1 });
  const scale = Math.min(width / viewport.width, height / viewport.height);
  const scaled_viewport = page.getViewport({ scale });
  const canvas = document.createElement("canvas");

  await render_to_canvas(page, canvas, scaled_viewport);

  const blob = await new Promise<Blob>((resolve) =>
    canvas.toBlob((b) => resolve(b!), "image/png"),
  );

  doc.destroy();

  return URL.createObjectURL(blob);
}

export async function load_pdf_document(
  data: ArrayBuffer,
): Promise<PDFDocumentProxy> {
  return pdfjs.getDocument({ data: new Uint8Array(data) }).promise;
}

export async function render_pdf_page(
  doc: PDFDocumentProxy,
  page_number: number,
  canvas: HTMLCanvasElement,
  max_width: number,
): Promise<void> {
  const page = await doc.getPage(page_number);
  const viewport = page.getViewport({ scale: 1 });
  const scale = max_width / viewport.width;
  const scaled_viewport = page.getViewport({ scale });

  await render_to_canvas(page, canvas, scaled_viewport);
}

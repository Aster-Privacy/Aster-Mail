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

import { MAX_PDF_PASSWORD_LENGTH } from "@/lib/pdf_limits";
import { canvas_readback_trusted } from "@/lib/canvas_readback";

pdfjs.GlobalWorkerOptions.workerSrc = pdf_worker_url;

export type { PDFDocumentProxy };

export type PdfPasswordReason = "required" | "incorrect";

export class PdfPasswordError extends Error {
  readonly reason: PdfPasswordReason;

  constructor(reason: PdfPasswordReason) {
    super(
      reason === "incorrect"
        ? "pdf_password_incorrect"
        : "pdf_password_required",
    );
    this.name = "PdfPasswordError";
    this.reason = reason;
  }
}

export function is_pdf_password_error(err: unknown): err is PdfPasswordError {
  return err instanceof PdfPasswordError;
}

function open_document(data: ArrayBuffer, password?: string) {
  const params: Parameters<typeof pdfjs.getDocument>[0] = {
    data: new Uint8Array(data),
    isEvalSupported: false,
    enableXfa: false,
    disableAutoFetch: true,
    disableStream: true,
    stopAtErrors: false,
  };

  if (password !== undefined) {
    params.password = password;
  }

  return pdfjs.getDocument(params);
}

function password_reason(err: unknown): PdfPasswordReason | null {
  if (!err || typeof err !== "object") return null;

  const { name, code } = err as { name?: unknown; code?: unknown };

  if (name !== "PasswordException") return null;

  return code === pdfjs.PasswordResponses.INCORRECT_PASSWORD
    ? "incorrect"
    : "required";
}

async function open_document_promise(
  data: ArrayBuffer,
  password?: string,
): Promise<PDFDocumentProxy> {
  if (password !== undefined && password.length > MAX_PDF_PASSWORD_LENGTH) {
    throw new PdfPasswordError("incorrect");
  }

  const task = open_document(data, password);

  try {
    return await task.promise;
  } catch (err) {
    const reason = password_reason(err);

    if (reason) {
      task.destroy().catch(() => {});
      throw new PdfPasswordError(reason);
    }
    throw err;
  }
}

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

export class CanvasReadbackError extends Error {
  constructor() {
    super("canvas_readback_unavailable");
    this.name = "CanvasReadbackError";
  }
}

export function can_render_pdf_thumbnails(): boolean {
  return canvas_readback_trusted();
}

export async function render_pdf_thumbnail(
  data: ArrayBuffer,
  width: number,
  height: number,
): Promise<string> {
  if (!canvas_readback_trusted()) throw new CanvasReadbackError();

  const doc = await open_document_promise(data);

  try {
    const page = await doc.getPage(1);
    const viewport = page.getViewport({ scale: 1 });
    const scale = Math.min(width / viewport.width, height / viewport.height);
    const scaled_viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");

    await render_to_canvas(page, canvas, scaled_viewport);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/png"),
    );

    canvas.width = 0;
    canvas.height = 0;

    if (!blob) throw new Error("thumbnail_encode_failed");

    return URL.createObjectURL(blob);
  } finally {
    void doc.destroy();
  }
}

export async function load_pdf_document(
  data: ArrayBuffer,
  password?: string,
): Promise<PDFDocumentProxy> {
  return open_document_promise(data, password);
}

const MAX_CANVAS_PIXELS = 16_777_216;

export interface PdfPageSize {
  width: number;
  height: number;
}

export async function get_pdf_page_sizes(
  doc: PDFDocumentProxy,
): Promise<PdfPageSize[]> {
  const sizes: PdfPageSize[] = [];

  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const viewport = page.getViewport({ scale: 1 });

    sizes.push({ width: viewport.width, height: viewport.height });
  }

  return sizes;
}

function abort_error(): Error {
  const err = new Error("pdf_render_aborted");

  err.name = "AbortError";

  return err;
}

export function is_pdf_abort_error(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;

  const { name } = err as { name?: unknown };

  return (
    name === "AbortError" ||
    name === "AbortException" ||
    name === "RenderingCancelledException"
  );
}

export function effective_pixel_ratio(
  css_width: number,
  css_height: number,
  pixel_ratio: number,
): number {
  const area = Math.max(1, css_width * css_height);
  const cap = Math.sqrt(MAX_CANVAS_PIXELS / area);

  return Math.max(0.25, Math.min(pixel_ratio, cap));
}

export async function render_pdf_page_scaled(
  doc: PDFDocumentProxy,
  page_number: number,
  canvas: HTMLCanvasElement,
  scale: number,
  pixel_ratio: number,
  signal?: AbortSignal,
): Promise<void> {
  if (signal?.aborted) throw abort_error();

  const page = await doc.getPage(page_number);

  if (signal?.aborted) throw abort_error();

  const viewport = page.getViewport({ scale });
  const ratio = effective_pixel_ratio(
    viewport.width,
    viewport.height,
    pixel_ratio,
  );
  const ctx = canvas.getContext("2d");

  if (!ctx) throw new Error("canvas 2d context unavailable");

  canvas.width = Math.max(1, Math.floor(viewport.width * ratio));
  canvas.height = Math.max(1, Math.floor(viewport.height * ratio));

  const task = page.render({
    canvasContext: ctx,
    viewport,
    transform: [
      canvas.width / viewport.width,
      0,
      0,
      canvas.height / viewport.height,
      0,
      0,
    ],
  });
  const on_abort = () => task.cancel();

  signal?.addEventListener("abort", on_abort);

  try {
    await task.promise;
  } finally {
    signal?.removeEventListener("abort", on_abort);
  }
}

export async function render_pdf_text_layer(
  doc: PDFDocumentProxy,
  page_number: number,
  container: HTMLElement,
  signal?: AbortSignal,
): Promise<void> {
  if (signal?.aborted) throw abort_error();

  const page = await doc.getPage(page_number);

  if (signal?.aborted) throw abort_error();

  const viewport = page.getViewport({ scale: 1 });
  const text_layer = new pdfjs.TextLayer({
    textContentSource: page.streamTextContent({
      includeMarkedContent: false,
      disableNormalization: false,
    }),
    container,
    viewport,
  });
  const on_abort = () => text_layer.cancel();

  signal?.addEventListener("abort", on_abort);

  try {
    await text_layer.render();
  } finally {
    signal?.removeEventListener("abort", on_abort);
  }

  container.querySelectorAll("[id]").forEach((node) => {
    node.removeAttribute("id");
  });
}

export function cleanup_pdf_text_layers(): void {
  pdfjs.TextLayer.cleanup();
}

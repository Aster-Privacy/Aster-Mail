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
import type { CSSProperties, FormEvent, MutableRefObject } from "react";
import type {
  PDFDocumentProxy,
  PdfPageSize,
  PdfPasswordReason,
} from "@/lib/pdf_utils";

import {
  useState,
  useEffect,
  useLayoutEffect,
  useRef,
  useCallback,
  useId,
} from "react";
import { motion } from "framer-motion";
import {
  LockClosedIcon,
  MagnifyingGlassMinusIcon,
  MagnifyingGlassPlusIcon,
} from "@heroicons/react/24/outline";

import { use_i18n } from "@/lib/i18n/context";
import { Spinner } from "@/components/ui/spinner";
import { MAX_PDF_PASSWORD_LENGTH } from "@/lib/pdf_limits";
import { show_toast } from "@/components/toast/simple_toast";
import { ignore_error } from "@/lib/ignore_error";
import { use_dialog_shell } from "@/lib/use_dialog_shell";
import { canvas_readback_trusted } from "@/lib/canvas_readback";
import {
  decrypt_attachment_meta,
  decrypt_attachment_data,
  download_decrypted_attachment,
} from "@/services/crypto/attachment_crypto";

interface DecryptedAttachmentInfo {
  id: string;
  mail_item_id: string;
  seq_num: number;
  filename: string;
  content_type: string;
  size_bytes: number;
  encrypted_data: string;
  data_nonce: string;
  encrypted_meta: string;
  meta_nonce: string;
  preview_url?: string;
}

interface PdfPreviewModalProps {
  att?: DecryptedAttachmentInfo;
  filename: string;
  on_close: () => void;
  reduce_motion: boolean;
  local_data?: ArrayBuffer;
  on_download?: () => void;
}

function DownloadIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      viewBox="0 0 24 24"
    >
      <path
        d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

type PdfViewState = "loading" | "password" | "ready" | "error";

export const PDF_ZOOM_LEVELS = [
  0.5, 0.67, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4,
];
const DEFAULT_ZOOM_INDEX = PDF_ZOOM_LEVELS.indexOf(1);
const PDF_LOAD_TIMEOUT_MS = 30000;
const RENDER_DEBOUNCE_MS = 120;
const PAGE_GAP_PX = 12;
const NEAR_VIEWPORT_MARGIN = "1200px 0px";

export const PDF_TEXT_LAYER_CLASS = "pdf_text_layer";
export const PDF_END_OF_CONTENT_CLASS = "pdf_end_of_content";

const FOCUS_RING =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-white";
const BAR_BUTTON_CLASS = `flex items-center gap-1.5 px-3 py-1.5 rounded-[var(--aster-radius-control)] text-xs font-medium text-white/90 bg-white/10 hover:bg-white/20 transition-colors ${FOCUS_RING}`;
const ZOOM_BUTTON_CLASS = `flex h-7 w-7 items-center justify-center rounded-full text-white/90 bg-white/10 hover:bg-white/20 transition-colors disabled:opacity-40 disabled:hover:bg-white/10 ${FOCUS_RING}`;

function release_canvas(canvas: HTMLCanvasElement) {
  canvas.width = 0;
  canvas.height = 0;
}

function with_timeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let handle: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    handle = setTimeout(() => reject(new Error("timeout")), ms);
  });

  return Promise.race([promise, timeout]).finally(() => {
    if (handle) clearTimeout(handle);
  });
}

function current_pixel_ratio(): number {
  if (typeof window === "undefined") return 1;

  return window.devicePixelRatio || 1;
}

function fit_width(): number {
  if (typeof window === "undefined") return 900;

  return Math.min(window.innerWidth * 0.88, 900);
}

function is_editable_target(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;

  const tag = target.tagName;

  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

function is_firefox(): boolean {
  return typeof navigator !== "undefined" && /firefox/i.test(navigator.userAgent);
}

function reset_text_layer(layer: HTMLElement) {
  const end = layer.querySelector<HTMLElement>(`.${PDF_END_OF_CONTENT_CLASS}`);

  if (end) {
    layer.append(end);
    end.style.width = "";
    end.style.height = "";
  }
  layer.classList.remove("selecting");
}

function text_layers_in(root: HTMLElement): HTMLElement[] {
  return Array.from(
    root.querySelectorAll<HTMLElement>(`.${PDF_TEXT_LAYER_CLASS}`),
  );
}

export function select_all_pdf_text(root: HTMLElement): boolean {
  const layers = text_layers_in(root).filter(
    (layer) => layer.textContent && layer.textContent.length > 0,
  );

  if (layers.length === 0) return false;

  const selection = document.getSelection();

  if (!selection) return false;

  const first = layers[0];
  const last = layers[layers.length - 1];
  const range = document.createRange();

  range.setStart(first, 0);
  range.setEnd(last, last.childNodes.length);
  selection.removeAllRanges();
  selection.addRange(range);

  return true;
}

function use_pdf_text_selection(root: HTMLElement | null) {
  useEffect(() => {
    if (!root) return;

    const controller = new AbortController();
    const { signal } = controller;
    const skip_anchor_moves = is_firefox();
    let pointer_down = false;
    let previous_range: Range | null = null;

    const reset_all = () => {
      text_layers_in(root).forEach(reset_text_layer);
    };

    root.addEventListener(
      "mousedown",
      (event) => {
        const target = event.target as HTMLElement | null;
        const layer = target?.closest<HTMLElement>(`.${PDF_TEXT_LAYER_CLASS}`);

        layer?.classList.add("selecting");
      },
      { signal },
    );

    root.addEventListener(
      "copy",
      (event) => {
        const selection = document.getSelection();

        if (!selection || selection.rangeCount === 0) return;

        const range = selection.getRangeAt(0);
        const touches_layer = text_layers_in(root).some((layer) =>
          range.intersectsNode(layer),
        );

        if (!touches_layer || !event.clipboardData) return;

        event.clipboardData.setData(
          "text/plain",
          selection.toString().normalize("NFKC").replace(/\0/g, ""),
        );
        event.preventDefault();
        event.stopPropagation();
      },
      { signal },
    );

    document.addEventListener(
      "pointerdown",
      () => {
        pointer_down = true;
      },
      { signal },
    );
    document.addEventListener(
      "pointerup",
      () => {
        pointer_down = false;
        reset_all();
      },
      { signal },
    );
    window.addEventListener(
      "blur",
      () => {
        pointer_down = false;
        reset_all();
      },
      { signal },
    );
    document.addEventListener(
      "keyup",
      () => {
        if (!pointer_down) reset_all();
      },
      { signal },
    );
    document.addEventListener(
      "selectionchange",
      () => {
        const selection = document.getSelection();
        const layers = text_layers_in(root);

        if (!selection || selection.rangeCount === 0) {
          layers.forEach(reset_text_layer);
          previous_range = null;

          return;
        }

        const active = new Set<HTMLElement>();

        for (let i = 0; i < selection.rangeCount; i++) {
          const range = selection.getRangeAt(i);

          for (const layer of layers) {
            if (!active.has(layer) && range.intersectsNode(layer)) {
              active.add(layer);
            }
          }
        }

        for (const layer of layers) {
          if (active.has(layer)) layer.classList.add("selecting");
          else reset_text_layer(layer);
        }

        if (skip_anchor_moves || active.size === 0) return;

        const range = selection.getRangeAt(0);
        const modify_start =
          previous_range !== null &&
          (range.compareBoundaryPoints(Range.END_TO_END, previous_range) ===
            0 ||
            range.compareBoundaryPoints(Range.START_TO_END, previous_range) ===
              0);
        let anchor: Node | null = modify_start
          ? range.startContainer
          : range.endContainer;

        if (anchor && anchor.nodeType === Node.TEXT_NODE) {
          anchor = anchor.parentNode;
        }

        if (!modify_start && range.endOffset === 0 && anchor) {
          let guard = 0;

          do {
            while (anchor && !anchor.previousSibling && guard < 10000) {
              anchor = anchor.parentNode;
              guard += 1;
            }
            anchor = anchor ? anchor.previousSibling : null;
            guard += 1;
          } while (anchor && !anchor.childNodes.length && guard < 10000);
        }

        const parent = anchor?.parentElement ?? null;
        const layer = parent?.closest<HTMLElement>(
          `.${PDF_TEXT_LAYER_CLASS}`,
        );
        const end = layer?.querySelector<HTMLElement>(
          `.${PDF_END_OF_CONTENT_CLASS}`,
        );

        if (anchor && parent && layer && end && root.contains(layer)) {
          end.style.width = layer.style.width;
          end.style.height = layer.style.height;
          parent.insertBefore(end, modify_start ? anchor : anchor.nextSibling);
        }

        previous_range = range.cloneRange();
      },
      { signal },
    );

    return () => {
      controller.abort();
      text_layers_in(root).forEach(reset_text_layer);
    };
  }, [root]);
}

interface PdfPageProps {
  doc: PDFDocumentProxy;
  page_number: number;
  size: PdfPageSize;
  scale: number;
  pixel_ratio: number;
  label: string;
  show_canvas: boolean;
  scroll_root: HTMLElement | null;
  text_queue: MutableRefObject<Promise<void>>;
  on_render_error: () => void;
}

function PdfPage({
  doc,
  page_number,
  size,
  scale,
  pixel_ratio,
  label,
  show_canvas,
  scroll_root,
  text_queue,
  on_render_error,
}: PdfPageProps) {
  const wrapper_ref = useRef<HTMLDivElement>(null);
  const canvas_host_ref = useRef<HTMLDivElement>(null);
  const text_ref = useRef<HTMLDivElement>(null);
  const urls_ref = useRef<string[]>([]);
  const canvas_ref = useRef<HTMLCanvasElement | null>(null);
  const [is_near, set_is_near] = useState(
    typeof IntersectionObserver === "undefined",
  );
  const [image_url, set_image_url] = useState<string | null>(null);
  const [has_render, set_has_render] = useState(false);
  const width = Math.max(1, Math.floor(size.width * scale));
  const height = Math.max(1, Math.floor(size.height * scale));

  useEffect(() => {
    const wrapper = wrapper_ref.current;

    if (!wrapper || typeof IntersectionObserver === "undefined") return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) set_is_near(entry.isIntersecting);
      },
      { root: scroll_root, rootMargin: NEAR_VIEWPORT_MARGIN },
    );

    observer.observe(wrapper);

    return () => observer.disconnect();
  }, [scroll_root]);

  useEffect(() => {
    const text_el = text_ref.current;

    if (!text_el) return;

    const controller = new AbortController();

    text_queue.current = text_queue.current.then(async () => {
      if (controller.signal.aborted) return;

      try {
        const { render_pdf_text_layer } = await import("@/lib/pdf_utils");

        await render_pdf_text_layer(
          doc,
          page_number,
          text_el,
          controller.signal,
        );

        if (controller.signal.aborted) return;

        const end = document.createElement("div");

        end.className = PDF_END_OF_CONTENT_CLASS;
        text_el.append(end);
      } catch (caught) {
        ignore_error("components/email/pdf_preview_modal:text_layer", caught);
      }
    });

    return () => {
      controller.abort();
      text_el.replaceChildren();
    };
  }, [doc, page_number, text_queue]);

  useEffect(() => {
    if (!is_near) return;

    const controller = new AbortController();
    const timer = window.setTimeout(
      async () => {
        const { render_pdf_page_scaled, is_pdf_abort_error } = await import(
          "@/lib/pdf_utils"
        );
        const canvas = document.createElement("canvas");

        try {
          await render_pdf_page_scaled(
            doc,
            page_number,
            canvas,
            scale,
            pixel_ratio,
            controller.signal,
          );

          if (controller.signal.aborted) {
            release_canvas(canvas);

            return;
          }

          if (show_canvas) {
            const host = canvas_host_ref.current;

            if (!host) {
              release_canvas(canvas);

              return;
            }

            canvas.className = "pdf_page_canvas";
            canvas.setAttribute("role", "img");
            canvas.setAttribute("aria-label", label);
            host.replaceChildren(canvas);
            if (canvas_ref.current) release_canvas(canvas_ref.current);
            canvas_ref.current = canvas;
            set_has_render(true);

            return;
          }

          const blob = await new Promise<Blob | null>((resolve) =>
            canvas.toBlob(resolve, "image/png"),
          );

          release_canvas(canvas);

          if (!blob) throw new Error("page_render_failed");
          if (controller.signal.aborted) return;

          const url = URL.createObjectURL(blob);

          urls_ref.current.push(url);
          set_image_url((previous) => {
            if (previous) {
              URL.revokeObjectURL(previous);
              urls_ref.current = urls_ref.current.filter(
                (item) => item !== previous,
              );
            }

            return url;
          });
          set_has_render(true);
        } catch (caught) {
          release_canvas(canvas);
          if (controller.signal.aborted || is_pdf_abort_error(caught)) return;
          ignore_error("components/email/pdf_preview_modal:render", caught);
          on_render_error();
        }
      },
      has_render ? RENDER_DEBOUNCE_MS : 0,
    );

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [doc, page_number, scale, pixel_ratio, is_near, show_canvas, label]);

  useEffect(() => {
    const canvas_host = canvas_host_ref.current;

    return () => {
      urls_ref.current.forEach((url) => URL.revokeObjectURL(url));
      urls_ref.current = [];
      if (canvas_ref.current) {
        release_canvas(canvas_ref.current);
        canvas_ref.current = null;
      }
      canvas_host?.replaceChildren();
    };
  }, []);

  return (
    <div
      ref={wrapper_ref}
      className="pdf_page relative mx-auto shrink-0 overflow-hidden rounded-lg bg-white shadow-2xl"
      data-page-number={page_number}
      data-testid="pdf-page"
      style={
        {
          width: `${width}px`,
          height: `${height}px`,
          "--scale-factor": String(scale),
        } as CSSProperties
      }
    >
      {show_canvas ? (
        <div ref={canvas_host_ref} className="absolute inset-0" />
      ) : (
        image_url && (
          <img
            alt={label}
            className="pdf_page_image absolute inset-0 h-full w-full"
            draggable={false}
            src={image_url}
          />
        )
      )}
      {!has_render && (
        <div className="absolute inset-0 flex items-center justify-center">
          <Spinner className="text-black/30" size="md" />
        </div>
      )}
      <div
        ref={text_ref}
        data-selectable
        className={PDF_TEXT_LAYER_CLASS}
        data-testid="pdf-text-layer"
      />
    </div>
  );
}

export function PdfPreviewModal({
  att,
  filename,
  on_close,
  reduce_motion,
  local_data,
  on_download,
}: PdfPreviewModalProps) {
  const { t } = use_i18n();
  const { dialog_ref, handle_backdrop_pointer_down } =
    use_dialog_shell<HTMLDivElement>(true, on_close, "pdf_preview");
  const filename_id = useId();
  const password_input_ref = useRef<HTMLInputElement>(null);
  const pdf_doc_ref = useRef<PDFDocumentProxy | null>(null);
  const cancelled_ref = useRef(false);
  const text_queue_ref = useRef<Promise<void>>(Promise.resolve());
  const pending_scroll_ref = useRef<{ top: number; left: number } | null>(
    null,
  );
  const decrypted_ref = useRef<{
    data: ArrayBuffer;
    filename: string;
    content_type: string;
  } | null>(null);
  const [scroll_root, set_scroll_root] = useState<HTMLDivElement | null>(
    null,
  );
  const [pdf_doc, set_pdf_doc] = useState<PDFDocumentProxy | null>(null);
  const [page_sizes, set_page_sizes] = useState<PdfPageSize[]>([]);
  const [view_state, set_view_state] = useState<PdfViewState>("loading");
  const [password_value, set_password_value] = useState("");
  const [password_reason, set_password_reason] =
    useState<PdfPasswordReason>("required");
  const [is_unlocking, set_is_unlocking] = useState(false);
  const [zoom_index, set_zoom_index] = useState(DEFAULT_ZOOM_INDEX);
  const [pixel_ratio, set_pixel_ratio] = useState(current_pixel_ratio);
  const [available_width, set_available_width] = useState(fit_width);
  const [name_expanded, set_name_expanded] = useState(false);
  const [show_canvas] = useState(() => !canvas_readback_trusted());

  const total_pages = pdf_doc?.numPages ?? 0;
  const widest_page = page_sizes.reduce(
    (widest, size) => Math.max(widest, size.width),
    0,
  );
  const fit_scale = widest_page > 0 ? available_width / widest_page : 1;
  const zoom = PDF_ZOOM_LEVELS[zoom_index];
  const scale = fit_scale * zoom;

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;

    const query = window.matchMedia(`(resolution: ${pixel_ratio}dppx)`);
    const on_change = () => set_pixel_ratio(current_pixel_ratio());

    query.addEventListener?.("change", on_change);

    return () => query.removeEventListener?.("change", on_change);
  }, [pixel_ratio]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const on_resize = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        set_available_width(fit_width());
        set_pixel_ratio(current_pixel_ratio());
      }, RENDER_DEBOUNCE_MS);
    };

    window.addEventListener("resize", on_resize);

    return () => {
      if (timer) clearTimeout(timer);
      window.removeEventListener("resize", on_resize);
    };
  }, []);

  const show_document = useCallback(async (doc: PDFDocumentProxy) => {
    const { get_pdf_page_sizes } = await import("@/lib/pdf_utils");

    if (cancelled_ref.current) {
      doc.destroy();

      return;
    }

    pdf_doc_ref.current = doc;

    const sizes = await get_pdf_page_sizes(doc);

    if (cancelled_ref.current) return;

    if (sizes.length === 0) {
      set_view_state("error");

      return;
    }

    text_queue_ref.current = Promise.resolve();
    set_page_sizes(sizes);
    set_pdf_doc(doc);
    set_view_state("ready");
  }, []);

  const open_document = useCallback(async (password?: string) => {
    const cached = decrypted_ref.current;

    if (!cached) throw new Error("pdf_data_unavailable");

    const { load_pdf_document } = await import("@/lib/pdf_utils");

    return with_timeout(
      load_pdf_document(cached.data.slice(0), password),
      PDF_LOAD_TIMEOUT_MS,
    );
  }, []);

  useEffect(() => {
    cancelled_ref.current = false;

    async function load() {
      set_view_state("loading");

      try {
        if (local_data) {
          decrypted_ref.current = {
            data: local_data,
            filename: att?.filename ?? filename,
            content_type: att?.content_type ?? "application/pdf",
          };
        } else if (att) {
          const meta = await decrypt_attachment_meta(
            att.encrypted_meta,
            att.meta_nonce,
            att.mail_item_id,
            att.seq_num,
          );

          const data = await decrypt_attachment_data(
            att.encrypted_data,
            att.data_nonce,
            meta.session_key,
            att.mail_item_id,
            att.seq_num,
          );

          if (cancelled_ref.current) return;

          decrypted_ref.current = {
            data,
            filename: meta.filename,
            content_type: meta.content_type,
          };
        } else {
          throw new Error("pdf_data_unavailable");
        }

        const doc = await open_document();

        await show_document(doc);
      } catch (err) {
        if (cancelled_ref.current) return;

        const { is_pdf_password_error } = await import("@/lib/pdf_utils");

        if (is_pdf_password_error(err)) {
          set_password_reason("required");
          set_view_state("password");

          return;
        }

        if (import.meta.env.DEV)
          console.error(
            "[pdf_preview] load error:",
            err instanceof Error ? err.message : String(err),
          );
        set_view_state("error");
      }
    }

    load();

    return () => {
      cancelled_ref.current = true;
      pdf_doc_ref.current?.destroy();
      pdf_doc_ref.current = null;
      decrypted_ref.current = null;
      set_pdf_doc(null);
      set_page_sizes([]);
      set_password_value("");
    };
  }, [att, filename, local_data, open_document, show_document]);

  useEffect(() => {
    return () => {
      window.setTimeout(() => {
        import("@/lib/pdf_utils")
          .then(({ cleanup_pdf_text_layers }) => cleanup_pdf_text_layers())
          .catch(() => {});
      }, 0);
    };
  }, []);

  useEffect(() => {
    if (view_state === "password" && !is_unlocking) {
      password_input_ref.current?.focus();
    }
  }, [view_state, is_unlocking, password_reason]);

  use_pdf_text_selection(view_state === "ready" ? scroll_root : null);

  useEffect(() => {
    if (view_state !== "ready" || !scroll_root) return;

    const on_key_down = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
      if (event.key.toLowerCase() !== "a") return;
      if (is_editable_target(event.target)) return;

      const dialog = dialog_ref.current;
      const active = document.activeElement;

      if (
        dialog &&
        active &&
        active !== document.body &&
        !dialog.contains(active)
      ) {
        return;
      }

      if (select_all_pdf_text(scroll_root)) {
        event.preventDefault();
        event.stopPropagation();
      }
    };

    document.addEventListener("keydown", on_key_down, true);

    return () => document.removeEventListener("keydown", on_key_down, true);
  }, [view_state, scroll_root, dialog_ref]);

  const change_zoom = useCallback(
    (next_index: number) => {
      const clamped = Math.max(
        0,
        Math.min(PDF_ZOOM_LEVELS.length - 1, next_index),
      );

      if (clamped === zoom_index) return;

      const el = scroll_root;

      if (el && el.scrollHeight > 0) {
        pending_scroll_ref.current = {
          top: (el.scrollTop + el.clientHeight / 2) / el.scrollHeight,
          left:
            el.scrollWidth > 0
              ? (el.scrollLeft + el.clientWidth / 2) / el.scrollWidth
              : 0.5,
        };
      }
      set_zoom_index(clamped);
    },
    [zoom_index, scroll_root],
  );

  useLayoutEffect(() => {
    const pending = pending_scroll_ref.current;
    const el = scroll_root;

    if (!pending || !el) return;

    pending_scroll_ref.current = null;
    el.scrollTop = pending.top * el.scrollHeight - el.clientHeight / 2;
    el.scrollLeft = pending.left * el.scrollWidth - el.clientWidth / 2;
  }, [scale, scroll_root]);

  const handle_unlock = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();

      if (is_unlocking || password_value.length === 0) return;

      const attempt = password_value;

      set_password_value("");
      set_is_unlocking(true);

      try {
        const doc = await open_document(attempt);

        if (cancelled_ref.current) {
          doc.destroy();

          return;
        }

        await show_document(doc);
      } catch (err) {
        if (cancelled_ref.current) return;

        const { is_pdf_password_error } = await import("@/lib/pdf_utils");

        if (is_pdf_password_error(err)) {
          set_password_reason("incorrect");

          return;
        }

        set_view_state("error");
      } finally {
        if (!cancelled_ref.current) set_is_unlocking(false);
      }
    },
    [is_unlocking, password_value, open_document, show_document],
  );

  const handle_download = useCallback(async () => {
    if (on_download) {
      on_download();

      return;
    }

    try {
      const cached = decrypted_ref.current;

      if (cached) {
        download_decrypted_attachment(
          cached.data,
          cached.filename,
          cached.content_type,
        );

        return;
      }

      if (!att) throw new Error("pdf_data_unavailable");

      const meta = await decrypt_attachment_meta(
        att.encrypted_meta,
        att.meta_nonce,
        att.mail_item_id,
        att.seq_num,
      );

      const data = await decrypt_attachment_data(
        att.encrypted_data,
        att.data_nonce,
        meta.session_key,
        att.mail_item_id,
        att.seq_num,
      );

      decrypted_ref.current = {
        data,
        filename: meta.filename,
        content_type: meta.content_type,
      };

      download_decrypted_attachment(data, meta.filename, meta.content_type);
    } catch (caught) {
      ignore_error(
        "components/email/pdf_preview_modal:handle_download",
        caught,
      );
      show_toast(t("common.download_failed"), "error");
    }
  }, [att, on_download, t]);

  const handle_render_error = useCallback(() => {
    show_toast(t("mail.pdf_preview_failed"), "error");
  }, [t]);

  const render_error_shown_ref = useRef(false);
  const report_render_error = useCallback(() => {
    if (render_error_shown_ref.current) return;
    render_error_shown_ref.current = true;
    handle_render_error();
  }, [handle_render_error]);

  return (
    <motion.div
      ref={dialog_ref}
      animate={{ opacity: 1 }}
      aria-label={filename}
      aria-modal="true"
      className="fixed inset-0 z-[9999] flex flex-col items-center justify-center outline-none"
      exit={{ opacity: 0 }}
      initial={{ opacity: 0 }}
      role="dialog"
      style={{ backgroundColor: "rgba(0, 0, 0, 0.85)" }}
      tabIndex={-1}
      transition={{ duration: reduce_motion ? 0 : 0.2 }}
      onPointerDown={handle_backdrop_pointer_down}
    >
      <motion.div
        animate={{ scale: 1, opacity: 1 }}
        className="relative flex flex-col items-center max-w-[92vw] max-h-[92vh]"
        exit={{ scale: 0.95, opacity: 0 }}
        initial={{ scale: 0.95, opacity: 0 }}
        transition={{ duration: reduce_motion ? 0 : 0.2 }}
      >
        {view_state === "loading" && (
          <div className="flex items-center justify-center w-[400px] max-w-[88vw] h-[300px]">
            <div className="flex flex-col items-center gap-2">
              <Spinner className="text-white/80" size="lg" />
              <span className="text-white/60 text-sm">
                {t("mail.loading_preview")}
              </span>
            </div>
          </div>
        )}

        {view_state === "error" && (
          <div className="flex flex-col items-center justify-center gap-2 w-[400px] max-w-[88vw] h-[300px] px-6 text-center">
            <span className="text-white/60 text-sm" role="alert">
              {t("mail.pdf_preview_failed")}
            </span>
          </div>
        )}

        {view_state === "password" && (
          <form
            noValidate
            autoComplete="off"
            className="flex flex-col gap-3 w-[360px] max-w-[88vw] p-5 rounded-[16px] bg-white/10 backdrop-blur-sm"
            data-testid="pdf-password-form"
            onSubmit={handle_unlock}
          >
            <div className="flex items-center gap-2">
              <LockClosedIcon
                aria-hidden="true"
                className="w-5 h-5 shrink-0 text-white/80"
              />
              <h2
                className="text-white text-[15px] font-semibold"
                id="pdf-password-title"
              >
                {t("mail.pdf_password_title")}
              </h2>
            </div>
            <p
              className="text-white/60 text-[13px] leading-snug"
              id="pdf-password-description"
            >
              {t("mail.pdf_password_description")}
            </p>
            <label className="sr-only" htmlFor="pdf-password-input">
              {t("mail.pdf_password_label")}
            </label>
            <input
              ref={password_input_ref}
              aria-describedby={
                password_reason === "incorrect"
                  ? "pdf-password-error"
                  : "pdf-password-description"
              }
              aria-invalid={password_reason === "incorrect"}
              autoCapitalize="none"
              autoComplete="off"
              autoCorrect="off"
              className="w-full h-10 px-3 rounded-[var(--aster-radius-control)] text-sm text-white bg-black/30 border border-white/15 placeholder:text-white/40 outline-none focus:border-white/50 disabled:opacity-60"
              data-1p-ignore="true"
              data-bwignore="true"
              data-form-type="other"
              data-lpignore="true"
              data-testid="pdf-password-input"
              disabled={is_unlocking}
              id="pdf-password-input"
              maxLength={MAX_PDF_PASSWORD_LENGTH}
              name="pdf-document-key"
              placeholder={t("mail.pdf_password_label")}
              spellCheck={false}
              type="password"
              value={password_value}
              onChange={(e) => set_password_value(e.target.value)}
            />
            <div aria-live="polite" className="min-h-[18px]">
              {password_reason === "incorrect" && !is_unlocking && (
                <span
                  className="text-[12.5px] text-red-300"
                  data-testid="pdf-password-error"
                  id="pdf-password-error"
                >
                  {t("mail.pdf_password_incorrect")}
                </span>
              )}
            </div>
            <button
              className="h-10 rounded-[var(--aster-radius-control)] text-sm font-medium text-black bg-white hover:bg-white/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              data-testid="pdf-password-submit"
              disabled={is_unlocking || password_value.length === 0}
              type="submit"
            >
              {is_unlocking && (
                <Spinner className="text-black/70" size="sm" />
              )}
              {t("mail.pdf_password_submit")}
            </button>
          </form>
        )}

        {view_state === "ready" && pdf_doc && page_sizes.length > 0 && (
          <div
            ref={set_scroll_root}
            className="pdf_scroll_root overflow-auto max-w-[90vw]"
            data-testid="pdf-pages"
            style={{ maxHeight: "calc(92vh - 60px)" }}
          >
            <div
              className="mx-auto flex w-max flex-col items-center pb-3"
              style={{ gap: `${PAGE_GAP_PX}px` }}
            >
              {page_sizes.map((size, i) => (
                <PdfPage
                  key={`page-${i + 1}`}
                  doc={pdf_doc}
                  label={t("mail.page_of_total", {
                    current: i + 1,
                    total: total_pages,
                  })}
                  on_render_error={report_render_error}
                  page_number={i + 1}
                  pixel_ratio={pixel_ratio}
                  scale={scale}
                  scroll_root={scroll_root}
                  show_canvas={show_canvas}
                  size={size}
                  text_queue={text_queue_ref}
                />
              ))}
            </div>
          </div>
        )}

        {view_state !== "loading" && (
          <div
            className="mt-2 flex max-w-[92vw] flex-wrap items-center justify-center gap-x-3 gap-y-2 rounded-lg bg-white/10 px-4 py-2 backdrop-blur-sm"
            data-testid="pdf-toolbar"
          >
            <button
              aria-controls={filename_id}
              aria-expanded={name_expanded}
              className={`min-w-0 rounded-md px-1 -mx-1 text-left text-sm text-white/80 hover:text-white ${FOCUS_RING} ${
                name_expanded
                  ? "max-w-[min(640px,86vw)] whitespace-normal break-all"
                  : "max-w-[300px]"
              }`}
              data-testid="pdf-filename-toggle"
              title={filename}
              type="button"
              onClick={() => set_name_expanded((value) => !value)}
            >
              <span
                className={name_expanded ? "block" : "block truncate"}
                id={filename_id}
              >
                {filename}
              </span>
            </button>
            {total_pages > 0 && (
              <>
                <span aria-hidden="true" className="text-white/30">
                  |
                </span>
                <span className="text-white/60 text-sm whitespace-nowrap">
                  {t("mail.total_pages_label", {
                    count: total_pages,
                  })}
                </span>
              </>
            )}
            {view_state === "ready" && (
              <>
                <span aria-hidden="true" className="text-white/30">
                  |
                </span>
                <div className="flex items-center gap-1.5">
                  <button
                    aria-label={t("common.zoom_out")}
                    className={ZOOM_BUTTON_CLASS}
                    data-testid="pdf-zoom-out"
                    disabled={zoom_index === 0}
                    title={t("common.zoom_out")}
                    type="button"
                    onClick={() => change_zoom(zoom_index - 1)}
                  >
                    <MagnifyingGlassMinusIcon className="h-4 w-4" />
                  </button>
                  <button
                    aria-label={t("common.zoom_to_fit")}
                    className={`h-7 min-w-[3.25rem] rounded-full bg-white/10 px-2 text-xs font-medium tabular-nums text-white/90 transition-colors hover:bg-white/20 ${FOCUS_RING}`}
                    data-testid="pdf-zoom-reset"
                    title={t("common.zoom_to_fit")}
                    type="button"
                    onClick={() => change_zoom(DEFAULT_ZOOM_INDEX)}
                  >
                    {`${Math.round(zoom * 100)}%`}
                  </button>
                  <button
                    aria-label={t("common.zoom_in")}
                    className={ZOOM_BUTTON_CLASS}
                    data-testid="pdf-zoom-in"
                    disabled={zoom_index === PDF_ZOOM_LEVELS.length - 1}
                    title={t("common.zoom_in")}
                    type="button"
                    onClick={() => change_zoom(zoom_index + 1)}
                  >
                    <MagnifyingGlassPlusIcon className="h-4 w-4" />
                  </button>
                </div>
              </>
            )}
            <span aria-hidden="true" className="text-white/30">
              |
            </span>
            <div className="flex items-center gap-2">
              <button
                className={BAR_BUTTON_CLASS}
                data-testid="pdf-download"
                type="button"
                onClick={handle_download}
              >
                <DownloadIcon className="w-3.5 h-3.5" />
                {t("common.download")}
              </button>
              <button
                className={BAR_BUTTON_CLASS}
                data-testid="pdf-close"
                type="button"
                onClick={on_close}
              >
                {t("common.close")}
              </button>
            </div>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}

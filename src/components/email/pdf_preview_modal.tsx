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
import type { FormEvent } from "react";
import type { PDFDocumentProxy, PdfPasswordReason } from "@/lib/pdf_utils";

import { useState, useEffect, useRef, useCallback } from "react";
import { motion } from "framer-motion";
import { LockClosedIcon } from "@heroicons/react/24/outline";

import { use_i18n } from "@/lib/i18n/context";
import { MAX_PDF_PASSWORD_LENGTH } from "@/lib/pdf_limits";
import { show_toast } from "@/components/toast/simple_toast";
import { ignore_error } from "@/lib/ignore_error";
import { use_dialog_shell } from "@/lib/use_dialog_shell";
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
  att: DecryptedAttachmentInfo;
  filename: string;
  on_close: () => void;
  reduce_motion: boolean;
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

const PDF_LOAD_TIMEOUT_MS = 30000;

function with_timeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let handle: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    handle = setTimeout(() => reject(new Error("timeout")), ms);
  });

  return Promise.race([promise, timeout]).finally(() => {
    if (handle) clearTimeout(handle);
  });
}

export function PdfPreviewModal({
  att,
  filename,
  on_close,
  reduce_motion,
}: PdfPreviewModalProps) {
  const { t } = use_i18n();
  const { dialog_ref, handle_backdrop_pointer_down } =
    use_dialog_shell<HTMLDivElement>(true, on_close, "pdf_preview");
  const scroll_ref = useRef<HTMLDivElement>(null);
  const password_input_ref = useRef<HTMLInputElement>(null);
  const pdf_doc_ref = useRef<PDFDocumentProxy | null>(null);
  const created_urls_ref = useRef<string[]>([]);
  const cancelled_ref = useRef(false);
  const decrypted_ref = useRef<{
    data: ArrayBuffer;
    filename: string;
    content_type: string;
  } | null>(null);
  const [total_pages, set_total_pages] = useState(0);
  const [view_state, set_view_state] = useState<PdfViewState>("loading");
  const [page_canvases, set_page_canvases] = useState<string[]>([]);
  const [password_value, set_password_value] = useState("");
  const [password_reason, set_password_reason] =
    useState<PdfPasswordReason>("required");
  const [is_unlocking, set_is_unlocking] = useState(false);
  const [is_rendering, set_is_rendering] = useState(false);

  const render_document = useCallback(async (doc: PDFDocumentProxy) => {
    const { render_pdf_page } = await import("@/lib/pdf_utils");

    if (cancelled_ref.current) {
      doc.destroy();

      return;
    }

    pdf_doc_ref.current = doc;
    set_total_pages(doc.numPages);
    set_view_state("ready");
    set_is_rendering(true);

    const max_width = Math.min(window.innerWidth * 0.88, 900);
    const urls: string[] = [];

    try {
      for (let i = 1; i <= doc.numPages; i++) {
        if (cancelled_ref.current) return;

        const offscreen = document.createElement("canvas");

        await render_pdf_page(doc, i, offscreen, max_width);

        const blob = await new Promise<Blob | null>((resolve) =>
          offscreen.toBlob(resolve, "image/png"),
        );

        offscreen.width = 0;
        offscreen.height = 0;

        if (!blob) throw new Error("page_render_failed");
        if (cancelled_ref.current) return;

        urls.push(URL.createObjectURL(blob));
        created_urls_ref.current = urls;

        if (i === 1 || i % 3 === 0 || i === doc.numPages) {
          set_page_canvases([...urls]);
        }
      }
    } finally {
      if (!cancelled_ref.current) {
        set_page_canvases([...urls]);
        set_is_rendering(false);
        if (urls.length === 0) set_view_state("error");
      }
    }
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

        const doc = await open_document();

        await render_document(doc);
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
      created_urls_ref.current.forEach((url) => URL.revokeObjectURL(url));
      created_urls_ref.current = [];
      decrypted_ref.current = null;
      set_password_value("");
    };
  }, [att, open_document, render_document]);

  useEffect(() => {
    if (view_state === "password" && !is_unlocking) {
      password_input_ref.current?.focus();
    }
  }, [view_state, is_unlocking, password_reason]);

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

        await render_document(doc);
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
    [is_unlocking, password_value, open_document, render_document],
  );

  const handle_download = useCallback(async () => {
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
  }, [att, t]);

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
        {(view_state === "loading" ||
          (view_state === "ready" && page_canvases.length === 0)) && (
          <div className="flex items-center justify-center w-[400px] max-w-[88vw] h-[300px]">
            <div className="flex flex-col items-center gap-2">
              <div className="w-8 h-8 border-2 border-white/20 border-t-white/80 rounded-full animate-spin" />
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
              className="w-full h-10 px-3 rounded-[12px] text-sm text-white bg-black/30 border border-white/15 placeholder:text-white/40 outline-none focus:border-white/50 disabled:opacity-60"
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
              className="h-10 rounded-[12px] text-sm font-medium text-black bg-white hover:bg-white/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              data-testid="pdf-password-submit"
              disabled={is_unlocking || password_value.length === 0}
              type="submit"
            >
              {is_unlocking && (
                <span className="w-4 h-4 border-2 border-black/20 border-t-black/70 rounded-full animate-spin" />
              )}
              {t("mail.pdf_password_submit")}
            </button>
          </form>
        )}

        {view_state === "ready" && page_canvases.length > 0 && (
          <div
            ref={scroll_ref}
            className="overflow-y-auto overflow-x-hidden flex flex-col items-center gap-3 pb-3"
            data-testid="pdf-pages"
            style={{ maxHeight: "calc(92vh - 52px)", maxWidth: "90vw" }}
          >
            {page_canvases.map((url, i) => (
              <img
                key={url}
                alt={t("mail.page_of_total", {
                  current: i + 1,
                  total: total_pages || page_canvases.length,
                })}
                className="rounded-lg shadow-2xl"
                src={url}
                style={{
                  maxWidth: "100%",
                  width: "auto",
                  height: "auto",
                }}
              />
            ))}
            {is_rendering && (
              <div className="flex items-center gap-2 py-2">
                <div className="w-5 h-5 border-2 border-white/20 border-t-white/80 rounded-full animate-spin" />
                <span className="text-white/50 text-xs">
                  {t("mail.loading_preview")}
                </span>
              </div>
            )}
          </div>
        )}

        {view_state !== "loading" && (
          <div className="flex items-center gap-3 px-4 py-2 mt-2 rounded-lg bg-white/10 backdrop-blur-sm">
            <span className="text-white/80 text-sm truncate max-w-[300px]">
              {filename}
            </span>
            {total_pages > 0 && (
              <>
                <span className="text-white/30">|</span>
                <span className="text-white/60 text-sm whitespace-nowrap">
                  {t("mail.total_pages_label", {
                    count: total_pages,
                  })}
                </span>
              </>
            )}
            <span className="text-white/30">|</span>
            <button
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-[12px] text-xs font-medium text-white/90 bg-white/10 hover:bg-white/20 transition-colors"
              onClick={handle_download}
            >
              <DownloadIcon className="w-3.5 h-3.5" />
              {t("common.download")}
            </button>
            <button
              className="px-3 py-1.5 rounded-[12px] text-xs font-medium text-white/90 bg-white/10 hover:bg-white/20 transition-colors"
              onClick={on_close}
            >
              {t("common.close")}
            </button>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}

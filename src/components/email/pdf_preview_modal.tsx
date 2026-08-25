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
import type { PDFDocumentProxy } from "@/lib/pdf_utils";

import { useState, useEffect, useRef, useCallback } from "react";
import { motion } from "framer-motion";

import { use_i18n } from "@/lib/i18n/context";
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
  const pdf_doc_ref = useRef<PDFDocumentProxy | null>(null);
  const render_lock_ref = useRef(false);
  const created_urls_ref = useRef<string[]>([]);
  const decrypted_ref = useRef<{
    data: ArrayBuffer;
    filename: string;
    content_type: string;
  } | null>(null);
  const [total_pages, set_total_pages] = useState(0);
  const [is_loading, set_is_loading] = useState(true);
  const [page_canvases, set_page_canvases] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      let timeout_handle: ReturnType<typeof setTimeout> | undefined;

      set_is_loading(true);

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

        if (cancelled) return;

        decrypted_ref.current = {
          data,
          filename: meta.filename,
          content_type: meta.content_type,
        };

        const { load_pdf_document, render_pdf_page } = await import(
          "@/lib/pdf_utils"
        );
        const timeout = new Promise<never>((_, reject) => {
          timeout_handle = setTimeout(
            () => reject(new Error("timeout")),
            30000,
          );
        });
        const doc = await Promise.race([
          load_pdf_document(data.slice(0)),
          timeout,
        ]);

        if (cancelled) {
          doc.destroy();

          return;
        }

        pdf_doc_ref.current = doc;
        set_total_pages(doc.numPages);

        if (render_lock_ref.current) return;
        render_lock_ref.current = true;

        const max_width = Math.min(window.innerWidth * 0.88, 900);
        const urls: string[] = [];

        for (let i = 1; i <= doc.numPages; i++) {
          if (cancelled) break;

          const offscreen = document.createElement("canvas");

          await render_pdf_page(doc, i, offscreen, max_width);

          const blob = await new Promise<Blob>((resolve) =>
            offscreen.toBlob((b) => resolve(b!), "image/png"),
          );

          urls.push(URL.createObjectURL(blob));
          created_urls_ref.current = urls;

          if (i === 1 || i % 3 === 0 || i === doc.numPages) {
            set_page_canvases([...urls]);
          }
        }

        if (!cancelled) {
          set_page_canvases([...urls]);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);

        if (import.meta.env.DEV)
          console.error("[pdf_preview] load error:", msg, err);
      } finally {
        if (timeout_handle) clearTimeout(timeout_handle);
        if (!cancelled) set_is_loading(false);
        render_lock_ref.current = false;
      }
    }

    load();

    return () => {
      cancelled = true;
      pdf_doc_ref.current?.destroy();
      pdf_doc_ref.current = null;
      created_urls_ref.current.forEach((url) => URL.revokeObjectURL(url));
      created_urls_ref.current = [];
      decrypted_ref.current = null;
    };
  }, [att]);

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
      ignore_error("components/email/pdf_preview_modal:handle_download", caught);
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
        {is_loading && page_canvases.length === 0 && (
          <div className="flex items-center justify-center w-[400px] h-[300px]">
            <div className="flex flex-col items-center gap-2">
              <div className="w-8 h-8 border-2 border-white/20 border-t-white/80 rounded-full animate-spin" />
              <span className="text-white/60 text-sm">
                {t("mail.loading_preview")}
              </span>
            </div>
          </div>
        )}

        {!is_loading && page_canvases.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-2 w-[400px] h-[300px]">
            <span className="text-white/60 text-sm">
              {t("mail.preview_failed")}
            </span>
          </div>
        )}

        {page_canvases.length > 0 && (
          <div
            ref={scroll_ref}
            className="overflow-y-auto overflow-x-hidden flex flex-col items-center gap-3 pb-3"
            style={{ maxHeight: "calc(92vh - 52px)", maxWidth: "90vw" }}
          >
            {page_canvases.map((url, i) => (
              <img
                key={i}
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
            {is_loading && (
              <div className="flex items-center gap-2 py-2">
                <div className="w-5 h-5 border-2 border-white/20 border-t-white/80 rounded-full animate-spin" />
                <span className="text-white/50 text-xs">
                  {t("mail.loading_preview")}
                </span>
              </div>
            )}
          </div>
        )}

        {(page_canvases.length > 0 || !is_loading) && (
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

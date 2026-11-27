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
import type { TranslationKey } from "@/lib/i18n/types";
import type { DecryptedSecureAttachment } from "@/services/crypto/secure_message_crypto";
import type { SecurePreview } from "@/lib/secure_view_attachment_preview";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowDownTrayIcon,
  DocumentIcon,
  DocumentTextIcon,
  EyeIcon,
  FilmIcon,
  MusicalNoteIcon,
  PhotoIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { Button } from "@aster/ui";

import { ImagePreviewModal } from "@/components/email/attachment_list/preview_modal";
import { PdfPreviewModal } from "@/components/email/pdf_preview_modal";
import { use_dialog_shell } from "@/lib/use_dialog_shell";
import { format_bytes } from "@/lib/utils";
import {
  create_preview_url,
  detect_secure_preview,
  display_attachment_name,
  download_secure_attachment,
  read_text_preview,
} from "@/lib/secure_view_attachment_preview";

type Translate = (
  key: TranslationKey,
  params?: Record<string, string | number>,
) => string;

interface SecureViewAttachmentsProps {
  attachments: DecryptedSecureAttachment[];
  t: Translate;
  reduce_motion: boolean;
}

interface PreparedAttachment {
  index: number;
  name: string;
  size: number;
  data: Uint8Array;
  preview: SecurePreview | null;
}

type OpenPreview =
  | { kind: "image"; index: number; url: string }
  | { kind: "pdf"; index: number; buffer: ArrayBuffer }
  | { kind: "text"; index: number; text: string; truncated: boolean }
  | { kind: "audio" | "video"; index: number; url: string; mime: string };

const DOWNLOAD_URL_LIFETIME_MS = 60_000;
const FOCUS_RING =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-white";
const BAR_BUTTON_CLASS = `flex items-center gap-1.5 px-3 py-1.5 rounded-[var(--aster-radius-control)] text-xs font-medium text-white/90 bg-white/10 hover:bg-white/20 transition-colors ${FOCUS_RING}`;

function kind_icon(preview: SecurePreview | null) {
  switch (preview?.kind) {
    case "image":
      return PhotoIcon;
    case "pdf":
    case "text":
      return DocumentTextIcon;
    case "audio":
      return MusicalNoteIcon;
    case "video":
      return FilmIcon;
    default:
      return DocumentIcon;
  }
}

function copy_buffer(data: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(data.byteLength);

  copy.set(data);

  return copy.buffer;
}

function SecureFileModal({
  filename,
  on_close,
  on_download,
  reduce_motion,
  t,
  children,
  notice,
}: {
  filename: string;
  on_close: () => void;
  on_download: () => void;
  reduce_motion: boolean;
  t: Translate;
  children: React.ReactNode;
  notice?: string;
}) {
  const { dialog_ref, handle_backdrop_pointer_down } =
    use_dialog_shell<HTMLDivElement>(true, on_close, "secure_file_preview");

  return (
    <motion.div
      ref={dialog_ref}
      animate={{ opacity: 1 }}
      aria-label={filename}
      aria-modal="true"
      className="fixed inset-0 z-[9999] flex flex-col items-center justify-center p-4 outline-none"
      data-testid="secure-file-preview"
      exit={{ opacity: 0 }}
      initial={{ opacity: 0 }}
      role="dialog"
      style={{ backgroundColor: "rgba(0, 0, 0, 0.85)" }}
      tabIndex={-1}
      transition={{ duration: reduce_motion ? 0 : 0.2 }}
      onPointerDown={handle_backdrop_pointer_down}
    >
      <div className="flex w-full max-w-[min(960px,92vw)] flex-col items-center gap-2">
        {children}
        {notice && (
          <p className="text-center text-xs text-white/70" role="status">
            {notice}
          </p>
        )}
        <div className="flex max-w-full flex-wrap items-center justify-center gap-x-3 gap-y-2 rounded-lg bg-white/10 px-4 py-2 backdrop-blur-sm">
          <span
            className="min-w-0 max-w-[min(480px,70vw)] truncate text-sm text-white/80"
            title={filename}
          >
            {filename}
          </span>
          <span aria-hidden="true" className="text-white/30">
            |
          </span>
          <div className="flex items-center gap-2">
            <button
              className={BAR_BUTTON_CLASS}
              type="button"
              onClick={on_download}
            >
              <ArrowDownTrayIcon aria-hidden="true" className="h-3.5 w-3.5" />
              {t("common.download")}
            </button>
            <button
              className={BAR_BUTTON_CLASS}
              type="button"
              onClick={on_close}
            >
              <XMarkIcon aria-hidden="true" className="h-3.5 w-3.5" />
              {t("common.close")}
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

export function SecureViewAttachments({
  attachments,
  t,
  reduce_motion,
}: SecureViewAttachmentsProps) {
  const [open_preview, set_open_preview] = useState<OpenPreview | null>(null);
  const download_urls_ref = useRef(new Set<string>());
  const preview_url_ref = useRef<string | null>(null);

  const prepared = useMemo<PreparedAttachment[]>(
    () =>
      attachments.map((attachment, index) => {
        const data =
          attachment.data instanceof Uint8Array
            ? attachment.data
            : new Uint8Array(0);

        return {
          index,
          name: display_attachment_name(attachment.filename),
          size: data.byteLength,
          data,
          preview: detect_secure_preview(
            data,
            typeof attachment.content_type === "string"
              ? attachment.content_type
              : "",
            typeof attachment.filename === "string" ? attachment.filename : "",
          ),
        };
      }),
    [attachments],
  );

  const release_preview_url = useCallback(() => {
    if (preview_url_ref.current) {
      URL.revokeObjectURL(preview_url_ref.current);
      preview_url_ref.current = null;
    }
  }, []);

  useEffect(() => {
    const download_urls = download_urls_ref.current;

    return () => {
      release_preview_url();
      download_urls.forEach((url) => URL.revokeObjectURL(url));
      download_urls.clear();
    };
  }, [release_preview_url]);

  useEffect(() => {
    release_preview_url();
    set_open_preview(null);
  }, [attachments, release_preview_url]);

  const close_preview = useCallback(() => {
    release_preview_url();
    set_open_preview(null);
  }, [release_preview_url]);

  const handle_download = useCallback((item: PreparedAttachment) => {
    download_secure_attachment(item.data, item.name, (url) => {
      download_urls_ref.current.add(url);
      window.setTimeout(() => {
        if (download_urls_ref.current.delete(url)) URL.revokeObjectURL(url);
      }, DOWNLOAD_URL_LIFETIME_MS);
    });
  }, []);

  const handle_preview = useCallback(
    (item: PreparedAttachment) => {
      const preview = item.preview;

      if (!preview) return;

      release_preview_url();

      if (preview.kind === "pdf") {
        set_open_preview({
          kind: "pdf",
          index: item.index,
          buffer: copy_buffer(item.data),
        });

        return;
      }

      if (preview.kind === "text") {
        const { text, truncated } = read_text_preview(item.data);

        set_open_preview({ kind: "text", index: item.index, text, truncated });

        return;
      }

      const url = create_preview_url(item.data, preview.mime);

      preview_url_ref.current = url;

      if (preview.kind === "image") {
        set_open_preview({ kind: "image", index: item.index, url });

        return;
      }

      set_open_preview({
        kind: preview.kind,
        index: item.index,
        url,
        mime: preview.mime,
      });
    },
    [release_preview_url],
  );

  const active = open_preview ? prepared[open_preview.index] : null;

  return (
    <>
      <ul className="space-y-2" data-testid="secure-attachments">
        {prepared.map((item) => {
          const Icon = kind_icon(item.preview);

          return (
            <li
              key={item.index}
              className="flex items-center gap-3 rounded-[12px] bg-surf-tertiary px-3 py-2"
              data-testid="secure-attachment"
            >
              <Icon
                aria-hidden="true"
                className="h-5 w-5 shrink-0 text-txt-tertiary"
              />
              <div className="min-w-0 flex-1">
                <p
                  className="truncate text-sm text-txt-primary"
                  title={item.name}
                >
                  {item.name}
                </p>
                <p className="text-xs text-txt-muted">
                  {format_bytes(item.size)}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {item.preview && (
                  <Button
                    aria-label={t("secure_view.preview_attachment", {
                      name: item.name,
                    })}
                    data-testid="secure-attachment-preview"
                    size="sm"
                    variant="secondary"
                    onClick={() => handle_preview(item)}
                  >
                    <EyeIcon aria-hidden="true" className="h-4 w-4" />
                    <span className="hidden sm:inline">
                      {t("secure_view.preview")}
                    </span>
                  </Button>
                )}
                <Button
                  aria-label={t("secure_view.download_attachment", {
                    name: item.name,
                  })}
                  data-testid="secure-attachment-download"
                  size="sm"
                  variant="secondary"
                  onClick={() => handle_download(item)}
                >
                  <ArrowDownTrayIcon aria-hidden="true" className="h-4 w-4" />
                  <span className="hidden sm:inline">
                    {t("secure_view.download")}
                  </span>
                </Button>
              </div>
            </li>
          );
        })}
      </ul>

      <AnimatePresence>
        {open_preview?.kind === "image" && active && (
          <ImagePreviewModal
            key="image"
            filename={active.name}
            on_close={close_preview}
            on_download={() => handle_download(active)}
            reduce_motion={reduce_motion}
            src={open_preview.url}
            t={t}
          />
        )}
        {open_preview?.kind === "pdf" && active && (
          <PdfPreviewModal
            key="pdf"
            filename={active.name}
            local_data={open_preview.buffer}
            on_close={close_preview}
            on_download={() => handle_download(active)}
            reduce_motion={reduce_motion}
          />
        )}
        {open_preview?.kind === "text" && active && (
          <SecureFileModal
            key="text"
            filename={active.name}
            notice={
              open_preview.truncated
                ? t("secure_view.text_preview_truncated")
                : undefined
            }
            on_close={close_preview}
            on_download={() => handle_download(active)}
            reduce_motion={reduce_motion}
            t={t}
          >
            <pre
              data-selectable
              className="max-h-[calc(92vh-80px)] w-full overflow-auto whitespace-pre-wrap break-words rounded-lg bg-white p-5 text-left font-mono text-[13px] leading-relaxed text-neutral-900 shadow-2xl"
              data-testid="secure-text-preview"
            >
              {open_preview.text}
            </pre>
          </SecureFileModal>
        )}
        {open_preview?.kind === "audio" && active && (
          <SecureFileModal
            key="audio"
            filename={active.name}
            on_close={close_preview}
            on_download={() => handle_download(active)}
            reduce_motion={reduce_motion}
            t={t}
          >
            <div className="w-full max-w-[520px] rounded-lg bg-white/10 p-6">
              <audio
                controls
                aria-label={active.name}
                className="w-full"
                controlsList="nodownload"
                data-testid="secure-audio-preview"
                preload="metadata"
                src={open_preview.url}
              >
                {t("secure_view.media_unsupported")}
              </audio>
            </div>
          </SecureFileModal>
        )}
        {open_preview?.kind === "video" && active && (
          <SecureFileModal
            key="video"
            filename={active.name}
            on_close={close_preview}
            on_download={() => handle_download(active)}
            reduce_motion={reduce_motion}
            t={t}
          >
            <video
              controls
              playsInline
              aria-label={active.name}
              className="max-h-[calc(92vh-80px)] max-w-full rounded-lg bg-black shadow-2xl"
              controlsList="nodownload"
              data-testid="secure-video-preview"
              disablePictureInPicture
              preload="metadata"
              src={open_preview.url}
            >
              {t("secure_view.media_unsupported")}
            </video>
          </SecureFileModal>
        )}
      </AnimatePresence>
    </>
  );
}

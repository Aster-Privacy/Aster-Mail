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

import { useState, useCallback, useEffect, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";

import { use_preferences } from "@/contexts/preferences_context";

import { EncryptionInfoDropdown } from "@/components/common/encryption_info_dropdown";
import { show_toast } from "@/components/toast/simple_toast";
import { use_i18n } from "@/lib/i18n/context";
import { use_should_reduce_motion } from "@/provider";
import {
  list_attachments,
  batch_attachment_meta,
  get_attachment,
  type AttachmentMetaItem,
} from "@/services/api/attachments";
import {
  decrypt_attachment_meta,
  decrypt_attachment_data,
  download_decrypted_attachment,
} from "@/services/crypto/attachment_crypto";
import { format_bytes } from "@/lib/utils";
import {
  get_type_label,
  get_type_color,
  is_previewable_image,
  is_previewable_pdf,
} from "@/lib/attachment_utils";
import { PdfPreviewModal } from "@/components/email/pdf_preview_modal";

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

interface AttachmentListProps {
  mail_item_id: string;
  is_external?: boolean;
  has_recipient_key?: boolean;
  inline_cids?: Set<string>;
  inline_filenames?: Set<string>;
  is_local?: boolean;
  hint_attachment_count?: number;
}

function AttachmentCardSkeleton() {
  return (
    <div
      className="w-[200px] rounded-lg overflow-hidden animate-pulse"
      style={{ border: "1px solid var(--thread-card-border)" }}
    >
      <div
        className="w-full h-[140px]"
        style={{ backgroundColor: "var(--thread-card-border)" }}
      />
      <div
        className="px-3 py-2 border-t"
        style={{
          backgroundColor: "var(--thread-content-bg)",
          borderColor: "var(--thread-card-border)",
        }}
      >
        <div
          className="h-3 rounded w-3/4 mb-1.5"
          style={{ backgroundColor: "var(--thread-card-border)" }}
        />
        <div
          className="h-2.5 rounded w-1/3"
          style={{ backgroundColor: "var(--thread-card-border)" }}
        />
      </div>
    </div>
  );
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

function FileDocIcon({ color, label }: { color: string; label: string }) {
  return (
    <svg
      className="w-10 h-12"
      fill="none"
      viewBox="0 0 40 48"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M4 0h22l14 14v30a4 4 0 01-4 4H4a4 4 0 01-4-4V4a4 4 0 014-4z"
        fill={`${color}20`}
      />
      <path d="M26 0l14 14H30a4 4 0 01-4-4V0z" fill={`${color}40`} />
      <path
        d="M4 0h22l14 14v30a4 4 0 01-4 4H4a4 4 0 01-4-4V4a4 4 0 014-4z"
        fill="none"
        stroke={`${color}50`}
        strokeWidth="1"
      />
      <text
        dominantBaseline="middle"
        fill={color}
        fontFamily="system-ui, -apple-system, sans-serif"
        fontSize="10"
        fontWeight="700"
        textAnchor="middle"
        x="20"
        y="32"
      >
        {label}
      </text>
    </svg>
  );
}

function PreviewChevronIcon({ direction }: { direction: "left" | "right" }) {
  return (
    <svg
      className="w-5 h-5"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      viewBox="0 0 24 24"
    >
      <path
        d={direction === "left" ? "M15.75 19.5L8.25 12l7.5-7.5" : "M8.25 4.5l7.5 7.5-7.5 7.5"}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ImagePreviewModal({
  src,
  filename,
  on_close,
  on_download,
  on_prev,
  on_next,
  counter,
  reduce_motion,
  t,
}: {
  src: string;
  filename: string;
  on_close: () => void;
  on_download: () => void;
  on_prev?: () => void;
  on_next?: () => void;
  counter?: string;
  reduce_motion: boolean;
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
}) {
  const overlay_ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handle_key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        on_close();
      }
      if (e.key === "ArrowLeft" && on_prev) on_prev();
      if (e.key === "ArrowRight" && on_next) on_next();
    };

    window.addEventListener("keydown", handle_key, true);
    document.body.style.overflow = "hidden";

    return () => {
      window.removeEventListener("keydown", handle_key, true);
      document.body.style.overflow = "";
    };
  }, [on_close, on_prev, on_next]);

  return (
    <motion.div
      ref={overlay_ref}
      animate={{ opacity: 1 }}
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
      exit={{ opacity: 0 }}
      initial={{ opacity: 0 }}
      style={{ backgroundColor: "rgba(0, 0, 0, 0.85)" }}
      transition={{ duration: reduce_motion ? 0 : 0.2 }}
      onClick={(e) => {
        if (e.target === overlay_ref.current) on_close();
      }}
    >
      {on_prev && (
        <button
          aria-label={t("common.previous")}
          className="absolute left-3 top-1/2 -translate-y-1/2 z-10 p-2.5 rounded-full text-white/90 bg-white/10 hover:bg-white/20 transition-colors"
          title={t("common.previous")}
          onClick={on_prev}
        >
          <PreviewChevronIcon direction="left" />
        </button>
      )}
      {on_next && (
        <button
          aria-label={t("common.next")}
          className="absolute right-3 top-1/2 -translate-y-1/2 z-10 p-2.5 rounded-full text-white/90 bg-white/10 hover:bg-white/20 transition-colors"
          title={t("common.next")}
          onClick={on_next}
        >
          <PreviewChevronIcon direction="right" />
        </button>
      )}
      <motion.div
        animate={{ scale: 1, opacity: 1 }}
        className="relative flex flex-col items-center gap-4 max-w-[92vw] max-h-[92vh]"
        exit={{ scale: 0.95, opacity: 0 }}
        initial={{ scale: 0.95, opacity: 0 }}
        transition={{ duration: reduce_motion ? 0 : 0.2 }}
      >
        <img
          alt={filename}
          className="max-w-full max-h-[80vh] rounded-lg object-contain select-none"
          draggable={false}
          src={src}
        />
        <div className="flex items-center gap-3">
          <span className="text-white/70 text-sm truncate max-w-[300px]">
            {filename}
          </span>
          {counter && (
            <span className="text-white/50 text-xs tabular-nums">{counter}</span>
          )}
          <button
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-[12px] text-xs font-medium text-white/90 bg-white/10"
            onClick={on_download}
          >
            <DownloadIcon className="w-3.5 h-3.5" />
            {t("common.download")}
          </button>
          <button
            className="px-3 py-1.5 rounded-[12px] text-xs font-medium text-white/90 bg-white/10"
            onClick={on_close}
          >
            {t("common.close")}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

function AttachmentCard({
  att,
  is_downloading,
  on_click,
  on_download,
}: {
  att: DecryptedAttachmentInfo;
  is_downloading: boolean;
  on_click: () => void;
  on_download: (e: React.MouseEvent) => void;
}) {
  const { t } = use_i18n();
  const is_pdf = is_previewable_pdf(att.content_type);
  const has_preview =
    (is_previewable_image(att.content_type) || is_pdf) && att.preview_url;
  const color = get_type_color(att.content_type);
  const label = get_type_label(att.content_type, att.filename);

  return (
    <div
      className="relative w-[200px] rounded-lg overflow-hidden cursor-pointer"
      style={{
        opacity: is_downloading ? 0.5 : 1,
        border: "1px solid var(--thread-card-border)",
      }}
      onClick={on_click}
    >
      {has_preview ? (
        <div className="relative w-full h-[140px] overflow-hidden">
          <img
            alt={att.filename}
            className="w-full h-full object-cover"
            draggable={false}
            src={att.preview_url}
          />
          {is_pdf && (
            <div
              className="absolute bottom-1.5 left-1.5 px-1.5 py-0.5 rounded text-[9px] font-bold text-white"
              style={{ backgroundColor: "#ea4335" }}
            >
              PDF
            </div>
          )}
        </div>
      ) : (
        <div
          className="w-full h-[140px] flex items-center justify-center"
          style={{ backgroundColor: `${color}08` }}
        >
          <FileDocIcon color={color} label={label} />
        </div>
      )}

      <div
        className="px-3 py-2 flex items-center justify-between gap-1.5 border-t"
        style={{
          backgroundColor: "var(--thread-content-bg)",
          borderColor: "var(--thread-card-border)",
        }}
      >
        <div className="min-w-0 flex-1">
          <div className="text-xs font-medium text-txt-primary truncate">
            {att.filename}
          </div>
          <div className="text-[10px] text-txt-muted leading-tight mt-0.5">
            {format_bytes(att.size_bytes)}
          </div>
        </div>
        <button
          className="flex-shrink-0 p-1.5 rounded-[14px] text-txt-muted hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
          title={t("mail.download_file_named", { filename: att.filename })}
          onClick={on_download}
        >
          <DownloadIcon className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

export function AttachmentList({
  mail_item_id,
  is_external = false,
  has_recipient_key = false,
  inline_cids,
  inline_filenames,
  is_local = false,
  hint_attachment_count = 0,
}: AttachmentListProps): React.ReactElement | null {
  const { t } = use_i18n();
  const { preferences } = use_preferences();
  const reduce_motion = use_should_reduce_motion();
  const [attachments, set_attachments] = useState<DecryptedAttachmentInfo[]>(
    [],
  );
  const [loading, set_loading] = useState(!preferences.low_network_mode);
  const [user_expanded, set_user_expanded] = useState(false);
  const [downloading, set_downloading] = useState<string | null>(null);
  const [preview_state, set_preview_state] = useState<{
    type: "image" | "pdf";
    src: string;
    filename: string;
    att: DecryptedAttachmentInfo;
  } | null>(null);
  const bytes_fetch_ref = useRef<Promise<
    Map<string, { encrypted_data: string; data_nonce: string }>
  > | null>(null);
  const pdf_attempted_ref = useRef<Set<string>>(new Set());

  const ensure_attachment_bytes = useCallback(
    async (att: DecryptedAttachmentInfo): Promise<DecryptedAttachmentInfo> => {
      if (att.encrypted_data) return att;

      const pending = bytes_fetch_ref.current;

      if (pending) {
        const byte_map = await pending;
        const bytes = byte_map.get(att.id);

        if (bytes) return { ...att, ...bytes };
      }

      const response = await get_attachment(att.id);

      if (!response.data?.encrypted_data) {
        throw new Error("attachment_bytes_unavailable");
      }

      return {
        ...att,
        encrypted_data: response.data.encrypted_data,
        data_nonce: response.data.data_nonce,
      };
    },
    [],
  );

  useEffect(() => {
    if (preferences.low_network_mode && !user_expanded) return;

    let cancelled = false;

    bytes_fetch_ref.current = null;
    pdf_attempted_ref.current = new Set();

    async function build_info(
      att: Pick<
        AttachmentMetaItem,
        "id" | "mail_item_id" | "seq_num" | "size_bytes" | "encrypted_meta" | "meta_nonce"
      >,
      encrypted_data: string,
      data_nonce: string,
    ): Promise<DecryptedAttachmentInfo | null> {
      try {
        const meta = await decrypt_attachment_meta(
          att.encrypted_meta,
          att.meta_nonce,
        );

        const is_cid_match =
          meta.content_id &&
          inline_cids &&
          inline_cids.has(meta.content_id.toLowerCase());
        const is_filename_match =
          !meta.content_id &&
          meta.content_type.startsWith("image/") &&
          inline_filenames &&
          inline_filenames.size > 0 &&
          inline_filenames.has(meta.filename.toLowerCase());

        if (meta.is_inline || is_cid_match || is_filename_match) return null;

        return {
          id: att.id,
          mail_item_id: att.mail_item_id,
          seq_num: att.seq_num,
          filename: meta.filename,
          content_type: meta.content_type,
          size_bytes: att.size_bytes,
          encrypted_data,
          data_nonce,
          encrypted_meta: att.encrypted_meta,
          meta_nonce: att.meta_nonce,
        };
      } catch (error) {
        if (import.meta.env.DEV) console.error(error);

        return {
          id: att.id,
          mail_item_id: att.mail_item_id,
          seq_num: att.seq_num,
          filename: t("common.encrypted_attachment"),
          content_type: "application/octet-stream",
          size_bytes: att.size_bytes,
          encrypted_data,
          data_nonce,
          encrypted_meta: att.encrypted_meta,
          meta_nonce: att.meta_nonce,
        };
      }
    }

    async function decrypt_image_previews(infos: DecryptedAttachmentInfo[]) {
      await Promise.all(
        infos.map(async (info) => {
          if (!is_previewable_image(info.content_type)) return;
          if (!info.encrypted_data) return;

          try {
            const meta = await decrypt_attachment_meta(
              info.encrypted_meta,
              info.meta_nonce,
            );
            const data = await decrypt_attachment_data(
              info.encrypted_data,
              info.data_nonce,
              meta.session_key,
              info.mail_item_id,
              info.seq_num,
            );
            const blob = new Blob([data], { type: info.content_type });
            const url = URL.createObjectURL(blob);

            if (cancelled) {
              URL.revokeObjectURL(url);

              return;
            }

            set_attachments((prev) =>
              prev.map((a) =>
                a.id === info.id && !a.preview_url
                  ? { ...a, preview_url: url }
                  : a,
              ),
            );
          } catch {
            /* preview generation failed */
          }
        }),
      );
    }

    async function hydrate_bytes(cards: DecryptedAttachmentInfo[]) {
      const bytes_promise = (async () => {
        const byte_map = new Map<
          string,
          { encrypted_data: string; data_nonce: string }
        >();

        try {
          const response = await list_attachments(mail_item_id);

          for (const att of response.data?.attachments ?? []) {
            byte_map.set(att.id, {
              encrypted_data: att.encrypted_data,
              data_nonce: att.data_nonce,
            });
          }
        } catch {
          return byte_map;
        }

        return byte_map;
      })();

      bytes_fetch_ref.current = bytes_promise;

      const byte_map = await bytes_promise;

      if (cancelled || byte_map.size === 0) return;

      set_attachments((prev) =>
        prev.map((a) => {
          const bytes = byte_map.get(a.id);

          return bytes && !a.encrypted_data ? { ...a, ...bytes } : a;
        }),
      );

      const hydrated = cards.map((c) => {
        const bytes = byte_map.get(c.id);

        return bytes ? { ...c, ...bytes } : c;
      });

      await decrypt_image_previews(hydrated);
    }

    async function fetch_attachments() {
      if (is_local) {
        set_loading(false);
        return;
      }

      set_loading(true);

      let meta_items: AttachmentMetaItem[] | null = null;

      try {
        const meta_response = await batch_attachment_meta([mail_item_id]);

        meta_items = meta_response.data
          ? (meta_response.data.items?.[mail_item_id] ?? [])
          : null;
      } catch {
        meta_items = null;
      }

      if (cancelled) return;

      if (meta_items) {
        const cards: DecryptedAttachmentInfo[] = [];

        for (const item of meta_items) {
          const info = await build_info(item, "", "");

          if (info) cards.push(info);
        }

        if (cancelled) return;

        set_attachments(cards);
        set_loading(false);

        if (cards.length === 0) return;

        await hydrate_bytes(cards);

        return;
      }

      let response;

      try {
        response = await list_attachments(mail_item_id);
      } catch {
        set_loading(false);

        return;
      }

      if (cancelled) return;

      if (!response.data || response.data.attachments.length === 0) {
        set_loading(false);

        return;
      }

      const decrypted: DecryptedAttachmentInfo[] = [];

      for (const att of response.data.attachments) {
        const info = await build_info(att, att.encrypted_data, att.data_nonce);

        if (info) decrypted.push(info);
      }

      if (cancelled) return;

      set_attachments(decrypted);
      set_loading(false);

      await decrypt_image_previews(decrypted);
    }

    fetch_attachments();

    return () => {
      cancelled = true;
      set_attachments((prev) => {
        for (const a of prev) {
          if (a.preview_url) URL.revokeObjectURL(a.preview_url);
        }

        return [];
      });
    };
  }, [mail_item_id, inline_cids, inline_filenames, t, preferences.low_network_mode, user_expanded]);

  useEffect(() => {
    if (loading || attachments.length === 0) return;
    if (preferences.low_network_mode && !user_expanded) return;

    let cancelled = false;

    async function generate_pdf_thumbnails() {
      const pdf_atts = attachments.filter(
        (a) =>
          is_previewable_pdf(a.content_type) &&
          !a.preview_url &&
          a.encrypted_data &&
          !pdf_attempted_ref.current.has(a.id),
      );

      if (pdf_atts.length === 0) return;

      let render_pdf_thumbnail: (typeof import("@/lib/pdf_utils"))["render_pdf_thumbnail"];

      try {
        const pdf_mod = await import("@/lib/pdf_utils");

        render_pdf_thumbnail = pdf_mod.render_pdf_thumbnail;
      } catch {
        return;
      }

      for (const att of pdf_atts) {
        if (cancelled) return;

        pdf_attempted_ref.current.add(att.id);

        try {
          const meta = await decrypt_attachment_meta(
            att.encrypted_meta,
            att.meta_nonce,
          );
          const data = await decrypt_attachment_data(
            att.encrypted_data,
            att.data_nonce,
            meta.session_key,
            att.mail_item_id,
            att.seq_num,
          );

          const thumbnail_promise = render_pdf_thumbnail(data, 400, 280);
          let timed_out = false;
          const timeout_promise = new Promise<never>((_, reject) =>
            setTimeout(() => {
              timed_out = true;
              reject(new Error("timeout"));
            }, 8000),
          );

          thumbnail_promise
            .then((late_url) => {
              if (timed_out || cancelled) URL.revokeObjectURL(late_url);
            })
            .catch(() => {});

          const url = await Promise.race([thumbnail_promise, timeout_promise]);

          if (cancelled) {
            pdf_attempted_ref.current.delete(att.id);

            return;
          }

          set_attachments((prev) =>
            prev.map((a) => (a.id === att.id ? { ...a, preview_url: url } : a)),
          );
        } catch {
          if (cancelled) pdf_attempted_ref.current.delete(att.id);
        }
      }
    }

    generate_pdf_thumbnails();

    return () => {
      cancelled = true;
    };
  }, [loading, attachments]);

  const handle_download = useCallback(
    async (att: DecryptedAttachmentInfo, e?: React.MouseEvent) => {
      if (e) {
        e.stopPropagation();
        e.preventDefault();
      }
      set_downloading(att.id);

      try {
        const hydrated = await ensure_attachment_bytes(att);
        const meta = await decrypt_attachment_meta(
          hydrated.encrypted_meta,
          hydrated.meta_nonce,
        );

        const data = await decrypt_attachment_data(
          hydrated.encrypted_data,
          hydrated.data_nonce,
          meta.session_key,
          hydrated.mail_item_id,
          hydrated.seq_num,
        );

        download_decrypted_attachment(data, meta.filename, meta.content_type);
      } catch (error) {
        if (import.meta.env.DEV) console.error(error);
        show_toast(t("common.download_failed"), "error");
      } finally {
        set_downloading(null);
      }
    },
    [t, ensure_attachment_bytes],
  );

  const handle_click = useCallback(
    (att: DecryptedAttachmentInfo) => {
      if (is_previewable_image(att.content_type) && att.preview_url) {
        set_preview_state({
          type: "image",
          src: att.preview_url,
          filename: att.filename,
          att,
        });
      } else if (is_previewable_image(att.content_type)) {
        ensure_attachment_bytes(att)
          .then(async (hydrated) => {
            const meta = await decrypt_attachment_meta(
              hydrated.encrypted_meta,
              hydrated.meta_nonce,
            );
            const data = await decrypt_attachment_data(
              hydrated.encrypted_data,
              hydrated.data_nonce,
              meta.session_key,
              hydrated.mail_item_id,
              hydrated.seq_num,
            );
            const blob = new Blob([data], { type: hydrated.content_type });
            const url = URL.createObjectURL(blob);

            set_attachments((prev) =>
              prev.map((a) =>
                a.id === att.id && !a.preview_url
                  ? { ...a, preview_url: url }
                  : a,
              ),
            );
            set_preview_state({
              type: "image",
              src: url,
              filename: hydrated.filename,
              att: { ...hydrated, preview_url: url },
            });
          })
          .catch(() => {
            show_toast(t("common.download_failed"), "error");
          });
      } else if (is_previewable_pdf(att.content_type)) {
        ensure_attachment_bytes(att)
          .then((hydrated) => {
            set_preview_state({
              type: "pdf",
              src: "",
              filename: hydrated.filename,
              att: hydrated,
            });
          })
          .catch(() => {
            show_toast(t("common.download_failed"), "error");
          });
      } else {
        handle_download(att);
      }
    },
    [handle_download, ensure_attachment_bytes, t],
  );

  const previewable_images = attachments.filter(
    (a) => is_previewable_image(a.content_type) && a.preview_url,
  );
  const current_image_index =
    preview_state?.type === "image"
      ? previewable_images.findIndex((a) => a.id === preview_state.att.id)
      : -1;
  const show_image_nav =
    current_image_index !== -1 && previewable_images.length > 1;

  const step_preview_image = (delta: number) => {
    if (current_image_index === -1 || previewable_images.length < 2) return;

    const target =
      previewable_images[
        (current_image_index + delta + previewable_images.length) %
          previewable_images.length
      ];

    if (target?.preview_url) {
      set_preview_state({
        type: "image",
        src: target.preview_url,
        filename: target.filename,
        att: target,
      });
    }
  };

  if (preferences.low_network_mode && !user_expanded) {
    if (!hint_attachment_count) return null;

    return (
      <div
        className="border-t px-3 @md:px-4 py-2.5"
        style={{
          borderColor: "var(--thread-card-border)",
          backgroundColor: "var(--thread-content-bg)",
        }}
      >
        <button
          className="text-xs text-txt-muted hover:text-txt-primary transition-colors flex items-center gap-1.5"
          onClick={() => { set_loading(true); set_user_expanded(true); }}
        >
          <svg
            className="w-3.5 h-3.5"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.8}
            viewBox="0 0 24 24"
          >
            <path
              d="M18.375 12.739l-7.693 7.693a4.5 4.5 0 01-6.364-6.364l10.94-10.94A3 3 0 1119.5 7.372L8.552 18.32m.009-.01-.01.01m5.699-9.941l-7.81 7.81a1.5 1.5 0 002.112 2.13"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          {t("mail.load_attachments")}
        </button>
      </div>
    );
  }

  if (loading) {
    if (!hint_attachment_count) return null;
    return (
      <div
        className="border-t px-3 @md:px-4 py-3"
        style={{
          borderColor: "var(--thread-card-border)",
          backgroundColor: "var(--thread-content-bg)",
        }}
      >
        <div
          className="h-3 w-20 rounded mb-2.5 animate-pulse"
          style={{ backgroundColor: "var(--thread-card-border)" }}
        />
        <div className="flex flex-wrap gap-2.5">
          {Array.from({ length: hint_attachment_count }, (_, i) => (
            <AttachmentCardSkeleton key={i} />
          ))}
        </div>
      </div>
    );
  }

  if (attachments.length === 0) {
    return null;
  }

  return (
    <>
      <div
        className="border-t px-3 @md:px-4 py-3"
        style={{
          borderColor: "var(--thread-card-border)",
          backgroundColor: "var(--thread-content-bg)",
        }}
      >
        <div className="text-xs text-txt-muted mb-2.5 font-medium flex items-center gap-1.5">
          <svg
            className="w-3.5 h-3.5"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.8}
            viewBox="0 0 24 24"
          >
            <path
              d="M18.375 12.739l-7.693 7.693a4.5 4.5 0 01-6.364-6.364l10.94-10.94A3 3 0 1119.5 7.372L8.552 18.32m.009-.01-.01.01m5.699-9.941l-7.81 7.81a1.5 1.5 0 002.112 2.13"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          {attachments.length}{" "}
          {attachments.length === 1
            ? t("mail.attachment_singular")
            : t("mail.attachments")}
          <span className="text-txt-muted/40">·</span>
          <EncryptionInfoDropdown
            context="attachments"
            has_pq_protection={false}
            has_recipient_key={has_recipient_key}
            is_external={is_external}
            label={
              is_external && !has_recipient_key
                ? t("common.protected_in_transit")
                : t("common.end_to_end_encrypted_label")
            }
            size={13}
          />
        </div>
        <div className="flex flex-wrap gap-2.5">
          {attachments.map((att) => (
            <AttachmentCard
              key={att.id}
              att={att}
              is_downloading={downloading === att.id}
              on_click={() => handle_click(att)}
              on_download={(e) => handle_download(att, e)}
            />
          ))}
        </div>
      </div>

      <AnimatePresence>
        {preview_state?.type === "image" && (
          <ImagePreviewModal
            counter={
              show_image_nav
                ? `${current_image_index + 1} / ${previewable_images.length}`
                : undefined
            }
            filename={preview_state.filename}
            on_close={() => set_preview_state(null)}
            on_download={() => handle_download(preview_state.att)}
            on_next={show_image_nav ? () => step_preview_image(1) : undefined}
            on_prev={show_image_nav ? () => step_preview_image(-1) : undefined}
            reduce_motion={reduce_motion}
            src={preview_state.src}
            t={t}
          />
        )}
        {preview_state?.type === "pdf" && (
          <PdfPreviewModal
            att={preview_state.att}
            filename={preview_state.filename}
            on_close={() => set_preview_state(null)}
            reduce_motion={reduce_motion}
          />
        )}
      </AnimatePresence>
    </>
  );
}

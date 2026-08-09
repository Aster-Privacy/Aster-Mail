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
import type { } from "@/lib/i18n/types";

import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { AnimatePresence, } from "framer-motion";


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
import {
  get_cached_attachment_meta,
  
} from "@/services/attachment_meta_cache";
import {
  fetch_attachment_bytes,
  get_cached_preview_url,
  set_cached_preview_url,
} from "@/services/attachment_preview_cache";
import {
  
  
  is_previewable_image,
  is_previewable_pdf,
} from "@/lib/attachment_utils";
import { PdfPreviewModal } from "@/components/email/pdf_preview_modal";

import { AttachmentCard } from "./card";
import { AttachmentCardSkeleton } from "./icons";
import { ImagePreviewModal } from "./preview_modal";
import { AttachmentListProps, DecryptedAttachmentInfo, PREVIEW_READY_TIMEOUT_MS, build_cards_from_cached_meta, is_inline_attachment } from "./types";

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
    () => {
      if (is_local || preferences.low_network_mode) return [];

      const cached = get_cached_attachment_meta(mail_item_id);

      return cached
        ? build_cards_from_cached_meta(
            cached,
            { inline_cids, inline_filenames },
            t("common.encrypted_attachment"),
          )
        : [];
    },
  );
  const [loading, set_loading] = useState(
    () =>
      !preferences.low_network_mode &&
      !is_local &&
      get_cached_attachment_meta(mail_item_id) === null,
  );
  const [user_expanded, set_user_expanded] = useState(false);
  const [downloading, set_downloading] = useState<string | null>(null);
  const [preview_state, set_preview_state] = useState<{
    type: "image" | "pdf";
    src: string;
    filename: string;
    att: DecryptedAttachmentInfo;
  } | null>(null);
  const [preparing, set_preparing] = useState(
    () => !preferences.low_network_mode && !is_local,
  );
  const bytes_fetch_ref = useRef<Promise<
    Map<string, { encrypted_data: string; data_nonce: string }>
  > | null>(null);
  const pdf_attempted_ref = useRef<Set<string>>(new Set());
  const inline_cids_ref = useRef(inline_cids);
  const inline_filenames_ref = useRef(inline_filenames);

  inline_cids_ref.current = inline_cids;
  inline_filenames_ref.current = inline_filenames;

  const inline_key = useMemo(() => {
    const cids = inline_cids ? Array.from(inline_cids).sort().join(",") : "";
    const names = inline_filenames
      ? Array.from(inline_filenames).sort().join(",")
      : "";

    return `${cids}|${names}`;
  }, [inline_cids, inline_filenames]);

  const decrypt_image_previews = useCallback(
    async (
      infos: DecryptedAttachmentInfo[],
      is_cancelled: () => boolean,
    ): Promise<void> => {
      await Promise.all(
        infos.map(async (info) => {
          if (!is_previewable_image(info.content_type)) return;
          if (get_cached_preview_url(info.id)) return;
          if (!info.encrypted_data) return;

          try {
            const meta = await decrypt_attachment_meta(
              info.encrypted_meta,
              info.meta_nonce,
              info.mail_item_id,
              info.seq_num,
            );
            const data = await decrypt_attachment_data(
              info.encrypted_data,
              info.data_nonce,
              meta.session_key,
              info.mail_item_id,
              info.seq_num,
            );
            const blob = new Blob([data], { type: info.content_type });
            const url = set_cached_preview_url(
              info.id,
              URL.createObjectURL(blob),
            );

            if (is_cancelled()) return;

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
    },
    [],
  );

  const generate_pdf_thumbnails = useCallback(
    async (
      infos: DecryptedAttachmentInfo[],
      is_cancelled: () => boolean,
    ): Promise<void> => {
      const pdf_atts = infos.filter(
        (a) =>
          is_previewable_pdf(a.content_type) &&
          !a.preview_url &&
          !get_cached_preview_url(a.id) &&
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
        if (is_cancelled()) return;

        pdf_attempted_ref.current.add(att.id);

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
              if (timed_out || is_cancelled()) URL.revokeObjectURL(late_url);
            })
            .catch(() => {});

          const raw_url = await Promise.race([
            thumbnail_promise,
            timeout_promise,
          ]);

          if (is_cancelled()) {
            pdf_attempted_ref.current.delete(att.id);

            return;
          }

          const url = set_cached_preview_url(att.id, raw_url);

          set_attachments((prev) =>
            prev.map((a) => (a.id === att.id ? { ...a, preview_url: url } : a)),
          );
        } catch {
          if (is_cancelled()) pdf_attempted_ref.current.delete(att.id);
        }
      }
    },
    [],
  );

  const ensure_attachment_bytes = useCallback(
    async (att: DecryptedAttachmentInfo): Promise<DecryptedAttachmentInfo> => {
      if (att.encrypted_data) return att;

      const pending = bytes_fetch_ref.current;

      if (pending) {
        const byte_map = await pending;
        const bytes = byte_map.get(att.id);

        if (bytes) return { ...att, ...bytes };
      }

      const response = await get_attachment(att.id, att.mail_item_id);

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
    return () => {
      set_attachments([]);
      set_preparing(true);
    };
  }, [mail_item_id]);

  useEffect(() => {
    if (preferences.low_network_mode && !user_expanded) return;

    let cancelled = false;
    const is_cancelled = () => cancelled;
    const inline_cids = inline_cids_ref.current;
    const inline_filenames = inline_filenames_ref.current;

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
          att.mail_item_id,
          att.seq_num,
        );

        if (is_inline_attachment(meta, { inline_cids, inline_filenames })) {
          return null;
        }

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
          preview_url: get_cached_preview_url(att.id),
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
          preview_url: get_cached_preview_url(att.id),
        };
      }
    }

    async function prepare_previews(list: DecryptedAttachmentInfo[]) {
      const work = Promise.all([
        decrypt_image_previews(list, is_cancelled),
        generate_pdf_thumbnails(list, is_cancelled),
      ]);
      const cap = new Promise<void>((resolve) =>
        setTimeout(resolve, PREVIEW_READY_TIMEOUT_MS),
      );

      await Promise.race([work, cap]);

      if (!cancelled) set_preparing(false);
    }

    async function hydrate_bytes(
      cards: DecryptedAttachmentInfo[],
    ): Promise<DecryptedAttachmentInfo[]> {
      const bytes_promise = fetch_attachment_bytes(mail_item_id);

      bytes_fetch_ref.current = bytes_promise;

      const byte_map = await bytes_promise;

      if (cancelled || byte_map.size === 0) return cards;

      set_attachments((prev) =>
        prev.map((a) => {
          const bytes = byte_map.get(a.id);

          return bytes && !a.encrypted_data ? { ...a, ...bytes } : a;
        }),
      );

      return cards.map((c) => {
        const bytes = byte_map.get(c.id);

        return bytes ? { ...c, ...bytes } : c;
      });
    }

    async function fetch_attachments() {
      if (is_local) {
        set_loading(false);
        set_preparing(false);

        return;
      }

      const cached_meta = get_cached_attachment_meta(mail_item_id);

      if (cached_meta) {
        const cards = build_cards_from_cached_meta(
          cached_meta,
          { inline_cids, inline_filenames },
          t("common.encrypted_attachment"),
        );

        set_attachments(cards);
        set_loading(false);

        if (cards.length === 0) {
          set_preparing(false);

          return;
        }

        await prepare_previews(await hydrate_bytes(cards));

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

        if (cards.length === 0) {
          set_preparing(false);

          return;
        }

        await prepare_previews(await hydrate_bytes(cards));

        return;
      }

      let response;

      try {
        response = await list_attachments(mail_item_id);
      } catch {
        set_loading(false);
        set_preparing(false);

        return;
      }

      if (cancelled) return;

      if (!response.data || response.data.attachments.length === 0) {
        set_loading(false);
        set_preparing(false);

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

      await prepare_previews(decrypted);
    }

    fetch_attachments();

    return () => {
      cancelled = true;
    };
  }, [
    mail_item_id,
    inline_key,
    t,
    preferences.low_network_mode,
    user_expanded,
    decrypt_image_previews,
    generate_pdf_thumbnails,
  ]);

  useEffect(() => {
    if (loading || preparing || attachments.length === 0) return;
    if (preferences.low_network_mode && !user_expanded) return;

    let cancelled = false;

    generate_pdf_thumbnails(attachments, () => cancelled);

    return () => {
      cancelled = true;
    };
  }, [
    loading,
    preparing,
    attachments,
    generate_pdf_thumbnails,
    preferences.low_network_mode,
    user_expanded,
  ]);

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
          hydrated.mail_item_id,
          hydrated.seq_num,
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
              hydrated.mail_item_id,
              hydrated.seq_num,
            );
            const data = await decrypt_attachment_data(
              hydrated.encrypted_data,
              hydrated.data_nonce,
              meta.session_key,
              hydrated.mail_item_id,
              hydrated.seq_num,
            );
            const blob = new Blob([data], { type: hydrated.content_type });
            const url = set_cached_preview_url(
              att.id,
              URL.createObjectURL(blob),
            );

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
          onClick={() => {
            set_loading(true);
            set_preparing(true);
            set_user_expanded(true);
          }}
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

  if (loading || preparing) {
    const skeleton_count = attachments.length || hint_attachment_count;

    if (!skeleton_count) return null;

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
          {Array.from({ length: skeleton_count }, (_, i) => (
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

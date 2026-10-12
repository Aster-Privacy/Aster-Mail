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
import type { PendingSendAttachment } from "@/services/pending_send_attachments";

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence } from "framer-motion";

import { AttachmentCard } from "./card";
import { ImagePreviewModal } from "./preview_modal";
import { DecryptedAttachmentInfo } from "./types";

import { PdfPreviewModal } from "@/components/email/pdf_preview_modal";
import { use_i18n } from "@/lib/i18n/context";
import { use_should_reduce_motion } from "@/provider";
import { download_decrypted_attachment } from "@/services/crypto/attachment_crypto";
import {
  build_previewable_image_blob,
  is_previewable_image,
  is_previewable_pdf,
} from "@/lib/attachment_utils";
import { format_bytes } from "@/lib/utils";

interface PendingAttachmentListProps {
  mail_item_id: string;
  files: PendingSendAttachment[];
}

const PDF_THUMBNAIL_WIDTH = 400;
const PDF_THUMBNAIL_HEIGHT = 280;

export function PendingAttachmentList({
  mail_item_id,
  files,
}: PendingAttachmentListProps): React.ReactElement | null {
  const { t } = use_i18n();
  const reduce_motion = use_should_reduce_motion();
  const [preview_urls, set_preview_urls] = useState<Record<string, string>>({});
  const [preview_id, set_preview_id] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const created: string[] = [];
    const publish = (id: string, url: string) => {
      if (cancelled) {
        if (url.startsWith("blob:")) URL.revokeObjectURL(url);

        return;
      }
      created.push(url);
      set_preview_urls((prev) => ({ ...prev, [id]: url }));
    };

    set_preview_urls({});

    for (const file of files) {
      if (!is_previewable_image(file.content_type)) continue;

      try {
        publish(
          file.id,
          URL.createObjectURL(
            build_previewable_image_blob(file.data, file.content_type),
          ),
        );
      } catch {
        continue;
      }
    }

    const pdf_files = files.filter((file) =>
      is_previewable_pdf(file.content_type),
    );

    if (pdf_files.length > 0) {
      void (async () => {
        try {
          const { render_pdf_thumbnail } = await import("@/lib/pdf_utils");

          for (const file of pdf_files) {
            if (cancelled) return;

            try {
              publish(
                file.id,
                await render_pdf_thumbnail(
                  file.data.slice(0),
                  PDF_THUMBNAIL_WIDTH,
                  PDF_THUMBNAIL_HEIGHT,
                ),
              );
            } catch {
              continue;
            }
          }
        } catch {
          return;
        }
      })();
    }

    return () => {
      cancelled = true;
      created.forEach((url) => {
        if (url.startsWith("blob:")) URL.revokeObjectURL(url);
      });
    };
  }, [files]);

  const cards = useMemo<DecryptedAttachmentInfo[]>(
    () =>
      files.map((file, index) => ({
        id: file.id,
        mail_item_id,
        seq_num: index,
        filename: file.filename,
        content_type: file.content_type,
        size_bytes: file.size_bytes,
        encrypted_data: "",
        data_nonce: "",
        encrypted_meta: "",
        meta_nonce: "",
        preview_url: preview_urls[file.id],
      })),
    [files, mail_item_id, preview_urls],
  );

  const download = (file: PendingSendAttachment, e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
      e.preventDefault();
    }
    download_decrypted_attachment(file.data, file.filename, file.content_type);
  };
  const open = (file: PendingSendAttachment) => {
    const is_image =
      is_previewable_image(file.content_type) && !!preview_urls[file.id];

    if (is_image || is_previewable_pdf(file.content_type)) {
      set_preview_id(file.id);

      return;
    }
    download(file);
  };

  const total_size_bytes = files.reduce(
    (total, file) => total + Math.max(0, file.size_bytes || 0),
    0,
  );
  const preview_index = files.findIndex((file) => file.id === preview_id);
  const preview_file = preview_index === -1 ? null : files[preview_index];
  const preview_card = preview_index === -1 ? null : cards[preview_index];
  const pdf_card_ref = useRef<DecryptedAttachmentInfo | null>(null);

  if (!preview_card) {
    pdf_card_ref.current = null;
  } else if (pdf_card_ref.current?.id !== preview_card.id) {
    pdf_card_ref.current = preview_card;
  }

  const pdf_card = pdf_card_ref.current;

  if (files.length === 0) return null;

  return (
    <>
      <div className="px-3 @md:px-4 py-3" data-testid="pending_attachments">
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
          {files.length}{" "}
          {files.length === 1
            ? t("mail.attachment_singular")
            : t("mail.attachments")}
          {total_size_bytes > 0 && (
            <>
              <span className="text-txt-muted/40">·</span>
              <span
                className="tabular-nums"
                data-testid="attachments_total_size"
              >
                {format_bytes(total_size_bytes)}
              </span>
            </>
          )}
        </div>
        <div className="flex flex-wrap gap-2.5">
          {files.map((file, index) => (
            <AttachmentCard
              key={file.id}
              att={cards[index]}
              is_downloading={false}
              on_click={() => open(file)}
              on_download={(e) => download(file, e)}
            />
          ))}
        </div>
      </div>

      <AnimatePresence>
        {preview_file &&
          preview_card &&
          is_previewable_image(preview_file.content_type) &&
          preview_card.preview_url && (
            <ImagePreviewModal
              filename={preview_file.filename}
              on_close={() => set_preview_id(null)}
              on_download={() => download(preview_file)}
              reduce_motion={reduce_motion}
              src={preview_card.preview_url}
              t={t}
            />
          )}
        {preview_file &&
          pdf_card &&
          is_previewable_pdf(preview_file.content_type) && (
            <PdfPreviewModal
              att={pdf_card}
              filename={preview_file.filename}
              local_data={preview_file.data}
              on_close={() => set_preview_id(null)}
              reduce_motion={reduce_motion}
            />
          )}
      </AnimatePresence>
    </>
  );
}

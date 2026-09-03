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
import type {} from "@/lib/i18n/types";

import { DownloadIcon, FileTypeIcon } from "./icons";
import { DecryptedAttachmentInfo } from "./types";

import { use_i18n } from "@/lib/i18n/context";
import { format_bytes } from "@/lib/utils";
import {
  get_type_label,
  get_type_color,
  get_type_glyph,
  is_previewable_image,
  is_previewable_pdf,
} from "@/lib/attachment_utils";

export function AttachmentCard({
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
  const glyph = get_type_glyph(att.content_type);

  return (
    <div
      className="relative w-[200px] rounded-[14px] overflow-hidden cursor-pointer"
      style={{
        opacity: is_downloading ? 0.5 : 1,
        backgroundColor: "var(--thread-content-bg)",
        border: "1px solid var(--thread-card-border)",
      }}
      onClick={on_click}
    >
      {has_preview ? (
        <div className="relative w-full h-[128px] overflow-hidden">
          <img
            alt={att.filename}
            className="w-full h-full object-cover"
            draggable={false}
            src={att.preview_url}
          />
          {is_pdf && (
            <div
              className="absolute bottom-2 start-2 px-1.5 py-0.5 rounded-md text-[9px] font-bold tracking-[0.05em] text-white"
              style={{ backgroundColor: color }}
            >
              {label}
            </div>
          )}
        </div>
      ) : (
        <div
          className="w-full h-[128px] flex items-center justify-center"
          style={{
            backgroundColor:
              "color-mix(in srgb, var(--thread-card-border) 22%, var(--thread-content-bg))",
          }}
        >
          <FileTypeIcon color={color} glyph={glyph} label={label} />
        </div>
      )}

      <div
        className="ps-3 pe-2 py-2.5 flex items-center justify-between gap-1.5 border-t"
        style={{
          backgroundColor: "var(--thread-content-bg)",
          borderColor: "var(--thread-card-border)",
        }}
      >
        <div className="min-w-0 flex-1">
          <div className="text-xs font-medium text-txt-primary truncate">
            {att.filename}
          </div>
          <div className="text-[10.5px] text-txt-muted leading-tight mt-0.5">
            {format_bytes(att.size_bytes)}
          </div>
        </div>
        <button
          className="flex-shrink-0 w-7 h-7 flex items-center justify-center rounded-[9px] text-txt-muted hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
          title={t("mail.download_file_named", { filename: att.filename })}
          onClick={on_download}
        >
          <DownloadIcon className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

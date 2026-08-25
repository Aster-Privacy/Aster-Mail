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
import { useState, useEffect, useRef, useCallback } from "react";

import { use_i18n } from "@/lib/i18n/context";
import { use_preferences } from "@/contexts/preferences_context";
import { show_toast } from "@/components/toast/simple_toast";
import { format_bytes } from "@/lib/utils";
import { strip_metadata } from "@/lib/strip_image_metadata";
import {
  type Attachment,
  generate_attachment_id,
} from "@/components/compose/compose_shared";
import {
  MAX_ATTACHMENTS_PER_SEND,
  ensure_attachment_limits,
  get_max_attachment_size,
  get_max_total_attachments_size,
} from "@/services/attachment_limits";
import {
  describe_oversized_file,
  describe_too_many_attachments,
  describe_would_exceed_total,
  prompt_attachment_upgrade,
} from "@/services/attachment_rejection";

const unique_attachment_name = (name: string, taken: Set<string>): string => {
  if (!taken.has(name)) return name;

  const dot = name.lastIndexOf(".");
  const base = dot > 0 ? name.slice(0, dot) : name;
  const extension = dot > 0 ? name.slice(dot) : "";

  for (let counter = 2; counter < 1000; counter++) {
    const candidate = `${base} (${counter})${extension}`;

    if (!taken.has(candidate)) return candidate;
  }

  return `${base} (${generate_attachment_id()})${extension}`;
};

const EXTENSION_MIME_MAP: Record<string, string> = {
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  zip: "application/zip",
  rar: "application/x-rar-compressed",
  "7z": "application/x-7z-compressed",
  txt: "text/plain",
  csv: "text/csv",
  html: "text/html",
  css: "text/css",
  js: "text/javascript",
  json: "application/json",
  xml: "application/xml",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  bmp: "image/bmp",
  heic: "image/heic",
  heif: "image/heif",
  avif: "image/avif",
  tiff: "image/tiff",
  tif: "image/tiff",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  ogg: "audio/ogg",
  aac: "audio/aac",
  m4a: "audio/x-m4a",
  weba: "audio/webm",
  flac: "audio/flac",
  mp4: "video/mp4",
  webm: "video/webm",
  mov: "video/quicktime",
  "3gp": "video/3gpp",
  mkv: "video/x-matroska",
  avi: "video/x-msvideo",
};

const METADATA_BEARING_TYPE = /^image\//;

async function apply_metadata_strip(
  raw: ArrayBuffer,
  mime_type: string,
  enabled: boolean,
  name: string,
  unstripped: string[],
): Promise<ArrayBuffer> {
  if (!enabled || !METADATA_BEARING_TYPE.test(mime_type)) return raw;

  const result = await strip_metadata(raw, mime_type);

  if (result.status !== "stripped") unstripped.push(name);

  return result.data;
}

function resolve_mime_type(file: File): string {
  if (file.type && file.type !== "application/octet-stream") {
    return file.type;
  }

  const ext = file.name.split(".").pop()?.toLowerCase();

  if (ext && EXTENSION_MIME_MAP[ext]) {
    return EXTENSION_MIME_MAP[ext];
  }

  return file.type || "application/octet-stream";
}

export interface UseComposeAttachmentsReturn {
  attachments: Attachment[];
  set_attachments: React.Dispatch<React.SetStateAction<Attachment[]>>;
  attachment_error: string | null;
  set_attachment_error: (val: string | null) => void;
  attachments_scroll_ref: React.RefObject<HTMLDivElement>;
  file_input_ref: React.RefObject<HTMLInputElement>;
  attachments_ref: React.MutableRefObject<Attachment[]>;
  remove_attachment: (id: string) => void;
  handle_file_select: (event: React.ChangeEvent<HTMLInputElement>) => void;
  handle_files_drop: (files: File[]) => Promise<void>;
  trigger_file_select: () => void;
  get_total_attachments_size: () => number;
}

export function use_compose_attachments(): UseComposeAttachmentsReturn {
  const { t } = use_i18n();
  const { preferences } = use_preferences();
  const [attachments, set_attachments] = useState<Attachment[]>([]);
  const [attachment_error, set_attachment_error] = useState<string | null>(
    null,
  );
  const attachments_scroll_ref = useRef<HTMLDivElement>(null);
  const file_input_ref = useRef<HTMLInputElement>(null);
  const attachments_ref = useRef<Attachment[]>([]);

  useEffect(() => {
    attachments_ref.current = attachments;
  }, [attachments]);

  const remove_attachment = useCallback((id: string) => {
    set_attachments((prev) => prev.filter((a) => a.id !== id));
    set_attachment_error(null);
  }, []);

  const get_total_attachments_size = useCallback(() => {
    return attachments.reduce((total, att) => total + att.size_bytes, 0);
  }, [attachments]);

  const handle_file_select = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const files = event.target.files;

      if (!files || files.length === 0) return;

      set_attachment_error(null);
      await ensure_attachment_limits();
      const new_attachments: Attachment[] = [];
      const unstripped: string[] = [];
      const current_total = get_total_attachments_size();
      let running_total = current_total;

      for (let i = 0; i < files.length; i++) {
        const file = files[i];

        if (
          attachments.length + new_attachments.length >=
          MAX_ATTACHMENTS_PER_SEND
        ) {
          const message = describe_too_many_attachments(t);

          set_attachment_error(message);
          show_toast(message, "error");
          break;
        }

        if (file.size > get_max_attachment_size()) {
          const rejection = describe_oversized_file(t, file.name);
          const message = rejection.message;

          set_attachment_error(message);
          show_toast(message, "error");

          if (rejection.can_upgrade)
            prompt_attachment_upgrade(rejection.message);
          continue;
        }

        if (running_total + file.size > get_max_total_attachments_size()) {
          const message = describe_would_exceed_total(t, file.name);

          set_attachment_error(message);
          show_toast(message, "error");
          continue;
        }

        const mime_type = resolve_mime_type(file);

        const same_file_attached =
          attachments.some(
            (a) => a.name === file.name && a.size_bytes === file.size,
          ) ||
          new_attachments.some(
            (a) => a.name === file.name && a.size_bytes === file.size,
          );

        if (same_file_attached) {
          const message = t("common.file_already_attached", {
            name: file.name,
          });

          set_attachment_error(message);
          show_toast(message, "info");
          continue;
        }

        const taken_names = new Set([
          ...attachments.map((a) => a.name),
          ...new_attachments.map((a) => a.name),
        ]);
        const attachment_name = unique_attachment_name(file.name, taken_names);

        try {
          const raw = await file.arrayBuffer();
          const data = await apply_metadata_strip(
            raw,
            mime_type,
            preferences.strip_exif_on_compose,
            file.name,
            unstripped,
          );

          new_attachments.push({
            id: generate_attachment_id(),
            name: attachment_name,
            size: format_bytes(data.byteLength),
            size_bytes: data.byteLength,
            mime_type,
            data,
          });
          running_total += data.byteLength;
        } catch (error) {
          if (import.meta.env.DEV) console.error(error);
          const message = t("common.failed_to_read_named_file", {
            name: file.name,
          });

          set_attachment_error(message);
          show_toast(message, "error");
        }
      }

      if (new_attachments.length > 0) {
        set_attachments((prev) => [...prev, ...new_attachments]);
      }

      if (unstripped.length > 0) {
        show_toast(
          t("common.metadata_not_removed", { names: unstripped.join(", ") }),
          "warning",
          5000,
        );
      }

      if (file_input_ref.current) {
        file_input_ref.current.value = "";
      }
    },
    [
      attachments,
      get_total_attachments_size,
      preferences.strip_exif_on_compose,
      t,
    ],
  );

  const handle_files_drop = useCallback(
    async (files: File[]) => {
      set_attachment_error(null);
      await ensure_attachment_limits();
      const new_attachments: Attachment[] = [];
      const unstripped: string[] = [];
      const current_total = get_total_attachments_size();
      let running_total = current_total;

      for (const file of files) {
        if (
          attachments.length + new_attachments.length >=
          MAX_ATTACHMENTS_PER_SEND
        ) {
          const message = describe_too_many_attachments(t);

          set_attachment_error(message);
          show_toast(message, "error");
          break;
        }

        if (file.size > get_max_attachment_size()) {
          const rejection = describe_oversized_file(t, file.name);
          const message = rejection.message;

          set_attachment_error(message);
          show_toast(message, "error");

          if (rejection.can_upgrade)
            prompt_attachment_upgrade(rejection.message);
          continue;
        }

        if (running_total + file.size > get_max_total_attachments_size()) {
          const message = describe_would_exceed_total(t, file.name);

          set_attachment_error(message);
          show_toast(message, "error");
          continue;
        }

        const mime_type = resolve_mime_type(file);

        const same_file_attached =
          attachments.some(
            (a) => a.name === file.name && a.size_bytes === file.size,
          ) ||
          new_attachments.some(
            (a) => a.name === file.name && a.size_bytes === file.size,
          );

        if (same_file_attached) {
          const message = t("common.file_already_attached", {
            name: file.name,
          });

          set_attachment_error(message);
          show_toast(message, "info");
          continue;
        }

        const taken_names = new Set([
          ...attachments.map((a) => a.name),
          ...new_attachments.map((a) => a.name),
        ]);
        const attachment_name = unique_attachment_name(file.name, taken_names);

        try {
          const raw = await file.arrayBuffer();
          const data = await apply_metadata_strip(
            raw,
            mime_type,
            preferences.strip_exif_on_compose,
            file.name,
            unstripped,
          );

          new_attachments.push({
            id: generate_attachment_id(),
            name: attachment_name,
            size: format_bytes(data.byteLength),
            size_bytes: data.byteLength,
            mime_type,
            data,
          });
          running_total += data.byteLength;
        } catch (error) {
          if (import.meta.env.DEV) console.error(error);
          const message = t("common.failed_to_read_named_file", {
            name: file.name,
          });

          set_attachment_error(message);
          show_toast(message, "error");
        }
      }

      if (new_attachments.length > 0) {
        set_attachments((prev) => [...prev, ...new_attachments]);
      }

      if (unstripped.length > 0) {
        show_toast(
          t("common.metadata_not_removed", { names: unstripped.join(", ") }),
          "warning",
          5000,
        );
      }
    },
    [
      attachments,
      get_total_attachments_size,
      preferences.strip_exif_on_compose,
      t,
    ],
  );

  const trigger_file_select = useCallback(() => {
    file_input_ref.current?.click();
  }, []);

  return {
    attachments,
    set_attachments,
    attachment_error,
    set_attachment_error,
    attachments_scroll_ref,
    file_input_ref,
    attachments_ref,
    remove_attachment,
    handle_file_select,
    handle_files_drop,
    trigger_file_select,
    get_total_attachments_size,
  };
}

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
import { play_iconic_sound } from "@/services/iconic_sounds";
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
  is_loading_attachments: boolean;
  has_pending_attachment_reads: () => boolean;
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
  const [is_loading_attachments, set_is_loading_attachments] = useState(false);
  const pending_reads_ref = useRef(0);
  const has_pending_attachment_reads = useCallback(
    () => pending_reads_ref.current > 0,
    [],
  );
  const with_pending_reads = useCallback(async (read: () => Promise<void>) => {
    pending_reads_ref.current++;
    set_is_loading_attachments(true);

    try {
      await read();
    } finally {
      pending_reads_ref.current--;
      set_is_loading_attachments(pending_reads_ref.current > 0);
    }
  }, []);
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
    attachments_ref.current = attachments_ref.current.filter(
      (a) => a.id !== id,
    );
    set_attachments((prev) => prev.filter((a) => a.id !== id));
    set_attachment_error(null);
  }, []);

  const get_total_attachments_size = useCallback(() => {
    return attachments.reduce((total, att) => total + att.size_bytes, 0);
  }, [attachments]);

  const append_attachments = useCallback(
    (incoming: Attachment[]) => {
      const next = [...attachments_ref.current];
      const taken_names = new Set(next.map((attachment) => attachment.name));
      let total = next.reduce(
        (sum, attachment) => sum + attachment.size_bytes,
        0,
      );

      for (const attachment of incoming) {
        if (next.length >= MAX_ATTACHMENTS_PER_SEND) {
          const message = describe_too_many_attachments(t);

          set_attachment_error(message);
          show_toast(message, "error");
          break;
        }

        if (total + attachment.size_bytes > get_max_total_attachments_size()) {
          const message = describe_would_exceed_total(t, attachment.name);

          set_attachment_error(message);
          show_toast(message, "error");
          continue;
        }

        const name = unique_attachment_name(attachment.name, taken_names);

        next.push({ ...attachment, name });
        taken_names.add(name);
        total += attachment.size_bytes;
      }

      const accepted = next.length - attachments_ref.current.length;

      if (accepted > 0) {
        attachments_ref.current = next;
        set_attachments(next);
      }

      return accepted;
    },
    [t],
  );

  const read_files = useCallback(
    async (files: File[]) => {
      set_attachment_error(null);
      await ensure_attachment_limits();
      const new_attachments: Attachment[] = [];
      const unstripped: string[] = [];
      let running_total = attachments_ref.current.reduce(
        (total, att) => total + att.size_bytes,
        0,
      );

      for (const file of files) {
        if (
          attachments_ref.current.length + new_attachments.length >=
          MAX_ATTACHMENTS_PER_SEND
        ) {
          const message = describe_too_many_attachments(t);

          set_attachment_error(message);
          show_toast(message, "error");
          break;
        }

        if (file.size > get_max_attachment_size()) {
          const rejection = describe_oversized_file(t, file.name, file.size);
          const message = rejection.message;

          set_attachment_error(message);
          show_toast(message, "error");

          if (rejection.can_upgrade)
            prompt_attachment_upgrade(
              rejection.message,
              rejection.upgrade_plan_code,
            );
          continue;
        }

        if (running_total + file.size > get_max_total_attachments_size()) {
          const message = describe_would_exceed_total(t, file.name);

          set_attachment_error(message);
          show_toast(message, "error");
          continue;
        }

        const mime_type = resolve_mime_type(file);

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
            name: file.name,
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

      if (append_attachments(new_attachments) > 0) {
        play_iconic_sound("upload");
      }

      if (unstripped.length > 0) {
        show_toast(
          t("common.metadata_not_removed", { names: unstripped.join(", ") }),
          "warning",
          5000,
        );
      }
    },
    [append_attachments, preferences.strip_exif_on_compose, t],
  );

  const handle_file_select = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(event.target.files ?? []);

      if (file_input_ref.current) {
        file_input_ref.current.value = "";
      }

      if (files.length === 0) return Promise.resolve();

      return with_pending_reads(() => read_files(files));
    },
    [with_pending_reads, read_files],
  );
  const handle_files_drop = useCallback(
    (files: File[]) => with_pending_reads(() => read_files(files)),
    [with_pending_reads, read_files],
  );

  const trigger_file_select = useCallback(() => {
    file_input_ref.current?.click();
  }, []);

  return {
    attachments,
    is_loading_attachments,
    has_pending_attachment_reads,
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

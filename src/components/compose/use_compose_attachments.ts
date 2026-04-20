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

import { format_bytes } from "@/lib/utils";
import {
  type Attachment,
  generate_attachment_id,
  MAX_ATTACHMENT_SIZE,
  MAX_TOTAL_ATTACHMENTS_SIZE,
  ALLOWED_MIME_TYPES,
} from "@/components/compose/compose_shared";

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
}

export function use_compose_attachments(): UseComposeAttachmentsReturn {
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
      const new_attachments: Attachment[] = [];
      const current_total = get_total_attachments_size();
      let running_total = current_total;

      for (let i = 0; i < files.length; i++) {
        const file = files[i];

        if (file.size > MAX_ATTACHMENT_SIZE) {
          set_attachment_error(`"${file.name}" exceeds max size of 25MB`);
          continue;
        }

        if (running_total + file.size > MAX_TOTAL_ATTACHMENTS_SIZE) {
          set_attachment_error(`Total attachments exceed 50MB limit`);
          continue;
        }

        const mime_type = file.type || "application/octet-stream";

        if (
          !ALLOWED_MIME_TYPES.has(mime_type) &&
          !mime_type.startsWith("text/")
        ) {
          set_attachment_error(`Unsupported file type`);
          continue;
        }

        const exists = attachments.some((a) => a.name === file.name);

        if (exists) {
          set_attachment_error(`"${file.name}" already attached`);
          continue;
        }

        try {
          const data = await file.arrayBuffer();

          new_attachments.push({
            id: generate_attachment_id(),
            name: file.name,
            size: format_bytes(file.size),
            size_bytes: file.size,
            mime_type,
            data,
          });
          running_total += file.size;
        } catch (error) {
          if (import.meta.env.DEV) console.error(error);
          set_attachment_error(`Failed to read "${file.name}"`);
        }
      }

      if (new_attachments.length > 0) {
        set_attachments((prev) => [...prev, ...new_attachments]);
      }

      if (file_input_ref.current) {
        file_input_ref.current.value = "";
      }
    },
    [attachments, get_total_attachments_size],
  );

  const handle_files_drop = useCallback(
    async (files: File[]) => {
      set_attachment_error(null);
      const new_attachments: Attachment[] = [];
      const current_total = get_total_attachments_size();
      let running_total = current_total;

      for (const file of files) {
        if (file.size > MAX_ATTACHMENT_SIZE) {
          set_attachment_error(`"${file.name}" exceeds max size of 25MB`);
          continue;
        }

        if (running_total + file.size > MAX_TOTAL_ATTACHMENTS_SIZE) {
          set_attachment_error(`Total attachments exceed 50MB limit`);
          continue;
        }

        const mime_type = file.type || "application/octet-stream";

        if (
          !ALLOWED_MIME_TYPES.has(mime_type) &&
          !mime_type.startsWith("text/")
        ) {
          set_attachment_error(`Unsupported file type`);
          continue;
        }

        const exists = attachments.some((a) => a.name === file.name);

        if (exists) {
          set_attachment_error(`"${file.name}" already attached`);
          continue;
        }

        try {
          const data = await file.arrayBuffer();

          new_attachments.push({
            id: generate_attachment_id(),
            name: file.name,
            size: format_bytes(file.size),
            size_bytes: file.size,
            mime_type,
            data,
          });
          running_total += file.size;
        } catch (error) {
          if (import.meta.env.DEV) console.error(error);
          set_attachment_error(`Failed to read "${file.name}"`);
        }
      }

      if (new_attachments.length > 0) {
        set_attachments((prev) => [...prev, ...new_attachments]);
      }
    },
    [attachments, get_total_attachments_size],
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
  };
}

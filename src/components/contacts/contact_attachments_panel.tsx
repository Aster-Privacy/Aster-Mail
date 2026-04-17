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
import type { DecryptedContactAttachment } from "@/types/contacts";

import { useState, useCallback, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  PaperClipIcon,
  ArrowUpTrayIcon,
  TrashIcon,
  DocumentIcon,
  ArrowDownTrayIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { Button } from "@aster/ui";

import { use_should_reduce_motion } from "@/provider";
import { use_i18n } from "@/lib/i18n/context";
import { cn } from "@/lib/utils";
import {
  upload_contact_attachment,
  delete_contact_attachment,
  download_attachment,
} from "@/services/api/contact_attachments";

interface ContactAttachmentsPanelProps {
  contact_id: string;
  attachments: DecryptedContactAttachment[];
  on_attachments_change: (attachments: DecryptedContactAttachment[]) => void;
  disabled?: boolean;
}

const MAX_FILE_SIZE = 25 * 1024 * 1024;

function format_file_size(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function get_file_icon_color(mime_type: string): string {
  if (mime_type.startsWith("image/")) return "text-green-500";
  if (mime_type.startsWith("video/")) return "text-purple-500";
  if (mime_type.startsWith("audio/")) return "text-pink-500";
  if (mime_type.includes("pdf")) return "text-red-500";
  if (mime_type.includes("word") || mime_type.includes("document"))
    return "text-blue-500";
  if (mime_type.includes("sheet") || mime_type.includes("excel"))
    return "text-emerald-500";

  return "text-foreground-500";
}

export function ContactAttachmentsPanel({
  contact_id,
  attachments,
  on_attachments_change,
  disabled = false,
}: ContactAttachmentsPanelProps) {
  const { t } = use_i18n();
  const reduce_motion = use_should_reduce_motion();
  const [is_uploading, set_is_uploading] = useState(false);
  const [deleting_id, set_deleting_id] = useState<string | null>(null);
  const [downloading_id, set_downloading_id] = useState<string | null>(null);
  const [drag_active, set_drag_active] = useState(false);
  const [error, set_error] = useState<string | null>(null);
  const input_ref = useRef<HTMLInputElement>(null);

  const handle_file_select = useCallback(
    async (file: File) => {
      set_error(null);

      if (file.size > MAX_FILE_SIZE) {
        set_error(t("common.file_too_large", { size: "25MB" }));

        return;
      }

      set_is_uploading(true);

      try {
        const response = await upload_contact_attachment(contact_id, file);

        if (response.error || !response.data) {
          set_error(response.error || t("common.failed_to_upload_attachment"));

          return;
        }

        const blob = new Blob([file], { type: file.type });
        const blob_url = URL.createObjectURL(blob);

        const new_attachment: DecryptedContactAttachment = {
          id: response.data.id,
          contact_id: response.data.contact_id,
          data: new Uint8Array(await file.arrayBuffer()),
          meta: {
            filename: file.name,
            mime_type: file.type,
          },
          blob_url,
          size_bytes: file.size,
          created_at: response.data.created_at,
        };

        on_attachments_change([...attachments, new_attachment]);
      } catch (err) {
        set_error(
          err instanceof Error ? err.message : t("common.upload_failed"),
        );
      } finally {
        set_is_uploading(false);
      }
    },
    [contact_id, attachments, on_attachments_change],
  );

  const handle_drop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      set_drag_active(false);

      const file = e.dataTransfer.files[0];

      if (file) {
        handle_file_select(file);
      }
    },
    [handle_file_select],
  );

  const handle_drag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      set_drag_active(true);
    } else if (e.type === "dragleave") {
      set_drag_active(false);
    }
  }, []);

  const handle_delete = useCallback(
    async (attachment_id: string) => {
      set_deleting_id(attachment_id);
      set_error(null);

      try {
        const response = await delete_contact_attachment(
          contact_id,
          attachment_id,
        );

        if (response.error) {
          set_error(response.error);

          return;
        }

        const attachment = attachments.find((a) => a.id === attachment_id);

        if (attachment?.blob_url) {
          URL.revokeObjectURL(attachment.blob_url);
        }

        on_attachments_change(
          attachments.filter((a) => a.id !== attachment_id),
        );
      } catch (err) {
        set_error(
          err instanceof Error ? err.message : t("common.delete_failed"),
        );
      } finally {
        set_deleting_id(null);
      }
    },
    [contact_id, attachments, on_attachments_change],
  );

  const handle_download = useCallback(
    async (attachment: DecryptedContactAttachment) => {
      set_downloading_id(attachment.id);
      set_error(null);

      try {
        if (attachment.data) {
          download_attachment(attachment.data, attachment.meta);
        }
      } catch (err) {
        set_error(
          err instanceof Error ? err.message : t("common.download_failed"),
        );
      } finally {
        set_downloading_id(null);
      }
    },
    [],
  );

  const handle_input_change = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];

      if (file) {
        handle_file_select(file);
      }
      if (input_ref.current) {
        input_ref.current.value = "";
      }
    },
    [handle_file_select],
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-foreground-600">
          {t("common.attachments_label")}
        </label>
        <Button
          className="gap-1.5"
          disabled={disabled || is_uploading}
          size="md"
          variant="ghost"
          onClick={() => input_ref.current?.click()}
        >
          <ArrowUpTrayIcon className="w-4 h-4" />
          {t("mail.add_file")}
        </Button>
      </div>

      <div
        className={cn(
          "relative rounded-xl border-2 border-dashed transition-colors",
          drag_active
            ? "border-primary bg-primary/10"
            : "border-divider hover:border-primary/50",
          disabled && "opacity-50 cursor-not-allowed",
          attachments.length === 0 ? "p-6" : "p-3",
        )}
        onDragEnter={handle_drag}
        onDragLeave={handle_drag}
        onDragOver={handle_drag}
        onDrop={handle_drop}
      >
        {attachments.length === 0 ? (
          <div
            className="flex flex-col items-center justify-center text-foreground-500 cursor-pointer"
            onClick={() => !disabled && input_ref.current?.click()}
          >
            {is_uploading ? (
              <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            ) : (
              <>
                <PaperClipIcon className="w-8 h-8 mb-2" />
                <span className="text-sm text-center">
                  {t("common.drop_files_or_click")}
                </span>
                <span className="text-xs text-foreground-400 mt-1">
                  {t("common.max_size_per_file", { size: "25MB" })}
                </span>
              </>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            <AnimatePresence mode="popLayout">
              {attachments.map((attachment) => (
                <motion.div
                  key={attachment.id}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex items-center gap-3 p-2 rounded-lg bg-default-100 group"
                  exit={{ opacity: 0, x: -10 }}
                  initial={reduce_motion ? false : { opacity: 0, y: -10 }}
                >
                  <DocumentIcon
                    className={cn(
                      "w-5 h-5 flex-shrink-0",
                      get_file_icon_color(attachment.meta.mime_type),
                    )}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">
                      {attachment.meta.filename}
                    </p>
                    <p className="text-xs text-foreground-500">
                      {format_file_size(attachment.size_bytes)}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button
                      className="p-1.5 h-auto"
                      disabled={downloading_id === attachment.id}
                      size="md"
                      variant="ghost"
                      onClick={() => handle_download(attachment)}
                    >
                      {downloading_id === attachment.id ? (
                        <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <ArrowDownTrayIcon className="w-4 h-4" />
                      )}
                    </Button>
                    <Button
                      className="p-1.5 h-auto text-danger hover:bg-danger/10"
                      disabled={disabled || deleting_id === attachment.id}
                      size="md"
                      variant="ghost"
                      onClick={() => handle_delete(attachment.id)}
                    >
                      {deleting_id === attachment.id ? (
                        <div className="w-4 h-4 border-2 border-danger border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <TrashIcon className="w-4 h-4" />
                      )}
                    </Button>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>

            {is_uploading && (
              <motion.div
                animate={{ opacity: 1 }}
                className="flex items-center justify-center p-3"
                initial={reduce_motion ? false : { opacity: 0 }}
              >
                <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                <span className="ml-2 text-sm text-foreground-500">
                  {t("common.uploading_progress")}
                </span>
              </motion.div>
            )}
          </div>
        )}
      </div>

      <input
        ref={input_ref}
        className="hidden"
        disabled={disabled || is_uploading}
        type="file"
        onChange={handle_input_change}
      />

      <AnimatePresence>
        {error && (
          <motion.div
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-2 text-xs text-danger"
            exit={{ opacity: 0, y: -10 }}
            initial={reduce_motion ? false : { opacity: 0, y: -10 }}
          >
            <XMarkIcon className="w-4 h-4" />
            {error}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

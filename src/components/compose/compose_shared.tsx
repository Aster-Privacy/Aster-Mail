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
import type {
  DraftType,
  DraftAttachmentData,
} from "@/services/api/multi_drafts";
import type { TranslationKey } from "@/lib/i18n/types";

export interface ComposeToolbarState {
  scheduled_time: Date | null;
  is_scheduling: boolean;
  has_recipients: boolean;
  handle_scheduled_send: () => void;
  handle_send: () => void;
  is_mac: boolean;
  schedule_picker_element: React.ReactNode;
  expiration_picker_element: React.ReactNode;
  template_picker_element: React.ReactNode;
  active_formats: Set<string>;
  exec_format_command: (command: string) => void;
  handle_insert_link: () => void;
  trigger_file_select: () => void;
  draft_status: DraftStatus;
  last_saved_time: Date | null;
  handle_show_delete_confirm: (() => void) | null;
  editor?: import("@/hooks/use_editor").UseEditorReturn;
  is_plain_text_mode?: boolean;
  toggle_plain_text_mode?: () => void;
  has_external_recipients?: boolean;
  pgp_enabled?: boolean;
  toggle_pgp?: () => void;
}

export interface Attachment {
  id: string;
  name: string;
  size: string;
  size_bytes: number;
  mime_type: string;
  data: ArrayBuffer;
  content_id?: string;
}

export interface InlineImage {
  id: string;
  cid: string;
  data: ArrayBuffer;
  mime_type: string;
  filename: string;
}

export const MAX_INLINE_IMAGES = 20;
export const MAX_INLINE_IMAGE_SIZE = 5 * 1024 * 1024;
export const MAX_TOTAL_INLINE_SIZE = 10 * 1024 * 1024;

export interface RecipientsState {
  to: string[];
  cc: string[];
  bcc: string[];
}

export interface InputsState {
  to: string;
  cc: string;
  bcc: string;
}

export interface VisibilityState {
  cc: boolean;
  bcc: boolean;
}

export type DraftStatus = "idle" | "saving" | "saved" | "error";

export type RecipientsAction =
  | { type: "ADD"; field: keyof RecipientsState; email: string }
  | { type: "REMOVE"; field: keyof RecipientsState; email: string }
  | { type: "REMOVE_LAST"; field: keyof RecipientsState }
  | { type: "SET"; field: keyof RecipientsState; emails: string[] }
  | { type: "RESET" };

export interface EditDraftData {
  id: string;
  version: number;
  draft_type: DraftType;
  reply_to_id?: string;
  forward_from_id?: string;
  thread_token?: string;
  to_recipients: string[];
  cc_recipients: string[];
  bcc_recipients: string[];
  subject: string;
  message: string;
  updated_at: string;
  attachments?: DraftAttachmentData[];
}

export interface DraftRefData {
  recipients: RecipientsState;
  subject: string;
  message: string;
}

export const MAX_ATTACHMENT_SIZE = 25 * 1024 * 1024;
export const MAX_TOTAL_ATTACHMENTS_SIZE = 50 * 1024 * 1024;
export const EVENT_DISPATCH_DELAY_MS = 100;
export const INITIAL_CONTENT_DELAY_MS = 0;
export const get_aster_footer = (
  t?: (key: TranslationKey, params?: Record<string, string | number>) => string,
  show_branding?: boolean,
): string => {
  if (show_branding === false) return "";
  const secured = t ? t("common.secured_by_aster_mail") : "Secured by";

  return `<br><br>${secured} <a href="https://astermail.org" target="_blank" rel="noopener noreferrer">Aster Mail</a>`;
};
export const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/zip",
  "application/x-zip-compressed",
  "application/x-rar-compressed",
  "application/x-7z-compressed",
  "text/plain",
  "text/csv",
  "text/html",
  "text/css",
  "text/javascript",
  "application/json",
  "application/xml",
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/svg+xml",
  "image/bmp",
  "image/heic",
  "image/heif",
  "image/avif",
  "image/tiff",
  "audio/mpeg",
  "audio/wav",
  "audio/ogg",
  "audio/aac",
  "audio/mp4",
  "audio/x-m4a",
  "audio/webm",
  "audio/flac",
  "video/mp4",
  "video/webm",
  "video/quicktime",
  "video/3gpp",
  "video/x-matroska",
  "video/x-msvideo",
]);

export const INITIAL_RECIPIENTS: RecipientsState = { to: [], cc: [], bcc: [] };
export const INITIAL_INPUTS: InputsState = { to: "", cc: "", bcc: "" };
export const INITIAL_VISIBILITY: VisibilityState = { cc: false, bcc: false };

export const FILE_INPUT_ACCEPT =
  ".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip,.rar,.7z,.txt,.csv,.html,.css,.js,.json,.xml,.jpg,.jpeg,.png,.gif,.webp,.svg,.bmp,.heic,.heif,.avif,.tif,.tiff,.mp3,.wav,.ogg,.aac,.m4a,.weba,.flac,.mp4,.webm,.mov,.3gp,.mkv,.avi";

export function generate_attachment_id(): string {
  return `att_${crypto.randomUUID()}`;
}

export function get_file_icon_color(mime_type: string): {
  bg: string;
  border: string;
  text: string;
} {
  if (mime_type.startsWith("image/")) {
    return {
      bg: "rgba(168, 85, 247, 0.1)",
      border: "rgba(168, 85, 247, 0.3)",
      text: "#a855f7",
    };
  }
  if (mime_type.startsWith("video/")) {
    return {
      bg: "rgba(236, 72, 153, 0.1)",
      border: "rgba(236, 72, 153, 0.3)",
      text: "#ec4899",
    };
  }
  if (mime_type.startsWith("audio/")) {
    return {
      bg: "rgba(14, 165, 233, 0.1)",
      border: "rgba(14, 165, 233, 0.3)",
      text: "#0ea5e9",
    };
  }
  if (mime_type === "application/pdf") {
    return {
      bg: "rgba(239, 68, 68, 0.1)",
      border: "rgba(239, 68, 68, 0.3)",
      text: "var(--color-danger)",
    };
  }
  if (
    mime_type.includes("spreadsheet") ||
    mime_type.includes("excel") ||
    mime_type === "text/csv"
  ) {
    return {
      bg: "rgba(34, 197, 94, 0.1)",
      border: "rgba(34, 197, 94, 0.3)",
      text: "var(--color-success)",
    };
  }
  if (mime_type.includes("word") || mime_type.includes("document")) {
    return {
      bg: "rgba(59, 130, 246, 0.1)",
      border: "rgba(59, 130, 246, 0.3)",
      text: "var(--color-info)",
    };
  }
  if (mime_type.includes("presentation") || mime_type.includes("powerpoint")) {
    return {
      bg: "rgba(249, 115, 22, 0.1)",
      border: "rgba(249, 115, 22, 0.3)",
      text: "#f97316",
    };
  }
  if (mime_type.includes("zip") || mime_type.includes("compressed")) {
    return {
      bg: "rgba(234, 179, 8, 0.1)",
      border: "rgba(234, 179, 8, 0.3)",
      text: "#eab308",
    };
  }

  return {
    bg: "rgba(107, 114, 128, 0.1)",
    border: "rgba(107, 114, 128, 0.3)",
    text: "#6b7280",
  };
}

export function recipients_reducer(
  state: RecipientsState,
  action: RecipientsAction,
): RecipientsState {
  switch (action.type) {
    case "ADD":
      return {
        ...state,
        [action.field]: [...state[action.field], action.email],
      };
    case "REMOVE":
      return {
        ...state,
        [action.field]: state[action.field].filter((e) => e !== action.email),
      };
    case "REMOVE_LAST":
      return { ...state, [action.field]: state[action.field].slice(0, -1) };
    case "SET":
      return { ...state, [action.field]: action.emails };
    case "RESET":
      return { to: [], cc: [], bcc: [] };
  }
}

export function extract_inline_images(html: string): {
  processed_html: string;
  images: InlineImage[];
} {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const imgs = doc.querySelectorAll("img[src^='data:']");
  const extracted: InlineImage[] = [];
  let total_size = 0;

  for (const img of Array.from(imgs)) {
    if (extracted.length >= MAX_INLINE_IMAGES) break;

    const src = img.getAttribute("src") || "";
    const match = src.match(/^data:(image\/[a-z+]+);base64,(.+)$/i);

    if (!match) continue;

    const mime_type = match[1];
    const b64_data = match[2];

    if (mime_type === "image/svg+xml") continue;

    const binary = atob(b64_data);

    if (binary.length === 0) continue;

    const buffer = new ArrayBuffer(binary.length);
    const view = new Uint8Array(buffer);

    for (let i = 0; i < binary.length; i++) {
      view[i] = binary.charCodeAt(i);
    }

    if (buffer.byteLength > MAX_INLINE_IMAGE_SIZE) continue;
    if (total_size + buffer.byteLength > MAX_TOTAL_INLINE_SIZE) continue;

    total_size += buffer.byteLength;

    const cid = `img_${crypto.randomUUID()}@astermail.org`;
    const ext = mime_type.split("/")[1] || "png";
    const original_name = img.getAttribute("data-filename");
    const filename = original_name || `inline_${extracted.length + 1}.${ext}`;

    extracted.push({
      id: crypto.randomUUID(),
      cid,
      data: buffer,
      mime_type,
      filename,
    });

    img.setAttribute("src", `cid:${cid}`);
  }

  return {
    processed_html: doc.body.innerHTML,
    images: extracted,
  };
}

export const is_valid_email = (email: string): boolean =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

export function format_last_saved(
  saved_time: Date,
  t?: (key: TranslationKey, params?: Record<string, string | number>) => string,
): string {
  const now = new Date();
  const is_today =
    saved_time.getDate() === now.getDate() &&
    saved_time.getMonth() === now.getMonth() &&
    saved_time.getFullYear() === now.getFullYear();

  const time_str = saved_time.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });

  if (is_today) {
    return t
      ? t("common.saved_at_time", { time: time_str })
      : `Saved at ${time_str}`;
  }

  const date_str = saved_time.toLocaleDateString([], {
    month: "short",
    day: "numeric",
  });

  return t
    ? t("common.saved_on_date", { date: date_str })
    : `Saved ${date_str}`;
}

export const get_domain_from_email = (email: string): string => {
  const parts = email.split("@");

  return parts.length === 2 ? parts[1].toLowerCase() : "";
};

export {
  DdgFavicon,
  RecipientBadge,
  RecipientField,
  ComposeFormFields,
} from "@/components/compose/compose_recipients";
export {
  ComposeToolbar,
  ComposeFormatBar,
} from "@/components/compose/compose_toolbar";
export {
  ComposeAttachments,
  AttachmentListSimple,
  ComposeErrors,
  ComposeFileInput,
  ComposeFileInputSimple,
  ComposeEditor,
} from "@/components/compose/compose_attachments";

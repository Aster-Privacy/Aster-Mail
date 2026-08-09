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

import type { DecryptedEnvelope, MailItemMetadata } from "@/types/email";


import {
  
  
  
  type MailItem,
} from "@/services/api/mail";
import { } from "@/services/locked_folders";
import { } from "@/workers/pgp_decrypt_pool";
import { } from "@/services/crypto/secure_memory";
import { strip_html_tags } from "@/lib/html_sanitizer";
import { build_body_preview } from "@/utils/preview_text";
import { get_email_username } from "@/lib/utils";
import { resolve_forwarding_display } from "@/utils/forwarding_alias";
import {
  
  expand_date_shortcut,
  parse_size_value,
  parse_size_range,
  
  type ParsedOperator,
} from "@/utils/search_operators";
import { } from "@/contexts/auth_context";
import {
  
  is_ratchet_envelope,
} from "@/utils/email_crypto";
import {
  normalize_envelope_from,
  normalize_envelope_recipients,
} from "@/services/crypto/envelope_normalize";
import { } from "@/lib/i18n/context";
import { } from "@/contexts/preferences_context";
import {
  
  date_boundary_local,
  
} from "@/services/search_chunk_filter";
import { } from "@/hooks/mail_events";

import { SearchResultItem } from "./types";
export function preheader_html_source(envelope: DecryptedEnvelope): string {
  const html = envelope.body_html || envelope.html_body || "";

  return html && !is_ratchet_envelope(html) ? html : "";
}

export function searchable_body_source(envelope: DecryptedEnvelope): string {
  const text = envelope.body_text || envelope.text_body || "";

  if (text && !is_ratchet_envelope(text)) return text;

  const html = envelope.body_html || envelope.html_body || "";

  if (html && !is_ratchet_envelope(html)) return html;

  return text;
}

export function collect_recipient_text(envelope: DecryptedEnvelope): string {
  return [
    ...normalize_envelope_recipients(envelope.to),
    ...normalize_envelope_recipients(envelope.cc),
    ...normalize_envelope_recipients(envelope.bcc),
  ]
    .map((r) => `${r.email.toLowerCase()} ${(r.name || "").toLowerCase()}`)
    .join(" ");
}

export function envelope_sender(envelope: DecryptedEnvelope): {
  name: string;
  email: string;
} {
  return normalize_envelope_from(envelope.from) ?? { name: "", email: "" };
}

export function matches_operator(
  op: ParsedOperator,
  envelope: DecryptedEnvelope,
  metadata: MailItemMetadata | null,
  item: MailItem,
  label_name_to_tokens?: Map<string, string[]>,
  search_body_text?: string,
): boolean {
  const val = op.value.toLowerCase();

  switch (op.type) {
    case "from": {
      const forwarding = resolve_forwarding_display(
        envelope.from,
        envelope.raw_headers,
      );
      const from = envelope_sender(envelope);
      const sender = `${from.email} ${
        forwarding?.display_sender_email || ""
      }`.toLowerCase();
      const sender_name = `${from.name} ${
        forwarding?.display_sender_name || ""
      }`.toLowerCase();

      return sender.includes(val) || sender_name.includes(val);
    }
    case "to":
      return collect_recipient_text(envelope).includes(val);
    case "subject":
      return (envelope.subject || "").toLowerCase().includes(val);
    case "has": {
      if (val === "attachment" || val === "attachments")
        return metadata?.has_attachments ?? false;
      if (!metadata?.has_attachments) return false;
      const combined =
        search_body_text ||
        (
          (envelope.body_text || "") +
          " " +
          (envelope.body_html || envelope.html_body || "")
        ).toLowerCase();
      const ext_map: Record<string, string[]> = {
        pdf: [".pdf"],
        image: [".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg", ".bmp"],
        document: [".doc", ".docx", ".odt", ".txt", ".rtf"],
        spreadsheet: [".xls", ".xlsx", ".ods", ".csv"],
        video: [".mp4", ".webm", ".avi", ".mov"],
        audio: [".mp3", ".wav", ".ogg", ".aac", ".flac"],
        archive: [".zip", ".rar", ".7z", ".gz", ".tar"],
      };
      const extensions = ext_map[val];

      if (!extensions) return true;

      return extensions.some((ext) => combined.includes(ext));
    }
    case "is":
      if (val === "unread") return !(metadata?.is_read ?? false);
      if (val === "read") return metadata?.is_read ?? false;
      if (val === "starred") return metadata?.is_starred ?? false;
      if (val === "unstarred") return !(metadata?.is_starred ?? false);

      return true;
    case "in": {
      const all_names = [
        ...(item.labels || []).map((l) => l.name.toLowerCase()),
        ...(item.folders || []).map((f) => f.name.toLowerCase()),
      ];

      if (val === "anywhere") return true;
      if (val === "all") return !item.is_trashed && !item.is_spam;
      if (
        val === "inbox" &&
        item.item_type === "received" &&
        !item.is_trashed &&
        !item.is_spam
      )
        return true;
      if (val === "sent" && item.item_type === "sent") return true;
      if (val === "trash" && item.is_trashed) return true;
      if (val === "spam" && item.is_spam) return true;
      if (val === "drafts" && item.item_type === "draft") return true;

      return all_names.some((f) => f.includes(val));
    }
    case "before": {
      const ts = new Date(item.message_ts || item.created_at).getTime();
      const target = date_boundary_local(op.value, false);

      return !isNaN(target) && ts < target;
    }
    case "after": {
      const ts = new Date(item.message_ts || item.created_at).getTime();
      const target = date_boundary_local(op.value, false);

      return !isNaN(target) && ts > target;
    }
    case "date": {
      const range = expand_date_shortcut(val);

      if (!range) return true;
      const ts = new Date(item.message_ts || item.created_at).getTime();
      const [fy, fm, fd] = range.date_from.split("-").map(Number);
      const [ty, tm, td] = range.date_to.split("-").map(Number);
      const from_ts = new Date(fy, fm - 1, fd, 0, 0, 0, 0).getTime();
      const to_ts = new Date(ty, tm - 1, td, 23, 59, 59, 999).getTime();

      return ts >= from_ts && ts <= to_ts;
    }
    case "filename":
    case "attachment": {
      if (!metadata?.has_attachments) return false;
      const content =
        search_body_text ||
        (
          (envelope.body_text || "") +
          " " +
          (envelope.body_html || envelope.html_body || "")
        ).toLowerCase();

      return content.includes(val);
    }
    case "larger": {
      const threshold = parse_size_value(op.value);

      if (threshold === null) return true;
      const size = metadata?.size_bytes ?? 0;

      return size > threshold;
    }
    case "smaller": {
      const threshold = parse_size_value(op.value);

      if (threshold === null) return true;
      const size = metadata?.size_bytes ?? 0;

      return size < threshold;
    }
    case "size": {
      const range = parse_size_range(op.value);

      if (!range) return true;
      const size = metadata?.size_bytes ?? 0;

      return size >= range.min && size <= range.max;
    }
    case "id":
      return item.id === op.value;
    case "label":
    case "folder": {
      if (label_name_to_tokens) {
        const matching_tokens: string[] = [];

        for (const [name, tokens] of label_name_to_tokens) {
          if (name.includes(val)) {
            matching_tokens.push(...tokens);
          }
        }
        if (matching_tokens.length > 0) {
          const item_tokens = [
            ...(item.labels || []).map((l) => l.token),
            ...(item.folders || []).map((f) => f.token),
            ...(item.tag_tokens || []),
          ];

          return item_tokens.some((t) => matching_tokens.includes(t));
        }
      }
      const all_names = [
        ...(item.labels || []).map((l) => l.name.toLowerCase()),
        ...(item.folders || []).map((f) => f.name.toLowerCase()),
      ];

      return all_names.some((l) => l.length > 0 && l.includes(val));
    }
    default:
      return true;
  }
}

export const BODY_CONTENT_OPERATOR_TYPES = new Set(["filename", "attachment"]);

export function operator_needs_body(op: ParsedOperator): boolean {
  if (BODY_CONTENT_OPERATOR_TYPES.has(op.type)) return true;
  if (op.type === "has") {
    const val = op.value.toLowerCase();

    return val !== "attachment" && val !== "attachments";
  }

  return false;
}

export function query_requires_body(
  terms: string[],
  operators: ParsedOperator[],
): boolean {
  return terms.length > 0 || operators.some(operator_needs_body);
}

export function matches_query(
  terms: string[],
  operators: ParsedOperator[],
  envelope: DecryptedEnvelope | null,
  metadata: MailItemMetadata | null,
  item: MailItem,
  label_name_to_tokens?: Map<string, string[]>,
  fields?: string[],
  search_body: boolean = true,
  search_body_text?: string,
): boolean {
  if (!envelope) return false;

  for (const op of operators) {
    const result = matches_operator(
      op,
      envelope,
      metadata,
      item,
      label_name_to_tokens,
      search_body_text,
    );

    if (op.negated ? result : !result) return false;
  }

  if (terms.length === 0) return true;

  const search_all = !fields || fields.length === 0 || fields.includes("all");
  const subject = (envelope.subject || "").toLowerCase();
  const forwarding = resolve_forwarding_display(
    envelope.from,
    envelope.raw_headers,
  );
  const from = envelope_sender(envelope);
  const sender_name = `${from.name} ${
    forwarding?.display_sender_name || ""
  }`.toLowerCase();
  const sender_email = `${from.email} ${
    forwarding?.display_sender_email || ""
  }`.toLowerCase();
  const recipients = collect_recipient_text(envelope);
  const body = search_body
    ? (search_body_text ??
      strip_html_tags(searchable_body_source(envelope)).toLowerCase())
    : "";

  return terms.every((term) => {
    if (search_all) {
      return (
        subject.includes(term) ||
        sender_name.includes(term) ||
        sender_email.includes(term) ||
        recipients.includes(term) ||
        (search_body && body.includes(term))
      );
    }
    let match = false;

    if (fields!.includes("subject")) match = match || subject.includes(term);
    if (fields!.includes("sender"))
      match =
        match || sender_name.includes(term) || sender_email.includes(term);
    if (fields!.includes("recipient"))
      match = match || recipients.includes(term);
    if (search_body && fields!.includes("body"))
      match = match || body.includes(term);

    return match;
  });
}

export function to_search_result(
  item: MailItem,
  envelope: DecryptedEnvelope | null,
  metadata: MailItemMetadata | null,
): SearchResultItem {
  const forwarding_display = resolve_forwarding_display(
    envelope?.from,
    envelope?.raw_headers,
  );

  const from = envelope ? envelope_sender(envelope) : { name: "", email: "" };
  const outgoing =
    item.item_type === "sent" || item.item_type === "draft" ? envelope : null;
  const first_recipient = outgoing
    ? normalize_envelope_recipients(outgoing.to)[0]
    : undefined;
  const display = first_recipient ?? from;

  return {
    id: item.id,
    subject: envelope?.subject || "(Encrypted)",
    preview: envelope
      ? build_body_preview(
          searchable_body_source(envelope),
          preheader_html_source(envelope),
        )
      : "",
    sender_name:
      (!first_recipient && forwarding_display?.display_sender_name) ||
      display.name ||
      get_email_username(display.email),
    sender_email:
      (!first_recipient && forwarding_display?.display_sender_email) ||
      display.email,
    timestamp: item.message_ts || item.created_at,
    is_read: metadata?.is_read ?? false,
    is_starred: metadata?.is_starred ?? false,
    has_attachment: metadata?.has_attachments ?? false,
    item_type: item.item_type,
    folders: [
      ...(item.labels || []).map((l) => ({
        folder_token: l.token,
        name: l.name,
      })),
      ...(item.folders || []).map((f) => ({
        folder_token: f.token,
        name: f.name,
      })),
    ],
  };
}


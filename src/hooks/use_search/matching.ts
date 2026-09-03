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
import type { TranslationKey } from "@/lib/i18n/types";

import { SearchHaystack, SearchResultItem } from "./types";

import { type MailItem } from "@/services/api/mail";
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
import { is_ratchet_envelope } from "@/utils/email_crypto";
import {
  normalize_envelope_from,
  normalize_envelope_recipients,
} from "@/services/crypto/envelope_normalize";
import { date_boundary_local } from "@/services/search_chunk_filter";

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

export function build_search_haystack(
  envelope: DecryptedEnvelope,
): SearchHaystack {
  const forwarding = resolve_forwarding_display(
    envelope.from,
    envelope.raw_headers,
  );
  const from = envelope_sender(envelope);
  const forwarded_name = forwarding?.display_sender_name || "";
  const forwarded_email = forwarding?.display_sender_email || "";

  return {
    subject: (envelope.subject || "").toLowerCase(),
    sender_name: `${from.name} ${forwarded_name}`.toLowerCase(),
    sender_email: `${from.email} ${forwarded_email}`.toLowerCase(),
    contact:
      `${from.email} ${from.name} ${forwarded_email} ${forwarded_name}`.toLowerCase(),
    recipients: collect_recipient_text(envelope),
  };
}

export function matches_operator(
  op: ParsedOperator,
  envelope: DecryptedEnvelope,
  metadata: MailItemMetadata | null,
  item: MailItem,
  label_name_to_tokens?: Map<string, string[]>,
  search_body_text?: string,
  haystack?: SearchHaystack,
): boolean {
  const val = op.value.toLowerCase();
  const hay = haystack ?? build_search_haystack(envelope);

  switch (op.type) {
    case "from":
      return hay.sender_email.includes(val) || hay.sender_name.includes(val);
    case "to":
      return hay.recipients.includes(val);
    case "contact":
      return hay.contact.includes(val) || hay.recipients.includes(val);
    case "subject":
      return hay.subject.includes(val);
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
      switch (val) {
        case "anywhere":
          return true;
        case "all":
          return !item.is_trashed && !item.is_spam;
        case "inbox":
          return (
            item.item_type === "received" &&
            !item.is_trashed &&
            !item.is_spam &&
            !item.is_archived
          );
        case "archive":
        case "archived":
          return Boolean(item.is_archived) && !item.is_trashed;
        case "sent":
          return item.item_type === "sent";
        case "drafts":
        case "draft":
          return item.item_type === "draft";
        case "trash":
          return Boolean(item.is_trashed);
        case "spam":
          return Boolean(item.is_spam);
        case "starred":
          return metadata?.is_starred ?? false;
        default:
          break;
      }

      const all_names = [
        ...(item.labels || []).map((l) => l.name.toLowerCase()),
        ...(item.folders || []).map((f) => f.name.toLowerCase()),
      ];

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

export const ANY_OF_OPERATOR_TYPES = new Set(["from", "to", "contact"]);

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
  haystack?: SearchHaystack,
): boolean {
  if (!envelope) return false;

  const hay = haystack ?? build_search_haystack(envelope);

  if (operators.length > 0) {
    const or_groups = new Map<string, ParsedOperator[]>();

    for (const op of operators) {
      if (op.negated || !ANY_OF_OPERATOR_TYPES.has(op.type)) continue;
      const group = or_groups.get(op.type);

      if (group) group.push(op);
      else or_groups.set(op.type, [op]);
    }

    const grouped = new Set<ParsedOperator>();

    for (const group of or_groups.values()) {
      if (group.length < 2 && group[0].type !== "contact") continue;
      group.forEach((op) => grouped.add(op));

      const any_match = group.some((op) =>
        matches_operator(
          op,
          envelope,
          metadata,
          item,
          label_name_to_tokens,
          search_body_text,
          hay,
        ),
      );

      if (!any_match) return false;
    }

    for (const op of operators) {
      if (grouped.has(op)) continue;

      const result = matches_operator(
        op,
        envelope,
        metadata,
        item,
        label_name_to_tokens,
        search_body_text,
        hay,
      );

      if (op.negated ? result : !result) return false;
    }
  }

  if (terms.length === 0) return true;

  const search_all = !fields || fields.length === 0 || fields.includes("all");
  const subject = hay.subject;
  const sender_name = hay.sender_name;
  const sender_email = hay.sender_email;
  const recipients = hay.recipients;
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

type Translate = (
  key: TranslationKey,
  params?: Record<string, string | number>,
) => string;

export function to_search_result(
  item: MailItem,
  envelope: DecryptedEnvelope | null,
  metadata: MailItemMetadata | null,
  t: Translate,
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
    subject: envelope
      ? envelope.subject || t("mail.no_subject")
      : t("common.unable_to_decrypt"),
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
    thread_token: item.thread_token,
    thread_message_count: item.thread_message_count,
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

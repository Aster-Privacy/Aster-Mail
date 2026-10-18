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
  parse_size_value,
  parse_size_range,
  type ParsedOperator,
} from "@/utils/search_operators";
import { is_ratchet_envelope } from "@/utils/email_crypto";
import {
  normalize_envelope_from,
  normalize_envelope_recipients,
} from "@/services/crypto/envelope_normalize";
import {
  date_boundary_local,
  date_operator_range,
} from "@/services/search_chunk_filter";
import {
  address_list_includes,
  is_full_address,
} from "@/utils/contact_mail_search";
import { fold_search_text, includes_folded } from "@/utils/search_fold";

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

export type AttachmentDetail = {
  filename?: string | null;
  content_type?: string | null;
};

export type AttachmentDetails = ReadonlyMap<string, AttachmentDetail[]>;

export function envelope_attachments(
  envelope: DecryptedEnvelope,
): AttachmentDetail[] | null {
  const list = envelope.attachment_metadata ?? envelope.attachment_keys;

  return list && list.length > 0 ? list : null;
}

export function operator_needs_attachment_details(op: ParsedOperator): boolean {
  if (BODY_CONTENT_OPERATOR_TYPES.has(op.type)) return true;

  return op.type === "has" && !is_attachment_presence(op.value.toLowerCase());
}

function folded_value(value: string): string {
  return fold_search_text(value) || value.toLowerCase();
}

function item_label_names(item: MailItem): string[] {
  return [
    ...(item.labels || []).map((l) => folded_value(l.name || "")),
    ...(item.folders || []).map((f) => folded_value(f.name || "")),
  ].filter((name) => name.length > 0);
}

function is_attachment_presence(value: string): boolean {
  return value === "attachment" || value === "attachments";
}

export function matches_operator(
  op: ParsedOperator,
  envelope: DecryptedEnvelope,
  metadata: MailItemMetadata | null,
  item: MailItem,
  label_name_to_tokens?: Map<string, string[]>,
  search_body_text?: string,
  haystack?: SearchHaystack,
  attachment_details?: AttachmentDetails,
): boolean {
  const val = op.value.toLowerCase();
  const hay = haystack ?? build_search_haystack(envelope);

  switch (op.type) {
    case "from": {
      if (is_full_address(val))
        return address_list_includes(hay.sender_email, val);

      const text = fold_search_text(val) || val;

      return (
        includes_folded(hay.sender_email, text) ||
        includes_folded(hay.sender_name, text)
      );
    }
    case "to":
      if (is_full_address(val))
        return address_list_includes(hay.recipients, val);

      return includes_folded(hay.recipients, fold_search_text(val) || val);
    case "contact": {
      if (is_full_address(val))
        return (
          address_list_includes(hay.contact, val) ||
          address_list_includes(hay.recipients, val)
        );

      const text = fold_search_text(val) || val;

      return (
        includes_folded(hay.contact, text) ||
        includes_folded(hay.recipients, text)
      );
    }
    case "subject":
      return includes_folded(hay.subject, fold_search_text(val) || val);
    case "has": {
      if (is_attachment_presence(val))
        return metadata?.has_attachments ?? false;
      if (!metadata?.has_attachments) return false;
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

      if (!extensions) return false;

      const attachments =
        envelope_attachments(envelope) ?? attachment_details?.get(item.id);

      if (!attachments) return false;

      return attachments.some((attachment) => {
        const filename = attachment.filename?.toLowerCase() ?? "";
        const type = attachment.content_type?.toLowerCase() ?? "";

        return (
          extensions.some((ext) => filename.endsWith(ext)) ||
          (val === "pdf" && type === "application/pdf") ||
          (["image", "video", "audio"].includes(val) &&
            type.startsWith(`${val}/`))
        );
      });
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
          return !!item.is_archived && !item.is_trashed;
        case "sent":
          return item.item_type === "sent";
        case "drafts":
        case "draft":
          return item.item_type === "draft";
        case "scheduled":
          return item.item_type === "scheduled";
        case "snoozed": {
          const until = item.snoozed_until ?? metadata?.snoozed_until;

          return !!until && new Date(until).getTime() > Date.now();
        }
        case "trash":
          return !!item.is_trashed;
        case "spam":
          return !!item.is_spam;
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

      return !isNaN(target) && ts >= target;
    }
    case "date": {
      const range = date_operator_range(op.value);

      if (!range) return false;
      const ts = new Date(item.message_ts || item.created_at).getTime();

      return ts >= range.from && ts <= range.to;
    }
    case "filename":
    case "attachment": {
      if (!metadata?.has_attachments) return false;
      const attachments =
        envelope_attachments(envelope) ?? attachment_details?.get(item.id);

      if (!attachments) return false;

      return attachments.some((attachment) =>
        includes_folded(
          attachment.filename?.toLowerCase() ?? "",
          fold_search_text(val) || val,
        ),
      );
    }
    case "larger": {
      const threshold = parse_size_value(op.value);

      if (threshold === null) return false;
      const size = metadata?.size_bytes ?? 0;

      return size > threshold;
    }
    case "smaller": {
      const threshold = parse_size_value(op.value);

      if (threshold === null) return false;
      const size = metadata?.size_bytes ?? 0;

      return size < threshold;
    }
    case "size": {
      const range = parse_size_range(op.value);

      if (!range) return false;
      const size = metadata?.size_bytes ?? 0;

      return size >= range.min && size <= range.max;
    }
    case "id":
      return item.id === op.value;
    case "label":
    case "folder": {
      const wanted = folded_value(val);

      if (label_name_to_tokens) {
        const exact_tokens: string[] = [];
        const prefix_tokens: string[] = [];

        for (const [name, tokens] of label_name_to_tokens) {
          const folded = folded_value(name);

          if (folded === wanted) exact_tokens.push(...tokens);
          else if (folded.startsWith(wanted)) prefix_tokens.push(...tokens);
        }

        const matching_tokens =
          exact_tokens.length > 0 ? exact_tokens : prefix_tokens;

        if (matching_tokens.length > 0) {
          const item_tokens = [
            ...(item.labels || []).map((l) => l.token),
            ...(item.folders || []).map((f) => f.token),
            ...(item.tag_tokens || []),
          ];

          return item_tokens.some((t) => matching_tokens.includes(t));
        }
      }
      const names = item_label_names(item);

      return (
        names.includes(wanted) || names.some((name) => name.startsWith(wanted))
      );
    }
    case "text": {
      const term = folded_value(val);

      return (
        includes_folded(hay.subject, term) ||
        includes_folded(hay.sender_name, term) ||
        includes_folded(hay.sender_email, term) ||
        includes_folded(hay.recipients, term) ||
        includes_folded(
          search_body_text ??
            strip_html_tags(searchable_body_source(envelope)).toLowerCase(),
          term,
        )
      );
    }
    default:
      return true;
  }
}

export const BODY_CONTENT_OPERATOR_TYPES = new Set(["filename", "attachment"]);

export const ANY_OF_OPERATOR_TYPES = new Set(["from", "to", "contact", "in"]);

function any_of_group_key(op: ParsedOperator): string | null {
  if (op.negated) return null;
  if (ANY_OF_OPERATOR_TYPES.has(op.type)) return op.type;
  if (op.type === "has" && !is_attachment_presence(op.value.toLowerCase())) {
    return "has";
  }

  return null;
}

export function operator_needs_body(op: ParsedOperator): boolean {
  if (BODY_CONTENT_OPERATOR_TYPES.has(op.type)) return true;
  if (op.type === "text") return true;
  if (op.type === "has") return !is_attachment_presence(op.value.toLowerCase());

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
  attachment_details?: AttachmentDetails,
): boolean {
  if (!envelope) return false;

  const hay = haystack ?? build_search_haystack(envelope);
  const search_all = !fields || fields.length === 0 || fields.includes("all");
  const needs_text =
    terms.length > 0 || operators.some((op) => op.type === "text");
  const body =
    search_body && needs_text
      ? (search_body_text ??
        strip_html_tags(searchable_body_source(envelope)).toLowerCase())
      : "";

  const term_matches = (raw_term: string): boolean => {
    const term = fold_search_text(raw_term) || raw_term;

    if (search_all) {
      return (
        includes_folded(hay.subject, term) ||
        includes_folded(hay.sender_name, term) ||
        includes_folded(hay.sender_email, term) ||
        includes_folded(hay.recipients, term) ||
        (search_body && includes_folded(body, term))
      );
    }
    let match = false;

    if (fields!.includes("subject"))
      match = match || includes_folded(hay.subject, term);
    if (fields!.includes("sender"))
      match =
        match ||
        includes_folded(hay.sender_name, term) ||
        includes_folded(hay.sender_email, term);
    if (fields!.includes("recipient"))
      match = match || includes_folded(hay.recipients, term);
    if (search_body && fields!.includes("body"))
      match = match || includes_folded(body, term);

    return match;
  };

  const operator_matches = (op: ParsedOperator): boolean =>
    op.type === "text"
      ? term_matches(op.value.toLowerCase())
      : matches_operator(
          op,
          envelope,
          metadata,
          item,
          label_name_to_tokens,
          search_body_text,
          hay,
          attachment_details,
        );

  if (operators.length > 0) {
    const or_groups = new Map<string, ParsedOperator[]>();

    for (const op of operators) {
      const key = any_of_group_key(op);

      if (!key) continue;
      const group = or_groups.get(key);

      if (group) group.push(op);
      else or_groups.set(key, [op]);
    }

    const grouped = new Set<ParsedOperator>();

    for (const group of or_groups.values()) {
      if (group.length < 2 && group[0].type !== "contact") continue;
      group.forEach((op) => grouped.add(op));

      if (!group.some(operator_matches)) return false;
    }

    for (const op of operators) {
      if (grouped.has(op)) continue;

      const result = operator_matches(op);

      if (op.negated ? result : !result) return false;
    }
  }

  return terms.every(term_matches);
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
    item,
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
    is_spam: metadata?.is_spam ?? item.is_spam ?? false,
    has_attachment: metadata?.has_attachments ?? false,
    item_type: item.item_type,
    is_outgoing: !!first_recipient,
    actual_sender_email: from.email,
    is_external: item.is_external,
    system_origin: item.system_origin,
    sender_verification: envelope?.sender_verification,
    sender_aligned: item.sender_aligned,
    spf_result: item.spf_result,
    dkim_result: item.dkim_result,
    dmarc_result: item.dmarc_result,
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

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

import { type ParsedEmail } from "@/services/import/parser";
import { type ImportSource } from "@/services/api/email_import";
import { extract_email_address } from "@/services/import/mime_utils";

export interface ImportModalProps {
  is_open: boolean;
  on_close: () => void;
  provider: ImportSource | null;
}

export type ImportStep = "upload" | "progress" | "complete";

export const PICKER_REOPEN_DELAY_MS = 700;

export const CANONICAL_FOLDER_TOKENS = new Set([
  "inbox",
  "sent",
  "sent mail",
  "sent items",
  "sent messages",
  "outbox",
  "drafts",
  "draft",
  "trash",
  "deleted",
  "deleted items",
  "deleted messages",
  "bin",
  "spam",
  "junk",
  "junk email",
  "junk e-mail",
  "bulk mail",
  "archive",
  "archives",
  "all mail",
  "all",
  "starred",
  "flagged",
  "important",
]);

const IGNORED_LABEL_PREFIXES = ["category ", "imap_", "[imap]", "[gmail]"];

const SENT_LABELS = new Set([
  "sent",
  "sent mail",
  "sent items",
  "sent messages",
  "outbox",
]);
const DRAFT_LABELS = new Set(["drafts", "draft", "chat", "chats"]);
const TRASH_LABELS = new Set([
  "trash",
  "deleted",
  "deleted items",
  "deleted messages",
  "bin",
]);
const SPAM_LABELS = new Set([
  "spam",
  "junk",
  "junk email",
  "junk e-mail",
  "bulk mail",
]);
const ARCHIVE_LABELS = new Set([
  "archive",
  "archives",
  "archived",
  "all mail",
  "all",
]);
const STARRED_LABELS = new Set(["starred", "flagged"]);

const STORE_ROOT_SEGMENT =
  /^(top of .+|root - .+|ipm_subtree|\[gmail\]|\[google mail\])$/;

function system_label_name(name: string): string {
  const segments = name
    .trim()
    .toLowerCase()
    .split("/")
    .map((segment) => segment.trim());
  let start = 0;

  while (
    start < segments.length - 1 &&
    STORE_ROOT_SEGMENT.test(segments[start])
  ) {
    start++;
  }

  return segments.slice(start).join("/");
}

export function is_ignored_label(name: string): boolean {
  const lower = name.trim().toLowerCase();

  if (lower === "important" || lower === "unread" || lower === "opened") {
    return true;
  }

  return IGNORED_LABEL_PREFIXES.some((prefix) => lower.startsWith(prefix));
}

export function is_canonical_folder(name: string): boolean {
  return (
    CANONICAL_FOLDER_TOKENS.has(system_label_name(name)) ||
    is_ignored_label(name)
  );
}

const LABEL_HEADER = "x-gmail-labels";
const KEYWORD_HEADERS = ["x-keywords"];
const KEYWORD_FLAGS = new Set(["nonjunk", "notjunk"]);

export const MAX_TAGS_PER_EMAIL = 50;

export function split_label_list(raw: string, on_whitespace = false): string[] {
  const out: string[] = [];
  let current = "";
  let in_quotes = false;

  const flush = () => {
    const name = current.trim();

    if (name) out.push(name);
    current = "";
  };

  for (let i = 0; i < raw.length; i++) {
    const char = raw[i];

    if (char === "\\" && in_quotes && raw[i + 1] === '"') {
      current += '"';
      i++;
    } else if (char === '"') {
      if (in_quotes && raw[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        in_quotes = !in_quotes;
      }
    } else if (
      !in_quotes &&
      (on_whitespace ? /\s/.test(char) : char === ",")
    ) {
      flush();
    } else {
      current += char;
    }
  }
  flush();

  return out;
}

export function normalize_label_path(name: string): string {
  return name
    .split("/")
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0)
    .join("/");
}

export function source_labels(email: ParsedEmail): string[] {
  const raw = email.raw_headers[LABEL_HEADER];

  if (raw) return split_label_list(raw);
  if (email.source_folder) return [email.source_folder];

  return [];
}

export function keyword_labels(email: ParsedEmail): string[] {
  const out: string[] = [];

  for (const header of KEYWORD_HEADERS) {
    const raw = email.raw_headers[header];

    if (!raw) continue;
    const on_whitespace = header === "x-keywords" && !raw.includes(",");

    for (const name of split_label_list(raw, on_whitespace)) {
      if (name.startsWith("$") || name.startsWith("\\")) continue;
      if (KEYWORD_FLAGS.has(name.toLowerCase())) continue;
      out.push(name);
    }
  }

  return out;
}

export interface ImportDisposition {
  skip: boolean;
  sent: boolean;
  is_read?: boolean;
  is_starred: boolean;
  is_archived: boolean;
  is_spam: boolean;
  is_trashed: boolean;
  custom_labels: string[];
  tag_names: string[];
}

export function classify_import_labels(
  labels: string[],
  custom_as_tags = false,
): ImportDisposition {
  const disposition: ImportDisposition = {
    skip: false,
    sent: false,
    is_starred: false,
    is_archived: false,
    is_spam: false,
    is_trashed: false,
    custom_labels: [],
    tag_names: [],
  };
  let inbox = false;
  let archived = false;

  for (const label of labels) {
    const lower = label.trim().toLowerCase();
    const name = system_label_name(label);

    if (lower === "unread") {
      disposition.is_read = false;
      continue;
    }
    if (lower === "opened") {
      if (disposition.is_read === undefined) disposition.is_read = true;
      continue;
    }
    if (is_ignored_label(label) || is_ignored_label(name)) continue;
    if (name === "inbox") inbox = true;
    else if (SENT_LABELS.has(name)) disposition.sent = true;
    else if (DRAFT_LABELS.has(name)) disposition.skip = true;
    else if (TRASH_LABELS.has(name)) disposition.is_trashed = true;
    else if (SPAM_LABELS.has(name)) disposition.is_spam = true;
    else if (ARCHIVE_LABELS.has(name)) archived = true;
    else if (STARRED_LABELS.has(name)) disposition.is_starred = true;
    else if (custom_as_tags) disposition.tag_names.push(label.trim());
    else disposition.custom_labels.push(label.trim());
  }

  if (disposition.is_trashed) disposition.is_spam = false;
  if (
    archived &&
    !inbox &&
    !disposition.sent &&
    !disposition.is_trashed &&
    !disposition.is_spam &&
    disposition.custom_labels.length === 0
  ) {
    disposition.is_archived = true;
  }

  return disposition;
}

function unique_tag_names(names: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];

  for (const raw of names) {
    const name = normalize_label_path(raw);
    const key = name.toLowerCase();

    if (!name || seen.has(key)) continue;
    seen.add(key);
    out.push(name);
  }

  return out;
}

export function classify_import_email(email: ParsedEmail): ImportDisposition {
  const has_label_header = Boolean(email.raw_headers[LABEL_HEADER]);
  const disposition = classify_import_labels(
    source_labels(email),
    has_label_header,
  );
  const keyword_tags = classify_import_labels(
    keyword_labels(email),
    true,
  ).tag_names;

  disposition.tag_names = unique_tag_names([
    ...disposition.tag_names,
    ...keyword_tags,
  ]);

  return disposition;
}

export function extract_source_tags(emails: ParsedEmail[]): string[] {
  const names: string[] = [];

  for (const email of emails) {
    const disposition = classify_import_email(email);

    if (disposition.skip) continue;
    names.push(...disposition.tag_names);
  }

  return unique_tag_names(names);
}

export function tag_tokens_for_email(
  email: ParsedEmail,
  tag_map: Map<string, string>,
): string[] {
  const tokens: string[] = [];

  for (const name of classify_import_email(email).tag_names) {
    const token = tag_map.get(name.toLowerCase());

    if (!token || tokens.includes(token)) continue;
    tokens.push(token);
    if (tokens.length >= MAX_TAGS_PER_EMAIL) break;
  }

  return tokens;
}

export function derive_manual_import_source(files: File[]): ImportSource {
  let has_mbox = false;
  let has_eml = false;

  for (const file of files) {
    const name = file.name.toLowerCase();

    if (name.endsWith(".mbox") || name.endsWith(".mbx")) has_mbox = true;
    else if (name.endsWith(".eml") || name.endsWith(".emlx")) has_eml = true;
  }

  if (has_mbox) return "mbox";
  if (has_eml) return "eml";

  return "mbox";
}

export function extract_source_folders(emails: ParsedEmail[]): string[] {
  const out = new Set<string>();

  for (const email of emails) {
    const disposition = classify_import_email(email);

    if (disposition.skip) continue;
    for (const name of disposition.custom_labels) {
      out.add(name);
    }
  }

  return Array.from(out);
}

export function folder_for_email(
  email: ParsedEmail,
  label_map: Map<string, string>,
): string | undefined {
  for (const name of classify_import_email(email).custom_labels) {
    const token = label_map.get(name.trim());

    if (token) return token;
  }

  return undefined;
}

export const NO_SUBJECT_SENTINELS = new Set(["(no subject)", "no subject"]);

export function normalize_subject(subject: string): string {
  const normalized = subject
    .replace(/^(\s*(re|fwd?|aw|sv|vs|ref|rif|r)\s*:\s*)+/i, "")
    .trim()
    .toLowerCase();

  if (NO_SUBJECT_SENTINELS.has(normalized)) return "";

  return normalized;
}

export function uint8_to_base64(array: Uint8Array): string {
  let binary = "";

  for (let i = 0; i < array.length; i++) {
    binary += String.fromCharCode(array[i]);
  }

  return btoa(binary);
}

export async function build_thread_map(
  emails: ParsedEmail[],
): Promise<Map<string, string>> {
  const thread_tokens = new Map<string, string>();
  const message_id_to_group = new Map<string, string>();
  const group_members = new Map<string, Set<string>>();

  for (const email of emails) {
    message_id_to_group.set(email.message_id, email.message_id);
    const members = new Set<string>();

    members.add(email.message_id);
    group_members.set(email.message_id, members);
  }

  const find_root = (id: string): string => {
    let root = id;

    while (
      message_id_to_group.has(root) &&
      message_id_to_group.get(root) !== root
    ) {
      root = message_id_to_group.get(root)!;
    }

    return root;
  };

  const merge = (a: string, b: string) => {
    const root_a = find_root(a);
    const root_b = find_root(b);

    if (root_a === root_b) return;
    const members_a = group_members.get(root_a);
    const members_b = group_members.get(root_b);

    if (!members_a || !members_b) return;
    for (const m of members_b) {
      members_a.add(m);
      message_id_to_group.set(m, root_a);
    }
    group_members.delete(root_b);
  };

  for (const email of emails) {
    const in_reply_to = email.raw_headers["in-reply-to"]
      ?.replace(/[<>]/g, "")
      .trim();

    if (in_reply_to && message_id_to_group.has(in_reply_to)) {
      merge(email.message_id, in_reply_to);
    }

    const references = email.raw_headers["references"];

    if (references) {
      const ref_ids =
        references.match(/<[^>]+>/g)?.map((r) => r.replace(/[<>]/g, "")) || [];

      for (const ref_id of ref_ids) {
        if (message_id_to_group.has(ref_id)) {
          merge(email.message_id, ref_id);
        }
      }
    }
  }

  const subject_groups = new Map<string, string[]>();

  for (const email of emails) {
    const root = find_root(email.message_id);

    if (
      root === email.message_id &&
      (group_members.get(root)?.size ?? 0) <= 1
    ) {
      const norm = normalize_subject(email.subject);

      if (!norm) continue;
      const existing = subject_groups.get(norm);

      if (existing) {
        existing.push(email.message_id);
      } else {
        subject_groups.set(norm, [email.message_id]);
      }
    }
  }

  for (const [, ids] of subject_groups) {
    if (ids.length < 2) continue;
    for (let i = 1; i < ids.length; i++) {
      merge(ids[0], ids[i]);
    }
  }

  const token_cache = new Map<string, string>();

  for (const email of emails) {
    const root = find_root(email.message_id);
    const members = group_members.get(root);

    if (!members || members.size < 2) continue;

    let token = token_cache.get(root);

    if (!token) {
      const material = new TextEncoder().encode("astermail-thread:" + root);
      const hash = await crypto.subtle.digest("SHA-256", material);

      token = uint8_to_base64(new Uint8Array(hash));
      token_cache.set(root, token);
    }

    thread_tokens.set(email.message_id, token);
  }

  return thread_tokens;
}

export function detect_item_type(
  email: ParsedEmail,
  user_addresses: Set<string>,
): "sent" | "received" {
  const from_addr = extract_email_address(email.from).toLowerCase();

  if (user_addresses.has(from_addr)) return "sent";

  return "received";
}

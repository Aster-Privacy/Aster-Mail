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

import {
  
  
  type ParsedEmail,
  
} from "@/services/import/parser";
import {
  
  
  
  
  type ImportSource,
} from "@/services/api/email_import";
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

export function is_canonical_folder(name: string): boolean {
  const trimmed = name.trim().toLowerCase();
  const leaf = trimmed.split("/").pop() ?? trimmed;

  return CANONICAL_FOLDER_TOKENS.has(leaf);
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
    const raw = email.raw_headers["x-gmail-labels"];

    if (!raw) continue;
    for (const piece of raw.split(",")) {
      const name = piece.trim();

      if (!name) continue;
      if (is_canonical_folder(name)) continue;
      out.add(name);
    }
  }

  return Array.from(out);
}

export function folder_for_email(
  email: ParsedEmail,
  label_map: Map<string, string>,
): string | undefined {
  const raw = email.raw_headers["x-gmail-labels"];

  if (!raw) return undefined;
  for (const piece of raw.split(",")) {
    const name = piece.trim();
    const token = label_map.get(name);

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


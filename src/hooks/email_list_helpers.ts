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
  InboxEmail,
  DecryptedEnvelope,
  MailItemMetadata,
} from "@/types/email";

import { strip_html_tags } from "@/lib/html_sanitizer";
import { get_email_username } from "@/lib/utils";
import {
  list_mail_items,
  type ListMailItemsParams,
  type MailItem,
} from "@/services/api/mail";
import {
  get_passphrase_bytes,
  get_passphrase_from_memory,
  get_vault_from_memory,
} from "@/services/crypto/memory_key_store";
import { decrypt_message } from "@/services/crypto/key_manager";
import {
  decrypt_envelope_with_bytes,
  base64_to_array,
  normalize_envelope_from,
} from "@/services/crypto/envelope";
import { zero_uint8_array } from "@/services/crypto/secure_memory";
import {
  decrypt_mail_metadata,
  extract_metadata_from_server,
} from "@/services/crypto/mail_metadata";
import {
  format_email_list_timestamp,
  type FormatOptions,
} from "@/utils/date_format";
import { decrypt_body_text } from "@/utils/email_crypto";
import { get_alias_hash_by_address } from "@/hooks/use_sidebar_aliases";
import {
  resolve_sender_profiles,
  get_cached_profile,
} from "@/services/api/sender_profiles";

const HASH_ALG = ["SHA", "256"].join("-");

export const DEFAULT_PAGE_SIZE = 30;

export type MailView =
  | "inbox"
  | "sent"
  | "scheduled"
  | "starred"
  | "trash"
  | "archive"
  | "spam"
  | "snoozed"
  | "all";

export const VIEW_PARAMS: Record<MailView, Partial<ListMailItemsParams>> = {
  inbox: { item_type: "received", is_trashed: false, is_spam: false },
  sent: { item_type: "sent", is_trashed: false, is_spam: false },
  scheduled: { item_type: "scheduled", is_trashed: false, is_spam: false },
  starred: { is_starred: true, is_trashed: false, is_spam: false },
  trash: { is_trashed: true },
  archive: { is_archived: true, is_trashed: false, is_spam: false },
  spam: { is_spam: true },
  snoozed: { is_snoozed: true, is_trashed: false, is_spam: false },
  all: { item_type: "all", is_trashed: false, is_spam: false },
};

const VIEWS_EXCLUDING_TRASHED_SPAM = new Set<string>([
  "inbox",
  "sent",
  "scheduled",
  "starred",
  "archive",
  "snoozed",
  "all",
]);

function should_exclude_trashed_spam(view: string): boolean {
  return (
    VIEWS_EXCLUDING_TRASHED_SPAM.has(view) ||
    view.startsWith("folder-") ||
    view.startsWith("tag-") ||
    view.startsWith("alias-")
  );
}

function format_timestamp(date: Date, options: FormatOptions): string {
  return format_email_list_timestamp(date, options);
}

const ENVELOPE_KEY_VERSIONS = ["astermail-envelope-v1", "astermail-import-v1"];

async function try_decrypt_with_identity_key(
  encrypted: string,
  nonce_bytes: Uint8Array,
  identity_key: string,
): Promise<DecryptedEnvelope | null> {
  const encrypted_bytes = base64_to_array(encrypted);

  for (const version of ENVELOPE_KEY_VERSIONS) {
    try {
      const key_hash = await crypto.subtle.digest(
        HASH_ALG,
        new TextEncoder().encode(identity_key + version),
      );
      const crypto_key = await crypto.subtle.importKey(
        "raw",
        key_hash,
        { name: "AES-GCM", length: 256 },
        false,
        ["decrypt"],
      );
      const decrypted = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: nonce_bytes },
        crypto_key,
        encrypted_bytes,
      );

      const parsed = JSON.parse(new TextDecoder().decode(decrypted));
      const from = normalize_envelope_from(parsed.from);

      if (from) parsed.from = from;

      return parsed;
    } catch {
      continue;
    }
  }

  return null;
}

export async function decrypt_envelope(
  encrypted: string,
  nonce: string,
): Promise<DecryptedEnvelope | null> {
  const nonce_bytes = nonce ? base64_to_array(nonce) : new Uint8Array(0);

  if (nonce_bytes.length === 0) {
    try {
      const encrypted_bytes = base64_to_array(encrypted);
      const text = new TextDecoder().decode(encrypted_bytes);

      if (!text.startsWith("-----BEGIN PGP")) {
        return JSON.parse(text) as DecryptedEnvelope;
      }

      const vault = get_vault_from_memory();
      const pass = get_passphrase_from_memory();

      if (vault?.identity_key && pass) {
        const decrypted = await decrypt_message(text, vault.identity_key, pass);

        return JSON.parse(decrypted) as DecryptedEnvelope;
      }

      return null;
    } catch {
      return null;
    }
  }

  const passphrase = get_passphrase_bytes();

  if (!passphrase) return null;

  try {
    if (nonce_bytes.length === 1 && nonce_bytes[0] === 1) {
      const result = await decrypt_envelope_with_bytes<DecryptedEnvelope>(
        encrypted,
        passphrase,
      );

      zero_uint8_array(passphrase);

      return result;
    }

    zero_uint8_array(passphrase);

    const vault = get_vault_from_memory();

    if (!vault?.identity_key) return null;

    const result = await try_decrypt_with_identity_key(
      encrypted,
      nonce_bytes,
      vault.identity_key,
    );

    if (result) return result;

    if (vault.previous_keys && vault.previous_keys.length > 0) {
      for (const prev_key of vault.previous_keys) {
        const prev_result = await try_decrypt_with_identity_key(
          encrypted,
          nonce_bytes,
          prev_key,
        );

        if (prev_result) return prev_result;
      }
    }

    return null;
  } catch {
    zero_uint8_array(passphrase);

    return null;
  }
}

export function mail_to_email(
  item: MailItem,
  envelope: DecryptedEnvelope | null,
  metadata: MailItemMetadata | null,
  format_options: FormatOptions,
): InboxEmail {
  const folders = item.labels?.map((label) => ({
    folder_token: label.token,
    name: label.name,
    color: label.color,
    icon: label.icon,
  }));

  const tags = item.tag_tokens?.map((token) => ({
    id: token,
    name: "",
    color: undefined as string | undefined,
    icon: undefined as string | undefined,
  }));

  const effective_metadata = extract_metadata_from_server(metadata, {
    scheduled_at: item.scheduled_at,
    send_status: item.send_status,
    snoozed_until: item.snoozed_until,
    message_ts: item.message_ts,
    item_type: item.item_type,
  });

  if (!envelope) {
    return {
      id: item.id,
      item_type: effective_metadata.item_type as MailItem["item_type"],
      sender_name: "•••••••",
      sender_email: "",
      subject: "••••••••••••••",
      preview: "•••••••••••••••••••••••••••",
      timestamp: format_timestamp(new Date(item.created_at), format_options),
      raw_timestamp: item.created_at,
      is_pinned: effective_metadata.is_pinned,
      is_starred: effective_metadata.is_starred,
      is_selected: false,
      is_read: effective_metadata.is_read,
      is_trashed: effective_metadata.is_trashed,
      is_archived: effective_metadata.is_archived,
      is_spam: effective_metadata.is_spam,
      has_attachment: effective_metadata.has_attachments,
      category: "",
      category_color: "",
      avatar_url: "",
      is_encrypted: true,
      folders,
      tags,
      snoozed_until: effective_metadata.snoozed_until,
      encrypted_metadata: item.encrypted_metadata,
      metadata_nonce: item.metadata_nonce,
      metadata_version: item.metadata_version,
      expires_at: item.expires_at,
      expiry_type: item.expiry_type,
      send_status: effective_metadata.send_status,
      size_bytes:
        effective_metadata.size_bytes ||
        Math.ceil((item.encrypted_envelope?.length || 0) * 0.75),
    };
  }

  const recipient_addresses = envelope.to?.map((r) => r.email).filter(Boolean);

  const raw_ts = envelope.sent_at || item.created_at;

  const sender_profile = get_cached_profile(envelope.from.email);

  return {
    id: item.id,
    item_type: effective_metadata.item_type as MailItem["item_type"],
    sender_name: envelope.from.name || get_email_username(envelope.from.email),
    sender_email: envelope.from.email,
    subject: envelope.subject || "",
    preview: strip_html_tags(
      envelope.body_text || envelope.body_html || "",
    ).substring(0, 100),
    timestamp: format_timestamp(new Date(raw_ts), format_options),
    raw_timestamp: raw_ts,
    is_pinned: effective_metadata.is_pinned,
    is_starred: effective_metadata.is_starred,
    is_selected: false,
    is_read: effective_metadata.is_read,
    is_trashed: effective_metadata.is_trashed,
    is_archived: effective_metadata.is_archived,
    is_spam: effective_metadata.is_spam,
    has_attachment: effective_metadata.has_attachments,
    category: "",
    category_color: "",
    avatar_url: sender_profile?.profile_picture || "",
    is_encrypted: false,
    folders,
    tags,
    snoozed_until: effective_metadata.snoozed_until,
    thread_token: item.thread_token,
    thread_message_count: item.thread_message_count,
    encrypted_metadata: item.encrypted_metadata,
    metadata_nonce: item.metadata_nonce,
    metadata_version: item.metadata_version,
    expires_at: item.expires_at,
    expiry_type: item.expiry_type,
    recipient_addresses,
    send_status: effective_metadata.send_status,
    size_bytes:
      effective_metadata.size_bytes ||
      Math.ceil((item.encrypted_envelope?.length || 0) * 0.75),
    phishing_level: item.phishing_level,
  };
}

export function group_emails_by_thread(emails: InboxEmail[]): InboxEmail[] {
  const thread_map = new Map<string, InboxEmail>();
  const result: InboxEmail[] = [];

  for (const email of emails) {
    if (!email.thread_token) {
      result.push(email);
      continue;
    }

    const existing = thread_map.get(email.thread_token);

    if (!existing) {
      const grouped: InboxEmail = {
        ...email,
        grouped_email_ids: [email.id],
      };

      thread_map.set(email.thread_token, grouped);
      result.push(grouped);
    } else {
      existing.grouped_email_ids = [
        ...(existing.grouped_email_ids || [existing.id]),
        email.id,
      ];

      const existing_count = existing.thread_message_count ?? 1;
      const incoming_count = email.thread_message_count ?? 1;

      existing.thread_message_count = Math.max(existing_count, incoming_count);

      if (existing.is_read && !email.is_read) {
        existing.is_read = false;
      }

      if (!existing.has_attachment && email.has_attachment) {
        existing.has_attachment = true;
      }

      if (email.folders && email.folders.length > 0) {
        const existing_tokens = new Set(
          (existing.folders || []).map((f) => f.folder_token),
        );
        const merged_folders = [...(existing.folders || [])];

        for (const folder of email.folders) {
          if (!existing_tokens.has(folder.folder_token)) {
            merged_folders.push(folder);
          }
        }

        existing.folders = merged_folders;
      }

      if (email.tags && email.tags.length > 0) {
        const existing_tag_ids = new Set(
          (existing.tags || []).map((t) => t.id),
        );
        const merged_tags = [...(existing.tags || [])];

        for (const tag of email.tags) {
          if (!existing_tag_ids.has(tag.id)) {
            merged_tags.push(tag);
          }
        }

        existing.tags = merged_tags;
      }
    }
  }

  return result;
}

export async function fetch_mail_from_api(
  view: string,
  signal: AbortSignal,
  format_options: FormatOptions,
  user_email = "",
  limit = DEFAULT_PAGE_SIZE,
  cursor?: string,
  offset?: number,
  conversation_grouping = true,
): Promise<{
  emails: InboxEmail[];
  total: number;
  has_more: boolean;
  next_cursor?: string;
} | null> {
  const should_group =
    conversation_grouping &&
    (view === "inbox" || view.startsWith("folder-") || view.startsWith("tag-"));

  const params: ListMailItemsParams = {
    limit,
    ...VIEW_PARAMS[view as MailView],
    ...(offset !== undefined ? { offset } : cursor ? { cursor } : {}),
    ...(offset !== undefined ? { group_by_thread: should_group } : {}),
  };

  if (view.startsWith("folder-")) {
    params.label_token = view.replace("folder-", "");
    delete params.item_type;
  } else if (view.startsWith("tag-")) {
    params.tag_token = view.replace("tag-", "");
    delete params.item_type;
  } else if (view.startsWith("alias-")) {
    const alias_address = view.replace("alias-", "");
    const alias_hash = get_alias_hash_by_address(alias_address);

    if (alias_hash) {
      params.routing_token = alias_hash;
    }
    delete params.item_type;
  } else if (!VIEW_PARAMS[view as MailView]) {
    params.item_type = "received";
  }

  const response = await list_mail_items(params);

  if (signal.aborted || !response.data) return null;

  const items = response.data.items;
  const total = response.data.total;
  const has_more = response.data.has_more;
  const next_cursor = response.data.next_cursor;

  const results = await Promise.allSettled(
    items.map(async (item) => {
      if (signal.aborted) throw new Error("aborted");

      const has_metadata = !!(item.encrypted_metadata && item.metadata_nonce);

      const [envelope, metadata] = await Promise.all([
        decrypt_envelope(item.encrypted_envelope, item.envelope_nonce),
        has_metadata
          ? decrypt_mail_metadata(
              item.encrypted_metadata!,
              item.metadata_nonce!,
              item.metadata_version,
            )
          : Promise.resolve(null),
      ]);

      if (envelope?.body_text) {
        envelope.body_text = await decrypt_body_text(
          envelope.body_text,
          user_email,
          envelope.from?.email || "",
        );
      }

      return { item, envelope, metadata };
    }),
  );

  if (signal.aborted) return null;

  const successful = results
    .filter(
      (
        r,
      ): r is PromiseFulfilledResult<{
        item: MailItem;
        envelope: DecryptedEnvelope | null;
        metadata: MailItemMetadata | null;
      }> => r.status === "fulfilled",
    )
    .map((r) => r.value);

  const sender_emails = successful
    .map(({ envelope }) => envelope?.from?.email)
    .filter((e): e is string => !!e);

  if (sender_emails.length > 0) {
    await resolve_sender_profiles(sender_emails);
  }

  let emails = successful.map(({ item, envelope, metadata }) =>
    mail_to_email(item, envelope, metadata, format_options),
  );

  if (should_exclude_trashed_spam(view)) {
    emails = emails.filter((e) => !e.is_trashed && !e.is_spam);
  }

  const sorted_emails = emails.sort((a, b) => {
    const ts_a = a.raw_timestamp || a.timestamp;
    const ts_b = b.raw_timestamp || b.timestamp;

    return new Date(ts_b).getTime() - new Date(ts_a).getTime();
  });

  const final_emails = should_group
    ? group_emails_by_thread(sorted_emails)
    : sorted_emails;

  return { emails: final_emails, total, has_more, next_cursor };
}

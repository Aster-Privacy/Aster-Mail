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
import { list_attachments, update_attachment_meta } from "./api/attachments";
import { list_encrypted_mail_items, update_mail_item } from "./api/mail";
import {
  array_to_base64,
  base64_to_array,
  decrypt_envelope_with_bytes,
  encrypt_envelope_with_bytes,
} from "./crypto/envelope";
import { zero_uint8_array } from "./crypto/secure_memory";

export interface SentMailResealSummary {
  checked: number;
  rewritten: number;
  unreadable: number;
  failed: number;
}

export interface SentMailResealOptions {
  on_progress?: (summary: SentMailResealSummary) => void;
}

const PAGE_SIZE = 100;
const LISTING_ATTEMPTS = 3;
const META_NONCE_LENGTH = 12;

interface ListedSentItem {
  id: string;
  encrypted_envelope?: string | null;
  envelope_nonce?: string | null;
  has_attachments?: boolean;
  attachment_count?: number;
}

function is_inline_sentinel(nonce_b64: string): boolean {
  try {
    const nonce = base64_to_array(nonce_b64);

    return nonce.length === 1 && nonce[0] === 1;
  } catch {
    return false;
  }
}

async function list_sent_page(cursor: string | undefined) {
  let last_error: unknown = null;

  for (let attempt = 0; attempt < LISTING_ATTEMPTS; attempt += 1) {
    try {
      const response = await list_encrypted_mail_items({
        item_type: "sent",
        limit: PAGE_SIZE,
        cursor,
        include_reactions: true,
      });

      if (response.data) return response.data;

      last_error = new Error(response.error ?? "sent mail listing failed");
    } catch (caught) {
      last_error = caught;
    }
  }

  throw last_error ?? new Error("sent mail listing failed");
}

async function reseal_attachment_meta(
  item_id: string,
  old_bytes: Uint8Array,
  new_bytes: Uint8Array,
): Promise<boolean> {
  const response = await list_attachments(item_id);
  const attachments = response.data?.attachments;

  if (!attachments) return false;

  let all_ok = true;

  for (const attachment of attachments) {
    if (!attachment.encrypted_meta) continue;

    let meta: unknown;

    try {
      meta = await decrypt_envelope_with_bytes(
        attachment.encrypted_meta,
        old_bytes,
      );
    } catch {
      meta = null;
    }

    if (!meta) continue;

    try {
      const sealed = await encrypt_envelope_with_bytes(
        meta as object,
        new_bytes,
      );
      const result = await update_attachment_meta(attachment.id, {
        encrypted_meta: sealed.encrypted,
        meta_nonce: array_to_base64(
          crypto.getRandomValues(new Uint8Array(META_NONCE_LENGTH)),
        ),
      });

      if (result.error || !result.data) all_ok = false;
    } catch {
      all_ok = false;
    }
  }

  return all_ok;
}

async function reseal_item(
  item: ListedSentItem,
  old_bytes: Uint8Array,
  new_bytes: Uint8Array,
): Promise<"rewritten" | "skipped" | "unreadable" | "failed"> {
  if (!item.encrypted_envelope || !item.envelope_nonce) return "skipped";
  if (!is_inline_sentinel(item.envelope_nonce)) return "skipped";

  let decrypted: unknown;

  try {
    decrypted = await decrypt_envelope_with_bytes(
      item.encrypted_envelope,
      old_bytes,
    );
  } catch {
    decrypted = null;
  }

  if (!decrypted) {
    let opens_with_new: unknown;

    try {
      opens_with_new = await decrypt_envelope_with_bytes(
        item.encrypted_envelope,
        new_bytes,
      );
    } catch {
      opens_with_new = null;
    }

    return opens_with_new ? "skipped" : "unreadable";
  }

  try {
    const { encrypted, nonce } = await encrypt_envelope_with_bytes(
      decrypted as object,
      new_bytes,
    );
    const response = await update_mail_item(item.id, {
      encrypted_envelope: encrypted,
      envelope_nonce: nonce,
    });

    if (response.error || !response.data) return "failed";
  } catch {
    return "failed";
  }

  const may_have_attachments =
    item.has_attachments === true || (item.attachment_count ?? 0) > 0;

  if (may_have_attachments) {
    try {
      const meta_ok = await reseal_attachment_meta(
        item.id,
        old_bytes,
        new_bytes,
      );

      if (!meta_ok) return "failed";
    } catch {
      return "failed";
    }
  }

  return "rewritten";
}

export async function reencrypt_all_sent_mail(
  old_passphrase: string,
  new_passphrase: string,
  options: SentMailResealOptions = {},
): Promise<SentMailResealSummary> {
  const old_bytes = new TextEncoder().encode(old_passphrase);
  const new_bytes = new TextEncoder().encode(new_passphrase);
  const summary: SentMailResealSummary = {
    checked: 0,
    rewritten: 0,
    unreadable: 0,
    failed: 0,
  };

  try {
    let cursor: string | undefined;

    for (;;) {
      const page = await list_sent_page(cursor);
      const items = (page.items ?? []) as ListedSentItem[];

      if (items.length === 0) break;

      for (const item of items) {
        const outcome = await reseal_item(item, old_bytes, new_bytes);

        summary.checked += 1;

        if (outcome === "rewritten") summary.rewritten += 1;
        else if (outcome === "unreadable") summary.unreadable += 1;
        else if (outcome === "failed") summary.failed += 1;

        options.on_progress?.({ ...summary });
      }

      cursor = page.next_cursor ?? undefined;

      if (!cursor) break;
    }
  } finally {
    zero_uint8_array(old_bytes);
    zero_uint8_array(new_bytes);
  }

  return summary;
}

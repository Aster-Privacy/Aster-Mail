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
import type {} from "../key_manager";
import { api_client } from "@/services/api/client";
import type { Signature } from "@/services/api/signatures";
import type { Template } from "@/services/api/templates";
import type { BlockedSenderResponse } from "@/services/api/blocked_senders";
import type { AllowedSenderResponse } from "@/services/api/allowed_senders";
import {
  block_sender,
  bulk_unblock_senders_by_tokens,
} from "@/services/api/blocked_senders";
import {
  allow_sender,
  bulk_remove_allowed_senders_by_tokens,
} from "@/services/api/allowed_senders";
import {
  delete_all_recent_recipients,
  list_recent_recipients,
  RECENT_RECIPIENTS_MAX_LIMIT,
  save_recent_recipients,
} from "@/services/api/recent_recipients";
import { base64_to_array } from "../base64";

import { re_encrypt_collection } from "./key_helpers";
export async function re_encrypt_signatures(
  old_aes: CryptoKey,
  new_aes: CryptoKey,
): Promise<boolean> {
  const resp = await api_client.get<{ signatures: Signature[]; total: number }>(
    "/mail/v1/signatures",
  );

  if (resp.error || !resp.data) return false;

  return re_encrypt_collection(
    resp.data.signatures,
    [
      ["encrypted_name", "name_nonce"],
      ["encrypted_content", "content_nonce"],
    ],
    old_aes,
    new_aes,
    (sig, patch) => api_client.put(`/mail/v1/signatures/${sig.id}`, patch),
  );
}

export async function re_encrypt_templates(
  old_aes: CryptoKey,
  new_aes: CryptoKey,
): Promise<boolean> {
  const resp = await api_client.get<{ templates: Template[]; total: number }>(
    "/mail/v1/templates",
  );

  if (resp.error || !resp.data) return false;

  return re_encrypt_collection(
    resp.data.templates,
    [
      ["encrypted_name", "name_nonce"],
      ["encrypted_category", "category_nonce"],
      ["encrypted_content", "content_nonce"],
    ],
    old_aes,
    new_aes,
    (t, patch) => api_client.put(`/mail/v1/templates/${t.id}`, patch),
  );
}

export async function re_encrypt_blocked_senders(
  old_aes: CryptoKey,
): Promise<boolean> {
  const resp = await api_client.get<{
    blocked_senders: BlockedSenderResponse[];
    total: number;
  }>("/contacts/v1/blocked_senders");

  if (resp.error || !resp.data) return false;

  if (resp.data.blocked_senders.length === 0) return true;

  const decrypted: Array<{
    email: string;
    name?: string;
    action: string;
    is_domain: boolean;
  }> = [];

  let ok = true;

  for (const item of resp.data.blocked_senders) {
    try {
      const ct = base64_to_array(item.encrypted_sender_data);
      const iv = base64_to_array(item.sender_data_nonce);
      const pt = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv },
        old_aes,
        ct,
      );
      const parsed = JSON.parse(new TextDecoder().decode(pt));

      decrypted.push({
        email: parsed.email,
        name: parsed.name,
        action: item.action,
        is_domain: item.is_domain,
      });
    } catch {
      ok = false;
      continue;
    }
  }

  if (decrypted.length === 0) return ok;

  const old_tokens = resp.data.blocked_senders.map((b) => b.sender_token);

  const unblocked = await bulk_unblock_senders_by_tokens(old_tokens).catch(
    () => ({ error: "failed to clear blocked senders" }),
  );

  if (unblocked.error) ok = false;

  for (const item of decrypted) {
    const blocked = await block_sender(
      item.email,
      item.name,
      item.action as "spam" | "delete",
      item.is_domain,
    ).catch(() => ({ error: "failed to block sender" }));

    if (blocked.error) ok = false;
  }

  return ok;
}

const ALLOWED_SENDERS_PAGE_SIZE = 500;

async function list_all_allowed_senders(): Promise<
  AllowedSenderResponse[] | null
> {
  const items: AllowedSenderResponse[] = [];

  for (let offset = 0; ; offset += ALLOWED_SENDERS_PAGE_SIZE) {
    const resp = await api_client.get<{
      allowed_senders: AllowedSenderResponse[];
      total: number;
    }>(
      `/contacts/v1/allowed_senders?limit=${ALLOWED_SENDERS_PAGE_SIZE}&offset=${offset}`,
    );

    if (resp.error || !resp.data) return null;

    items.push(...resp.data.allowed_senders);

    if (resp.data.allowed_senders.length < ALLOWED_SENDERS_PAGE_SIZE) {
      return items;
    }

    if (items.length >= resp.data.total) return items;
  }
}

export async function re_encrypt_allowed_senders(
  old_aes: CryptoKey,
): Promise<boolean> {
  const all_allowed = await list_all_allowed_senders();

  if (all_allowed === null) return false;

  if (all_allowed.length === 0) return true;

  const decrypted: Array<{
    email: string;
    name?: string;
    is_domain: boolean;
  }> = [];

  let ok = true;

  for (const item of all_allowed) {
    try {
      const ct = base64_to_array(item.encrypted_sender_data);
      const iv = base64_to_array(item.sender_data_nonce);
      const pt = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv },
        old_aes,
        ct,
      );
      const parsed = JSON.parse(new TextDecoder().decode(pt));

      decrypted.push({
        email: parsed.email,
        name: parsed.name,
        is_domain: item.is_domain,
      });
    } catch {
      ok = false;
      continue;
    }
  }

  if (decrypted.length === 0) return ok;

  const old_tokens = all_allowed.map((a) => a.sender_token);

  const removed = await bulk_remove_allowed_senders_by_tokens(old_tokens).catch(
    () => ({ error: "failed to clear allowed senders" }),
  );

  if (removed.error) ok = false;

  for (const item of decrypted) {
    const allowed = await allow_sender(
      item.email,
      item.name,
      item.is_domain,
    ).catch(() => ({ error: "failed to allow sender" }));

    if (allowed.error) ok = false;
  }

  return ok;
}

export async function re_encrypt_recent_recipients(
  old_aes: CryptoKey,
): Promise<boolean> {
  const resp = await list_recent_recipients(RECENT_RECIPIENTS_MAX_LIMIT);

  if (resp.error || !resp.data) return false;

  if (resp.data.items.length === 0) return true;

  const emails: string[] = [];

  let ok = true;

  for (const r of resp.data.items) {
    try {
      const ct = base64_to_array(r.encrypted_email);
      const iv = base64_to_array(r.email_nonce);
      const pt = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv },
        old_aes,
        ct,
      );

      emails.push(new TextDecoder().decode(pt));
    } catch {
      ok = false;
      continue;
    }
  }

  if (emails.length === 0) return ok;

  const cleared = await delete_all_recent_recipients().catch(() => ({
    error: "failed to clear recent recipients",
  }));

  if (cleared.error) ok = false;

  const saved = await save_recent_recipients(emails).catch(() => ({
    error: "failed to save recent recipients",
  }));

  if (saved.error) ok = false;

  return ok;
}

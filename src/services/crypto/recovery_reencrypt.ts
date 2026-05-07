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
import type { EncryptedVault } from "./key_manager";
import { derive_encryption_key_from_passphrase } from "./memory_key_store";
import { zero_uint8_array } from "./secure_memory";
import { append_legacy_key_raw_bytes } from "./legacy_keks";
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
  save_recent_recipients,
} from "@/services/api/recent_recipients";
import {
  derive_preferences_key_raw,
  prepare_preferences_payload,
} from "@/services/api/preferences";
import { list_aliases } from "@/services/api/aliases";
import { list_contacts } from "@/services/api/contacts";
import { rekey_user_data } from "@/services/api/auth";
import {
  list_encrypted_mail_items,
  update_mail_item,
} from "@/services/api/mail";
import { derive_metadata_key } from "@/services/crypto/envelope";
import { list_tags, update_tag } from "@/services/api/tags";

const HASH_ALG = ["SHA", "256"].join("-");
const PENDING_KEY = "aster_pending_reencryption";

interface PendingReencryptData {
  old_data_kek: string;
  old_identity_key: string;
}

function array_to_b64(a: Uint8Array): string {
  let b = "";

  for (let i = 0; i < a.length; i++) b += String.fromCharCode(a[i]);

  return btoa(b);
}

function b64_to_array(b64: string): Uint8Array {
  const b = atob(b64);
  const a = new Uint8Array(b.length);

  for (let i = 0; i < b.length; i++) a[i] = b.charCodeAt(i);

  return a;
}

export function store_pending_reencryption(
  data: PendingReencryptData,
): void {
  try {
    sessionStorage.setItem(PENDING_KEY, JSON.stringify(data));
  } catch {}
}

export function clear_pending_reencryption(): void {
  try {
    sessionStorage.removeItem(PENDING_KEY);
  } catch {}
}

function get_pending(): PendingReencryptData | null {
  try {
    const raw = sessionStorage.getItem(PENDING_KEY);

    if (!raw) return null;

    return JSON.parse(raw) as PendingReencryptData;
  } catch {
    return null;
  }
}

async function import_aes_key(
  raw: Uint8Array,
  usages: KeyUsage[],
): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    raw,
    { name: "AES-GCM", length: 256 },
    false,
    usages,
  );
}

async function derive_hmac_key(
  raw: Uint8Array,
  info: string,
): Promise<CryptoKey> {
  const info_bytes = new TextEncoder().encode(info);
  const combined = new Uint8Array(raw.byteLength + info_bytes.length);

  combined.set(raw, 0);
  combined.set(info_bytes, raw.byteLength);

  const hash = await crypto.subtle.digest(HASH_ALG, combined);

  return crypto.subtle.importKey(
    "raw",
    hash,
    { name: "HMAC", hash: HASH_ALG },
    false,
    ["sign"],
  );
}

async function re_encrypt_field(
  enc_b64: string,
  nonce_b64: string,
  old_key: CryptoKey,
  new_key: CryptoKey,
): Promise<{ encrypted: string; nonce: string }> {
  const ct = b64_to_array(enc_b64);
  const iv = b64_to_array(nonce_b64);
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, old_key, ct);
  const new_iv = crypto.getRandomValues(new Uint8Array(12));
  const new_ct = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: new_iv },
    new_key,
    pt,
  );

  return {
    encrypted: array_to_b64(new Uint8Array(new_ct)),
    nonce: array_to_b64(new_iv),
  };
}

async function re_encrypt_signatures(
  old_aes: CryptoKey,
  new_aes: CryptoKey,
): Promise<void> {
  const resp = await api_client.get<{ signatures: Signature[]; total: number }>(
    "/mail/v1/signatures",
  );

  if (resp.error || !resp.data) return;

  for (const sig of resp.data.signatures) {
    try {
      const [name, content] = await Promise.all([
        re_encrypt_field(sig.encrypted_name, sig.name_nonce, old_aes, new_aes),
        re_encrypt_field(
          sig.encrypted_content,
          sig.content_nonce,
          old_aes,
          new_aes,
        ),
      ]);

      await api_client.put(`/mail/v1/signatures/${sig.id}`, {
        encrypted_name: name.encrypted,
        name_nonce: name.nonce,
        encrypted_content: content.encrypted,
        content_nonce: content.nonce,
      });
    } catch {
      continue;
    }
  }
}

async function re_encrypt_templates(
  old_aes: CryptoKey,
  new_aes: CryptoKey,
): Promise<void> {
  const resp = await api_client.get<{ templates: Template[]; total: number }>(
    "/mail/v1/templates",
  );

  if (resp.error || !resp.data) return;

  for (const t of resp.data.templates) {
    try {
      const [name, category, content] = await Promise.all([
        re_encrypt_field(t.encrypted_name, t.name_nonce, old_aes, new_aes),
        re_encrypt_field(
          t.encrypted_category,
          t.category_nonce,
          old_aes,
          new_aes,
        ),
        re_encrypt_field(
          t.encrypted_content,
          t.content_nonce,
          old_aes,
          new_aes,
        ),
      ]);

      await api_client.put(`/mail/v1/templates/${t.id}`, {
        encrypted_name: name.encrypted,
        name_nonce: name.nonce,
        encrypted_category: category.encrypted,
        category_nonce: category.nonce,
        encrypted_content: content.encrypted,
        content_nonce: content.nonce,
      });
    } catch {
      continue;
    }
  }
}

async function re_encrypt_blocked_senders(old_aes: CryptoKey): Promise<void> {
  const resp = await api_client.get<{
    blocked_senders: BlockedSenderResponse[];
    total: number;
  }>("/contacts/v1/blocked_senders");

  if (resp.error || !resp.data || resp.data.blocked_senders.length === 0)
    return;

  const decrypted: Array<{
    email: string;
    name?: string;
    action: string;
    is_domain: boolean;
  }> = [];

  for (const item of resp.data.blocked_senders) {
    try {
      const ct = b64_to_array(item.encrypted_sender_data);
      const iv = b64_to_array(item.sender_data_nonce);
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
      continue;
    }
  }

  if (decrypted.length === 0) return;

  const old_tokens = resp.data.blocked_senders.map((b) => b.sender_token);

  await bulk_unblock_senders_by_tokens(old_tokens).catch(() => {});

  for (const item of decrypted) {
    await block_sender(
      item.email,
      item.name,
      item.action as "spam" | "delete",
      item.is_domain,
    ).catch(() => {});
  }
}

async function re_encrypt_allowed_senders(old_aes: CryptoKey): Promise<void> {
  const resp = await api_client.get<{
    allowed_senders: AllowedSenderResponse[];
    total: number;
  }>("/contacts/v1/allowed_senders?limit=500&offset=0");

  if (resp.error || !resp.data || resp.data.allowed_senders.length === 0)
    return;

  const decrypted: Array<{
    email: string;
    name?: string;
    is_domain: boolean;
  }> = [];

  for (const item of resp.data.allowed_senders) {
    try {
      const ct = b64_to_array(item.encrypted_sender_data);
      const iv = b64_to_array(item.sender_data_nonce);
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
      continue;
    }
  }

  if (decrypted.length === 0) return;

  const old_tokens = resp.data.allowed_senders.map((a) => a.sender_token);

  await bulk_remove_allowed_senders_by_tokens(old_tokens).catch(() => {});

  for (const item of decrypted) {
    await allow_sender(item.email, item.name, item.is_domain).catch(() => {});
  }
}

async function re_encrypt_recent_recipients(
  old_aes: CryptoKey,
): Promise<void> {
  const resp = await list_recent_recipients();

  if (resp.error || !resp.data || resp.data.items.length === 0) return;

  const emails: string[] = [];

  for (const r of resp.data.items) {
    try {
      const ct = b64_to_array(r.encrypted_email);
      const iv = b64_to_array(r.email_nonce);
      const pt = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv },
        old_aes,
        ct,
      );

      emails.push(new TextDecoder().decode(pt));
    } catch {
      continue;
    }
  }

  if (emails.length === 0) return;

  await delete_all_recent_recipients().catch(() => {});
  await save_recent_recipients(emails).catch(() => {});
}

interface ReEncryptedAlias {
  id: string;
  encrypted_local_part: string;
  local_part_nonce: string;
  encrypted_display_name?: string;
  display_name_nonce?: string;
  alias_address_hash: string;
}

interface ReEncryptedContact {
  id: string;
  encrypted_data: string;
  data_nonce: string;
  contact_token: string;
}

async function re_encrypt_aliases_contacts(
  old_raw: Uint8Array,
  new_raw: Uint8Array,
): Promise<void> {
  const [old_aes, new_aes, new_alias_hmac, new_contacts_hmac] =
    await Promise.all([
      import_aes_key(old_raw, ["decrypt"]),
      import_aes_key(new_raw, ["encrypt"]),
      derive_hmac_key(new_raw, "astermail-alias-hmac-v1"),
      derive_hmac_key(new_raw, "contacts-hmac-v2"),
    ]);

  const re_encrypted_aliases: ReEncryptedAlias[] = [];
  let alias_offset = 0;

  while (true) {
    const resp = await list_aliases({ limit: 100, offset: alias_offset });

    if (resp.error || !resp.data) break;

    for (const alias of resp.data.aliases) {
      if (alias.is_random) continue;

      try {
        const lp_ct = b64_to_array(alias.encrypted_local_part);
        const lp_iv = b64_to_array(alias.local_part_nonce);
        const lp_pt = await crypto.subtle.decrypt(
          { name: "AES-GCM", iv: lp_iv },
          old_aes,
          lp_ct,
        );
        const local_part = new TextDecoder().decode(lp_pt);

        const new_lp_iv = crypto.getRandomValues(new Uint8Array(12));
        const new_lp_ct = await crypto.subtle.encrypt(
          { name: "AES-GCM", iv: new_lp_iv },
          new_aes,
          lp_pt,
        );

        const full_address = `${local_part.toLowerCase()}@${alias.domain}`;
        const addr_sig = await crypto.subtle.sign(
          "HMAC",
          new_alias_hmac,
          new TextEncoder().encode(full_address),
        );

        const entry: ReEncryptedAlias = {
          id: alias.id,
          encrypted_local_part: array_to_b64(new Uint8Array(new_lp_ct)),
          local_part_nonce: array_to_b64(new_lp_iv),
          alias_address_hash: array_to_b64(new Uint8Array(addr_sig)),
        };

        if (alias.encrypted_display_name && alias.display_name_nonce) {
          const { encrypted, nonce } = await re_encrypt_field(
            alias.encrypted_display_name,
            alias.display_name_nonce,
            old_aes,
            new_aes,
          );

          entry.encrypted_display_name = encrypted;
          entry.display_name_nonce = nonce;
        }

        re_encrypted_aliases.push(entry);
      } catch {
        continue;
      }
    }

    if (!resp.data.has_more) break;

    alias_offset += resp.data.aliases.length;
  }

  const re_encrypted_contacts: ReEncryptedContact[] = [];
  let contact_cursor: string | undefined;

  while (true) {
    const params: { limit: number; cursor?: string } = { limit: 100 };

    if (contact_cursor) params.cursor = contact_cursor;

    const resp = await list_contacts(params);

    if (resp.error || !resp.data) break;

    for (const contact of resp.data.items) {
      try {
        const ct = b64_to_array(contact.encrypted_data);
        const iv = b64_to_array(contact.data_nonce);
        const pt = await crypto.subtle.decrypt(
          { name: "AES-GCM", iv },
          old_aes,
          ct,
        );

        const new_ct_iv = crypto.getRandomValues(new Uint8Array(12));
        const new_ct = await crypto.subtle.encrypt(
          { name: "AES-GCM", iv: new_ct_iv },
          new_aes,
          pt,
        );

        const parsed = JSON.parse(new TextDecoder().decode(pt));
        const first_name: string = parsed.first_name ?? "";
        const last_name: string = parsed.last_name ?? "";
        const emails: string[] = Array.isArray(parsed.emails)
          ? parsed.emails
          : [];
        const searchable =
          `${first_name} ${last_name} ${emails.join(" ")}`.toLowerCase();
        const token_sig = await crypto.subtle.sign(
          "HMAC",
          new_contacts_hmac,
          new TextEncoder().encode(searchable),
        );

        re_encrypted_contacts.push({
          id: contact.id,
          encrypted_data: array_to_b64(new Uint8Array(new_ct)),
          data_nonce: array_to_b64(new_ct_iv),
          contact_token: array_to_b64(new Uint8Array(token_sig)),
        });
      } catch {
        continue;
      }
    }

    if (!resp.data.has_more || !resp.data.next_cursor) break;

    contact_cursor = resp.data.next_cursor;
  }

  if (re_encrypted_aliases.length > 0 || re_encrypted_contacts.length > 0) {
    await rekey_user_data({
      re_encrypted_aliases,
      re_encrypted_contacts,
    }).catch(() => {});
  }
}

async function derive_folder_aes_key(
  identity_key: string,
  usages: KeyUsage[],
): Promise<CryptoKey> {
  const material = new TextEncoder().encode(identity_key + "astermail-labels-v1");
  const hash = await crypto.subtle.digest(HASH_ALG, material);

  return crypto.subtle.importKey(
    "raw",
    hash,
    { name: "AES-GCM", length: 256 },
    false,
    usages,
  );
}

async function re_encrypt_folders(
  old_identity_key: string,
  new_identity_key: string,
): Promise<void> {
  if (old_identity_key === new_identity_key) return;

  const [old_key, new_key] = await Promise.all([
    derive_folder_aes_key(old_identity_key, ["decrypt"]),
    derive_folder_aes_key(new_identity_key, ["encrypt"]),
  ]);

  let offset = 0;

  while (true) {
    const resp = await api_client.get<{
      labels: Array<{
        id: string;
        encrypted_name: string;
        name_nonce: string;
        encrypted_color?: string;
        color_nonce?: string;
        encrypted_icon?: string;
        icon_nonce?: string;
      }>;
      total: number;
      has_more: boolean;
    }>(`/mail/v1/labels?limit=100&offset=${offset}`);

    if (resp.error || !resp.data) break;

    for (const folder of resp.data.labels) {
      try {
        const updates: Record<string, string> = {};
        const name = await re_encrypt_field(
          folder.encrypted_name,
          folder.name_nonce,
          old_key,
          new_key,
        );

        updates.encrypted_name = name.encrypted;
        updates.name_nonce = name.nonce;

        if (folder.encrypted_color && folder.color_nonce) {
          const color = await re_encrypt_field(
            folder.encrypted_color,
            folder.color_nonce,
            old_key,
            new_key,
          );

          updates.encrypted_color = color.encrypted;
          updates.color_nonce = color.nonce;
        }

        if (folder.encrypted_icon && folder.icon_nonce) {
          const icon = await re_encrypt_field(
            folder.encrypted_icon,
            folder.icon_nonce,
            old_key,
            new_key,
          );

          updates.encrypted_icon = icon.encrypted;
          updates.icon_nonce = icon.nonce;
        }

        await api_client.put(`/mail/v1/labels/${folder.id}`, updates);
      } catch {
        continue;
      }
    }

    if (!resp.data.has_more) break;

    offset += resp.data.labels.length;
  }
}

async function re_encrypt_preferences(
  old_identity_key: string,
  new_identity_key: string,
  vault: EncryptedVault,
): Promise<void> {
  const resp = await api_client.get<{
    encrypted_preferences: string | null;
    preferences_nonce: string | null;
  }>("/settings/v1/preferences");

  if (resp.error || !resp.data) return;

  const { encrypted_preferences, preferences_nonce } = resp.data;

  if (!encrypted_preferences || !preferences_nonce) return;

  try {
    const old_key_raw = await derive_preferences_key_raw(old_identity_key);
    const old_key = await crypto.subtle.importKey(
      "raw",
      old_key_raw,
      { name: "AES-GCM", length: 256 },
      false,
      ["decrypt"],
    );

    const enc_data = Uint8Array.from(atob(encrypted_preferences), (c) =>
      c.charCodeAt(0),
    );
    const nonce_data = Uint8Array.from(atob(preferences_nonce), (c) =>
      c.charCodeAt(0),
    );

    let pt: ArrayBuffer;

    try {
      pt = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: nonce_data },
        old_key,
        enc_data,
      );
    } catch {
      if (old_identity_key === new_identity_key) return;
      const current_key_raw = await derive_preferences_key_raw(new_identity_key);
      const current_key = await crypto.subtle.importKey(
        "raw",
        current_key_raw,
        { name: "AES-GCM", length: 256 },
        false,
        ["decrypt"],
      );

      try {
        pt = await crypto.subtle.decrypt(
          { name: "AES-GCM", iv: nonce_data },
          current_key,
          enc_data,
        );
      } catch {
        return;
      }
    }

    const preferences = JSON.parse(new TextDecoder().decode(pt));
    const new_vault = { ...vault, identity_key: new_identity_key };
    const payload = await prepare_preferences_payload(preferences, new_vault);

    if (!payload) return;

    await api_client.put("/settings/v1/preferences", {
      encrypted_preferences: payload.encrypted,
      preferences_nonce: payload.nonce,
    });
  } catch {
    return;
  }
}

export async function reencrypt_settings_password_change(
  current_password: string,
  new_password: string,
  old_identity_key: string,
  new_identity_key: string,
): Promise<void> {
  let old_raw: Uint8Array | null = null;
  let new_raw: Uint8Array | null = null;

  try {
    const old_bytes = new TextEncoder().encode(current_password);
    const new_bytes = new TextEncoder().encode(new_password);

    [old_raw, new_raw] = await Promise.all([
      derive_encryption_key_from_passphrase(old_bytes),
      derive_encryption_key_from_passphrase(new_bytes),
    ]);

    zero_uint8_array(old_bytes);
    zero_uint8_array(new_bytes);

    const old_aes = await import_aes_key(old_raw, ["decrypt"]);
    const new_aes = await import_aes_key(new_raw, ["encrypt"]);

    await re_encrypt_signatures(old_aes, new_aes);
    await re_encrypt_templates(old_aes, new_aes);
    await re_encrypt_blocked_senders(old_aes);
    await re_encrypt_allowed_senders(old_aes);
    await re_encrypt_recent_recipients(old_aes);
    await re_encrypt_folders(old_identity_key, new_identity_key);
  } catch {
    /* silently fail - legacy_keks fallback keeps data readable */
  } finally {
    if (old_raw) zero_uint8_array(old_raw);
    if (new_raw) zero_uint8_array(new_raw);
  }
}

async function re_encrypt_mail_metadata(
  old_master_key: Uint8Array,
  new_master_key: Uint8Array,
): Promise<void> {
  const METADATA_CONTEXT = "mail-item-metadata";

  const [old_key, new_key] = await Promise.all([
    derive_metadata_key(old_master_key, METADATA_CONTEXT),
    derive_metadata_key(new_master_key, METADATA_CONTEXT),
  ]);

  for (const item_type of ["sent", "draft"] as const) {
    let cursor: string | undefined;

    while (true) {
      const resp = await list_encrypted_mail_items({
        item_type,
        limit: 100,
        cursor,
      });

      if (resp.error || !resp.data) break;

      for (const item of resp.data.items) {
        if (!item.encrypted_metadata || !item.metadata_nonce) continue;

        try {
          const ct = b64_to_array(item.encrypted_metadata);
          const iv = b64_to_array(item.metadata_nonce);
          const pt = await crypto.subtle.decrypt(
            { name: "AES-GCM", iv },
            old_key,
            ct,
          );
          const new_iv = crypto.getRandomValues(new Uint8Array(12));
          const new_ct = await crypto.subtle.encrypt(
            { name: "AES-GCM", iv: new_iv },
            new_key,
            pt,
          );

          await update_mail_item(item.id, {
            encrypted_metadata: array_to_b64(new Uint8Array(new_ct)),
            metadata_nonce: array_to_b64(new_iv),
          });
        } catch {
          continue;
        }
      }

      cursor = resp.data.next_cursor ?? undefined;

      if (!resp.data.has_more || !cursor) break;
    }
  }
}

async function derive_tag_aes_key(
  identity_key: string,
  usages: KeyUsage[],
): Promise<CryptoKey> {
  const material = new TextEncoder().encode(identity_key + "astermail-tags-v1");
  const hash = await crypto.subtle.digest(HASH_ALG, material);

  return crypto.subtle.importKey(
    "raw",
    hash,
    { name: "AES-GCM", length: 256 },
    false,
    usages,
  );
}

async function re_encrypt_tags(
  old_identity_key: string,
  new_identity_key: string,
): Promise<void> {
  if (old_identity_key === new_identity_key) return;

  const [old_key, new_key] = await Promise.all([
    derive_tag_aes_key(old_identity_key, ["decrypt"]),
    derive_tag_aes_key(new_identity_key, ["encrypt"]),
  ]);

  let offset = 0;

  while (true) {
    const resp = await list_tags({ limit: 100, offset });

    if (resp.error || !resp.data) break;

    for (const tag of resp.data.tags) {
      try {
        const updates: Record<string, string> = {};
        const name = await re_encrypt_field(
          tag.encrypted_name,
          tag.name_nonce,
          old_key,
          new_key,
        );

        updates.encrypted_name = name.encrypted;
        updates.name_nonce = name.nonce;

        if (tag.encrypted_color && tag.color_nonce) {
          const color = await re_encrypt_field(
            tag.encrypted_color,
            tag.color_nonce,
            old_key,
            new_key,
          );

          updates.encrypted_color = color.encrypted;
          updates.color_nonce = color.nonce;
        }

        if (tag.encrypted_icon && tag.icon_nonce) {
          const icon = await re_encrypt_field(
            tag.encrypted_icon,
            tag.icon_nonce,
            old_key,
            new_key,
          );

          updates.encrypted_icon = icon.encrypted;
          updates.icon_nonce = icon.nonce;
        }

        await update_tag(tag.id, updates);
      } catch {
        continue;
      }
    }

    if (!resp.data.has_more) break;

    offset += resp.data.tags.length;
  }
}

async function derive_profile_notes_hmac_key(
  raw: Uint8Array,
): Promise<CryptoKey> {
  const info = new TextEncoder().encode("profile-notes-hmac-v1");
  const combined = new Uint8Array(raw.byteLength + info.length);

  combined.set(raw, 0);
  combined.set(info, raw.byteLength);

  const hash = await crypto.subtle.digest(HASH_ALG, combined);

  return crypto.subtle.importKey(
    "raw",
    hash,
    { name: "HMAC", hash: HASH_ALG },
    false,
    ["sign"],
  );
}

async function re_encrypt_profile_notes(
  old_raw: Uint8Array,
  new_raw: Uint8Array,
): Promise<void> {
  const resp = await api_client.get<{
    notes: Array<{
      id: string;
      email_token: string;
      encrypted_note: string;
      note_nonce: string;
      integrity_hash: string;
    }>;
    total: number;
  }>("/settings/v1/profile_notes/all");

  if (resp.error || !resp.data || resp.data.notes.length === 0) return;

  const old_aes = await import_aes_key(old_raw, ["decrypt"]);
  const new_aes = await import_aes_key(new_raw, ["encrypt"]);
  const new_hmac = await derive_profile_notes_hmac_key(new_raw);

  for (const note of resp.data.notes) {
    try {
      const ct = b64_to_array(note.encrypted_note);
      const iv = b64_to_array(note.note_nonce);
      const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, old_aes, ct);

      const new_iv = crypto.getRandomValues(new Uint8Array(12));
      const new_ct = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv: new_iv },
        new_aes,
        pt,
      );

      const new_encrypted_note = array_to_b64(new Uint8Array(new_ct));
      const new_note_nonce = array_to_b64(new_iv);

      const integrity_input = new TextEncoder().encode(
        `${new_encrypted_note}:${new_note_nonce}:profile-notes-v1`,
      );
      const new_integrity_sig = await crypto.subtle.sign(
        "HMAC",
        new_hmac,
        integrity_input,
      );
      const new_integrity_hash = array_to_b64(new Uint8Array(new_integrity_sig));

      await api_client.put("/settings/v1/profile_notes", {
        email_token: note.email_token,
        encrypted_note: new_encrypted_note,
        note_nonce: new_note_nonce,
        integrity_hash: new_integrity_hash,
      });
    } catch {
      continue;
    }
  }
}

export async function check_and_run_recovery_reencryption(
  vault: EncryptedVault,
  passphrase: string,
): Promise<void> {
  const pending = get_pending();

  if (!pending || !pending.old_data_kek) return;

  clear_pending_reencryption();

  const [old_folder_hash_buf, old_tag_hash_buf] = await Promise.all([
    crypto.subtle.digest(
      HASH_ALG,
      new TextEncoder().encode(pending.old_identity_key + "astermail-labels-v1"),
    ),
    crypto.subtle.digest(
      HASH_ALG,
      new TextEncoder().encode(pending.old_identity_key + "astermail-tags-v1"),
    ),
  ]);

  const old_folder_hash = new Uint8Array(old_folder_hash_buf);
  const old_tag_hash = new Uint8Array(old_tag_hash_buf);

  await Promise.all([
    append_legacy_key_raw_bytes(old_folder_hash),
    append_legacy_key_raw_bytes(old_tag_hash),
  ]);

  zero_uint8_array(old_folder_hash);
  zero_uint8_array(old_tag_hash);

  let old_raw: Uint8Array | null = null;
  let new_raw: Uint8Array | null = null;

  try {
    old_raw = b64_to_array(pending.old_data_kek);
    const passphrase_bytes = new TextEncoder().encode(passphrase);

    new_raw = await derive_encryption_key_from_passphrase(passphrase_bytes);
    zero_uint8_array(passphrase_bytes);

    const old_aes = await import_aes_key(old_raw, ["decrypt"]);
    const new_aes = await import_aes_key(new_raw, ["encrypt"]);

    await re_encrypt_signatures(old_aes, new_aes);
    await re_encrypt_templates(old_aes, new_aes);
    await re_encrypt_aliases_contacts(old_raw, new_raw);
    await re_encrypt_blocked_senders(old_aes);
    await re_encrypt_allowed_senders(old_aes);
    await re_encrypt_recent_recipients(old_aes);
    await re_encrypt_mail_metadata(old_raw, new_raw);
    await re_encrypt_tags(pending.old_identity_key, vault.identity_key);
    await re_encrypt_profile_notes(old_raw, new_raw);
    await re_encrypt_folders(pending.old_identity_key, vault.identity_key);
    await re_encrypt_preferences(
      pending.old_identity_key,
      vault.identity_key,
      vault,
    );
  } catch {
    /* silently fail - data will need to be re-entered */
  } finally {
    if (old_raw) zero_uint8_array(old_raw);
    if (new_raw) zero_uint8_array(new_raw);
  }
}

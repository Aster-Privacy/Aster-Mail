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
import { HASH_ALG } from "@/services/crypto/constants";
import type { } from "../key_manager";
import { api_client } from "@/services/api/client";
import type { } from "@/services/api/signatures";
import type { } from "@/services/api/templates";
import type { } from "@/services/api/blocked_senders";
import type { } from "@/services/api/allowed_senders";
import { list_contacts } from "@/services/api/contacts";
import { array_to_base64, base64_to_array } from "../base64";


import { must_succeed, re_encrypt_field } from "./key_helpers";

export async function re_encrypt_contact_field_values(
  old_aes: CryptoKey,
  new_aes: CryptoKey,
): Promise<boolean> {
  let cursor: string | undefined;
  let ok = true;

  while (true) {
    const contacts_resp = await list_contacts(
      cursor ? { limit: 100, cursor } : { limit: 100 },
    );

    if (contacts_resp.error || !contacts_resp.data) return false;

    for (const contact of contacts_resp.data.items) {
      try {
        const fv_resp = await api_client.get<{
          items: Array<{
            id: string;
            field_definition_id: string;
            encrypted_value: string;
            value_nonce: string;
          }>;
        }>(`/contacts/v1/${contact.id}/fields`);

        if (fv_resp.error || !fv_resp.data) {
          ok = false;
          continue;
        }

        for (const fv of fv_resp.data.items) {
          try {
            const { encrypted, nonce } = await re_encrypt_field(
              fv.encrypted_value,
              fv.value_nonce,
              old_aes,
              new_aes,
            );
            await must_succeed(
              api_client.put(
                `/contacts/v1/${contact.id}/fields/${fv.field_definition_id}`,
                { encrypted_value: encrypted, value_nonce: nonce },
              ),
            );
          } catch {
            ok = false;
            continue;
          }
        }
      } catch {
        ok = false;
        continue;
      }
    }

    if (!contacts_resp.data.has_more || !contacts_resp.data.next_cursor) break;

    cursor = contacts_resp.data.next_cursor;
  }

  return ok;
}

export async function re_encrypt_contact_photos(
  old_aes: CryptoKey,
  new_aes: CryptoKey,
): Promise<boolean> {
  let cursor: string | undefined;
  let ok = true;

  while (true) {
    const contacts_resp = await list_contacts(
      cursor ? { limit: 100, cursor } : { limit: 100 },
    );

    if (contacts_resp.error || !contacts_resp.data) return false;

    for (const contact of contacts_resp.data.items) {
      try {
        const photo_resp = await api_client.get<{
          id: string;
          encrypted_data: string;
          data_nonce: string;
          encrypted_meta: string;
          meta_nonce: string;
          size_bytes: number;
        }>(`/contacts/v1/${contact.id}/photo`);

        if (photo_resp.error || !photo_resp.data) continue;

        const photo = photo_resp.data;
        const [data_result, meta_result] = await Promise.all([
          re_encrypt_field(photo.encrypted_data, photo.data_nonce, old_aes, new_aes),
          re_encrypt_field(photo.encrypted_meta, photo.meta_nonce, old_aes, new_aes),
        ]);

        await must_succeed(
          api_client.delete(`/contacts/v1/${contact.id}/photo`),
        );
        try {
          await must_succeed(
            api_client.post(`/contacts/v1/${contact.id}/photo`, {
              encrypted_data: data_result.encrypted,
              data_nonce: data_result.nonce,
              encrypted_meta: meta_result.encrypted,
              meta_nonce: meta_result.nonce,
              size_bytes: photo.size_bytes,
            }),
          );
        } catch (post_err) {
          await api_client.post(`/contacts/v1/${contact.id}/photo`, {
            encrypted_data: photo.encrypted_data,
            data_nonce: photo.data_nonce,
            encrypted_meta: photo.encrypted_meta,
            meta_nonce: photo.meta_nonce,
            size_bytes: photo.size_bytes,
          });

          throw post_err;
        }
      } catch {
        ok = false;
        continue;
      }
    }

    if (!contacts_resp.data.has_more || !contacts_resp.data.next_cursor) break;

    cursor = contacts_resp.data.next_cursor;
  }

  return ok;
}

export async function re_encrypt_contact_attachments(
  old_aes: CryptoKey,
  new_aes: CryptoKey,
): Promise<boolean> {
  let cursor: string | undefined;
  let ok = true;

  while (true) {
    const contacts_resp = await list_contacts(
      cursor ? { limit: 100, cursor } : { limit: 100 },
    );

    if (contacts_resp.error || !contacts_resp.data) return false;

    for (const contact of contacts_resp.data.items) {
      try {
        const list_resp = await api_client.get<{
          items: Array<{ id: string; size_bytes: number }>;
          total: number;
        }>(`/contacts/v1/${contact.id}/attachments`);

        if (list_resp.error || !list_resp.data || list_resp.data.items.length === 0) continue;

        for (const att_stub of list_resp.data.items) {
          try {
            const att_resp = await api_client.get<{
              id: string;
              encrypted_data: string;
              data_nonce: string;
              encrypted_meta: string;
              meta_nonce: string;
              size_bytes: number;
            }>(`/contacts/v1/${contact.id}/attachments/${att_stub.id}`);

            if (att_resp.error || !att_resp.data) {
              ok = false;
              continue;
            }

            const att = att_resp.data;
            const [data_result, meta_result] = await Promise.all([
              re_encrypt_field(att.encrypted_data, att.data_nonce, old_aes, new_aes),
              re_encrypt_field(att.encrypted_meta, att.meta_nonce, old_aes, new_aes),
            ]);

            await must_succeed(
              api_client.delete(
                `/contacts/v1/${contact.id}/attachments/${att.id}`,
              ),
            );
            try {
              await must_succeed(
                api_client.post(`/contacts/v1/${contact.id}/attachments`, {
                  encrypted_data: data_result.encrypted,
                  data_nonce: data_result.nonce,
                  encrypted_meta: meta_result.encrypted,
                  meta_nonce: meta_result.nonce,
                  size_bytes: att.size_bytes,
                }),
              );
            } catch (post_err) {
              await api_client.post(`/contacts/v1/${contact.id}/attachments`, {
                encrypted_data: att.encrypted_data,
                data_nonce: att.data_nonce,
                encrypted_meta: att.encrypted_meta,
                meta_nonce: att.meta_nonce,
                size_bytes: att.size_bytes,
              });

              throw post_err;
            }
          } catch {
            ok = false;
            continue;
          }
        }
      } catch {
        ok = false;
        continue;
      }
    }

    if (!contacts_resp.data.has_more || !contacts_resp.data.next_cursor) break;

    cursor = contacts_resp.data.next_cursor;
  }

  return ok;
}

export async function re_encrypt_contact_sync_sources(
  old_aes: CryptoKey,
  new_aes: CryptoKey,
): Promise<boolean> {
  const resp = await api_client.get<{
    items: Array<{
      id: string;
      source_type: string;
      encrypted_config: string;
      config_nonce: string;
    }>;
  }>("/contacts/v1/sync/sources");

  if (resp.error || !resp.data) return false;

  if (resp.data.items.length === 0) return true;

  const decrypted: Array<{ source_type: string; config_pt: ArrayBuffer }> = [];

  let ok = true;

  for (const source of resp.data.items) {
    try {
      const ct = base64_to_array(source.encrypted_config);
      const iv = base64_to_array(source.config_nonce);
      const config_pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, old_aes, ct);
      decrypted.push({ source_type: source.source_type, config_pt });
    } catch {
      ok = false;
      continue;
    }
  }

  if (decrypted.length === 0) return ok;

  for (const source of resp.data.items) {
    await must_succeed(
      api_client.delete(`/contacts/v1/sync/sources/${source.id}`),
    ).catch(() => {
      ok = false;
    });
  }

  for (const item of decrypted) {
    try {
      const new_iv = crypto.getRandomValues(new Uint8Array(12));
      const new_ct = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv: new_iv },
        new_aes,
        item.config_pt,
      );
      await must_succeed(
        api_client.post("/contacts/v1/sync/sources", {
          source_type: item.source_type,
          encrypted_config: array_to_base64(new Uint8Array(new_ct)),
          config_nonce: array_to_base64(new_iv),
        }),
      );
    } catch {
      ok = false;
      continue;
    }
  }

  return ok;
}

export async function re_encrypt_drafts(
  old_identity_key: string,
  new_identity_key: string,
): Promise<void> {
  if (old_identity_key === new_identity_key) return;

  const DRAFT_KEY_SUFFIX = "astermail-draft-v2";

  async function derive_draft_aes(identity_key: string, usages: KeyUsage[]): Promise<CryptoKey> {
    const material = new TextEncoder().encode(identity_key + DRAFT_KEY_SUFFIX);
    const hash = await crypto.subtle.digest(HASH_ALG, material);
    return crypto.subtle.importKey("raw", hash, { name: "AES-GCM", length: 256 }, false, usages);
  }

  const [old_key, new_key] = await Promise.all([
    derive_draft_aes(old_identity_key, ["decrypt"]),
    derive_draft_aes(new_identity_key, ["encrypt"]),
  ]);

  let cursor: string | undefined;

  while (true) {
    const resp = await api_client.get<{
      items: Array<{
        id: string;
        encrypted_content: string;
        content_nonce: string;
        version: number;
        size_bytes: number;
        has_attachments: boolean;
        attachment_count: number;
      }>;
      next_cursor?: string;
      has_more: boolean;
    }>(`/mail/v1/drafts?limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`);

    if (resp.error || !resp.data) break;

    for (const draft of resp.data.items) {
      try {
        const { encrypted, nonce } = await re_encrypt_field(
          draft.encrypted_content,
          draft.content_nonce,
          old_key,
          new_key,
        );
        const hash_buf = await crypto.subtle.digest(
          HASH_ALG,
          new TextEncoder().encode(encrypted),
        );
        await must_succeed(
          api_client.put(`/mail/v1/drafts/${draft.id}`, {
            encrypted_content: encrypted,
            content_nonce: nonce,
            content_hash: array_to_base64(new Uint8Array(hash_buf)),
            version: draft.version,
            size_bytes: encrypted.length,
            has_attachments: draft.has_attachments,
            attachment_count: draft.attachment_count,
          }),
        );
      } catch {
        continue;
      }
    }

    cursor = resp.data.next_cursor;
    if (!resp.data.has_more || !cursor) break;
  }
}


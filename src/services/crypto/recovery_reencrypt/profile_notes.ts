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
import type {} from "../key_manager";
import { api_client } from "@/services/api/client";

import type {} from "@/services/api/signatures";
import type {} from "@/services/api/templates";
import type {} from "@/services/api/blocked_senders";
import type {} from "@/services/api/allowed_senders";
import { array_to_base64, base64_to_array } from "../base64";

import { import_aes_key } from "./key_helpers";
export async function derive_profile_notes_hmac_key(
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

export async function re_encrypt_profile_notes(
  old_raw: Uint8Array,
  new_raw: Uint8Array,
): Promise<boolean> {
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

  if (resp.error || !resp.data) return false;

  if (resp.data.notes.length === 0) return true;

  const old_aes = await import_aes_key(old_raw, ["decrypt"]);
  const new_aes = await import_aes_key(new_raw, ["encrypt"]);
  const new_hmac = await derive_profile_notes_hmac_key(new_raw);

  let ok = true;

  for (const note of resp.data.notes) {
    try {
      const ct = base64_to_array(note.encrypted_note);
      const iv = base64_to_array(note.note_nonce);
      const pt = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv },
        old_aes,
        ct,
      );

      const new_iv = crypto.getRandomValues(new Uint8Array(12));
      const new_ct = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv: new_iv },
        new_aes,
        pt,
      );

      const new_encrypted_note = array_to_base64(new Uint8Array(new_ct));
      const new_note_nonce = array_to_base64(new_iv);

      const integrity_input = new TextEncoder().encode(
        `${new_encrypted_note}:${new_note_nonce}:profile-notes-v1`,
      );
      const new_integrity_sig = await crypto.subtle.sign(
        "HMAC",
        new_hmac,
        integrity_input,
      );
      const new_integrity_hash = array_to_base64(
        new Uint8Array(new_integrity_sig),
      );

      await api_client.put("/settings/v1/profile_notes", {
        email_token: note.email_token,
        encrypted_note: new_encrypted_note,
        note_nonce: new_note_nonce,
        integrity_hash: new_integrity_hash,
      });
    } catch {
      ok = false;
      continue;
    }
  }

  return ok;
}

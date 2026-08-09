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
import type { EncryptedVault } from "../key_manager";
import { hash_recovery_email } from "../key_manager";
import { api_client } from "@/services/api/client";
import type { } from "@/services/api/signatures";
import type { } from "@/services/api/templates";
import type { } from "@/services/api/blocked_senders";
import type { } from "@/services/api/allowed_senders";
import {
  derive_preferences_key_raw,
  prepare_preferences_payload,
} from "@/services/api/preferences";
import { array_to_base64, base64_to_array } from "../base64";


import { derive_hmac_key, identity_scoped_key_pair, re_encrypt_collection, re_encrypt_identity_scoped_setting } from "./key_helpers";
export async function re_encrypt_preferences(
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

export async function re_encrypt_recovery_email(
  old_identity_key: string,
  new_identity_key: string,
): Promise<void> {
  if (old_identity_key === new_identity_key) return;

  const resp = await api_client.get<{
    encrypted_email: string | null;
    email_nonce: string | null;
    verified: boolean | null;
  }>("/core/v1/recovery/email");

  if (resp.error || !resp.data) return;

  const { encrypted_email, email_nonce } = resp.data;

  if (!encrypted_email || !email_nonce) return;

  const { old_key, new_key } = await identity_scoped_key_pair(
    old_identity_key,
    new_identity_key,
    "astermail-recovery-email-v1",
  );

  const ct = base64_to_array(encrypted_email);
  const iv = base64_to_array(email_nonce);
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, old_key, ct);
  const email_text = new TextDecoder().decode(pt);

  const new_iv = crypto.getRandomValues(new Uint8Array(12));
  const new_ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv: new_iv }, new_key, pt);
  const email_hash = await hash_recovery_email(email_text);

  await api_client.put("/core/v1/recovery/email", {
    encrypted_email: array_to_base64(new Uint8Array(new_ct)),
    email_nonce: array_to_base64(new_iv),
    email_hash,
    plaintext_email: email_text,
  });
}

export async function re_encrypt_onboarding_state(
  old_identity_key: string,
  new_identity_key: string,
): Promise<void> {
  return re_encrypt_identity_scoped_setting(
    "/core/v1/onboarding",
    "astermail-onboarding-v1",
    ["encrypted_state", "state_nonce"],
    old_identity_key,
    new_identity_key,
  );
}

export async function re_encrypt_dev_mode(
  old_identity_key: string,
  new_identity_key: string,
): Promise<void> {
  return re_encrypt_identity_scoped_setting(
    "/settings/v1/preferences/dev-mode",
    "astermail-devmode-v1",
    ["encrypted_dev_mode", "dev_mode_nonce"],
    old_identity_key,
    new_identity_key,
  );
}

export async function re_encrypt_external_accounts(
  old_aes: CryptoKey,
  new_aes: CryptoKey,
  new_raw: Uint8Array,
): Promise<boolean> {
  const resp = await api_client.get<{
    accounts: Array<{
      account_token: string;
      encrypted_account_data: string;
      account_data_nonce: string;
    }>;
    total: number;
  }>("/mail/v1/external_accounts");

  if (resp.error || !resp.data) return false;

  if (resp.data.accounts.length === 0) return true;

  const new_hmac = await derive_hmac_key(new_raw, "external-accounts-hmac-v1");

  return re_encrypt_collection(
    resp.data.accounts,
    [["encrypted_account_data", "account_data_nonce"]],
    old_aes,
    new_aes,
    async (account, patch) => {
      const encrypted = patch.encrypted_account_data;
      const nonce = patch.account_data_nonce;
      const combined = `${encrypted}:${nonce}:external-accounts-v1`;
      const hash_buf = await crypto.subtle.sign(
        "HMAC",
        new_hmac,
        new TextEncoder().encode(combined),
      );

      await api_client.put("/mail/v1/external_accounts/update", {
        account_token: account.account_token,
        encrypted_account_data: encrypted,
        account_data_nonce: nonce,
        integrity_hash: array_to_base64(new Uint8Array(hash_buf)),
      });
    },
  );
}


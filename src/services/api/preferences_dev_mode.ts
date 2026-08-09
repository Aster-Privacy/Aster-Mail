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
import type { EncryptedVault } from "@/services/crypto/key_manager";
import { decrypt_aes_gcm_with_fallback } from "@/services/crypto/legacy_keks";

import { api_client } from "./client";

interface GetDevModeApiResponse {
  encrypted_dev_mode: string | null;
  dev_mode_nonce: string | null;
}

interface SaveDevModeApiResponse {
  success: boolean;
}

export async function derive_dev_mode_key_raw(
  identity_key: string,
): Promise<Uint8Array> {
  const key_material = new TextEncoder().encode(
    identity_key + "astermail-devmode-v1",
  );
  const hash = await crypto.subtle.digest(HASH_ALG, key_material);

  return new Uint8Array(hash);
}

async function derive_dev_mode_key(vault: EncryptedVault): Promise<CryptoKey> {
  const raw = await derive_dev_mode_key_raw(vault.identity_key);

  return crypto.subtle.importKey(
    "raw",
    raw,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

async function encrypt_dev_mode(
  enabled: boolean,
  vault: EncryptedVault,
): Promise<{ encrypted: string; nonce: string }> {
  const key = await derive_dev_mode_key(vault);
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const data = new TextEncoder().encode(
    JSON.stringify({ enabled, timestamp: Date.now() }),
  );

  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: nonce },
    key,
    data,
  );

  return {
    encrypted: btoa(String.fromCharCode(...new Uint8Array(encrypted))),
    nonce: btoa(String.fromCharCode(...nonce)),
  };
}

async function decrypt_dev_mode(
  encrypted: string,
  nonce: string,
  vault: EncryptedVault,
): Promise<boolean> {
  const key = await derive_dev_mode_key(vault);
  const encrypted_data = Uint8Array.from(atob(encrypted), (c) =>
    c.charCodeAt(0),
  );
  const nonce_data = Uint8Array.from(atob(nonce), (c) => c.charCodeAt(0));

  const decrypted = await decrypt_aes_gcm_with_fallback(key, encrypted_data, nonce_data);

  const result = JSON.parse(new TextDecoder().decode(decrypted));

  return result.enabled === true;
}

export async function get_dev_mode(
  vault: EncryptedVault | null,
): Promise<{ data: boolean | null }> {
  if (!vault) {
    return { data: null };
  }

  try {
    const response = await api_client.get<GetDevModeApiResponse>(
      "/settings/v1/preferences/dev-mode",
    );

    if (response.error || !response.data) {
      return { data: null };
    }

    const { encrypted_dev_mode, dev_mode_nonce } = response.data;

    if (!encrypted_dev_mode || !dev_mode_nonce) {
      return { data: false };
    }

    const enabled = await decrypt_dev_mode(
      encrypted_dev_mode,
      dev_mode_nonce,
      vault,
    );

    return { data: enabled };
  } catch {
    return { data: null };
  }
}

export async function save_dev_mode(
  enabled: boolean,
  vault: EncryptedVault,
): Promise<{ data: { success: boolean } }> {
  try {
    const { encrypted, nonce } = await encrypt_dev_mode(enabled, vault);

    const response = await api_client.put<SaveDevModeApiResponse>(
      "/settings/v1/preferences/dev-mode",
      {
        encrypted_dev_mode: encrypted,
        dev_mode_nonce: nonce,
      },
    );

    return {
      data: { success: !response.error && response.data?.success === true },
    };
  } catch {
    return { data: { success: false } };
  }
}

export interface SpamSettings {
  spam_retention_days: number;
  spam_sensitivity: string;
  spam_filter_enabled: boolean;
}

export async function get_spam_settings(): Promise<{
  data: SpamSettings | null;
}> {
  try {
    const response = await api_client.get<SpamSettings>(
      "/settings/v1/preferences/spam",
    );

    if (response.error || !response.data) {
      return { data: null };
    }

    return { data: response.data };
  } catch {
    return { data: null };
  }
}

export async function save_spam_settings(
  settings: SpamSettings,
): Promise<{ data: { success: boolean } }> {
  try {
    const response = await api_client.put<{ success: boolean }>(
      "/settings/v1/preferences/spam",
      settings,
    );

    return {
      data: { success: !response.error && response.data?.success === true },
    };
  } catch {
    return { data: { success: false } };
  }
}

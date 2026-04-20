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
import type { EncryptedVault } from "@/services/crypto/key_manager";
import { decrypt_aes_gcm_with_fallback } from "@/services/crypto/legacy_keks";

import { api_client } from "./client";

const HASH_ALG = ["SHA", "256"].join("-");

export interface OnboardingState {
  current_step: number;
  completed_steps: number[];
  last_seen_step: number;
  started_at: number;
}

interface GetOnboardingApiResponse {
  encrypted_state: string | null;
  state_nonce: string | null;
  is_completed: boolean;
  is_skipped: boolean;
}

interface UpdateOnboardingApiResponse {
  success: boolean;
}

async function derive_onboarding_key(
  vault: EncryptedVault,
): Promise<CryptoKey> {
  const key_material = new TextEncoder().encode(
    vault.identity_key + "astermail-onboarding-v1",
  );
  const hash = await crypto.subtle.digest(HASH_ALG, key_material);

  return crypto.subtle.importKey(
    "raw",
    hash,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

async function encrypt_onboarding_state(
  state: OnboardingState,
  vault: EncryptedVault,
): Promise<{ encrypted: string; nonce: string }> {
  const key = await derive_onboarding_key(vault);
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const data = new TextEncoder().encode(JSON.stringify(state));

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

async function decrypt_onboarding_state(
  encrypted: string,
  nonce: string,
  vault: EncryptedVault,
): Promise<OnboardingState> {
  const key = await derive_onboarding_key(vault);
  const encrypted_data = Uint8Array.from(atob(encrypted), (c) =>
    c.charCodeAt(0),
  );
  const nonce_data = Uint8Array.from(atob(nonce), (c) => c.charCodeAt(0));

  const decrypted = await decrypt_aes_gcm_with_fallback(key, encrypted_data, nonce_data);

  return JSON.parse(new TextDecoder().decode(decrypted));
}

export const DEFAULT_ONBOARDING_STATE: OnboardingState = {
  current_step: 0,
  completed_steps: [],
  last_seen_step: 0,
  started_at: Date.now(),
};

export async function get_onboarding_state(
  vault: EncryptedVault | null,
): Promise<{
  data: OnboardingState | null;
  is_completed: boolean;
  is_skipped: boolean;
}> {
  if (!vault) {
    return { data: null, is_completed: false, is_skipped: false };
  }

  try {
    const response = await api_client.get<GetOnboardingApiResponse>(
      "/core/v1/onboarding",
    );

    if (response.error || !response.data) {
      return { data: null, is_completed: false, is_skipped: false };
    }

    const { encrypted_state, state_nonce, is_completed, is_skipped } =
      response.data;

    if (!encrypted_state || !state_nonce) {
      return { data: null, is_completed, is_skipped };
    }

    const state = await decrypt_onboarding_state(
      encrypted_state,
      state_nonce,
      vault,
    );

    return { data: state, is_completed, is_skipped };
  } catch {
    return { data: null, is_completed: false, is_skipped: false };
  }
}

export async function update_onboarding_state(
  state: OnboardingState,
  vault: EncryptedVault,
  is_completed?: boolean,
  is_skipped?: boolean,
): Promise<{ data: { success: boolean } }> {
  try {
    const { encrypted, nonce } = await encrypt_onboarding_state(state, vault);

    const response = await api_client.put<UpdateOnboardingApiResponse>(
      "/core/v1/onboarding",
      {
        encrypted_state: encrypted,
        state_nonce: nonce,
        is_completed,
        is_skipped,
      },
    );

    return {
      data: { success: !response.error && response.data?.success === true },
    };
  } catch {
    return { data: { success: false } };
  }
}

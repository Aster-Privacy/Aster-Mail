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
import type { TranslationKey } from "@/lib/i18n/types";

import { api_client } from "@/services/api/client";
import { is_auth_salt_collision } from "@/services/crypto/auth_salt_guard";
import {
  decrypt_vault,
  type EncryptedVault,
} from "@/services/crypto/key_manager";

export type PasswordChangeVaultFailure =
  | "session_expired"
  | "wrong_password"
  | "salt_collision"
  | "out_of_date"
  | "unavailable";

export const PASSWORD_CHANGE_VAULT_ERROR_KEYS: Record<
  PasswordChangeVaultFailure,
  TranslationKey
> = {
  session_expired: "settings.session_expired_sign_in",
  wrong_password: "settings.current_password_incorrect",
  salt_collision: "errors.auth_salt_collision",
  out_of_date: "settings.password_change_vault_out_of_date",
  unavailable: "settings.failed_get_auth_data",
};

export type PasswordChangeVault =
  | {
      kind: "ok";
      vault: EncryptedVault;
      server_blob: { encrypted_vault: string; vault_nonce: string } | null;
    }
  | { kind: "error"; reason: PasswordChangeVaultFailure };

function read_cached_vault(
  user_id: string,
): { encrypted_vault: string; vault_nonce: string } | null {
  try {
    const encrypted_vault = localStorage.getItem(
      `astermail_encrypted_vault_${user_id}`,
    );
    const vault_nonce = localStorage.getItem(
      `astermail_vault_nonce_${user_id}`,
    );

    if (!encrypted_vault || !vault_nonce) return null;

    return { encrypted_vault, vault_nonce };
  } catch {
    return null;
  }
}

function password_failure(error: unknown): PasswordChangeVaultFailure {
  return is_auth_salt_collision(error) ? "salt_collision" : "wrong_password";
}

async function decrypt_cached_vault(
  user_id: string,
  current_password: string,
): Promise<PasswordChangeVault> {
  const cached = read_cached_vault(user_id);

  if (!cached) return { kind: "error", reason: "session_expired" };

  try {
    const vault = await decrypt_vault(
      cached.encrypted_vault,
      cached.vault_nonce,
      current_password,
    );

    return { kind: "ok", vault, server_blob: null };
  } catch (error) {
    return { kind: "error", reason: password_failure(error) };
  }
}

export async function load_password_change_vault(
  user_id: string,
  current_password: string,
): Promise<PasswordChangeVault> {
  let response;

  try {
    response = await api_client.get<{
      encrypted_vault: string;
      vault_nonce: string;
    }>("/core/v1/auth/vault");
  } catch {
    return { kind: "error", reason: "unavailable" };
  }

  if (response.error) {
    if (response.code === "NOT_FOUND") {
      return decrypt_cached_vault(user_id, current_password);
    }

    return { kind: "error", reason: "unavailable" };
  }

  const encrypted_vault = response.data?.encrypted_vault;
  const vault_nonce = response.data?.vault_nonce;

  if (!encrypted_vault || !vault_nonce) {
    return { kind: "error", reason: "unavailable" };
  }

  try {
    const vault = await decrypt_vault(
      encrypted_vault,
      vault_nonce,
      current_password,
    );

    return { kind: "ok", vault, server_blob: { encrypted_vault, vault_nonce } };
  } catch (server_error) {
    const cached = await decrypt_cached_vault(user_id, current_password);

    if (cached.kind === "ok") {
      return { kind: "error", reason: "out_of_date" };
    }

    if (cached.reason === "session_expired") {
      return { kind: "error", reason: password_failure(server_error) };
    }

    return cached;
  }
}

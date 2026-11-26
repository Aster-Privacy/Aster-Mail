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
import {
  AUTH_SALT_COLLISION_TRANSLATION_KEY,
  IncorrectCurrentPasswordError,
  is_legacy_login_salt_error,
  login_safety_error_key,
} from "./auth_salt_guard";
import { base64_to_array } from "./base64";
import { derive_reset_account_proof, read_kdf_version } from "./login_proof";

export interface ResetVaultProofSource {
  password_salt?: string;
  kdf_version?: number;
  address?: string;
}

export async function derive_reset_vault_proof(
  current_password: string,
  source: ResetVaultProofSource | null | undefined,
  address = "",
): Promise<string | undefined> {
  if (!current_password || !source?.password_salt) return undefined;

  let salt: Uint8Array;

  try {
    salt = base64_to_array(source.password_salt);
  } catch {
    return undefined;
  }

  try {
    return await derive_reset_account_proof(
      current_password,
      salt,
      read_kdf_version(source.kdf_version),
      address || source.address || "",
    );
  } catch (caught) {
    if (login_safety_error_key(caught)) throw caught;

    return undefined;
  }
}

export type ResetVaultProofErrorKey =
  | "auth.reset_legacy_login_salt"
  | "settings.current_password_incorrect"
  | typeof AUTH_SALT_COLLISION_TRANSLATION_KEY;

export function reset_vault_proof_error_key(
  error: unknown,
): ResetVaultProofErrorKey | null {
  if (is_legacy_login_salt_error(error)) {
    return "auth.reset_legacy_login_salt";
  }

  if (error instanceof IncorrectCurrentPasswordError) {
    return "settings.current_password_incorrect";
  }

  return login_safety_error_key(error) === AUTH_SALT_COLLISION_TRANSLATION_KEY
    ? AUTH_SALT_COLLISION_TRANSLATION_KEY
    : null;
}

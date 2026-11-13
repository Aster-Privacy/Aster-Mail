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
import { base64_to_array } from "./base64";
import { derive_password_hash } from "./key_manager_pgp_keygen";
import { read_kdf_version } from "./login_proof";

export interface ResetVaultProofSource {
  password_salt?: string;
  kdf_version?: number;
}

export async function derive_reset_vault_proof(
  current_password: string,
  source: ResetVaultProofSource | null | undefined,
): Promise<string | undefined> {
  if (!current_password || !source?.password_salt) return undefined;

  try {
    const { hash, hash_v2 } = await derive_password_hash(
      current_password,
      base64_to_array(source.password_salt),
    );

    return read_kdf_version(source.kdf_version) === 2 ? hash_v2 : hash;
  } catch {
    return undefined;
  }
}

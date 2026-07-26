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
import { api_client } from "@/services/api/client";
import {
  base64_to_array,
  derive_password_hash,
} from "@/services/crypto/key_manager";

export type CancelPasswordOutcome = "verified" | "invalid" | "error";

interface SaltResponse {
  salt: string;
  totp_required?: boolean;
}

interface VerifyPasswordResponse {
  verified: boolean;
  totp_required: boolean;
}

let cached_password: string | null = null;
let cached_hash: string | null = null;

export function clear_cancel_password_cache() {
  cached_password = null;
  cached_hash = null;
}

export async function get_cancel_password_hash(
  password: string,
): Promise<string | null> {
  if (cached_hash && cached_password === password) return cached_hash;

  const salt_response = await api_client.get<SaltResponse>(
    "/crypto/v1/encryption/salt",
    { skip_cache: true },
  );

  if (salt_response.error || !salt_response.data?.salt) return null;

  const salt = base64_to_array(salt_response.data.salt);
  const { hash } = await derive_password_hash(password, salt);

  cached_password = password;
  cached_hash = hash;

  return hash;
}

export async function verify_cancel_password(
  password: string,
): Promise<CancelPasswordOutcome> {
  if (!password.trim()) return "invalid";

  try {
    const hash = await get_cancel_password_hash(password);

    if (!hash) return "error";

    const verify_response = await api_client.post<VerifyPasswordResponse>(
      "/crypto/v1/encryption/verify-password",
      { password_hash: hash },
    );

    if (verify_response.error || !verify_response.data) return "error";

    if (verify_response.data.verified || verify_response.data.totp_required) {
      return "verified";
    }

    return "invalid";
  } catch {
    return "error";
  }
}

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
import type { StepUpHardwareKeyAssertion } from "./webauthn";

import { api_client } from "./client";

import {
  derive_password_hash,
  base64_to_array,
} from "@/services/crypto/key_manager";

export interface StepUpCredentials {
  password_hash: string;
  totp_code?: string;
  hardware_key_assertion?: StepUpHardwareKeyAssertion;
}

export interface StepUpRequirements {
  salt: Uint8Array;
  totp_required: boolean;
}

interface AccountSaltResponse {
  salt: string;
  totp_required: boolean;
}

export async function fetch_step_up_requirements(): Promise<StepUpRequirements> {
  const salt_response = await api_client.get<AccountSaltResponse>(
    "/crypto/v1/encryption/salt",
    { skip_cache: true },
  );

  if (salt_response.error || !salt_response.data?.salt) {
    throw new Error(salt_response.error || "Could not load account data");
  }

  return {
    salt: base64_to_array(salt_response.data.salt),
    totp_required: salt_response.data.totp_required === true,
  };
}

export async function derive_step_up_credentials(
  password: string,
  totp_code?: string,
): Promise<StepUpCredentials> {
  const { salt } = await fetch_step_up_requirements();
  const { hash: password_hash } = await derive_password_hash(password, salt);

  const trimmed_code = totp_code?.trim();

  return {
    password_hash,
    totp_code: trimmed_code ? trimmed_code : undefined,
  };
}

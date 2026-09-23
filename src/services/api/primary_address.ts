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
import { hash_email } from "@/services/crypto/key_manager";
import {
  compute_alias_hash,
  compute_routing_hash,
  encrypt_alias_field,
} from "@/services/api/aliases/crypto";

export interface PrimaryAddressEligibility {
  eligible: boolean;
  reason: string | null;
  current_address: string;
  next_change_available_at: string | null;
  renames_allowed_per_year: number;
}

export interface StartPrimaryAddressChangeResult {
  expires_at: string;
}

export interface ConfirmPrimaryAddressChangeResult {
  new_address: string;
  retained_address: string;
  next_change_available_at: string | null;
}

export async function get_primary_address_eligibility() {
  return api_client.get<PrimaryAddressEligibility>(
    "/core/v1/account/primary-address",
  );
}

export async function load_primary_address_eligibility() {
  return get_primary_address_eligibility().catch(() => ({
    data: undefined,
    code: "NOT_FOUND" as const,
  }));
}

export function primary_address_eligibility_failed(response: {
  data?: unknown;
  code?: string;
}) {
  return !response.data && response.code !== "NOT_FOUND";
}

export interface PrimaryAddressAvailability {
  available: boolean;
}

export async function check_primary_address_availability(
  local_part: string,
  domain: string,
) {
  return api_client.post<PrimaryAddressAvailability>(
    "/core/v1/account/primary-address/availability",
    { local_part, domain },
  );
}

export async function start_primary_address_change(params: {
  new_local_part: string;
  new_domain: string;
  password_hash: string;
}) {
  return api_client.post<StartPrimaryAddressChangeResult>(
    "/core/v1/account/primary-address/start",
    params,
  );
}

export async function resend_primary_address_code() {
  return api_client.post<StartPrimaryAddressChangeResult>(
    "/core/v1/account/primary-address/resend",
    {},
  );
}

export async function confirm_primary_address_change(params: {
  code: string;
  new_address: string;
  retained_address: string;
}) {
  const retained = params.retained_address.trim().toLowerCase();
  const at = retained.lastIndexOf("@");
  const retained_local_part = retained.slice(0, at);
  const retained_domain = retained.slice(at + 1);

  const [new_user_hash, alias_hash, routing_hash, encrypted_local_part] =
    await Promise.all([
      hash_email(params.new_address),
      compute_alias_hash(retained_local_part, retained_domain),
      compute_routing_hash(retained_local_part, retained_domain),
      encrypt_alias_field(retained_local_part),
    ]);

  return api_client.post<ConfirmPrimaryAddressChangeResult>(
    "/core/v1/account/primary-address/confirm",
    {
      code: params.code,
      new_user_hash,
      retained_encrypted_local_part: encrypted_local_part.encrypted,
      retained_local_part_nonce: encrypted_local_part.nonce,
      retained_alias_address_hash: alias_hash,
      retained_routing_address_hash: routing_hash,
    },
  );
}

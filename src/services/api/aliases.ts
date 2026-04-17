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
import { api_client, type ApiResponse } from "./client";

import {
  get_or_create_derived_encryption_crypto_key,
  get_derived_encryption_key,
} from "@/services/crypto/memory_key_store";

const HASH_ALG = ["SHA", "256"].join("-");

export interface EmailAlias {
  id: string;
  encrypted_local_part: string;
  local_part_nonce: string;
  encrypted_display_name?: string;
  display_name_nonce?: string;
  alias_address_hash: string;
  domain: string;
  is_enabled: boolean;
  is_random: boolean;
  profile_picture?: string;
  downgrade_grace_expires_at?: string;
  created_at: string;
  updated_at: string;
}

export interface DecryptedEmailAlias {
  id: string;
  local_part: string;
  display_name?: string;
  alias_address_hash: string;
  domain: string;
  full_address: string;
  is_enabled: boolean;
  is_random: boolean;
  profile_picture?: string;
  downgrade_grace_expires_at?: string;
  created_at: string;
  updated_at: string;
}

export interface AliasListResponse {
  aliases: EmailAlias[];
  total: number;
  has_more: boolean;
  max_aliases: number;
}

export interface CreateAliasRequest {
  encrypted_local_part: string;
  local_part_nonce: string;
  encrypted_display_name?: string;
  display_name_nonce?: string;
  alias_address_hash: string;
  routing_address_hash: string;
  domain: string;
}

export interface CreateAliasResponse {
  id: string;
  success: boolean;
}

export interface UpdateAliasRequest {
  encrypted_display_name?: string;
  display_name_nonce?: string;
  is_enabled?: boolean;
  profile_picture?: string | null;
}

export interface AliasLimitResponse {
  current_count: number;
  max_aliases: number;
  can_create: boolean;
}

export interface CheckAvailabilityResponse {
  available: boolean;
}

export interface AliasCountsResponse {
  count: number;
  max: number;
  can_create: boolean;
}

function array_to_base64(array: Uint8Array): string {
  let binary = "";

  for (let i = 0; i < array.length; i++) {
    binary += String.fromCharCode(array[i]);
  }

  return btoa(binary);
}

function base64_to_array(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  return bytes;
}

async function get_alias_hmac_key(): Promise<CryptoKey> {
  const raw_key = get_derived_encryption_key();

  if (!raw_key) {
    throw new Error("No encryption key available");
  }

  const encoder = new TextEncoder();
  const info = encoder.encode("astermail-alias-hmac-v1");
  const combined = new Uint8Array(raw_key.byteLength + info.length);

  combined.set(raw_key, 0);
  combined.set(info, raw_key.byteLength);

  const hash = await crypto.subtle.digest(HASH_ALG, combined);

  return crypto.subtle.importKey(
    "raw",
    hash,
    { name: "HMAC", hash: HASH_ALG },
    false,
    ["sign"],
  );
}

async function get_alias_encryption_key(): Promise<CryptoKey> {
  const key = await get_or_create_derived_encryption_crypto_key();

  if (!key) {
    throw new Error("No encryption key available");
  }

  return key;
}

export async function compute_alias_hash(
  local_part: string,
  domain: string,
): Promise<string> {
  const hmac_key = await get_alias_hmac_key();
  const full_address = `${local_part.toLowerCase()}@${domain}`;
  const encoder = new TextEncoder();
  const data = encoder.encode(full_address);
  const signature = await crypto.subtle.sign("HMAC", hmac_key, data);

  return array_to_base64(new Uint8Array(signature));
}

export async function compute_routing_hash(
  local_part: string,
  domain: string,
): Promise<string> {
  const full_address = `${local_part.toLowerCase()}@${domain}`;
  const encoder = new TextEncoder();
  const data = encoder.encode(full_address);
  const hash = await crypto.subtle.digest(HASH_ALG, data);

  return array_to_base64(new Uint8Array(hash));
}

export async function encrypt_alias_field(value: string): Promise<{
  encrypted: string;
  nonce: string;
}> {
  const key = await get_alias_encryption_key();
  const encoder = new TextEncoder();
  const plaintext = encoder.encode(value);
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: nonce },
    key,
    plaintext,
  );

  return {
    encrypted: array_to_base64(new Uint8Array(ciphertext)),
    nonce: array_to_base64(nonce),
  };
}

export async function decrypt_alias_field(
  encrypted: string,
  nonce: string,
): Promise<string> {
  const key = await get_alias_encryption_key();
  const ciphertext = base64_to_array(encrypted);
  const iv = base64_to_array(nonce);
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    ciphertext,
  );
  const decoder = new TextDecoder();

  return decoder.decode(decrypted);
}

export async function decrypt_alias(
  alias: EmailAlias,
): Promise<DecryptedEmailAlias> {
  let local_part: string;

  if (alias.is_random) {
    const decoder = new TextDecoder();

    local_part = decoder.decode(base64_to_array(alias.encrypted_local_part));
  } else {
    local_part = await decrypt_alias_field(
      alias.encrypted_local_part,
      alias.local_part_nonce,
    );
  }

  let display_name: string | undefined;

  if (alias.encrypted_display_name && alias.display_name_nonce) {
    display_name = await decrypt_alias_field(
      alias.encrypted_display_name,
      alias.display_name_nonce,
    );
  }

  return {
    id: alias.id,
    local_part,
    display_name,
    alias_address_hash: alias.alias_address_hash,
    domain: alias.domain,
    full_address: `${local_part}@${alias.domain}`,
    is_enabled: alias.is_enabled,
    is_random: alias.is_random,
    profile_picture: alias.profile_picture,
    downgrade_grace_expires_at: alias.downgrade_grace_expires_at,
    created_at: alias.created_at,
    updated_at: alias.updated_at,
  };
}

export async function decrypt_aliases(
  aliases: EmailAlias[],
): Promise<DecryptedEmailAlias[]> {
  return Promise.all(aliases.map((alias) => decrypt_alias(alias)));
}

export async function list_aliases(params?: {
  limit?: number;
  offset?: number;
}): Promise<ApiResponse<AliasListResponse>> {
  const query_params = new URLSearchParams();

  if (params?.limit !== undefined) {
    query_params.set("limit", params.limit.toString());
  }
  if (params?.offset !== undefined) {
    query_params.set("offset", params.offset.toString());
  }

  const query_string = query_params.toString();
  const endpoint = `/addresses/v1/aliases${query_string ? `?${query_string}` : ""}`;

  return api_client.get<AliasListResponse>(endpoint);
}

export async function get_alias(
  alias_id: string,
): Promise<ApiResponse<EmailAlias>> {
  return api_client.get<EmailAlias>(`/addresses/v1/aliases/${alias_id}`);
}

export async function create_alias(
  local_part: string,
  domain: string,
  display_name?: string,
): Promise<ApiResponse<CreateAliasResponse>> {
  const normalized_local_part = local_part.toLowerCase().trim();
  const alias_hash = await compute_alias_hash(normalized_local_part, domain);
  const routing_hash = await compute_routing_hash(
    normalized_local_part,
    domain,
  );
  const { encrypted: encrypted_local_part, nonce: local_part_nonce } =
    await encrypt_alias_field(normalized_local_part);

  const request: CreateAliasRequest = {
    encrypted_local_part,
    local_part_nonce,
    alias_address_hash: alias_hash,
    routing_address_hash: routing_hash,
    domain,
  };

  if (display_name) {
    const { encrypted: encrypted_display_name, nonce: display_name_nonce } =
      await encrypt_alias_field(display_name);

    request.encrypted_display_name = encrypted_display_name;
    request.display_name_nonce = display_name_nonce;
  }

  return api_client.post<CreateAliasResponse>("/addresses/v1/aliases", request);
}

export async function update_alias(
  alias_id: string,
  updates: {
    display_name?: string;
    is_enabled?: boolean;
    profile_picture?: string | null;
  },
): Promise<ApiResponse<{ success: boolean }>> {
  const request: UpdateAliasRequest = {};

  if (updates.display_name !== undefined) {
    const { encrypted, nonce } = await encrypt_alias_field(
      updates.display_name,
    );

    request.encrypted_display_name = encrypted;
    request.display_name_nonce = nonce;
  }

  if (updates.is_enabled !== undefined) {
    request.is_enabled = updates.is_enabled;
  }

  if (updates.profile_picture !== undefined) {
    request.profile_picture = updates.profile_picture;
  }

  return api_client.patch<{ success: boolean }>(
    `/addresses/v1/aliases/${alias_id}`,
    request,
  );
}

export async function delete_alias(
  alias_id: string,
): Promise<ApiResponse<{ status: string }>> {
  return api_client.delete<{ status: string }>(
    `/addresses/v1/aliases/${alias_id}`,
  );
}

export async function check_alias_availability(
  local_part: string,
  domain: string,
): Promise<ApiResponse<CheckAvailabilityResponse>> {
  const normalized_local_part = local_part.toLowerCase().trim();
  const alias_hash = await compute_alias_hash(normalized_local_part, domain);
  const routing_hash = await compute_routing_hash(
    normalized_local_part,
    domain,
  );

  return api_client.post<CheckAvailabilityResponse>(
    "/addresses/v1/aliases/check",
    {
      alias_address_hash: alias_hash,
      routing_address_hash: routing_hash,
    },
  );
}

export async function get_alias_limit(): Promise<
  ApiResponse<AliasLimitResponse>
> {
  return api_client.get<AliasLimitResponse>("/addresses/v1/aliases/limit");
}

const RESERVED_ALIAS_NAMES = new Set([
  "noreply",
  "admin",
  "administrator",
  "postmaster",
  "webmaster",
  "support",
  "abuse",
  "mailer",
  "daemon",
  "root",
  "hostmaster",
  "info",
  "contact",
  "help",
  "system",
  "mail",
  "no-reply",
]);

export function validate_local_part(local_part: string): {
  valid: boolean;
  error?: string;
} {
  if (!local_part || local_part.length === 0) {
    return { valid: false, error: "Alias cannot be empty" };
  }

  if (local_part.length < 3) {
    return { valid: false, error: "Alias must be at least 3 characters" };
  }

  if (local_part.length > 64) {
    return { valid: false, error: "Alias must be 64 characters or less" };
  }

  const valid_pattern = /^[a-z0-9][a-z0-9._-]*[a-z0-9]$|^[a-z0-9]$/;

  if (!valid_pattern.test(local_part.toLowerCase())) {
    return {
      valid: false,
      error:
        "Alias can only contain letters, numbers, dots, underscores, and hyphens",
    };
  }

  if (local_part.includes("..")) {
    return { valid: false, error: "Alias cannot contain consecutive dots" };
  }

  if (RESERVED_ALIAS_NAMES.has(local_part.toLowerCase())) {
    return { valid: false, error: "This alias is not available" };
  }

  return { valid: true };
}

export async function get_alias_counts(): Promise<
  ApiResponse<AliasCountsResponse>
> {
  const response = await api_client.get<Record<string, unknown>>(
    "/addresses/v1/aliases/counts",
  );

  if (response.data) {
    const d = response.data;

    return {
      data: {
        count: (d.count ?? d.current_count ?? 0) as number,
        max: (d.max ?? d.max_aliases ?? 0) as number,
        can_create: (d.can_create ?? false) as boolean,
      },
    };
  }

  return response as unknown as ApiResponse<AliasCountsResponse>;
}

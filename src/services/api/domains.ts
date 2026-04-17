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

export interface DnsRecord {
  record_type: string;
  host: string;
  value: string;
  purpose: string;
  is_verified: boolean;
  priority?: number;
}

export interface RecordStatus {
  verified: boolean;
  verified_at?: string;
  last_check?: string;
}

export interface VerificationStatus {
  txt: RecordStatus;
  mx: RecordStatus;
  spf: RecordStatus;
  dkim: RecordStatus;
  dmarc: RecordStatus;
}

export interface CustomDomain {
  id: string;
  domain_name: string;
  status: string;
  txt_verified: boolean;
  mx_verified: boolean;
  spf_verified: boolean;
  dkim_verified: boolean;
  dmarc_configured: boolean;
  catch_all_enabled: boolean;
  is_primary: boolean;
  health_status: string;
  verification_token: string;
  created_at: string;
  verified_at?: string;
  last_verification_at?: string;
}

export interface DomainListResponse {
  domains: CustomDomain[];
  total: number;
  max_domains: number;
}

export interface AddDomainResponse {
  id: string;
  domain_name: string;
  verification_token: string;
  dns_records: DnsRecord[];
  status: string;
  created_at: string;
}

export interface DnsRecordsResponse {
  records: DnsRecord[];
  verification_status: VerificationStatus;
}

export interface VerificationResult {
  success: boolean;
  txt_verified: boolean;
  mx_verified: boolean;
  spf_verified: boolean;
  dkim_verified: boolean;
  dmarc_configured: boolean;
  status: string;
  message: string;
}

export interface DomainLimitResponse {
  current_count: number;
  max_domains: number;
  can_add: boolean;
}

export interface DkimRotationResponse {
  success: boolean;
  new_selector: string;
  public_key: string;
  dns_record: DnsRecord;
}

export interface DomainAddress {
  id: string;
  domain_id: string;
  encrypted_local_part: string;
  local_part_nonce: string;
  local_part_hash: string;
  encrypted_display_name?: string;
  display_name_nonce?: string;
  profile_picture?: string;
  is_enabled: boolean;
  is_primary: boolean;
  created_at: string;
}

export interface DecryptedDomainAddress {
  id: string;
  domain_id: string;
  local_part: string;
  display_name?: string;
  profile_picture?: string;
  is_enabled: boolean;
  is_primary: boolean;
  created_at: string;
}

export interface AddressListResponse {
  addresses: DomainAddress[];
  total: number;
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

async function get_domain_hmac_key(): Promise<CryptoKey> {
  const raw_key = get_derived_encryption_key();

  if (!raw_key) {
    throw new Error("No encryption key available");
  }

  const encoder = new TextEncoder();
  const info = encoder.encode("astermail-domain-address-hmac-v1");
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

async function get_domain_encryption_key(): Promise<CryptoKey> {
  const key = await get_or_create_derived_encryption_crypto_key();

  if (!key) {
    throw new Error("No encryption key available");
  }

  return key;
}

export async function compute_address_hash(
  local_part: string,
  domain: string,
): Promise<string> {
  const hmac_key = await get_domain_hmac_key();
  const full_address = `${local_part.toLowerCase()}@${domain.toLowerCase()}`;
  const encoder = new TextEncoder();
  const data = encoder.encode(full_address);
  const signature = await crypto.subtle.sign("HMAC", hmac_key, data);

  return array_to_base64(new Uint8Array(signature));
}

export async function compute_address_routing_hash(
  local_part: string,
  domain: string,
): Promise<string> {
  const full_address = `${local_part.toLowerCase()}@${domain.toLowerCase()}`;
  const encoder = new TextEncoder();
  const data = encoder.encode(full_address);
  const hash = await crypto.subtle.digest(HASH_ALG, data);

  return array_to_base64(new Uint8Array(hash));
}

export async function encrypt_address_field(value: string): Promise<{
  encrypted: string;
  nonce: string;
}> {
  const key = await get_domain_encryption_key();
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

export async function decrypt_address_field(
  encrypted: string,
  nonce: string,
): Promise<string> {
  const key = await get_domain_encryption_key();
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

export async function decrypt_domain_address(
  address: DomainAddress,
): Promise<DecryptedDomainAddress> {
  const local_part = await decrypt_address_field(
    address.encrypted_local_part,
    address.local_part_nonce,
  );

  let display_name: string | undefined;

  if (address.encrypted_display_name && address.display_name_nonce) {
    display_name = await decrypt_address_field(
      address.encrypted_display_name,
      address.display_name_nonce,
    );
  }

  return {
    id: address.id,
    domain_id: address.domain_id,
    local_part,
    display_name,
    profile_picture: address.profile_picture,
    is_enabled: address.is_enabled,
    is_primary: address.is_primary,
    created_at: address.created_at,
  };
}

export async function decrypt_domain_addresses(
  addresses: DomainAddress[],
): Promise<DecryptedDomainAddress[]> {
  return Promise.all(
    addresses.map((address) => decrypt_domain_address(address)),
  );
}

export async function list_domains(): Promise<ApiResponse<DomainListResponse>> {
  return api_client.get<DomainListResponse>("/addresses/v1/domains");
}

export async function get_domain(
  domain_id: string,
): Promise<ApiResponse<CustomDomain>> {
  return api_client.get<CustomDomain>(`/addresses/v1/domains/${domain_id}`);
}

export async function add_domain(
  domain_name: string,
): Promise<ApiResponse<AddDomainResponse>> {
  return api_client.post<AddDomainResponse>("/addresses/v1/domains", {
    domain_name,
  });
}

export async function update_domain(
  domain_id: string,
  updates: {
    catch_all_enabled?: boolean;
    is_primary?: boolean;
  },
): Promise<ApiResponse<CustomDomain>> {
  return api_client.patch<CustomDomain>(
    `/addresses/v1/domains/${domain_id}`,
    updates,
  );
}

export async function delete_domain(
  domain_id: string,
): Promise<ApiResponse<{ success: boolean }>> {
  return api_client.delete<{ success: boolean }>(
    `/addresses/v1/domains/${domain_id}`,
  );
}

export async function trigger_verification(
  domain_id: string,
): Promise<ApiResponse<VerificationResult>> {
  return api_client.post<VerificationResult>(
    `/addresses/v1/domains/${domain_id}/verify`,
    {},
    { timeout: 45000 },
  );
}

export async function get_dns_records(
  domain_id: string,
): Promise<ApiResponse<DnsRecordsResponse>> {
  return api_client.get<DnsRecordsResponse>(
    `/addresses/v1/domains/${domain_id}/dns-records`,
  );
}

export async function rotate_dkim(
  domain_id: string,
): Promise<ApiResponse<DkimRotationResponse>> {
  return api_client.post<DkimRotationResponse>(
    `/addresses/v1/domains/${domain_id}/dkim/rotate`,
    {},
  );
}

export async function get_domain_limit(): Promise<
  ApiResponse<DomainLimitResponse>
> {
  return api_client.get<DomainLimitResponse>("/addresses/v1/domains/limit");
}

export async function list_domain_addresses(
  domain_id: string,
): Promise<ApiResponse<AddressListResponse>> {
  return api_client.get<AddressListResponse>(
    `/addresses/v1/domains/${domain_id}/addresses`,
  );
}

export async function add_domain_address(
  domain_id: string,
  local_part: string,
  domain_name: string,
  display_name?: string,
  profile_picture?: string,
): Promise<ApiResponse<DomainAddress>> {
  const normalized_local_part = local_part.toLowerCase().trim();
  const address_hash = await compute_address_hash(
    normalized_local_part,
    domain_name,
  );
  const address_routing_hash = await compute_address_routing_hash(
    normalized_local_part,
    domain_name,
  );
  const { encrypted: encrypted_local_part, nonce: local_part_nonce } =
    await encrypt_address_field(normalized_local_part);

  const request: {
    encrypted_local_part: string;
    local_part_nonce: string;
    local_part_hash: string;
    address_routing_hash: string;
    encrypted_display_name?: string;
    display_name_nonce?: string;
    profile_picture?: string;
  } = {
    encrypted_local_part,
    local_part_nonce,
    local_part_hash: address_hash,
    address_routing_hash,
  };

  if (display_name) {
    const { encrypted: encrypted_display_name, nonce: display_name_nonce } =
      await encrypt_address_field(display_name);

    request.encrypted_display_name = encrypted_display_name;
    request.display_name_nonce = display_name_nonce;
  }

  if (profile_picture) {
    request.profile_picture = profile_picture;
  }

  return api_client.post<DomainAddress>(
    `/addresses/v1/domains/${domain_id}/addresses`,
    request,
  );
}

export async function update_domain_address(
  domain_id: string,
  address_id: string,
  updates: {
    profile_picture?: string | null;
  },
): Promise<ApiResponse<{ success: boolean }>> {
  return api_client.patch<{ success: boolean }>(
    `/addresses/v1/domains/${domain_id}/addresses/${address_id}`,
    updates,
  );
}

export async function delete_domain_address(
  domain_id: string,
  address_id: string,
): Promise<ApiResponse<{ success: boolean }>> {
  return api_client.delete<{ success: boolean }>(
    `/addresses/v1/domains/${domain_id}/addresses/${address_id}`,
  );
}

export function validate_domain_name(domain: string): {
  valid: boolean;
  error?: string;
} {
  if (!domain || domain.length === 0) {
    return { valid: false, error: "Domain name cannot be empty" };
  }

  if (domain.length > 253) {
    return { valid: false, error: "Domain name is too long" };
  }

  const domain_lower = domain.toLowerCase();

  if (
    domain_lower.endsWith(".astermail.org") ||
    domain_lower.endsWith(".aster.cx") ||
    domain_lower === "astermail.org" ||
    domain_lower === "aster.cx"
  ) {
    return {
      valid: false,
      error: "Cannot use astermail.org or aster.cx domains",
    };
  }

  const parts = domain.split(".");

  if (parts.length < 2) {
    return { valid: false, error: "Invalid domain format" };
  }

  const valid_label_pattern = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/i;

  for (const part of parts) {
    if (part.length === 0 || part.length > 63) {
      return { valid: false, error: "Invalid domain label length" };
    }

    if (!valid_label_pattern.test(part)) {
      return { valid: false, error: "Domain contains invalid characters" };
    }
  }

  return { valid: true };
}

export function validate_local_part(local_part: string): {
  valid: boolean;
  error?: string;
} {
  if (!local_part || local_part.length === 0) {
    return { valid: false, error: "Address cannot be empty" };
  }

  if (local_part.length < 1) {
    return { valid: false, error: "Address must be at least 1 character" };
  }

  if (local_part.length > 64) {
    return { valid: false, error: "Address must be 64 characters or less" };
  }

  const valid_pattern = /^[a-z0-9][a-z0-9._-]*[a-z0-9]$|^[a-z0-9]$/;

  if (!valid_pattern.test(local_part.toLowerCase())) {
    return {
      valid: false,
      error:
        "Address can only contain letters, numbers, dots, underscores, and hyphens",
    };
  }

  if (local_part.includes("..")) {
    return { valid: false, error: "Address cannot contain consecutive dots" };
  }

  return { valid: true };
}

export function get_status_color(status: string): string {
  switch (status) {
    case "active":
      return "bg-green-500/15 text-green-600 dark:text-green-400";
    case "pending":
    case "verifying":
    case "dns_pending":
      return "bg-yellow-500/15 text-yellow-600 dark:text-yellow-400";
    case "suspended":
    case "failed":
      return "bg-red-500/15 text-red-600 dark:text-red-400";
    default:
      return "bg-gray-500/15 text-gray-600 dark:text-gray-400";
  }
}

export function get_status_label(status: string): string {
  switch (status) {
    case "active":
      return "Active";
    case "pending":
      return "Pending";
    case "verifying":
      return "Verifying";
    case "dns_pending":
      return "DNS Pending";
    case "suspended":
      return "Suspended";
    case "failed":
      return "Failed";
    default:
      return status;
  }
}

export function get_health_color(health: string): string {
  switch (health) {
    case "healthy":
      return "text-green-500";
    case "degraded":
      return "text-yellow-500";
    case "unhealthy":
      return "text-red-500";
    default:
      return "text-gray-500";
  }
}

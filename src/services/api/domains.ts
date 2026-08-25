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
import type { TranslationKey } from "@/lib/i18n/types";

import { api_client, type ApiResponse } from "./client";
import { en } from "@/lib/i18n/translations/en";

import { decrypt_aes_gcm_with_fallback } from "@/services/crypto/legacy_keks";

import {
  get_or_create_derived_encryption_crypto_key,
  get_derived_encryption_key,
} from "@/services/crypto/memory_key_store";
import { zero_uint8_array } from "@/services/crypto/secure_memory";


export interface DnsRecord {
  record_type: string;
  host: string;
  value: string;
  purpose: string;
  is_verified: boolean;
  priority?: number;
  required?: boolean;
  caveat_key?: string;
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

export type DomainCheckKey = "mx" | "spf" | "dkim" | "dmarc";
export type DomainCheckOutcome = "pass" | "fail" | "unknown";
export type DomainHealthSeverity = "ok" | "warning" | "critical";

export interface DomainCheck {
  key: DomainCheckKey;
  outcome: DomainCheckOutcome;
  reason?: string;
  detail?: string;
}

export interface DomainHealth {
  domain_id: string;
  domain_name: string;
  status: string;
  health_status: string;
  severity: DomainHealthSeverity;
  receiving_mail: boolean;
  sending_trusted: boolean;
  checks: DomainCheck[];
  reasons: string[];
  dmarc_policy?: string;
  checked_at: string;
  cached: boolean;
}

export interface DomainLimitResponse {
  current_count: number;
  max_domains: number;
  can_add: boolean;
}

export interface DomainSearchResult {
  domain: string;
  available: boolean;
  price_cents: number | null;
  renewal_price_cents: number | null;
  currency: string;
}

export interface DomainSearchResponse {
  results: DomainSearchResult[];
  suggestions?: DomainSearchResult[];
  has_more_suggestions?: boolean;
  next_suggest_page?: number;
}

export interface DomainCheckoutResponse {
  order_id: string;
  checkout_url: string;
}

export interface DomainOrder {
  id: string;
  domain: string;
  status: string;
  order_type: string;
  fulfillment_step: string | null;
  years: number;
  price_cents: number;
  currency: string;
  custom_domain_id: string | null;
  expires_at: string | null;
  last_error: string | null;
  created_at: string;
}

export interface DomainOrderListResponse {
  orders: DomainOrder[];
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

  zero_uint8_array(raw_key);
  zero_uint8_array(combined);

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
  const full_address = `${local_part.toLowerCase().replace(/\./g, "")}@${domain.toLowerCase()}`;
  const encoder = new TextEncoder();
  const data = encoder.encode(full_address);
  const signature = await crypto.subtle.sign("HMAC", hmac_key, data);

  return array_to_base64(new Uint8Array(signature));
}

export async function compute_address_routing_hash(
  local_part: string,
  domain: string,
): Promise<string> {
  const full_address = `${local_part.toLowerCase().replace(/\./g, "")}@${domain.toLowerCase()}`;
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
  const decrypted = await decrypt_aes_gcm_with_fallback(key, ciphertext, iv);
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

const DOMAIN_ADDRESS_DECRYPT_BATCH_SIZE = 25;

export async function decrypt_domain_addresses(
  addresses: DomainAddress[],
): Promise<DecryptedDomainAddress[]> {
  const decrypted: DecryptedDomainAddress[] = [];

  for (let i = 0; i < addresses.length; i += DOMAIN_ADDRESS_DECRYPT_BATCH_SIZE) {
    const batch = addresses.slice(i, i + DOMAIN_ADDRESS_DECRYPT_BATCH_SIZE);
    const results = await Promise.allSettled(
      batch.map((address) => decrypt_domain_address(address)),
    );

    for (const result of results) {
      if (result.status === "fulfilled") decrypted.push(result.value);
    }

    if (i + DOMAIN_ADDRESS_DECRYPT_BATCH_SIZE < addresses.length) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }

  return decrypted;
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
  captcha_token?: string,
): Promise<ApiResponse<AddDomainResponse>> {
  return api_client.post<AddDomainResponse>("/addresses/v1/domains", {
    domain_name,
    captcha_token,
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

export async function get_domain_health(
  domain_id: string,
): Promise<ApiResponse<DomainHealth>> {
  return api_client.get<DomainHealth>(
    `/addresses/v1/domains/${domain_id}/health`,
    { timeout: 45000 },
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

export async function bulk_add_domain_addresses(
  domain_id: string,
  domain_name: string,
  items: Array<{ local_part: string; display_name?: string; is_enabled?: boolean }>,
): Promise<ApiResponse<{ created: number; failed: number }>> {
  const addresses = await Promise.all(
    items.map(async (item) => {
      const normalized = item.local_part.toLowerCase().trim();
      const [local_part_hash, address_routing_hash, enc] = await Promise.all([
        compute_address_hash(normalized, domain_name),
        compute_address_routing_hash(normalized, domain_name),
        encrypt_address_field(normalized),
      ]);
      const entry: {
        encrypted_local_part: string;
        local_part_nonce: string;
        local_part_hash: string;
        address_routing_hash: string;
        encrypted_display_name?: string;
        display_name_nonce?: string;
        is_enabled?: boolean;
      } = {
        encrypted_local_part: enc.encrypted,
        local_part_nonce: enc.nonce,
        local_part_hash,
        address_routing_hash,
      };
      if (item.is_enabled !== undefined) entry.is_enabled = item.is_enabled;
      if (item.display_name) {
        const enc_dn = await encrypt_address_field(item.display_name);
        entry.encrypted_display_name = enc_dn.encrypted;
        entry.display_name_nonce = enc_dn.nonce;
      }
      return entry;
    }),
  );
  return api_client.post<{ created: number; failed: number }>(
    `/addresses/v1/domains/${domain_id}/bulk-addresses`,
    { addresses },
  );
}

export async function add_domain_address(
  domain_id: string,
  local_part: string,
  domain_name: string,
  captcha_token?: string,
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
    captcha_token?: string;
  } = {
    encrypted_local_part,
    local_part_nonce,
    local_part_hash: address_hash,
    address_routing_hash,
    captcha_token,
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
    display_name?: string;
    is_enabled?: boolean;
  },
): Promise<ApiResponse<{ success: boolean }>> {
  const body: {
    profile_picture?: string | null;
    encrypted_display_name?: string;
    display_name_nonce?: string;
    is_enabled?: boolean;
  } = {};

  if (updates.is_enabled !== undefined) {
    body.is_enabled = updates.is_enabled;
  }

  if (updates.profile_picture !== undefined) {
    body.profile_picture = updates.profile_picture;
  }

  if (updates.display_name !== undefined) {
    const { encrypted, nonce } = await encrypt_address_field(
      updates.display_name,
    );

    body.encrypted_display_name = encrypted;
    body.display_name_nonce = nonce;
  }

  return api_client.patch<{ success: boolean }>(
    `/addresses/v1/domains/${domain_id}/addresses/${address_id}`,
    body,
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

export async function search_purchasable_domains(
  query: string,
  suggest_page?: number,
): Promise<ApiResponse<DomainSearchResponse>> {
  const page_param =
    suggest_page !== undefined ? `&suggest_page=${suggest_page}` : "";

  return api_client.get<DomainSearchResponse>(
    `/addresses/v1/domains/purchase/search?query=${encodeURIComponent(query)}${page_param}`,
  );
}

export async function create_domain_checkout(
  domain: string,
  years: number,
  payment_method: "stripe" | "crypto",
  captcha_token?: string,
): Promise<ApiResponse<DomainCheckoutResponse>> {
  return api_client.post<DomainCheckoutResponse>(
    "/addresses/v1/domains/purchase/checkout",
    { domain, years, payment_method, captcha_token },
  );
}

export async function get_domain_order(
  order_id: string,
): Promise<ApiResponse<DomainOrder>> {
  return api_client.get<DomainOrder>(
    `/addresses/v1/domains/purchase/orders/${order_id}`,
  );
}

export async function list_domain_orders(): Promise<
  ApiResponse<DomainOrderListResponse>
> {
  return api_client.get<DomainOrderListResponse>(
    "/addresses/v1/domains/purchase/orders",
  );
}

export async function cancel_domain_order(
  order_id: string,
): Promise<ApiResponse<{ success: boolean }>> {
  return api_client.post<{ success: boolean }>(
    `/addresses/v1/domains/purchase/orders/${order_id}/cancel`,
    {},
  );
}

export async function renew_domain_order(
  order_id: string,
  years: number,
  payment_method: "stripe" | "crypto",
  captcha_token?: string,
): Promise<ApiResponse<DomainCheckoutResponse>> {
  return api_client.post<DomainCheckoutResponse>(
    `/addresses/v1/domains/purchase/orders/${order_id}/renew`,
    { years, payment_method, captcha_token },
  );
}

export function format_domain_price(
  cents: number | null,
  currency: string = "usd",
): string {
  if (cents === null) return "";
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: currency.toUpperCase(),
    minimumFractionDigits: 2,
  }).format(cents / 100);
}

export function validate_domain_name(domain: string): {
  valid: boolean;
  error?: string;
  error_key?: TranslationKey;
} {
  if (!domain || domain.length === 0) {
    return {
      valid: false,
      error: en.errors.domain_empty,
      error_key: "errors.domain_empty",
    };
  }

  if (domain.length > 253) {
    return {
      valid: false,
      error: en.errors.domain_too_long,
      error_key: "errors.domain_too_long",
    };
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
      error: en.errors.domain_reserved,
      error_key: "errors.domain_reserved",
    };
  }

  const parts = domain.split(".");

  if (parts.length < 2) {
    return {
      valid: false,
      error: en.errors.domain_invalid_format,
      error_key: "errors.domain_invalid_format",
    };
  }

  const valid_label_pattern = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/i;

  for (const part of parts) {
    if (part.length === 0 || part.length > 63) {
      return {
        valid: false,
        error: en.errors.domain_invalid_label,
        error_key: "errors.domain_invalid_label",
      };
    }

    if (!valid_label_pattern.test(part)) {
      return {
        valid: false,
        error: en.errors.domain_invalid_chars,
        error_key: "errors.domain_invalid_chars",
      };
    }
  }

  return { valid: true };
}

export function validate_local_part(local_part: string): {
  valid: boolean;
  error?: string;
  error_key?: TranslationKey;
} {
  if (!local_part || local_part.length === 0) {
    return {
      valid: false,
      error: en.errors.address_empty,
      error_key: "errors.address_empty",
    };
  }

  if (local_part.length < 1) {
    return {
      valid: false,
      error: en.errors.address_too_short,
      error_key: "errors.address_too_short",
    };
  }

  if (local_part.length > 64) {
    return {
      valid: false,
      error: en.errors.address_too_long,
      error_key: "errors.address_too_long",
    };
  }

  const valid_pattern = /^[a-z0-9][a-z0-9._-]*[a-z0-9]$|^[a-z0-9]$/;

  if (!valid_pattern.test(local_part.toLowerCase())) {
    return {
      valid: false,
      error: en.errors.address_invalid_chars,
      error_key: "errors.address_invalid_chars",
    };
  }

  if (local_part.includes("..")) {
    return {
      valid: false,
      error: en.errors.address_consecutive_dots,
      error_key: "errors.address_consecutive_dots",
    };
  }

  if (/^[0-9]+$/.test(local_part)) {
    return {
      valid: false,
      error: en.errors.address_numeric_only,
      error_key: "errors.address_numeric_only",
    };
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

export function get_status_label(
  status: string,
  t: (key: TranslationKey, params?: Record<string, string | number>) => string,
): string {
  switch (status) {
    case "active":
      return t("settings.status_active");
    case "pending":
      return t("settings.status_pending");
    case "verifying":
      return t("settings.status_verifying");
    case "dns_pending":
      return t("settings.status_dns_pending");
    case "suspended":
      return t("settings.status_suspended");
    case "failed":
      return t("settings.status_failed");
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

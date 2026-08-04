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

import { api_client, type ApiResponse } from "./client";

import { en } from "@/lib/i18n/translations/en";
import {
  get_or_create_derived_encryption_crypto_key,
  get_derived_encryption_key,
} from "@/services/crypto/memory_key_store";
import { zero_uint8_array } from "@/services/crypto/secure_memory";
import { decrypt_aes_gcm_with_fallback } from "@/services/crypto/legacy_keks";

const HASH_ALG = ["SHA", "256"].join("-");

export interface EmailAlias {
  id: string;
  encrypted_local_part: string;
  local_part_nonce: string;
  encrypted_display_name?: string;
  display_name_nonce?: string;
  alias_address_hash: string;
  routing_address_hash?: string;
  domain: string;
  is_enabled: boolean;
  is_random: boolean;
  is_pinned?: boolean;
  never_inbox?: boolean;
  delivery_folder_token?: string | null;
  profile_picture?: string;
  encrypted_note?: string;
  note_nonce?: string;
  encrypted_websites?: string;
  websites_nonce?: string;
  downgrade_grace_expires_at?: string;
  created_at: string;
  updated_at: string;
}

export interface DecryptedEmailAlias {
  id: string;
  local_part: string;
  display_name?: string;
  note?: string;
  websites?: string[];
  alias_address_hash: string;
  domain: string;
  full_address: string;
  is_enabled: boolean;
  is_random: boolean;
  is_pinned?: boolean;
  never_inbox?: boolean;
  delivery_folder_token?: string | null;
  decryption_failed?: boolean;
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
  encrypted_note?: string;
  note_nonce?: string;
  encrypted_websites?: string;
  websites_nonce?: string;
  captcha_token?: string;
}

export interface CreateAliasResponse {
  id: string;
  success: boolean;
}

export interface UpdateAliasRequest {
  encrypted_display_name?: string;
  display_name_nonce?: string;
  is_enabled?: boolean;
  never_inbox?: boolean;
  delivery_folder_token?: string | null;
  profile_picture?: string | null;
  encrypted_local_part?: string;
  local_part_nonce?: string;
  encrypted_note?: string | null;
  note_nonce?: string | null;
  encrypted_websites?: string | null;
  websites_nonce?: string | null;
  routing_address_hash?: string;
}

export const MAX_ALIAS_WEBSITES = 10;
export const MAX_WEBSITE_URL_LENGTH = 200;

export function normalize_website_url(raw: string): string | null {
  const cleaned = raw.replace(/[\u0000-\u001f\u007f\s]/g, "");

  if (!cleaned) return null;

  const with_scheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(cleaned)
    ? cleaned
    : `https://${cleaned}`;

  if (with_scheme.length > MAX_WEBSITE_URL_LENGTH) return null;

  try {
    const parsed = new URL(with_scheme);

    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return null;
    }
    if (!parsed.hostname || !parsed.hostname.includes(".")) return null;

    return with_scheme;
  } catch {
    return null;
  }
}

const KNOWN_LONG_TLDS = new Set([
  "com",
  "net",
  "org",
  "edu",
  "gov",
  "mil",
  "int",
  "info",
  "biz",
  "name",
  "pro",
  "app",
  "dev",
  "art",
  "bar",
  "bet",
  "bid",
  "bio",
  "blog",
  "boo",
  "bot",
  "buy",
  "cab",
  "cafe",
  "cam",
  "camp",
  "car",
  "cards",
  "care",
  "cash",
  "casa",
  "chat",
  "city",
  "click",
  "cloud",
  "club",
  "code",
  "coffee",
  "college",
  "company",
  "computer",
  "cool",
  "coop",
  "credit",
  "data",
  "date",
  "day",
  "deals",
  "design",
  "diet",
  "digital",
  "direct",
  "dog",
  "domains",
  "download",
  "earth",
  "eco",
  "email",
  "energy",
  "eng",
  "events",
  "exchange",
  "expert",
  "family",
  "fan",
  "fans",
  "farm",
  "fashion",
  "film",
  "finance",
  "fish",
  "fit",
  "fitness",
  "flowers",
  "football",
  "forum",
  "foundation",
  "fun",
  "fund",
  "fyi",
  "gallery",
  "game",
  "games",
  "garden",
  "gift",
  "gives",
  "global",
  "gold",
  "golf",
  "graphics",
  "green",
  "group",
  "guide",
  "guru",
  "haus",
  "health",
  "help",
  "here",
  "hockey",
  "holdings",
  "holiday",
  "homes",
  "horse",
  "host",
  "hosting",
  "house",
  "how",
  "icu",
  "ink",
  "institute",
  "insure",
  "irish",
  "jobs",
  "jetzt",
  "kim",
  "kitchen",
  "land",
  "law",
  "lawyer",
  "lease",
  "legal",
  "life",
  "lighting",
  "limited",
  "link",
  "live",
  "loan",
  "loans",
  "lol",
  "love",
  "ltd",
  "luxury",
  "mail",
  "management",
  "market",
  "marketing",
  "media",
  "meet",
  "meme",
  "memorial",
  "men",
  "menu",
  "mobi",
  "moda",
  "moe",
  "money",
  "monster",
  "mortgage",
  "moscow",
  "movie",
  "museum",
  "music",
  "network",
  "new",
  "news",
  "ngo",
  "ninja",
  "now",
  "one",
  "ong",
  "onl",
  "online",
  "ooo",
  "page",
  "partners",
  "parts",
  "party",
  "pet",
  "photo",
  "photography",
  "photos",
  "pics",
  "pictures",
  "pink",
  "pizza",
  "place",
  "plus",
  "poker",
  "porn",
  "post",
  "press",
  "prof",
  "promo",
  "properties",
  "property",
  "pub",
  "quest",
  "racing",
  "radio",
  "recipes",
  "red",
  "rehab",
  "reise",
  "reisen",
  "rent",
  "rentals",
  "repair",
  "report",
  "rest",
  "restaurant",
  "review",
  "reviews",
  "rich",
  "rip",
  "rocks",
  "rodeo",
  "run",
  "sale",
  "salon",
  "school",
  "science",
  "services",
  "sex",
  "sexy",
  "shoes",
  "shop",
  "shopping",
  "show",
  "singles",
  "site",
  "ski",
  "soccer",
  "social",
  "software",
  "solar",
  "solutions",
  "space",
  "sport",
  "store",
  "stream",
  "studio",
  "study",
  "style",
  "sucks",
  "supply",
  "support",
  "surf",
  "systems",
  "tattoo",
  "tax",
  "team",
  "tech",
  "technology",
  "tel",
  "tennis",
  "theater",
  "tickets",
  "tips",
  "tires",
  "today",
  "tools",
  "top",
  "tours",
  "town",
  "toys",
  "trade",
  "trading",
  "training",
  "travel",
  "tube",
  "university",
  "uno",
  "vacations",
  "ventures",
  "vet",
  "video",
  "villas",
  "vin",
  "vip",
  "vision",
  "vodka",
  "vote",
  "voyage",
  "wang",
  "watch",
  "weather",
  "webcam",
  "website",
  "wedding",
  "wiki",
  "win",
  "wine",
  "work",
  "works",
  "world",
  "wtf",
  "xin",
  "xyz",
  "yoga",
  "zone",
]);

const HOST_LABEL_PATTERN = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

export function is_plausible_website_host(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  const labels = host.split(".");

  if (labels.length < 2) return false;
  if (labels.some((label) => !HOST_LABEL_PATTERN.test(label))) return false;

  const tld = labels[labels.length - 1];

  if (tld.startsWith("xn--")) return tld.length > 4;
  if (!/^[a-z]+$/.test(tld)) return false;
  if (tld.length === 2) return true;

  return KNOWN_LONG_TLDS.has(tld);
}

export function validate_website_input(raw: string): string | null {
  const normalized = normalize_website_url(raw);

  if (!normalized) return null;

  try {
    if (!is_plausible_website_host(new URL(normalized).hostname)) return null;
  } catch {
    return null;
  }

  return normalized;
}

export function parse_websites_payload(payload: string): string[] {
  try {
    const parsed = JSON.parse(payload);

    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter((entry): entry is string => typeof entry === "string")
      .map((entry) => normalize_website_url(entry))
      .filter((entry): entry is string => entry !== null)
      .slice(0, MAX_ALIAS_WEBSITES);
  } catch {
    return [];
  }
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

async function get_alias_encryption_key(): Promise<CryptoKey> {
  const key = await get_or_create_derived_encryption_crypto_key();

  if (!key) {
    throw new Error("No encryption key available");
  }

  return key;
}

function normalize_local_part(local_part: string): string {
  return local_part.toLowerCase().replace(/\./g, "");
}

export async function compute_alias_hash(
  local_part: string,
  domain: string,
): Promise<string> {
  const hmac_key = await get_alias_hmac_key();
  const full_address = `${normalize_local_part(local_part)}@${domain}`;
  const encoder = new TextEncoder();
  const data = encoder.encode(full_address);
  const signature = await crypto.subtle.sign("HMAC", hmac_key, data);

  return array_to_base64(new Uint8Array(signature));
}

export async function compute_routing_hash(
  local_part: string,
  domain: string,
): Promise<string> {
  const full_address = `${normalize_local_part(local_part)}@${domain}`;
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
  const decrypted = await decrypt_aes_gcm_with_fallback(key, ciphertext, iv);
  const decoder = new TextDecoder();

  return decoder.decode(decrypted);
}

export async function decrypt_alias(
  alias: EmailAlias,
): Promise<DecryptedEmailAlias> {
  if (alias.is_random) {
    const local_part = new TextDecoder().decode(
      base64_to_array(alias.encrypted_local_part),
    );

    let display_name: string | undefined;

    if (alias.encrypted_display_name && alias.display_name_nonce) {
      try {
        display_name = await decrypt_alias_field(
          alias.encrypted_display_name,
          alias.display_name_nonce,
        );
      } catch {}
    }

    let note: string | undefined;

    if (alias.encrypted_note && alias.note_nonce) {
      try {
        note = await decrypt_alias_field(
          alias.encrypted_note,
          alias.note_nonce,
        );
      } catch {}
    }

    let websites: string[] | undefined;

    if (alias.encrypted_websites && alias.websites_nonce) {
      try {
        const payload = await decrypt_alias_field(
          alias.encrypted_websites,
          alias.websites_nonce,
        );
        const parsed = parse_websites_payload(payload);

        if (parsed.length > 0) websites = parsed;
      } catch {}
    }

    return {
      id: alias.id,
      local_part,
      display_name,
      note,
      websites,
      alias_address_hash: alias.alias_address_hash,
      domain: alias.domain,
      full_address: `${local_part}@${alias.domain}`,
      is_enabled: alias.is_enabled,
      is_random: alias.is_random,
      is_pinned: alias.is_pinned,
      never_inbox: alias.never_inbox ?? false,
      delivery_folder_token: alias.delivery_folder_token ?? null,
      profile_picture: alias.profile_picture,
      downgrade_grace_expires_at: alias.downgrade_grace_expires_at,
      created_at: alias.created_at,
      updated_at: alias.updated_at,
    };
  }

  try {
    const local_part = await decrypt_alias_field(
      alias.encrypted_local_part,
      alias.local_part_nonce,
    );

    let display_name: string | undefined;

    if (alias.encrypted_display_name && alias.display_name_nonce) {
      try {
        display_name = await decrypt_alias_field(
          alias.encrypted_display_name,
          alias.display_name_nonce,
        );
      } catch {}
    }

    let note: string | undefined;

    if (alias.encrypted_note && alias.note_nonce) {
      try {
        note = await decrypt_alias_field(
          alias.encrypted_note,
          alias.note_nonce,
        );
      } catch {}
    }

    let websites: string[] | undefined;

    if (alias.encrypted_websites && alias.websites_nonce) {
      try {
        const payload = await decrypt_alias_field(
          alias.encrypted_websites,
          alias.websites_nonce,
        );
        const parsed = parse_websites_payload(payload);

        if (parsed.length > 0) websites = parsed;
      } catch {}
    }

    return {
      id: alias.id,
      local_part,
      display_name,
      note,
      websites,
      alias_address_hash: alias.alias_address_hash,
      domain: alias.domain,
      full_address: `${local_part}@${alias.domain}`,
      is_enabled: alias.is_enabled,
      is_random: alias.is_random,
      is_pinned: alias.is_pinned,
      never_inbox: alias.never_inbox ?? false,
      delivery_folder_token: alias.delivery_folder_token ?? null,
      profile_picture: alias.profile_picture,
      downgrade_grace_expires_at: alias.downgrade_grace_expires_at,
      created_at: alias.created_at,
      updated_at: alias.updated_at,
    };
  } catch {
    return {
      id: alias.id,
      local_part: "",
      alias_address_hash: alias.alias_address_hash,
      domain: alias.domain,
      full_address: `@${alias.domain}`,
      is_enabled: alias.is_enabled,
      is_random: alias.is_random,
      is_pinned: alias.is_pinned,
      never_inbox: alias.never_inbox ?? false,
      delivery_folder_token: alias.delivery_folder_token ?? null,
      decryption_failed: true,
      profile_picture: alias.profile_picture,
      downgrade_grace_expires_at: alias.downgrade_grace_expires_at,
      created_at: alias.created_at,
      updated_at: alias.updated_at,
    };
  }
}

const DECRYPT_BATCH_SIZE = 100;

export async function decrypt_aliases(
  aliases: EmailAlias[],
): Promise<DecryptedEmailAlias[]> {
  const decrypted: DecryptedEmailAlias[] = [];

  for (let i = 0; i < aliases.length; i += DECRYPT_BATCH_SIZE) {
    const batch = aliases.slice(i, i + DECRYPT_BATCH_SIZE);
    const results = await Promise.allSettled(
      batch.map((alias) => decrypt_alias(alias)),
    );

    for (const result of results) {
      if (result.status === "fulfilled") decrypted.push(result.value);
    }

    if (i + DECRYPT_BATCH_SIZE < aliases.length) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }

  return decrypted;
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

const ALIAS_FETCH_PAGE_SIZE = 1000;
const ALIAS_FETCH_MAX_PAGES = 100;

async function fetch_alias_page_with_retry(
  limit: number,
  offset: number,
): Promise<AliasListResponse | null> {
  const first_attempt = await list_aliases({ limit, offset });

  if (first_attempt.data) return first_attempt.data;

  const second_attempt = await list_aliases({ limit, offset });

  return second_attempt.data ?? null;
}

export async function list_all_aliases(): Promise<{
  aliases: EmailAlias[];
  max_aliases: number;
  total: number;
  error?: string;
}> {
  const first_response = await list_aliases({
    limit: ALIAS_FETCH_PAGE_SIZE,
    offset: 0,
  });

  if (!first_response.data) {
    return {
      aliases: [],
      max_aliases: 0,
      total: 0,
      error: first_response.error,
    };
  }

  const first_page = first_response.data;
  const aliases = [...first_page.aliases];
  const max_aliases = first_page.max_aliases;
  const total = first_page.total;

  if (!first_page.has_more || first_page.aliases.length === 0) {
    return { aliases, max_aliases, total };
  }

  const effective_page_size = first_page.aliases.length;
  const remaining = Math.max(0, total - effective_page_size);
  const remaining_pages = Math.min(
    Math.ceil(remaining / effective_page_size),
    ALIAS_FETCH_MAX_PAGES - 1,
  );

  const page_results = await Promise.all(
    Array.from({ length: remaining_pages }, (_, i) =>
      fetch_alias_page_with_retry(
        effective_page_size,
        effective_page_size * (i + 1),
      ),
    ),
  );

  const seen_ids = new Set(aliases.map((a) => a.id));

  for (const page of page_results) {
    if (!page) continue;

    for (const alias of page.aliases) {
      if (seen_ids.has(alias.id)) continue;
      seen_ids.add(alias.id);
      aliases.push(alias);
    }
  }

  return { aliases, max_aliases, total };
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
  captcha_token?: string,
  note?: string,
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
    captcha_token,
  };

  if (display_name) {
    const { encrypted: encrypted_display_name, nonce: display_name_nonce } =
      await encrypt_alias_field(display_name);

    request.encrypted_display_name = encrypted_display_name;
    request.display_name_nonce = display_name_nonce;
  }

  if (note) {
    const { encrypted: encrypted_note, nonce: note_nonce } =
      await encrypt_alias_field(note);

    request.encrypted_note = encrypted_note;
    request.note_nonce = note_nonce;
  }

  return api_client.post<CreateAliasResponse>("/addresses/v1/aliases", request);
}

export async function update_alias(
  alias_id: string,
  updates: {
    display_name?: string;
    is_enabled?: boolean;
    never_inbox?: boolean;
    delivery_folder_token?: string | null;
    profile_picture?: string | null;
    note?: string | null;
    websites?: string[] | null;
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

  if (updates.never_inbox !== undefined) {
    request.never_inbox = updates.never_inbox;
  }

  if (updates.delivery_folder_token !== undefined) {
    request.delivery_folder_token = updates.delivery_folder_token;
  }

  if (updates.profile_picture !== undefined) {
    request.profile_picture = updates.profile_picture;
  }

  if (updates.note !== undefined) {
    if (updates.note === null || updates.note === "") {
      request.encrypted_note = null;
      request.note_nonce = null;
    } else {
      const { encrypted, nonce } = await encrypt_alias_field(updates.note);

      request.encrypted_note = encrypted;
      request.note_nonce = nonce;
    }
  }

  if (updates.websites !== undefined) {
    const normalized = (updates.websites ?? [])
      .map((url) => normalize_website_url(url))
      .filter((url): url is string => url !== null)
      .slice(0, MAX_ALIAS_WEBSITES);

    if (normalized.length === 0) {
      request.encrypted_websites = null;
      request.websites_nonce = null;
    } else {
      const { encrypted, nonce } = await encrypt_alias_field(
        JSON.stringify(normalized),
      );

      request.encrypted_websites = encrypted;
      request.websites_nonce = nonce;
    }
  }

  return api_client.patch<{ success: boolean }>(
    `/addresses/v1/aliases/${alias_id}`,
    request,
  );
}

export async function reencrypt_alias_local_part(
  alias_id: string,
  local_part: string,
): Promise<ApiResponse<{ success: boolean }>> {
  const { encrypted, nonce } = await encrypt_alias_field(local_part);

  return api_client.patch<{ success: boolean }>(
    `/addresses/v1/aliases/${alias_id}`,
    {
      encrypted_local_part: encrypted,
      local_part_nonce: nonce,
    },
  );
}

let routing_hash_backfill_done = false;

// Heals legacy aliases that were stored without a routing_address_hash and so silently
// drop all inbound mail. We recompute the hash locally (we can decrypt the address) and
// PATCH it. The server only fills a NULL and never overwrites, so this is idempotent and
// safe to run alongside the server-side backfill. Runs at most once per session.
export async function backfill_missing_routing_hashes(): Promise<void> {
  if (routing_hash_backfill_done) return;
  routing_hash_backfill_done = true;

  try {
    const { aliases, error } = await list_all_aliases();

    if (error) {
      routing_hash_backfill_done = false;

      return;
    }

    for (const alias of aliases) {
      if (alias.routing_address_hash) continue;

      try {
        const decrypted = await decrypt_alias(alias);

        if (decrypted.decryption_failed || !decrypted.local_part) continue;

        const routing_address_hash = await compute_routing_hash(
          decrypted.local_part,
          alias.domain,
        );

        await api_client.patch<{ success: boolean }>(
          `/addresses/v1/aliases/${alias.id}`,
          { routing_address_hash },
        );
      } catch {
        continue;
      }
    }
  } catch {
    routing_hash_backfill_done = false;
  }
}

export async function delete_alias(
  alias_id: string,
): Promise<ApiResponse<{ status: string }>> {
  return api_client.delete<{ status: string }>(
    `/addresses/v1/aliases/${alias_id}`,
  );
}

export async function toggle_alias_pin(
  alias_id: string,
): Promise<ApiResponse<{ is_pinned: boolean }>> {
  return api_client.post<{ is_pinned: boolean }>(
    `/addresses/v1/aliases/${alias_id}/pin`,
    {},
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
  error_key?: TranslationKey;
} {
  if (!local_part || local_part.length === 0) {
    return {
      valid: false,
      error: en.errors.alias_empty,
      error_key: "errors.alias_empty",
    };
  }

  if (local_part.length < 3) {
    return {
      valid: false,
      error: en.errors.alias_too_short,
      error_key: "errors.alias_too_short",
    };
  }

  if (local_part.length > 64) {
    return {
      valid: false,
      error: en.errors.alias_too_long,
      error_key: "errors.alias_too_long",
    };
  }

  const valid_pattern = /^[a-z0-9][a-z0-9._-]*[a-z0-9]$|^[a-z0-9]$/;

  if (!valid_pattern.test(local_part.toLowerCase())) {
    return {
      valid: false,
      error: en.errors.alias_invalid_chars,
      error_key: "errors.alias_invalid_chars",
    };
  }

  if (local_part.includes("..")) {
    return {
      valid: false,
      error: en.errors.alias_consecutive_dots,
      error_key: "errors.alias_consecutive_dots",
    };
  }

  if (/^[0-9]+$/.test(local_part)) {
    return {
      valid: false,
      error: en.errors.alias_numeric_only,
      error_key: "errors.alias_numeric_only",
    };
  }

  if (RESERVED_ALIAS_NAMES.has(local_part.toLowerCase())) {
    return {
      valid: false,
      error: en.errors.alias_not_available,
      error_key: "errors.alias_not_available",
    };
  }

  return { valid: true };
}

export async function reencrypt_all_aliases(): Promise<void> {
  const { aliases, error } = await list_all_aliases();

  if (error) return;

  for (const alias of aliases) {
    if (alias.is_random) continue;

    try {
      const decrypted = await decrypt_alias(alias);

      await reencrypt_alias_local_part(alias.id, decrypted.local_part);

      if (alias.encrypted_display_name && alias.display_name_nonce) {
        const display = await decrypt_alias_field(
          alias.encrypted_display_name,
          alias.display_name_nonce,
        );
        const { encrypted, nonce } = await encrypt_alias_field(display);

        await api_client.patch(`/addresses/v1/aliases/${alias.id}`, {
          encrypted_display_name: encrypted,
          display_name_nonce: nonce,
        });
      }

      if (alias.encrypted_note && alias.note_nonce) {
        const note = await decrypt_alias_field(
          alias.encrypted_note,
          alias.note_nonce,
        );
        const { encrypted, nonce } = await encrypt_alias_field(note);

        await api_client.patch(`/addresses/v1/aliases/${alias.id}`, {
          encrypted_note: encrypted,
          note_nonce: nonce,
        });
      }

      if (alias.encrypted_websites && alias.websites_nonce) {
        const websites_payload = await decrypt_alias_field(
          alias.encrypted_websites,
          alias.websites_nonce,
        );
        const { encrypted, nonce } =
          await encrypt_alias_field(websites_payload);

        await api_client.patch(`/addresses/v1/aliases/${alias.id}`, {
          encrypted_websites: encrypted,
          websites_nonce: nonce,
        });
      }
    } catch {
      continue;
    }
  }
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

export interface AliasUnreadCount {
  alias_address_hash: string;
  count: number;
}

export interface AliasUnreadCountsResponse {
  counts: AliasUnreadCount[];
}

export async function get_alias_unread_counts(): Promise<
  ApiResponse<AliasUnreadCountsResponse>
> {
  return api_client.get<AliasUnreadCountsResponse>(
    "/addresses/v1/aliases/unread-counts",
    { skip_cache: true },
  );
}

export interface DeletedAlias {
  id: string;
  original_alias_id: string;
  encrypted_local_part: string;
  local_part_nonce: string;
  encrypted_display_name?: string;
  display_name_nonce?: string;
  encrypted_note?: string;
  note_nonce?: string;
  encrypted_websites?: string;
  websites_nonce?: string;
  alias_address_hash: string;
  routing_address_hash?: string;
  domain: string;
  is_random: boolean;
  profile_picture?: string;
  deleted_at: string;
}

export interface ListDeletedAliasesResponse {
  aliases: DeletedAlias[];
  total: number;
}

export interface AliasStats {
  received: number;
  forwarded: number;
  blocked: number;
  replied: number;
  distinct_senders: number;
  created_at: string;
  last_sender_at?: string | null;
  last_sender_encrypted?: string | null;
  last_sender_nonce?: string | null;
}

export async function list_deleted_aliases(): Promise<
  ApiResponse<ListDeletedAliasesResponse>
> {
  return api_client.get<ListDeletedAliasesResponse>(
    "/addresses/v1/aliases/deleted",
  );
}

export async function restore_alias(
  deleted_id: string,
): Promise<ApiResponse<{ id: string; success: boolean }>> {
  return api_client.post<{ id: string; success: boolean }>(
    `/addresses/v1/aliases/deleted/${deleted_id}/restore`,
    {},
  );
}

export async function purge_deleted_alias(
  deleted_id: string,
): Promise<ApiResponse<{ status: string }>> {
  return api_client.delete<{ status: string }>(
    `/addresses/v1/aliases/deleted/${deleted_id}`,
  );
}

export async function empty_deleted_aliases(): Promise<
  ApiResponse<{ status: string; count: number }>
> {
  return api_client.delete<{ status: string; count: number }>(
    `/addresses/v1/aliases/deleted`,
  );
}

export async function get_alias_stats(
  alias_id: string,
): Promise<ApiResponse<AliasStats>> {
  return api_client.get<AliasStats>(`/addresses/v1/aliases/${alias_id}/stats`);
}

export interface AliasActivityDay {
  date: string;
  received: number;
  blocked: number;
  forwarded: number;
}

export interface AliasActivityResponse {
  days: AliasActivityDay[];
}

export async function get_alias_activity(
  alias_id: string,
): Promise<ApiResponse<AliasActivityResponse>> {
  return api_client.get<AliasActivityResponse>(
    `/addresses/v1/aliases/${alias_id}/activity`,
  );
}

export interface BulkCreateAliasItem {
  encrypted_local_part: string;
  local_part_nonce: string;
  encrypted_display_name?: string;
  display_name_nonce?: string;
  alias_address_hash: string;
  routing_address_hash?: string;
  domain: string;
  encrypted_note?: string;
  note_nonce?: string;
  encrypted_websites?: string;
  websites_nonce?: string;
  is_enabled?: boolean;
}

export interface BulkCreateAliasResponse {
  created: number;
  failed: number;
}

export async function bulk_create_aliases(
  aliases: BulkCreateAliasItem[],
): Promise<ApiResponse<BulkCreateAliasResponse>> {
  return api_client.post<BulkCreateAliasResponse>(
    "/addresses/v1/aliases/bulk-create",
    { aliases },
  );
}

export interface AliasPreferences {
  alias_default_domain?: string;
  alias_sender_format: "via" | "at";
  readable_reverse_aliases: boolean;
  alias_always_expand: boolean;
  alias_unsubscribe_action: "preserve" | "disable_alias" | "block_contact";
  alias_disabled_response: "ignore" | "reject";
  alias_delete_action: "trash" | "immediate";
}

export async function get_alias_preferences(): Promise<
  ApiResponse<AliasPreferences>
> {
  return api_client.get<AliasPreferences>("/addresses/v1/aliases/preferences");
}

export async function update_alias_preferences(
  prefs: Partial<AliasPreferences>,
): Promise<ApiResponse<{ success: boolean }>> {
  return api_client.patch<{ success: boolean }>(
    "/addresses/v1/aliases/preferences",
    prefs,
  );
}

export interface DeliveryEvent {
  id: string;
  blocked_reason: "sender_pin" | "alias_rule" | "alias_disabled" | string;
  created_at: string;
}

export interface AliasDeliveryLogResponse {
  events: DeliveryEvent[];
  total: number;
}

export async function get_alias_delivery_log(
  alias_id: string,
): Promise<ApiResponse<AliasDeliveryLogResponse>> {
  return api_client.get<AliasDeliveryLogResponse>(
    `/addresses/v1/aliases/${alias_id}/delivery-log`,
  );
}

export async function get_domain_address_delivery_log(
  domain_address_id: string,
): Promise<ApiResponse<AliasDeliveryLogResponse>> {
  return api_client.get<AliasDeliveryLogResponse>(
    `/addresses/v1/aliases/domain-addresses/${domain_address_id}/delivery-log`,
  );
}

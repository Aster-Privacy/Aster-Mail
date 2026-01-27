import type { EmailCategory } from "@/types/email";
import type { CategoryToken } from "./types";
import { get_derived_encryption_key } from "../crypto/memory_key_store";
import { zero_uint8_array } from "../crypto/secure_memory";

const CATEGORY_KEY_INFO = "aster-category-key-v1";
const CATEGORY_SALT = new Uint8Array([
  0x41, 0x73, 0x74, 0x65, 0x72, 0x43, 0x61, 0x74, 0x65, 0x67, 0x6f, 0x72, 0x79,
  0x54, 0x6f, 0x6b,
]);

let cached_category_key: CryptoKey | null = null;
let cached_key_fingerprint: string | null = null;
let cached_tokens: Map<EmailCategory, string> | null = null;

function array_to_base64(arr: Uint8Array): string {
  let binary = "";
  arr.forEach((b) => (binary += String.fromCharCode(b)));
  return btoa(binary);
}

function array_to_hex(arr: Uint8Array): string {
  return Array.from(arr)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function fingerprint_key(key_bytes: Uint8Array): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", key_bytes);
  return array_to_hex(new Uint8Array(hash).slice(0, 8));
}

async function derive_category_key(): Promise<CryptoKey> {
  const encryption_key = get_derived_encryption_key();

  if (!encryption_key) {
    throw new Error("No encryption key available. Please log in.");
  }

  const current_fingerprint = await fingerprint_key(encryption_key);

  if (cached_category_key && cached_key_fingerprint === current_fingerprint) {
    zero_uint8_array(encryption_key);
    return cached_category_key;
  }

  const key_material = await crypto.subtle.importKey(
    "raw",
    encryption_key,
    "HKDF",
    false,
    ["deriveKey"],
  );

  zero_uint8_array(encryption_key);

  const category_key = await crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: CATEGORY_SALT,
      info: new TextEncoder().encode(CATEGORY_KEY_INFO),
    },
    key_material,
    { name: "HMAC", hash: "SHA-256", length: 256 },
    false,
    ["sign"],
  );

  cached_category_key = category_key;
  cached_key_fingerprint = current_fingerprint;
  cached_tokens = null;

  return category_key;
}

export async function generate_category_token(
  category: EmailCategory,
): Promise<string> {
  const key = await derive_category_key();
  const data = new TextEncoder().encode(`category:${category}`);
  const signature = await crypto.subtle.sign("HMAC", key, data);
  return array_to_base64(new Uint8Array(signature).slice(0, 16));
}

export async function generate_all_category_tokens(): Promise<
  Map<EmailCategory, string>
> {
  if (cached_tokens) {
    return cached_tokens;
  }

  const categories: EmailCategory[] = [
    "primary",
    "social",
    "promotions",
    "updates",
    "forums",
  ];

  const tokens = new Map<EmailCategory, string>();
  const key = await derive_category_key();

  for (const category of categories) {
    const data = new TextEncoder().encode(`category:${category}`);
    const signature = await crypto.subtle.sign("HMAC", key, data);
    tokens.set(category, array_to_base64(new Uint8Array(signature).slice(0, 16)));
  }

  cached_tokens = tokens;
  return tokens;
}

export async function get_category_tokens(): Promise<CategoryToken[]> {
  const token_map = await generate_all_category_tokens();
  const result: CategoryToken[] = [];

  for (const [category, token] of token_map) {
    result.push({ category, token });
  }

  return result;
}

export async function get_token_for_category(
  category: EmailCategory,
): Promise<string> {
  const tokens = await generate_all_category_tokens();
  const token = tokens.get(category);

  if (!token) {
    throw new Error(`No token found for category: ${category}`);
  }

  return token;
}

export function clear_category_token_cache(): void {
  cached_category_key = null;
  cached_key_fingerprint = null;
  cached_tokens = null;
}

export async function validate_category_key(): Promise<boolean> {
  try {
    await derive_category_key();
    return true;
  } catch {
    return false;
  }
}

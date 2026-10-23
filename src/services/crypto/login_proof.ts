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
import { AuthSaltCollisionError } from "./auth_salt_guard";
import { derive_password_hash } from "./key_manager";

import { api_client } from "@/services/api/client";

export type KdfVersion = 1 | 2;

const PINNED_ACCOUNTS_KEY = "aster:login_v2_accounts";
const MAX_PINNED_ACCOUNTS = 64;

export function read_kdf_version(value: unknown): KdfVersion {
  return value === 2 ? 2 : 1;
}

export function user_hash_pin_key(user_hash: string): string {
  return `h:${user_hash}`;
}

export function user_id_pin_key(user_id: string): string {
  return `u:${user_id}`;
}

function read_pinned_accounts(): string[] {
  try {
    const raw = localStorage.getItem(PINNED_ACCOUNTS_KEY);

    if (!raw) {
      return [];
    }

    const parsed: unknown = JSON.parse(raw);

    return Array.isArray(parsed)
      ? parsed.filter((entry): entry is string => typeof entry === "string")
      : [];
  } catch {
    return [];
  }
}

export function is_account_pinned(pin_keys: readonly string[]): boolean {
  if (pin_keys.length === 0) {
    return false;
  }

  const pinned = read_pinned_accounts();

  return pin_keys.some((key) => pinned.includes(key));
}

export function pin_accounts(pin_keys: readonly string[]): void {
  if (pin_keys.length === 0) {
    return;
  }

  const pinned = read_pinned_accounts();
  const merged = pinned.filter((entry) => !pin_keys.includes(entry));

  merged.push(...pin_keys);

  try {
    localStorage.setItem(
      PINNED_ACCOUNTS_KEY,
      JSON.stringify(
        merged.slice(Math.max(0, merged.length - MAX_PINNED_ACCOUNTS)),
      ),
    );
  } catch {
    return;
  }
}

export function v1_proofs_allowed(pin_keys: readonly string[]): boolean {
  return !is_account_pinned(pin_keys);
}

export interface AccountProof {
  password_hash: string;
  kdf_version: KdfVersion;
  hash_v1?: string;
  hash_v2: string;
}

export async function derive_account_proof(
  password: string,
  salt: Uint8Array,
  kdf_version: KdfVersion,
  pin_keys: readonly string[],
): Promise<AccountProof> {
  if (kdf_version === 1 && !v1_proofs_allowed(pin_keys)) {
    throw new AuthSaltCollisionError();
  }

  const { hash, hash_v2 } = await derive_password_hash(password, salt);

  if (kdf_version === 2) {
    return { password_hash: hash_v2, kdf_version: 2, hash_v2 };
  }

  return { password_hash: hash, kdf_version: 1, hash_v1: hash, hash_v2 };
}

export async function enroll_login_v2(
  proof: AccountProof,
  pin_keys: readonly string[],
): Promise<boolean> {
  if (proof.kdf_version === 2) {
    pin_accounts(pin_keys);

    return true;
  }

  if (!proof.hash_v1) {
    return false;
  }

  try {
    const response = await api_client.post<{ kdf_version?: number }>(
      "/core/v1/auth/me/password-v2",
      { password_hash: proof.hash_v1, password_hash_v2: proof.hash_v2 },
    );

    if (response.data && read_kdf_version(response.data.kdf_version) === 2) {
      pin_accounts(pin_keys);

      return true;
    }
  } catch {
    return false;
  }

  return false;
}

async function current_account_pin_keys(): Promise<string[]> {
  try {
    const { get_current_account_id } =
      await import("@/services/account_manager");
    const user_id = await get_current_account_id();

    return user_id ? [user_id_pin_key(user_id)] : [];
  } catch {
    return [];
  }
}

export async function derive_current_account_proof(
  password: string,
  salt: Uint8Array,
  kdf_version: KdfVersion,
  extra_pin_keys: readonly string[] = [],
): Promise<string> {
  const pin_keys = [...(await current_account_pin_keys()), ...extra_pin_keys];
  const proof = await derive_account_proof(
    password,
    salt,
    kdf_version,
    pin_keys,
  );

  if (proof.kdf_version === 2) {
    pin_accounts(pin_keys);

    return proof.password_hash;
  }

  if (await enroll_login_v2(proof, pin_keys)) {
    return proof.hash_v2;
  }

  return proof.password_hash;
}

const PENDING_ENROLLMENT_TTL_MS = 15 * 60 * 1000;

let pending_login_enrollment: {
  proof: AccountProof;
  pin_keys: string[];
  created_at: number;
} | null = null;

export function set_pending_login_enrollment(
  proof: AccountProof,
  pin_keys: readonly string[],
): void {
  pending_login_enrollment = {
    proof,
    pin_keys: [...pin_keys],
    created_at: Date.now(),
  };
}

export function clear_pending_login_enrollment(): void {
  pending_login_enrollment = null;
}

export async function flush_pending_login_enrollment(
  user_id: string,
): Promise<boolean> {
  const pending = pending_login_enrollment;

  pending_login_enrollment = null;

  if (!pending || Date.now() - pending.created_at > PENDING_ENROLLMENT_TTL_MS) {
    return false;
  }

  return enroll_login_v2(pending.proof, [
    ...pending.pin_keys,
    user_id_pin_key(user_id),
  ]);
}

export async function derive_sign_in_proof(
  password: string,
  salt: Uint8Array,
  kdf_version_value: unknown,
  user_hash: string,
): Promise<string> {
  const pin_keys = [user_hash_pin_key(user_hash)];
  const proof = await derive_account_proof(
    password,
    salt,
    read_kdf_version(kdf_version_value),
    pin_keys,
  );

  set_pending_login_enrollment(proof, pin_keys);

  return proof.password_hash;
}

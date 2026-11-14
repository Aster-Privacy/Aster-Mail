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
import type { EncryptedVault } from "./key_manager_core";

import { array_to_base64 } from "./base64";
import { RATCHET_PREVIOUS_KEYS_LIMIT } from "./key_manager_core";
import {
  current_ratchet_key_set,
  retain_replaced_ratchet_keys,
} from "./ratchet_key_continuity";

export const SIGNED_PREKEY_ROTATION_ENABLED = false;
export const SIGNED_PREKEY_ROTATION_INTERVAL_MS = 30 * 24 * 60 * 60 * 1000;
export const SIGNED_PREKEY_RETAINED_LIMIT = RATCHET_PREVIOUS_KEYS_LIMIT;

export interface FreshSignedPrekey {
  signed_prekey_jwk: string;
  signed_prekey_public: string;
}

export type SignedPrekeyRotationOutcome =
  | "disabled"
  | "not_due"
  | "rotated"
  | "failed";

export interface SignedPrekeyRotationDeps {
  enabled?: boolean;
  now: () => number;
  last_rotated_at: () => number | null;
  vault: () => EncryptedVault | null;
  generate?: () => Promise<FreshSignedPrekey>;
  persist: (
    next: EncryptedVault,
    base: EncryptedVault,
  ) => Promise<EncryptedVault | null>;
  publish: (vault: EncryptedVault) => Promise<boolean>;
  record_rotation: (rotated_at: number) => void;
}

export function signed_prekey_rotation_due(
  last_rotated_at: number | null,
  now: number,
  enabled: boolean = SIGNED_PREKEY_ROTATION_ENABLED,
): boolean {
  if (!enabled) return false;

  if (last_rotated_at === null || !Number.isFinite(last_rotated_at)) {
    return true;
  }

  const elapsed = now - last_rotated_at;

  return elapsed < 0 || elapsed >= SIGNED_PREKEY_ROTATION_INTERVAL_MS;
}

export async function generate_signed_prekey(): Promise<FreshSignedPrekey> {
  const keypair = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveBits"],
  );
  const public_key_raw = new Uint8Array(
    await crypto.subtle.exportKey("raw", keypair.publicKey),
  );
  const private_jwk = await crypto.subtle.exportKey("jwk", keypair.privateKey);

  return {
    signed_prekey_jwk: JSON.stringify(private_jwk),
    signed_prekey_public: array_to_base64(public_key_raw),
  };
}

export function apply_signed_prekey_rotation(
  vault: EncryptedVault,
  fresh: FreshSignedPrekey,
): EncryptedVault | null {
  if (!current_ratchet_key_set(vault)) return null;

  if (!fresh.signed_prekey_jwk || !fresh.signed_prekey_public) return null;

  if (fresh.signed_prekey_public === vault.ratchet_signed_prekey_public) {
    return null;
  }

  const next: EncryptedVault = {
    ...vault,
    ratchet_signed_prekey: fresh.signed_prekey_jwk,
    ratchet_signed_prekey_public: fresh.signed_prekey_public,
    ratchet_previous_keys: vault.ratchet_previous_keys
      ? [...vault.ratchet_previous_keys]
      : undefined,
  };

  next.ratchet_previous_keys = retain_replaced_ratchet_keys(vault, next)?.slice(
    0,
    SIGNED_PREKEY_RETAINED_LIMIT,
  );

  return next;
}

export async function rotate_signed_prekey_if_due(
  deps: SignedPrekeyRotationDeps,
): Promise<SignedPrekeyRotationOutcome> {
  const enabled = deps.enabled ?? SIGNED_PREKEY_ROTATION_ENABLED;

  if (!enabled) return "disabled";

  const now = deps.now();

  if (!signed_prekey_rotation_due(deps.last_rotated_at(), now, enabled)) {
    return "not_due";
  }

  try {
    const vault = deps.vault();

    if (!vault) return "failed";

    const fresh = await (deps.generate ?? generate_signed_prekey)();
    const next = apply_signed_prekey_rotation(vault, fresh);

    if (!next) return "failed";

    const persisted = await deps.persist(next, vault);

    if (!persisted) return "failed";

    if (!(await deps.publish(persisted))) return "failed";

    deps.record_rotation(now);

    return "rotated";
  } catch {
    return "failed";
  }
}

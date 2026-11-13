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
import { describe, it, expect, vi, beforeEach } from "vitest";

import type { EncryptedVault } from "@/services/crypto/key_manager_core";

const rotate_calls: Record<string, unknown>[] = [];

vi.mock("@/services/api/key_rotation", () => ({
  get_identity_key_status: vi.fn(),
  rotate_identity_key: vi.fn(async (request: Record<string, unknown>) => {
    rotate_calls.push(request);

    return { data: { success: true, new_key_fingerprint: "new-fp" } };
  }),
}));

vi.mock("@/services/crypto/vault_cas_write", () => ({
  fetch_latest_vault: vi.fn(async () => ({ kind: "missing" })),
}));

vi.mock("@/services/crypto/vault_level2", async (load_actual) => ({
  ...(await load_actual<typeof import("@/services/crypto/vault_level2")>()),
  note_vault_written: vi.fn(),
  write_vault_at_level: vi.fn(
    async (
      iterations: number,
      seal: (level: number) => Promise<unknown>,
      send: (sealed: unknown, field: Record<string, unknown>) => Promise<unknown>,
    ) => {
      const sealed = await seal(iterations);
      const response = await send(sealed, {});

      return { response, sealed, iterations };
    },
  ),
}));

vi.mock("@/services/crypto/ratchet_manager", () => ({
  parse_ratchet_envelope: vi.fn(),
  decrypt_ratchet_message: vi.fn(),
  generate_ratchet_keys: vi.fn(async () => ({
    identity_jwk: "new-ratchet-identity",
    identity_public: "new-ratchet-identity-public",
    signed_prekey_jwk: "new-ratchet-prekey",
    signed_prekey_public: "new-ratchet-prekey-public",
    pq_identity_secret: "new-pq-secret",
    pq_identity_public: "new-pq-public",
    pq_identity_seed: "new-pq-seed",
  })),
  upload_prekey_bundle: vi.fn(async () => true),
}));

vi.mock("@/services/crypto/ratchet_state_store", () => ({
  clear_all_ratchet_states: vi.fn(async () => undefined),
}));

vi.mock("@/services/crypto/vault_key_fingerprints", () => ({
  collect_vault_key_fingerprints: vi.fn(async () => []),
}));

import {
  generate_identity_keypair,
  generate_signed_prekey,
  decrypt_vault,
} from "@/services/crypto/key_manager";
import {
  has_pending_identity_rotation,
  perform_key_rotation,
} from "@/services/key_rotation_service";

const SECRET = "bWFpbGJveC1sb2dpbi1zZWNyZXQtMzItYnl0ZXM=";

async function pending_vault(): Promise<EncryptedVault> {
  const identity = await generate_identity_keypair(
    "family",
    "family@astermail.org",
    SECRET,
  );
  const { keypair: prekey } = await generate_signed_prekey(
    "family",
    "family@astermail.org",
    SECRET,
    identity.secret_key,
  );

  return {
    identity_key: identity.secret_key,
    signed_prekey: prekey.public_key,
    signed_prekey_private: prekey.secret_key,
    recovery_codes: [],
    ratchet_identity_key: "old-ratchet-identity",
    ratchet_identity_public: "old-ratchet-identity-public",
    ratchet_signed_prekey: "old-ratchet-prekey",
    ratchet_signed_prekey_public: "old-ratchet-prekey-public",
    identity_rotation_pending: true,
  };
}

async function public_key_of(vault: EncryptedVault): Promise<string> {
  const { derive_public_keys_from_private } = await import(
    "@/services/crypto/key_manager_pgp"
  );
  const [public_key] = await derive_public_keys_from_private([
    vault.identity_key,
  ]);

  return public_key;
}

describe("pending shared mailbox identity rotation", () => {
  beforeEach(() => {
    rotate_calls.length = 0;
  });

  it("replaces every mailbox key and clears the mark", async () => {
    const vault = await pending_vault();
    const old_public = await public_key_of(vault);

    const result = await perform_key_rotation(
      vault,
      SECRET,
      "family@astermail.org",
      "family",
      10,
      btoa(old_public),
    );

    expect(result.success).toBe(true);
    const new_vault = result.new_vault!;

    expect(has_pending_identity_rotation(new_vault)).toBe(false);
    expect(new_vault.identity_key).not.toBe(vault.identity_key);
    expect(new_vault.signed_prekey_private).not.toBe(
      vault.signed_prekey_private,
    );
    expect(new_vault.ratchet_identity_key).toBe("new-ratchet-identity");
    expect(new_vault.ratchet_signed_prekey).toBe("new-ratchet-prekey");
    expect(new_vault.previous_keys).toContain(vault.identity_key);
    expect(rotate_calls).toHaveLength(1);
    expect(rotate_calls[0].new_identity_key).toBe(
      btoa(await public_key_of(new_vault)),
    );
    expect(rotate_calls[0].new_identity_key).not.toBe(btoa(old_public));
  });

  it("does not store the mark in the vault it uploads", async () => {
    const vault = await pending_vault();
    const old_public = await public_key_of(vault);

    const result = await perform_key_rotation(
      vault,
      SECRET,
      "family@astermail.org",
      "family",
      10,
      btoa(old_public),
    );

    const uploaded = await decrypt_vault(
      result.encrypted_vault!,
      result.vault_nonce!,
      SECRET,
    );

    expect("identity_rotation_pending" in uploaded).toBe(false);
  });
});

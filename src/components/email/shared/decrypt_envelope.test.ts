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
import type { EncryptedVault } from "@/services/crypto/key_manager";

import { describe, it, expect, beforeEach, vi } from "vitest";

const h = vi.hoisted(() => ({
  vault: null as unknown,
  refreshed_vault: null as unknown,
  vault_fetches: 0,
  passphrase: "correct horse battery staple" as string | null,
}));

vi.mock("@/services/crypto/memory_key_store", () => ({
  get_vault_from_memory: () => h.vault,
  get_passphrase_from_memory: () => h.passphrase,
  get_passphrase_bytes: () => new Uint8Array(32).fill(1),
  has_vault_in_memory: () => h.vault !== null,
  wait_for_keys_ready: vi.fn(async () => {}),
  store_vault_in_memory: vi.fn(async (vault: unknown) => {
    h.vault = vault;
  }),
}));

vi.mock("@/services/api/client", () => ({
  api_client: {
    get: vi.fn(async (url: string) => {
      if (url === "/core/v1/auth/vault") {
        h.vault_fetches++;

        return h.refreshed_vault
          ? { data: { encrypted_vault: "server_vault", vault_nonce: "n1" } }
          : { code: "NOT_FOUND" };
      }

      return { code: "NOT_FOUND" };
    }),
    put: vi.fn(async () => ({ data: {} })),
    post: vi.fn(async () => ({ data: {} })),
    delete: vi.fn(async () => ({})),
  },
}));

vi.mock("@/services/account_manager", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  get_current_account: vi.fn(async () => ({ user: { id: "user-1" } })),
}));

vi.mock("@/services/crypto/key_manager", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  decrypt_vault: vi.fn(async () => h.refreshed_vault),
}));

import { decrypt_mail_envelope } from "@/components/email/shared/decrypt_envelope";
import { reset_vault_refresh_state } from "@/services/crypto/vault_refresh";
import {
  import_ke_public_key,
  compute_agreement_bits,
  derive_aes_key_from_bytes,
} from "@/services/crypto/key_manager";
import { array_to_base64 } from "@/services/crypto/base64";
import { encrypt_envelope_with_identity_key } from "@/services/crypto/envelope";

const INBOUND_ECIES_INFO = new TextEncoder().encode("aster-inbound-v1");

interface TestIdentity {
  private_jwk_str: string;
  public_raw: Uint8Array;
  public_b64: string;
}

async function generate_identity(): Promise<TestIdentity> {
  const keypair = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveBits"],
  );
  const private_jwk = await crypto.subtle.exportKey("jwk", keypair.privateKey);
  const public_raw = new Uint8Array(
    await crypto.subtle.exportKey("raw", keypair.publicKey),
  );

  return {
    private_jwk_str: JSON.stringify(private_jwk),
    public_raw,
    public_b64: array_to_base64(public_raw),
  };
}

function make_vault(identity: TestIdentity): EncryptedVault {
  return {
    identity_key: "",
    ratchet_identity_key: identity.private_jwk_str,
    ratchet_identity_public: identity.public_b64,
  } as unknown as EncryptedVault;
}

async function seal_inbound_ecies(
  payload: object,
  recipient_public_raw: Uint8Array,
): Promise<{ encrypted_envelope: string; envelope_nonce: string }> {
  const eph = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveBits"],
  );
  const eph_raw = new Uint8Array(
    await crypto.subtle.exportKey("raw", eph.publicKey),
  );
  const recipient_public = await import_ke_public_key(recipient_public_raw);
  const shared = await compute_agreement_bits(eph.privateKey, recipient_public);
  const aes_key = await derive_aes_key_from_bytes(
    shared,
    new Uint8Array(0),
    INBOUND_ECIES_INFO,
  );
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: nonce },
      aes_key,
      new TextEncoder().encode(JSON.stringify(payload)),
    ),
  );
  const enc = new Uint8Array(1 + eph_raw.length + ciphertext.length);

  enc[0] = 2;
  enc.set(eph_raw, 1);
  enc.set(ciphertext, 1 + eph_raw.length);

  return {
    encrypted_envelope: array_to_base64(enc),
    envelope_nonce: array_to_base64(nonce),
  };
}

describe("stale-vault self-heal on inbound envelope decrypt failure", () => {
  beforeEach(() => {
    h.vault = null;
    h.refreshed_vault = null;
    h.vault_fetches = 0;
    h.passphrase = "correct horse battery staple";
    reset_vault_refresh_state();
    localStorage.clear();
  });

  it("recovers an envelope sealed to a rotated identity key by refreshing the vault and adopts it", async () => {
    const stale = await generate_identity();
    const rotated = await generate_identity();

    h.vault = make_vault(stale);
    h.refreshed_vault = make_vault(rotated);

    const sealed = await seal_inbound_ecies(
      {
        subject: "sealed to rotated key",
        from: { name: "A", email: "a@example.com" },
      },
      rotated.public_raw,
    );

    const result = await decrypt_mail_envelope<{ subject?: string }>(
      sealed.encrypted_envelope,
      sealed.envelope_nonce,
    );

    expect(result?.subject).toBe("sealed to rotated key");
    expect(h.vault_fetches).toBe(1);
    expect((h.vault as EncryptedVault).ratchet_identity_public).toBe(
      rotated.public_b64,
    );
    expect(localStorage.getItem("astermail_encrypted_vault_user-1")).toBe(
      "server_vault",
    );
  });

  it("decrypts follow-up envelopes with the adopted vault without another fetch", async () => {
    const stale = await generate_identity();
    const rotated = await generate_identity();

    h.vault = make_vault(stale);
    h.refreshed_vault = make_vault(rotated);

    const first = await seal_inbound_ecies(
      { subject: "first" },
      rotated.public_raw,
    );
    const second = await seal_inbound_ecies(
      { subject: "second" },
      rotated.public_raw,
    );

    const first_result = await decrypt_mail_envelope<{ subject?: string }>(
      first.encrypted_envelope,
      first.envelope_nonce,
    );
    const second_result = await decrypt_mail_envelope<{ subject?: string }>(
      second.encrypted_envelope,
      second.envelope_nonce,
    );

    expect(first_result?.subject).toBe("first");
    expect(second_result?.subject).toBe("second");
    expect(h.vault_fetches).toBe(1);
  });

  it("still returns null when no refreshed vault is available and does not refetch per message", async () => {
    const stale = await generate_identity();
    const unrelated = await generate_identity();

    h.vault = make_vault(stale);
    h.refreshed_vault = null;

    const sealed = await seal_inbound_ecies(
      { subject: "unreachable" },
      unrelated.public_raw,
    );

    expect(
      await decrypt_mail_envelope(
        sealed.encrypted_envelope,
        sealed.envelope_nonce,
      ),
    ).toBeNull();
    expect(h.vault_fetches).toBe(1);

    expect(
      await decrypt_mail_envelope(
        sealed.encrypted_envelope,
        sealed.envelope_nonce,
      ),
    ).toBeNull();
    expect(h.vault_fetches).toBe(1);
    expect((h.vault as EncryptedVault).ratchet_identity_public).toBe(
      stale.public_b64,
    );
  });

  it("recovers when no vault is in memory but a refreshed vault is fetchable, and adopts it", async () => {
    const rotated = await generate_identity();

    h.vault = null;
    h.refreshed_vault = make_vault(rotated);

    const sealed = await seal_inbound_ecies(
      { subject: "no vault in memory" },
      rotated.public_raw,
    );

    const result = await decrypt_mail_envelope<{ subject?: string }>(
      sealed.encrypted_envelope,
      sealed.envelope_nonce,
    );

    expect(result?.subject).toBe("no vault in memory");
    expect(h.vault_fetches).toBe(1);
    expect((h.vault as EncryptedVault).ratchet_identity_public).toBe(
      rotated.public_b64,
    );
    expect(localStorage.getItem("astermail_encrypted_vault_user-1")).toBe(
      "server_vault",
    );
  });

  it("heals a legacy identity envelope when the in-memory vault lacks identity_key", async () => {
    const stale = await generate_identity();

    h.vault = make_vault(stale);
    h.refreshed_vault = {
      ...make_vault(stale),
      identity_key: "legacy-identity-key-from-refresh",
    };

    const sealed = await encrypt_envelope_with_identity_key(
      { subject: "legacy healed" },
      "legacy-identity-key-from-refresh",
    );

    const result = await decrypt_mail_envelope<{ subject?: string }>(
      sealed.encrypted,
      sealed.nonce,
    );

    expect(result?.subject).toBe("legacy healed");
    expect(h.vault_fetches).toBe(1);
  });

  it("returns null when the refreshed vault carries no new keys", async () => {
    const stale = await generate_identity();
    const unrelated = await generate_identity();

    h.vault = make_vault(stale);
    h.refreshed_vault = make_vault(stale);

    const sealed = await seal_inbound_ecies(
      { subject: "unreachable" },
      unrelated.public_raw,
    );

    expect(
      await decrypt_mail_envelope(
        sealed.encrypted_envelope,
        sealed.envelope_nonce,
      ),
    ).toBeNull();
    expect(h.vault_fetches).toBe(1);
    expect(localStorage.getItem("astermail_encrypted_vault_user-1")).toBeNull();
  });
});

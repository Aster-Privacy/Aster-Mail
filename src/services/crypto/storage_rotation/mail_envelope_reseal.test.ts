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
import type { EncryptedVault } from "../key_manager_core";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const PASSWORD = "correct horse battery staple";
const SALT = new Uint8Array(16).fill(7);
const DATA_KEK_RAW = new Uint8Array(32).fill(1);

interface SentRow {
  id: string;
  encrypted_envelope: string;
  envelope_nonce: string;
}

interface EnvelopeWrite {
  path: string;
  body: {
    encrypted_envelope: string;
    envelope_nonce: string;
    expected_envelope_sha256: string;
  };
}

const state = vi.hoisted(() => ({
  vault: null as Record<string, unknown> | null,
  sent: [] as SentRow[],
  writes: [] as EnvelopeWrite[],
  refuse_writes: false,
}));

vi.mock("@/services/account_manager", () => ({
  get_current_account: async () => ({
    user: { id: "user-1", email: "sweeper@astermail.org" },
  }),
}));

vi.mock("@/services/api/auth", () => ({
  get_user_salt: async () => ({
    data: { salt: btoa(String.fromCharCode(...new Uint8Array(16).fill(7))) },
  }),
  get_retired_login_salts: async () => [],
}));

vi.mock("@/services/api/client", () => ({
  api_client: {
    get: async (path: string) => {
      if (path.startsWith("/mail/v1/messages/encrypted")) {
        const sent = path.includes("item_type=sent");

        return {
          data: { items: sent ? state.sent : [], has_more: false, total: 0 },
        };
      }

      return path.startsWith("/crypto/v1/ratchet/plaintexts")
        ? { data: { entries: [] } }
        : { data: {} };
    },
    post: async () => ({ data: {} }),
    put: async (path: string, body: EnvelopeWrite["body"]) => {
      if (!path.startsWith("/mail/v1/messages/")) return { data: {} };
      if (state.refuse_writes) {
        return { error: "Item changed since it was read", status: 409 };
      }
      state.writes.push({ path, body });

      return { data: { success: true, updated_count: 1 } };
    },
  },
}));

vi.mock("@/services/crypto/memory_key_store", async (import_original) => ({
  ...(await import_original<
    typeof import("@/services/crypto/memory_key_store")
  >()),
  get_passphrase_from_memory: () => PASSWORD,
  get_vault_from_memory: () => state.vault,
}));

vi.mock("@/services/crypto/vault_cas_write", async (import_original) => ({
  ...(await import_original<
    typeof import("@/services/crypto/vault_cas_write")
  >()),
  write_vault_merged: async ({ next }: { next: Record<string, unknown> }) => {
    state.vault = next;

    return "written";
  },
}));

vi.mock("@/services/crypto/vault_write_lock", () => ({
  with_vault_write_lock_bounded: async <T>(task: () => Promise<T>) => task(),
}));

vi.mock("@/services/crypto/storage_write_key", async (import_original) => {
  const original =
    await import_original<
      typeof import("@/services/crypto/storage_write_key")
    >();

  return {
    ...original,
    get_storage_write_crypto_key: async () =>
      original.import_storage_aes_key(new Uint8Array(32).fill(1)),
    derive_password_storage_keys: async () => [],
  };
});

vi.mock("./vault_step", async (import_original) => ({
  ...(await import_original<typeof import("./vault_step")>()),
  server_storage_key_matches: async () => true,
}));

vi.mock("./legacy_sweep", async (import_original) => {
  const original = await import_original<typeof import("./legacy_sweep")>();
  const { DEFAULT_RESEAL_STEPS, run_reseal_steps } = await import("./run");

  return {
    ...original,
    run_legacy_key_sweep: (
      options: Parameters<typeof original.run_legacy_key_sweep>[0],
    ) =>
      run_reseal_steps({
        ...options,
        steps: DEFAULT_RESEAL_STEPS.filter((step) =>
          ["mail_envelopes", "escrow"].includes(step.name),
        ),
        finish: async () => "done",
      }),
  };
});

import { array_to_base64, base64_to_array } from "../base64";
import {
  clear_legacy_ios_envelope_key,
  decrypt_legacy_ios_envelope,
} from "../legacy_ios_envelope";
import {
  clear_server_known_keys,
  note_server_known_raws,
  server_known_kek_id,
} from "../server_known_keys";

import { start_legacy_key_sweep } from "./background";

const ENVELOPE = { subject: "Sent from my phone" };
const ENVELOPE_TEXT = JSON.stringify(ENVELOPE);
const MARKED_ENVELOPE = { ...ENVELOPE, legacy_unverified: true };

async function login_hash_raw(): Promise<Uint8Array> {
  const material = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(PASSWORD),
    "PBKDF2",
    false,
    ["deriveBits"],
  );

  return new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: "PBKDF2", salt: SALT, iterations: 310000, hash: "SHA-256" },
      material,
      256,
    ),
  );
}

async function aes_key(raw: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    raw,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

async function open_text(
  key: CryptoKey,
  ciphertext: Uint8Array,
  nonce: Uint8Array,
): Promise<string | null> {
  try {
    return new TextDecoder().decode(
      await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: nonce },
        key,
        ciphertext,
      ),
    );
  } catch {
    return null;
  }
}

async function sha256_hex(bytes: Uint8Array): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));

  return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
}

function sweep_vault(): EncryptedVault {
  return {
    identity_key: "identity",
    signed_prekey: "prekey",
    signed_prekey_private: "prekey_private",
    recovery_codes: [],
    data_kek: array_to_base64(DATA_KEK_RAW),
    data_kek_random: true,
  } as EncryptedVault;
}

async function ios_sent_envelope(raw: Uint8Array, text = ENVELOPE_TEXT) {
  const nonce = new Uint8Array(12).fill(3);
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: nonce },
      await aes_key(raw),
      new TextEncoder().encode(text),
    ),
  );

  state.sent = [
    {
      id: "sent-1",
      encrypted_envelope: array_to_base64(ciphertext),
      envelope_nonce: array_to_base64(nonce),
    },
  ];

  return { ciphertext, nonce };
}

function swept_ids(): string[] {
  return (state.vault?.server_known_swept_ids as string[] | undefined) ?? [];
}

describe("iOS mail envelopes sealed under the login hash", () => {
  beforeEach(() => {
    localStorage.clear();
    clear_server_known_keys();
    clear_legacy_ios_envelope_key();
    state.vault = sweep_vault() as unknown as Record<string, unknown>;
    state.sent = [];
    state.writes = [];
    state.refuse_writes = false;
  });

  afterEach(() => {
    clear_server_known_keys();
    clear_legacy_ios_envelope_key();
  });

  it("reseals the envelope under the vault key before retiring the login-hash key", async () => {
    const raw = await login_hash_raw();
    const original = await ios_sent_envelope(raw);

    note_server_known_raws([raw]);

    expect(
      await decrypt_legacy_ios_envelope(original.ciphertext, original.nonce),
    ).not.toBeNull();

    const result = await start_legacy_key_sweep(PASSWORD);

    expect(result?.status).toBe("done");
    expect(state.writes).toHaveLength(1);

    const [write] = state.writes;

    expect(write.path).toBe("/mail/v1/messages/sent-1");
    expect(write.body.expected_envelope_sha256).toBe(
      await sha256_hex(original.ciphertext),
    );

    const resealed = base64_to_array(write.body.encrypted_envelope);
    const resealed_nonce = base64_to_array(write.body.envelope_nonce);

    expect(
      JSON.parse(
        (await open_text(
          await aes_key(DATA_KEK_RAW),
          resealed,
          resealed_nonce,
        )) ?? "null",
      ),
    ).toEqual(MARKED_ENVELOPE);
    expect(
      await open_text(await aes_key(raw), resealed, resealed_nonce),
    ).toBeNull();
    expect(swept_ids()).toContain(server_known_kek_id(raw));

    clear_legacy_ios_envelope_key();

    const reopened = await decrypt_legacy_ios_envelope(
      resealed,
      resealed_nonce,
    );

    expect(reopened).not.toBeNull();
    expect(JSON.parse(new TextDecoder().decode(reopened!))).toEqual(
      MARKED_ENVELOPE,
    );
    expect(
      await decrypt_legacy_ios_envelope(original.ciphertext, original.nonce),
    ).not.toBeNull();
  }, 60000);

  it("keeps the login-hash key while an envelope is not resealed", async () => {
    const raw = await login_hash_raw();
    const original = await ios_sent_envelope(raw);

    state.refuse_writes = true;
    note_server_known_raws([raw]);

    const result = await start_legacy_key_sweep(PASSWORD);

    expect(result?.status).toBe("interrupted");
    expect(swept_ids()).not.toContain(server_known_kek_id(raw));

    clear_legacy_ios_envelope_key();

    expect(
      await decrypt_legacy_ios_envelope(original.ciphertext, original.nonce),
    ).not.toBeNull();
  }, 60000);

  it("never reseals a login-hash envelope as a trusted sent copy", async () => {
    const raw = await login_hash_raw();
    const forged = {
      subject: "Forged",
      sent_encryption: { outside: 1, outside_pgp: 1, internal_readable: 0 },
      legacy_unverified: false,
    };

    await ios_sent_envelope(raw, JSON.stringify(forged));
    note_server_known_raws([raw]);

    const result = await start_legacy_key_sweep(PASSWORD);

    expect(result?.status).toBe("done");
    expect(state.writes).toHaveLength(1);

    const [write] = state.writes;
    const resealed = JSON.parse(
      (await open_text(
        await aes_key(DATA_KEK_RAW),
        base64_to_array(write.body.encrypted_envelope),
        base64_to_array(write.body.envelope_nonce),
      )) ?? "null",
    );

    expect(resealed.legacy_unverified).toBe(true);

    const evidence = (await import("../sent_encryption_evidence")) as Record<
      string,
      unknown
    >;

    expect(typeof evidence.settle_legacy_unverified).toBe("function");

    const settled = (
      evidence.settle_legacy_unverified as (value: unknown) => unknown
    )(resealed);

    expect(
      (evidence.sent_copy_pgp_verified as (value: unknown) => boolean)(settled),
    ).toBe(false);
  }, 60000);
});

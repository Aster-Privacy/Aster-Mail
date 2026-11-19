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

const state = vi.hoisted(() => ({
  vault: null as Record<string, unknown> | null,
  escrow_entries: [] as unknown[],
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
    get: async (path: string) =>
      path.startsWith("/crypto/v1/ratchet/plaintexts")
        ? { data: { entries: state.escrow_entries } }
        : { data: {} },
    post: async () => ({ data: {} }),
    put: async () => ({ data: {} }),
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

vi.mock("@/services/crypto/storage_write_key", async (import_original) => ({
  ...(await import_original<
    typeof import("@/services/crypto/storage_write_key")
  >()),
  get_storage_write_crypto_key: async () => null,
  derive_password_storage_keys: async () => [],
}));

vi.mock("./vault_step", async (import_original) => ({
  ...(await import_original<typeof import("./vault_step")>()),
  server_storage_key_matches: async () => true,
}));

vi.mock("./legacy_sweep", async (import_original) => {
  const original = await import_original<typeof import("./legacy_sweep")>();
  const { run_reseal_steps } = await import("./run");
  const { escrow_step } = await import("./steps_escrow");

  return {
    ...original,
    run_legacy_key_sweep: (
      options: Parameters<typeof original.run_legacy_key_sweep>[0],
    ) =>
      run_reseal_steps({
        ...options,
        steps: [escrow_step],
        finish: async () => "done",
      }),
  };
});

import { array_to_base64 } from "../base64";
import { escrow_aad_v2 } from "../message_escrow";
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
import { derive_escrow_aes_key } from "./reseal_keys";
import { run_reseal_steps } from "./run";
import { escrow_step } from "./steps_escrow";
import type { ResealProgress } from "./reseal_io";

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

async function seal(
  key: CryptoKey,
  plaintext: string,
  nonce: Uint8Array,
  aad?: Uint8Array,
): Promise<Uint8Array> {
  const params: AesGcmParams = aad
    ? { name: "AES-GCM", iv: nonce, additionalData: aad }
    : { name: "AES-GCM", iv: nonce };

  return new Uint8Array(
    await crypto.subtle.encrypt(
      params,
      key,
      new TextEncoder().encode(plaintext),
    ),
  );
}

function sweep_vault(): EncryptedVault {
  return {
    identity_key: "identity",
    signed_prekey: "prekey",
    signed_prekey_private: "prekey_private",
    recovery_codes: [],
    data_kek: array_to_base64(new Uint8Array(32).fill(1)),
    data_kek_random: true,
  } as EncryptedVault;
}

describe("legacy sweep with rows it cannot reseal", () => {
  beforeEach(() => {
    localStorage.clear();
    clear_server_known_keys();
    clear_legacy_ios_envelope_key();
    state.vault = sweep_vault() as unknown as Record<string, unknown>;
    state.escrow_entries = [];
  });

  afterEach(() => {
    clear_server_known_keys();
    clear_legacy_ios_envelope_key();
  });

  it("keeps an iOS-written legacy row readable after a sweep run", async () => {
    const raw = await login_hash_raw();
    const nonce = new Uint8Array(12).fill(4);
    const escrow_key = await derive_escrow_aes_key(raw);

    state.escrow_entries = [
      {
        message_id: "message-1",
        encrypted_plaintext: array_to_base64(
          await seal(
            escrow_key,
            "escrowed body",
            nonce,
            escrow_aad_v2("message-1"),
          ),
        ),
        plaintext_nonce: array_to_base64(nonce),
      },
    ];

    const ios_key = await crypto.subtle.importKey(
      "raw",
      raw,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt"],
    );
    const envelope_nonce = new Uint8Array(12).fill(3);
    const envelope = await seal(
      ios_key,
      JSON.stringify({ subject: "Sent from my phone" }),
      envelope_nonce,
    );

    note_server_known_raws([raw]);

    const result = await start_legacy_key_sweep(PASSWORD);

    expect(result?.status).toBe("done");
    expect(
      (state.vault?.server_known_swept_ids as string[] | undefined) ?? [],
    ).not.toContain(server_known_kek_id(raw));

    const opened = await decrypt_legacy_ios_envelope(envelope, envelope_nonce);

    expect(opened).not.toBeNull();
    expect(JSON.parse(new TextDecoder().decode(opened!))).toEqual({
      subject: "Sent from my phone",
      legacy_unverified: true,
    });
  }, 60000);

  it("retires the key once a sweep run holds back no rows", async () => {
    const raw = await login_hash_raw();

    note_server_known_raws([raw]);

    const result = await start_legacy_key_sweep(PASSWORD);

    expect(result?.status).toBe("done");
    expect(state.vault?.server_known_swept_ids).toContain(
      server_known_kek_id(raw),
    );
  }, 60000);

  it("keeps opening an iOS row written after the key was retired", async () => {
    const raw = await login_hash_raw();

    note_server_known_raws([raw]);

    const result = await start_legacy_key_sweep(PASSWORD);

    expect(result?.status).toBe("done");
    expect(state.vault?.server_known_swept_ids).toContain(
      server_known_kek_id(raw),
    );

    const ios_key = await crypto.subtle.importKey(
      "raw",
      raw,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt"],
    );
    const envelope_nonce = new Uint8Array(12).fill(5);
    const envelope = await seal(
      ios_key,
      JSON.stringify({ subject: "Written after the sweep" }),
      envelope_nonce,
    );
    const opened = await decrypt_legacy_ios_envelope(envelope, envelope_nonce);

    expect(opened).not.toBeNull();
    expect(JSON.parse(new TextDecoder().decode(opened!))).toEqual({
      subject: "Written after the sweep",
      legacy_unverified: true,
    });
  }, 60000);

  it("retires the key when a row opens under no known key", async () => {
    const raw = await login_hash_raw();
    const nonce = new Uint8Array(12).fill(6);
    const stranger = await crypto.subtle.generateKey(
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt"],
    );

    state.escrow_entries = [
      {
        message_id: "message-2",
        encrypted_plaintext: array_to_base64(
          await seal(stranger, "unrelated", nonce, escrow_aad_v2("message-2")),
        ),
        plaintext_nonce: array_to_base64(nonce),
      },
    ];
    note_server_known_raws([raw]);

    const result = await start_legacy_key_sweep(PASSWORD);

    expect(result?.status).toBe("done");
    expect(result?.held_rows).toBe(0);
    expect(result?.counts.unreadable).toBeGreaterThan(0);
    expect(state.vault?.server_known_swept_ids).toContain(
      server_known_kek_id(raw),
    );
  }, 60000);

  it("still reports a held row when the run resumes after an interruption", async () => {
    const raw = await login_hash_raw();
    const nonce = new Uint8Array(12).fill(4);

    state.escrow_entries = [
      {
        message_id: "message-1",
        encrypted_plaintext: array_to_base64(
          await seal(
            await derive_escrow_aes_key(raw),
            "escrowed body",
            nonce,
            escrow_aad_v2("message-1"),
          ),
        ),
        plaintext_nonce: array_to_base64(nonce),
      },
    ];

    let saved: ResealProgress | null = null;
    const store = {
      load: () => (saved ? structuredClone(saved) : null),
      save: (progress: ResealProgress) => {
        saved = structuredClone(progress);
      },
      clear: () => {
        saved = null;
      },
    };
    const api = {
      get: async <T>() => ({ data: { entries: state.escrow_entries } as T }),
      post: async <T>() => ({ data: {} as T }),
      put: async <T>() => ({ data: {} as T }),
    };
    const stop_step = {
      name: "stop",
      run: async () => "interrupted" as const,
    };
    const options = {
      vault: sweep_vault(),
      api,
      store,
      sleep: async () => undefined,
      finish: async () => "done" as const,
    };

    const first = await run_reseal_steps({
      ...options,
      steps: [escrow_step, stop_step],
      key_options: { untrusted_old_raws: [new Uint8Array(raw)] },
    });

    expect(first.status).toBe("interrupted");

    const second = await run_reseal_steps({
      ...options,
      steps: [escrow_step],
      key_options: { untrusted_old_raws: [new Uint8Array(raw)] },
    });

    expect(second.status).toBe("done");
    expect(second.counts.quarantined).toBe(0);
    expect(second.held_rows).toBeGreaterThan(0);
  }, 60000);
});

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
import { describe, it, expect, beforeEach, vi } from "vitest";

import type { EncryptedVault } from "@/services/crypto/key_manager";

interface ServerStateRecord {
  encrypted_state: string;
  state_nonce: string;
  state_version: number;
}

const h = vi.hoisted(() => ({
  vault: null as unknown,
  bundle: null as unknown,
  store: new Map<string, unknown>(),
  server_state: null as ServerStateRecord | null,
  serve_state: true,
}));

vi.mock("@/services/crypto/memory_key_store", () => ({
  get_vault_from_memory: () => h.vault,
  get_passphrase_from_memory: () => null,
  get_passphrase_bytes: () => null,
  get_derived_encryption_key: () => new Uint8Array(32).fill(7),
  has_vault_in_memory: () => h.vault !== null,
}));

vi.mock("@/services/crypto/encrypted_storage", () => ({
  encrypted_get: vi.fn(async (key: string) =>
    h.store.has(key) ? JSON.parse(JSON.stringify(h.store.get(key))) : undefined,
  ),
  encrypted_set: vi.fn(async (key: string, value: unknown) => {
    h.store.set(key, JSON.parse(JSON.stringify(value)));
  }),
  encrypted_delete: vi.fn(async (key: string) => {
    h.store.delete(key);
  }),
}));

vi.mock("@/services/crypto/ratchet_plaintext_cache", () => ({
  get_cached_ratchet_plaintext: vi.fn(async () => null),
  set_cached_ratchet_plaintext: vi.fn(async () => {}),
}));

vi.mock("@/services/api/client", () => ({
  api_client: {
    get: vi.fn(async (url: string) => {
      if (url.includes("prekey-bundle")) {
        return { data: h.bundle };
      }

      if (url.includes("/state/")) {
        if (h.serve_state && h.server_state) {
          return { data: { ...h.server_state } };
        }

        return { code: "NOT_FOUND" };
      }

      return { code: "NOT_FOUND" };
    }),
    put: vi.fn(
      async (
        url: string,
        body: { encrypted_state?: string; state_nonce?: string },
      ) => {
        if (url.includes("/state") && body?.encrypted_state) {
          const state_version = (h.server_state?.state_version ?? 0) + 1;

          h.server_state = {
            encrypted_state: body.encrypted_state,
            state_nonce: body.state_nonce!,
            state_version,
          };

          return { data: { state_version } };
        }

        return { data: { state_version: 1 } };
      },
    ),
    post: vi.fn(
      async (
        url: string,
        body: { encrypted_state?: string; state_nonce?: string },
      ) => {
        if (url.includes("/state") && body?.encrypted_state) {
          h.server_state = {
            encrypted_state: body.encrypted_state,
            state_nonce: body.state_nonce!,
            state_version: 1,
          };

          return { data: { state_version: 1 } };
        }

        return { data: { state_version: 1 } };
      },
    ),
    delete: vi.fn(async () => ({})),
  },
}));

import {
  generate_ratchet_keys,
  encrypt_for_ratchet_recipient,
  build_ratchet_envelope,
  parse_ratchet_envelope,
  decrypt_ratchet_message,
} from "@/services/crypto/ratchet_manager";

const SENDER = "sender@astermail.org";
const RECIPIENT = "recipient@astermail.org";

type Keys = NonNullable<Awaited<ReturnType<typeof generate_ratchet_keys>>>;

function make_vault(keys: Keys): EncryptedVault {
  return {
    identity_key: "",
    ratchet_identity_key: keys.identity_jwk,
    ratchet_identity_public: keys.identity_public,
    ratchet_signed_prekey: keys.signed_prekey_jwk,
    ratchet_signed_prekey_public: keys.signed_prekey_public,
  } as unknown as EncryptedVault;
}

function bundle_for(vault: EncryptedVault) {
  return {
    kem_identity_key: vault.ratchet_identity_public,
    signed_prekey: vault.ratchet_signed_prekey_public,
    signed_prekey_signature: "",
    one_time_prekey: null,
    pq_prekey: null,
  };
}

function snapshot_store(): Map<string, unknown> {
  return new Map(
    [...h.store.entries()].map(([k, v]) => [
      k,
      JSON.parse(JSON.stringify(v)),
    ]),
  );
}

function restore_store(snapshot: Map<string, unknown>): void {
  h.store.clear();

  for (const [k, v] of snapshot.entries()) {
    h.store.set(k, JSON.parse(JSON.stringify(v)));
  }
}

async function send(plaintext: string, sender_vault: EncryptedVault) {
  h.vault = sender_vault;

  const data = await encrypt_for_ratchet_recipient(
    SENDER,
    RECIPIENT,
    "recipient",
    plaintext,
    sender_vault,
  );

  expect(data).not.toBeNull();

  const envelope = build_ratchet_envelope(
    sender_vault.ratchet_identity_public!,
    { [RECIPIENT]: data! },
  );

  return { data: data!, envelope };
}

async function receive(envelope_json: string, receiver_vault: EncryptedVault) {
  h.vault = receiver_vault;

  const parsed = parse_ratchet_envelope(envelope_json)!;

  return decrypt_ratchet_message(RECIPIENT, SENDER, parsed, receiver_vault);
}

describe("multi-device send collision avoidance", () => {
  beforeEach(() => {
    h.vault = null;
    h.bundle = null;
    h.store.clear();
    h.server_state = null;
    h.serve_state = true;
  });

  it("a stale device adopts the synced send chain instead of reusing a message key", async () => {
    const sender_vault = make_vault((await generate_ratchet_keys())!);
    const recipient_vault = make_vault((await generate_ratchet_keys())!);

    h.bundle = bundle_for(recipient_vault);

    const first = await send("message from device a", sender_vault);

    expect(first.data.header.message_number).toBe(0);

    const stale_device = snapshot_store();

    const second = await send("second message from device a", sender_vault);

    expect(second.data.header.message_number).toBe(1);

    restore_store(stale_device);

    const third = await send("message from stale device b", sender_vault);

    expect(third.data.header.message_number).toBe(2);

    h.serve_state = false;
    h.store.clear();

    const plain_first = await receive(first.envelope, recipient_vault);
    const plain_second = await receive(second.envelope, recipient_vault);
    const plain_third = await receive(third.envelope, recipient_vault);

    expect(plain_first).toBe("message from device a");
    expect(plain_second).toBe("second message from device a");
    expect(plain_third).toBe("message from stale device b");
  });

  it("keeps sending locally when no synced state exists", async () => {
    const sender_vault = make_vault((await generate_ratchet_keys())!);
    const recipient_vault = make_vault((await generate_ratchet_keys())!);

    h.bundle = bundle_for(recipient_vault);
    h.serve_state = false;

    const first = await send("offline first", sender_vault);
    const second = await send("offline second", sender_vault);

    expect(first.data.header.message_number).toBe(0);
    expect(second.data.header.message_number).toBe(1);
  });
});

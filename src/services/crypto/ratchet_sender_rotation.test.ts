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

vi.mock("@/services/crypto/key_manager_pgp", async (import_original) => ({
  ...(await import_original<
    typeof import("@/services/crypto/key_manager_pgp")
  >()),
  verify_ratchet_prekey_bundle_detailed: async () => ({
    verdict: "verified" as const,
    format: "v2" as const,
    strict: true,
  }),
}));

interface DirectoryEntry {
  bundle: Record<string, unknown>;
  history: string[];
}

const h = vi.hoisted(() => ({
  vault: null as unknown,
  directory: new Map<string, unknown>(),
  history_complete: true,
  store: new Map<string, unknown>(),
}));

vi.mock("@/services/crypto/memory_key_store", () => ({
  get_vault_from_memory: () => h.vault,
  get_passphrase_from_memory: () => null,
  get_passphrase_bytes: () => null,
  get_derived_encryption_key: () => new Uint8Array(32).fill(7),
  has_vault_in_memory: () => h.vault !== null,
  store_vault_in_memory: vi.fn(async (vault: unknown) => {
    h.vault = vault;
  }),
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

vi.mock("@/services/crypto/message_escrow", () => ({
  upload_to_escrow: vi.fn(async () => {}),
  fetch_from_escrow: vi.fn(async () => null),
}));

vi.mock("@/services/api/client", () => ({
  api_client: {
    get: vi.fn(async (url: string) => {
      const match = url.match(
        /\/ratchet\/(identity|prekey-bundle)\/([^/?]+)(\/history)?/,
      );

      if (!match) return { code: "NOT_FOUND" };

      const who = decodeURIComponent(match[2]);
      const entry = h.directory.get(who) as DirectoryEntry | undefined;

      if (!entry) return { code: "NOT_FOUND" };

      if (match[3]) {
        return {
          data: {
            user_id: who,
            entries: entry.history.map((key) => ({
              kem_identity_key: key,
              first_published_at: "2026-09-04T00:00:00Z",
              last_published_at: "2026-09-04T00:00:00Z",
            })),
            history_complete: h.history_complete,
          },
        };
      }

      return { data: entry.bundle };
    }),
    put: vi.fn(async () => ({ data: { state_version: 1 } })),
    post: vi.fn(async () => ({ data: { state_version: 1 } })),
    delete: vi.fn(async () => ({})),
  },
}));

vi.mock("@/services/account_manager", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  get_current_account: vi.fn(async () => ({ user: { id: "user-1" } })),
  get_current_account_id: vi.fn(async () => "user-1"),
}));

import {
  generate_ratchet_keys,
  encrypt_for_ratchet_recipient,
  build_ratchet_envelope,
  parse_ratchet_envelope,
  decrypt_ratchet_message,
} from "@/services/crypto/ratchet_manager";
import { clear_sender_identity_authentication_cache } from "@/services/crypto/sender_identity_authentication";

const SENDER = "davidw@astermail.org";
const RECIPIENT = "hello@astermail.org";

type Keys = NonNullable<Awaited<ReturnType<typeof generate_ratchet_keys>>>;

function make_vault(keys: Keys): EncryptedVault {
  return {
    identity_key: "",
    ratchet_identity_key: keys.identity_jwk,
    ratchet_identity_public: keys.identity_public,
    ratchet_signed_prekey: keys.signed_prekey_jwk,
    ratchet_signed_prekey_public: keys.signed_prekey_public,
    ratchet_pq_identity_key: keys.pq_identity_secret,
    ratchet_pq_identity_public: keys.pq_identity_public,
    ratchet_pq_identity_seed: keys.pq_identity_seed,
  } as unknown as EncryptedVault;
}

function key_set_of(vault: EncryptedVault) {
  return {
    ratchet_identity_key: vault.ratchet_identity_key,
    ratchet_identity_public: vault.ratchet_identity_public,
    ratchet_signed_prekey: vault.ratchet_signed_prekey,
    ratchet_signed_prekey_public: vault.ratchet_signed_prekey_public,
    ratchet_pq_identity_key: vault.ratchet_pq_identity_key,
    ratchet_pq_identity_public: vault.ratchet_pq_identity_public,
    ratchet_pq_identity_seed: vault.ratchet_pq_identity_seed,
  };
}

function publish(username: string, vault: EncryptedVault) {
  const existing = h.directory.get(username) as DirectoryEntry | undefined;

  h.directory.set(username, {
    bundle: {
      user_id: username,
      kem_identity_key: vault.ratchet_identity_public,
      signed_prekey: vault.ratchet_signed_prekey_public,
      signed_prekey_signature: "",
      one_time_prekey: null,
      pq_prekey: null,
      pq_kem_public_key: vault.ratchet_pq_identity_public,
    },
    history: [
      ...(existing?.history ?? []),
      vault.ratchet_identity_public as string,
    ],
  });
}

function snapshot() {
  return new Map(
    [...h.store.entries()].map(([key, value]) => [
      key,
      JSON.parse(JSON.stringify(value)),
    ]),
  );
}

function restore(state: Map<string, unknown>) {
  h.store.clear();

  for (const [key, value] of state) {
    h.store.set(key, JSON.parse(JSON.stringify(value)));
  }
}

function clear_local_ratchet_states() {
  for (const key of [...h.store.keys()]) {
    if (key.startsWith("ratchet_state_")) h.store.delete(key);
  }
}

async function send(body: string, sender_vault: EncryptedVault) {
  h.vault = sender_vault;

  const data = await encrypt_for_ratchet_recipient(
    SENDER,
    RECIPIENT,
    "hello",
    body,
    sender_vault,
  );

  expect(data).not.toBeNull();

  return build_ratchet_envelope(sender_vault.ratchet_identity_public!, {
    [RECIPIENT]: data!,
  });
}

async function receive(
  envelope_json: string,
  receiver_vault: EncryptedVault,
  message_id: string,
) {
  h.vault = receiver_vault;

  return decrypt_ratchet_message(
    RECIPIENT,
    SENDER,
    parse_ratchet_envelope(envelope_json)!,
    receiver_vault,
    message_id,
  );
}

async function reply(body: string, receiver_vault: EncryptedVault) {
  h.vault = receiver_vault;

  const data = await encrypt_for_ratchet_recipient(
    RECIPIENT,
    SENDER,
    "davidw",
    body,
    receiver_vault,
  );

  expect(data).not.toBeNull();

  return build_ratchet_envelope(receiver_vault.ratchet_identity_public!, {
    [SENDER]: data!,
  });
}

async function read_reply(
  envelope_json: string,
  sender_vault: EncryptedVault,
  message_id: string,
) {
  h.vault = sender_vault;

  return decrypt_ratchet_message(
    SENDER,
    RECIPIENT,
    parse_ratchet_envelope(envelope_json)!,
    sender_vault,
    message_id,
  );
}

describe("sender identity rotation", () => {
  beforeEach(() => {
    h.vault = null;
    h.directory.clear();
    h.history_complete = true;
    h.store.clear();
    localStorage.clear();
    clear_sender_identity_authentication_cache();
  });

  it("keeps the conversation readable after the sender rotates identity keys", async () => {
    const receiver_vault = make_vault((await generate_ratchet_keys())!);
    let sender_vault = make_vault((await generate_ratchet_keys())!);

    publish("hello", receiver_vault);
    publish("davidw", sender_vault);

    let sender_store = new Map<string, unknown>();
    let receiver_store = new Map<string, unknown>();

    restore(sender_store);
    const first = await send("before rotation", sender_vault);

    sender_store = snapshot();

    restore(receiver_store);
    expect(await receive(first, receiver_vault, "m1")).toBe("before rotation");
    const answer = await reply("answering", receiver_vault);

    receiver_store = snapshot();

    restore(sender_store);
    expect(await read_reply(answer, sender_vault, "r1")).toBe("answering");
    sender_store = snapshot();

    const rotated = make_vault((await generate_ratchet_keys())!);

    rotated.ratchet_previous_keys = [
      key_set_of(sender_vault),
    ] as EncryptedVault["ratchet_previous_keys"];

    sender_vault = rotated;
    publish("davidw", sender_vault);

    restore(sender_store);
    clear_local_ratchet_states();

    const after = await send("after rotation", sender_vault);

    sender_store = snapshot();

    restore(receiver_store);
    expect(await receive(after, receiver_vault, "m2")).toBe("after rotation");
  });

  it("keeps the conversation readable when the published history has dropped the sending identity", async () => {
    const receiver_vault = make_vault((await generate_ratchet_keys())!);
    let sender_vault = make_vault((await generate_ratchet_keys())!);

    publish("hello", receiver_vault);
    publish("davidw", sender_vault);

    let sender_store = new Map<string, unknown>();
    let receiver_store = new Map<string, unknown>();

    restore(sender_store);
    const first = await send("before rotation", sender_vault);

    sender_store = snapshot();

    restore(receiver_store);
    expect(await receive(first, receiver_vault, "m1")).toBe("before rotation");
    receiver_store = snapshot();

    const rotated = make_vault((await generate_ratchet_keys())!);

    rotated.ratchet_previous_keys = [
      key_set_of(sender_vault),
    ] as EncryptedVault["ratchet_previous_keys"];

    sender_vault = rotated;
    publish("davidw", sender_vault);

    restore(sender_store);
    clear_local_ratchet_states();

    const after = await send("after rotation", sender_vault);

    sender_store = snapshot();

    const stranger = make_vault((await generate_ratchet_keys())!);

    h.directory.set("davidw", {
      bundle: {
        user_id: "davidw",
        kem_identity_key: stranger.ratchet_identity_public,
        signed_prekey: stranger.ratchet_signed_prekey_public,
        signed_prekey_signature: "",
        one_time_prekey: null,
        pq_prekey: null,
        pq_kem_public_key: stranger.ratchet_pq_identity_public,
      },
      history: [stranger.ratchet_identity_public as string],
    });

    clear_sender_identity_authentication_cache();
    restore(receiver_store);

    expect(await receive(after, receiver_vault, "m2")).toBe("after rotation");
  });

  it("keeps the conversation readable when the sender rotates three times in a row", async () => {
    const receiver_vault = make_vault((await generate_ratchet_keys())!);
    let sender_vault = make_vault((await generate_ratchet_keys())!);

    publish("hello", receiver_vault);
    publish("davidw", sender_vault);

    let sender_store = new Map<string, unknown>();
    let receiver_store = new Map<string, unknown>();

    for (const [index, body] of ["one", "two", "three"].entries()) {
      restore(sender_store);
      const envelope = await send(body, sender_vault);

      sender_store = snapshot();

      restore(receiver_store);
      expect(await receive(envelope, receiver_vault, `m${index}`)).toBe(body);
      receiver_store = snapshot();
    }

    for (let round = 0; round < 3; round += 1) {
      const rotated = make_vault((await generate_ratchet_keys())!);

      rotated.ratchet_previous_keys = [
        key_set_of(sender_vault),
        ...(sender_vault.ratchet_previous_keys ?? []),
      ] as EncryptedVault["ratchet_previous_keys"];

      sender_vault = rotated;
      publish("davidw", sender_vault);

      restore(sender_store);
      clear_local_ratchet_states();
      sender_store = snapshot();
    }

    restore(sender_store);
    const after = await send("after three rotations", sender_vault);

    sender_store = snapshot();

    restore(receiver_store);

    expect(await receive(after, receiver_vault, "final")).toBe(
      "after three rotations",
    );
  });
});

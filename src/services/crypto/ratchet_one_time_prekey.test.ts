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
  store: new Map<string, unknown>(),
  one_time_secrets: new Map<number, string>(),
  deleted_one_time_ids: [] as number[],
}));

vi.mock("@/services/crypto/memory_key_store", () => ({
  on_vault_cleared: () => () => {},
  on_vault_stored: () => () => {},
  get_vault_account_epoch: () => 0,
  get_vault_from_memory: () =>
    h.vault
      ? {
          data_kek: Buffer.from(new Uint8Array(32).fill(7)).toString("base64"),
          ...(h.vault as object),
        }
      : null,
  get_passphrase_from_memory: () => null,
  get_passphrase_bytes: () => null,
  get_derived_encryption_key: () => new Uint8Array(32).fill(7),
  has_vault_in_memory: () => h.vault !== null,
  store_vault_in_memory: vi.fn(async (vault: unknown) => {
    h.vault = vault;
  }),
}));

vi.mock("@/services/crypto/encrypted_storage", async () => ({
  ...(
    await import("@/tests/fixtures/storage_name_support")
  ).storage_name_support(h.store),
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

vi.mock("@/services/crypto/ec_prekey_store", () => ({
  ec_one_time_storage_available: async () => true,
  load_ec_one_time_secret: async (key_id: number) => {
    const d = h.one_time_secrets.get(key_id);

    return d ? { kty: "EC", crv: "P-256", d } : null;
  },
  delete_ec_one_time_secret: async (key_id: number) => {
    h.deleted_one_time_ids.push(key_id);
    h.one_time_secrets.delete(key_id);
  },
}));

vi.mock("@/services/crypto/ratchet_plaintext_cache", () => ({
  get_cached_ratchet_plaintext: vi.fn(async () => null),
  get_cached_ratchet_sender_key: vi.fn(async () => null),
  set_cached_ratchet_plaintext: vi.fn(async () => {}),
}));

vi.mock("@/services/crypto/message_escrow", () => ({
  upload_to_escrow: vi.fn(async () => {}),
  fetch_from_escrow: vi.fn(async () => null),
  fetch_verified_from_escrow: vi.fn(async () => null),
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
            history_complete: true,
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
import { array_to_base64, base64_to_array } from "@/services/crypto/base64";
import { compute_signed_prekey_id } from "@/services/crypto/x3dh";

const SENDER = "davidw@astermail.org";
const RECIPIENT = "hello@astermail.org";
const ONE_TIME_KEY_ID = 424242;

type Keys = NonNullable<Awaited<ReturnType<typeof generate_ratchet_keys>>>;

interface OneTimeOffer {
  key_id: number;
  advertised_version: number;
}

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

async function new_one_time_prekey(key_id: number): Promise<string> {
  const keypair = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveBits"],
  );
  const jwk = await crypto.subtle.exportKey("jwk", keypair.privateKey);
  const raw = new Uint8Array(
    await crypto.subtle.exportKey("raw", keypair.publicKey),
  );

  h.one_time_secrets.set(key_id, jwk.d!);

  return array_to_base64(raw);
}

async function publish(
  username: string,
  vault: EncryptedVault,
  offer?: OneTimeOffer,
) {
  const existing = h.directory.get(username) as DirectoryEntry | undefined;
  const bundle: Record<string, unknown> = {
    user_id: username,
    kem_identity_key: vault.ratchet_identity_public,
    signed_prekey: vault.ratchet_signed_prekey_public,
    signed_prekey_signature: "",
    one_time_prekey: null,
    pq_prekey: null,
    pq_kem_public_key: vault.ratchet_pq_identity_public,
  };

  if (offer) {
    bundle.x3dh_max_version = offer.advertised_version;
    bundle.ec_one_time_prekey = {
      key_id: offer.key_id,
      public_key: await new_one_time_prekey(offer.key_id),
    };
  }

  h.directory.set(username, {
    bundle,
    history: [
      ...(existing?.history ?? []),
      vault.ratchet_identity_public as string,
    ].filter((key, index, all) => all.indexOf(key) === index),
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

function stored_ratchet_states() {
  return [...h.store.entries()]
    .filter(([key]) => key.startsWith("ratchet_state_"))
    .sort(([left], [right]) => left.localeCompare(right));
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

async function settle(pending: Promise<string | null>) {
  return pending.then(
    (value) => value,
    () => null,
  );
}

function recipient_data(envelope_json: string) {
  return parse_ratchet_envelope(envelope_json)!.recipients[RECIPIENT];
}

async function make_pair(offer?: OneTimeOffer) {
  const receiver_vault = make_vault((await generate_ratchet_keys())!);
  const sender_vault = make_vault((await generate_ratchet_keys())!);

  await publish("hello", receiver_vault, offer);
  await publish("davidw", sender_vault);

  return { receiver_vault, sender_vault };
}

describe("first message bound to a one-time prekey", () => {
  beforeEach(() => {
    h.vault = null;
    h.directory.clear();
    h.store.clear();
    h.one_time_secrets.clear();
    h.deleted_one_time_ids.length = 0;
    localStorage.clear();
    clear_sender_identity_authentication_cache();
  });

  it("names the one-time prekey and the signed prekey on the wire", async () => {
    const { receiver_vault, sender_vault } = await make_pair({
      key_id: ONE_TIME_KEY_ID,
      advertised_version: 4,
    });

    const first = await send("first", sender_vault);
    const data = recipient_data(first);

    expect(data.x3dh_v).toBe(4);
    expect(data.opk_id).toBe(ONE_TIME_KEY_ID);
    expect(data.spk_id).toBe(
      await compute_signed_prekey_id(
        base64_to_array(receiver_vault.ratchet_signed_prekey_public!),
      ),
    );
  });

  it("is read by the recipient, who then discards the one-time key", async () => {
    const { receiver_vault, sender_vault } = await make_pair({
      key_id: ONE_TIME_KEY_ID,
      advertised_version: 4,
    });

    const first = await send("first", sender_vault);
    const sender_store = snapshot();

    restore(new Map());
    expect(h.one_time_secrets.has(ONE_TIME_KEY_ID)).toBe(true);
    expect(await receive(first, receiver_vault, "m1")).toBe("first");
    expect(h.deleted_one_time_ids).toEqual([ONE_TIME_KEY_ID]);
    expect(h.one_time_secrets.has(ONE_TIME_KEY_ID)).toBe(false);

    const answer = await reply("answer", receiver_vault);

    restore(sender_store);
    expect(await read_reply(answer, sender_vault, "r1")).toBe("answer");
  });

  it("keeps naming the one-time prekey until the recipient answers", async () => {
    const { receiver_vault, sender_vault } = await make_pair({
      key_id: ONE_TIME_KEY_ID,
      advertised_version: 4,
    });

    const first = await send("first", sender_vault);
    const second = await send("second", sender_vault);

    expect(recipient_data(second).x3dh_v).toBe(4);
    expect(recipient_data(second).opk_id).toBe(ONE_TIME_KEY_ID);
    expect(recipient_data(second).ephemeral_key).toBe(
      recipient_data(first).ephemeral_key,
    );

    restore(new Map());
    expect(await receive(first, receiver_vault, "m1")).toBe("first");
    expect(await receive(second, receiver_vault, "m2")).toBe("second");
    expect(h.deleted_one_time_ids).toEqual([ONE_TIME_KEY_ID]);
  });

  it("opens a replayed first message only through the recovery copy and starts no session", async () => {
    const { receiver_vault, sender_vault } = await make_pair({
      key_id: ONE_TIME_KEY_ID,
      advertised_version: 4,
    });

    const first = await send("first", sender_vault);

    restore(new Map());
    expect(await receive(first, receiver_vault, "m1")).toBe("first");

    restore(new Map());
    expect(await settle(receive(first, receiver_vault, "m1-replay"))).toBe(
      "first",
    );
    expect(stored_ratchet_states()).toEqual([]);
    expect(h.deleted_one_time_ids).toEqual([ONE_TIME_KEY_ID]);
  });

  it("leaves the stored session untouched when a first message is replayed", async () => {
    const { receiver_vault, sender_vault } = await make_pair({
      key_id: ONE_TIME_KEY_ID,
      advertised_version: 4,
    });

    const first = await send("first", sender_vault);
    const second = await send("second", sender_vault);

    restore(new Map());
    expect(await receive(first, receiver_vault, "m1")).toBe("first");

    const before = JSON.stringify(stored_ratchet_states());

    expect(await settle(receive(first, receiver_vault, "m1-replay"))).toBe(
      "first",
    );
    expect(JSON.stringify(stored_ratchet_states())).toBe(before);
    expect(await receive(second, receiver_vault, "m2")).toBe("second");
  });

  it("reads mail through the recovery copy when the one-time key is gone and later mail still works", async () => {
    const { receiver_vault, sender_vault } = await make_pair({
      key_id: ONE_TIME_KEY_ID,
      advertised_version: 4,
    });

    const lost = await send("lost", sender_vault);

    h.one_time_secrets.clear();

    restore(new Map());
    expect(await settle(receive(lost, receiver_vault, "m1"))).toBe("lost");
    expect(stored_ratchet_states()).toEqual([]);
    expect(h.deleted_one_time_ids).toEqual([]);

    const receiver_store = snapshot();

    await publish("hello", receiver_vault);

    restore(new Map());
    const next = await send("next", sender_vault);

    expect(recipient_data(next).opk_id).toBeUndefined();

    restore(receiver_store);
    expect(await receive(next, receiver_vault, "m2")).toBe("next");
  });

  it("writes the key bound version when the server does not advertise the one-time version", async () => {
    const { receiver_vault, sender_vault } = await make_pair({
      key_id: ONE_TIME_KEY_ID,
      advertised_version: 3,
    });

    const first = await send("first", sender_vault);
    const data = recipient_data(first);

    expect(data.x3dh_v).toBe(3);
    expect(data.opk_id).toBeUndefined();
    expect(data.spk_id).toBeUndefined();

    restore(new Map());
    expect(await receive(first, receiver_vault, "m1")).toBe("first");
    expect(h.deleted_one_time_ids).toEqual([]);
    expect(h.one_time_secrets.has(ONE_TIME_KEY_ID)).toBe(true);
  });

  it("writes no one-time fields when the recipient has no one-time prekey", async () => {
    const { receiver_vault, sender_vault } = await make_pair();

    const first = await send("first", sender_vault);
    const data = recipient_data(first);

    expect(data.x3dh_v === undefined || data.x3dh_v <= 3).toBe(true);
    expect(data.opk_id).toBeUndefined();
    expect(data.spk_id).toBeUndefined();

    restore(new Map());
    expect(await receive(first, receiver_vault, "m1")).toBe("first");
    expect(h.deleted_one_time_ids).toEqual([]);
  });
});

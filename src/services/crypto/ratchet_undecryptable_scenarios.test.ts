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

const h = vi.hoisted(() => ({
  vault: null as unknown,
  bundle: null as unknown,
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
    get: vi.fn(async (url: string) =>
      url.includes("prekey-bundle") ? { data: h.bundle } : { code: "NOT_FOUND" },
    ),
    put: vi.fn(async () => ({ data: { state_version: 1 } })),
    post: vi.fn(async () => ({ data: { state_version: 1 } })),
    delete: vi.fn(async () => ({})),
  },
}));

vi.mock("@/services/account_manager", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  get_current_account: vi.fn(async () => ({ user: { id: "user-1" } })),
}));

import {
  generate_ratchet_keys,
  encrypt_for_ratchet_recipient,
  build_ratchet_envelope,
  parse_ratchet_envelope,
  decrypt_ratchet_message,
  RecoveryLaneUnavailableError,
} from "@/services/crypto/ratchet_manager";

const SENDER = "sender@astermail.org";
const RECIPIENT = "recipient@astermail.org";
const ALIAS = "support@astermail.org";

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

function bundle_for(vault: EncryptedVault, post_quantum = true) {
  return {
    kem_identity_key: vault.ratchet_identity_public,
    signed_prekey: vault.ratchet_signed_prekey_public,
    signed_prekey_signature: "",
    one_time_prekey: null,
    pq_prekey: null,
    pq_kem_public_key: post_quantum ? vault.ratchet_pq_identity_public : null,
  };
}

async function send(body: string, sender_vault: EncryptedVault) {
  h.vault = sender_vault;

  const data = await encrypt_for_ratchet_recipient(
    SENDER,
    RECIPIENT,
    "recipient",
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
  message_id?: string,
) {
  h.vault = receiver_vault;

  const parsed = parse_ratchet_envelope(envelope_json)!;

  return decrypt_ratchet_message(
    RECIPIENT,
    SENDER,
    parsed,
    receiver_vault,
    message_id,
  );
}

async function receive_without_recovery_lane(
  envelope_json: string,
  receiver_vault: EncryptedVault,
  message_id?: string,
) {
  h.vault = receiver_vault;

  const parsed = parse_ratchet_envelope(envelope_json)!;

  delete parsed.recipients[RECIPIENT].recovery;

  return decrypt_ratchet_message(
    RECIPIENT,
    SENDER,
    parsed,
    receiver_vault,
    message_id,
  );
}

function snapshot_state() {
  return new Map(
    [...h.store.entries()].map(([key, value]) => [
      key,
      JSON.parse(JSON.stringify(value)),
    ]),
  );
}

function restore_state(snapshot: Map<string, unknown>) {
  h.store.clear();

  for (const [key, value] of snapshot) {
    h.store.set(key, JSON.parse(JSON.stringify(value)));
  }
}

function recovery_of(envelope_json: string) {
  const parsed = parse_ratchet_envelope(envelope_json)!;

  return parsed.recipients[RECIPIENT].recovery ?? null;
}

describe("undecryptable-message failure modes", () => {
  beforeEach(() => {
    h.vault = null;
    h.bundle = null;
    h.store.clear();
    localStorage.clear();
  });

  it("recovers when a second device clobbers the shared ratchet state", async () => {
    const sender_vault = make_vault((await generate_ratchet_keys())!);
    const receiver_vault = make_vault((await generate_ratchet_keys())!);

    h.bundle = bundle_for(receiver_vault);

    const first = await send("first message", sender_vault);
    const second = await send("second message", sender_vault);

    expect(await receive(first, receiver_vault, "m1")).toBe("first message");

    const advanced = snapshot_state();

    expect(await receive(second, receiver_vault, "m2")).toBe("second message");

    restore_state(advanced);

    const third = await send("third message", sender_vault);

    expect(await receive(third, receiver_vault, "m3")).toBe("third message");
  });

  it("recovers a message sealed to an identity the recipient has since rotated away from", async () => {
    const sender_vault = make_vault((await generate_ratchet_keys())!);
    const old_keys = (await generate_ratchet_keys())!;
    const old_vault = make_vault(old_keys);

    h.bundle = bundle_for(old_vault);

    const envelope = await send("sealed to the old identity", sender_vault);

    const rotated_vault = make_vault((await generate_ratchet_keys())!);

    rotated_vault.ratchet_previous_keys = [
      {
        ratchet_identity_key: old_keys.identity_jwk,
        ratchet_identity_public: old_keys.identity_public,
        ratchet_signed_prekey: old_keys.signed_prekey_jwk,
        ratchet_signed_prekey_public: old_keys.signed_prekey_public,
        ratchet_pq_identity_key: old_keys.pq_identity_secret,
        ratchet_pq_identity_public: old_keys.pq_identity_public,
        ratchet_pq_identity_seed: old_keys.pq_identity_seed,
      },
    ] as EncryptedVault["ratchet_previous_keys"];

    h.store.clear();

    expect(await receive(envelope, rotated_vault)).toBe(
      "sealed to the old identity",
    );
  });

  it("still delivers to a recipient that has never published a post-quantum key", async () => {
    const sender_vault = make_vault((await generate_ratchet_keys())!);
    const legacy_keys = (await generate_ratchet_keys())!;
    const legacy_vault = make_vault(legacy_keys);

    delete (legacy_vault as unknown as Record<string, unknown>)
      .ratchet_pq_identity_public;

    h.bundle = bundle_for(legacy_vault, false);

    const envelope = await send("classical lane only", sender_vault);

    expect(recovery_of(envelope)?.kem_ct).toBeUndefined();

    h.store.clear();

    expect(await receive(envelope, legacy_vault)).toBe("classical lane only");
  });

  it("opens a post-quantum bootstrap sealed to the current identity without the recovery lane", async () => {
    const sender_vault = make_vault((await generate_ratchet_keys())!);
    const receiver_vault = make_vault((await generate_ratchet_keys())!);

    h.bundle = bundle_for(receiver_vault);

    const envelope = await send("current identity, post-quantum", sender_vault);

    expect(recovery_of(envelope)?.kem_ct).toBeTruthy();

    h.store.clear();

    expect(
      await receive_without_recovery_lane(envelope, receiver_vault, "pq1"),
    ).toBe("current identity, post-quantum");
  });

  it("opens a post-quantum bootstrap from a rotated-away identity without the recovery lane", async () => {
    const sender_vault = make_vault((await generate_ratchet_keys())!);
    const old_keys = (await generate_ratchet_keys())!;

    h.bundle = bundle_for(make_vault(old_keys));

    const envelope = await send("rotated identity, post-quantum", sender_vault);

    const rotated_vault = make_vault((await generate_ratchet_keys())!);

    rotated_vault.ratchet_previous_keys = [
      {
        ratchet_identity_key: old_keys.identity_jwk,
        ratchet_identity_public: old_keys.identity_public,
        ratchet_signed_prekey: old_keys.signed_prekey_jwk,
        ratchet_signed_prekey_public: old_keys.signed_prekey_public,
        ratchet_pq_identity_key: old_keys.pq_identity_secret,
        ratchet_pq_identity_public: old_keys.pq_identity_public,
        ratchet_pq_identity_seed: old_keys.pq_identity_seed,
      },
    ] as EncryptedVault["ratchet_previous_keys"];

    h.store.clear();

    expect(
      await receive_without_recovery_lane(envelope, rotated_vault, "pq2"),
    ).toBe("rotated identity, post-quantum");
  });

  it("rebuilds the post-quantum identity secret from the seed alone", async () => {
    const sender_vault = make_vault((await generate_ratchet_keys())!);
    const receiver_vault = make_vault((await generate_ratchet_keys())!);

    h.bundle = bundle_for(receiver_vault);

    const envelope = await send("seed-only vault", sender_vault);

    delete (receiver_vault as unknown as Record<string, unknown>)
      .ratchet_pq_identity_key;

    h.store.clear();

    expect(
      await receive_without_recovery_lane(envelope, receiver_vault, "pq3"),
    ).toBe("seed-only vault");
  });

  it("decrypts messages that arrive out of order", async () => {
    const sender_vault = make_vault((await generate_ratchet_keys())!);
    const receiver_vault = make_vault((await generate_ratchet_keys())!);

    h.bundle = bundle_for(receiver_vault);

    const first = await send("one", sender_vault);
    const second = await send("two", sender_vault);
    const third = await send("three", sender_vault);

    expect(await receive(third, receiver_vault, "m3")).toBe("three");
    expect(await receive(first, receiver_vault, "m1")).toBe("one");
    expect(await receive(second, receiver_vault, "m2")).toBe("two");
  });

  it("blocks the send when the recovery lane cannot be sealed", async () => {
    const sender_vault = make_vault((await generate_ratchet_keys())!);
    const receiver_vault = make_vault((await generate_ratchet_keys())!);

    h.bundle = {
      ...bundle_for(receiver_vault),
      pq_kem_public_key: "bm90LWEta2V5",
    };

    h.vault = sender_vault;

    await expect(
      encrypt_for_ratchet_recipient(
        SENDER,
        RECIPIENT,
        "recipient",
        "must never ship",
        sender_vault,
      ),
    ).rejects.toBeInstanceOf(RecoveryLaneUnavailableError);
  });

  it("never emits a ratchet body without a recovery lane", async () => {
    const sender_vault = make_vault((await generate_ratchet_keys())!);
    const receiver_vault = make_vault((await generate_ratchet_keys())!);

    h.bundle = bundle_for(receiver_vault);
    h.vault = sender_vault;

    for (const body of ["first", "second", "third"]) {
      const data = await encrypt_for_ratchet_recipient(
        SENDER,
        RECIPIENT,
        "recipient",
        body,
        sender_vault,
      );

      expect(data?.recovery).toBeTruthy();
    }
  });

  it("keeps the recovery lane a fixed cost instead of a second copy of the body", async () => {
    const sender_vault = make_vault((await generate_ratchet_keys())!);
    const receiver_vault = make_vault((await generate_ratchet_keys())!);

    h.bundle = bundle_for(receiver_vault);

    const small = await send("hi", sender_vault);
    const large = await send("x".repeat(100_000), sender_vault);

    const small_lane = JSON.stringify(recovery_of(small)).length;
    const large_lane = JSON.stringify(recovery_of(large)).length;

    expect(large_lane).toBe(small_lane);
    expect(large.length).toBeLessThan(100_000 * 1.4 + 4_000);
  });

  it("decrypts a message addressed to one of the recipient's aliases", async () => {
    const sender_vault = make_vault((await generate_ratchet_keys())!);
    const receiver_vault = make_vault((await generate_ratchet_keys())!);

    h.bundle = bundle_for(receiver_vault);
    h.vault = sender_vault;

    const data = await encrypt_for_ratchet_recipient(
      SENDER,
      ALIAS,
      "recipient",
      "sent to the alias",
      sender_vault,
    );

    expect(data).not.toBeNull();

    const envelope = build_ratchet_envelope(
      sender_vault.ratchet_identity_public!,
      { [ALIAS]: data! },
    );

    h.vault = receiver_vault;
    h.store.clear();

    const parsed = parse_ratchet_envelope(envelope)!;

    expect(
      await decrypt_ratchet_message(
        RECIPIENT,
        SENDER,
        parsed,
        receiver_vault,
        "alias1",
      ),
    ).toBe("sent to the alias");
  });

  it("keeps a reply on the alias conversation decryptable after the first message", async () => {
    const sender_vault = make_vault((await generate_ratchet_keys())!);
    const receiver_vault = make_vault((await generate_ratchet_keys())!);

    h.bundle = bundle_for(receiver_vault);

    const bodies = ["alias one", "alias two"];
    const envelopes: string[] = [];

    for (const body of bodies) {
      h.vault = sender_vault;

      const data = await encrypt_for_ratchet_recipient(
        SENDER,
        ALIAS,
        "recipient",
        body,
        sender_vault,
      );

      envelopes.push(
        build_ratchet_envelope(sender_vault.ratchet_identity_public!, {
          [ALIAS]: data!,
        }),
      );
    }

    h.vault = receiver_vault;
    h.store.clear();

    for (const [index, body] of bodies.entries()) {
      expect(
        await decrypt_ratchet_message(
          RECIPIENT,
          SENDER,
          parse_ratchet_envelope(envelopes[index])!,
          receiver_vault,
          `alias_seq_${index}`,
        ),
      ).toBe(body);
    }
  });

  it("returns null when the envelope holds no entry the recipient can open", async () => {
    const sender_vault = make_vault((await generate_ratchet_keys())!);
    const receiver_vault = make_vault((await generate_ratchet_keys())!);
    const stranger_vault = make_vault((await generate_ratchet_keys())!);

    h.bundle = bundle_for(stranger_vault);
    h.vault = sender_vault;

    const data = await encrypt_for_ratchet_recipient(
      SENDER,
      "stranger@astermail.org",
      "stranger",
      "not for you",
      sender_vault,
    );

    const envelope = build_ratchet_envelope(
      sender_vault.ratchet_identity_public!,
      { "stranger@astermail.org": data! },
    );

    h.vault = receiver_vault;
    h.store.clear();

    expect(
      await decrypt_ratchet_message(
        RECIPIENT,
        SENDER,
        parse_ratchet_envelope(envelope)!,
        receiver_vault,
        "stranger1",
      ),
    ).toBeNull();
  });
});

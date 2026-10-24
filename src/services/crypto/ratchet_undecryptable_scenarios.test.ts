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

vi.mock(
  "@/services/crypto/sender_identity_authentication",
  async (import_original) => {
    const actual =
      await import_original<
        typeof import("@/services/crypto/sender_identity_authentication")
      >();

    return {
      ...actual,
      note_message_sender_identity: vi.fn(actual.note_message_sender_identity),
    };
  },
);

vi.mock("@/services/api/client", () => ({
  api_client: {
    get: vi.fn(async (url: string) =>
      url.includes("prekey-bundle")
        ? { data: h.bundle }
        : { code: "NOT_FOUND" },
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

import {
  fetch_from_escrow,
  fetch_verified_from_escrow,
  upload_to_escrow,
} from "@/services/crypto/message_escrow";
import {
  acknowledge_identity_change,
  check_and_pin_identity,
} from "@/services/crypto/ratchet_identity_pin";
import {
  get_cached_ratchet_plaintext,
  get_cached_ratchet_sender_key,
  set_cached_ratchet_plaintext,
} from "@/services/crypto/ratchet_plaintext_cache";
import {
  dismiss_peer_identity_event,
  get_message_sender_identity,
  get_peer_identity_event,
  is_unauthenticated_plaintext,
  mark_unauthenticated_plaintext,
  mark_unconfirmed_sender_plaintext,
} from "@/services/crypto/ratchet_verification_status";
import {
  clear_sender_identity_authentication_cache,
  note_message_sender_identity,
} from "@/services/crypto/sender_identity_authentication";
import { is_ratchet_verified_body } from "@/utils/email_crypto";

const SENDER = "sender@astermail.org";
const RECIPIENT = "recipient@astermail.org";
const ALIAS = "support@astermail.org";
const MALLORY = "mallory@astermail.org";

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

  it("keeps the live chain readable when an old first-chain message arrives without a recovery lane", async () => {
    const sender_vault = make_vault((await generate_ratchet_keys())!);
    const receiver_vault = make_vault((await generate_ratchet_keys())!);

    let sender_store = new Map<string, unknown>();
    let receiver_store = new Map<string, unknown>();

    h.bundle = bundle_for(receiver_vault);
    restore_state(sender_store);

    const first = await send("one", sender_vault);
    const second = await send("two", sender_vault);

    sender_store = snapshot_state();
    restore_state(receiver_store);

    expect(await receive(second, receiver_vault, "m2")).toBe("two");

    h.bundle = bundle_for(sender_vault);
    h.vault = receiver_vault;

    const reply_data = await encrypt_for_ratchet_recipient(
      RECIPIENT,
      SENDER,
      "sender",
      "reply",
      receiver_vault,
    );

    const reply = build_ratchet_envelope(
      receiver_vault.ratchet_identity_public!,
      { [SENDER]: reply_data! },
    );

    receiver_store = snapshot_state();
    restore_state(sender_store);
    h.vault = sender_vault;

    expect(
      await decrypt_ratchet_message(
        SENDER,
        RECIPIENT,
        parse_ratchet_envelope(reply)!,
        sender_vault,
        "r1",
      ),
    ).toBe("reply");

    h.bundle = bundle_for(receiver_vault);

    const third = await send("three", sender_vault);

    sender_store = snapshot_state();
    restore_state(receiver_store);

    expect(await receive(third, receiver_vault, "m3")).toBe("three");

    for (const [key, value] of h.store.entries()) {
      if (!key.startsWith("ratchet_state_") || key.endsWith("_archive")) {
        continue;
      }

      const state = value as { state?: { skipped_message_keys?: unknown[] } };

      if (state.state?.skipped_message_keys) {
        state.state.skipped_message_keys = [];
      }
    }

    const before_old = JSON.stringify(
      [...h.store.entries()].filter(([k]) => k.startsWith("ratchet_state_")),
    );

    expect(await receive(first, receiver_vault, "m1")).toBe("one");

    const after_old = JSON.stringify(
      [...h.store.entries()].filter(([k]) => k.startsWith("ratchet_state_")),
    );

    console.log("KEYS", JSON.stringify([...h.store.keys()]));
    console.log("CHANGED", before_old !== after_old);
    console.log(
      "EPOCH_BEFORE",
      JSON.parse(before_old).map((e: any) => [
        e[0],
        e[1].state?.epoch,
        e[1].state?.dh_remote_public?.slice(0, 8),
      ]),
    );
    console.log(
      "EPOCH_AFTER",
      JSON.parse(after_old).map((e: any) => [
        e[0],
        e[1].state?.epoch,
        e[1].state?.dh_remote_public?.slice(0, 8),
      ]),
    );

    receiver_store = snapshot_state();
    restore_state(sender_store);

    const fourth = await send("four", sender_vault);

    restore_state(receiver_store);

    expect(
      await receive_without_recovery_lane(fourth, receiver_vault, "m4"),
    ).toBe("four");
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

describe("recovery lane trust", () => {
  beforeEach(() => {
    h.vault = null;
    h.bundle = null;
    h.store.clear();
    vi.mocked(upload_to_escrow).mockClear();
    vi.mocked(set_cached_ratchet_plaintext).mockClear();
    vi.mocked(fetch_from_escrow).mockReset();
    vi.mocked(fetch_from_escrow).mockImplementation(async () => null);
    vi.mocked(fetch_verified_from_escrow).mockReset();
    vi.mocked(fetch_verified_from_escrow).mockImplementation(async () => null);
    vi.mocked(get_cached_ratchet_plaintext).mockReset();
    vi.mocked(get_cached_ratchet_plaintext).mockImplementation(
      async () => null,
    );
    vi.mocked(get_cached_ratchet_sender_key).mockReset();
    vi.mocked(get_cached_ratchet_sender_key).mockImplementation(
      async () => null,
    );
    vi.mocked(note_message_sender_identity).mockClear();
  });

  async function lane_message(body: string) {
    const sender_vault = make_vault((await generate_ratchet_keys())!);
    const receiver_vault = make_vault((await generate_ratchet_keys())!);

    h.bundle = bundle_for(receiver_vault);

    const envelope = await send(body, sender_vault);
    const parsed = parse_ratchet_envelope(envelope)!;

    Reflect.deleteProperty(parsed.recipients[RECIPIENT], "ephemeral_key");
    h.store.clear();
    h.vault = receiver_vault;

    return { envelope, parsed, receiver_vault };
  }

  it("never marks lane-recovered mail as verified or escrows it", async () => {
    const { envelope, parsed, receiver_vault } = await lane_message(
      "opened through the lane",
    );

    const plaintext = await decrypt_ratchet_message(
      RECIPIENT,
      SENDER,
      parsed,
      receiver_vault,
      "lane-1",
    );

    expect(plaintext).toBe("opened through the lane");
    expect(is_unauthenticated_plaintext(plaintext)).toBe(true);
    expect(is_ratchet_verified_body(envelope, plaintext)).toBe(false);
    expect(get_message_sender_identity("lane-1")).toBe("unverified");
    expect(upload_to_escrow).not.toHaveBeenCalled();
    expect(set_cached_ratchet_plaintext).toHaveBeenCalledWith(
      expect.stringContaining("lane-1"),
      "opened through the lane",
      true,
      expect.objectContaining({ sender: SENDER }),
    );
  });

  it("verifies lane mail when the escrow holds a copy bound to the same sender", async () => {
    const { envelope, parsed, receiver_vault } = await lane_message(
      "decrypted on another device",
    );

    vi.mocked(fetch_verified_from_escrow).mockImplementation(
      async (_key, binding) =>
        binding.sender === SENDER ? "decrypted on another device" : null,
    );

    const plaintext = await decrypt_ratchet_message(
      RECIPIENT,
      SENDER,
      parsed,
      receiver_vault,
      "lane-2",
    );

    expect(plaintext).toBe("decrypted on another device");
    expect(is_unauthenticated_plaintext(plaintext)).toBe(false);
    expect(is_ratchet_verified_body(envelope, plaintext)).toBe(true);
    expect(note_message_sender_identity).toHaveBeenCalledWith("lane-2", SENDER);
    expect(fetch_verified_from_escrow).toHaveBeenCalledWith(
      expect.stringContaining("lane-2"),
      expect.objectContaining({ sender: SENDER }),
    );
    expect(fetch_from_escrow).not.toHaveBeenCalled();
    expect(upload_to_escrow).not.toHaveBeenCalled();
  });

  it("keeps the other device's unconfirmed mark on lane mail upgraded from the escrow", async () => {
    const { envelope, parsed, receiver_vault } = await lane_message(
      "first contact on another device",
    );

    vi.mocked(fetch_verified_from_escrow).mockImplementation(
      async (_key, binding) => {
        if (binding.sender !== SENDER) return null;
        mark_unconfirmed_sender_plaintext("first contact on another device");

        return "first contact on another device";
      },
    );

    const plaintext = await decrypt_ratchet_message(
      RECIPIENT,
      SENDER,
      parsed,
      receiver_vault,
      "lane-3",
    );

    expect(plaintext).toBe("first contact on another device");
    expect(is_ratchet_verified_body(envelope, plaintext)).toBe(false);
    expect(upload_to_escrow).not.toHaveBeenCalled();
  });

  it("keeps lane mail unverified when the escrow has only an unbound copy", async () => {
    const { envelope, parsed, receiver_vault } = await lane_message(
      "unbound escrow copy",
    );

    vi.mocked(fetch_from_escrow).mockImplementation(async () => ({
      plaintext: "unbound escrow copy",
      verified: false,
      unconfirmed_sender: false,
    }));

    const plaintext = await decrypt_ratchet_message(
      RECIPIENT,
      SENDER,
      parsed,
      receiver_vault,
      "lane-2b",
    );

    expect(plaintext).toBe("unbound escrow copy");
    expect(is_unauthenticated_plaintext(plaintext)).toBe(true);
    expect(is_ratchet_verified_body(envelope, plaintext)).toBe(false);
    expect(get_message_sender_identity("lane-2b")).toBe("unverified");
    expect(note_message_sender_identity).not.toHaveBeenCalled();
    expect(fetch_from_escrow).not.toHaveBeenCalled();
    expect(upload_to_escrow).not.toHaveBeenCalled();
  });

  it("keeps the warning on a cached lane message without a bound escrow copy", async () => {
    const sender_vault = make_vault((await generate_ratchet_keys())!);

    h.bundle = bundle_for(make_vault((await generate_ratchet_keys())!));

    const envelope = await send("cached through the lane", sender_vault);
    const parsed = parse_ratchet_envelope(envelope)!;

    mark_unauthenticated_plaintext("cached through the lane");
    vi.mocked(get_cached_ratchet_plaintext).mockImplementation(
      async () => "cached through the lane",
    );
    vi.mocked(fetch_from_escrow).mockImplementation(async () => ({
      plaintext: "cached through the lane",
      verified: false,
      unconfirmed_sender: false,
    }));

    const plaintext = await decrypt_ratchet_message(
      RECIPIENT,
      SENDER,
      parsed,
      sender_vault,
      "lane-3",
    );

    expect(plaintext).toBe("cached through the lane");
    expect(is_unauthenticated_plaintext(plaintext)).toBe(true);
    expect(is_ratchet_verified_body(envelope, plaintext)).toBe(false);
    expect(fetch_verified_from_escrow).toHaveBeenCalledTimes(1);
    expect(fetch_from_escrow).not.toHaveBeenCalled();
    expect(note_message_sender_identity).not.toHaveBeenCalled();
    expect(set_cached_ratchet_plaintext).not.toHaveBeenCalled();
  });

  it("upgrades a cached lane message once a bound escrow copy appears", async () => {
    const sender_vault = make_vault((await generate_ratchet_keys())!);

    h.bundle = bundle_for(make_vault((await generate_ratchet_keys())!));

    const envelope = await send("cached then verified", sender_vault);
    const parsed = parse_ratchet_envelope(envelope)!;

    vi.mocked(get_cached_ratchet_plaintext).mockImplementation(async (key) => {
      mark_unauthenticated_plaintext("cached then verified", key);

      return "cached then verified";
    });
    vi.mocked(fetch_verified_from_escrow).mockImplementation(
      async () => "cached then verified",
    );

    const plaintext = await decrypt_ratchet_message(
      RECIPIENT,
      SENDER,
      parsed,
      sender_vault,
      "lane-3b",
    );

    expect(plaintext).toBe("cached then verified");
    expect(is_unauthenticated_plaintext(plaintext)).toBe(false);
    expect(is_ratchet_verified_body(envelope, plaintext)).toBe(true);
    expect(note_message_sender_identity).toHaveBeenCalledWith(
      "lane-3b",
      SENDER,
    );
  });

  it("does not ask the escrow again after a bound copy was missing", async () => {
    const sender_vault = make_vault((await generate_ratchet_keys())!);

    h.bundle = bundle_for(make_vault((await generate_ratchet_keys())!));

    const envelope = await send("asked once", sender_vault);
    const parsed = parse_ratchet_envelope(envelope)!;

    mark_unauthenticated_plaintext("asked once");
    vi.mocked(get_cached_ratchet_plaintext).mockImplementation(
      async () => "asked once",
    );

    for (let i = 0; i < 3; i++) {
      await decrypt_ratchet_message(
        RECIPIENT,
        SENDER,
        parsed,
        sender_vault,
        "lane-3c",
      );
    }

    expect(fetch_verified_from_escrow).toHaveBeenCalledTimes(1);
  });

  it("reads the cache with the sender and conversation of the message", async () => {
    const sender_vault = make_vault((await generate_ratchet_keys())!);

    h.bundle = bundle_for(make_vault((await generate_ratchet_keys())!));

    const envelope = await send("bound lookup", sender_vault);
    const parsed = parse_ratchet_envelope(envelope)!;

    vi.mocked(get_cached_ratchet_plaintext).mockImplementation(
      async () => "bound lookup",
    );

    await decrypt_ratchet_message(
      RECIPIENT,
      SENDER,
      parsed,
      sender_vault,
      "lane-4",
    );

    expect(get_cached_ratchet_plaintext).toHaveBeenCalledWith(
      expect.stringContaining("lane-4"),
      {
        sender: SENDER,
        conversation_id: expect.any(String),
      },
    );
  });

  it("never verifies a forged message that reuses a real header under another sender", async () => {
    const { envelope, parsed, receiver_vault } =
      await lane_message("the real message");

    vi.mocked(fetch_verified_from_escrow).mockImplementation(
      async (_key, binding) =>
        binding.sender === SENDER ? "the real message" : null,
    );
    vi.mocked(fetch_from_escrow).mockImplementation(async (_key, binding) =>
      binding.sender === SENDER
        ? {
            plaintext: "the real message",
            verified: true,
            unconfirmed_sender: false,
          }
        : null,
    );

    const plaintext = await decrypt_ratchet_message(
      RECIPIENT,
      MALLORY,
      parsed,
      receiver_vault,
      "forged-1",
    );

    if (plaintext !== null) {
      expect(is_unauthenticated_plaintext(plaintext)).toBe(true);
      expect(is_ratchet_verified_body(envelope, plaintext)).toBe(false);
    }
    expect(get_message_sender_identity("forged-1")).not.toBe("verified");
    expect(note_message_sender_identity).not.toHaveBeenCalledWith(
      expect.anything(),
      MALLORY,
    );
    for (const call of vi.mocked(fetch_verified_from_escrow).mock.calls) {
      expect(call[1]).toMatchObject({ sender: MALLORY });
    }
    for (const call of vi.mocked(fetch_from_escrow).mock.calls) {
      expect(call[1]).toMatchObject({ sender: MALLORY });
    }
    for (const call of vi.mocked(set_cached_ratchet_plaintext).mock.calls) {
      expect(call[2]).toBe(true);
      expect(call[3]).toMatchObject({ sender: MALLORY });
    }
  });

  it("recovers a message from a bound escrow copy as verified when nothing else can open it", async () => {
    const sender_vault = make_vault((await generate_ratchet_keys())!);
    const receiver_vault = make_vault((await generate_ratchet_keys())!);
    const stranger_vault = make_vault((await generate_ratchet_keys())!);

    h.bundle = bundle_for(receiver_vault);

    const envelope = await send("recovered from escrow", sender_vault);
    const parsed = parse_ratchet_envelope(envelope)!;

    h.store.clear();
    h.vault = stranger_vault;

    vi.mocked(fetch_from_escrow).mockImplementation(async () => ({
      plaintext: "recovered from escrow",
      verified: true,
      unconfirmed_sender: false,
    }));

    const plaintext = await decrypt_ratchet_message(
      RECIPIENT,
      SENDER,
      parsed,
      stranger_vault,
      "escrow-1",
    );

    expect(plaintext).toBe("recovered from escrow");
    expect(is_unauthenticated_plaintext(plaintext)).toBe(false);
    expect(is_ratchet_verified_body(envelope, plaintext)).toBe(true);
    expect(fetch_from_escrow).toHaveBeenCalledWith(
      expect.stringContaining("escrow-1"),
      expect.objectContaining({ sender: SENDER }),
    );
  });

  it("recovers a message from an unbound escrow copy as unverified", async () => {
    const sender_vault = make_vault((await generate_ratchet_keys())!);
    const receiver_vault = make_vault((await generate_ratchet_keys())!);
    const stranger_vault = make_vault((await generate_ratchet_keys())!);

    h.bundle = bundle_for(receiver_vault);

    const envelope = await send("recovered from v2 escrow", sender_vault);
    const parsed = parse_ratchet_envelope(envelope)!;

    h.store.clear();
    h.vault = stranger_vault;

    vi.mocked(fetch_from_escrow).mockImplementation(async () => ({
      plaintext: "recovered from v2 escrow",
      verified: false,
      unconfirmed_sender: false,
    }));

    const plaintext = await decrypt_ratchet_message(
      RECIPIENT,
      MALLORY,
      parsed,
      stranger_vault,
      "escrow-2",
    );

    expect(plaintext).toBe("recovered from v2 escrow");
    expect(is_unauthenticated_plaintext(plaintext)).toBe(true);
    expect(is_ratchet_verified_body(envelope, plaintext)).toBe(false);
    expect(get_message_sender_identity("escrow-2")).toBe("unverified");
    expect(note_message_sender_identity).not.toHaveBeenCalledWith(
      expect.anything(),
      MALLORY,
    );
  });

  it("keeps ratchet-decrypted mail verified once the sender key is known and escrows it bound to the sender", async () => {
    const sender_vault = make_vault((await generate_ratchet_keys())!);
    const receiver_vault = make_vault((await generate_ratchet_keys())!);

    h.bundle = bundle_for(receiver_vault);

    const first = await send("first contact", sender_vault);
    const second = await send("opened through the ratchet", sender_vault);

    h.store.clear();
    h.bundle = bundle_for(sender_vault);
    clear_sender_identity_authentication_cache();

    const first_plaintext = await receive(first, receiver_vault, "ratchet-0");

    expect(first_plaintext).toBe("first contact");
    expect(is_unauthenticated_plaintext(first_plaintext)).toBe(false);
    expect(is_ratchet_verified_body(first, first_plaintext)).toBe(true);
    expect(upload_to_escrow).toHaveBeenLastCalledWith(
      expect.stringContaining("ratchet-0"),
      "first contact",
      expect.objectContaining({ sender: SENDER }),
      false,
    );

    const plaintext = await receive(second, receiver_vault, "ratchet-1");

    expect(plaintext).toBe("opened through the ratchet");
    expect(is_unauthenticated_plaintext(plaintext)).toBe(false);
    expect(is_ratchet_verified_body(second, plaintext)).toBe(true);
    expect(upload_to_escrow).toHaveBeenCalledTimes(2);
    expect(upload_to_escrow).toHaveBeenLastCalledWith(
      expect.stringContaining("ratchet-1"),
      "opened through the ratchet",
      expect.objectContaining({
        sender: SENDER,
        conversation_id: expect.any(String),
      }),
      false,
    );
    expect(fetch_verified_from_escrow).not.toHaveBeenCalled();
  });

  it("drops the verified mark and shows a notice when a known sender's key changes", async () => {
    const old_vault = make_vault((await generate_ratchet_keys())!);
    const new_vault = make_vault((await generate_ratchet_keys())!);
    const receiver_vault = make_vault((await generate_ratchet_keys())!);

    h.bundle = bundle_for(receiver_vault);

    const before = await send("from the old key", old_vault);
    const after = await send("from a replaced key", new_vault);

    h.store.clear();
    h.bundle = bundle_for(old_vault);
    clear_sender_identity_authentication_cache();

    expect(await receive(before, receiver_vault, "rotate-0")).toBe(
      "from the old key",
    );

    h.bundle = bundle_for(new_vault);
    clear_sender_identity_authentication_cache();

    const plaintext = await receive(after, receiver_vault, "rotate-2");

    expect(plaintext).toBe("from a replaced key");
    expect(is_ratchet_verified_body(after, plaintext)).toBe(false);
    expect(get_peer_identity_event(SENDER)?.event).toBe("rotated");
  });

  it("judges a chained message by the key bound at the handshake, not the envelope label", async () => {
    const sender_vault = make_vault((await generate_ratchet_keys())!);
    const other_vault = make_vault((await generate_ratchet_keys())!);
    const receiver_vault = make_vault((await generate_ratchet_keys())!);

    dismiss_peer_identity_event(SENDER);
    h.bundle = bundle_for(receiver_vault);

    const first = await send("first contact", sender_vault);
    const second = await send("chained follow-up", sender_vault);

    h.store.clear();
    h.bundle = bundle_for(sender_vault);
    clear_sender_identity_authentication_cache();

    expect(await receive(first, receiver_vault, "label-0")).toBe(
      "first contact",
    );

    h.vault = receiver_vault;
    const relabeled = parse_ratchet_envelope(second)!;

    relabeled.sender_identity_key = other_vault.ratchet_identity_public!;

    const plaintext = await decrypt_ratchet_message(
      RECIPIENT,
      SENDER,
      relabeled,
      receiver_vault,
      "label-1",
    );

    expect(plaintext).toBe("chained follow-up");
    expect(is_ratchet_verified_body(second, plaintext)).toBe(true);
    expect(get_peer_identity_event(SENDER)).toBeNull();
  });

  it("keeps a cached message unconfirmed when only the envelope label names the remembered key", async () => {
    const old_vault = make_vault((await generate_ratchet_keys())!);
    const new_vault = make_vault((await generate_ratchet_keys())!);
    const receiver_vault = make_vault((await generate_ratchet_keys())!);

    h.bundle = bundle_for(receiver_vault);

    const before = await send("from the old key", old_vault);
    const after = await send("from a replaced key", new_vault);

    h.store.clear();
    h.bundle = bundle_for(old_vault);
    clear_sender_identity_authentication_cache();

    expect(await receive(before, receiver_vault, "settle-0")).toBe(
      "from the old key",
    );

    h.bundle = bundle_for(new_vault);
    clear_sender_identity_authentication_cache();

    const plaintext = await receive(after, receiver_vault, "settle-1");

    expect(is_ratchet_verified_body(after, plaintext)).toBe(false);

    vi.mocked(get_cached_ratchet_plaintext).mockImplementation(
      async () => "from a replaced key",
    );

    const relabeled = parse_ratchet_envelope(after)!;

    relabeled.sender_identity_key = old_vault.ratchet_identity_public!;

    const settled = await decrypt_ratchet_message(
      RECIPIENT,
      SENDER,
      relabeled,
      receiver_vault,
      "settle-1",
    );

    expect(settled).toBe("from a replaced key");
    expect(is_ratchet_verified_body(after, settled)).toBe(false);
  });

  it("settles a cached message on the key it was opened with, not the envelope label", async () => {
    const old_vault = make_vault((await generate_ratchet_keys())!);
    const new_vault = make_vault((await generate_ratchet_keys())!);
    const receiver_vault = make_vault((await generate_ratchet_keys())!);

    h.bundle = bundle_for(receiver_vault);

    const before = await send("judged by the opening key", old_vault);
    const after = await send("judged after a replaced key", new_vault);

    h.store.clear();
    h.bundle = bundle_for(old_vault);
    clear_sender_identity_authentication_cache();

    expect(await receive(before, receiver_vault, "judged-0")).toBe(
      "judged by the opening key",
    );

    h.bundle = bundle_for(new_vault);
    clear_sender_identity_authentication_cache();

    const plaintext = await receive(after, receiver_vault, "judged-1");

    expect(is_ratchet_verified_body(after, plaintext)).toBe(false);

    vi.mocked(get_cached_ratchet_plaintext).mockImplementation(
      async () => "judged after a replaced key",
    );

    const relabeled = parse_ratchet_envelope(after)!;

    relabeled.sender_identity_key = new_vault.ratchet_identity_public!;
    h.store.clear();
    await check_and_pin_identity(
      SENDER,
      old_vault.ratchet_identity_public!,
      true,
    );
    await check_and_pin_identity(
      SENDER,
      new_vault.ratchet_identity_public!,
      true,
    );
    await acknowledge_identity_change(SENDER);

    const unjudged = await decrypt_ratchet_message(
      RECIPIENT,
      SENDER,
      relabeled,
      receiver_vault,
      "judged-1",
    );

    expect(is_ratchet_verified_body(after, unjudged)).toBe(false);

    vi.mocked(get_cached_ratchet_sender_key).mockImplementation(
      async () => new_vault.ratchet_identity_public!,
    );

    const settled = await decrypt_ratchet_message(
      RECIPIENT,
      SENDER,
      relabeled,
      receiver_vault,
      "judged-1",
    );

    expect(settled).toBe("judged after a replaced key");
    expect(is_ratchet_verified_body(after, settled)).toBe(true);
    expect(set_cached_ratchet_plaintext).toHaveBeenLastCalledWith(
      expect.stringContaining("judged-1"),
      "judged after a replaced key",
      false,
      expect.objectContaining({ sender: SENDER }),
      false,
      new_vault.ratchet_identity_public!,
    );
  });

  it("verifies mail sealed with one of this account's own identity keys", async () => {
    const own_vault = make_vault((await generate_ratchet_keys())!);

    h.bundle = bundle_for(own_vault);

    const envelope = await send("note to self", own_vault);

    h.store.clear();
    h.bundle = null;
    clear_sender_identity_authentication_cache();

    const plaintext = await receive(envelope, own_vault, "self-1");

    expect(plaintext).toBe("note to self");
    expect(is_ratchet_verified_body(envelope, plaintext)).toBe(true);
  });

  it("verifies a first message whose sender key the directory vouches for", async () => {
    const sender_vault = make_vault((await generate_ratchet_keys())!);
    const receiver_vault = make_vault((await generate_ratchet_keys())!);

    h.bundle = bundle_for(receiver_vault);

    const envelope = await send("served by the directory", sender_vault);

    h.store.clear();
    h.bundle = bundle_for(sender_vault);
    clear_sender_identity_authentication_cache();

    const plaintext = await receive(envelope, receiver_vault, "ratchet-2");

    expect(plaintext).toBe("served by the directory");
    expect(is_ratchet_verified_body(envelope, plaintext)).toBe(true);
    expect(set_cached_ratchet_plaintext).toHaveBeenCalledWith(
      expect.stringContaining("ratchet-2"),
      "served by the directory",
      false,
      expect.objectContaining({ sender: SENDER }),
      false,
      sender_vault.ratchet_identity_public!,
    );
  });
});

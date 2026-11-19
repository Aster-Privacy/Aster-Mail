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

interface DirectoryEntry {
  bundle: Record<string, unknown>;
  history: string[];
}

const h = vi.hoisted(() => ({
  vault: null as unknown,
  directory: new Map<string, unknown>(),
  history_complete: true,
  store: new Map<string, unknown>(),
  cache: new Map<string, { plaintext: string; sender_key: string | null }>(),
  binding: "verified" as "verified" | "tampered" | "legacy",
  owner_key: null as string | null,
  owner_pin: null as { fingerprint: string; conflict: boolean } | null,
  owner_check: "ok" as "ok" | "changed",
  fail_first_contact_write: false,
  first_contact_read: "ok" as "ok" | "unreadable" | "throws",
}));

vi.mock("@/services/crypto/key_manager_pgp", async (import_original) => ({
  ...(await import_original<
    typeof import("@/services/crypto/key_manager_pgp")
  >()),
  verify_ratchet_prekey_bundle_detailed: async () => ({
    verdict: h.binding,
    format: h.binding === "legacy" ? ("hash" as const) : ("v2" as const),
    strict: h.binding === "verified",
  }),
}));

vi.mock(
  "@/services/crypto/ratchet_identity_pin",
  async (import_original) => ({
    ...(await import_original<
      typeof import("@/services/crypto/ratchet_identity_pin")
    >()),
    lookup_owner_key_pin: vi.fn(async () => h.owner_pin),
    check_owner_key_pin: vi.fn(async () => h.owner_check),
  }),
);

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
  encrypted_get: vi.fn(async (key: string) => {
    if (key.startsWith("ratchet_first_contact_")) {
      if (h.first_contact_read === "throws") throw new Error("read failed");
      if (h.first_contact_read === "unreadable") return undefined;
    }

    return h.store.has(key)
      ? JSON.parse(JSON.stringify(h.store.get(key)))
      : undefined;
  }),
  encrypted_set: vi.fn(async (key: string, value: unknown) => {
    if (h.fail_first_contact_write && key.startsWith("ratchet_first_contact_")) {
      throw new Error("write failed");
    }

    h.store.set(key, JSON.parse(JSON.stringify(value)));
  }),
  encrypted_delete: vi.fn(async (key: string) => {
    h.store.delete(key);
  }),
}));

vi.mock("@/services/crypto/ratchet_plaintext_cache", () => ({
  get_cached_ratchet_plaintext: vi.fn(
    async (key: string) => h.cache.get(key)?.plaintext ?? null,
  ),
  get_cached_ratchet_sender_key: vi.fn(
    async (key: string) => h.cache.get(key)?.sender_key ?? null,
  ),
  set_cached_ratchet_plaintext: vi.fn(
    async (
      key: string,
      plaintext: string,
      _unauthenticated?: boolean,
      _binding?: unknown,
      _unconfirmed?: boolean,
      sender_key?: string,
    ) => {
      h.cache.set(key, { plaintext, sender_key: sender_key ?? null });
    },
  ),
}));

vi.mock("@/services/crypto/message_escrow", () => ({
  upload_to_escrow: vi.fn(async () => {}),
  fetch_from_escrow: vi.fn(async () => null),
  fetch_verified_from_escrow: vi.fn(async () => null),
}));

vi.mock("@/services/api/client", () => ({
  api_client: {
    get: vi.fn(async (url: string) => {
      if (url.includes("/keys/public/")) {
        return h.owner_key
          ? { data: { public_key: h.owner_key } }
          : { code: "NOT_FOUND" };
      }

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
import {
  MAX_REMEMBERED_IDENTITIES,
  note_first_contact_identity,
  trust_recipient_keys,
} from "@/services/crypto/ratchet_identity_pin";
import {
  clear_ratchet_verification_status,
  get_message_sender_identity,
  is_trusted_ratchet_plaintext,
} from "@/services/crypto/ratchet_verification_status";

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

function publish(
  username: string,
  vault: EncryptedVault,
  extra: Record<string, unknown> = {},
) {
  const existing = h.directory.get(username) as DirectoryEntry | undefined;

  h.directory.set(username, {
    bundle: {
      ...extra,
      user_id: username,
      kem_identity_key: vault.ratchet_identity_public,
      signed_prekey: vault.ratchet_signed_prekey_public,
      signed_prekey_signature: "",
      one_time_prekey: null,
      pq_prekey: null,
      pq_kem_public_key: vault.ratchet_pq_identity_public,
      ...extra,
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

describe("sender trust for ratchet mail", () => {
  beforeEach(() => {
    h.vault = null;
    h.directory.clear();
    h.history_complete = true;
    h.binding = "verified";
    h.owner_key = null;
    h.owner_pin = null;
    h.owner_check = "ok";
    h.fail_first_contact_write = false;
    h.first_contact_read = "ok";
    h.store.clear();
    h.cache.clear();
    localStorage.clear();
    clear_sender_identity_authentication_cache();
    clear_ratchet_verification_status();
  });

  async function establish(sender_extra: Record<string, unknown> = {}) {
    const receiver_vault = make_vault((await generate_ratchet_keys())!);
    const sender_vault = make_vault((await generate_ratchet_keys())!);

    publish("hello", receiver_vault);
    publish("davidw", sender_vault, sender_extra);

    restore(new Map());
    const first = await send("first", sender_vault);
    const sender_store = snapshot();

    restore(new Map());
    expect(await receive(first, receiver_vault, "m1")).toBe("first");
    const first_status = get_message_sender_identity("m1");
    const first_trusted = is_trusted_ratchet_plaintext("first");
    const answer = await reply("answer", receiver_vault);
    const receiver_store = snapshot();

    restore(sender_store);
    expect(await read_reply(answer, sender_vault, "r1")).toBe("answer");

    return {
      first,
      receiver_vault,
      sender_vault,
      sender_store: snapshot(),
      receiver_store,
      first_status,
      first_trusted,
      reply_status: get_message_sender_identity("r1"),
      reply_trusted: is_trusted_ratchet_plaintext("answer"),
    };
  }

  async function confirm_sender(
    receiver_vault: EncryptedVault,
    sender_vault: EncryptedVault,
  ) {
    h.vault = receiver_vault;
    await trust_recipient_keys(
      SENDER,
      sender_vault.ratchet_identity_public!,
      null,
      null,
      false,
      true,
    );
  }

  async function confirm_recipient(
    sender_vault: EncryptedVault,
    receiver_vault: EncryptedVault,
  ) {
    h.vault = sender_vault;
    await trust_recipient_keys(
      RECIPIENT,
      receiver_vault.ratchet_identity_public!,
      null,
      null,
      false,
      true,
    );
  }

  async function fresh_bootstrap(
    body: string,
    setup: (vaults: {
      receiver_vault: EncryptedVault;
      sender_vault: EncryptedVault;
    }) => void = () => {},
    sender_extra: Record<string, unknown> = {},
    confirmed = false,
  ) {
    const established = await establish(sender_extra);

    setup(established);
    restore(new Map());
    const envelope = await send(body, established.sender_vault);

    restore(established.receiver_store);

    if (confirmed) {
      await confirm_sender(
        established.receiver_vault,
        established.sender_vault,
      );
    }

    expect(await receive(envelope, established.receiver_vault, "m2")).toBe(
      body,
    );

    return {
      status: get_message_sender_identity("m2"),
      trusted: is_trusted_ratchet_plaintext(body),
    };
  }

  it("shows a first contact as unverified", async () => {
    const { first_status, first_trusted } = await establish();

    expect(first_status).toBe("unverified");
    expect(first_trusted).toBe(false);
  });

  it("keeps a first contact unverified when it is shown again", async () => {
    const { first, receiver_vault, receiver_store } = await establish();

    restore(receiver_store);
    expect(await receive(first, receiver_vault, "m1")).toBe("first");
    expect(get_message_sender_identity("m1")).toBe("unverified");
    expect(is_trusted_ratchet_plaintext("first")).toBe(false);

    expect(await receive(first, receiver_vault, "m1")).toBe("first");
    expect(get_message_sender_identity("m1")).toBe("unverified");
  });

  it("verifies a first contact once the user confirms the sender", async () => {
    const { first, receiver_vault, sender_vault, receiver_store } =
      await establish();

    restore(receiver_store);
    h.vault = receiver_vault;
    await trust_recipient_keys(
      SENDER,
      sender_vault.ratchet_identity_public!,
      null,
      null,
      false,
      true,
    );

    expect(await receive(first, receiver_vault, "m1")).toBe("first");
    expect(get_message_sender_identity("m1")).toBe("verified");
    expect(is_trusted_ratchet_plaintext("first")).toBe(true);
  });

  it("shows the first reply to mail you sent first as unverified", async () => {
    const { reply_status, reply_trusted } = await establish();

    expect(reply_status).toBe("unverified");
    expect(reply_trusted).toBe(false);
  });

  it("keeps a later reply unverified until the sender is confirmed", async () => {
    const { receiver_vault, sender_vault, sender_store, receiver_store } =
      await establish();

    restore(receiver_store);
    const again = await reply("again", receiver_vault);

    restore(sender_store);
    expect(await read_reply(again, sender_vault, "r2")).toBe("again");
    expect(get_message_sender_identity("r2")).toBe("unverified");
    expect(is_trusted_ratchet_plaintext("again")).toBe(false);
  });

  it("verifies a later reply once the user confirms the sender", async () => {
    const { receiver_vault, sender_vault, sender_store, receiver_store } =
      await establish();

    restore(receiver_store);
    const again = await reply("again", receiver_vault);

    restore(sender_store);
    await confirm_recipient(sender_vault, receiver_vault);
    expect(await read_reply(again, sender_vault, "r2")).toBe("again");
    expect(get_message_sender_identity("r2")).toBe("verified");
    expect(is_trusted_ratchet_plaintext("again")).toBe(true);
  });

  it("keeps a later message unverified until the sender is confirmed", async () => {
    const { receiver_vault, sender_vault, sender_store, receiver_store } =
      await establish();

    restore(sender_store);
    const next = await send("second", sender_vault);

    restore(receiver_store);
    expect(await receive(next, receiver_vault, "m2")).toBe("second");
    expect(get_message_sender_identity("m2")).toBe("unverified");
    expect(is_trusted_ratchet_plaintext("second")).toBe(false);
  });

  it("verifies a later message once the user confirms the sender", async () => {
    const { receiver_vault, sender_vault, sender_store, receiver_store } =
      await establish();

    restore(sender_store);
    const next = await send("second", sender_vault);

    restore(receiver_store);
    await confirm_sender(receiver_vault, sender_vault);
    expect(await receive(next, receiver_vault, "m2")).toBe("second");
    expect(get_message_sender_identity("m2")).toBe("verified");
    expect(is_trusted_ratchet_plaintext("second")).toBe(true);
  });

  it("keeps a new bootstrap from an unconfirmed identity unverified", async () => {
    const result = await fresh_bootstrap("hybrid restart");

    expect(result.status).toBe("unverified");
    expect(result.trusted).toBe(false);
  });

  it("verifies a new post-quantum bootstrap from a confirmed identity", async () => {
    const result = await fresh_bootstrap("hybrid restart", () => {}, {}, true);

    expect(result.status).toBe("verified");
    expect(result.trusted).toBe(true);
  });

  it("shows a classical bootstrap from a confirmed post-quantum peer as unverified", async () => {
    const result = await fresh_bootstrap(
      "classical restart",
      ({ receiver_vault }) => {
        publish("hello", receiver_vault, { pq_kem_public_key: null });
      },
      {},
      true,
    );

    expect(result.status).toBe("unverified");
    expect(result.trusted).toBe(false);
  });

  it("shows an older handshake from a confirmed identity as unverified", async () => {
    const result = await fresh_bootstrap(
      "older handshake",
      () => {},
      { x3dh_max_version: 3 },
      true,
    );

    expect(result.status).toBe("unverified");
    expect(result.trusted).toBe(false);
  });

  it("shows a classical bootstrap from a post-quantum peer as unverified", async () => {
    const result = await fresh_bootstrap("classical restart", ({ receiver_vault }) => {
      publish("hello", receiver_vault, { pq_kem_public_key: null });
    });

    expect(result.status).toBe("unverified");
    expect(result.trusted).toBe(false);
  });

  it("shows a bootstrap below the remembered handshake version as unverified", async () => {
    const result = await fresh_bootstrap(
      "older handshake",
      () => {},
      { x3dh_max_version: 3 },
    );

    expect(result.status).toBe("unverified");
    expect(result.trusted).toBe(false);
  });

  it("keeps a first contact unverified when its record is missing", async () => {
    const { first, receiver_vault, receiver_store } = await establish();

    restore(receiver_store);

    for (const key of [...h.store.keys()]) {
      if (key.startsWith("ratchet_first_contact_")) h.store.delete(key);
    }

    expect(await receive(first, receiver_vault, "m1")).toBe("first");
    expect(get_message_sender_identity("m1")).toBe("unverified");
    expect(is_trusted_ratchet_plaintext("first")).toBe(false);
  });

  it("keeps a first contact unverified when its record could not be saved", async () => {
    h.fail_first_contact_write = true;
    const { first, receiver_vault, receiver_store } = await establish();

    h.fail_first_contact_write = false;
    restore(receiver_store);

    expect(
      [...h.store.keys()].some((key) =>
        key.startsWith("ratchet_first_contact_"),
      ),
    ).toBe(false);
    expect(await receive(first, receiver_vault, "m1")).toBe("first");
    expect(get_message_sender_identity("m1")).toBe("unverified");
    expect(is_trusted_ratchet_plaintext("first")).toBe(false);
  });

  async function later_message_with_first_contact_read(
    mode: "ok" | "unreadable" | "throws",
    drop_record = false,
  ) {
    const { receiver_vault, sender_vault, sender_store, receiver_store } =
      await establish();

    restore(sender_store);
    const next = await send("second", sender_vault);

    restore(receiver_store);

    if (drop_record) {
      for (const key of [...h.store.keys()]) {
        if (key.startsWith("ratchet_first_contact_")) h.store.delete(key);
      }
    }

    expect(
      [...h.store.keys()].some((key) =>
        key.startsWith("ratchet_first_contact_"),
      ),
    ).toBe(!drop_record);

    h.first_contact_read = mode;
    expect(await receive(next, receiver_vault, "m2")).toBe("second");

    return {
      status: get_message_sender_identity("m2"),
      trusted: is_trusted_ratchet_plaintext("second"),
    };
  }

  it("keeps a later message unverified when its first contact record is unreadable", async () => {
    const result = await later_message_with_first_contact_read("unreadable");

    expect(result.status).toBe("unverified");
    expect(result.trusted).toBe(false);
  });

  it("keeps a later message unverified when its first contact record fails to load", async () => {
    const result = await later_message_with_first_contact_read("throws");

    expect(result.status).toBe("unverified");
    expect(result.trusted).toBe(false);
  });

  it("keeps verifying a known sender that has no first contact record", async () => {
    const result = await later_message_with_first_contact_read("ok", true);

    expect(result.status).toBe("verified");
    expect(result.trusted).toBe(true);
  });

  it("keeps a pending first contact unverified after newer keys push it out", async () => {
    const { receiver_vault, sender_vault, sender_store, receiver_store } =
      await establish();

    restore(sender_store);
    const next = await send("second", sender_vault);

    restore(receiver_store);

    for (let index = 0; index < MAX_REMEMBERED_IDENTITIES; index += 1) {
      await note_first_contact_identity(SENDER, `other-identity-${index}`);
    }

    expect(await receive(next, receiver_vault, "m2")).toBe("second");
    expect(get_message_sender_identity("m2")).toBe("unverified");
    expect(is_trusted_ratchet_plaintext("second")).toBe(false);
  });

  it("keeps a first contact unverified after its record is pushed out", async () => {
    const { first, receiver_vault, receiver_store } = await establish();

    restore(receiver_store);
    h.vault = receiver_vault;

    for (let index = 0; index <= MAX_REMEMBERED_IDENTITIES; index += 1) {
      await note_first_contact_identity(SENDER, `other-identity-${index}`);
    }

    expect(await receive(first, receiver_vault, "m1")).toBe("first");
    expect(get_message_sender_identity("m1")).toBe("unverified");
    expect(is_trusted_ratchet_plaintext("first")).toBe(false);
  });
});

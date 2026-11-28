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
import type { RatchetKeySet } from "@/services/crypto/key_manager_core";
import type { RatchetRecipientData } from "@/services/crypto/ratchet_types";

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

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
  owner_fingerprint: null as string | null,
  recovered_vault: null as unknown,
  recovery_calls: 0,
  cache_on: false,
  cache: new Map<
    string,
    {
      plaintext: string;
      unconfirmed: boolean;
      downgraded: boolean;
      account_unbound: boolean;
      sent_at?: number;
    }
  >(),
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

vi.mock("@/services/crypto/vault_key_recovery", () => ({
  recover_ratchet_keys_from_history: vi.fn(async () => {
    h.recovery_calls += 1;

    return h.recovered_vault;
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

vi.mock("@/services/crypto/ratchet_plaintext_cache", async () => {
  const status = await vi.importActual<
    typeof import("@/services/crypto/ratchet_verification_status")
  >("@/services/crypto/ratchet_verification_status");

  return {
    get_cached_ratchet_plaintext: vi.fn(async (id: string) => {
      const entry = h.cache_on ? h.cache.get(id) : undefined;

      if (!entry) return null;
      if (entry.unconfirmed || entry.downgraded) {
        status.mark_unconfirmed_sender_plaintext(entry.plaintext, id);
      }
      if (entry.downgraded) {
        status.mark_downgraded_plaintext(entry.plaintext, id);
      }

      return entry.plaintext;
    }),
    get_cached_ratchet_sender_key: vi.fn(async () => null),
    set_cached_ratchet_plaintext: vi.fn(
      async (
        id: string,
        plaintext: string,
        _unauthenticated: boolean,
        _binding: unknown,
        unconfirmed = false,
        _key?: string,
        opening: {
          downgraded?: boolean;
          account_unbound?: boolean;
          sent_at?: number;
        } = {},
      ) => {
        if (!h.cache_on) return;

        const existing = h.cache.get(id);

        h.cache.set(id, {
          plaintext,
          unconfirmed: unconfirmed || opening.downgraded === true,
          downgraded:
            opening.downgraded === true || existing?.downgraded === true,
          account_unbound:
            opening.account_unbound === true ||
            existing?.account_unbound === true,
          sent_at: opening.sent_at ?? existing?.sent_at,
        });
      },
    ),
    read_cached_opening: vi.fn(async (id: string) => {
      const entry = h.cache_on ? h.cache.get(id) : undefined;

      return entry
        ? {
            downgraded: entry.downgraded,
            account_unbound: entry.account_unbound,
            sent_at: entry.sent_at,
          }
        : null;
    }),
    mark_cached_downgraded: vi.fn(async (id: string) => {
      const entry = h.cache_on ? h.cache.get(id) : undefined;

      if (!entry) return;
      entry.downgraded = true;
      entry.unconfirmed = true;
      status.mark_downgraded_plaintext(entry.plaintext, id);
    }),
  };
});

vi.mock("@/services/crypto/message_escrow", () => ({
  upload_to_escrow: vi.fn(async () => {}),
  fetch_from_escrow: vi.fn(async () => null),
  fetch_verified_from_escrow: vi.fn(async () => null),
}));

vi.mock("@/services/crypto/ratchet_receive_io", async (import_original) => {
  const original =
    await import_original<
      typeof import("@/services/crypto/ratchet_receive_io")
    >();

  return {
    ...original,
    published_owner_fingerprint: async (peer: string) =>
      h.owner_fingerprint ?? original.published_owner_fingerprint(peer),
  };
});

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
import {
  has_case_duplicates,
  opening_sets_floor,
  sender_account_binding,
} from "@/services/crypto/ratchet_decrypt";
import { fetch_from_escrow } from "@/services/crypto/message_escrow";
import {
  AccountBindingRefusedError,
  clear_sender_identity_authentication_cache,
  SenderIdentityUnverifiedError,
} from "@/services/crypto/sender_identity_authentication";
import { array_to_base64 } from "@/services/crypto/base64";
import { X3DH_VERSION_ACCOUNT_BOUND } from "@/services/crypto/x3dh";
import { set_trust_own_addresses } from "@/lib/sender_trust_store";
import {
  clear_ratchet_verification_status,
  dismiss_peer_identity_event,
  get_message_sender_identity,
  get_peer_identity_event,
  is_downgraded_plaintext,
  is_unconfirmed_sender_plaintext,
} from "@/services/crypto/ratchet_verification_status";
import {
  check_and_pin_identity,
  note_account_bound_opening,
  read_peer_downgrade_floor,
} from "@/services/crypto/ratchet_identity_pin";

const SENDER = "davidw@astermail.org";
const RECIPIENT = "hello@astermail.org";
const ONE_TIME_KEY_ID = 515151;
const FOREIGN_FINGERPRINT = "ab".repeat(20);
const ALIAS = "notes@astermail.org";

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

async function publish(username: string, vault: EncryptedVault, offer = false) {
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
    bundle.x3dh_max_version = 4;
    bundle.ec_one_time_prekey = {
      key_id: ONE_TIME_KEY_ID,
      public_key: await new_one_time_prekey(ONE_TIME_KEY_ID),
    };
  }

  h.directory.set(username, {
    bundle,
    history: [vault.ratchet_identity_public as string],
  });
}

function restore(state: Map<string, unknown>) {
  h.store.clear();

  for (const [key, value] of state) {
    h.store.set(key, JSON.parse(JSON.stringify(value)));
  }
}

async function receive(
  envelope_json: string,
  receiver_vault: EncryptedVault,
  message_id: string,
  sent_at?: number,
) {
  h.vault = receiver_vault;

  return decrypt_ratchet_message(
    RECIPIENT,
    SENDER,
    parse_ratchet_envelope(envelope_json)!,
    receiver_vault,
    message_id,
    sent_at,
  );
}

async function first_message() {
  const receiver_vault = make_vault((await generate_ratchet_keys())!);
  const sender_vault = make_vault((await generate_ratchet_keys())!);

  await publish("hello", receiver_vault, true);
  await publish("davidw", sender_vault);

  h.vault = sender_vault;

  const data = await encrypt_for_ratchet_recipient(
    SENDER,
    RECIPIENT,
    "hello",
    "first",
    sender_vault,
  );

  expect(data).not.toBeNull();

  const envelope = build_ratchet_envelope(
    sender_vault.ratchet_identity_public!,
    { [RECIPIENT]: data! },
  );

  return { receiver_vault, sender_vault, envelope };
}

function as_account_bound(
  envelope_json: string,
  sender_identity_public: string,
  ifp: string | undefined,
  keep_recovery = false,
): string {
  const original = parse_ratchet_envelope(envelope_json)!.recipients[RECIPIENT];
  const bound: RatchetRecipientData = {
    ...original,
    x3dh_v: X3DH_VERSION_ACCOUNT_BOUND,
    ifp,
    recovery: keep_recovery ? original.recovery : undefined,
  };

  return build_ratchet_envelope(sender_identity_public, { [RECIPIENT]: bound });
}

function recipient(
  fields: Partial<RatchetRecipientData>,
): RatchetRecipientData {
  return fields as RatchetRecipientData;
}

const NO_KEYS = {} as RatchetKeySet;

describe("sender_account_binding", () => {
  beforeEach(() => {
    h.vault = null;
    h.directory.clear();
    h.store.clear();
    localStorage.clear();
  });

  it("lets only a confirmed key set the account bound floor", () => {
    expect(opening_sets_floor("verified", "current")).toBe(true);
    expect(opening_sets_floor("verified", "in_window")).toBe(true);

    for (const standing of [
      "retired",
      "undated",
      "unlisted",
      "unavailable",
      undefined,
    ] as const) {
      expect(opening_sets_floor("verified", standing)).toBe(false);
    }

    expect(opening_sets_floor("unverified", "current")).toBe(false);
    expect(opening_sets_floor("mismatch", "current")).toBe(false);
  });

  it("returns no binding below the account bound version", async () => {
    expect(
      await sender_account_binding(recipient({ x3dh_v: 4 }), SENDER, NO_KEYS),
    ).toBeNull();
  });

  it("refuses an account bound start whose initiator fingerprint does not match", async () => {
    await expect(
      sender_account_binding(
        recipient({
          x3dh_v: X3DH_VERSION_ACCOUNT_BOUND,
          ifp: FOREIGN_FINGERPRINT,
        }),
        SENDER,
        NO_KEYS,
      ),
    ).rejects.toBeInstanceOf(SenderIdentityUnverifiedError);
  });

  it("refuses an account bound start with a missing or unreadable fingerprint", async () => {
    for (const ifp of [undefined, "", "zz".repeat(20), "ab"]) {
      await expect(
        sender_account_binding(
          recipient({ x3dh_v: X3DH_VERSION_ACCOUNT_BOUND, ifp }),
          SENDER,
          NO_KEYS,
        ),
      ).rejects.toBeInstanceOf(SenderIdentityUnverifiedError);
    }
  });
});

describe("decrypting an account bound start with a mismatched binding", () => {
  beforeEach(() => {
    h.vault = null;
    h.directory.clear();
    h.store.clear();
    h.one_time_secrets.clear();
    h.deleted_one_time_ids.length = 0;
    localStorage.clear();
    clear_sender_identity_authentication_cache();
  });

  it("returns no plaintext and starts no session", async () => {
    const { receiver_vault, sender_vault, envelope } = await first_message();
    const tampered = as_account_bound(
      envelope,
      sender_vault.ratchet_identity_public!,
      FOREIGN_FINGERPRINT,
    );

    restore(new Map());

    await expect(
      receive(tampered, receiver_vault, "bound-1"),
    ).rejects.toBeInstanceOf(SenderIdentityUnverifiedError);
    expect(get_message_sender_identity("bound-1")).toBe("unverified");
    expect(h.deleted_one_time_ids).toEqual([]);
    expect(
      [...h.store.keys()].filter((key) => key.startsWith("ratchet_state_")),
    ).toEqual([]);

    expect(await receive(envelope, receiver_vault, "plain-1")).toBe("first");
  });

  it("returns no plaintext when the binding is missing", async () => {
    const { receiver_vault, sender_vault, envelope } = await first_message();
    const tampered = as_account_bound(
      envelope,
      sender_vault.ratchet_identity_public!,
      undefined,
    );

    restore(new Map());

    await expect(
      receive(tampered, receiver_vault, "bound-2"),
    ).rejects.toBeInstanceOf(SenderIdentityUnverifiedError);
    expect(get_message_sender_identity("bound-2")).toBe("unverified");
    expect(h.deleted_one_time_ids).toEqual([]);
  });

  it("does not open the recovery copy after the binding is refused", async () => {
    const { receiver_vault, sender_vault, envelope } = await first_message();

    expect(
      parse_ratchet_envelope(envelope)!.recipients[RECIPIENT].recovery,
    ).toBeDefined();

    const tampered = as_account_bound(
      envelope,
      sender_vault.ratchet_identity_public!,
      FOREIGN_FINGERPRINT,
      true,
    );

    expect(
      parse_ratchet_envelope(tampered)!.recipients[RECIPIENT].recovery,
    ).toBeDefined();

    restore(new Map());

    await expect(
      receive(tampered, receiver_vault, "bound-3"),
    ).rejects.toBeInstanceOf(SenderIdentityUnverifiedError);
    expect(get_message_sender_identity("bound-3")).toBe("unverified");
    expect(h.deleted_one_time_ids).toEqual([]);
  });

  it("does not open an escrowed copy after the binding is refused", async () => {
    const { receiver_vault, sender_vault, envelope } = await first_message();
    const tampered = as_account_bound(
      envelope,
      sender_vault.ratchet_identity_public!,
      FOREIGN_FINGERPRINT,
    );

    restore(new Map());
    vi.mocked(fetch_from_escrow).mockResolvedValue({
      plaintext: "escrowed",
      verified: true,
      unconfirmed_sender: false,
      downgraded: false,
    } as Awaited<ReturnType<typeof fetch_from_escrow>>);

    try {
      await expect(
        receive(tampered, receiver_vault, "bound-4"),
      ).rejects.toBeInstanceOf(SenderIdentityUnverifiedError);
      expect(get_message_sender_identity("bound-4")).toBe("unverified");
    } finally {
      vi.mocked(fetch_from_escrow).mockResolvedValue(null);
    }
  });
});

function with_recipients(
  sender_identity_public: string,
  recipients: Record<string, RatchetRecipientData>,
): string {
  return build_ratchet_envelope(sender_identity_public, recipients);
}

describe("refusing a whole message on a mismatched binding", () => {
  beforeEach(() => {
    h.vault = null;
    h.recovered_vault = null;
    h.recovery_calls = 0;
    h.directory.clear();
    h.store.clear();
    h.one_time_secrets.clear();
    h.deleted_one_time_ids.length = 0;
    localStorage.clear();
    clear_sender_identity_authentication_cache();
  });

  afterEach(() => {
    h.recovered_vault = null;
  });

  async function refused_entry() {
    const { receiver_vault, sender_vault, envelope } = await first_message();
    const tampered = parse_ratchet_envelope(
      as_account_bound(
        envelope,
        sender_vault.ratchet_identity_public!,
        FOREIGN_FINGERPRINT,
      ),
    )!.recipients[RECIPIENT];

    restore(new Map());

    return { receiver_vault, sender_vault, envelope, tampered };
  }

  function no_session_started() {
    expect(h.deleted_one_time_ids).toEqual([]);
    expect(
      [...h.store.keys()].filter((key) => key.startsWith("ratchet_state_")),
    ).toEqual([]);
  }

  it("refuses a message whose alias entry carries a mismatched binding", async () => {
    const { receiver_vault, sender_vault, tampered } = await refused_entry();
    const aliased = with_recipients(
      sender_vault.ratchet_identity_public!,
      { [RECIPIENT]: tampered },
    );

    h.vault = receiver_vault;

    await expect(
      decrypt_ratchet_message(
        ALIAS,
        SENDER,
        parse_ratchet_envelope(aliased)!,
        receiver_vault,
        "whole-1",
      ),
    ).rejects.toBeInstanceOf(AccountBindingRefusedError);
    expect(get_message_sender_identity("whole-1")).toBe("unverified");
    no_session_started();
  });

  it("refuses a message whose sender entry carries a mismatched binding", async () => {
    const { receiver_vault, sender_vault, tampered } = await refused_entry();
    const aliased = with_recipients(
      sender_vault.ratchet_identity_public!,
      { [SENDER]: tampered },
    );

    h.vault = receiver_vault;

    await expect(
      decrypt_ratchet_message(
        ALIAS,
        SENDER,
        parse_ratchet_envelope(aliased)!,
        receiver_vault,
        "whole-2",
      ),
    ).rejects.toBeInstanceOf(AccountBindingRefusedError);
    expect(get_message_sender_identity("whole-2")).toBe("unverified");
    no_session_started();
  });

  it("refuses a mismatched binding before reading a malformed start key", async () => {
    const { receiver_vault, sender_vault, tampered } = await refused_entry();
    const malformed = with_recipients(
      sender_vault.ratchet_identity_public!,
      { [RECIPIENT]: { ...tampered, ephemeral_key: "A".repeat(44) } },
    );

    await expect(
      receive(malformed, receiver_vault, "whole-3"),
    ).rejects.toBeInstanceOf(AccountBindingRefusedError);
    expect(get_message_sender_identity("whole-3")).toBe("unverified");
    no_session_started();
  });

  it("refuses a mismatched binding without trying recovered keys", async () => {
    const { receiver_vault, sender_vault, tampered } = await refused_entry();
    const bound = with_recipients(
      sender_vault.ratchet_identity_public!,
      { [RECIPIENT]: tampered },
    );
    const other_vault = make_vault((await generate_ratchet_keys())!);

    h.recovered_vault = receiver_vault;

    await expect(
      receive(bound, other_vault, "whole-4"),
    ).rejects.toBeInstanceOf(AccountBindingRefusedError);
    expect(h.recovery_calls).toBe(0);
    expect(get_message_sender_identity("whole-4")).toBe("unverified");
    no_session_started();
  });
});

function saved_weak_bootstrap(): boolean[] {
  return [...h.store.entries()]
    .filter(([key]) => key.startsWith("ratchet_state_"))
    .map(([, value]) =>
      JSON.stringify(value).includes('"weak_bootstrap":true'),
    );
}

describe("decrypting an older start after an account bound opening", () => {
  beforeEach(() => {
    h.vault = null;
    h.directory.clear();
    h.store.clear();
    h.one_time_secrets.clear();
    h.deleted_one_time_ids.length = 0;
    h.cache.clear();
    h.cache_on = true;
    localStorage.clear();
    clear_sender_identity_authentication_cache();
    clear_ratchet_verification_status();
    dismiss_peer_identity_event(SENDER);
  });

  afterEach(() => {
    h.cache_on = false;
    h.cache.clear();
  });

  async function pinned_first_message() {
    const made = await first_message();

    restore(new Map());
    h.vault = made.receiver_vault;

    await check_and_pin_identity(
      SENDER,
      made.sender_vault.ratchet_identity_public!,
      true,
      false,
      false,
      4,
    );

    return made;
  }

  async function seed_floor(
    sender_vault: EncryptedVault,
    address: string,
    at: number,
  ) {
    expect(
      await note_account_bound_opening(
        SENDER,
        address,
        sender_vault.ratchet_identity_public!,
        at,
      ),
    ).toBe(true);
  }

  async function floors() {
    const floor = await read_peer_downgrade_floor(SENDER);

    return floor === "unreadable" ? null : floor.bound_at;
  }

  it("opens an older start normally when no account bound opening is known", async () => {
    const { receiver_vault, envelope } = await pinned_first_message();
    const plaintext = await receive(envelope, receiver_vault, "floor-1", 2000);

    expect(parse_ratchet_envelope(envelope)!.recipients[RECIPIENT].x3dh_v).toBe(
      4,
    );
    expect(plaintext).toBe("first");
    expect(is_downgraded_plaintext(plaintext, "floor-1")).toBe(false);
    expect(get_peer_identity_event(SENDER)).toBeNull();
    expect(saved_weak_bootstrap()).toEqual([false]);
    expect(await floors()).toEqual({});
  });

  it("marks an older start sent after an account bound opening as downgraded", async () => {
    const { receiver_vault, sender_vault, envelope } =
      await pinned_first_message();

    await seed_floor(sender_vault, RECIPIENT, 1000);

    const plaintext = await receive(envelope, receiver_vault, "floor-2", 2000);

    expect(plaintext).toBe("first");
    expect(is_downgraded_plaintext(plaintext, "floor-2")).toBe(true);
    expect(get_message_sender_identity("floor-2")).toBe("unverified");
    expect(get_peer_identity_event(SENDER)?.event).toBe("downgraded");
    expect(await floors()).toEqual({ [RECIPIENT]: 1000 });
  });

  it("finds our address listed twice only when case is ignored", () => {
    expect(
      has_case_duplicates([
        RECIPIENT,
        RECIPIENT.toUpperCase(),
        "other@astermail.org",
      ]),
    ).toBe(true);
    expect(
      has_case_duplicates([RECIPIENT, "Alias@astermail.org", "alias@astermail.org"]),
    ).toBe(true);
    expect(
      has_case_duplicates([RECIPIENT, "alias@astermail.org", "a.lias@astermail.org"]),
    ).toBe(false);
  });

  it("never applies another sender's floor to this sender", async () => {
    const { receiver_vault, sender_vault, envelope } =
      await pinned_first_message();

    await check_and_pin_identity(
      "someone@astermail.org",
      sender_vault.ratchet_identity_public!,
      true,
      false,
      false,
      4,
    );

    for (const address of [RECIPIENT, "older@astermail.org"]) {
      expect(
        await note_account_bound_opening(
          "someone@astermail.org",
          address,
          sender_vault.ratchet_identity_public!,
          1000,
        ),
      ).toBe(true);
    }

    const plaintext = await receive(envelope, receiver_vault, "floor-22", 2000);

    expect(plaintext).toBe("first");
    expect(is_downgraded_plaintext(plaintext, "floor-22")).toBe(false);
    expect(get_peer_identity_event(SENDER)).toBeNull();
    expect(await floors()).toEqual({});
  });

  it("opens an older start sent before the account bound opening normally", async () => {
    const baseline = await pinned_first_message();
    const without_floor = await receive(
      baseline.envelope,
      baseline.receiver_vault,
      "floor-3-baseline",
      2000,
    );
    const { receiver_vault, sender_vault, envelope } =
      await pinned_first_message();

    await seed_floor(sender_vault, RECIPIENT, 5000);

    const plaintext = await receive(envelope, receiver_vault, "floor-3", 2000);

    expect(plaintext).toBe("first");
    expect(is_downgraded_plaintext(plaintext, "floor-3")).toBe(false);
    expect(is_unconfirmed_sender_plaintext(plaintext, "floor-3")).toBe(
      is_unconfirmed_sender_plaintext(without_floor, "floor-3-baseline"),
    );
    expect(get_message_sender_identity("floor-3")).toBe(
      get_message_sender_identity("floor-3-baseline"),
    );
    expect(get_peer_identity_event(SENDER)).toBeNull();
  });

  it("does not trust an older start without a server time once a floor exists", async () => {
    const { receiver_vault, sender_vault, envelope } =
      await pinned_first_message();

    await seed_floor(sender_vault, RECIPIENT, 1000);

    const plaintext = await receive(envelope, receiver_vault, "floor-4");

    expect(plaintext).toBe("first");
    expect(is_unconfirmed_sender_plaintext(plaintext, "floor-4")).toBe(true);
    expect(is_downgraded_plaintext(plaintext, "floor-4")).toBe(false);
  });

  it("keeps the earliest floor after our primary address changes", async () => {
    const { receiver_vault, sender_vault, envelope } =
      await pinned_first_message();

    await seed_floor(sender_vault, "other@astermail.org", 1500);
    await seed_floor(sender_vault, "older@astermail.org", 1000);

    const plaintext = await receive(envelope, receiver_vault, "floor-5", 1200);

    expect(plaintext).toBe("first");
    expect(is_downgraded_plaintext(plaintext, "floor-5")).toBe(true);
    expect(get_peer_identity_event(SENDER)?.event).toBe("downgraded");
  });

  it("matches the floor on the canonical form of the receiving address", async () => {
    const { receiver_vault, sender_vault, envelope } =
      await pinned_first_message();

    await seed_floor(sender_vault, "Hello+news@AsterMail.org", 1000);

    const plaintext = await receive(envelope, receiver_vault, "floor-6", 2000);

    expect(is_downgraded_plaintext(plaintext, "floor-6")).toBe(true);
  });

  it("marks a cached opening once a floor is learned later", async () => {
    const { receiver_vault, sender_vault, envelope } =
      await pinned_first_message();

    const first = await receive(envelope, receiver_vault, "floor-7", 2000);

    expect(is_downgraded_plaintext(first, "floor-7")).toBe(false);

    await seed_floor(sender_vault, RECIPIENT, 1000);
    clear_ratchet_verification_status();

    const again = await receive(envelope, receiver_vault, "floor-7", 2000);

    expect(again).toBe("first");
    expect(is_downgraded_plaintext(again, "floor-7")).toBe(true);
    expect(get_message_sender_identity("floor-7")).toBe("unverified");
  });

  function filed_under(envelope_json: string, entry_name: string): string {
    const parsed = JSON.parse(envelope_json);
    const entry = parsed.recipients[RECIPIENT];

    parsed.recipients = { [entry_name]: entry };

    return JSON.stringify(parsed);
  }

  it("marks an opening with the account keys under another entry name after the floor", async () => {
    const { receiver_vault, sender_vault, envelope } =
      await pinned_first_message();

    await seed_floor(sender_vault, RECIPIENT, 1000);

    const moved = filed_under(envelope, "news@astermail.org");
    const plaintext = await receive(moved, receiver_vault, "floor-9", 2000);

    expect(plaintext).toBe("first");
    expect(is_downgraded_plaintext(plaintext, "floor-9")).toBe(true);
    expect(get_message_sender_identity("floor-9")).toBe("unverified");
    expect(get_peer_identity_event(SENDER)?.event).toBe("downgraded");
  });

  it("judges the account by its own floor before one under another entry name", async () => {
    const { receiver_vault, sender_vault, envelope } =
      await pinned_first_message();

    await seed_floor(sender_vault, "news@astermail.org", 1000);
    await seed_floor(sender_vault, RECIPIENT, 3000);

    const plaintext = await receive(envelope, receiver_vault, "floor-10", 2000);

    expect(plaintext).toBe("first");
    expect(is_downgraded_plaintext(plaintext, "floor-10")).toBe(false);
  });

  it("treats an opening with no account address as unconfirmed once a floor exists", async () => {
    const { receiver_vault, sender_vault, envelope } =
      await pinned_first_message();

    await seed_floor(sender_vault, RECIPIENT, 1000);
    h.vault = receiver_vault;

    const plaintext = await decrypt_ratchet_message(
      "",
      SENDER,
      parse_ratchet_envelope(envelope)!,
      receiver_vault,
      "floor-11",
      2000,
    );

    expect(plaintext).toBe("first");
    expect(is_downgraded_plaintext(plaintext, "floor-11")).toBe(false);
    expect(is_unconfirmed_sender_plaintext(plaintext, "floor-11")).toBe(true);
  });

  it("refuses a cached opening whose start now claims another owner", async () => {
    const { receiver_vault, sender_vault, envelope } =
      await pinned_first_message();

    const first = await receive(envelope, receiver_vault, "floor-12", 2000);

    expect(first).toBe("first");

    const owner = "cd".repeat(20);
    const tampered = as_account_bound(
      envelope,
      sender_vault.ratchet_identity_public!,
      FOREIGN_FINGERPRINT,
      true,
    );
    const matching = as_account_bound(
      envelope,
      sender_vault.ratchet_identity_public!,
      owner,
      true,
    );

    h.owner_fingerprint = owner;

    try {
      clear_ratchet_verification_status();

      const control = await receive(matching, receiver_vault, "floor-12", 2000);
      const control_identity = get_message_sender_identity("floor-12");
      const control_unconfirmed = is_unconfirmed_sender_plaintext(
        control,
        "floor-12",
      );

      clear_ratchet_verification_status();

      await expect(
        receive(tampered, receiver_vault, "floor-12", 2000),
      ).rejects.toBeInstanceOf(AccountBindingRefusedError);

      expect(control).toBe("first");
      expect(get_message_sender_identity("floor-12")).toBe("unverified");
      expect([control_unconfirmed, control_identity]).not.toEqual([
        true,
        "unverified",
      ]);
    } finally {
      h.owner_fingerprint = null;
    }
  });

  it("marks an older start opened through the recovery copy after the floor", async () => {
    const { receiver_vault, sender_vault, envelope } =
      await pinned_first_message();

    await seed_floor(sender_vault, RECIPIENT, 1000);

    h.one_time_secrets.clear();

    const plaintext = await receive(envelope, receiver_vault, "floor-13", 2000);

    expect(h.deleted_one_time_ids).toEqual([]);

    expect(plaintext).toBe("first");
    expect(is_downgraded_plaintext(plaintext, "floor-13")).toBe(true);
    expect(get_message_sender_identity("floor-13")).toBe("unverified");
  });

  it("opens an older start through the recovery copy normally before any floor", async () => {
    const { receiver_vault, envelope } = await pinned_first_message();
    h.one_time_secrets.clear();
    restore(new Map());

    const plaintext = await receive(envelope, receiver_vault, "floor-14", 2000);

    expect(h.deleted_one_time_ids).toEqual([]);

    expect(plaintext).toBe("first");
    expect(is_downgraded_plaintext(plaintext, "floor-14")).toBe(false);
  });

  it("marks an escrowed older start sent after the floor as downgraded", async () => {
    const { sender_vault, envelope } = await pinned_first_message();
    const stranger = make_vault((await generate_ratchet_keys())!);

    await seed_floor(sender_vault, RECIPIENT, 1000);
    vi.mocked(fetch_from_escrow).mockResolvedValue({
      plaintext: "escrowed",
      verified: true,
      unconfirmed_sender: false,
      downgraded: false,
      account_unbound: true,
      sent_at: 2000,
    });

    try {
      const plaintext = await receive(envelope, stranger, "floor-15", 2000);

      expect(plaintext).toBe("escrowed");
      expect(is_downgraded_plaintext(plaintext, "floor-15")).toBe(true);
      expect(get_message_sender_identity("floor-15")).toBe("unverified");
    } finally {
      vi.mocked(fetch_from_escrow).mockResolvedValue(null);
    }
  });

  it("keeps an escrowed account bound opening clean after the floor", async () => {
    const { sender_vault, envelope } = await pinned_first_message();
    const stranger = make_vault((await generate_ratchet_keys())!);

    await seed_floor(sender_vault, RECIPIENT, 1000);
    vi.mocked(fetch_from_escrow).mockResolvedValue({
      plaintext: "escrowed",
      verified: true,
      unconfirmed_sender: false,
      downgraded: false,
      account_unbound: false,
      sent_at: 2000,
    });

    try {
      const plaintext = await receive(envelope, stranger, "floor-16", 2000);

      expect(plaintext).toBe("escrowed");
      expect(is_downgraded_plaintext(plaintext, "floor-16")).toBe(false);
      expect(is_unconfirmed_sender_plaintext(plaintext, "floor-16")).toBe(
        false,
      );
    } finally {
      vi.mocked(fetch_from_escrow).mockResolvedValue(null);
    }
  });

  it("keeps an older start sent at the same moment as the floor clean", async () => {
    const { receiver_vault, sender_vault, envelope } =
      await pinned_first_message();

    await seed_floor(sender_vault, RECIPIENT, 1000);

    const plaintext = await receive(envelope, receiver_vault, "floor-17", 1000);

    expect(plaintext).toBe("first");
    expect(is_downgraded_plaintext(plaintext, "floor-17")).toBe(false);
  });

  it("marks an older start sent just after the floor as downgraded", async () => {
    const { receiver_vault, sender_vault, envelope } =
      await pinned_first_message();

    await seed_floor(sender_vault, RECIPIENT, 1000);

    const plaintext = await receive(envelope, receiver_vault, "floor-19", 1001);

    expect(is_downgraded_plaintext(plaintext, "floor-19")).toBe(true);
  });

  it("never opens an older entry filed under our address in another case as account bound", async () => {
    const stranger = await first_message();

    restore(new Map());

    const { receiver_vault, sender_vault, envelope } =
      await pinned_first_message();
    const owner = "cd".repeat(20);
    const claimed: RatchetRecipientData = {
      ...parse_ratchet_envelope(stranger.envelope)!.recipients[RECIPIENT],
      x3dh_v: X3DH_VERSION_ACCOUNT_BOUND,
      ifp: owner,
      recovery: undefined,
    };
    const older = parse_ratchet_envelope(envelope)!.recipients[RECIPIENT];
    const crafted = build_ratchet_envelope(sender_vault.ratchet_identity_public!, {
      [RECIPIENT]: claimed,
      [RECIPIENT.toUpperCase()]: older,
    });
    const plain = build_ratchet_envelope(sender_vault.ratchet_identity_public!, {
      [RECIPIENT.toUpperCase()]: older,
    });

    await seed_floor(sender_vault, RECIPIENT, 1000);
    h.owner_fingerprint = owner;

    try {
      expect(
        await receive(crafted, receiver_vault, "floor-20", 2000),
      ).toBeNull();
      expect(get_message_sender_identity("floor-20")).not.toBe("verified");

      const control = await receive(plain, receiver_vault, "floor-21", 2000);

      expect(control).toBe("first");
      expect(is_downgraded_plaintext(control, "floor-21")).toBe(true);
      expect(await floors()).toEqual({ [RECIPIENT]: 1000 });
    } finally {
      h.owner_fingerprint = null;
    }
  });

  it("does not judge mail from one of our own addresses against a floor", async () => {
    const { receiver_vault, sender_vault, envelope } =
      await pinned_first_message();

    await seed_floor(sender_vault, RECIPIENT, 1000);
    set_trust_own_addresses([SENDER]);

    try {
      const plaintext = await receive(
        envelope,
        receiver_vault,
        "floor-18",
        2000,
      );

      expect(plaintext).toBe("first");
      expect(is_downgraded_plaintext(plaintext, "floor-18")).toBe(false);
    } finally {
      set_trust_own_addresses([]);
    }
  });

  it("keeps a downgraded mark on a cached opening read without a server time", async () => {
    const { receiver_vault, sender_vault, envelope } =
      await pinned_first_message();

    await seed_floor(sender_vault, RECIPIENT, 1000);
    await receive(envelope, receiver_vault, "floor-8", 2000);
    clear_ratchet_verification_status();

    const again = await receive(envelope, receiver_vault, "floor-8");

    expect(again).toBe("first");
    expect(is_downgraded_plaintext(again, "floor-8")).toBe(true);
  });
});

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

const h = vi.hoisted(() => ({
  store: new Map<string, unknown>(),
  entry: null as {
    kem_identity_key: string;
    signed_prekey: string;
    signed_prekey_signature: string;
    address_scoped?: boolean | null;
  } | null,
  verification: { valid: false, endorsers: [] as string[] },
  address_mode: true,
}));

vi.mock("@/services/crypto/crypto_enforcement_policy", async (original) => ({
  ...(await original<
    typeof import("@/services/crypto/crypto_enforcement_policy")
  >()),
  is_address_identity_mode_enabled: () => h.address_mode,
}));

vi.mock("@/services/account_manager", () => ({
  get_current_account_id: async () => "acct-1",
}));

vi.mock("@/services/recipient_classification", () => ({
  get_cached_recipient_classification: () => null,
  classify_recipients: async (emails: string[]) =>
    new Map(emails.map((email) => [email, "external"])),
}));

vi.mock("@/services/crypto/memory_key_store", () => ({
  get_derived_encryption_key: () => new Uint8Array(32).fill(3),
  on_vault_cleared: () => () => {},
}));

vi.mock("@/services/crypto/secure_memory", () => ({
  zero_uint8_array: () => undefined,
}));

vi.mock("@/services/crypto/encrypted_storage", async () => {
  const support = (
    await import("@/tests/fixtures/storage_name_support")
  ).storage_name_support(h.store);

  return {
    ...support,
    encrypted_get: vi.fn(async (key: string) =>
      h.store.has(key) ? JSON.parse(JSON.stringify(h.store.get(key))) : null,
    ),
    encrypted_set: vi.fn(async (key: string, value: unknown) => {
      h.store.set(key, JSON.parse(JSON.stringify(value)));
    }),
    encrypted_delete: vi.fn(async (key: string) => {
      h.store.delete(key);
    }),
  };
});

vi.mock("@/services/api/keys", () => ({
  extract_username_from_email: (email: string) => email.split("@")[0],
  is_internal_email: (email: string) =>
    email.toLowerCase().endsWith("@astermail.org"),
}));

vi.mock("@/services/crypto/ratchet_prekey_bundle", () => ({
  fetch_ratchet_identity: vi.fn(
    async (_username: string, _email?: string, address_scope?: boolean) =>
      address_scope ? h.entry : null,
  ),
  fetch_prekey_bundle: vi.fn(async () => null),
  fetch_published_identity_history: vi.fn(async () => null),
}));

vi.mock("@/services/crypto/address_identity_entry", async (original) => ({
  ...(await original<
    typeof import("@/services/crypto/address_identity_entry")
  >()),
  verify_address_entry: vi.fn(() => h.verification),
}));

import {
  accept_endorsed_sender_rotation,
  check_sender_identity_continuity,
  clear_sender_identity_authentication_cache,
} from "@/services/crypto/sender_identity_authentication";
import {
  base64_to_array,
  compute_hash,
} from "@/services/crypto/key_manager_core";
import { reset_contact_entry_state } from "@/services/crypto/contact_entries";
import {
  check_and_pin_identity,
  lookup_identity_pin_record,
} from "@/services/crypto/ratchet_identity_pin";
import {
  get_peer_identity_event,
  record_peer_identity_event,
} from "@/services/crypto/ratchet_verification_status";
import {
  IDENTITY_PIN_PREFIX,
  SENDER_HISTORY_PREFIX,
  canonical_storage_name,
  forget_stored_names,
  reset_storage_name_state,
} from "@/services/crypto/storage_key_names";

const OLD_KEY = btoa("old-address-identity-key-aaaaaaa");
const NEW_KEY = btoa("new-address-identity-key-bbbbbbb");
const STRANGER_KEY = btoa("stranger-identity-key-ccccccccc");
const SENDER = "rotatingpeer@astermail.org";

function place(name: string, value: unknown): void {
  h.store.set(name, value);
  forget_stored_names();
}

async function seed_history(keys: string[]): Promise<void> {
  place(
    await canonical_storage_name(SENDER_HISTORY_PREFIX, "acct-1", SENDER),
    keys,
  );
}

async function seed_pin(key: string, rotated = false): Promise<void> {
  place(await canonical_storage_name(IDENTITY_PIN_PREFIX, "acct-1", SENDER), {
    fingerprint: await compute_hash(base64_to_array(key)),
    verified: true,
    pinned_at: 1,
    ...(rotated ? { rotated: true } : {}),
  });
}

function publish(key: string, endorsers: string[], valid = true): void {
  h.entry = {
    kem_identity_key: key,
    signed_prekey: btoa("signed-prekey"),
    signed_prekey_signature: btoa("signature"),
    address_scoped: true,
  };
  h.verification = { valid, endorsers };
}

function reset_all(): void {
  h.store.clear();
  h.entry = null;
  h.verification = { valid: false, endorsers: [] };
  h.address_mode = true;
  reset_storage_name_state();
  reset_contact_entry_state();
  clear_sender_identity_authentication_cache();
}

describe("endorsed sender key rotation", () => {
  beforeEach(reset_all);

  it("accepts a rotation endorsed by a remembered key and stops reporting a change", async () => {
    await seed_history([OLD_KEY]);
    publish(NEW_KEY, [OLD_KEY]);

    expect(await check_sender_identity_continuity(SENDER, NEW_KEY)).toBe(
      "changed",
    );
    expect(await accept_endorsed_sender_rotation(SENDER, NEW_KEY, true)).toBe(
      true,
    );
    expect(await check_sender_identity_continuity(SENDER, NEW_KEY)).toBe(
      "known",
    );
  });

  it("accepts a rotation endorsed by the pinned key and moves the pin quietly", async () => {
    await seed_pin(OLD_KEY);
    publish(NEW_KEY, [STRANGER_KEY, OLD_KEY]);
    record_peer_identity_event(SENDER, "rotated");

    expect(await accept_endorsed_sender_rotation(SENDER, NEW_KEY, true)).toBe(
      true,
    );
    expect(await check_sender_identity_continuity(SENDER, NEW_KEY)).toBe(
      "known",
    );

    const pin = await lookup_identity_pin_record(SENDER);

    expect(pin !== null && pin !== "unreadable" && pin.address_rooted).toBe(
      true,
    );
    expect(get_peer_identity_event(SENDER)).toBeNull();
  });

  it("keeps warning when no endorser is a key seen before", async () => {
    await seed_history([OLD_KEY]);
    publish(NEW_KEY, [STRANGER_KEY]);

    expect(await accept_endorsed_sender_rotation(SENDER, NEW_KEY, true)).toBe(
      false,
    );
    expect(await check_sender_identity_continuity(SENDER, NEW_KEY)).toBe(
      "changed",
    );
  });

  it("keeps warning when the entry is not endorsed at all", async () => {
    await seed_history([OLD_KEY]);
    publish(NEW_KEY, []);

    expect(await accept_endorsed_sender_rotation(SENDER, NEW_KEY, true)).toBe(
      false,
    );
  });

  it("keeps warning when the entry signature does not verify", async () => {
    await seed_history([OLD_KEY]);
    publish(NEW_KEY, [OLD_KEY], false);

    expect(await accept_endorsed_sender_rotation(SENDER, NEW_KEY, true)).toBe(
      false,
    );
  });

  it("keeps warning when the message key differs from the published entry", async () => {
    await seed_history([OLD_KEY]);
    publish(NEW_KEY, [OLD_KEY]);

    expect(
      await accept_endorsed_sender_rotation(SENDER, STRANGER_KEY, true),
    ).toBe(false);
    expect(await check_sender_identity_continuity(SENDER, STRANGER_KEY)).toBe(
      "changed",
    );
  });

  it("keeps warning when the directory returns only the account key", async () => {
    await seed_history([OLD_KEY]);
    publish(NEW_KEY, [OLD_KEY]);
    h.entry!.address_scoped = null;

    expect(await accept_endorsed_sender_rotation(SENDER, NEW_KEY, true)).toBe(
      false,
    );
  });

  it("does not clear an unacknowledged change to a different key", async () => {
    await seed_history([OLD_KEY]);
    await seed_pin(STRANGER_KEY, true);
    publish(NEW_KEY, [OLD_KEY]);

    expect(await accept_endorsed_sender_rotation(SENDER, NEW_KEY, true)).toBe(
      false,
    );
    expect(await check_sender_identity_continuity(SENDER, NEW_KEY)).toBe(
      "changed",
    );
  });

  it("does not report a check-only match over an unacknowledged change to a different key", async () => {
    await seed_history([OLD_KEY]);
    await seed_pin(STRANGER_KEY, true);
    publish(NEW_KEY, [OLD_KEY]);

    expect(await accept_endorsed_sender_rotation(SENDER, NEW_KEY, false)).toBe(
      false,
    );
  });

  it("does not trust a pinned key that is itself an unacknowledged change", async () => {
    await seed_pin(OLD_KEY, true);
    publish(NEW_KEY, [OLD_KEY]);

    expect(await accept_endorsed_sender_rotation(SENDER, NEW_KEY, true)).toBe(
      false,
    );
  });

  it("keeps warning when address identity mode is off", async () => {
    h.address_mode = false;
    await seed_history([OLD_KEY]);
    publish(NEW_KEY, [OLD_KEY]);

    expect(await accept_endorsed_sender_rotation(SENDER, NEW_KEY, true)).toBe(
      false,
    );
    expect(await check_sender_identity_continuity(SENDER, NEW_KEY)).toBe(
      "changed",
    );
  });

  it("does not let an older remembered key stand in for the current pin", async () => {
    await seed_history([OLD_KEY]);
    await seed_pin(STRANGER_KEY);
    publish(NEW_KEY, [OLD_KEY]);

    expect(await accept_endorsed_sender_rotation(SENDER, NEW_KEY, true)).toBe(
      false,
    );
  });

  it("writes nothing when asked only to check", async () => {
    await seed_history([OLD_KEY]);
    publish(NEW_KEY, [OLD_KEY]);

    expect(await accept_endorsed_sender_rotation(SENDER, NEW_KEY, false)).toBe(
      true,
    );
    expect(await check_sender_identity_continuity(SENDER, NEW_KEY)).toBe(
      "changed",
    );
  });
});

describe("recipient pin on an endorsed rotation", () => {
  beforeEach(reset_all);

  it("moves the pin without flagging a change when the new entry is endorsed", async () => {
    await seed_pin(OLD_KEY);

    expect(
      await check_and_pin_identity(
        SENDER,
        NEW_KEY,
        false,
        false,
        true,
        null,
        false,
        null,
        true,
      ),
    ).toBe("ok");
    expect(get_peer_identity_event(SENDER)).toBeNull();
    expect(await check_sender_identity_continuity(SENDER, NEW_KEY)).toBe(
      "known",
    );
  });

  it("still flags a verified change that is not endorsed", async () => {
    await seed_pin(OLD_KEY);

    expect(
      await check_and_pin_identity(SENDER, NEW_KEY, true, false, true),
    ).toBe("rotated");
    expect(get_peer_identity_event(SENDER)?.event).toBe("rotated");
    expect(await check_sender_identity_continuity(SENDER, NEW_KEY)).toBe(
      "changed",
    );
  });

  it("still refuses an unverified change that is not endorsed", async () => {
    await seed_pin(OLD_KEY);

    expect(
      await check_and_pin_identity(SENDER, NEW_KEY, false, false, true),
    ).toBe("drift");
  });
});

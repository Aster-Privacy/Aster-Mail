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
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const h = vi.hoisted(() => ({
  vault: null as unknown,
  vault_cleared: new Set<() => void>(),
  keys_ready: new Set<() => void>(),
  identity_attempts: 0,
  legacy_attempts: 0,
  vault_fetches: 0,
}));

vi.mock("@/services/crypto/memory_key_store", () => ({
  get_vault_from_memory: () => h.vault,
  get_passphrase_from_memory: () => "correct horse battery staple",
  get_passphrase_bytes: () => new Uint8Array(32).fill(1),
  wait_for_keys_ready: vi.fn(async () => true),
  on_vault_cleared: (callback: () => void) => {
    h.vault_cleared.add(callback);

    return () => h.vault_cleared.delete(callback);
  },
  on_keys_ready: (callback: () => void) => {
    h.keys_ready.add(callback);

    return () => h.keys_ready.delete(callback);
  },
}));

vi.mock("@/services/crypto/vault_refresh", () => ({
  fetch_refreshed_vault: vi.fn(async () => {
    h.vault_fetches += 1;

    return null;
  }),
  adopt_refreshed_vault: vi.fn(async () => true),
}));

vi.mock("@/services/crypto/envelope", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("@/services/crypto/envelope")>();

  return {
    ...original,
    first_base64_byte: () => 0,
    decrypt_envelope_with_identity_key: vi.fn(
      async (
        ...args: Parameters<typeof original.decrypt_envelope_with_identity_key>
      ) => {
        h.identity_attempts += 1;

        return original.decrypt_envelope_with_identity_key(...args);
      },
    ),
  };
});

vi.mock("@/services/crypto/legacy_ios_envelope", () => ({
  decrypt_legacy_ios_envelope: vi.fn(async () => {
    h.legacy_attempts += 1;

    return null;
  }),
}));

import {
  clear_envelope_cache,
  decrypt_envelope,
} from "@/hooks/email_list_helpers/decrypt";
import { encrypt_envelope_with_identity_key } from "@/services/crypto/envelope";

const STALE_VAULT = {
  identity_key: "identity-key-a",
  previous_keys: ["identity-key-b", "identity-key-c"],
};
const HEALED_VAULT = {
  identity_key: "identity-key-a",
  previous_keys: ["identity-key-b", "identity-key-c", "identity-key-d"],
};

function attempts(): number {
  return h.identity_attempts + h.legacy_attempts;
}

async function sealed_to_missing_key() {
  return encrypt_envelope_with_identity_key(
    {
      subject: "Quarterly report",
      from: { name: "A", email: "a@example.test" },
    },
    "identity-key-d",
  );
}

describe("email list envelopes that fail to decrypt", () => {
  beforeEach(() => {
    h.vault = STALE_VAULT;
    h.identity_attempts = 0;
    h.legacy_attempts = 0;
    h.vault_fetches = 0;
    clear_envelope_cache();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("does not retry every key on the next list refresh", async () => {
    const sealed = await sealed_to_missing_key();

    expect(await decrypt_envelope(sealed.encrypted, sealed.nonce, "m1")).toBe(
      null,
    );

    const first_refresh = attempts();

    expect(first_refresh).toBe(4);

    expect(await decrypt_envelope(sealed.encrypted, sealed.nonce, "m1")).toBe(
      null,
    );
    expect(attempts()).toBe(first_refresh);
    expect(h.vault_fetches).toBe(1);
  });

  it("decrypts once the vault is reloaded with the missing key", async () => {
    const sealed = await sealed_to_missing_key();

    await decrypt_envelope(sealed.encrypted, sealed.nonce, "m1");

    h.vault = HEALED_VAULT;
    h.vault_cleared.forEach((callback) => callback());

    const result = await decrypt_envelope(sealed.encrypted, sealed.nonce, "m1");

    expect(result?.subject).toBe("Quarterly report");
  });

  it("retries when the keys become ready", async () => {
    const sealed = await sealed_to_missing_key();

    await decrypt_envelope(sealed.encrypted, sealed.nonce, "m1");

    h.vault = HEALED_VAULT;
    h.keys_ready.forEach((callback) => callback());

    const result = await decrypt_envelope(sealed.encrypted, sealed.nonce, "m1");

    expect(result?.subject).toBe("Quarterly report");
  });

  it("does not remember a failure when the keys change during the attempt", async () => {
    const sealed = await sealed_to_missing_key();
    const pending = decrypt_envelope(sealed.encrypted, sealed.nonce, "m1");

    h.vault_cleared.forEach((callback) => callback());
    await pending;
    h.vault = HEALED_VAULT;

    const result = await decrypt_envelope(sealed.encrypted, sealed.nonce, "m1");

    expect(result?.subject).toBe("Quarterly report");
  });

  it("does not remember a failure from an attempt that began before the keys were ready", async () => {
    const sealed = await sealed_to_missing_key();
    const early = decrypt_envelope(sealed.encrypted, sealed.nonce, "m1");

    h.keys_ready.forEach((callback) => callback());

    const joined = decrypt_envelope(sealed.encrypted, sealed.nonce, "m1");

    await Promise.all([early, joined]);
    h.vault = HEALED_VAULT;

    const result = await decrypt_envelope(sealed.encrypted, sealed.nonce, "m1");

    expect(result?.subject).toBe("Quarterly report");
  });

  it("tries again after a few minutes", async () => {
    const sealed = await sealed_to_missing_key();
    const start = Date.now();
    const now = vi.spyOn(Date, "now").mockReturnValue(start);

    await decrypt_envelope(sealed.encrypted, sealed.nonce, "m1");
    const first_refresh = attempts();

    now.mockReturnValue(start + 5 * 60 * 1000 + 1);
    await decrypt_envelope(sealed.encrypted, sealed.nonce, "m1");

    expect(attempts()).toBe(first_refresh * 2);
  });

  it("decrypts a changed envelope for the same message", async () => {
    const sealed = await sealed_to_missing_key();

    await decrypt_envelope(sealed.encrypted, sealed.nonce, "m1");

    const resealed = await encrypt_envelope_with_identity_key(
      { subject: "Resent", from: { name: "A", email: "a@example.test" } },
      "identity-key-a",
    );
    const result = await decrypt_envelope(
      resealed.encrypted,
      resealed.nonce,
      "m1",
    );

    expect(result?.subject).toBe("Resent");
  });
});

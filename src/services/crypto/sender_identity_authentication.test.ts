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
  current_identity: null as string | null,
  history: null as {
    identity_keys: string[];
    history_complete: boolean;
  } | null,
  history_calls: 0,
}));

vi.mock("@/services/crypto/memory_key_store", () => ({
  get_derived_encryption_key: () => new Uint8Array(32).fill(3),
}));

vi.mock("@/services/crypto/secure_memory", () => ({
  zero_uint8_array: () => undefined,
}));

vi.mock("@/services/crypto/encrypted_storage", () => ({
  encrypted_get: vi.fn(async (key: string) =>
    h.store.has(key) ? JSON.parse(JSON.stringify(h.store.get(key))) : null,
  ),
  encrypted_set: vi.fn(async (key: string, value: unknown) => {
    h.store.set(key, JSON.parse(JSON.stringify(value)));
  }),
}));

vi.mock("@/services/api/keys", () => ({
  extract_username_from_email: (email: string) => email.split("@")[0],
}));

vi.mock("@/services/crypto/ratchet_prekey_bundle", () => ({
  fetch_ratchet_identity: vi.fn(async () =>
    h.current_identity ? { kem_identity_key: h.current_identity } : null,
  ),
  fetch_prekey_bundle: vi.fn(async () => null),
  fetch_published_identity_history: vi.fn(async () => {
    h.history_calls += 1;

    return h.history;
  }),
}));

import {
  authenticate_sender_identity,
  clear_sender_identity_authentication_cache,
} from "@/services/crypto/sender_identity_authentication";

const CURRENT_KEY = btoa("current-identity-key-aaaaaaaaaaaa");
const ROTATED_KEY = btoa("rotated-identity-key-bbbbbbbbbbb");
const FORGED_KEY = btoa("forged-identity-key-cccccccccccc");

describe("sender identity authentication", () => {
  beforeEach(() => {
    h.store.clear();
    h.current_identity = CURRENT_KEY;
    h.history = null;
    h.history_calls = 0;
    clear_sender_identity_authentication_cache();
  });

  it("verifies the currently published identity key", async () => {
    expect(
      await authenticate_sender_identity("someone@astermail.org", CURRENT_KEY),
    ).toBe("verified");
  });

  it("verifies a key that appears in the published history", async () => {
    h.history = {
      identity_keys: [CURRENT_KEY, ROTATED_KEY],
      history_complete: true,
    };

    expect(
      await authenticate_sender_identity("someone@astermail.org", ROTATED_KEY),
    ).toBe("verified");
  });

  it("reports a mismatch for a never published key when history is complete", async () => {
    h.history = {
      identity_keys: [CURRENT_KEY, ROTATED_KEY],
      history_complete: true,
    };

    expect(
      await authenticate_sender_identity("someone@astermail.org", FORGED_KEY),
    ).toBe("mismatch");
  });

  it("reports unverified for a never published key when history is incomplete", async () => {
    h.history = {
      identity_keys: [CURRENT_KEY],
      history_complete: false,
    };

    expect(
      await authenticate_sender_identity("someone@astermail.org", FORGED_KEY),
    ).toBe("unverified");
  });

  it("reports unverified when the history cannot be fetched", async () => {
    h.history = null;

    expect(
      await authenticate_sender_identity("someone@astermail.org", FORGED_KEY),
    ).toBe("unverified");
  });

  it("caches the published history between lookups", async () => {
    h.history = {
      identity_keys: [CURRENT_KEY, ROTATED_KEY],
      history_complete: true,
    };

    await authenticate_sender_identity("someone@astermail.org", FORGED_KEY);
    await authenticate_sender_identity("someone@astermail.org", FORGED_KEY);

    expect(h.history_calls).toBe(1);
  });

  it("verifies a remembered key after the account rotates away from it", async () => {
    h.history = {
      identity_keys: [ROTATED_KEY],
      history_complete: true,
    };

    expect(
      await authenticate_sender_identity("someone@astermail.org", ROTATED_KEY),
    ).toBe("verified");

    h.current_identity = CURRENT_KEY;
    h.history = { identity_keys: [CURRENT_KEY], history_complete: true };
    clear_sender_identity_authentication_cache();

    expect(
      await authenticate_sender_identity("someone@astermail.org", ROTATED_KEY),
    ).toBe("verified");
  });
});

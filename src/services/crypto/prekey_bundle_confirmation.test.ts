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
import type { EncryptedVault } from "./key_manager_core";

import { describe, it, expect, beforeEach, vi } from "vitest";

const h = vi.hoisted(() => ({
  account: { user: { id: "user-A", email: "user-a@example.test" } } as {
    user: { id: string; email: string };
  } | null,
  memory_vault: null as EncryptedVault | null,
  reads: [] as Array<
    | { status: "found"; identity: Record<string, string | null> }
    | { status: "missing" }
    | { status: "unavailable" }
  >,
  read_calls: 0,
  uploads: [] as EncryptedVault[],
}));

vi.mock("../account_manager", () => ({
  get_current_account: async () => h.account,
}));

vi.mock("./memory_key_store", () => ({
  get_vault_from_memory: () => h.memory_vault,
}));

vi.mock("./ratchet_prekey_bundle", () => ({
  clear_ratchet_lookup_misses: () => undefined,
  read_own_published_bundle: async () => {
    h.read_calls++;

    return h.reads.shift() ?? { status: "unavailable" };
  },
  upload_prekey_bundle: async (vault: EncryptedVault) => {
    h.uploads.push(vault);

    return true;
  },
}));

import {
  keep_publishing_until_confirmed,
  published_pq_state,
} from "./prekey_bundle_confirmation";

function vault(): EncryptedVault {
  return {
    identity_key: "identity",
    signed_prekey: "spk",
    signed_prekey_private: "spk_private",
    recovery_codes: [],
    ratchet_identity_public: "ipub",
    ratchet_signed_prekey_public: "spkpub",
    ratchet_pq_identity_public: "pqpub",
  };
}

function published(pq: string | null) {
  return {
    status: "found" as const,
    identity: {
      user_id: "user-A",
      kem_identity_key: "ipub",
      signed_prekey: "spkpub",
      signed_prekey_signature: "sig",
      pq_kem_public_key: pq,
    },
  };
}

const no_sleep = async () => undefined;

beforeEach(() => {
  h.account = { user: { id: "user-A", email: "user-a@example.test" } };
  h.memory_vault = null;
  h.reads = [];
  h.read_calls = 0;
  h.uploads = [];
});

describe("published_pq_state", () => {
  it("confirms a bundle that carries the vault's post-quantum key", async () => {
    h.reads = [published("pqpub")];

    expect(await published_pq_state(vault(), "user-a@example.test")).toBe(
      "confirmed",
    );
  });

  it("treats a bundle without a post-quantum key as missing", async () => {
    h.reads = [published(null)];

    expect(await published_pq_state(vault(), "user-a@example.test")).toBe(
      "missing",
    );
  });

  it("reports an unreadable server as unknown", async () => {
    h.reads = [{ status: "unavailable" }];

    expect(await published_pq_state(vault(), "user-a@example.test")).toBe(
      "unknown",
    );
  });
});

describe("keep_publishing_until_confirmed", () => {
  it("stops at once when the server already holds the bundle", async () => {
    h.reads = [published("pqpub")];

    await expect(
      keep_publishing_until_confirmed(vault(), { sleep: no_sleep }),
    ).resolves.toBe(true);
    expect(h.uploads).toHaveLength(0);
  });

  it("republishes until a read confirms the post-quantum key", async () => {
    h.reads = [{ status: "missing" }, published(null), published("pqpub")];

    await expect(
      keep_publishing_until_confirmed(vault(), {
        sleep: no_sleep,
        max_attempts: 5,
      }),
    ).resolves.toBe(true);
    expect(h.uploads).toHaveLength(2);
    expect(h.read_calls).toBe(3);
  });

  it("does not upload while the server cannot be read", async () => {
    h.reads = [{ status: "unavailable" }, { status: "unavailable" }];

    await expect(
      keep_publishing_until_confirmed(vault(), {
        sleep: no_sleep,
        max_attempts: 2,
      }),
    ).resolves.toBe(false);
    expect(h.uploads).toHaveLength(0);
  });

  it("waits with backoff between attempts", async () => {
    const waits: number[] = [];

    h.reads = [{ status: "missing" }, { status: "missing" }, published("pqpub")];

    await keep_publishing_until_confirmed(vault(), {
      delays_ms: [10, 20],
      max_attempts: 4,
      sleep: async (ms) => {
        waits.push(ms);
      },
    });
    expect(waits).toEqual([10, 20]);
  });

  it("stops when a different account signs in", async () => {
    h.reads = [{ status: "missing" }];

    const run = keep_publishing_until_confirmed(vault(), {
      max_attempts: 3,
      sleep: async () => {
        h.account = { user: { id: "user-B", email: "user-b@example.test" } };
      },
    });

    await expect(run).resolves.toBe(false);
    expect(h.uploads).toHaveLength(1);
  });

  it("publishes the vault in memory when keys rotated since sign-up", async () => {
    h.memory_vault = { ...vault(), ratchet_pq_identity_public: "pqpub-new" };
    h.reads = [published("pqpub"), published("pqpub-new")];

    await expect(
      keep_publishing_until_confirmed(vault(), {
        sleep: no_sleep,
        max_attempts: 3,
      }),
    ).resolves.toBe(true);
    expect(h.uploads).toHaveLength(1);
    expect(h.uploads[0].ratchet_pq_identity_public).toBe("pqpub-new");
  });
});

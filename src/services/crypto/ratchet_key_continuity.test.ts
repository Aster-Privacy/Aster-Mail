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
import type { EncryptedVault, RatchetKeySet } from "./key_manager_core";

import { describe, it, expect } from "vitest";

import {
  carry_displaced_ratchet_keys,
  merge_ratchet_key_history,
  retain_replaced_ratchet_keys,
  vault_holds_ratchet_keys,
} from "./ratchet_key_continuity";
import {
  RATCHET_PREVIOUS_KEYS_LIMIT,
  merge_previous_ratchet_keys,
} from "./key_manager_core";

function key_set(tag: string, spk = tag): RatchetKeySet {
  return {
    ratchet_identity_key: `ik-${tag}`,
    ratchet_identity_public: `ipub-${tag}`,
    ratchet_signed_prekey: `spk-${spk}`,
    ratchet_signed_prekey_public: `spkpub-${spk}`,
    ratchet_pq_identity_key: `pq-${tag}`,
    ratchet_pq_identity_public: `pqpub-${tag}`,
    ratchet_pq_identity_seed: `seed-${tag}`,
  };
}

function large_key_set(tag: string): RatchetKeySet {
  return { ...key_set(tag), ratchet_pq_identity_key: "x".repeat(20 * 1024) };
}

function vault_with(
  current: RatchetKeySet | null,
  previous: RatchetKeySet[] = [],
  identity_key = "account-identity",
): EncryptedVault {
  return {
    identity_key,
    signed_prekey: "sp",
    signed_prekey_private: "spp",
    recovery_codes: [],
    ...(current ?? {}),
    ratchet_previous_keys: previous,
  };
}

describe("merge_ratchet_key_history", () => {
  it("drops duplicates and the current set", () => {
    const merged = merge_ratchet_key_history(
      key_set("now"),
      [key_set("a"), key_set("now")],
      [key_set("a"), key_set("b")],
    );

    expect(merged.map((set) => set.ratchet_identity_public)).toEqual([
      "ipub-a",
      "ipub-b",
    ]);
  });

  it("keeps every signed prekey of a rotated identity", () => {
    const merged = merge_ratchet_key_history(key_set("now"), [
      key_set("a", "one"),
      key_set("a", "two"),
    ]);

    expect(merged.map((set) => set.ratchet_signed_prekey_public)).toEqual([
      "spkpub-one",
      "spkpub-two",
    ]);
  });

  it("fills missing private fields from a duplicate entry", () => {
    const partial = { ...key_set("a"), ratchet_pq_identity_key: undefined };
    const merged = merge_ratchet_key_history(null, [partial], [key_set("a")]);

    expect(merged).toHaveLength(1);
    expect(merged[0].ratchet_pq_identity_key).toBe("pq-a");
  });

  it("drops an entry without a signed prekey when a full one exists", () => {
    const bare = {
      ...key_set("a"),
      ratchet_signed_prekey: "",
      ratchet_signed_prekey_public: "",
    };
    const merged = merge_ratchet_key_history(null, [bare, key_set("a")]);

    expect(merged).toEqual([key_set("a")]);
  });

  it("keeps a long history of small sets", () => {
    const many = Array.from(
      { length: RATCHET_PREVIOUS_KEYS_LIMIT + 5 },
      (_, i) => key_set(`k${i}`),
    );

    expect(merge_ratchet_key_history(null, many)).toHaveLength(
      RATCHET_PREVIOUS_KEYS_LIMIT + 5,
    );
  });

  it("keeps a previous set that only holds post-quantum keys", () => {
    const expanded_only = {
      ratchet_pq_identity_key: "pq-old",
      ratchet_pq_identity_public: "pqpub-old",
    } as RatchetKeySet;
    const seed_only = {
      ratchet_pq_identity_seed: "seed-older",
    } as RatchetKeySet;
    const merged = merge_ratchet_key_history(
      key_set("now"),
      [key_set("a"), expanded_only],
      [seed_only, expanded_only],
    );

    expect(merged).toEqual([key_set("a"), expanded_only, seed_only]);
  });

  it("carries post-quantum only sets through a signed prekey rotation", () => {
    const expanded_only = {
      ratchet_pq_identity_key: "pq-old",
      ratchet_pq_identity_public: "pqpub-old",
    } as RatchetKeySet;
    const replaced = vault_with(key_set("now", "one"), [expanded_only]);
    const next = vault_with(key_set("now", "two"), [expanded_only]);

    expect(retain_replaced_ratchet_keys(replaced, next)).toEqual([
      key_set("now", "one"),
      expanded_only,
    ]);
  });

  it("caps a history that exceeds the byte budget", () => {
    const many = Array.from(
      { length: RATCHET_PREVIOUS_KEYS_LIMIT + 20 },
      (_, i) => large_key_set(`k${i}`),
    );

    expect(merge_ratchet_key_history(null, many)).toHaveLength(
      RATCHET_PREVIOUS_KEYS_LIMIT,
    );
  });
});

describe("merge_previous_ratchet_keys", () => {
  it("keeps every signed prekey of one identity", () => {
    const merged = merge_previous_ratchet_keys(
      [key_set("a", "one")],
      [key_set("a", "two"), key_set("a", "one")],
    );

    expect(merged).toEqual([key_set("a", "one"), key_set("a", "two")]);
  });

  it("keeps a set whose post-quantum key differs", () => {
    const rotated_pq = { ...key_set("a"), ratchet_pq_identity_public: "pq-b" };

    expect(
      merge_previous_ratchet_keys([key_set("a")], [rotated_pq]),
    ).toHaveLength(2);
  });
});

describe("retain_replaced_ratchet_keys", () => {
  it("keeps the full replaced set first, including its post-quantum key", () => {
    const replaced = vault_with(key_set("old"), [key_set("older")]);
    const next = vault_with(key_set("new"), [key_set("older")]);

    expect(retain_replaced_ratchet_keys(replaced, next)).toEqual([
      key_set("old"),
      key_set("older"),
    ]);
  });

  it("does not repeat the replaced set when it is retained twice", () => {
    const replaced = vault_with(key_set("old"));
    const once = vault_with(key_set("new"), [key_set("old")]);

    expect(retain_replaced_ratchet_keys(replaced, once)).toEqual([
      key_set("old"),
    ]);
  });
});

describe("carry_displaced_ratchet_keys", () => {
  it("keeps keys only the displaced vault held", () => {
    const server = vault_with(key_set("server"), [key_set("shared")]);
    const memory = vault_with(key_set("memory"), [
      key_set("shared"),
      key_set("memory-only"),
    ]);

    const carried = carry_displaced_ratchet_keys(server, memory);

    expect(carried.ratchet_identity_public).toBe("ipub-server");
    expect(
      carried.ratchet_previous_keys?.map((set) => set.ratchet_identity_public),
    ).toEqual(["ipub-shared", "ipub-memory", "ipub-memory-only"]);
  });

  it("keeps the target history ahead of displaced keys when the cap is hit", () => {
    const target_history = Array.from(
      { length: RATCHET_PREVIOUS_KEYS_LIMIT },
      (_, i) => large_key_set(`target-${i}`),
    );
    const server = vault_with(key_set("server"), target_history);
    const memory = vault_with(key_set("memory"));

    expect(
      carry_displaced_ratchet_keys(server, memory).ratchet_previous_keys,
    ).toEqual(target_history);
  });

  it("changes nothing when the vaults hold the same keys", () => {
    const server = vault_with(key_set("same"), [key_set("old")]);
    const memory = vault_with(key_set("same"), [key_set("old")]);

    expect(carry_displaced_ratchet_keys(server, memory)).toEqual(server);
  });

  it("never mixes in keys from another account", () => {
    const server = vault_with(key_set("server"));
    const other = vault_with(key_set("other"), [], "other-account");

    expect(carry_displaced_ratchet_keys(server, other)).toBe(server);
  });

  it("accepts a displaced vault from before an account key rotation", () => {
    const server = {
      ...vault_with(key_set("server")),
      previous_keys: ["rotated-identity"],
    };
    const memory = vault_with(key_set("memory"), [], "rotated-identity");

    expect(
      carry_displaced_ratchet_keys(server, memory).ratchet_previous_keys,
    ).toEqual([key_set("memory")]);
  });
});

describe("vault_holds_ratchet_keys", () => {
  it("accepts a vault that holds the published set", () => {
    expect(
      vault_holds_ratchet_keys(
        vault_with(key_set("a")),
        vault_with(key_set("a")),
      ),
    ).toBe(true);
  });

  it("refuses a vault with a different identity, signed prekey, or PQ key", () => {
    const published = vault_with(key_set("a"));

    expect(vault_holds_ratchet_keys(vault_with(key_set("b")), published)).toBe(
      false,
    );
    expect(
      vault_holds_ratchet_keys(vault_with(key_set("a", "rotated")), published),
    ).toBe(false);
    expect(
      vault_holds_ratchet_keys(
        vault_with({ ...key_set("a"), ratchet_pq_identity_public: "other" }),
        published,
      ),
    ).toBe(false);
  });

  it("refuses a vault missing the post-quantum private key", () => {
    const holder = vault_with({
      ...key_set("a"),
      ratchet_pq_identity_key: undefined,
      ratchet_pq_identity_seed: undefined,
    });

    expect(vault_holds_ratchet_keys(holder, vault_with(key_set("a")))).toBe(
      false,
    );
  });

  it("refuses when there is no server vault", () => {
    expect(vault_holds_ratchet_keys(null, vault_with(key_set("a")))).toBe(
      false,
    );
  });
});

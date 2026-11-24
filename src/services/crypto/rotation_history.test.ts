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

import { RATCHET_PREVIOUS_KEYS_LIMIT } from "./key_manager_core";
import {
  ROTATION_VAULT_MAX_BYTES,
  plan_rotation_history,
  ratchet_history_limit,
} from "./rotation_history";

function key_set(tag: string, pq_size = 0): RatchetKeySet {
  return {
    ratchet_identity_key: `ik-${tag}`,
    ratchet_identity_public: `ipub-${tag}`,
    ratchet_signed_prekey: `spk-${tag}`,
    ratchet_signed_prekey_public: `spkpub-${tag}`,
    ratchet_pq_identity_key: pq_size > 0 ? "x".repeat(pq_size) : `pq-${tag}`,
  };
}

function vault_with(
  identity_count: number,
  ratchet_count: number,
  pq_size = 0,
  identity_size = 0,
): EncryptedVault {
  const identity = (i: number) =>
    identity_size > 0 ? `${i}-${"k".repeat(identity_size)}` : `identity-${i}`;

  return {
    identity_key: identity(0),
    previous_keys: Array.from({ length: identity_count }, (_, i) =>
      identity(i + 1),
    ),
    signed_prekey: "sp",
    signed_prekey_private: "spp",
    recovery_codes: [],
    ...key_set("current", pq_size),
    ratchet_previous_keys: Array.from({ length: ratchet_count }, (_, i) =>
      key_set(`old-${i}`, pq_size),
    ),
  };
}

describe("ratchet_history_limit", () => {
  it("treats zero and invalid limits as unlimited", () => {
    expect(ratchet_history_limit(0)).toBeNull();
    expect(ratchet_history_limit(-3)).toBeNull();
    expect(ratchet_history_limit(Number.NaN)).toBeNull();
  });

  it("never keeps fewer ratchet sets than the floor", () => {
    expect(ratchet_history_limit(5)).toBe(RATCHET_PREVIOUS_KEYS_LIMIT);
    expect(ratchet_history_limit(100)).toBe(100);
  });
});

describe("plan_rotation_history", () => {
  it("keeps every key when history is unlimited", () => {
    const plan = plan_rotation_history(vault_with(60, 60), 0);

    expect(plan.previous_keys).toHaveLength(61);
    expect(plan.previous_keys[0]).toBe("identity-0");
    expect(plan.ratchet_previous_keys).toHaveLength(61);
    expect(plan.ratchet_previous_keys[0].ratchet_identity_public).toBe(
      "ipub-current",
    );
    expect(plan.removed_key_count).toBe(0);
  });

  it("removes nothing on a first rotation", () => {
    const plan = plan_rotation_history(vault_with(0, 0), 0);

    expect(plan.previous_keys).toEqual(["identity-0"]);
    expect(plan.ratchet_previous_keys).toHaveLength(1);
    expect(plan.removed_key_count).toBe(0);
  });

  it("prunes to the chosen limit and counts what it removes", () => {
    const plan = plan_rotation_history(vault_with(9, 40), 5);

    expect(plan.previous_keys).toEqual([
      "identity-0",
      "identity-1",
      "identity-2",
      "identity-3",
      "identity-4",
    ]);
    expect(plan.removed_identity_keys).toBe(5);
    expect(plan.ratchet_previous_keys).toHaveLength(
      RATCHET_PREVIOUS_KEYS_LIMIT,
    );
    expect(plan.removed_ratchet_keys).toBe(41 - RATCHET_PREVIOUS_KEYS_LIMIT);
    expect(plan.removed_key_count).toBe(41 - RATCHET_PREVIOUS_KEYS_LIMIT);
  });

  it("reports nothing removed while history is under the limit", () => {
    const plan = plan_rotation_history(vault_with(2, 2), 5);

    expect(plan.previous_keys).toHaveLength(3);
    expect(plan.ratchet_previous_keys).toHaveLength(3);
    expect(plan.removed_key_count).toBe(0);
  });

  it("drops the oldest ratchet sets once the byte budget is reached", () => {
    const plan = plan_rotation_history(vault_with(0, 80, 6 * 1024), 0);

    expect(plan.ratchet_previous_keys.length).toBeGreaterThanOrEqual(
      RATCHET_PREVIOUS_KEYS_LIMIT,
    );
    expect(plan.ratchet_previous_keys.length).toBeLessThan(81);
    expect(plan.ratchet_previous_keys[0].ratchet_identity_public).toBe(
      "ipub-current",
    );
    expect(plan.removed_key_count).toBe(81 - plan.ratchet_previous_keys.length);
  });

  it("trims the oldest identity keys when the vault would be too large", () => {
    const plan = plan_rotation_history(vault_with(400, 0, 0, 4 * 1024), 0);
    const size = JSON.stringify({ ...plan, removed_key_count: 0 }).length;

    expect(plan.previous_keys.length).toBeLessThan(401);
    expect(plan.previous_keys[0].startsWith("0-")).toBe(true);
    expect(plan.removed_identity_keys).toBeGreaterThan(0);
    expect(size).toBeLessThanOrEqual(ROTATION_VAULT_MAX_BYTES);
  });
});

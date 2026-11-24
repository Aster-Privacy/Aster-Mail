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
import { describe, it, expect } from "vitest";

import {
  retain_previous_ratchet_keys,
  RATCHET_PREVIOUS_KEYS_LIMIT,
  type EncryptedVault,
  type RatchetKeySet,
} from "./key_manager_core";

function key_set(tag: string): RatchetKeySet {
  return {
    ratchet_identity_key: `id_priv_${tag}`,
    ratchet_identity_public: `id_pub_${tag}`,
    ratchet_signed_prekey: `spk_priv_${tag}`,
    ratchet_signed_prekey_public: `spk_pub_${tag}`,
  };
}

function vault_with(tag: string, previous?: RatchetKeySet[]): EncryptedVault {
  return {
    identity_key: "ik",
    signed_prekey: "sp",
    signed_prekey_private: "spp",
    recovery_codes: [],
    ratchet_identity_key: `id_priv_${tag}`,
    ratchet_identity_public: `id_pub_${tag}`,
    ratchet_signed_prekey: `spk_priv_${tag}`,
    ratchet_signed_prekey_public: `spk_pub_${tag}`,
    ratchet_previous_keys: previous,
  };
}

describe("retain_previous_ratchet_keys", () => {
  it("preserves the outgoing ratchet keys at the front of the list", () => {
    const result = retain_previous_ratchet_keys(vault_with("v2"));

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(key_set("v2"));
  });

  it("prepends the current keys ahead of existing history", () => {
    const result = retain_previous_ratchet_keys(
      vault_with("v3", [key_set("v2"), key_set("v1")]),
    );

    expect(result.map((k) => k.ratchet_identity_public)).toEqual([
      "id_pub_v3",
      "id_pub_v2",
      "id_pub_v1",
    ]);
  });

  it("keeps more than RATCHET_PREVIOUS_KEYS_LIMIT small sets", () => {
    const history = Array.from(
      { length: RATCHET_PREVIOUS_KEYS_LIMIT + 1 },
      (_, i) => key_set(`v${RATCHET_PREVIOUS_KEYS_LIMIT - i}`),
    );
    const result = retain_previous_ratchet_keys(
      vault_with(`v${RATCHET_PREVIOUS_KEYS_LIMIT + 1}`, history),
    );

    expect(result).toHaveLength(RATCHET_PREVIOUS_KEYS_LIMIT + 2);
    expect(result[0]).toEqual(key_set(`v${RATCHET_PREVIOUS_KEYS_LIMIT + 1}`));
    expect(result.at(-1)).toEqual(key_set("v0"));
  });

  it("drops the oldest sets past the byte budget but never below the floor", () => {
    const padding = "x".repeat(20 * 1024);
    const history = Array.from({ length: 60 }, (_, i) => ({
      ...key_set(`v${60 - i}`),
      ratchet_pq_identity_key: padding,
    }));
    const result = retain_previous_ratchet_keys(vault_with("v61", history));

    expect(result).toHaveLength(RATCHET_PREVIOUS_KEYS_LIMIT);
    expect(result[0]).toEqual(key_set("v61"));
    expect(result.at(-1)?.ratchet_identity_public).toBe(
      `id_pub_v${61 - RATCHET_PREVIOUS_KEYS_LIMIT + 1}`,
    );
  });

  it("returns existing history unchanged when current ratchet keys are absent", () => {
    const vault: EncryptedVault = {
      identity_key: "ik",
      signed_prekey: "sp",
      signed_prekey_private: "spp",
      recovery_codes: [],
      ratchet_previous_keys: [key_set("v1")],
    };

    expect(retain_previous_ratchet_keys(vault)).toEqual([key_set("v1")]);
  });
});

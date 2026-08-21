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
import { describe, it, expect, vi, beforeEach } from "vitest";

const compute_routing_hash = vi.fn();
const compute_alias_hash = vi.fn();
const encrypt_alias_field = vi.fn();
const rekey_user_data = vi.fn();

vi.mock("./aliases/crypto", () => ({
  compute_routing_hash: (local_part: string, domain: string) =>
    compute_routing_hash(local_part, domain),
  compute_alias_hash: (local_part: string, domain: string) =>
    compute_alias_hash(local_part, domain),
  encrypt_alias_field: (value: string) => encrypt_alias_field(value),
}));

vi.mock("@/services/api/auth", () => ({
  rekey_user_data: (payload: unknown) => rekey_user_data(payload),
}));

import {
  alias_is_restorable,
  restore_orphaned_alias,
} from "./aliases/restore";
import type { DecryptedEmailAlias } from "./aliases/types";

const orphaned_alias = (
  overrides: Partial<DecryptedEmailAlias> = {},
): DecryptedEmailAlias =>
  ({
    id: "alias-1",
    domain: "astermail.org",
    routing_address_hash: "routing-hash",
    orphaned_by_key_rotation: true,
    decryption_failed: true,
    ...overrides,
  }) as DecryptedEmailAlias;

describe("alias_is_restorable", () => {
  it("needs a routing hash from the server", () => {
    expect(alias_is_restorable(orphaned_alias())).toBe(true);
    expect(
      alias_is_restorable(orphaned_alias({ routing_address_hash: "" })),
    ).toBe(false);
    expect(
      alias_is_restorable(
        orphaned_alias({ routing_address_hash: undefined }),
      ),
    ).toBe(false);
  });
});

describe("restore_orphaned_alias", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    compute_alias_hash.mockResolvedValue("alias-hash");
    encrypt_alias_field.mockResolvedValue({
      encrypted: "ciphertext",
      nonce: "nonce",
    });
    rekey_user_data.mockResolvedValue({ data: { success: true } });
  });

  it("re-encrypts the label when the address matches", async () => {
    compute_routing_hash.mockResolvedValue("routing-hash");

    const outcome = await restore_orphaned_alias(orphaned_alias(), " SpamMe ");

    expect(outcome).toEqual({ status: "restored" });
    expect(compute_routing_hash).toHaveBeenCalledWith(
      "spamme",
      "astermail.org",
    );
    expect(rekey_user_data).toHaveBeenCalledWith({
      re_encrypted_aliases: [
        {
          id: "alias-1",
          encrypted_local_part: "ciphertext",
          local_part_nonce: "nonce",
          alias_address_hash: "alias-hash",
        },
      ],
    });
  });

  it("rejects an address that does not match", async () => {
    compute_routing_hash.mockResolvedValue("other-hash");

    const outcome = await restore_orphaned_alias(orphaned_alias(), "notmine");

    expect(outcome).toEqual({ status: "address_mismatch" });
    expect(rekey_user_data).not.toHaveBeenCalled();
  });

  it("rejects a blank address without calling the server", async () => {
    const outcome = await restore_orphaned_alias(orphaned_alias(), "   ");

    expect(outcome).toEqual({ status: "address_mismatch" });
    expect(compute_routing_hash).not.toHaveBeenCalled();
    expect(rekey_user_data).not.toHaveBeenCalled();
  });

  it("reports aliases the server cannot verify", async () => {
    const outcome = await restore_orphaned_alias(
      orphaned_alias({ routing_address_hash: undefined }),
      "spamme",
    );

    expect(outcome).toEqual({ status: "unverifiable" });
    expect(rekey_user_data).not.toHaveBeenCalled();
  });

  it("surfaces a failed rekey", async () => {
    compute_routing_hash.mockResolvedValue("routing-hash");
    rekey_user_data.mockResolvedValue({ error: "network down" });

    const outcome = await restore_orphaned_alias(orphaned_alias(), "spamme");

    expect(outcome).toEqual({ status: "failed", message: "network down" });
  });
});
